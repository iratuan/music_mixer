import { NoteJudge, yinPitch, type Verdict } from '@domain';
import { getAudioContext } from '@baixaria/audio-synth';

/**
 * Entrada dos exercícios: instrumento (UM2 ou microfone) com o juiz de notas, e Web MIDI.
 * A síntese (pluck, clique, barramento) foi para @baixaria/audio-synth na Etapa E3 e é
 * reexportada aqui para os consumidores atuais.
 */
export {
  BASS_TIMBRES,
  TIMBRES_OF,
  clickAt,
  driveCurve,
  driveStage,
  masterBus,
  pluckAt,
  setBassTimbre,
  type BassTimbre,
  CABINETS,
  cabinetBus,
  createCabinetStage,
  getCabinetBuffer,
  getGlobalCabinet,
  setGlobalCabinet,
  type CabinetDefinition,
  type CabinetId,
} from '@baixaria/audio-synth';

/** Interfaces USB comuns de instrumento (Behringer UM2 aparece como "USB Audio CODEC"). */
export const INSTRUMENT_INPUT = /USB Audio CODEC|UM2|Behringer|Focusrite|Scarlett|iRig/i;

export async function listInputs(): Promise<MediaDeviceInfo[]> {
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.filter((d) => d.kind === 'audioinput');
}

export interface InputEngine {
  /** Registra a nota esperada até `deadline` (relógio do motor). */
  expect(id: number, midi: number, deadline: number): void;
  /** Nível atual (0–1) para o medidor. */
  level(): number;
  stop(): void;
}

/**
 * Abre a entrada sem processamento (eco, ruído e ganho automático distorcem a altura),
 * calibra o ruído de fundo por 0,8 s e julga cada nota com YIN + NoteJudge.
 * `latencySec` desloca o relógio (o som tocado chega atrasado à entrada).
 */
export async function startInput(deviceId: string | null, onResult: (r: { id: number; verdict: Verdict; cents?: number }) => void, latencySec = 0.03, range: { fmin: number; fmax: number; tolerance?: number } = { fmin: 28, fmax: 450 }): Promise<InputEngine> {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') await ctx.resume();
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0;
  source.connect(analyser); // sem ligar ao destino: não realimenta
  const buf = new Float32Array(analyser.fftSize);
  const judge = new NoteJudge<number>(range.tolerance);
  let noise = 0.01;
  let calib: number[] | null = [];
  const calibUntil = ctx.currentTime + 0.8;
  let lastRms = 0;
  let raf = 0;
  const loop = () => {
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i]! * buf[i]!;
    const rms = Math.sqrt(sum / buf.length);
    lastRms = rms;
    if (calib) {
      calib.push(rms);
      if (ctx.currentTime >= calibUntil) {
        noise = Math.max(0.004, Math.max(...calib) * 1.5);
        calib = null;
      }
    } else {
      const est = rms > noise ? yinPitch(buf, ctx.sampleRate, range.fmin, range.fmax) : null;
      const r = judge.feed(est && est.clarity > 0.75 ? est.hz : -1, ctx.currentTime - latencySec, rms, noise);
      if (r) onResult(r);
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return {
    expect: (id, midi, deadline) => {
      const dropped = judge.expect(id, midi, deadline);
      if (dropped) onResult(dropped);
    },
    level: () => Math.min(1, lastRms * 4),
    stop() {
      cancelAnimationFrame(raf);
      judge.clear();
      stream.getTracks().forEach((t) => t.stop());
      source.disconnect();
    },
  };
}

export interface MidiInput {
  /** Notas que estão sendo seguradas agora. */
  held: Set<number>;
  /** Nomes dos instrumentos conectados. */
  names: string[];
  stop(): void;
}

/**
 * Instrumento MIDI (Web MIDI, sem SysEx): avisa cada nota tocada (noteOn) e guarda as que estão
 * seguradas até o noteOff (para as caudas das notas longas).
 */
export async function openMidi(onNote: (midi: number) => void): Promise<MidiInput> {
  if (!navigator.requestMIDIAccess) throw new Error('este computador não oferece entrada MIDI');
  const access = await navigator.requestMIDIAccess({ sysex: false });
  const held = new Set<number>();
  const inputs = [...access.inputs.values()];
  if (!inputs.length) throw new Error('nenhum instrumento MIDI conectado');
  const handler = (e: MIDIMessageEvent) => {
    const d = e.data;
    if (!d || d.length < 3) return;
    const kind = d[0]! & 0xf0;
    const note = d[1]!;
    if (kind === 0x90 && d[2]! > 0) {
      held.add(note);
      onNote(note);
    } else if (kind === 0x80 || (kind === 0x90 && d[2] === 0)) held.delete(note);
  };
  for (const i of inputs) i.addEventListener('midimessage', handler as EventListener);
  return {
    held,
    names: inputs.map((i) => i.name ?? 'MIDI'),
    stop() {
      for (const i of inputs) i.removeEventListener('midimessage', handler as EventListener);
      held.clear();
    },
  };
}
