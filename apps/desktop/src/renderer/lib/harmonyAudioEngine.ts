import { chordMidis, midiHz, type Chord } from '@domain';
import { getAudioContext } from './audio.js';
import { driveStage, masterBus, pluckAt } from './practice.js';

/**
 * Motor de áudio da harmonia (ciclo das quintas e mapa harmônico): acordes polifônicos com
 * envelope suave (sem estalos), agendados no relógio do AudioContext. Timbres simples de osciladores:
 * piano elétrico, violão/guitarra limpa e pad.
 */
export type Timbre = 'epiano' | 'guitar' | 'pad' | 'rhodes' | 'piano' | 'strat' | 'wurli' | 'organ' | 'vibes' | 'nylon' | 'strings' | 'synth' | 'crunch' | 'dist' | 'lead';
export type TimbreGroup = 'Teclas' | 'Cordas dedilhadas' | 'Guitarras distorcidas' | 'Pads e cordas';
export const TIMBRE_GROUPS: readonly TimbreGroup[] = ['Teclas', 'Cordas dedilhadas', 'Guitarras distorcidas', 'Pads e cordas'];
export const TIMBRES: ReadonlyArray<{ readonly id: Timbre; readonly label: string; readonly group: TimbreGroup }> = [
  { id: 'piano', label: 'Piano de cauda', group: 'Teclas' },
  { id: 'rhodes', label: 'Rhodes Mark I', group: 'Teclas' },
  { id: 'wurli', label: 'Wurlitzer', group: 'Teclas' },
  { id: 'organ', label: 'Órgão (drawbars)', group: 'Teclas' },
  { id: 'vibes', label: 'Vibrafone', group: 'Teclas' },
  { id: 'epiano', label: 'Piano elétrico simples', group: 'Teclas' },
  { id: 'strat', label: 'Stratocaster limpa (pos. 4)', group: 'Cordas dedilhadas' },
  { id: 'guitar', label: 'Violão de aço', group: 'Cordas dedilhadas' },
  { id: 'nylon', label: 'Violão de nylon', group: 'Cordas dedilhadas' },
  { id: 'crunch', label: 'Crunch valvulado', group: 'Guitarras distorcidas' },
  { id: 'dist', label: 'Distorção (power chords)', group: 'Guitarras distorcidas' },
  { id: 'lead', label: 'Solo com drive e sustain', group: 'Guitarras distorcidas' },
  { id: 'strings', label: 'Naipe de cordas', group: 'Pads e cordas' },
  { id: 'pad', label: 'Pad quente', group: 'Pads e cordas' },
  { id: 'synth', label: 'Synth pad (anos 80)', group: 'Pads e cordas' },
];

/** Levada do acompanhamento: em que pontos de cada compasso de 4 tempos o acorde soa ([início, duração] em tempos). */
export type Rhythm = 'block' | 'pop' | 'ballad' | 'bossa' | 'reggae' | 'funk' | 'waltz';
export const RHYTHMS: ReadonlyArray<{ readonly id: Rhythm; readonly label: string; readonly hits: ReadonlyArray<readonly [number, number]> }> = [
  { id: 'block', label: 'Acorde inteiro', hits: [[0, 4]] },
  { id: 'ballad', label: 'Balada (1 e 3)', hits: [[0, 2], [2, 2]] },
  { id: 'pop', label: 'Pop (colcheias)', hits: [[0, 0.9], [1, 0.45], [1.5, 0.9], [2.5, 0.45], [3, 0.9]] },
  { id: 'bossa', label: 'Bossa nova', hits: [[0, 1.4], [1.5, 1], [3, 0.9], [3.5, 0.45]] },
  { id: 'reggae', label: 'Reggae (contratempo)', hits: [[0.5, 0.3], [1.5, 0.3], [2.5, 0.3], [3.5, 0.3]] },
  { id: 'funk', label: 'Funk (semicolcheias)', hits: [[0, 0.2], [0.75, 0.2], [1.5, 0.2], [2, 0.2], [2.75, 0.2], [3.25, 0.2]] },
  { id: 'waltz', label: 'Valsa (1 – 2 3)', hits: [[0, 1], [1, 0.7], [2, 0.7], [3, 0.7]] },
];

