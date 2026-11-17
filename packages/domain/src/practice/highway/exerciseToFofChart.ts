/**
 * Converte os exercícios do app (escalas, arpejos, progressões) em notas da pista, no andamento e
 * na subdivisão escolhidos, marcando os ligados (HOPO) e as notas sustentadas.
 */
import type { FofChart, FofNoteEvent } from './fofChartTypes.js';

export interface ExerciseNoteLike {
  readonly string: number;
  readonly fret: number;
  readonly midi: number;
}

/** Notas por tempo: semínima 1, colcheia 2, tercina 3, semicolcheia 4. */
export type Subdivision = 1 | 2 | 3 | 4;

export const SUBDIVISIONS: ReadonlyArray<{ readonly id: Subdivision; readonly label: string }> = [
  { id: 1, label: 'Semínimas' },
  { id: 2, label: 'Colcheias' },
  { id: 3, label: 'Tercinas' },
  { id: 4, label: 'Semicolcheias' },
];

/**
 * Ligado (HOPO): nota rápida (até meio tempo depois da anterior) na MESMA corda e em outra casa —
 * dá para fazer com a mão esquerda, sem atacar a corda de novo. A primeira nota nunca é ligada.
 */
export function isHopo(prev: ExerciseNoteLike | null, cur: ExerciseNoteLike, gapSec: number, beatSec: number): boolean {
  if (!prev) return false;
  return gapSec <= beatSec / 2 + 1e-6 && prev.string === cur.string && prev.fret !== cur.fret && prev.midi !== cur.midi;
}

/** Cauda: só em notas longas (de 0,6 s para cima), com 70% da duração. */
export function sustainFor(stepSec: number): number {
  return stepSec >= 0.6 ? stepSec * 0.7 : 0;
}

/** Uma nota da pista (usada pelo agendador ao vivo, que muda o andamento entre ciclos). */
export function chartNote(id: number, n: ExerciseNoteLike, prev: ExerciseNoteLike | null, time: number, bpm: number, subdivision: Subdivision): FofNoteEvent {
  const beat = 60 / bpm;
  const step = beat / subdivision;
  return { id, time, lane: n.string, fret: n.fret, midi: n.midi, hopo: isHopo(prev, n, step, beat), sustain: sustainFor(step), bpm };
}

/** Pista completa de `cycles` ciclos do exercício, começando em `startSec`, com andamento fixo. */
export function exerciseToFofChart(
  sequence: readonly ExerciseNoteLike[],
  opts: { bpm: number; subdivision?: Subdivision; cycles?: number; startSec?: number; lanes: number; name?: string },
): FofChart {
  const sub = opts.subdivision ?? 1;
  const step = 60 / opts.bpm / sub;
  const cycles = Math.max(1, opts.cycles ?? 1);
  const notes: FofNoteEvent[] = [];
  let prev: ExerciseNoteLike | null = null;
  let t = opts.startSec ?? 0;
  for (let c = 0; c < cycles; c++) {
    sequence.forEach((n, i) => {
      // Na volta do ciclo, a nota anterior é a última do ciclo (o ligado pode atravessar).
      notes.push(chartNote(i + c * sequence.length, n, notes.length ? prev : null, t, opts.bpm, sub));
      prev = n;
      t += step;
    });
  }
  return { meta: { name: opts.name ?? 'Exercício', delay: 0 }, lanes: opts.lanes, notes };
}
