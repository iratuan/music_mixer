import { describe, expect, it } from 'vitest';
import { createExercisePack, encodeExercisePack, parseExchange, songToExercise, validateExercise, type Exercise, type PackSong } from '@baixaria/exchange-contract';
import { LIBRARY_MAX, addToLibrary, exerciseToSong, loadLibrary } from '../src/features/songs/exerciseLibrary.js';

const SONG: PackSong = {
  title: 'Música',
  source: 'Gravação',
  key: 'Lá menor',
  bpm: 96,
  bars: [
    { chords: ['Am'], notes: [{ midi: 45, beat: 0, len: 1 }, { midi: 48, beat: 2, len: 1 }] },
    { chords: ['F'], notes: [{ midi: 41, beat: 3, len: 2 }] },
  ],
  sections: [],
};
const EX: Exercise = songToExercise(SONG, { title: 'Trecho', level: 1, fromBar: 0, toBar: 1 });

describe('exerciseToSong (exercício → formato de treino)', () => {
  it('põe cada nota no compasso e no tempo certos e corta a duração no fim do compasso', () => {
    const song = exerciseToSong(EX);
    // A última nota começa no tempo 7 e termina no 9: o exercício vai até o terceiro compasso.
    expect(song.bars).toHaveLength(3);
    expect(song.bars[2]!.notes).toEqual([]);
    expect(song.bars[0]!.notes).toEqual([
      { midi: 45, beat: 0, len: 1 },
      { midi: 48, beat: 2, len: 1 },
    ]);
    // Início no tempo 7 (compasso 2, tempo 3), duração 2: corta em 1 para não passar do compasso.
    expect(song.bars[1]!.notes).toEqual([{ midi: 41, beat: 3, len: 1 }]);
    expect(song.bpm).toBe(96);
    expect(song.key).toBe('Lá menor');
    expect(song.source).toBe('Exercício · Música');
  });

  it('um exercício sem notas no fim ainda gera pelo menos um compasso', () => {
    const song = exerciseToSong({ ...EX, steps: [{ midi: 28, start: 0, len: 0.25 }] });
    expect(song.bars).toHaveLength(1);
  });
});

describe('biblioteca', () => {
  it('põe o novo no topo e não passa do limite', () => {
    let items = [] as ReturnType<typeof addToLibrary>;
    for (let i = 0; i < LIBRARY_MAX + 5; i++) items = addToLibrary(items, { ...EX, title: `E${i}` });
    expect(items).toHaveLength(LIBRARY_MAX);
    expect(items[0]!.exercise.title).toBe(`E${LIBRARY_MAX + 4}`);
  });

  it('sem armazenamento disponível (ambiente de teste), começa vazia sem lançar', () => {
    expect(loadLibrary()).toEqual([]);
  });
});

describe('pacote de exercício lido pelo ScaleMonster', () => {
  it('um pacote gerado passa na leitura e na validação', () => {
    const bytes = encodeExercisePack(createExercisePack(EX, { name: 'MixerMonster', version: '0.5.0-beta.3' }));
    const r = parseExchange(bytes);
    expect(r.ok && r.kind).toBe('exercise');
    expect(validateExercise(EX).ok).toBe(true);
  });
});