/** Bateria simples (bumbo, caixa e chimbal) sintetizada, para acompanhar a progressão. */
function drumHit(kind: 'kick' | 'snare' | 'hat', at: number, out: AudioNode, level = 1): void {
  const ctx = getAudioContext();
  const g = ctx.createGain();
  g.connect(out);
  if (kind === 'kick') {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(140, at);
    o.frequency.exponentialRampToValueAtTime(45, at + 0.12);
    g.gain.setValueAtTime(0.9 * level, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.3);
    o.connect(g);
    o.start(at);
    o.stop(at + 0.32);
    return;
  }
  const len = Math.floor(ctx.sampleRate * (kind === 'snare' ? 0.18 : 0.05));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = kind === 'snare' ? 'bandpass' : 'highpass';
  f.frequency.value = kind === 'snare' ? 1800 : 7000;
  g.gain.setValueAtTime((kind === 'snare' ? 0.45 : 0.16) * level, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + (kind === 'snare' ? 0.17 : 0.045));
  src.connect(f).connect(g);
  src.start(at);
  if (kind === 'snare') {
    const body = ctx.createOscillator();
    body.frequency.value = 190;
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0.3 * level, at);
    bg.gain.exponentialRampToValueAtTime(0.001, at + 0.1);
    body.connect(bg).connect(out);
    body.start(at);
    body.stop(at + 0.12);
  }
}

/** Ouve um trecho curto do timbre (acorde de Dó maior com sétima). */
export function previewTimbre(t: Timbre): void {
  playMidis([48, 52, 55, 59, 64], t, undefined, 1.4);
}

interface Voice {
  readonly attack: number;
  readonly decay: number;
  readonly sustain: number;
  readonly release: number;
  readonly layers: ReadonlyArray<{ readonly type: OscillatorType; readonly ratio: number; readonly gain: number; readonly detune?: number }>;
  readonly cutoff: (hz: number) => number;
  readonly strum: number;
  readonly level: number;
  /** Distorção (0 = limpo) e só fundamental + quinta + oitava (power chord). */
  readonly drive?: number;
  readonly power?: boolean;
}

