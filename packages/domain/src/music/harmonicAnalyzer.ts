import { pc, pcName, type Chord, type Key } from './harmony.js';
import { chordIntervals, harmonicField, type HarmonicFunction } from './circleOfFifths.js';

/**
 * Análise funcional da harmonia (pura): grau romano, função, empréstimo modal, dominante
 * secundário, notas-alvo (1, 3, 7), sugestão de condução do baixo entre acordes, escala por acorde,
 * leituras alternativas (Am7 ↔ C6), tonalidade (Krumhansl-Schmuckler) e um leitor de cifra em texto.
 */
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
/** Grau cromático (0–11) → [índice do grau, alteração] em relação à escala maior. */
const CHROMATIC: ReadonlyArray<readonly [number, string]> = [
  [0, ''], [1, '♭'], [1, ''], [2, '♭'], [2, ''], [3, ''], [4, '♭'], [4, ''], [5, '♭'], [5, ''], [6, '♭'], [6, ''],
];
const isMinorQ = (q: string) => q.startsWith('m') && !q.startsWith('maj') && q !== 'm7b5';
const isDimQ = (q: string) => q === 'dim' || q === 'dim7' || q === 'm7b5';
const isDominantQ = (q: string) => q === '7' || q === '9' || q === '7sus4';

export type ChordKind = 'diatonic' | 'borrowed' | 'secondary' | 'chromatic';

export interface Analysis {
  /** Grau romano: "ii7", "V7", "Imaj7", "♭VII", "V7/vi". */
  readonly roman: string;
  readonly fn: HarmonicFunction | null;
  readonly kind: ChordKind;
}

function romanOf(interval: number, quality: string): string {
  const [deg, acc] = CHROMATIC[pc(interval)]!;
  let r = ROMAN[deg]!;
  if (isMinorQ(quality) || isDimQ(quality)) r = r.toLowerCase();
  const suffix = quality === 'dim' ? '°' : quality === 'dim7' ? '°7' : quality === 'm7b5' ? 'ø7' : quality === 'maj7' ? 'maj7' : quality.endsWith('7') || quality === '9' ? '7' : quality === '6' || quality === 'm6' ? '6' : '';
  return `${acc}${r}${suffix}`;
}

/** Grau funcional do acorde no tom. */
export function analyzeChord(chord: Chord, key: Key): Analysis {
  const field = harmonicField(key);
  const i = pc(chord.root - key.tonic);
  const q = chord.quality;
  const diatonic = field.find((f) => pc(f.chord.root - key.tonic) === i);
  const sameColor = (f: { chord: Chord }) => isMinorQ(f.chord.quality) === isMinorQ(q) && isDimQ(f.chord.quality) === isDimQ(q);
  // Dominante do V no menor (V maior da harmônica) conta como diatônico.
  if (diatonic && (sameColor(diatonic) || (key.mode === 'minor' && i === 7 && !isMinorQ(q)))) {
    return { roman: romanOf(i, q), fn: key.mode === 'minor' && i === 7 ? 'Dominante' : diatonic.fn, kind: 'diatonic' };
  }
  // Dominante secundário: acorde maior/7 cuja fundamental está uma quinta acima de um grau do campo (não a tônica).
  if (!isMinorQ(q) && !isDimQ(q)) {
    const target = field.find((f, k) => k > 0 && pc(f.chord.root - (chord.root - 7)) === 0 && !isDimQ(f.chord.quality));
    if (target && (isDominantQ(q) || q === '')) return { roman: `V${isDominantQ(q) ? '7' : ''}/${target.degree.replace('°', '')}`, fn: 'Dominante', kind: 'secondary' };
  }
  // Empréstimo do modo paralelo (♭VII, ♭VI, ♭III, iv no maior; IV, I no menor…).
  const parallel = harmonicField({ tonic: key.tonic, mode: key.mode === 'major' ? 'minor' : 'major' });
  const borrowed = parallel.find((f) => pc(f.chord.root - key.tonic) === i && sameColor(f));
  if (borrowed) return { roman: romanOf(i, q), fn: borrowed.fn, kind: 'borrowed' };
  return { roman: romanOf(i, q), fn: null, kind: 'chromatic' };
}

