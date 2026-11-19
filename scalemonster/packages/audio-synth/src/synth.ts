import { midiHz as midiToHz, type AccompNote, type AccompPart } from '@baixaria/music-theory';

/**
 * Vozes sintetizadas do acompanhamento (baixo, piano e violão). Funcionam tanto no player
 * (AudioContext) quanto na exportação (OfflineAudioContext): recebem o contexto e a saída.
 * Sons simples e leves de propósito: servem de guia harmônico, não de instrumento virtual.
 */
interface VoiceShape {
  readonly wave: OscillatorType;
  /** Segundo oscilador (corpo ou brilho), relativo à altura. */
  readonly layer?: { readonly wave: OscillatorType; readonly ratio: number; readonly level: number };
  /** Volume de pico para intensidade 1. */
  readonly peak: number;
  /** Nível sustentado relativo ao pico, e tempo para chegar nele. */
  readonly sustain: number;
  readonly decay: number;
  readonly release: number;
  readonly cutoff: (hz: number) => number;
}

const SHAPES: Record<AccompPart, VoiceShape> = {
  bass: { wave: 'triangle', layer: { wave: 'sine', ratio: 1, level: 0.8 }, peak: 0.42, sustain: 0.55, decay: 0.25, release: 0.06, cutoff: () => 900 },
  piano: { wave: 'triangle', layer: { wave: 'sine', ratio: 2, level: 0.18 }, peak: 0.16, sustain: 0.25, decay: 0.9, release: 0.14, cutoff: (hz) => Math.min(5000, hz * 8) },
  guitar: { wave: 'sawtooth', peak: 0.075, sustain: 0.18, decay: 0.6, release: 0.08, cutoff: (hz) => Math.min(3200, hz * 5 + 400) },
};

/** Agenda uma nota no relógio do contexto (`at` em segundos do contexto). */
export function playVoice(ctx: BaseAudioContext, out: AudioNode, part: AccompPart, midi: number, at: number, dur: number, vel: number): AudioScheduledSourceNode[] {
  const shape = SHAPES[part];
  const hz = midiToHz(midi);
  const env = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = shape.cutoff(hz);
  filter.Q.value = 0.6;
  filter.connect(env).connect(out);
  const peak = shape.peak * Math.max(0.05, Math.min(1, vel));
  const end = at + Math.max(0.04, dur);
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(peak, at + 0.006);
  env.gain.setTargetAtTime(peak * shape.sustain, at + 0.006, shape.decay / 3);
  env.gain.cancelAndHoldAtTime?.(end);
  env.gain.setTargetAtTime(0, end, shape.release / 3);
  const stopAt = end + shape.release * 2;
  const oscs: OscillatorNode[] = [];
  const main = ctx.createOscillator();
  main.type = shape.wave;
  main.frequency.value = hz;
  main.connect(filter);
  oscs.push(main);
  if (shape.layer) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = shape.layer.wave;
    o.frequency.value = hz * shape.layer.ratio;
    g.gain.value = shape.layer.level;
    o.connect(g).connect(filter);
    oscs.push(o);
  }
  for (const o of oscs) {
    o.start(at);
    o.stop(stopAt);
  }
  main.onended = () => {
    filter.disconnect();
    env.disconnect();
  };
  return oscs;
}

/** Agenda várias notas do acompanhamento, convertendo o tempo da música no relógio do contexto. */
export function playAccompNotes(ctx: BaseAudioContext, outs: Readonly<Record<AccompPart, AudioNode>>, notes: readonly AccompNote[], toCtx: (songSec: number) => number, minAt = 0): AudioScheduledSourceNode[] {
  const started: AudioScheduledSourceNode[] = [];
  for (const n of notes) {
    const at = toCtx(n.t);
    if (at < minAt) continue;
    started.push(...playVoice(ctx, outs[n.part], n.part, n.midi, at, n.dur, n.vel));
  }
  return started;
}
