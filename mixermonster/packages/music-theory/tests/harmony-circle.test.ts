import { describe, expect, it } from 'vitest';
import {
  CADENCES,
  CIRCLE,
  analyzeChord,
  bassApproach,
  cadenceChords,
  chordCandidates,
  chordSymbol,
  circleIndex,
  circleSlotOf,
  detectKey,
  harmonicField,
  parseChord,
  parseChordText,
  scaleFor,
  signatureText,
  targetNotes,
} from '../src/index.js';

const C = { tonic: 0, mode: 'major' } as const;
const Am = { tonic: 9, mode: 'minor' } as const;

describe('ciclo das quintas', () => {
  it('12 posições em quintas, relativas menores e diminutos da sensível', () => {
    expect(CIRCLE.map((s) => s.major.root)).toEqual([0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5]);
    expect(CIRCLE[0]!.minor.name).toBe('Am');
    expect(CIRCLE[0]!.dim.name).toBe('B°');
    expect(CIRCLE[2]!.signature).toBe(2);
    expect(CIRCLE[10]!.signature).toBe(-2);
    expect(signatureText(-3)).toBe('3 bemóis (B♭ E♭ A♭)');
    expect(circleIndex(Am)).toBe(0);
  });
  it('campo harmônico maior e menor, com funções', () => {
    expect(harmonicField(C).map((f) => chordSymbol(f.chord))).toEqual(['C', 'Dm', 'Em', 'F', 'G', 'Am', 'B°']);
    expect(harmonicField(C, true).map((f) => f.degree)).toEqual(['Imaj7', 'ii7', 'iii7', 'IVmaj7', 'V7', 'vi7', 'viiø7']);
    expect(harmonicField(Am).map((f) => chordSymbol(f.chord))).toEqual(['Am', 'B°', 'C', 'Dm', 'Em', 'F', 'G']);
    expect(harmonicField(C)[4]!.fn).toBe('Dominante');
  });
  it('cadências transpostas: I–V–vi–IV em G e Andaluza em Am com V maior', () => {
    const pop = CADENCES.find((c) => c.id === 'pop')!;
    expect(cadenceChords(pop, { tonic: 7, mode: 'major' }).map((f) => chordSymbol(f.chord))).toEqual(['G', 'D', 'Em', 'C']);
    const and = CADENCES.find((c) => c.id === 'andalusian')!;
    expect(cadenceChords(and, Am).map((f) => chordSymbol(f.chord))).toEqual(['Am', 'G', 'F', 'E']);
  });
  it('fatia do ciclo de cada acorde', () => {
    expect(circleSlotOf({ root: 2, quality: 'm7' })).toEqual({ ring: 'minor', index: 11 }); // Dm: relativa de F
    expect(circleSlotOf({ root: 7, quality: '7' })).toEqual({ ring: 'major', index: 1 });
    expect(circleSlotOf({ root: 11, quality: 'm7b5' })).toEqual({ ring: 'dim', index: 0 });
  });
});