export interface TargetNotes {
  readonly root: string;
  readonly third: string | null;
  readonly seventh: string | null;
  /** Classes de altura (0–11) na mesma ordem: fundamental, terça, sétima. */
  readonly pcs: readonly number[];
}

/** Notas-alvo do acorde: fundamental, terça (define maior/menor) e sétima (define a tensão). */
export function targetNotes(chord: Chord, flats = false): TargetNotes {
  const iv = chordIntervals(chord.quality);
  const third = iv.find((x) => x === 3 || x === 4) ?? null;
  const seventh = iv.find((x) => x === 10 || x === 11 || x === 9) ?? null;
  const pcs = [chord.root, ...(third !== null ? [chord.root + third] : []), ...(seventh !== null && iv.length >= 4 ? [chord.root + seventh] : [])].map(pc);
  return {
    root: pcName(chord.root, flats),
    third: third !== null ? pcName(chord.root + third, flats) : null,
    seventh: seventh !== null && iv.length >= 4 ? pcName(chord.root + seventh, flats) : null,
    pcs,
  };
}

export interface Approach {
  /** Nota do último tempo do acorde atual que leva ao próximo. */
  readonly note: string;
  readonly pc: number;
  /** "cromática ascendente", "cromática descendente", "quinta (salto para a fundamental)", "diatônica". */
  readonly kind: string;
  readonly text: string;
}

/** Condução do baixo do acorde atual para o próximo: a nota do último tempo que leva à fundamental seguinte. */
export function bassApproach(from: Chord, to: Chord, key: Key | null, flats = false): Approach {
  const target = pc(to.bass ?? to.root);
  const fromRoot = pc(from.bass ?? from.root);
  const scale = key ? (key.mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10]).map((x) => pc(key.tonic + x)) : [];
  const name = (p: number) => pcName(p, flats);
  const toName = name(target);
  if (fromRoot === target) {
    const fifth = pc(target + 7);
    return { note: name(fifth), pc: fifth, kind: 'quinta', text: `Mesmo baixo: passe pela quinta (${name(fifth)}) e volte ao ${toName}.` };
  }
  // Fundamental sobe uma quarta (V → I): a quinta do destino está na mão; senão aproximação cromática.
  if (pc(target - fromRoot) === 5) {
    const below = pc(target - 1);
    return { note: name(below), pc: below, kind: 'cromática ascendente', text: `Movimento de quinta (dominante → tônica): ${name(below)} meio tom abaixo, resolvendo no ${toName}.` };
  }
  const up = pc(target - fromRoot) <= 6;
  const diatonic = scale.length ? scale.find((p) => pc(target - p) === (up ? 2 : 10) || pc(target - p) === (up ? 1 : 11)) : undefined;
  if (diatonic !== undefined && pc(target - diatonic) === (up ? 2 : 10)) {
    return { note: name(diatonic), pc: diatonic, kind: 'diatônica', text: `${up ? 'Sobe' : 'Desce'} pela escala: ${name(diatonic)} → ${toName}.` };
  }
  const chrom = pc(target + (up ? -1 : 1));
  return { note: name(chrom), pc: chrom, kind: up ? 'cromática ascendente' : 'cromática descendente', text: `Aproximação cromática ${up ? 'por baixo' : 'por cima'}: ${name(chrom)} → ${toName}.` };
}

/** Escala/modo recomendado para improvisar ou construir a linha sobre o acorde, no contexto do tom. */
export function scaleFor(chord: Chord, key: Key | null): string {
  const q = chord.quality;
  if (q === 'm7b5') return 'Lócrio';
  if (q === 'dim' || q === 'dim7') return 'Diminuta (tom-semitom)';
  if (q === 'aug') return 'Tons inteiros';
  if (key) {
    const a = analyzeChord(chord, key);
    if (a.kind === 'diatonic' && key.mode === 'major') {
      const map: Record<number, string> = { 0: 'Jônio (maior)', 2: 'Dórico', 4: 'Frígio', 5: 'Lídio', 7: 'Mixolídio', 9: 'Eólio (menor natural)', 11: 'Lócrio' };
      return map[pc(chord.root - key.tonic)] ?? 'Jônio (maior)';
    }
    if (a.kind === 'diatonic' && key.mode === 'minor') {
      const map: Record<number, string> = { 0: 'Eólio (menor natural)', 2: 'Lócrio', 3: 'Jônio (maior)', 5: 'Dórico', 7: isMinorQ(q) ? 'Frígio' : 'Mixolídio ♭9 ♭13 (frígio dominante)', 8: 'Lídio', 10: 'Mixolídio' };
      return map[pc(chord.root - key.tonic)] ?? 'Eólio (menor natural)';
    }
    if (a.kind === 'secondary') return 'Mixolídio (dominante secundário)';
  }
  if (isDominantQ(q)) return 'Mixolídio';
  if (isMinorQ(q)) return 'Dórico';
  if (q === 'maj7') return 'Lídio';
  return 'Jônio (maior)';
}

