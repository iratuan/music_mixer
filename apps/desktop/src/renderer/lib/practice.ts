import { NoteJudge, midiToHz, yinPitch, type Verdict } from '@domain';
import { getAudioContext } from './audio.js';

/**
 * Áudio dos exercícios: síntese "pluck" (portada do ScaleMonster, agendada no relógio do motor),
 * clique do metrônomo e entrada do instrumento (UM2 ou microfone) com o juiz de notas.
 */

/** Corda vibrando: dente de serra, passa-baixa que acompanha a altura, decaimento longo. */
export function pluckAt(at: number, midi: number, volume: number, out: AudioNode): void {
  if (volume <= 0) return;
  const ctx = getAudioContext();
  const hz = midiToHz(midi);
  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(hz, at);
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(Math.min(2500, hz * 6 + 300), at);
  filter.Q.value = 0.7;
  osc.connect(filter).connect(gain).connect(out);
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(volume, at + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.001, at + 1.6);
  osc.start(at);
  osc.stop(at + 1.65);
}

export function clickAt(at: number, accent: boolean, volume: number, out: AudioNode): void {
  if (volume <= 0) return;
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.frequency.value = accent ? 1760 : 1175;
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(accent ? 0.8 : 0.45, at + 0.002);
  env.gain.exponentialRampToValueAtTime(0.001, at + 0.06);
  osc.connect(env).connect(out);
  osc.start(at);
  osc.stop(at + 0.07);
}

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
export async function startInput(deviceId: string | null, onResult: (r: { id: number; verdict: Verdict }) => void, latencySec = 0.03): Promise<InputEngine> {
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
  const judge = new NoteJudge<number>();
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
      const est = rms > noise ? yinPitch(buf, ctx.sampleRate, 28, 450) : null;
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
