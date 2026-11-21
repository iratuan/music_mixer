import { pc, type Chord } from './harmony.js';
import { chordTones, voiceChords, type PianoVoicing } from './piano.js';
import { GUITAR_TUNING, guitarVoicing, type GuitarMode } from './guitar.js';
import { BASS_TUNINGS, type BassTuning, type FretPos } from '../instrument/bass.js';
import { approachNote, bassShape, fingerInZone, noOpenString, type BassRegion, type BassShape, type BassTone, type PlacedNote } from './bassline.js';

/**
 * Acompanhamento tocado a partir da HARMONIA da análise: cada instrumento escolhido toca os acordes
 * da música com uma LEVADA (padrão rítmico), alinhado aos tempos detectados (inclusive com
 * andamento variável). Compasso de 4 tempos, como a análise.
 *
 * - Baixo (prioridade): formas no braço com as regras de bassline.ts (zona confortável da mão,
 *   sem corda solta, formas clássicas). Cada nota sai com corda, casa, zona e dedo, para o painel e
 *   para a tablatura do mapa.
 * - Violão/guitarra: as formas do painel (CAGED na região escolhida, sem cordas soltas, ou as formas
 *   abertas famosas), em batida, dedilhado, tercinas, bossa ou power chord.
 * - Piano: mão esquerda (base) e direita (posição fechada com condução de vozes), em bloco, arpejo,
 *   Alberti, tercinas ou comping.
 *
 * Módulo puro: as notas da música inteira são calculadas uma vez; quem toca é a camada de áudio.
 */
export type AccompPart = 'bass' | 'piano' | 'guitar';

export type BassPattern = 'root' | 'root-fifth' | 'octave' | 'arpeggio' | 'walking' | 'triplet' | 'eighths' | 'long';
export type GuitarPattern = 'strum' | 'pop' | 'arpeggio' | 'triplet' | 'bossa' | 'power' | 'long';
export type PianoPattern = 'block' | 'arpeggio' | 'alberti' | 'triplet' | 'comping' | 'long';

export const ACCOMP_PARTS: ReadonlyArray<{ readonly id: AccompPart; readonly label: string }> = [
  { id: 'bass', label: 'Baixo' },
  { id: 'guitar', label: 'Violão / guitarra' },
  { id: 'piano', label: 'Piano' },
];

export const BASS_PATTERNS: ReadonlyArray<{ readonly id: BassPattern; readonly label: string; readonly hint: string }> = [
  { id: 'root', label: 'Fundamental em semínimas', hint: 'Uma nota por tempo na fundamental: a base de pop e rock.' },
  { id: 'root-fifth', label: 'Fundamental e quinta', hint: 'Fundamental no 1, quinta no 3: country, baião, marcha.' },
  { id: 'eighths', label: 'Colcheias (rock)', hint: 'Colcheias na fundamental, com quinta e aproximação no fim do compasso.' },
  { id: 'octave', label: 'Oitavas (disco, funk)', hint: 'Fundamental e oitava alternadas em colcheias.' },
  { id: 'arpeggio', label: 'Arpejo 1-3-5-8', hint: 'As notas do acorde em ordem; com sétima nos acordes com sétima.' },
  { id: 'walking', label: 'Walking bass', hint: 'Arpejo com nota de aproximação cromática para o próximo acorde.' },
  { id: 'triplet', label: 'Tercinas 1-5-8', hint: 'Três notas por tempo: blues lento, balada 12/8, shuffle.' },
  { id: 'long', label: 'Notas longas', hint: 'Uma nota por compasso ou troca de acorde.' },
];

export const GUITAR_PATTERNS: ReadonlyArray<{ readonly id: GuitarPattern; readonly label: string; readonly hint: string }> = [
  { id: 'pop', label: 'Batida pop', hint: 'Baixo, baixo-cima, cima, baixo-cima: a batida mais comum do violão.' },
  { id: 'strum', label: 'Batida simples', hint: 'Uma batida para baixo por tempo.' },
  { id: 'arpeggio', label: 'Dedilhado p-i-m-a', hint: 'Polegar no baixo e os dedos nas cordas agudas, em colcheias.' },
  { id: 'triplet', label: 'Dedilhado em tercinas', hint: 'Três notas por tempo: baladas em 12/8.' },
  { id: 'bossa', label: 'Bossa nova', hint: 'Polegar nos tempos 1 e 3 e o acorde sincopado.' },
  { id: 'power', label: 'Power chord (guitarra)', hint: 'Fundamental, quinta e oitava em colcheias abafadas: rock.' },
  { id: 'long', label: 'Acordes longos', hint: 'Um ataque por compasso ou troca de acorde.' },
];

