import type { BassTuning, FretPos } from '@baixaria/music-theory';

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

/**
 * Banco de escalas: as conhecidas na prática do baixo (pentatônicas, blues, modos gregos, menores
 * harmônica e melódica com seus modos mais usados, bebop, simétricas e exóticas). O `offset` encaixa
 * as janelas das posições: escalas de terça maior como o modo maior (0), de terça menor como o menor
 * natural (3); os modos usam o deslocamento do modo grego de mesma tônica.
 */
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
  'Menor Harmônica': {
    Padrão: { intervals: [0, 2, 3, 5, 7, 8, 11], offset: 3 },
    'Frígio Dominante (5º modo)': { intervals: [0, 1, 4, 5, 7, 8, 10], offset: -4 },
  },
  'Menor Melódica': {
    Padrão: { intervals: [0, 2, 3, 5, 7, 9, 11], offset: 3 },
    'Lídio b7 (Nordestina)': { intervals: [0, 2, 4, 6, 7, 9, 10], offset: -5 },
    'Alterada (Superlócria)': { intervals: [0, 1, 3, 4, 6, 8, 10], offset: 1 },
    'Mixolídio b6': { intervals: [0, 2, 4, 5, 7, 8, 10], offset: -7 },
    'Lócrio #2 (Meio-diminuta)': { intervals: [0, 2, 3, 5, 6, 8, 10], offset: 1 },
    'Lídio Aumentado': { intervals: [0, 2, 4, 6, 8, 9, 11], offset: -5 },
  },
  Bebop: {
    Dominante: { intervals: [0, 2, 4, 5, 7, 9, 10, 11], offset: -7 },
    Maior: { intervals: [0, 2, 4, 5, 7, 8, 9, 11], offset: 0 },
  },
  'Escalas Simétricas': {
    'Diminuta (Tom-Semitom)': { intervals: [0, 2, 3, 5, 6, 8, 9, 11], offset: 0 },
    'Dom Diminuta (Semitom-Tom)': { intervals: [0, 1, 3, 4, 6, 7, 9, 10], offset: 0 },
    'Hexafônica (Tons Inteiros)': { intervals: [0, 2, 4, 6, 8, 10], offset: 0 },
    Cromática: { intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], offset: 0 },
  },
  Exóticas: {
    'Húngara Menor': { intervals: [0, 2, 3, 6, 7, 8, 11], offset: 3 },
    'Dupla Harmônica (Árabe)': { intervals: [0, 1, 4, 5, 7, 8, 11], offset: -4 },
    'Hirajoshi (Japonesa)': { intervals: [0, 2, 3, 7, 8], offset: 3 },
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
 * Grupos de cordas: todas, e blocos de 2, 3, 4… cordas vizinhas (até uma a menos que o total). Os
 * rótulos usam a numeração do músico (corda 1 = a mais aguda), como no ScaleMonster.
 */
export function stringGroups(count: number): StringGroup[] {
  const num = (i: number) => count - i; // índice (0 = grave) → número da corda (1 = aguda)
  const out: StringGroup[] = [{ id: 'all', label: 'Todas', strings: Array.from({ length: count }, (_, i) => i) }];
  for (let size = 2; size < count; size++) {
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

/**
 * Regiões do braço inteiro: as 5 posições e, onde o braço deixa, as mesmas posições uma oitava acima
 * (casa 12 em diante). Em ordem de casa.
 */
export function neckWindows(root: number, offset: number, maxFret: number): Array<[number, number]> {
  const base = positionWindows(root, offset, maxFret);
  const out: Array<[number, number]> = [...base];
  for (const [s, e] of base) {
    if (s + 12 > 0 && e + 12 <= maxFret && !out.some(([x]) => x === s + 12)) out.push([s + 12, e + 12]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

/**
 * Região do braço que o aluno quer usar: casas de `lo` a `hi`. As regiões (janelas de posição) que
 * cabem nela — com uma casa de folga para cada lado — são as usadas; se nenhuma couber, a que mais
 * se sobrepõe a ela.
 */
export type FretRange = readonly [number, number];

export const FRET_RANGES: ReadonlyArray<{ readonly id: string; readonly label: string; readonly range: FretRange | null }> = [
  { id: 'all', label: 'Braço todo', range: null },
  { id: '0-5', label: 'Primeiras casas (0–5)', range: [0, 5] },
  { id: '3-8', label: 'Casas 3–8', range: [3, 8] },
  { id: '5-10', label: 'Casas 5–10', range: [5, 10] },
  { id: '7-12', label: 'Casas 7–12', range: [7, 12] },
  { id: '0-12', label: 'Até a casa 12 (uma oitava)', range: [0, 12] },
  { id: '12-24', label: 'Depois da casa 12 (agudos)', range: [12, 24] },
];

export function windowsInRange(windows: ReadonlyArray<readonly [number, number]>, range: FretRange | null | undefined): number[] {
  const all = windows.map((_, k) => k);
  if (!range) return all;
  const [lo, hi] = range;
  const inside = all.filter((k) => windows[k]![0] >= lo - 1 && windows[k]![1] <= hi + 1);
  if (inside.length) return inside;
  const overlap = (k: number) => Math.min(hi, windows[k]![1]) - Math.max(lo, windows[k]![0]);
  return [all.reduce((a, b) => (overlap(b) > overlap(a) ? b : a), 0)];
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
export function buildScaleExercise(ctx: ScaleContext, exercise: ExerciseId, group: readonly number[], region: number | 'all', range?: FretRange | null): ScaleExercise {
  const frets = ctx.tuning.frets;
  // Regiões selecionáveis: as 5 posições e as da oitava de cima; o percurso contínuo usa as 5.
  const windows = neckWindows(ctx.root, ctx.mode.offset, frets);
  const count = ctx.tuning.strings.length;
  const all = candidateNotes(ctx, 0, frets, group, true);

  if (region !== 'all') {
    const [s, e] = windows[Math.max(0, Math.min(windows.length - 1, region))]!;
    const cells = candidateNotes(ctx, s, e, group, false);
    return { sequence: buildSequence(cells, exercise, ctx.root, count), scaleNotes: candidateNotes(ctx, s, e, group, true), fromFret: s, toFret: e, windows };
  }

  const nearest = (h: number, prevFret: number) => {
    let best: ScaleNote | undefined;
    for (const c of all) if (inRange(c) && c.midi === h && (!best || Math.abs(c.fret - prevFret) < Math.abs(best.fret - prevFret))) best = c;
    return best;
  };
  const passing = (from: ScaleNote, to: ScaleNote): ScaleNote[] => {
    const lo = Math.min(from.midi, to.midi);
    const hi = Math.max(from.midi, to.midi);
    const heights = [...new Set(all.filter(inRange).map((n) => n.midi))].filter((h) => h > lo && h < hi).sort((a, b) => (to.midi > from.midi ? a - b : b - a));
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

  // Ordem das posições: 1…n e volta pelo meio. Com região escolhida, só as posições dentro dela
  // (e o percurso fica entre as casas da região).
  const five = range ? windowsInRange(windows, range).map((k) => windows[k]!) : positionWindows(ctx.root, ctx.mode.offset, frets);
  const lowEdge = range ? Math.max(0, range[0]) : 0;
  const highEdge = range ? Math.min(frets, range[1]) : frets;
  const inRange = (n: ScaleNote) => !range || (n.fret >= Math.min(lowEdge, five[0]![0]) && n.fret <= Math.max(highEdge, five[five.length - 1]![1]));
  const order = [...five.keys(), ...Array.from({ length: Math.max(0, five.length - 2) }, (_, i) => five.length - 2 - i)];
  const sequence: ScaleNote[] = [];
  for (const k of order) {
    const [s, e] = five[k]!;
    const seq = buildSequence(candidateNotes(ctx, k === 0 ? Math.min(lowEdge, s) : s, k === five.length - 1 ? Math.max(highEdge, e) : e, group, false), exercise, ctx.root, count);
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
  if (range) {
    const fs = sequence.map((n) => n.fret);
    const from = Math.max(0, Math.min(...fs));
    const to = Math.max(...fs);
    return { sequence, scaleNotes: all.filter((n) => n.fret >= from && n.fret <= to), fromFret: from, toFret: Math.max(to, from + 4), windows };
  }
  return { sequence, scaleNotes: all, fromFret: 0, toFret: Math.min(frets, 17), windows };
}

/**
 * Percurso pelo braço: o mesmo padrão tocado etapa por etapa, avançando sozinho.
 * - 'positions': no grupo de cordas escolhido, região por região, da pestana ao fim do braço.
 * - 'groups': na região escolhida, grupo por grupo do mesmo tamanho (das cordas graves às agudas).
 * - 'full': em cada região, todos os grupos do tamanho escolhido (indo e voltando pelas cordas).
 * Cada etapa toca `repeats` vezes. A sequência inteira é um ciclo; `stages` diz onde cada etapa começa.
 */
export type TourKind = 'off' | 'positions' | 'groups' | 'full';

export const TOUR_KINDS: ReadonlyArray<{ readonly id: TourKind; readonly label: string }> = [
  { id: 'off', label: 'Fixo (uma região)' },
  { id: 'positions', label: 'Avançar pelas regiões' },
  { id: 'groups', label: 'Avançar pelos grupos de cordas' },
  { id: 'full', label: 'Regiões × grupos (braço todo)' },
];

export interface TourStage {
  /** Índice, na sequência, da primeira nota da etapa; `to` é exclusivo. */
  readonly from: number;
  readonly to: number;
  readonly region: number;
  readonly window: readonly [number, number];
  readonly group: StringGroup;
  /** Notas da escala na etapa (para o braço). */
  readonly scaleNotes: ScaleNote[];
}

export interface NeckTour extends ScaleExercise {
  readonly stages: TourStage[];
}

/** Grupos de cordas do mesmo tamanho, das cordas graves para as agudas. */
export function groupsOfSize(count: number, size: number): StringGroup[] {
  return stringGroups(count)
    .filter((g) => g.strings.length === size)
    .sort((a, b) => a.strings[0]! - b.strings[0]!);
}

export function buildNeckTour(
  ctx: ScaleContext,
  exercise: ExerciseId,
  kind: Exclude<TourKind, 'off'>,
  group: StringGroup,
  region: number,
  repeats = 1,
  range?: FretRange | null,
): NeckTour {
  const frets = ctx.tuning.frets;
  const windows = neckWindows(ctx.root, ctx.mode.offset, frets);
  // Só as regiões dentro da parte do braço escolhida.
  const allowed = windowsInRange(windows, range);
  const count = ctx.tuning.strings.length;
  const sameSize = groupsOfSize(count, group.strings.length);
  const sizeGroups = sameSize.length ? sameSize : [group];
  const plan: Array<{ region: number; group: StringGroup }> = [];
  const reg = Math.max(0, Math.min(windows.length - 1, region));
  if (kind === 'positions') allowed.forEach((k) => plan.push({ region: k, group }));
  else if (kind === 'groups') sizeGroups.forEach((g) => plan.push({ region: reg, group: g }));
  else
    allowed.forEach((k, j) => {
      const gs = j % 2 === 0 ? sizeGroups : [...sizeGroups].reverse();
      gs.forEach((g) => plan.push({ region: k, group: g }));
    });
  const sequence: ScaleNote[] = [];
  const stages: TourStage[] = [];
  for (const st of plan) {
    const ex = buildScaleExercise(ctx, exercise, st.group.strings, st.region);
    if (ex.sequence.length < 2) continue;
    const from = sequence.length;
    for (let r = 0; r < Math.max(1, repeats); r++) sequence.push(...ex.sequence);
    stages.push({ from, to: sequence.length, region: st.region, window: windows[st.region]!, group: st.group, scaleNotes: ex.scaleNotes });
  }
  // O braço mostra só a parte usada pelo percurso.
  const used = (stages.length ? stages.map((st) => st.window) : allowed.map((k) => windows[k]!)) as ReadonlyArray<readonly [number, number]>;
  const minStart = Math.min(...used.map(([a]) => a));
  const maxEnd = Math.max(...used.map(([, e]) => e));
  return {
    sequence,
    scaleNotes: candidateNotes(ctx, minStart, maxEnd, stringGroups(count)[0]!.strings, true),
    fromFret: minStart,
    toFret: Math.min(frets, maxEnd),
    windows,
    stages,
  };
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
