import { describe, expect, it } from 'vitest';
import { SCALE_BANK, THEORY_MODULES, THEORY_SOURCES, THEORY_TOPICS } from '../../src/domain/index.js';

describe('teoria musical', () => {
  it('tem 7 módulos e 21 tópicos completos, todos com fonte e no máximo 3 pontos', () => {
    expect(THEORY_MODULES).toHaveLength(7);
    expect(THEORY_TOPICS).toHaveLength(21);
    expect(THEORY_MODULES[6]!.title).toMatch(/partitura/i);
    const ids = new Set<string>();
    for (const t of THEORY_TOPICS) {
      ids.add(t.id);
      expect(THEORY_SOURCES[t.source]).toBeTruthy();
      expect(t.points.length).toBeGreaterThan(0);
      expect(t.points.length).toBeLessThanOrEqual(3);
      expect(t.keyIdea.length).toBeGreaterThan(20);
      expect(t.mistakes.length).toBeGreaterThan(0);
      expect(t.inPractice.bass && t.inPractice.guitar && t.inPractice.keyboard).toBeTruthy();
      expect(t.quiz.options[t.quiz.answer]).toBeTruthy();
      if (t.practice) expect(SCALE_BANK[t.practice.family]?.[t.practice.mode]).toBeTruthy();
    }
    expect(ids.size).toBe(21);
  });
});