export const PIANO_PATTERNS: ReadonlyArray<{ readonly id: PianoPattern; readonly label: string; readonly hint: string }> = [
  { id: 'block', label: 'Acordes em bloco', hint: 'Acorde inteiro no 1 e a mão direita no 3.' },
  { id: 'arpeggio', label: 'Arpejo em colcheias', hint: 'Base na esquerda e a direita subindo e descendo pelo acorde.' },
  { id: 'alberti', label: 'Baixo de Alberti', hint: 'Esquerda em grave-agudo-médio-agudo; direita segura o acorde.' },
  { id: 'triplet', label: 'Arpejo em tercinas', hint: 'Três notas por tempo na direita: balada.' },
  { id: 'comping', label: 'Comping sincopado', hint: 'Ataques curtos no 1, no "2 e" e no 4: pop e jazz.' },
  { id: 'long', label: 'Acordes longos', hint: 'Um acorde por compasso ou troca.' },
];

export interface AccompChord {
  /** Início do acorde na música (s). */
  readonly start: number;
  /** Acorde já no tom de destino; null = sem acorde (silêncio). */
  readonly chord: Chord | null;
}

export interface AccompNote {
  readonly part: AccompPart;
  /** Instante na música (s). */
  readonly t: number;
  readonly dur: number;
  readonly midi: number;
  /** Intensidade relativa, 0–1. */
  readonly vel: number;
  /** Baixo: corda e casa (corda 0 = a mais grave), zona da mão e dedo. */
  readonly pos?: FretPos;
  readonly zone?: number;
  readonly finger?: number;
  /** Índice do tempo (em `beats`) em que a nota cai. */
  readonly beat?: number;
}

export interface AccompOptions {
  readonly bass: { readonly pattern: BassPattern; readonly region: BassRegion; readonly tuning: BassTuning };
  readonly guitar: { readonly pattern: GuitarPattern; readonly mode: GuitarMode; readonly region: number };
  readonly piano: { readonly pattern: PianoPattern };
}

export const DEFAULT_ACCOMP_OPTIONS: AccompOptions = {
  bass: { pattern: 'root-fifth', region: 'auto', tuning: BASS_TUNINGS[0]! },
  guitar: { pattern: 'pop', mode: 'caged', region: 5 },
  piano: { pattern: 'block' },
};

export interface Accompaniment {
  /** Notas que começam em [from, to) para as partes pedidas, em ordem de tempo. */
  notesBetween(from: number, to: number, parts: ReadonlySet<AccompPart>): AccompNote[];
  /** Todas as notas de uma parte (a linha de baixo inteira, por exemplo). */
  part(part: AccompPart): readonly AccompNote[];
}

const STRUM_STEP = 0.012; // atraso entre cordas na batida (s)

const sameChord = (a: Chord | null, b: Chord | null) => !!a && !!b && a.root === b.root && a.quality === b.quality && a.bass === b.bass;

/** Nota do baixo do acorde (inversão ou fundamental) na região Mi 1 … Ré# 2, sem corda solta. */
export function bassNoteOf(chord: Chord, tuning: BassTuning = BASS_TUNINGS[0]!): number {
  const b = pc(chord.bass ?? chord.root);
  const low = tuning.strings[0]!;
  const midi = low + ((b - pc(low) + 12) % 12);
  return noOpenString(midi, tuning)?.midi ?? midi;
}

/** Alturas MIDI que a forma do violão faz soar, da corda mais grave para a mais aguda. */
export function guitarPitches(chord: Chord, mode: GuitarMode = 'normal', near = 5): number[] {
  const v = guitarVoicing(chord, { mode, near });
  if (!v) return chordTones(chord).map((t) => 52 + ((t - 52 + 120) % 12));
  return v.frets.flatMap((f, s) => (f == null ? [] : [GUITAR_TUNING[s]! + f]));
}

/** Power chord: fundamental na corda Mi ou Lá (sem corda solta), quinta e oitava. */
export function powerChord(chord: Chord, near = 5): number[] {
  const r = pc(chord.bass ?? chord.root);
  let best: number[] = [];
  let cost = Infinity;
  for (const s of [0, 1]) {
    const open = GUITAR_TUNING[s]!;
    for (let f = 1; f <= 12; f++) {
      if (pc(open + f) !== r) continue;
      const c = Math.abs(f - near) + s * 0.5;
      if (c < cost) {
        cost = c;
        best = [open + f, open + f + 7, open + f + 12];
      }
    }
  }
  return best;
}

