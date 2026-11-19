import { readStore, writeStore } from '@baixaria/ui-core';
import { validateExercise, type Exercise, type PackSong } from '@baixaria/exchange-contract';

/**
 * Biblioteca de exercícios importados (pacotes `kind: "exercise"`).
 * Guardada no navegador, por aparelho. Cada item é validado de novo ao ser lido, porque o
 * armazenamento local pode ter sido alterado por fora.
 */
export const LIBRARY_KEY = 'bf-exercise-library';
export const LIBRARY_MAX = 50;

export interface LibraryItem {
  readonly id: string;
  readonly addedAt: string;
  readonly exercise: Exercise;
}

export function loadLibrary(): LibraryItem[] {
  const raw = readStore<unknown>(LIBRARY_KEY, []);
  if (!Array.isArray(raw)) return [];
  const out: LibraryItem[] = [];
  for (const item of raw.slice(0, LIBRARY_MAX)) {
    if (typeof item !== 'object' || item === null) continue;
    const { id, addedAt, exercise } = item as Record<string, unknown>;
    const v = validateExercise(exercise);
    if (typeof id === 'string' && typeof addedAt === 'string' && v.ok) out.push({ id, addedAt, exercise: v.exercise });
  }
  return out;
}

export function saveLibrary(items: readonly LibraryItem[]): void {
  writeStore(LIBRARY_KEY, items);
}

/** Põe o exercício no topo da biblioteca; passando do limite, sai o mais antigo. */
export function addToLibrary(items: readonly LibraryItem[], exercise: Exercise, now = new Date()): LibraryItem[] {
  const item: LibraryItem = { id: `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, addedAt: now.toISOString(), exercise };
  return [item, ...items].slice(0, LIBRARY_MAX);
}

/**
 * Converte um exercício no formato de música que o treino já toca: compassos de 4 tempos,
 * notas com tempo dentro do compasso. Sem acordes (o exercício não os traz).
 */
export function exerciseToSong(ex: Exercise): PackSong {
  const end = Math.max(1, ...ex.steps.map((s) => s.start + s.len));
  const bars = Array.from({ length: Math.max(1, Math.ceil(end / 4)) }, () => ({ chords: [] as string[], notes: [] as Array<{ midi: number; beat: number; len: number }> }));
  for (const s of ex.steps) {
    const bar = Math.floor(s.start / 4);
    const beat = s.start - bar * 4;
    bars[bar]!.notes.push({ midi: s.midi, beat, len: Math.min(s.len, 4 - beat) });
  }
  return {
    title: ex.title,
    source: ex.origin.source ? `Exercício · ${ex.origin.source}` : 'Exercício',
    key: ex.key,
    bpm: ex.bpm,
    bars,
    sections: [],
  };
}
