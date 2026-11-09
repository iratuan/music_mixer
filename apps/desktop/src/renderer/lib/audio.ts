import { clicksBetween } from '@domain';

/**
 * Camada de áudio do renderer. O relógio musical é o AudioContext (monotônico),
 * nunca Date.now() nem requestAnimationFrame.
 */

let context: AudioContext | null = null;

/** Criado dentro de um gesto do usuário (clique), para não ficar suspenso. */
export function getAudioContext(): AudioContext {
  if (!context) {
    // Testes automatizados (?audio=none): relógio sem dispositivo de saída, determinístico.
    const silent = new URLSearchParams(window.location.search).get('audio') === 'none';
    const options = silent ? ({ latencyHint: 'interactive', sinkId: { type: 'none' } } as AudioContextOptions) : { latencyHint: 'interactive' as const };
    context = new AudioContext(options);
  }
  return context;
}

export async function decodeAudio(bytes: Uint8Array): Promise<AudioBuffer> {
  const copy = bytes.slice().buffer; // decodeAudioData desanexa o buffer
  return getAudioContext().decodeAudioData(copy);
}

export interface AlignedHandle {
  setGain(index: number, gain: number): void;
  /** −1 (esquerda) … 0 (centro) … +1 (direita). */
  setPan(index: number, pan: number): void;
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
  if (masterNode && context) masterNode.gain.setTargetAtTime(masterLevel, context.currentTime, 0.02);
}

/** Toca vários buffers no mesmo instante do relógio do motor, com ganho e pan ajustáveis por faixa. */
export function playAligned(items: ReadonlyArray<{ buffer: AudioBuffer; gain: number; pan?: number; offset?: number }>, startTime?: number): AlignedHandle {
  const ctx = getAudioContext();
  const startAt = startTime ?? ctx.currentTime + 0.05;
  const nodes = items.map(({ buffer, gain, pan = 0, offset = 0 }) => {
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    const p = ctx.createStereoPanner();
    g.gain.value = gain;
    p.pan.value = pan;
    src.buffer = buffer;
    src.connect(g).connect(p).connect(masterOut());
    src.start(startAt, Math.min(offset, buffer.duration));
    return { src, g, p };
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
    stop() {
      for (const { src, g, p } of nodes) {
        try {
          src.stop();
        } catch {
          /* já encerrado */
        }
        src.disconnect();
        g.disconnect();
        p.disconnect();
      }
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
): MetronomeHandle {
  const ctx = getAudioContext();
  const out = ctx.createGain();
  out.gain.value = gain;
  out.connect(masterOut());
  const LOOKAHEAD = 0.2;
  let scheduledUntil = fromSongSec;
  const toCtx = (songSec: number) => startAtCtx + (songSec - fromSongSec);
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
    const nowSong = fromSongSec + (ctx.currentTime - startAtCtx);
    const until = Math.max(scheduledUntil, nowSong) + LOOKAHEAD;
    for (const c of clicksBetween(beats, firstDownbeat, scheduledUntil, until)) {
      const at = toCtx(c.t);
      if (at >= ctx.currentTime) click(at, c.accent);
    }
    scheduledUntil = until;
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
