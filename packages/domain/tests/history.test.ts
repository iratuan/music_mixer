import { describe, expect, it } from 'vitest';
import { dailySeries, levelFor, medals, mergeSessions, parseSession, personalBests, sessionXp, streakDays, type PracticeSession } from '../src/index.js';

const S = (at: string, over: Partial<PracticeSession> = {}): PracticeSession => ({ at, exercise: 'Lá Pentatônica', key: 'A-pent-1', instrument: 'Baixo', bpm: 100, accuracy: 85, maxStreak: 32, score: 2000, hits: 40, misses: 6, ...over });

describe('histórico de prática', () => {
  it('XP: precisão baixa rende só participação; alta rende mais', () => {
    const low = sessionXp({ accuracy: 30, bpm: 200, maxStreak: 50, hits: 20 });
    const high = sessionXp({ accuracy: 95, bpm: 120, maxStreak: 40, hits: 100 });
    expect(low).toBe(14);
    expect(high).toBeGreaterThan(low * 4);
  });
  it('níveis I a V e progresso', () => {
    expect(levelFor(0).level).toBe(1);
    expect(levelFor(300).level).toBe(2);
    expect(levelFor(2499).level).toBe(3);
    expect(levelFor(99999)).toMatchObject({ level: 5, toNext: 0, progress: 1 });
    expect(levelFor(650).progress).toBeCloseTo(0.5);
  });
  it('dias seguidos e medalhas', () => {
    const list = [S('2026-11-10T10:00:00Z'), S('2026-11-11T10:00:00Z'), S('2026-11-12T10:00:00Z'), S('2026-11-05T10:00:00Z')];
    expect(streakDays(list)).toBe(3);
    const got = medals(list).filter((m) => m.earned).map((m) => m.id);
    expect(got).toEqual(expect.arrayContaining(['first', 'acc80', 'combo30', 'days3']));
    expect(got).not.toContain('acc95');
    expect(medals([]).some((m) => m.earned)).toBe(false);
  });
  it('recordes por exercício e série por dia', () => {
    const list = [S('2026-11-10T10:00:00Z', { accuracy: 70, bpm: 140 }), S('2026-11-10T11:00:00Z', { accuracy: 90, bpm: 100 }), S('2026-11-11T10:00:00Z', { key: 'outro', exercise: 'Outro' })];
    const pb = personalBests(list).find((p) => p.key === 'A-pent-1')!;
    expect(pb).toMatchObject({ bestAccuracy: 90, bestBpm: 100, sessions: 2 });
    expect(dailySeries(list)).toEqual([
      { day: '2026-11-10', accuracy: 80, bpm: 140, sessions: 2 },
      { day: '2026-11-11', accuracy: 85, bpm: 100, sessions: 1 },
    ]);
  });
  it('importação valida e não duplica', () => {
    const a = S('2026-11-10T10:00:00Z');
    expect(parseSession({ ...a, accuracy: 120 })).toBeNull();
    expect(parseSession('x')).toBeNull();
    const r = mergeSessions([a], [a, S('2026-11-11T10:00:00Z'), { lixo: true }]);
    expect(r.added).toBe(1);
    expect(r.sessions).toHaveLength(2);
  });
});