interface BeatInfo {
  /** Índice do acorde. */
  readonly ci: number;
  /** Tempo no compasso (0–3). */
  readonly b: number;
  /** Tempos desde o começo do acorde. */
  readonly k: number;
  /** Tempos que faltam no acorde, contando este. */
  readonly left: number;
  /** Fim do acorde (s): nada passa daqui. */
  readonly end: number;
}

/**
 * Prepara o acompanhamento da música inteira. `beats` são os tempos detectados; `firstDownbeat` é
 * o índice do primeiro tempo 1 (compasso de 4).
 */
export function buildAccompaniment(chords: readonly AccompChord[], beats: readonly number[], firstDownbeat: number, opts: AccompOptions = DEFAULT_ACCOMP_OPTIONS): Accompaniment {
  const list = [...chords].sort((a, b) => a.start - b.start);
  const chordIdx = (t: number): number => {
    let lo = 0;
    let hi = list.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid]!.start <= t + 1e-3) {
        ans = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return ans;
  };
  const beatLen = (i: number): number => (i + 1 < beats.length ? beats[i + 1]! - beats[i]! : i > 0 ? beats[i]! - beats[i - 1]! : 0.5);

  // Tempo a tempo: acorde, posição no compasso, tempos desde a troca e até a próxima.
  const info: Array<BeatInfo | null> = new Array(beats.length).fill(null);
  // Início do próximo acorde DIFERENTE (entradas repetidas do mesmo acorde não cortam a nota).
  const nextDiff: number[] = new Array(list.length).fill(Infinity);
  for (let c = list.length - 2; c >= 0; c--) nextDiff[c] = sameChord(list[c]!.chord, list[c + 1]!.chord) ? nextDiff[c + 1]! : list[c + 1]!.start;
  {
    const ci = beats.map((t) => chordIdx(t));
    const segStart: number[] = [];
    for (let i = 0; i < beats.length; i++) {
      const c = ci[i]! >= 0 ? list[ci[i]!]!.chord : null;
      const prev = i > 0 && ci[i - 1]! >= 0 ? list[ci[i - 1]!]!.chord : null;
      segStart[i] = i > 0 && c && sameChord(c, prev) ? segStart[i - 1]! : i;
    }
    let segEndIdx = beats.length;
    for (let i = beats.length - 1; i >= 0; i--) {
      if (i + 1 < beats.length && segStart[i + 1] !== segStart[i]) segEndIdx = i + 1;
      const c = ci[i]! >= 0 ? list[ci[i]!]!.chord : null;
      if (!c) continue;
      const segEndT = segEndIdx < beats.length ? beats[segEndIdx]! : beats[beats.length - 1]! + beatLen(beats.length - 1);
      // Troca de acorde fora do tempo (no meio dele) também encerra as notas.
      const change = nextDiff[ci[i]!]!;
      const endT = change > beats[i]! + 1e-3 ? Math.min(segEndT, change) : segEndT;
      info[i] = { ci: ci[i]!, b: (((i - firstDownbeat) % 4) + 4) % 4, k: i - segStart[i]!, left: segEndIdx - i, end: endT };
    }
  }

  const notes: Record<AccompPart, AccompNote[]> = { bass: [], guitar: [], piano: [] };
  /** Agenda uma nota: `off` e `len` em tempos a partir do tempo i; nunca invade o acorde seguinte. */
  const emit = (part: AccompPart, i: number, off: number, len: number, midi: number, vel: number, extra: Partial<AccompNote> = {}) => {
    const x = info[i]!;
    const bl = beatLen(i);
    const t = beats[i]! + off * bl;
    if (t >= x.end - 0.02) return;
    const dur = Math.max(0.03, Math.min(len * bl, x.end - t) * 0.94);
    notes[part].push({ part, t, dur, midi, vel, beat: i, ...extra });
  };
  /* ------------------------------ baixo ------------------------------ */
  {
    const { tuning, region, pattern } = opts.bass;
    const shapes = new Map<number, BassShape>();
    let prevZone: number | null = null;
    // Forma por trecho de acorde (na ordem da música, para a mão andar pouco).
    for (let i = 0; i < beats.length; i++) {
      const x = info[i];
      if (!x || x.k !== 0) continue;
      const s = bassShape(list[x.ci]!.chord!, tuning, prevZone, region);
      shapes.set(i, s);
      prevZone = s.zone;
    }
    let shape: BassShape | null = null;
    const play = (i: number, off: number, len: number, n: PlacedNote, vel: number, zone: number) =>
      emit('bass', i, off, len, n.midi, vel, { pos: n.pos, zone, finger: fingerInZone(n.pos.fret, zone) });
    for (let i = 0; i < beats.length; i++) {
      const x = info[i];
      if (!x) continue;
      if (x.k === 0) shape = shapes.get(i)!;
      if (!shape) continue;
      const z = shape.zone;
      const T = (t: BassTone) => shape!.tones[t];
      const nextShape = shapes.get(i + x.left) ?? null;
      const approach = () => (nextShape ? approachNote(nextShape.root.midi, tuning, z, shape!.root.pos.string) : null);
      const accent = x.b === 0 || x.k === 0 ? 1 : 0.82;
      switch (pattern) {
        case 'root':
          play(i, 0, 1, T('R'), accent, z);
          break;
        case 'root-fifth':
          if (x.k % 2 === 0) play(i, 0, Math.min(2, x.left), (x.k / 2) % 2 === 0 ? T('R') : T('5'), accent, z);
          break;
        case 'eighths': {
          play(i, 0, 0.5, T('R'), accent, z);
          const last = x.left === 1 && nextShape ? approach() : null;
          play(i, 0.5, 0.5, last ?? (x.b === 3 ? T('5') : T('R')), 0.7, z);
          break;
        }
        case 'octave':
          play(i, 0, 0.5, T('R'), accent, z);
          play(i, 0.5, 0.5, T('8'), 0.75, z);
          break;
        case 'arpeggio': {
          const seq: BassTone[] = ['R', '3', '5', '7'];
          play(i, 0, 1, T(seq[x.k % 4]!), accent, z);
          break;
        }
        case 'walking': {
          const seq: BassTone[] = ['R', '3', '5', '6'];
          const a = x.left === 1 && x.k > 0 ? approach() : null;
          play(i, 0, 1, a ?? T(seq[x.k % 4]!), accent, z);
          break;
        }
        case 'triplet': {
          const seq: BassTone[] = x.k % 2 === 0 ? ['R', '5', '8'] : ['8', '5', 'R'];
          seq.forEach((t, j) => play(i, j / 3, 1 / 3, T(t), j === 0 ? accent : 0.68, z));
          break;
        }
        case 'long':
          if (x.k === 0 || x.b === 0) play(i, 0, Math.min(4, x.left), T('R'), accent, z);
          break;
      }
    }
  }

  /* ------------------------------ violão / guitarra ------------------------------ */
  {
    const { pattern, mode, region } = opts.guitar;
    const cache = new Map<number, number[]>();
    const shapeOf = (ci: number) => {
      let g = cache.get(ci);
      if (!g) {
        const c = list[ci]!.chord!;
        g = pattern === 'power' ? powerChord(c, region) : guitarPitches(c, mode, region);
        cache.set(ci, g);
      }
      return g;
    };
    const strum = (i: number, off: number, len: number, ns: readonly number[], vel: number, up = false) => {
      const order = up ? [...ns].slice(-4).reverse() : ns;
      order.forEach((m, k) => emit('guitar', i, off + (k * STRUM_STEP) / beatLen(i), len - (k * STRUM_STEP) / beatLen(i), m, vel));
    };
    for (let i = 0; i < beats.length; i++) {
      const x = info[i];
      if (!x) continue;
      const ns = shapeOf(x.ci);
      if (!ns.length) continue;
      const p = ns[0]!; // polegar: a nota mais grave
      const treble = ns.slice(1);
      const at = (k: number) => treble[Math.max(0, treble.length - 1 - k)] ?? p; // a = 0 (mais aguda), m = 1, i = 2
      const accent = x.b === 0 || x.k === 0 ? 0.78 : 0.6;
      switch (pattern) {
        case 'strum':
          strum(i, 0, 1, ns, x.b === 0 || x.k === 0 ? 0.75 : x.b === 2 ? 0.6 : 0.45);
          break;
        case 'pop':
          // Baixo | baixo-cima | cima | baixo-cima
          if (x.b === 0 || x.b === 1 || x.b === 3 || x.k === 0) strum(i, 0, 1, ns, accent);
          if (x.b !== 0) strum(i, 0.5, 0.5, ns, 0.42, true);
          break;
        case 'arpeggio': {
          const seq = [p, at(2), at(1), at(0), at(1), at(2), at(1), at(0)];
          for (const h of [0, 1]) {
            const e = (x.k * 2 + h) % 8;
            emit('guitar', i, h * 0.5, 1.5, x.k === 0 && h === 0 ? p : seq[e]!, e === 0 ? 0.7 : 0.5);
          }
          break;
        }
        case 'triplet': {
          const seq = x.k % 2 === 0 ? [p, at(2), at(1)] : [at(0), at(1), at(2)];
          seq.forEach((m, j) => emit('guitar', i, j / 3, 1.2, m, j === 0 ? accent * 0.9 : 0.48));
          break;
        }
        case 'bossa': {
          // Polegar nos tempos 1 e 3 (alternando a nota grave); acorde nas cordas agudas sincopado.
          if (x.b === 0 || x.b === 2) emit('guitar', i, 0, 2, x.b === 2 && ns[1] !== undefined ? ns[1]! : p, 0.62);
          const pinch = treble.slice(-3);
          const hits: Record<number, number[]> = { 0: [0], 1: [0.5], 2: [], 3: [0] };
          for (const off of hits[x.b] ?? []) for (const m of pinch) emit('guitar', i, off, 0.45, m, 0.46);
          break;
        }
        case 'power':
          for (const h of [0, 1]) for (const m of ns) emit('guitar', i, h * 0.5, 0.32, m, h === 0 && (x.b === 0 || x.k === 0) ? 0.85 : 0.6);
          break;
        case 'long':
          if (x.k === 0 || x.b === 0) strum(i, 0, Math.min(4, x.left), ns, 0.7);
          break;
      }
    }
  }

  /* ------------------------------ piano ------------------------------ */
  {
    const { pattern } = opts.piano;
    const voicings: Array<PianoVoicing | null> = voiceChords(list.map((c) => c.chord));
    for (let i = 0; i < beats.length; i++) {
      const x = info[i];
      if (!x) continue;
      const v = voicings[x.ci];
      if (!v) continue;
      const head = x.k === 0 || x.b === 0;
      const block = (off: number, len: number, ms: readonly number[], vel: number) => ms.forEach((m) => emit('piano', i, off, len, m, vel));
      switch (pattern) {
        case 'block':
          if (head) block(0, 2, [...v.left, ...v.right], 0.65);
          else if (x.b === 2) block(0, 1.5, v.right, 0.45);
          break;
        case 'long':
          if (head) block(0, Math.min(4, x.left), [...v.left, ...v.right], 0.6);
          break;
        case 'arpeggio': {
          if (head) block(0, Math.min(2, x.left), v.left, 0.6);
          const seq = [...v.right, ...v.right.slice(1, -1).reverse()];
          for (const h of [0, 1]) emit('piano', i, h * 0.5, 1, seq[(x.k * 2 + h) % seq.length]!, h === 0 ? 0.55 : 0.45);
          break;
        }
        case 'alberti': {
          const low = v.left[0]!;
          const tones = chordTones(list[x.ci]!.chord!);
          const above = (from: number, k: number) => {
            const ups = tones.map((t) => from + ((t - pc(from) + 12) % 12 || 12)).sort((a, b) => a - b);
            return ups[Math.min(k, ups.length - 1)]!;
          };
          const mid = above(low, 0);
          const high = above(low, 1);
          // Grave-agudo-médio-agudo em colcheias, ao longo de dois tempos.
          const pair = x.k % 2 === 0 ? [low, high] : [mid, high];
          pair.forEach((m, j) => emit('piano', i, j * 0.5, 0.5, m, j === 0 && x.k % 2 === 0 ? 0.55 : 0.4));
          if (head) block(0, Math.min(2, x.left), v.right, 0.4);
          break;
        }
        case 'triplet': {
          if (head) block(0, Math.min(2, x.left), v.left, 0.55);
          const r = v.right;
          const seq = x.k % 2 === 0 ? [r[0], r[1], r[2]] : [r[r.length - 1], r[1], r[0]];
          seq.forEach((m, j) => m !== undefined && emit('piano', i, j / 3, 0.6, m, j === 0 ? 0.52 : 0.4));
          break;
        }
        case 'comping':
          if (x.b === 0 || x.k === 0) {
            block(0, 0.5, v.left, 0.6);
            block(0, 0.45, v.right, 0.55);
          }
          if (x.b === 1) block(0.5, 0.45, v.right, 0.5);
          if (x.b === 2) block(0, 1, v.left, 0.45);
          if (x.b === 3) block(0, 0.4, v.right, 0.42);
          break;
      }
    }
  }

  for (const p of Object.keys(notes) as AccompPart[]) notes[p].sort((a, b) => a.t - b.t);

  const firstAtOrAfter = (arr: readonly AccompNote[], t: number) => {
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid]!.t < t - 1e-9) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  return {
    notesBetween(from, to, parts) {
      const out: AccompNote[] = [];
      for (const p of parts) {
        const arr = notes[p];
        for (let k = firstAtOrAfter(arr, from); k < arr.length && arr[k]!.t < to; k++) out.push(arr[k]!);
      }
      return out.sort((a, b) => a.t - b.t);
    },
    part: (p) => notes[p],
  };
}