const VOICES: Record<Timbre, Voice> = {
  crunch: {
    attack: 0.004,
    decay: 1.2,
    sustain: 0.45,
    release: 0.15,
    layers: [
      { type: 'sawtooth', ratio: 1, gain: 0.6 },
      { type: 'square', ratio: 1, gain: 0.2, detune: 6 },
    ],
    cutoff: (hz) => Math.min(3500, hz * 6 + 800),
    strum: 0.012,
    level: 0.1,
    drive: 7,
  },
  dist: {
    attack: 0.003,
    decay: 1.6,
    sustain: 0.6,
    release: 0.12,
    layers: [
      { type: 'sawtooth', ratio: 1, gain: 0.6, detune: -5 },
      { type: 'sawtooth', ratio: 1, gain: 0.6, detune: 5 },
    ],
    cutoff: (hz) => Math.min(4000, hz * 8 + 800),
    strum: 0.008,
    level: 0.09,
    drive: 24,
    power: true,
  },
  lead: {
    attack: 0.01,
    decay: 2,
    sustain: 0.75,
    release: 0.3,
    layers: [
      { type: 'sawtooth', ratio: 1, gain: 0.7 },
      { type: 'sine', ratio: 2, gain: 0.2, detune: 7 },
    ],
    cutoff: (hz) => Math.min(4500, hz * 7 + 1000),
    strum: 0.02,
    level: 0.075,
    drive: 16,
  },
  wurli: {
    attack: 0.004,
    decay: 0.7,
    sustain: 0.25,
    release: 0.25,
    layers: [
      { type: 'triangle', ratio: 1, gain: 0.9 },
      { type: 'square', ratio: 1, gain: 0.12 },
      { type: 'sine', ratio: 3, gain: 0.08 },
    ],
    cutoff: (hz) => Math.min(3800, hz * 6 + 400),
    strum: 0.003,
    level: 0.13,
  },
  organ: {
    attack: 0.012,
    decay: 0.2,
    sustain: 0.95,
    release: 0.08,
    layers: [
      { type: 'sine', ratio: 0.5, gain: 0.6 },
      { type: 'sine', ratio: 1, gain: 0.8 },
      { type: 'sine', ratio: 2, gain: 0.5 },
      { type: 'sine', ratio: 3, gain: 0.25 },
      { type: 'sine', ratio: 4, gain: 0.15, detune: 3 },
    ],
    cutoff: () => 5000,
    strum: 0,
    level: 0.075,
  },
  vibes: {
    attack: 0.002,
    decay: 1.8,
    sustain: 0.05,
    release: 0.8,
    layers: [
      { type: 'sine', ratio: 1, gain: 1 },
      { type: 'sine', ratio: 4, gain: 0.25 },
      { type: 'sine', ratio: 10, gain: 0.04 },
    ],
    cutoff: () => 9000,
    strum: 0.006,
    level: 0.13,
  },
  nylon: {
    attack: 0.003,
    decay: 0.9,
    sustain: 0.1,
    release: 0.2,
    layers: [
      { type: 'triangle', ratio: 1, gain: 0.9 },
      { type: 'sine', ratio: 2, gain: 0.25 },
      { type: 'sawtooth', ratio: 1, gain: 0.08 },
    ],
    cutoff: (hz) => Math.min(2600, hz * 4 + 400),
    strum: 0.022,
    level: 0.14,
  },
  strings: {
    attack: 0.35,
    decay: 0.6,
    sustain: 0.85,
    release: 0.7,
    layers: [
      { type: 'sawtooth', ratio: 1, gain: 0.35, detune: -9 },
      { type: 'sawtooth', ratio: 1, gain: 0.35, detune: 9 },
      { type: 'sawtooth', ratio: 2, gain: 0.12, detune: 4 },
    ],
    cutoff: (hz) => Math.min(3200, hz * 5 + 500),
    strum: 0,
    level: 0.07,
  },
  synth: {
    attack: 0.15,
    decay: 0.5,
    sustain: 0.7,
    release: 0.5,
    layers: [
      { type: 'square', ratio: 1, gain: 0.3, detune: -12 },
      { type: 'square', ratio: 1, gain: 0.3, detune: 12 },
      { type: 'sawtooth', ratio: 0.5, gain: 0.25 },
    ],
    cutoff: () => 1900,
    strum: 0,
    level: 0.06,
  },
  rhodes: {
    attack: 0.004,
    decay: 1.1,
    sustain: 0.3,
    release: 0.35,
    layers: [
      { type: 'sine', ratio: 1, gain: 1 },
      { type: 'sine', ratio: 2, gain: 0.3, detune: 2 },
      { type: 'sine', ratio: 7.1, gain: 0.07 }, // "tine": o sino do ataque
    ],
    cutoff: (hz) => Math.min(5000, hz * 8 + 300),
    strum: 0.004,
    level: 0.15,
  },
  piano: {
    attack: 0.003,
    decay: 1.6,
    sustain: 0.12,
    release: 0.3,
    layers: [
      { type: 'triangle', ratio: 1, gain: 0.9 },
      { type: 'sine', ratio: 2, gain: 0.35 },
      { type: 'sine', ratio: 3, gain: 0.15, detune: 3 },
      { type: 'sine', ratio: 1, gain: 0.3, detune: -4 },
    ],
    cutoff: (hz) => Math.min(8000, hz * 9 + 600),
    strum: 0.006,
    level: 0.14,
  },
  strat: {
    attack: 0.003,
    decay: 0.9,
    sustain: 0.22,
    release: 0.2,
    layers: [
      { type: 'sawtooth', ratio: 1, gain: 0.45 },
      { type: 'square', ratio: 1, gain: 0.18, detune: 5 },
      { type: 'sine', ratio: 2, gain: 0.25 },
    ],
    cutoff: (hz) => Math.min(4200, hz * 5 + 900),
    strum: 0.014,
    level: 0.1,
  },

  epiano: {
    attack: 0.006,
    decay: 0.6,
    sustain: 0.35,
    release: 0.25,
    layers: [
      { type: 'sine', ratio: 1, gain: 1 },
      { type: 'sine', ratio: 2, gain: 0.25 },
      { type: 'triangle', ratio: 4, gain: 0.05 },
    ],
    cutoff: (hz) => Math.min(6000, hz * 10),
    strum: 0,
    level: 0.16,
  },
  guitar: {
    attack: 0.004,
    decay: 0.8,
    sustain: 0.2,
    release: 0.18,
    layers: [
      { type: 'sawtooth', ratio: 1, gain: 0.6 },
      { type: 'triangle', ratio: 1, gain: 0.6, detune: 4 },
    ],
    cutoff: (hz) => Math.min(3600, hz * 6 + 500),
    strum: 0.018,
    level: 0.11,
  },
  pad: {
    attack: 0.25,
    decay: 0.5,
    sustain: 0.8,
    release: 0.6,
    layers: [
      { type: 'sawtooth', ratio: 1, gain: 0.4, detune: -7 },
      { type: 'sawtooth', ratio: 1, gain: 0.4, detune: 7 },
      { type: 'sine', ratio: 0.5, gain: 0.5 },
    ],
    cutoff: () => 1400,
    strum: 0,
    level: 0.08,
  },
};

