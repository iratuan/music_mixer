import type { BassTuning, FretPos } from './bass.js';

/**
 * Motor de exercícios de escala, portado do ScaleMonster (guitarra-escalas-v3, do mesmo autor):
 * banco de escalas, janelas das 5 posições, 15 padrões, percurso pelo braço inteiro e dedos.
 *
 * Diferença de convenção: aqui a corda 0 é a MAIS GRAVE (no ScaleMonster, 0 é a mais aguda).
 * Tudo o que dependia da ordem das cordas (varredura, saltos de corda, grupos) foi convertido.
 */

export interface ScaleMode {
  /** Intervalos em semitons a partir da tônica. */
  readonly intervals: readonly number[];
  /** Deslocamento de casa para encaixar as janelas das posições (do ScaleMonster). */
  readonly offset: number;
}

export const SCALE_BANK: Readonly<Record<string, Readonly<Record<string, ScaleMode>>>> = {
  Pentatônica: { Maior: { intervals: [0, 2, 4, 7, 9], offset: 0 }, Menor: { intervals: [0, 3, 5, 7, 10], offset: 3 } },
  'Escala Blues': { Maior: { intervals: [0, 2, 3, 4, 7, 9], offset: 0 }, Menor: { intervals: [0, 3, 5, 6, 7, 10], offset: 3 } },
  'Modos Gregos': {
    'Jônio (Maior)': { intervals: [0, 2, 4, 5, 7, 9, 11], offset: 0 },
    Dórico: { intervals: [0, 2, 3, 5, 7, 9, 10], offset: -2 },
    Frígio: { intervals: [0, 1, 3, 5, 7, 8, 10], offset: -4 },
    Lídio: { intervals: [0, 2, 4, 6, 7, 9, 11], offset: -5 },
    Mixolídio: { intervals: [0, 2, 4, 5, 7, 9, 10], offset: -7 },
    'Eólio (Menor)': { intervals: [0, 2, 3, 5, 7, 8, 10], offset: 3 },
    Lócrio: { intervals: [0, 1, 3, 5, 6, 8, 10], offset: 1 },
  },
  'Menor Harmônica': { Padrão: { intervals: [0, 2, 3, 5, 7, 8, 11], offset: 3 } },
  'Menor Melódica': { Padrão: { intervals: [0, 2, 3, 5, 7, 9, 11], offset: 3 } },
  'Escalas Simétricas': {
    'Diminuta (Tom-Semitom)': { intervals: [0, 2, 3, 5, 6, 8, 9, 11], offset: 0 },
    'Dom Diminuta (Semitom-Tom)': { intervals: [0, 1, 3, 4, 6, 7, 9, 10], offset: 0 },
    'Hexafônica (Tons Inteiros)': { intervals: [0, 2, 4, 6, 8, 10], offset: 0 },
  },
};

export type ExerciseId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;

export const EXERCISES: ReadonlyArray<{ id: ExerciseId; name: string }> = [
  { id: 1, name: 'Subir e descer a escala' },
  { id: 2, name: '2 vezes cada nota' },
  { id: 3, name: '3 vezes cada nota' },
  { id: 4, name: 'Grupos de 3 (1-2-3, 2-3-4…)' },
  { id: 5, name: 'Grupos de 4 (1-2-3-4, 2-3-4-5…)' },
  { id: 6, name: 'Saltos de terça (1-3, 2-4…)' },
  { id: 7, name: 'Arpejos: tríades' },
  { id: 8, name: 'Arpejos: tétrades' },
  { id: 9, name: 'Salto de cordas (4-2, 3-1…)' },
  { id: 10, name: 'Ir e voltar (1-2-1, 2-3-2…)' },
  { id: 11, name: 'Saltos de quarta (1-4, 2-5…)' },
  { id: 12, name: 'Saltos de quinta (1-5, 2-6…)' },
  { id: 13, name: 'Três notas por corda' },
  { id: 14, name: 'Permutação 1-3-2-4' },
  { id: 15, name: 'Saltos de oitava' },
];

export interface ScaleNote extends FretPos {
  /** Altura MIDI. */
  readonly midi: number;
  /** Classe de altura (0 = Dó). */
  readonly pc: number;
}

export interface StringGroup {
  readonly id: string;
  readonly label: string;
  /** Índices das cordas (0 = mais grave). */
  readonly strings: readonly number[];
}

