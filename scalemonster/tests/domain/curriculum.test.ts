import { describe, expect, it } from 'vitest';
import { CURRICULUM_EXERCISES, curriculumProgress } from '../../src/domain/index.js';

describe('currículo', () => {
  it('tem cerca de 100 exercícios e libera em ordem', () => {
    expect(CURRICULUM_EXERCISES.length).toBeGreaterThanOrEqual(95);
    const f = CURRICULUM_EXERCISES[0]!;
    const p = curriculumProgress([{ key: `bass|0|${f.config.family}|${f.config.mode}|${f.config.pattern}`, accuracy: 85, bpm: 60 }]);
    expect(p[f.id]!.status).toBe('mastered');
    expect(p['bass-1-2']!.status).toBe('unlocked');
    expect(p['bass-1-3']!.status).toBe('locked');
    expect(curriculumProgress([], true)['bass-1-3']!.status).toBe('unlocked');
  });
});
