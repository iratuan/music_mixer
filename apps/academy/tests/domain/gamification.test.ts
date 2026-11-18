import { describe, expect, it } from 'vitest';
import { QUEST_POOL, comboMultiplier, dailyQuests, earXp, levelProgress, practiceXp, xpForLevel } from '../../src/domain/index.js';

describe('gamificação', () => {
  it('níveis 1 a 100 com títulos', () => {
    expect(levelProgress(0).level).toBe(1);
    expect(levelProgress(0).title).toBe('Iniciante de Garagem');
    expect(levelProgress(xpForLevel(10)).title).toBe('Sideman');
    expect(levelProgress(xpForLevel(100)).level).toBe(100);
    expect(levelProgress(xpForLevel(100)).title).toBe('Maestro ScaleMonster');
    expect(levelProgress(xpForLevel(100) * 3).fraction).toBe(1);
  });
  it('combo e XP', () => {
    expect([1, 3, 6, 10].map(comboMultiplier)).toEqual([1, 2, 3, 5]);
    expect(earXp(10)).toBe(75);
    expect(practiceXp(0)).toBeGreaterThanOrEqual(50);
    expect(practiceXp(100)).toBeLessThanOrEqual(150);
    expect(practiceXp(95)).toBeGreaterThan(practiceXp(85));
  });
  it('3 missões distintas e estáveis por dia', () => {
    const a = dailyQuests('2026-11-17');
    expect(a).toHaveLength(3);
    expect(new Set(a.map((q) => q.code)).size).toBe(3);
    expect(dailyQuests('2026-11-17')).toEqual(a);
    for (const q of a) expect(QUEST_POOL).toContain(q);
  });
});
