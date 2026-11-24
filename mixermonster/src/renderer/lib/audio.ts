import { clicksBetween, type AccompNote, type AccompPart } from '@baixaria/music-theory';
import { getAudioContext, playAccompNotes, createCabinetStage, type CabinetId } from '@baixaria/audio-synth';

/**
 * Camada de áudio do player (multipista, acompanhamento e metrônomo alinhados à música).
 * O relógio musical (AudioContext) vem de @baixaria/audio-synth; reexportado para os consumidores atuais.
 */
export { decodeAudio, getAudioContext, CABINETS, type CabinetId } from '@baixaria/audio-synth';

export interface AlignedHandle {
  setGain(index: number, gain: number): void;
  /** −1 (esquerda) … 0 (centro) … +1 (direita). */
  setPan(index: number, pan: number): void;
  setCabinet?(index: number, id: CabinetId): Promise<void>;
  stop(): void;
}

/** Volume geral (0 … 1): todo o áudio do player passa por ele (faixas e metrônomo). */
let masterLevel = 1;
let masterNode: GainNode | null = null;

/** Saída geral, criada no primeiro uso (dentro de um gesto do usuário, como o contexto). */
function masterOut(): AudioNode {
  if (!masterNode) {
    const ctx = getAudioContext();
    masterNode = ctx.createGain();
    masterNode.gain.value = masterLevel;
    masterNode.connect(ctx.destination);
  }
  return masterNode;
}

/** Ajusta o volume geral ao vivo. Antes do primeiro uso só guarda o valor. */
export function setMasterGain(level: number): void {
  masterLevel = Math.max(0, Math.min(1, level));
  // masterNode só existe depois que o contexto foi criado (masterOut), então o relógio é o dele.
  if (masterNode) masterNode.gain.setTargetAtTime(masterLevel, masterNode.context.currentTime, 0.02);
}

/** Toca vários buffers no mesmo instante do relógio do motor, com ganho, pan e gabinete IR ajustáveis por faixa. */
export function playAligned(
  items: ReadonlyArray<{ buffer: AudioBuffer; gain: number; pan?: number; offset?: number; cabinet?: CabinetId }>,
  startTime?: number,
): AlignedHandle {
  const ctx = getAudioContext();
  const startAt = startTime ?? ctx.currentTime + 0.05;
  const nodes = items.map(({ buffer, gain, pan = 0, offset = 0, cabinet = 'direct' }) => {
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    const p = ctx.createStereoPanner();
    const cab = createCabinetStage(ctx, cabinet);
    g.gain.value = gain;
    p.pan.value = pan;
    src.buffer = buffer;
    src.connect(g).connect(p).connect(cab.input);
    cab.output.connect(masterOut());
    src.start(startAt, Math.min(offset, buffer.duration));
    return { src, g, p, cab };
  });
  return {
    setGain(index, gain) {
      const node = nodes[index];
      if (node) node.g.gain.setTargetAtTime(gain, ctx.currentTime, 0.01);
    },
    setPan(index, pan) {
      const node = nodes[index];
      if (node) node.p.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), ctx.currentTime, 0.01);
    },
    async setCabinet(index, id) {
      const node = nodes[index];
      if (node) await node.cab.setCabinet(id);
    },
    stop() {
      for (const { src, g, p, cab } of nodes) {
        try {
          src.stop();
        } catch {
          /* já encerrado */
        }
        src.disconnect();
        g.disconnect();
        p.disconnect();
        cab.input.disconnect();
        cab.output.disconnect();
      }
    },
  };
}

export interface AccompHandle {
  /** Volume do acompanhamento inteiro (0 = mudo). */
  setGain(gain: number): void;
  stop(): void;
}

/**
 * Acompanhamento tocado a partir da harmonia, no mesmo relógio das faixas e do metrônomo.
 * Agenda as notas com antecedência (janela de 0,3 s, renovada a cada 60 ms). `notesBetween` é
 * consultado a cada janela: ligar ou trocar um instrumento no meio da música entra em seguida.
 */
