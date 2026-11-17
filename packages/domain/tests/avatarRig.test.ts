import { describe, expect, it } from 'vitest';
import { Spring, fretToNeck, midiToKeyPos, moodFor, twoBoneIK } from '../src/index.js';

describe('esqueleto do músico', () => {
  it('IK: a mão chega ao alvo e os ossos mantêm o comprimento', () => {
    const sh = { x: 0, y: 0 };
    const r = twoBoneIK(sh, { x: 20, y: 10 }, 15, 15);
    expect(r.hand.x).toBeCloseTo(20);
    expect(r.hand.y).toBeCloseTo(10);
    expect(Math.hypot(r.elbow.x - sh.x, r.elbow.y - sh.y)).toBeCloseTo(15);
    expect(Math.hypot(r.hand.x - r.elbow.x, r.hand.y - r.elbow.y)).toBeCloseTo(15);
  });
  it('IK: alvo longe demais estica o braço na direção dele; o outro lado inverte o cotovelo', () => {
    const far = twoBoneIK({ x: 0, y: 0 }, { x: 100, y: 0 }, 10, 10);
    expect(far.hand.x).toBeCloseTo(20, 1);
    expect(far.reach).toBeCloseTo(1, 1);
    const a = twoBoneIK({ x: 0, y: 0 }, { x: 12, y: 0 }, 10, 10, 1);
    const b = twoBoneIK({ x: 0, y: 0 }, { x: 12, y: 0 }, 10, 10, -1);
    expect(a.elbow.y).toBeCloseTo(-b.elbow.y);
    expect(Math.abs(a.elbow.y)).toBeGreaterThan(1);
  });
  it('mola converge ao alvo sem estourar', () => {
    const s = new Spring(0);
    for (let i = 0; i < 120; i++) s.step(1, 1 / 60);
    expect(s.x).toBeCloseTo(1, 2);
    expect(Number.isFinite(new Spring(0).step(1, 0.5))).toBe(true);
  });
  it('humor pelo desempenho', () => {
    expect(moodFor(5, 0)).toBe('normal');
    expect(moodFor(30, 0)).toBe('hot');
    expect(moodFor(0, 0, true)).toBe('hot');
    expect(moodFor(40, 3)).toBe('error');
  });
  it('posição no braço e no teclado', () => {
    expect(fretToNeck(0)).toBeLessThan(fretToNeck(5));
    expect(fretToNeck(12) - fretToNeck(7)).toBeLessThan(fretToNeck(5) - fretToNeck(0)); // casas ficam mais juntas
    expect(midiToKeyPos(48)).toBe(0);
    expect(midiToKeyPos(100)).toBe(1);
  });
});
