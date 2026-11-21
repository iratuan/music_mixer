import { describe, expect, it } from 'vitest';
import { createExercisePack, createPack, encodeExercisePack, encodePack, parseExchange, parsePack, songToExercise, validateExercise, type PackSong } from '../src/index.js';

const EX = {
  title: 'Escala de Lá',
  description: 'Quatro notas na corda lá',
  level: 2,
  instrument: 'bass',
  tuning: [28, 33, 38, 43],
  key: 'Lá menor',
  bpm: 90,
  origin: { type: 'authored', source: 'Teste' },
  steps: [
    { midi: 33, start: 0, len: 1 },
    { midi: 36, start: 1, len: 1, string: 1, fret: 3 },
    { midi: 38, start: 2, len: 0.5 },
    { midi: 40, start: 2.5, len: 1.5, string: 2, fret: 2 },
  ],
};
const clone = (patch: Record<string, unknown> = {}, steps?: unknown[]) => ({ ...EX, ...patch, ...(steps ? { steps } : {}) });
const SONG: PackSong = {
  title: 'Música',
  source: 'Gravação',
  key: 'Lá menor',
  bpm: 96,
  bars: [
    { chords: ['Am'], notes: [{ midi: 45, beat: 0, len: 1 }, { midi: 48, beat: 2, len: 1 }] },
    { chords: ['F'], notes: [{ midi: 41, beat: 0, len: 2 }] },
    { chords: ['G'], notes: [{ midi: 43, beat: 1, len: 1 }] },
  ],
  sections: [],
};

describe('validateExercise', () => {
  it('aceita um exercício correto e devolve os dados', () => {
    const r = validateExercise(EX);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.exercise.steps).toHaveLength(4);
  });

  it('lista todos os problemas, não só o primeiro', () => {
    const r = validateExercise(clone({ level: 9, bpm: 999, instrument: 'guitar' }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const paths = r.issues.map((i) => i.path);
      expect(paths).toEqual(expect.arrayContaining(['level', 'bpm', 'instrument']));
    }
  });

  it('confere corda e casa: a nota tem de bater', () => {
    const r = validateExercise(clone({}, [{ midi: 40, start: 0, len: 1, string: 1, fret: 3 }]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]!.message).toMatch(/não bate/);
  });

  it('deriva a casa quando só a corda é dada', () => {
    const r = validateExercise(clone({}, [{ midi: 36, start: 0, len: 1, string: 1 }]));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.exercise.steps[0]).toMatchObject({ string: 1, fret: 3 });
  });

  it('recusa casa sem corda', () => {
    const r = validateExercise(clone({}, [{ midi: 36, start: 0, len: 1, fret: 3 }]));
    expect(r.ok).toBe(false);
  });

  it('exige início e duração em passos de 0,25', () => {
    const r = validateExercise(clone({}, [{ midi: 36, start: 0.1, len: 1 }]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]!.path).toBe('steps[0].start');
  });

  it('recusa nota que passa do fim do exercício', () => {
    const r = validateExercise(clone({}, [{ midi: 36, start: 511, len: 4 }]));
    expect(r.ok).toBe(false);
  });

  it('recusa notas fora de ordem de início', () => {
    const r = validateExercise(clone({}, [{ midi: 36, start: 2, len: 1 }, { midi: 38, start: 1, len: 1 }]));
    expect(r.ok).toBe(false);
  });

  it('recusa afinação fora de ordem ou com corda repetida', () => {
    expect(validateExercise(clone({ tuning: [33, 28, 38, 43] })).ok).toBe(false);
    expect(validateExercise(clone({ tuning: [28, 28, 38, 43] })).ok).toBe(false);
  });

  it('troca caractere de controle por espaço e recusa título vazio', () => {
    expect(validateExercise(clone({ title: '   ' })).ok).toBe(false);
    const r = validateExercise(clone({ title: 'Oi\u0007 mundo' }));
    expect(r.ok && r.exercise.title).toBe('Oi  mundo');
  });

  it('não aceita objeto que não é exercício', () => {
    expect(validateExercise(null).ok).toBe(false);
    expect(validateExercise([]).ok).toBe(false);
  });
});

describe('songToExercise (protocolo: música → exercício)', () => {
  it('gera um exercício válido a partir de um trecho', () => {
    const ex = songToExercise(SONG, { title: 'Trecho', level: 1, fromBar: 0, toBar: 1 });
    expect(validateExercise(ex).ok).toBe(true);
    expect(ex.origin).toEqual({ type: 'mixer', source: 'Música' });
    expect(ex.steps.map((s) => s.start)).toEqual([0, 2, 4]);
    expect(ex.bpm).toBe(96);
  });

  it('recusa trecho fora da música', () => {
    expect(() => songToExercise(SONG, { title: 'x', level: 1, fromBar: 0, toBar: 9 })).toThrow(/trecho/);
    expect(() => songToExercise(SONG, { title: 'x', level: 1, fromBar: 2, toBar: 1 })).toThrow(/trecho/);
  });
});

describe('envelope e leitura', () => {
  it('pacote de exercício vai e volta por parseExchange', () => {
    const pack = createExercisePack(EX, { name: 'MixerMonster', version: '1.0.0' }, new Date('2026-11-19T10:00:00Z'));
    const r = parseExchange(encodeExercisePack(pack));
    expect(r.ok).toBe(true);
    if (r.ok && r.kind === 'exercise') expect(r.pack.exercise.title).toBe('Escala de Lá');
    else throw new Error('esperava exercício');
  });

  it('pacote de música continua sendo música no parseExchange', () => {
    const r = parseExchange(encodePack(createPack(SONG, { name: 'MixerMonster', version: '1.0.0' })));
    expect(r.ok && r.kind).toBe('song');
  });

  it('parsePack recusa exercício (quem só lê música não o confunde)', () => {
    const r = parsePack(JSON.stringify(createExercisePack(EX, { name: 'x', version: '1' })));
    expect(r.ok).toBe(false);
  });

  it('exercício inválido devolve os problemas', () => {
    const bad = { ...createExercisePack(EX, { name: 'x', version: '1' }), exercise: clone({ bpm: 0 }) };
    const r = parseExchange(JSON.stringify(bad));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues?.[0]?.path).toBe('bpm');
  });

  it('versão nova, tipo desconhecido e lixo são recusados sem lançar', () => {
    expect(parseExchange(JSON.stringify({ format: 'mcraft-pack', version: 2, kind: 'exercise' })).ok).toBe(false);
    expect(parseExchange(JSON.stringify({ format: 'mcraft-pack', version: 1, kind: 'quiz' })).ok).toBe(false);
    expect(parseExchange('não é json').ok).toBe(false);
  });
});