export function startAccompaniment(
  notesBetween: (from: number, to: number) => AccompNote[],
  startAtCtx: number,
  fromSongSec: number,
  gain: number,
  rate = 1,
): AccompHandle {
  const ctx = getAudioContext();
  const out = ctx.createGain();
  out.gain.value = gain;
  out.connect(masterOut());
  const parts: Record<AccompPart, AudioNode> = { bass: out, piano: out, guitar: out };
  const LOOKAHEAD = 0.3;
  let scheduledUntil = fromSongSec;
  // Velocidade do player: um segundo da música dura 1/rate segundos de relógio.
  const toCtx = (songSec: number) => startAtCtx + (songSec - fromSongSec) / rate;
  const sources = new Set<AudioScheduledSourceNode>();
  const pump = () => {
    const nowSong = fromSongSec + (ctx.currentTime - startAtCtx) * rate;
    const target = nowSong + LOOKAHEAD * rate;
    if (target > scheduledUntil) {
      const notes = notesBetween(scheduledUntil, target).map((n) => (rate === 1 ? n : { ...n, dur: n.dur / rate }));
      for (const s of playAccompNotes(ctx, parts, notes, toCtx, ctx.currentTime)) {
        sources.add(s);
        s.addEventListener('ended', () => sources.delete(s));
      }
      scheduledUntil = target;
    }
  };
  pump();
  const timer = window.setInterval(pump, 60);
  return {
    setGain(g) {
      out.gain.setTargetAtTime(g, ctx.currentTime, 0.02);
    },
    stop() {
      window.clearInterval(timer);
      for (const s of [...sources]) {
        try {
          s.stop();
        } catch {
          /* já encerrado */
        }
      }
      sources.clear();
      out.disconnect();
    },
  };
}

export interface MetronomeHandle {
  setGain(gain: number): void;
  stop(): void;
}

/**
 * Metrônomo alinhado aos tempos detectados da música. Agenda os cliques com antecedência
 * (janela de 0,2 s, renovada a cada 50 ms) no relógio do motor: não atrasa com a tela.
 * `songAt(ctxTime)` converte o relógio do motor em posição na música.
 */
export function startMetronome(
  beats: readonly number[],
  firstDownbeat: number,
  startAtCtx: number,
  fromSongSec: number,
  gain: number,
  rate = 1,
): MetronomeHandle {
  const ctx = getAudioContext();
  const out = ctx.createGain();
  out.gain.value = gain;
  out.connect(masterOut());
  const LOOKAHEAD = 0.2;
  let scheduledUntil = fromSongSec;
  const toCtx = (songSec: number) => startAtCtx + (songSec - fromSongSec) / rate;
  const sources: OscillatorNode[] = [];

  const click = (at: number, accent: boolean) => {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.frequency.value = accent ? 1760 : 1175;
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(accent ? 0.9 : 0.55, at + 0.002);
    env.gain.exponentialRampToValueAtTime(0.001, at + 0.06);
    osc.connect(env).connect(out);
    osc.start(at);
    osc.stop(at + 0.07);
    sources.push(osc);
    osc.onended = () => {
      const i = sources.indexOf(osc);
      if (i >= 0) sources.splice(i, 1);
      env.disconnect();
    };
  };

  const pump = () => {
    const nowSong = fromSongSec + (ctx.currentTime - startAtCtx) * rate;
    const target = nowSong + LOOKAHEAD * rate;
    if (target > scheduledUntil) {
      for (const c of clicksBetween(beats, firstDownbeat, scheduledUntil, target)) {
        const at = toCtx(c.t);
        if (at >= ctx.currentTime) click(at, c.accent);
      }
      scheduledUntil = target;
    }
  };
  pump();
  const timer = window.setInterval(pump, 50);

  return {
    setGain(g) {
      out.gain.setTargetAtTime(g, ctx.currentTime, 0.01);
    },
    stop() {
      window.clearInterval(timer);
      for (const s of [...sources]) {
        try {
          s.stop();
        } catch {
          /* já encerrado */
        }
      }
      out.disconnect();
    },
  };
}