let master: GainNode | null = null;
const live = new Set<{ stop(at?: number): void }>();

function out(): GainNode {
  const ctx = getAudioContext();
  if (!master) {
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(masterBus());
  }
  return master;
}

/** Como os acordes soam: todas as notas juntas ou em arpejo (uma depois da outra, subindo). */
export type PlayStyle = 'chord' | 'arpeggio';
let playStyle: PlayStyle = 'chord';
export function setPlayStyle(s: PlayStyle): void {
  playStyle = s;
}

/** Toca um acorde em `at` (relógio do contexto) por `dur` segundos (junto ou em arpejo). */
export function playChord(chord: Chord, timbre: Timbre = 'epiano', at?: number, dur = 1.2): void {
  const midis = chordMidis(chord);
  if (playStyle === 'chord' || midis.length < 2) {
    playMidis(midis, timbre, at, dur);
    return;
  }
  const t0 = at ?? getAudioContext().currentTime + 0.02;
  // Arpejo: sobe pelas notas e volta à fundamental uma oitava acima, preenchendo a duração.
  const seq = [...[...midis].sort((a, b) => a - b), Math.min(...midis) + 12];
  const step = Math.max(0.12, Math.min(0.35, dur / seq.length));
  const count = Math.max(seq.length, Math.floor(dur / step));
  for (let k = 0; k < count; k++) {
    const start = t0 + k * step;
    if (start >= t0 + dur - 0.05) break;
    playMidis([seq[k % seq.length]!], timbre, start, Math.max(step * 1.6, t0 + dur - start));
  }
}

/** Toca notas MIDI juntas (com o dedilhado do timbre). */
export function playMidis(midis: readonly number[], timbre: Timbre = 'epiano', at?: number, dur = 1.2): void {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  const v = VOICES[timbre];
  const t0 = at ?? ctx.currentTime + 0.02;
  // Power chord: só tônica, quinta e oitava (a distorção embola a terça).
  const notes = v.power && midis.length >= 2 ? [midis[0]!, midis[0]! + 7, midis[0]! + 12] : midis;
  notes.forEach((m, k) => {
    const start = t0 + k * v.strum;
    const end = t0 + dur;
    const hz = midiHz(m);
    const env = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = v.cutoff(hz);
    if (v.drive) filter.connect(driveStage(ctx, v.drive, env));
    else filter.connect(env);
    env.connect(out());
    const peak = v.level * (k === 0 ? 0.9 : 1) * (0.88 + Math.random() * 0.24); // dinâmica levemente variada
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(peak, start + v.attack);
    env.gain.setTargetAtTime(peak * v.sustain, start + v.attack, v.decay / 3);
    env.gain.cancelAndHoldAtTime?.(end);
    env.gain.setTargetAtTime(0, end, v.release / 3);
    const oscs = v.layers.map((l) => {
      const o = ctx.createOscillator();
      o.type = l.type;
      o.frequency.value = hz * l.ratio;
      o.detune.value = (l.detune ?? 0) + (Math.random() - 0.5) * 5;
      const g = ctx.createGain();
      g.gain.value = l.gain;
      o.connect(g).connect(filter);
      o.start(start);
      o.stop(end + v.release * 2);
      return o;
    });
    const handle = {
      stop(when?: number) {
        const t = when ?? ctx.currentTime;
        env.gain.cancelScheduledValues(t);
        env.gain.setTargetAtTime(0, t, 0.02);
        for (const o of oscs) {
          try {
            o.stop(t + 0.1);
          } catch {
            /* já parado */
          }
        }
      },
    };
    live.add(handle);
    oscs[0]!.onended = () => {
      live.delete(handle);
      filter.disconnect();
      env.disconnect();
    };
  });
}

/** Toca as notas de uma escala, uma por tempo (subindo e descendo). */
export function playScale(midis: readonly number[], bpm: number, timbre: Timbre = 'epiano'): ProgressionHandle {
  const ctx = getAudioContext();
  const beat = 60 / bpm;
  const t0 = ctx.currentTime + 0.05;
  const seq = [...midis, ...[...midis].reverse().slice(1)];
  seq.forEach((m, k) => playMidis([m], timbre, t0 + k * beat, beat * 0.9));
  const timer = window.setTimeout(() => undefined, seq.length * beat * 1000);
  return { stop: () => (window.clearTimeout(timer), stopAll()) };
}

