import { describe, expect, it } from 'vitest';
import { cleanBassLine } from '../src/index.js';

const beats = Array.from({ length: 16 }, (_, i) => i * 0.5); // 120 BPM
const n = (midi: number, startSec: number, durSec = 0.4, velocity = 100) => ({ midi, startSec, durSec, velocity });

describe('limpeza da linha do baixo transcrita', () => {
  it('tira fantasma curto e fraco', () => {
    expect(cleanBassLine([n(40, 0), n(45, 0.3, 0.03, 40), n(43, 0.5)], beats).map((x) => x.midi)).toEqual([40, 43]);
  });
  it('junta a mesma nota partida', () => {
    const r = cleanBassLine([n(40, 0, 0.2), n(40, 0.21, 0.25, 50)], beats);
    expect(cleanBassLine([n(40, 0, 0.2), n(40, 0.21, 0.25)], beats)).toHaveLength(2); // ataque novo: duas notas
    expect(r).toHaveLength(1);
    expect(r[0]!.durSec).toBeCloseTo(0.46, 2);
  });
  it('corrige oitava isolada', () => {
    expect(cleanBassLine([n(40, 0), n(55, 0.5), n(45, 1)], beats).map((x) => x.midi)).toEqual([40, 43, 45]);
  });
  it('encaixa na semicolcheia quando está perto, e deixa quando está longe', () => {
    const r = cleanBassLine([n(40, 0.51), n(43, 1.06)], beats);
    expect(r[0]!.startSec).toBeCloseTo(0.5, 5); // 10 ms da grade: encaixa
    expect(r[1]!.startSec).toBeCloseTo(1.06, 5); // 60 ms (passo de 125 ms): fica onde está
  });
});
