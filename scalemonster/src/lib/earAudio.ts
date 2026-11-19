import type { EarEvent, EarTimbre } from '@domain';
import { getAudioContext } from '@baixaria/audio-synth';
import { clickAt, masterBus, pluckAt, setBassTimbre } from './practice.js';
import { playMidis, stopAll, type Timbre } from '@baixaria/audio-synth';

const VOICE: Record<Exclude<EarTimbre, 'bass'>, Timbre> = { piano: 'piano', rhodes: 'rhodes', guitar: 'guitar' };

export interface PlayHandle {
  /** Duração total em segundos. */
  readonly seconds: number;
  cancel(): void;
}

/**
 * Toca os eventos com o timbre pedido (relógio único: tudo agendado no mesmo AudioContext).
 * `onNote` avisa quando cada nota começa, para acender o palco no tempo certo.
 */
export function playEvents(events: readonly EarEvent[], bpm: number, timbre: EarTimbre, onNote?: (midis: readonly number[]) => void, drone?: number): PlayHandle {
  const ctx = getAudioContext();
  void ctx.resume();
  stopAll();
  const t0 = ctx.currentTime + 0.06;
  const beat = 60 / bpm;
  const timers: number[] = [];
  let end = 0;
  const out = masterBus();
  for (const ev of events) {
    const at = t0 + ev.at * beat;
    const dur = ev.dur;
    end = Math.max(end, ev.at * beat + dur);
    if (ev.click) clickAt(at, ev.click === 'accent', 0.7, out);
    if (!ev.midis.length) continue;
    if (timbre === 'bass') {
      setBassTimbre('jazz');
      ev.midis.forEach((m, i) => pluckAt(at + i * 0.012, m >= 48 ? m - 12 : m, 0.85, out, Math.max(0.4, dur)));
    } else playMidis([...ev.midis], VOICE[timbre], at, Math.max(0.3, dur));
    if (onNote) timers.push(window.setTimeout(() => onNote(ev.midis), Math.max(0, (at - ctx.currentTime) * 1000)));
  }
  if (drone !== undefined) {
    setBassTimbre('jazz');
    for (let t = 0; t < end; t += 2.4) pluckAt(t0 + t, drone, 0.45, out, 2.6);
  }
  return {
    seconds: end + 0.1,
    cancel() {
      timers.forEach(clearTimeout);
      stopAll();
    },
  };
}

/** Toca uma única nota (resposta do usuário ao clicar no palco). */
export function playOne(midi: number, timbre: EarTimbre): void {
  playEvents([{ at: 0, midis: [midi], dur: 0.8 }], 60, timbre);
}