/**
 * Grupos de cordas: todas, e blocos de 2 e 3 cordas vizinhas. Os rótulos usam a numeração do músico
 * (corda 1 = a mais aguda), como no ScaleMonster.
 */
export function stringGroups(count: number): StringGroup[] {
  const num = (i: number) => count - i; // índice (0 = grave) → número da corda (1 = aguda)
  const out: StringGroup[] = [{ id: 'all', label: 'Todas', strings: Array.from({ length: count }, (_, i) => i) }];
  for (const size of [2, 3]) {
    for (let lo = count - size; lo >= 0; lo--) {
      const strings = Array.from({ length: size }, (_, k) => lo + k);
      out.push({ id: `${num(lo + size - 1)}-${num(lo)}`, label: `${num(lo + size - 1)}–${num(lo)}`, strings });
    }
  }
  return out;
}

export interface ScaleContext {
  readonly tuning: BassTuning;
  readonly root: number;
  readonly mode: ScaleMode;
}

const inScale = (ctx: ScaleContext, midi: number) => ctx.mode.intervals.includes((((midi - ctx.root) % 12) + 12) % 12);

/** Notas da escala dentro da janela [start, end], no grupo de cordas, ordenadas por altura. */
export function candidateNotes(ctx: ScaleContext, start: number, end: number, group: readonly number[], keepDuplicates: boolean): ScaleNote[] {
  const temp: ScaleNote[] = [];
  ctx.tuning.strings.forEach((open, s) => {
    if (!group.includes(s)) return;
    for (let f = Math.max(0, start); f <= Math.min(end, ctx.tuning.frets); f++) {
      const midi = open + f;
      if (inScale(ctx, midi)) temp.push({ string: s, fret: f, midi, pc: midi % 12 });
    }
  });
  let base = temp;
  if (!keepDuplicates) {
    // Na posição, a mesma altura aparece uma vez só (prefere a casa mais baixa).
    const byPitch = new Map<number, ScaleNote>();
    for (const n of temp) {
      const e = byPitch.get(n.midi);
      if (!e || n.fret < e.fret) byPitch.set(n.midi, n);
    }
    base = [...byPitch.values()];
  }
  return base.sort((a, b) => a.midi - b.midi || a.string - b.string);
}

const upAndDown = <T>(b: T[]): T[] => [...b, ...[...b].reverse().slice(1)];
const leaps = <T>(list: T[], step: number): T[] => {
  const out: T[] = [];
  for (let i = 0; i + step < list.length; i++) out.push(list[i]!, list[i + step]!);
  return out;
};
const turns = <T>(list: T[]): T[] => {
  const out: T[] = [];
  for (let i = 0; i + 1 < list.length; i++) out.push(list[i]!, list[i + 1]!, list[i]!);
  return out;
};
function slide<T>(list: T[], k: number): T[] {
  const out: T[] = [];
  for (let i = 0; i <= list.length - k; i++) out.push(...list.slice(i, i + k));
  return out;
}