/** Leituras alternativas do mesmo som (o detector pode confundir): Am7 ↔ C6, Cmaj7 ↔ Em/C, C ↔ Cmaj7… */
export function chordCandidates(chord: Chord): Chord[] {
  const r = pc(chord.root);
  const out: Chord[] = [];
  const add = (c: Chord) => {
    if (!out.some((x) => x.root === c.root && x.quality === c.quality && x.bass === c.bass)) out.push(c);
  };
  switch (chord.quality) {
    case 'm7':
      add({ root: pc(r + 3), quality: '6' });
      add({ root: r, quality: 'm' });
      break;
    case '6':
      add({ root: pc(r - 3), quality: 'm7' });
      add({ root: r, quality: '' });
      break;
    case 'maj7':
      add({ root: pc(r + 4), quality: 'm', bass: r });
      add({ root: r, quality: '' });
      break;
    case '':
      add({ root: r, quality: 'maj7' });
      add({ root: r, quality: '7' });
      add({ root: pc(r + 9), quality: 'm7' });
      break;
    case 'm':
      add({ root: r, quality: 'm7' });
      add({ root: pc(r + 3), quality: '6' });
      break;
    case '7':
      add({ root: r, quality: '' });
      add({ root: pc(r + 4), quality: 'dim' });
      break;
    case 'm7b5':
      add({ root: pc(r + 3), quality: 'm6' });
      add({ root: r, quality: 'dim' });
      break;
    default:
      add({ root: r, quality: '' });
      add({ root: r, quality: 'm' });
  }
  return out;
}

const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function corr(a: readonly number[], b: readonly number[]): number {
  const ma = a.reduce((s, x) => s + x, 0) / a.length;
  const mb = b.reduce((s, x) => s + x, 0) / b.length;
  let n = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    n += (a[i]! - ma) * (b[i]! - mb);
    da += (a[i]! - ma) ** 2;
    db += (b[i]! - mb) ** 2;
  }
  return da && db ? n / Math.sqrt(da * db) : 0;
}

/** Tonalidade pelos acordes ponderados pela duração (perfil Krumhansl-Schmuckler). */
export function detectKey(chords: ReadonlyArray<{ readonly chord: Chord; readonly beats: number }>): Key {
  const h = new Array<number>(12).fill(0);
  for (const { chord, beats } of chords) {
    chordIntervals(chord.quality).forEach((iv, k) => (h[pc(chord.root + iv)]! += beats * (k === 0 ? 1.5 : 1)));
    if (chord.bass !== undefined) h[pc(chord.bass)]! += beats * 0.5;
  }
  let best: Key = { tonic: 0, mode: 'major' };
  let score = -Infinity;
  for (let t = 0; t < 12; t++) {
    for (const [mode, prof] of [['major', MAJOR_PROFILE], ['minor', MINOR_PROFILE]] as const) {
      const rot = prof.map((_, i) => prof[pc(i - t)]!);
      const c = corr(h, rot);
      if (c > score) {
        score = c;
        best = { tonic: t, mode };
      }
    }
  }
  return best;
}

/** Resolução forte entre dois acordes seguidos (para a seta no mapa): dominante → tônica, ou ii → V. */
export function resolution(from: Chord, to: Chord): 'dominante' | 'ii-V' | null {
  const d = pc(to.root - from.root);
  if (d === 5 && !isMinorQ(from.quality) && !isDimQ(from.quality)) return 'dominante';
  if (d === 5 && isMinorQ(from.quality) && !isMinorQ(to.quality) && !isDimQ(to.quality)) return 'ii-V';
  return null;
}

