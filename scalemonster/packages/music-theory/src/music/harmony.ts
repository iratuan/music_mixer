/**
 * Harmonia para exibição: nomes de tom e acorde, transposição em meios tons e localização
 * do compasso/tempo atual durante a reprodução. Módulo puro (sem áudio, sem DOM).
 */

export type Mode = 'major' | 'minor';
export interface Key {
  readonly tonic: number;
  readonly mode: Mode;
}
export interface Chord {
  readonly root: number;
  /** '', 'm', '7', 'm7', 'maj7', 'sus2', 'sus4', 'dim', 'm7b5'. */
  readonly quality: string;
  /** Inversão: nota do baixo (classe de altura) quando não é a fundamental (C/E). */
  readonly bass?: number;
}

const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const SOLFEGE_SHARPS = ['Dó', 'Dó♯', 'Ré', 'Ré♯', 'Mi', 'Fá', 'Fá♯', 'Sol', 'Sol♯', 'Lá', 'Lá♯', 'Si'];
const SOLFEGE_FLATS = ['Dó', 'Ré♭', 'Ré', 'Mi♭', 'Mi', 'Fá', 'Sol♭', 'Sol', 'Lá♭', 'Lá', 'Si♭', 'Si'];

export const pc = (n: number): number => ((Math.round(n) % 12) + 12) % 12;

/** Nome da classe de altura em cifra (C, C#, Db…). */
export function pcName(p: number, flats = false): string {
  return (flats ? FLATS : SHARPS)[pc(p)]!;
}

/** Tons que se escrevem com bemóis: F, Bb, Eb, Ab, Db, Gb maior e relativos menores. */
export function keyUsesFlats(key: Key | null): boolean {
  if (!key) return false;
  const major = key.mode === 'major' ? pc(key.tonic) : pc(key.tonic + 3);
  return [5, 10, 3, 8, 1, 6].includes(major);
}

export function transposeKey(key: Key, semitones: number): Key {
  return { tonic: pc(key.tonic + semitones), mode: key.mode };
}

export function transposeChord(chord: Chord, semitones: number): Chord {
  return { root: pc(chord.root + semitones), quality: chord.quality, ...(chord.bass !== undefined ? { bass: pc(chord.bass + semitones) } : {}) };
}

/** "D maior", "Bb menor". */
export function keyName(key: Key): string {
  return `${pcName(key.tonic, keyUsesFlats(key))} ${key.mode === 'major' ? 'maior' : 'menor'}`;
}

/** "Ré maior", "Si♭ menor". */
export function keyNameSolfege(key: Key): string {
  const flats = keyUsesFlats(key);
  return `${(flats ? SOLFEGE_FLATS : SOLFEGE_SHARPS)[pc(key.tonic)]} ${key.mode === 'major' ? 'maior' : 'menor'}`;
}

/** Cifra do acorde, com a grafia do tom em que aparece ("Bb7" em Fá maior, "A#7" em Si maior). */
export function chordName(chord: Chord | null, key: Key | null = null): string {
  if (!chord) return '—';
  const flats = keyUsesFlats(key);
  const slash = chord.bass !== undefined && pc(chord.bass) !== pc(chord.root) ? `/${pcName(chord.bass, flats)}` : '';
  return `${pcName(chord.root, flats)}${chord.quality}${slash}`;
}

/** Grau do acorde no tom, em algarismos romanos (maiúsculo = maior). Ex.: V7 em Dó para G7. */
export function chordDegree(chord: Chord | null, key: Key | null): string {
  if (!chord || !key) return '';
  const interval = pc(chord.root - key.tonic);
  const DEG: Record<number, string> = { 0: 'I', 1: '♭II', 2: 'II', 3: '♭III', 4: 'III', 5: 'IV', 6: '♯IV', 7: 'V', 8: '♭VI', 9: 'VI', 10: '♭VII', 11: 'VII' };
  const base = DEG[interval]!;
  // Diminuto e meio-diminuto: grau minúsculo com ° e ø (vii°, viiø7).
  if (chord.quality === 'dim') return base.replace(/[IV]+/, (r) => r.toLowerCase()) + '°';
  if (chord.quality === 'm7b5') return base.replace(/[IV]+/, (r) => r.toLowerCase()) + 'ø7';
  const minor = chord.quality.startsWith('m') && !chord.quality.startsWith('maj');
  const roman = minor ? base.replace(/[IV]+/, (r) => r.toLowerCase()) : base;
  const suffix = chord.quality === 'm' ? '' : minor ? chord.quality.slice(1) : chord.quality;
  return roman + suffix;
}

/** Índice do maior elemento ≤ t numa lista crescente (−1 se t vem antes de todos). */
export function indexAt(sorted: readonly number[], t: number): number {
  let lo = 0;
  let hi = sorted.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

export interface BarLike {
  readonly start: number;
  readonly end: number;
}

/** Compasso que está tocando no instante t (−1 antes do primeiro). */
export function barAt<T extends BarLike>(bars: readonly T[], t: number): number {
  const i = indexAt(
    bars.map((b) => b.start),
    t,
  );
  return i;
}

/** Tempo dentro do compasso (0–3), a partir da lista de tempos e do índice do primeiro tempo 1. */
export function beatInBar(beats: readonly number[], firstDownbeat: number, t: number): { beat: number; index: number } {
  const i = indexAt(beats, t);
  if (i < 0) return { beat: -1, index: -1 };
  return { beat: (((i - firstDownbeat) % 4) + 4) % 4, index: i };
}

export interface Click {
  /** Instante na música (s). */
  readonly t: number;
  /** Tempo 1 do compasso (acentuado). */
  readonly accent: boolean;
}

/** Cliques do metrônomo entre `from` (inclusive) e `to` (exclusivo), alinhados aos tempos detectados. */
export function clicksBetween(beats: readonly number[], firstDownbeat: number, from: number, to: number): Click[] {
  const out: Click[] = [];
  // Primeiro tempo ≥ from.
  for (let i = indexAt(beats, from - 1e-9) + 1; i < beats.length && beats[i]! < to; i++) {
    out.push({ t: beats[i]!, accent: (((i - firstDownbeat) % 4) + 4) % 4 === 0 });
  }
  return out;
}

/** Acorde que soa no instante t dentro de um compasso (o último que começou). */
export function chordAt<C extends { readonly start: number }>(chords: readonly C[], t: number): C | null {
  if (chords.length === 0) return null;
  const i = indexAt(
    chords.map((c) => c.start),
    t,
  );
  return chords[Math.max(0, i)]!;
}