export interface ProgressionHandle {
  stop(): void;
}

/**
 * Toca uma progressão no relógio do motor: cada acorde dura `beats` tempos. `onStep(i)` avisa a tela
 * quando o acorde i começa a soar (para iluminar a fatia e o compasso). Com `loop`, recomeça.
 */
export function playProgression(
  steps: ReadonlyArray<{ readonly chord: Chord; readonly beats: number }>,
  bpm: number,
  opts: {
    timbre?: Timbre;
    loop?: boolean;
    onStep?: (i: number) => void;
    /** Cada tempo que começa: acorde `i`, tempo `b` dentro dele (para acender a nota do baixo). */
    onBeat?: (i: number, b: number) => void;
    onEnd?: () => void;
    /** Linha do baixo: uma altura (ou pausa) por tempo do acorde. */
    bass?: (chord: Chord, beats: number) => ReadonlyArray<number | null>;
    /** Volume dos acordes (0–1); com o baixo ligado dá para deixar só o baixo. */
    chordLevel?: number;
    /** Levada dos acordes (padrão: acorde inteiro). */
    rhythm?: Rhythm;
    /** Bateria acompanhando. */
    drums?: boolean;
  } = {},
): ProgressionHandle {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  const beat = 60 / bpm;
  let next = ctx.currentTime + 0.08;
  let i = 0;
  let stopped = false;
  const marks: Array<{ at: number; i: number }> = [];
  const beatMarks: Array<{ at: number; i: number; b: number }> = [];
  // O baixo vai num barramento próprio: ao parar, desliga tudo de uma vez.
  const bassBus = ctx.createGain();
  bassBus.gain.value = 0.9;
  bassBus.connect(masterBus());
  const pump = () => {
    if (stopped) return;
    while (next < ctx.currentTime + 0.3) {
      if (i >= steps.length) {
        if (!opts.loop) break;
        i = 0;
      }
      const s = steps[i]!;
      if ((opts.chordLevel ?? 1) > 0) {
        // A levada se repete a cada 4 tempos e é cortada no fim do acorde.
        const hits = (RHYTHMS.find((r) => r.id === (opts.rhythm ?? 'block')) ?? RHYTHMS[0]!).hits;
        for (let bar = 0; bar < s.beats; bar += 4) {
          for (const [off, len] of hits) {
            const startB = bar + off;
            if (startB >= s.beats) continue;
            const durB = Math.min(len, s.beats - startB);
            playChord(s.chord, opts.timbre ?? 'epiano', next + startB * beat, durB * beat * 0.95);
          }
        }
      }
      if (opts.drums) {
        for (let b = 0; b < Math.max(1, Math.round(s.beats)); b++) {
          const at = next + b * beat;
          const waltz = opts.rhythm === 'waltz';
          if (b % (waltz ? 3 : 2) === 0) drumHit('kick', at, bassBus, b === 0 ? 1 : 0.8);
          if (!waltz && b % 2 === 1) drumHit('snare', at, bassBus);
          drumHit('hat', at, bassBus, 0.9);
          drumHit('hat', at + beat / 2, bassBus, 0.55);
        }
      }
      if (opts.bass) {
        opts.bass(s.chord, s.beats).forEach((m, k) => {
          if (m !== null) pluckAt(next + k * beat, m, 0.5, bassBus, beat * 0.9);
        });
      }
      marks.push({ at: next, i });
      for (let b = 0; b < Math.max(1, Math.round(s.beats)); b++) beatMarks.push({ at: next + b * beat, i, b });
      next += s.beats * beat;
      i++;
    }
    while (marks.length && marks[0]!.at <= ctx.currentTime) opts.onStep?.(marks.shift()!.i);
    while (beatMarks.length && beatMarks[0]!.at <= ctx.currentTime) {
      const m = beatMarks.shift()!;
      opts.onBeat?.(m.i, m.b);
    }
    if (!opts.loop && i >= steps.length && !marks.length && ctx.currentTime >= next) {
      stopped = true;
      window.clearInterval(timer);
      opts.onEnd?.();
    }
  };
  const timer = window.setInterval(pump, 25);
  pump();
  return {
    stop() {
      stopped = true;
      window.clearInterval(timer);
      bassBus.disconnect();
      stopAll();
    },
  };
}

/** Para tudo que o motor de harmonia está tocando (botão Stop global). */
export function stopAll(): void {
  for (const h of [...live]) h.stop();
  live.clear();
}