/* ------------------------------ cifra em texto ------------------------------ */
const NOTE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const QUALITY_ALIASES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^(maj7|7M|M7|Δ7?|maj)$/, 'maj7'],
  [/^(m7\(?b5\)?|ø7?|m7-5)$/, 'm7b5'],
  [/^(°7|dim7|o7)$/, 'dim7'],
  [/^(°|dim|o)$/, 'dim'],
  [/^(\+|aug|5\+)$/, 'aug'],
  [/^(m7|min7|-7)$/, 'm7'],
  [/^(m6|min6)$/, 'm6'],
  [/^(m9)$/, 'm9'],
  [/^(maj9)$/, 'maj9'],
  [/^(m|min|-)$/, 'm'],
  [/^(7sus4|7sus)$/, '7sus4'],
  [/^(sus4|sus)$/, 'sus4'],
  [/^(sus2)$/, 'sus2'],
  [/^(add9)$/, 'add9'],
  [/^(9)$/, '9'],
  [/^(7)$/, '7'],
  [/^(6)$/, '6'],
  [/^$/, ''],
];

/** Lê uma cifra ("Am7", "C/E", "F#m7(b5)", "Bb7M"). null se não for cifra. */
export function parseChord(token: string): Chord | null {
  const m = /^([A-G])([#b♯♭]?)([^/]*)(?:\/([A-G])([#b♯♭]?))?$/.exec(token.trim());
  if (!m) return null;
  const acc = (x: string | undefined) => (x === '#' || x === '♯' ? 1 : x === 'b' || x === '♭' ? -1 : 0);
  const root = pc(NOTE[m[1]!]! + acc(m[2]));
  const rawQ = (m[3] ?? '').replace(/[()]/g, '');
  const hit = QUALITY_ALIASES.find(([re]) => re.test(rawQ));
  if (!hit) return null;
  const bass = m[4] ? pc(NOTE[m[4]]! + acc(m[5])) : undefined;
  return { root, quality: hit[1], ...(bass !== undefined && bass !== root ? { bass } : {}) };
}

export interface ParsedBar {
  readonly chords: ReadonlyArray<{ readonly chord: Chord; readonly beat: number; readonly beats: number }>;
}

/**
 * Cifra em texto, compasso por compasso: "| C / G / | Am | F | G7 |". "/" repete o acorde por um tempo,
 * "%" repete o compasso anterior; sem barras, cada linha (ou cada 4 acordes) vira compassos de 1 acorde.
 * Compasso de `beatsPerBar` tempos (4 por padrão).
 */
export function parseChordText(text: string, beatsPerBar = 4): ParsedBar[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const cells: string[] = [];
  for (const line of lines) {
    if (line.includes('|')) cells.push(...line.split('|').map((c) => c.trim()).filter((c) => c.length));
    else cells.push(...line.split(/\s+/).filter((t) => parseChord(t)));
  }
  const bars: ParsedBar[] = [];
  for (const cell of cells) {
    if (cell === '%') {
      const prev = bars[bars.length - 1];
      if (prev) bars.push(prev);
      continue;
    }
    const tokens = cell.split(/\s+/).filter(Boolean);
    const slots: Array<Chord | null> = [];
    for (const t of tokens) {
      if (t === '/' || t === '.') slots.push(null);
      else {
        const c = parseChord(t);
        if (c) slots.push(c);
      }
    }
    if (!slots.some((x) => x)) continue;
    const explicit = tokens.some((t) => t === '/' || t === '.');
    const per = explicit ? beatsPerBar / slots.length : beatsPerBar / slots.filter(Boolean).length;
    const chords: Array<{ chord: Chord; beat: number; beats: number }> = [];
    let beat = 0;
    for (const s of explicit ? slots : slots.filter(Boolean)) {
      if (s) chords.push({ chord: s, beat, beats: per });
      else if (chords.length) chords[chords.length - 1] = { ...chords[chords.length - 1]!, beats: chords[chords.length - 1]!.beats + per };
      beat += per;
    }
    bars.push({ chords });
  }
  return bars;
}
