import { describe, expect, it } from 'vitest';
import { GUITAR_TUNING, chordTones, guitarVoicing, simplifyChord, type Chord } from '../src/index.js';

const QUALITIES = ['', 'm', '7', 'm7', 'maj7', 'sus2', 'sus4', 'dim', 'm7b5'];

/** Notas (classes de altura) que a forma faz soar. */
function sounded(frets: ReadonlyArray<number | null>): number[] {
  return frets.flatMap((f, s) => (f == null ? [] : [(GUITAR_TUNING[s]! + f) % 12]));
}

describe('violão: formas', () => {
  it('dó maior normal é a forma aberta x32010 (baixo na fundamental, sem pestana)', () => {
    const v = guitarVoicing({ root: 0, quality: '' }, { mode: 'normal' })!;
    expect(v.frets).toEqual([null, 3, 2, 0, 1, 0]);
    expect(v.fingers).toEqual([0, 3, 2, 0, 1, 0]);
    expect(v.form).toBe('aberto');
    expect(v.barre).toBeNull();
  });

  it('lá menor normal é x02210', () => {
    const v = guitarVoicing({ root: 9, quality: 'm' }, { mode: 'normal' })!;
    expect(v.frets).toEqual([null, 0, 2, 2, 1, 0]);
  });

  it('toda nota que soa pertence ao acorde, com fundamental e terça', () => {
    for (const quality of QUALITIES) {
      for (let root = 0; root < 12; root++) {
        const chord: Chord = { root, quality };
        const tones = new Set(chordTones(chord));
        for (const mode of ['normal', 'caged'] as const) {
          const v = guitarVoicing(chord, { mode, near: 4 });
          expect(v, `${root}${quality} ${mode}`).not.toBeNull();
          for (const p of sounded(v!.frets)) expect(tones.has(p), `${root}${quality} ${mode}`).toBe(true);
          expect(sounded(v!.frets)).toContain(root % 12);
        }
      }
    }
  });

  it('nenhuma forma passa de 4 dedos nem de 4 casas de intervalo', () => {
    for (const quality of QUALITIES) {
      for (let root = 0; root < 12; root++) {
        for (const mode of ['normal', 'caged'] as const) {
          const v = guitarVoicing({ root, quality }, { mode, near: 5 })!;
          expect(Math.max(...v.fingers)).toBeLessThanOrEqual(4);
          const fretted = v.frets.filter((f): f is number => f != null && f > 0);
          if (fretted.length) expect(Math.max(...fretted) - Math.min(...fretted)).toBeLessThanOrEqual(4);
        }
      }
    }
  });

  it('modo normal fica nas primeiras casas', () => {
    for (const quality of QUALITIES) {
      for (let root = 0; root < 12; root++) {
        const v = guitarVoicing({ root, quality }, { mode: 'normal' })!;
        expect(v.frets.every((f) => f == null || f <= 5)).toBe(true);
      }
    }
  });

  it('CAGED: a fundamental fica no baixo, na 6ª, 5ª ou 4ª corda, perto da zona pedida', () => {
    for (const root of [0, 2, 4, 7, 9]) {
      const v = guitarVoicing({ root, quality: '' }, { mode: 'caged', near: 7 })!;
      const low = v.frets.findIndex((f) => f != null);
      expect(low).toBeLessThanOrEqual(2);
      expect((GUITAR_TUNING[low]! + v.frets[low]!) % 12).toBe(root);
      expect(v.form).toMatch(/^raiz na [654]ª corda · casa \d+/);
      expect(v.frets[low]!).toBeLessThanOrEqual(11);
    }
  });

  it('pestana: uma casa com dois ou mais dedos vira pestana e o rótulo diz onde', () => {
    const v = guitarVoicing({ root: 7, quality: '' }, { mode: 'caged', near: 3 })!;
    if (v.barre) {
      expect(v.fingers[v.barre.from]).toBe(1);
      expect(v.form).toContain('pestana');
    }
  });

  it('inversão (C/E): o baixo toca a terça', () => {
    const v = guitarVoicing({ root: 0, quality: '', bass: 4 }, { mode: 'normal' })!;
    const low = v.frets.findIndex((f) => f != null);
    expect((GUITAR_TUNING[low]! + v.frets[low]!) % 12).toBe(4);
  });
});

describe('violão: nível simples e completo', () => {
  it('simples troca as qualidades complexas pelas tríades e 7', () => {
    expect(simplifyChord({ root: 2, quality: 'maj7' }, 'simple').quality).toBe('');
    expect(simplifyChord({ root: 2, quality: 'm7' }, 'simple').quality).toBe('m');
    expect(simplifyChord({ root: 2, quality: '7' }, 'simple').quality).toBe('7');
    expect(simplifyChord({ root: 2, quality: 'm7b5' }, 'full').quality).toBe('m7b5');
  });

  it('a forma simples é a do acorde simplificado', () => {
    const simple = guitarVoicing({ root: 9, quality: 'maj7' }, { level: 'simple', mode: 'normal' })!;
    const direct = guitarVoicing({ root: 9, quality: '' }, { mode: 'normal' })!;
    expect(simple.frets).toEqual(direct.frets);
    expect(simple.quality).toBe('');
  });
});