/** Os 15 padrões do ScaleMonster sobre as notas de uma janela (ordenadas por altura). */
export function buildSequence(base: ScaleNote[], exercise: ExerciseId, root: number, stringCount: number): ScaleNote[] {
  const rev = [...base].reverse();
  const inRoot = (n: ScaleNote, degrees: number[]) => degrees.includes((((n.pc - root) % 12) + 12) % 12);
  let seq: ScaleNote[] = [];
  switch (exercise) {
    case 1:
      seq = upAndDown(base);
      break;
    case 2:
      seq = upAndDown(base).flatMap((n) => [n, n]);
      break;
    case 3:
      seq = upAndDown(base).flatMap((n) => [n, n, n]);
      break;
    case 4:
      seq = [...slide(base, 3), ...slide(rev, 3)];
      break;
    case 5:
      seq = [...slide(base, 4), ...slide(rev, 4)];
      break;
    case 6:
      for (let i = 0; i <= base.length - 3; i++) seq.push(base[i]!, base[i + 2]!);
      for (let i = 0; i <= rev.length - 3; i++) seq.push(rev[i]!, rev[i + 2]!);
      break;
    case 7:
      seq = upAndDown(base.filter((n) => inRoot(n, [0, 3, 4, 6, 7, 8])));
      break;
    case 8:
      seq = upAndDown(base.filter((n) => inRoot(n, [0, 3, 4, 6, 7, 8, 9, 10, 11])));
      break;
    case 9: {
      // Saltos de corda: pares (grave, duas acima), subindo; volta pelo caminho inverso.
      const pairs: number[] = [];
      for (let s = 0; s + 2 < stringCount; s++) pairs.push(s, s + 2);
      for (const s of pairs) seq.push(...base.filter((n) => n.string === s));
      for (const s of [...pairs].reverse()) seq.push(...base.filter((n) => n.string === s).reverse());
      break;
    }
    case 10:
      seq = [...turns(base), ...turns(rev)];
      break;
    case 11:
      seq = [...leaps(base, 3), ...leaps(rev, 3)];
      break;
    case 12:
      seq = [...leaps(base, 4), ...leaps(rev, 4)];
      break;
    case 13: {
      // Corda a corda, da mais grave para a mais aguda; em cada corda, da casa mais baixa à mais alta.
      const sweep: ScaleNote[] = [];
      for (let s = 0; s < stringCount; s++) sweep.push(...base.filter((n) => n.string === s).sort((a, b) => a.fret - b.fret));
      seq = [...sweep, ...[...sweep].reverse()];
      break;
    }
    case 14:
      for (let i = 0; i + 3 < base.length; i++) seq.push(base[i]!, base[i + 2]!, base[i + 1]!, base[i + 3]!);
      for (let i = 0; i + 3 < rev.length; i++) seq.push(rev[i]!, rev[i + 2]!, rev[i + 1]!, rev[i + 3]!);
      break;
    case 15: {
      const oct = (list: ScaleNote[], dir: 1 | -1) => {
        const out: ScaleNote[] = [];
        for (const n of list) {
          const partner = list.find((m) => m.midi === n.midi + 12 * dir);
          if (partner) out.push(n, partner);
        }
        return out;
      };
      seq = [...oct(base, 1), ...oct(rev, -1)];
      break;
    }
  }
  const cleaned = exercise === 2 || exercise === 3 ? trimWrapRepeats(seq) : cleanCycle(seq);
  return cleaned.length === 0 ? upAndDown(base) : cleaned;
}

/** Remove notas iguais consecutivas e a repetição da nota inicial na virada do ciclo. */
export function cleanCycle(seq: ScaleNote[]): ScaleNote[] {
  const out: ScaleNote[] = [];
  for (const n of seq) if (out.length === 0 || out[out.length - 1]!.midi !== n.midi) out.push(n);
  if (out.length > 1 && out[out.length - 1]!.midi === out[0]!.midi) out.pop();
  return out;
}

/** Na virada do ciclo, tira do fim as notas iguais à primeira (exercícios de repetição). */
export function trimWrapRepeats(seq: ScaleNote[]): ScaleNote[] {
  let end = seq.length;
  while (end > 1 && seq[end - 1]!.midi === seq[0]!.midi) end--;
  return seq.slice(0, end);
}

/** Quantas notas formam um grupo do padrão (para não trocar de posição no meio de um grupo). */
export function exerciseUnit(exercise: ExerciseId): number {
  if (exercise === 4 || exercise === 10 || exercise === 13) return 3;
  if (exercise === 5 || exercise === 14) return 4;
  if ([6, 9, 11, 12, 15].includes(exercise)) return 2;
  return 1;
}

const BASE_WINDOWS: ReadonlyArray<readonly [number, number]> = [
  [0, 4],
  [2, 6],
  [4, 8],
  [7, 11],
  [9, 13],
];

/** Janelas de 5 casas das 5 posições para a tônica (Dó = 0), como no ScaleMonster. */
export function positionWindows(root: number, offset: number, maxFret: number): Array<[number, number]> {
  const windows = BASE_WINDOWS.map(([b0, b1]) => {
    let s = b0 + root + offset;
    let e = b1 + root + offset;
    while (s >= 12) {
      s -= 12;
      e -= 12;
    }
    while (s < 0) {
      s += 12;
      e += 12;
    }
    return [s, Math.min(e, maxFret)] as [number, number];
  });
  windows.sort((a, b) => a[0] - b[0]);
  const seen = new Set<number>();
  return windows.filter(([s]) => (seen.has(s) ? false : (seen.add(s), true))).slice(0, 5);
}

export interface ScaleExercise {
  readonly sequence: ScaleNote[];
  /** Todas as notas da escala na região (para mostrar no braço). */
  readonly scaleNotes: ScaleNote[];
  readonly fromFret: number;
  readonly toFret: number;
  readonly windows: Array<[number, number]>;
}

