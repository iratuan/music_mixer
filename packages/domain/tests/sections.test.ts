import { describe, expect, it } from 'vitest';
import { barEnergy, detectSections, normalizeSections, sectionSpans, songMapText, type BarHarmony } from '../src/index.js';

const C = (root: number, quality = '') => ({ chord: { root, quality }, beats: 4 });
const bar = (...ch: Array<ReturnType<typeof C>>): BarHarmony => ({ chords: ch });
const phrase = (...roots: number[]) => roots.map((r) => bar(C(r)));

describe('mapa: seções', () => {
  it('intro, parte, refrão, parte, refrão, ponte, refrão, outro', () => {
    const intro = phrase(0, 0, 0, 0);
    const verse = phrase(9, 5, 0, 7);
    const chorus = phrase(5, 7, 0, 0);
    const bridge = phrase(2, 4, 2, 4);
    const outro = phrase(0, 7, 0, 7);
    const bars = [...intro, ...verse, ...verse, ...chorus, ...verse, ...chorus, ...bridge, ...chorus, ...chorus, ...outro];
    const s = detectSections(bars);
    expect(s.map((x) => `${x.startBar}:${x.name}`)).toEqual(['0:Intro', '4:Parte 1', '12:Refrão', '16:Parte 1', '20:Refrão', '24:Ponte', '28:Refrão', '36:Outro']);
  });

  it('intro de 2 compassos não desalinha as frases', () => {
    const verse = phrase(9, 5, 0, 7);
    const chorus = phrase(5, 7, 0, 4);
    const s = detectSections([...phrase(0, 0), ...verse, ...chorus, ...verse, ...chorus]);
    expect(s.map((x) => `${x.startBar}:${x.name}`)).toEqual(['0:Intro', '2:Parte 1', '6:Refrão', '10:Parte 1', '14:Refrão']);
  });

  it('aceita uma diferença em 4 compassos (variação da mesma parte)', () => {
    const a = phrase(9, 5, 0, 7);
    const a2 = phrase(9, 5, 0, 2);
    const b = phrase(5, 7, 4, 4);
    const s = detectSections([...a, ...b, ...a2, ...b]);
    expect(s.map((x) => x.name)).toEqual(['Parte 1', 'Refrão', 'Parte 1', 'Refrão']);
  });

  it('com energia das faixas: sem voz vira Intro/Solo/Outro e o refrão é a parte cantada mais forte', () => {
    const A = phrase(9, 5, 0, 7);
    const B = phrase(5, 7, 0, 0);
    const I = phrase(0, 0, 0, 0);
    const bars = [...I, ...A, ...B, ...A, ...B, ...I, ...B, ...I];
    const e = (vocal: number, total: number) => Array.from({ length: 4 }, () => ({ vocal, total }));
    const energy = [...e(0, 0.4), ...e(0.8, 0.5), ...e(0.9, 0.9), ...e(0.8, 0.5), ...e(0.9, 0.9), ...e(0.05, 0.95), ...e(0.9, 0.9), ...e(0, 0.3)];
    const s = detectSections(bars, energy);
    expect(s.map((x) => `${x.startBar}:${x.name}`)).toEqual(['0:Intro', '4:Parte 1', '8:Refrão', '12:Parte 1', '16:Refrão', '20:Solo', '24:Refrão', '28:Outro']);
  });

  it('energia por compasso normalizada (percentil 95)', () => {
    const rate = 100;
    const samples = new Float32Array(400);
    for (let i = 0; i < 400; i++) samples[i] = i < 200 ? 0.1 * Math.sin(i) : 0.5 * Math.sin(i);
    const e = barEnergy([{ start: 0, end: 2 }, { start: 2, end: 4 }], samples, rate);
    expect(e[1]).toBeCloseTo(1, 1);
    expect(e[0]!).toBeLessThan(0.3);
  });

  it('normaliza edições: ordena, tira repetidos e começa no compasso 1', () => {
    const s = normalizeSections(
      [
        { startBar: 8, name: 'Refrão' },
        { startBar: 4, name: '  Parte 1 ' },
        { startBar: 8, name: 'dup' },
        { startBar: 99, name: 'fora' },
      ],
      20,
    );
    expect(s).toEqual([
      { startBar: 0, name: 'Intro' },
      { startBar: 4, name: 'Parte 1' },
      { startBar: 8, name: 'Refrão' },
    ]);
    expect(sectionSpans(s, 20).map((x) => [x.from, x.to])).toEqual([
      [0, 3],
      [4, 7],
      [8, 19],
    ]);
  });

  it('texto do mapa: seções e compassos em grade de 4', () => {
    const txt = songMapText({
      title: 'Música',
      key: 'G menor',
      bpm: 117.6,
      transpose: 0,
      sections: [{ name: 'Intro', from: 0, to: 4, bars: [1, 2, 3, 4, 5].map((n) => ({ n, chords: n === 3 ? [] : ['Gm'], bass: ['G', 'D'] })) }],
    });
    expect(txt).toContain('INTRO  (compassos 1–5)');
    expect(txt).toContain('| 1: Gm [G D] | 2: Gm [G D] | 3: % [G D] | 4: Gm [G D] |');
    expect(txt).toContain('| 5: Gm [G D] |');
    expect(txt).toContain('118 BPM');
  });
});

describe('mapa em texto: andamento', () => {
  it('constante ou variável', async () => {
    const { bpmLabel } = await import('../src/index.js');
    expect(bpmLabel({ bpm: 117.5 })).toBe('118 BPM');
    expect(bpmLabel({ bpm: 112, bpmRange: [86.1, 123] })).toBe('86–123 BPM (variável)');
  });
});