describe('análise funcional', () => {
  it('graus, empréstimo modal e dominante secundário', () => {
    expect(analyzeChord({ root: 2, quality: 'm7' }, C)).toMatchObject({ roman: 'ii7', kind: 'diatonic', fn: 'Subdominante' });
    expect(analyzeChord({ root: 7, quality: '7' }, C)).toMatchObject({ roman: 'V7', fn: 'Dominante' });
    expect(analyzeChord({ root: 10, quality: '' }, C)).toMatchObject({ roman: '♭VII', kind: 'borrowed' });
    expect(analyzeChord({ root: 5, quality: 'm' }, C)).toMatchObject({ roman: 'iv', kind: 'borrowed' });
    expect(analyzeChord({ root: 4, quality: '7' }, C)).toMatchObject({ roman: 'V7/vi', kind: 'secondary' });
    expect(analyzeChord({ root: 4, quality: '' }, Am)).toMatchObject({ kind: 'diatonic', fn: 'Dominante' });
  });
  it('notas-alvo: fundamental, terça e sétima', () => {
    expect(targetNotes({ root: 7, quality: '7' })).toMatchObject({ root: 'G', third: 'B', seventh: 'F' });
    expect(targetNotes({ root: 9, quality: 'm' }).seventh).toBeNull();
  });
  it('condução do baixo: V → I por meio tom abaixo; passo diatônico', () => {
    expect(bassApproach({ root: 7, quality: '7' }, { root: 0, quality: '' }, C)).toMatchObject({ note: 'B', kind: 'cromática ascendente' });
    expect(bassApproach({ root: 0, quality: '' }, { root: 4, quality: 'm' }, C).kind).toBe('diatônica');
  });
  it('escala por acorde no contexto do tom', () => {
    expect(scaleFor({ root: 2, quality: 'm7' }, C)).toBe('Dórico');
    expect(scaleFor({ root: 5, quality: 'maj7' }, C)).toBe('Lídio');
    expect(scaleFor({ root: 7, quality: '7' }, C)).toBe('Mixolídio');
  });
  it('leituras alternativas: Am7 ↔ C6', () => {
    expect(chordCandidates({ root: 9, quality: 'm7' }).map((c) => chordSymbol(c))).toContain('C6');
  });
  it('tonalidade pelos acordes', () => {
    expect(detectKey([{ chord: { root: 0, quality: '' }, beats: 4 }, { chord: { root: 5, quality: '' }, beats: 4 }, { chord: { root: 7, quality: '7' }, beats: 4 }, { chord: { root: 0, quality: '' }, beats: 4 }])).toEqual(C);
    expect(detectKey([{ chord: { root: 9, quality: 'm' }, beats: 8 }, { chord: { root: 2, quality: 'm' }, beats: 4 }, { chord: { root: 4, quality: '7' }, beats: 4 }, { chord: { root: 9, quality: 'm' }, beats: 8 }])).toEqual(Am);
  });
});

describe('cifra em texto', () => {
  it('lê cifras com sétimas, bemóis e baixo invertido', () => {
    expect(parseChord('F#m7(b5)')).toEqual({ root: 6, quality: 'm7b5' });
    expect(parseChord('Bb7M')).toEqual({ root: 10, quality: 'maj7' });
    expect(parseChord('C/E')).toEqual({ root: 0, quality: '', bass: 4 });
    expect(parseChord('Xyz')).toBeNull();
  });
  it('compassos com divisão de tempos e repetição', () => {
    const bars = parseChordText('| C / G / | Am | % | Dm7 G7 |');
    expect(bars).toHaveLength(4);
    expect(bars[0]!.chords.map((c) => [c.beat, c.beats])).toEqual([
      [0, 2],
      [2, 2],
    ]);
    expect(bars[2]).toEqual(bars[1]);
    expect(bars[3]!.chords.map((c) => c.beats)).toEqual([2, 2]);
  });
});

describe('mapa harmônico', () => {
  it('do texto ao mapa: tom detectado, seções, análise e transposição', async () => {
    const { mapFromBars, analyzeMap, transposeMap, mapText, splitMeasure, replaceChord, semitonesBetween } = await import('../src/index.js');
    const bars = parseChordText('| C | Am | Dm7 | G7 |\n| C | Am | Dm7 | G7 |\n| F | G | Em | Am |\n| Dm7 / G7 / | C |');
    const map = mapFromBars('Teste', bars, { bpm: 100 });
    expect(map.key).toEqual(C);
    expect(map.sections[0]!.to).toBe(7); // duas frases iguais viram uma parte
    const ins = analyzeMap(map);
    expect(ins[2]![0]!.roman).toBe('ii7');
    expect(ins[3]![0]!.resolves).toBe('dominante');
    expect(ins[3]![0]!.approach!.note).toBe('B');
    const up = transposeMap(map, 2);
    expect(chordSymbol(up.measures[3]!.chords[0]!.chord)).toBe('A7');
    expect(analyzeMap(up)[3]![0]!.roman).toBe('V7');
    expect(mapText(map, { degrees: true })).toContain('| Dm7 (ii7) / G7 (V7) / |');
    expect(splitMeasure(map, 0).measures[0]!.chords).toHaveLength(2);
    expect(chordSymbol(replaceChord(map, 0, 0, { root: 9, quality: 'm7' }).measures[0]!.chords[0]!.chord)).toBe('Am7');
    expect(semitonesBetween(C, { tonic: 10, mode: 'major' })).toBe(-2);
  });
});