/**
 * Monta o exercício. `region` = número da posição (0–4) ou 'all' para o braço inteiro:
 * percorre as posições 1…5…1, tocando o padrão em cada uma, com as notas de passagem entre elas.
 */
export function buildScaleExercise(ctx: ScaleContext, exercise: ExerciseId, group: readonly number[], region: number | 'all'): ScaleExercise {
  const frets = ctx.tuning.frets;
  const windows = positionWindows(ctx.root, ctx.mode.offset, frets);
  const count = ctx.tuning.strings.length;
  const all = candidateNotes(ctx, 0, frets, group, true);

  if (region !== 'all') {
    const [s, e] = windows[Math.max(0, Math.min(windows.length - 1, region))]!;
    const cells = candidateNotes(ctx, s, e, group, false);
    return { sequence: buildSequence(cells, exercise, ctx.root, count), scaleNotes: candidateNotes(ctx, s, e, group, true), fromFret: s, toFret: e, windows };
  }

  const nearest = (h: number, prevFret: number) => {
    let best: ScaleNote | undefined;
    for (const c of all) if (c.midi === h && (!best || Math.abs(c.fret - prevFret) < Math.abs(best.fret - prevFret))) best = c;
    return best;
  };
  const passing = (from: ScaleNote, to: ScaleNote): ScaleNote[] => {
    const lo = Math.min(from.midi, to.midi);
    const hi = Math.max(from.midi, to.midi);
    const heights = [...new Set(all.map((n) => n.midi))].filter((h) => h > lo && h < hi).sort((a, b) => (to.midi > from.midi ? a - b : b - a));
    const out: ScaleNote[] = [];
    let prev = from;
    for (const h of heights) {
      const c = nearest(h, prev.fret);
      if (c) {
        out.push(c);
        prev = c;
      }
    }
    return out;
  };

  // Ordem das posições: 1…n e volta pelo meio.
  const order = [...windows.keys(), ...Array.from({ length: Math.max(0, windows.length - 2) }, (_, i) => windows.length - 2 - i)];
  const sequence: ScaleNote[] = [];
  for (const k of order) {
    const [s, e] = windows[k]!;
    const seq = buildSequence(candidateNotes(ctx, k === 0 ? 0 : s, k === windows.length - 1 ? frets : e, group, false), exercise, ctx.root, count);
    seq.forEach((note, i) => {
      const prev = sequence[sequence.length - 1];
      if (prev && i === 0) {
        if (prev.midi === note.midi) return;
        sequence.push(...passing(prev, note));
      }
      sequence.push(note);
    });
  }
  while (sequence.length > 1 && sequence[sequence.length - 1]!.midi === sequence[0]!.midi) sequence.pop();
  return { sequence, scaleNotes: all, fromFret: 0, toFret: Math.min(frets, 17), windows };
}

/**
 * Dedo sugerido (1–4) para uma nota, a partir das notas da mesma corda na região (ScaleMonster).
 * '0' para corda solta; '' sem contexto.
 */
export function fingerFor(fret: number, string: number, active: readonly FretPos[]): string {
  if (fret === 0) return '0';
  const allFrets = active.filter((p) => p.fret > 0).map((p) => p.fret);
  const onString = active.filter((p) => p.fret > 0 && p.string === string).map((p) => p.fret);
  const uniq = [...new Set(onString)].sort((a, b) => a - b);
  if (uniq.length === 0) return '';
  const minFret = Math.min(...allFrets);
  if (uniq.length === 3) {
    if (fret === uniq[0]) return '1';
    if (fret === uniq[2]) return '4';
    return uniq[1]! - uniq[0]! === 2 && uniq[2]! - uniq[1]! === 1 ? '3' : '2';
  }
  if (uniq.length === 2) {
    const rel = uniq[0]! - minFret;
    const f1 = rel === 0 ? 1 : rel === 1 ? 2 : rel === 2 ? 3 : 1;
    if (fret === uniq[0]) return String(f1);
    if (fret === uniq[1]) return String(Math.min(f1 + (uniq[1]! - uniq[0]!), 4));
  }
  if (uniq.length === 1) return String(Math.min(fret - minFret + 1, 4));
  return String(Math.min(uniq.indexOf(fret) + 1, 4));
}
