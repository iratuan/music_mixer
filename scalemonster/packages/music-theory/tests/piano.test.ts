import { describe, expect, it } from 'vitest';
import { chordTones, handSplit, pianoVoicing, splitHands, voiceChords } from '../src/index.js';

const n = (midi: number, startSec: number, durSec = 0.4) => ({ midi, startSec, durSec });

describe('piano: mãos', () => {
  it('notas do acorde', () => {
    expect(chordTones({ root: 7, quality: 'm7' })).toEqual([7, 10, 2, 5]);
    expect(chordTones({ root: 0, quality: '' })).toEqual([0, 4, 7]);
  });

  it('divide no maior vão entre as mãos', () => {
    // Esquerda: G2 D3; direita: G4 Bb4 D5
    expect(handSplit([43, 50, 67, 70, 74])).toBe(67);
    // Sem vão claro: Dó central
    expect(handSplit([58, 60, 62, 64])).toBe(60);
  });

  it('acorde base na esquerda e arpejo numerado na direita', () => {
    const gm = { root: 7, quality: 'm' };
    const notes = [n(43, 0, 2), n(50, 0, 2), n(67, 0), n(70, 0.5), n(74, 1), n(70, 1.5), n(49, 0.2)];
    const h = splitHands(notes, gm);
    const left = h.filter((x) => x.hand === 'L');
    expect(left.filter((x) => x.role === 'base').map((x) => x.midi)).toEqual([43, 50]);
    expect(left.find((x) => x.midi === 49)!.role).toBe('extra'); // C#3 não é do acorde
    const right = h.filter((x) => x.hand === 'R');
    expect(right.map((x) => [x.midi, x.order])).toEqual([
      [67, 1],
      [70, 2],
      [74, 3],
      [70, 2],
    ]);
  });

  it('sem mão esquerda, sugere o acorde base em posição fundamental', () => {
    const h = splitHands([n(72, 0), n(76, 0.5), n(79, 1)], { root: 0, quality: '' });
    const sug = h.filter((x) => x.role === 'suggest').map((x) => x.midi);
    expect(sug).toEqual([48, 52, 55]);
  });
});

describe('piano guiado pela harmonia', () => {
  it('esquerda: fundamental, quinta e oitava na região grave', () => {
    expect(pianoVoicing({ root: 7, quality: 'm' }).left).toEqual([43, 50, 55]); // G2 D3 G3
    expect(pianoVoicing({ root: 0, quality: '' }).left).toEqual([48, 55, 60]); // C3 G3 C4
  });

  it('direita: acorde fechado com as notas certas', () => {
    const v = pianoVoicing({ root: 0, quality: '' });
    expect(v.right.map((m) => m % 12).sort((a, b) => a - b)).toEqual([0, 4, 7]);
    expect(v.right[v.right.length - 1]! - v.right[0]!).toBeLessThanOrEqual(9);
    const m7 = pianoVoicing({ root: 2, quality: 'm7' });
    expect(m7.right).toHaveLength(4);
  });

  it('condução de vozes: C → F → G → C mexe pouco a mão direita', () => {
    const seq = voiceChords([
      { root: 0, quality: '' },
      { root: 5, quality: '' },
      { root: 7, quality: '' },
      { root: 0, quality: '' },
    ]);
    for (let i = 1; i < seq.length; i++) {
      const moved = seq[i]!.right.reduce((s, x, k) => s + Math.abs(x - seq[i - 1]!.right[k]!), 0);
      expect(moved).toBeLessThanOrEqual(6); // no máximo ~2 semitons por voz
    }
    expect(voiceChords([null])[0]).toBeNull();
  });

  it('inversão: a esquerda toca o baixo (C/E → E2 e E3)', () => {
    expect(pianoVoicing({ root: 0, quality: '', bass: 4 }).left).toEqual([40, 52]);
  });
});
