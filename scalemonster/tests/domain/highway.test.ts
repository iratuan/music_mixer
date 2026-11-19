import { describe, expect, it } from 'vitest';
import { FofHighwayEngine, baseMultiplier, exerciseToFofChart, fofHitWindow, isHopo, parseSongIni, sustainFor, type FofNoteEvent } from '../../src/domain/index.js';

const note = (id: number, time: number, lane = 0, extra: Partial<FofNoteEvent> = {}): FofNoteEvent => ({ id, time, lane, fret: 3, midi: 31 + lane * 5, hopo: false, sustain: 0, bpm: 120, ...extra });

describe('pista de notas: conversão do exercício', () => {
  it('marca ligado só em nota rápida na mesma corda e outra casa', () => {
    expect(isHopo({ string: 1, fret: 3, midi: 36 }, { string: 1, fret: 5, midi: 38 }, 0.125, 0.5)).toBe(true);
    expect(isHopo({ string: 1, fret: 3, midi: 36 }, { string: 2, fret: 0, midi: 38 }, 0.125, 0.5)).toBe(false);
    expect(isHopo({ string: 1, fret: 3, midi: 36 }, { string: 1, fret: 5, midi: 38 }, 0.5, 0.5)).toBe(false);
    expect(isHopo(null, { string: 1, fret: 5, midi: 38 }, 0.1, 0.5)).toBe(false);
  });
  it('gera notas no andamento e na subdivisão, com caudas só nas lentas', () => {
    const seq = [
      { string: 0, fret: 3, midi: 31 },
      { string: 0, fret: 5, midi: 33 },
      { string: 1, fret: 2, midi: 35 },
    ];
    const ch = exerciseToFofChart(seq, { bpm: 120, subdivision: 4, cycles: 2, lanes: 4 });
    expect(ch.notes).toHaveLength(6);
    expect(ch.notes[1]!.time).toBeCloseTo(0.125);
    expect(ch.notes[1]!.hopo).toBe(true);
    expect(ch.notes[2]!.hopo).toBe(false);
    expect(ch.notes.every((n) => n.sustain === 0)).toBe(true);
    expect(exerciseToFofChart(seq, { bpm: 60, lanes: 4 }).notes[0]!.sustain).toBeCloseTo(0.7);
    expect(sustainFor(0.3)).toBe(0);
  });
  it('lê song.ini', () => {
    const ini = parseSongIni('[song]\nname = Treino\nartist = Eu\ndelay = 120\ndiff_bass = 3');
    expect(ini.name).toBe('Treino');
    expect(ini.delay).toBe(120);
    expect(ini.diffBass).toBe(3);
  });
  it('janela de acerto entre 70 e 120 ms', () => {
    expect(fofHitWindow(60)).toBeCloseTo(0.12);
    expect(fofHitWindow(300)).toBeCloseTo(0.07);
  });
});

describe('pista de notas: juiz', () => {
  it('multiplicador sobe a cada 10 acertos e para em 4x', () => {
    expect([0, 9, 10, 19, 20, 30, 80].map(baseMultiplier)).toEqual([1, 1, 2, 2, 3, 4, 4]);
  });
  it('pontua 50 × multiplicador e o erro zera a sequência', () => {
    const e = new FofHighwayEngine();
    for (let i = 0; i < 12; i++) e.add(note(i, i * 0.5));
    for (let i = 0; i < 11; i++) expect(e.strike(0, i * 0.5 + 0.01)).toBe(true);
    // 10 × 50 (1x) + 1 × 100 (2x).
    expect(e.stats.score).toBe(600);
    expect(e.stats.streak).toBe(11);
    e.update(5.6 + 0.2);
    expect(e.stats.misses).toBe(1);
    expect(e.stats.streak).toBe(0);
    expect(e.stats.maxStreak).toBe(11);
    expect(e.accuracy()).toBe(92);
  });
  it('palhetada fora de hora quebra a sequência; trilha errada não acerta', () => {
    const e = new FofHighwayEngine();
    e.add(note(0, 1));
    e.strike(0, 1);
    expect(e.strike(1, 1.5)).toBe(false);
    expect(e.stats.streak).toBe(0);
    expect(e.stats.overstrums).toBe(1);
  });
  it('ligado vale só com a casa quando a anterior foi acertada', () => {
    const e = new FofHighwayEngine();
    e.add(note(0, 1));
    e.add(note(1, 1.1, 0, { hopo: true }));
    expect(e.tap(0, 1.1)).toBe(false); // sem sequência
    e.strike(0, 1);
    expect(e.tap(0, 1.1)).toBe(true);
    expect(e.stats.hopoHits).toBe(1);
    expect(e.stats.hopoTotal).toBe(1);
  });
  it('MIDI: mesma nota acerta, outra oitava vale meio', () => {
    const e = new FofHighwayEngine();
    e.add(note(0, 1, 0, { midi: 40 }));
    e.add(note(1, 2, 0, { midi: 40 }));
    expect(e.midiOn(40, 1.02)).toBe(true);
    expect(e.midiOn(52, 2)).toBe(true);
    expect(e.stats.octave).toBe(1);
    expect(e.accuracy()).toBe(75);
  });
  it('energia cheia dobra o multiplicador e se gasta', () => {
    const e = new FofHighwayEngine({ window: 0.1 });
    for (let i = 0; i < 26; i++) e.add(note(i, i * 0.2));
    for (let i = 0; i < 25; i++) e.strike(0, i * 0.2);
    expect(e.stats.overdrive).toBe(true);
    expect(e.multiplier()).toBe(6); // 3x × 2
    e.update(0);
    for (let t = 0.2; t <= 11; t += 0.2) e.update(t);
    expect(e.stats.overdrive).toBe(false);
  });
  it('cauda sustentada soma pontos enquanto segura', () => {
    const e = new FofHighwayEngine({ autoMiss: false });
    e.add(note(0, 0, 0, { sustain: 1, bpm: 60 }));
    e.strike(0, 0);
    const base = e.stats.score;
    e.update(0);
    for (let t = 0.1; t <= 1.0001; t += 0.1) e.update(t, () => true);
    expect(e.stats.score - base).toBeGreaterThanOrEqual(20);
    expect(e.stats.score - base).toBeLessThanOrEqual(30);
  });
  it('áudio: o veredito chega pelo id e não há erro automático', () => {
    const e = new FofHighwayEngine({ autoMiss: false });
    e.add(note(7, 1));
    e.update(3);
    expect(e.stats.misses).toBe(0);
    e.verdict(7, 'hit', 1.05);
    expect(e.stats.hits).toBe(1);
  });
});
