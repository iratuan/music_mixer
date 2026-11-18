import { describe, expect, it } from 'vitest';
import { EAR_CATEGORIES, EAR_TYPES, earTypesOf, judgeTaps, pickIsRight, randomChallenge } from '../../src/domain/index.js';

describe('ear training', () => {
  it('tem 8 categorias e mais de 60 variações, cada uma gera desafios válidos', () => {
    expect(EAR_CATEGORIES).toHaveLength(8);
    expect(EAR_TYPES.length).toBeGreaterThanOrEqual(60);
    for (const c of EAR_CATEGORIES) expect(earTypesOf(c.id).length).toBeGreaterThan(0);
    for (const t of EAR_TYPES) {
      for (let i = 0; i < 20; i++) {
        const ch = t.make(Math.random);
        expect(ch.events.length).toBeGreaterThan(0);
        expect(ch.prompt.length).toBeGreaterThan(10);
        if (ch.interaction === 'choice' || ch.interaction === 'detune') {
          expect(ch.options!.length).toBeGreaterThanOrEqual(2);
          expect(ch.options![ch.answerIndex!]).toBeTruthy();
          if (ch.optionEvents) expect(ch.optionEvents).toHaveLength(ch.options!.length);
        }
        if (ch.interaction === 'pick' || ch.interaction === 'sequence' || ch.interaction === 'circle') expect(ch.answerPcs!.length).toBeGreaterThan(0);
        if (ch.interaction === 'tap') expect(ch.rhythm!.length).toBeGreaterThan(1);
      }
    }
  });
  it('confere cliques e batidas', () => {
    const c = earTypesOf('notes')[0]!.make(Math.random);
    expect(pickIsRight(c, c.answerMidis![0]! + 12)).toBe(true);
    expect(pickIsRight(c, c.answerMidis![0]! + 1)).toBe(false);
    expect(judgeTaps([0, 1, 2, 3], [5, 5.7, 6.4, 7.1], 84).ok).toBe(true);
    expect(judgeTaps([0, 1, 2, 3], [5, 5.7], 84).ok).toBe(false);
    expect(randomChallenge('rhythm', 1).category).toBe('rhythm');
  });
});
