import { describe, expect, it } from 'vitest';
import { ALL_ROUTINES, BASS_TUNINGS, EXERCISES, ROUTINES, ROUTINE_LEVELS, ROUTINE_TOPICS, SCALE_BANK, TRAILS, buildNeckTour, buildScaleExercise, groupsOfSize, mergeRecord, routineMastered, stringGroups } from '../src/index.js';

describe('biblioteca de exercícios', () => {
  it('cada rotina aponta para escala, variação e padrão que existem', () => {
    for (const r of ROUTINES) {
      expect(SCALE_BANK[r.settings.category]?.[r.settings.mode], r.id).toBeDefined();
      expect(EXERCISES.some((e) => e.id === r.settings.exercise), r.id).toBe(true);
      expect(ROUTINE_LEVELS).toContain(r.level);
      expect(ROUTINE_TOPICS).toContain(r.topic);
      expect(r.targetBpm).toBeGreaterThan(r.settings.bpm);
    }
  });

  it('ids únicos', () => {
    expect(new Set(ROUTINES.map((r) => r.id)).size).toBe(ROUTINES.length);
  });

  it('toda rotina gera notas no baixo de 4, 5 e 6 cordas', () => {
    for (const tuning of BASS_TUNINGS) {
      const all = stringGroups(tuning.strings.length)[0]!.strings;
      for (const r of ROUTINES) {
        const mode = SCALE_BANK[r.settings.category]![r.settings.mode]!;
        const ex = buildScaleExercise({ tuning, root: r.settings.root, mode }, r.settings.exercise, all, r.settings.region);
        expect(ex.sequence.length, `${r.id} ${tuning.strings.length} cordas`).toBeGreaterThan(3);
      }
    }
  });

  it('cada nível tem rotinas', () => {
    for (const l of ROUTINE_LEVELS) expect(ROUTINES.some((r) => r.level === l)).toBe(true);
  });

  it('recorde guarda o melhor acerto e o maior andamento', () => {
    let rec = mergeRecord(undefined, { pct: 80, bpm: 70, at: '2026-11-01' });
    rec = mergeRecord(rec, { pct: 70, bpm: 90, at: '2026-11-02' });
    expect(rec).toMatchObject({ bestPct: 80, bestPctBpm: 70, maxBpm: 90, sessions: 2, last: '2026-11-02' });
    rec = mergeRecord(rec, { pct: null, bpm: 60, at: '2026-11-03' });
    expect(rec).toMatchObject({ bestPct: 80, maxBpm: 90, sessions: 3 });
    rec = mergeRecord(rec, { pct: 80, bpm: 100, at: '2026-11-04' });
    expect(rec.bestPctBpm).toBe(100);
  });

  it('dominada: 90% na meta de andamento', () => {
    const r = ROUTINES[0]!;
    expect(routineMastered(r, { bestPct: 95, bestPctBpm: r.targetBpm, sessions: 1, last: '' })).toBe(true);
    expect(routineMastered(r, { bestPct: 95, bestPctBpm: r.targetBpm - 5, sessions: 1, last: '' })).toBe(false);
    expect(routineMastered(r, undefined)).toBe(false);
  });
});

describe('trilhas do braço', () => {
  it('toda escala do banco tem trilha de 4 etapas', () => {
    for (const [cat, modes] of Object.entries(SCALE_BANK)) {
      for (const mode of Object.keys(modes)) {
        const steps = TRAILS.filter((r) => r.settings.category === cat && r.settings.mode === mode);
        expect(steps.map((r) => r.trail?.step), `${cat} ${mode}`).toEqual([1, 2, 3, 4]);
      }
    }
  });

  it('ids únicos em toda a biblioteca', () => {
    expect(new Set(ALL_ROUTINES.map((r) => r.id)).size).toBe(ALL_ROUTINES.length);
  });

  it('cada etapa com percurso gera notas e passa por regiões e grupos, em 4, 5 e 6 cordas', () => {
    for (const tuning of BASS_TUNINGS) {
      const n = tuning.strings.length;
      for (const r of TRAILS) {
        const x = r.settings;
        const mode = SCALE_BANK[x.category]![x.mode]!;
        const ctx = { tuning, root: x.root, mode };
        if (!x.tour || x.tour === 'off') {
          expect(buildScaleExercise(ctx, x.exercise, stringGroups(n)[0]!.strings, x.region).sequence.length, r.id).toBeGreaterThan(3);
          continue;
        }
        const group = x.groupSize ? groupsOfSize(n, x.groupSize)[0]! : stringGroups(n)[0]!;
        const tour = buildNeckTour(ctx, x.exercise, x.tour, group, typeof x.region === 'number' ? x.region : 0, x.repeats ?? 1);
        expect(tour.stages.length, `${r.id} ${n} cordas`).toBeGreaterThanOrEqual(5);
        expect(new Set(tour.stages.map((s) => s.region)).size, r.id).toBeGreaterThanOrEqual(5);
        if (x.tour === 'full') expect(new Set(tour.stages.map((s) => s.group.id)).size, r.id).toBe(groupsOfSize(n, x.groupSize!).length);
        for (const st of tour.stages) for (const note of tour.sequence.slice(st.from, st.to)) expect(st.group.strings, r.id).toContain(note.string);
        // O percurso chega ao fim do braço (casa 12 ou mais).
        expect(Math.max(...tour.sequence.map((q) => q.fret)), r.id).toBeGreaterThanOrEqual(12);
      }
    }
  });
});
