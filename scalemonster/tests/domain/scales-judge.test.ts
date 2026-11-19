import { describe, expect, it } from 'vitest';
import {
  BASS_TUNINGS,
  NoteJudge,
  SCALE_BANK,
  buildScaleExercise,
  buildSequence,
  candidateNotes,
  centsBetween,
  fingerFor,
  midiToHz,
  positionWindows,
  stringGroups,
  yinPitch,
  type ScaleContext,
} from '../../src/domain/index.js';

const b4 = BASS_TUNINGS[0]!;
const aMinorPent: ScaleContext = { tuning: b4, root: 9, mode: SCALE_BANK['Pentatônica']!['Menor']! };
const ALL4 = [0, 1, 2, 3];

describe('motor de escalas (portado do ScaleMonster)', () => {
  it('grupos de cordas com a numeração do músico (1 = aguda)', () => {
    const g = stringGroups(4);
    expect(g[0]).toMatchObject({ id: 'all', strings: [0, 1, 2, 3] });
    expect(g.find((x) => x.label === '1–2')!.strings).toEqual([2, 3]); // D e G
    expect(g.find((x) => x.label === '3–4')!.strings).toEqual([0, 1]); // E e A
    expect(g.find((x) => x.label === '2–4')!.strings).toEqual([0, 1, 2]);
  });

  it('janelas das posições como no ScaleMonster (Dó maior pentatônica)', () => {
    const c = { ...aMinorPent, root: 0, mode: SCALE_BANK['Pentatônica']!['Maior']! };
    expect(positionWindows(c.root, c.mode.offset, 20)).toEqual([
      [0, 4],
      [2, 6],
      [4, 8],
      [7, 11],
      [9, 13],
    ]);
  });

  it('notas da janela: Lá menor pentatônica, casas 5–8, 2 por corda, sem repetir altura', () => {
    const notes = candidateNotes(aMinorPent, 5, 8, ALL4, false);
    expect(notes.map((n) => n.midi)).toEqual([33, 36, 38, 40, 43, 45, 48, 50]);
    expect(notes.every((n) => n.fret >= 5 && n.fret <= 8)).toBe(true);
  });

  it('padrões: subir e descer, 2× por nota, saltos de corda e oitavas', () => {
    const base = candidateNotes(aMinorPent, 5, 8, ALL4, false);
    const up = buildSequence(base, 1, 9, 4).map((n) => n.midi);
    expect(up).toEqual([33, 36, 38, 40, 43, 45, 48, 50, 48, 45, 43, 40, 38, 36]);
    const twice = buildSequence(base, 2, 9, 4).map((n) => n.midi);
    expect(twice.slice(0, 4)).toEqual([33, 33, 36, 36]);
    const skip = buildSequence(base, 9, 9, 4);
    expect([...new Set(skip.slice(0, 4).map((n) => n.string))]).toEqual([0, 2]); // E com D
    const oct = buildSequence(base, 15, 9, 4).map((n) => n.midi);
    expect(oct.slice(0, 2)).toEqual([33, 45]);
    // nenhuma nota repetida em seguida (exceto nos exercícios de repetição)
    for (const ex of [1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const) {
      const seq = buildSequence(base, ex, 9, 4);
      seq.forEach((n, i) => i > 0 && expect(n.midi).not.toBe(seq[i - 1]!.midi));
    }
  });

  it('braço inteiro: percorre as posições sem notas repetidas em seguida e cobre as alturas da escala', () => {
    const ex = buildScaleExercise(aMinorPent, 1, ALL4, 'all');
    ex.sequence.forEach((n, i) => i > 0 && expect(n.midi).not.toBe(ex.sequence[i - 1]!.midi));
    const heights = new Set(ex.sequence.map((n) => n.midi));
    const fromScale = new Set(candidateNotes(aMinorPent, 0, 13, ALL4, true).map((n) => n.midi));
    for (const h of fromScale) expect(heights.has(h)).toBe(true);
  });

  it('dedo sugerido', () => {
    const active = [
      { string: 0, fret: 5 },
      { string: 0, fret: 8 },
      { string: 1, fret: 5 },
      { string: 1, fret: 7 },
    ];
    expect(fingerFor(5, 0, active)).toBe('1');
    expect(fingerFor(8, 0, active)).toBe('4');
    expect(fingerFor(7, 1, active)).toBe('3');
    expect(fingerFor(0, 1, active)).toBe('0');
  });
});

describe('julgamento e detecção de altura', () => {
  const sine = (hz: number, sr: number, n: number, amp = 0.5) => {
    const b = new Float32Array(n);
    for (let i = 0; i < n; i++) b[i] = amp * Math.sin((2 * Math.PI * hz * i) / sr) + 0.25 * amp * Math.sin((4 * Math.PI * hz * i) / sr);
    return b;
  };

  it('YIN acerta o Mi grave (41,2 Hz) e o Si grave do 5 cordas (30,9 Hz) com 4096 amostras', () => {
    for (const midi of [28, 23, 43]) {
      const hz = midiToHz(midi);
      const r = yinPitch(sine(hz, 48000, 4096), 48000, 28)!;
      expect(Math.abs(centsBetween(r.hz, hz))).toBeLessThan(5);
    }
    expect(yinPitch(new Float32Array(4096), 48000)).toBeNull();
  });

  it('acerto exige ataque novo e altura estável; oitava e erro', () => {
    const j = new NoteJudge<string>();
    j.expect('a', 33, 1.0);
    expect(j.feed(midiToHz(33), 0.1, 0.0, 0.01)).toBeNull(); // sem ataque
    expect(j.feed(midiToHz(33), 0.12, 0.2, 0.01)).toBeNull(); // ataque, 1º quadro
    expect(j.feed(midiToHz(33), 0.14, 0.2, 0.01)).toEqual({ verdict: 'hit', id: 'a' });

    j.expect('b', 33, 2.0);
    j.feed(-1, 1.0, 0.01, 0.01);
    j.feed(midiToHz(45), 1.02, 0.3, 0.01);
    j.feed(midiToHz(45), 1.04, 0.3, 0.01);
    expect(j.feed(midiToHz(45), 1.06, 0.3, 0.01)).toEqual({ verdict: 'octave', id: 'b' });

    j.expect('c', 33, 3.0);
    expect(j.feed(midiToHz(35), 3.1, 0.3, 0.01)).toEqual({ verdict: 'miss', id: 'c' });
  });
});

describe('braço inteiro: grupos maiores e regiões da oitava de cima', () => {
  it('baixo de 5 cordas tem grupos de 2, 3 e 4 cordas; 6 cordas também de 5', async () => {
    const { groupsOfSize } = await import('../../src/domain/index.js');
    expect(groupsOfSize(5, 4).map((g) => g.strings)).toEqual([
      [0, 1, 2, 3],
      [1, 2, 3, 4],
    ]);
    expect(groupsOfSize(6, 5)).toHaveLength(2);
    expect(groupsOfSize(4, 2).map((g) => g.label)).toEqual(['3–4', '2–3', '1–2']);
  });
  it('regiões continuam depois da casa 12 até o fim do braço', async () => {
    const { neckWindows } = await import('../../src/domain/index.js');
    const w = neckWindows(9, 3, 20);
    expect(w.length).toBeGreaterThan(5);
    expect(Math.max(...w.map(([, e]) => e))).toBeLessThanOrEqual(20);
    expect(w.some(([s]) => s >= 12)).toBe(true);
  });
  it('percurso por regiões: cada etapa fica na sua região e as etapas sobem pelo braço', async () => {
    const { buildNeckTour } = await import('../../src/domain/index.js');
    const tour = buildNeckTour(aMinorPent, 1, 'positions', stringGroups(4)[0]!, 0, 2);
    let last = -1;
    for (const st of tour.stages) {
      expect(st.window[0]).toBeGreaterThan(last);
      last = st.window[0];
      for (const n of tour.sequence.slice(st.from, st.to)) {
        expect(n.fret).toBeGreaterThanOrEqual(st.window[0]);
        expect(n.fret).toBeLessThanOrEqual(st.window[1]);
      }
    }
  });
});

describe('região do braço escolhida pelo aluno', () => {
  it('percurso por regiões fica dentro das casas pedidas, em qualquer tom', async () => {
    const { buildNeckTour, SCALE_BANK: BANK } = await import('../../src/domain/index.js');
    for (let root = 0; root < 12; root++) {
      for (const [cat, modes] of Object.entries(BANK)) {
        for (const mode of Object.values(modes)) {
          const tour = buildNeckTour({ tuning: b4, root, mode }, 1, 'positions', stringGroups(4)[0]!, 0, 1, [5, 10]);
          expect(tour.sequence.length, `${cat} ${root}`).toBeGreaterThan(3);
          for (const n of tour.sequence) {
            expect(n.fret, `${cat} ${root}`).toBeGreaterThanOrEqual(4);
            expect(n.fret, `${cat} ${root}`).toBeLessThanOrEqual(11);
          }
        }
      }
    }
  });
  it('braço inteiro contínuo também respeita a região', () => {
    const ex = buildScaleExercise(aMinorPent, 1, ALL4, 'all', [0, 12]);
    expect(Math.max(...ex.sequence.map((n) => n.fret))).toBeLessThanOrEqual(13);
    expect(ex.sequence.length).toBeGreaterThan(10);
  });
  it('região alta (depois da casa 12) existe no baixo de 24 casas', async () => {
    const { windowsInRange, neckWindows } = await import('../../src/domain/index.js');
    const w = neckWindows(9, 3, 24);
    const ks = windowsInRange(w, [12, 24]);
    expect(ks.length).toBeGreaterThan(0);
    for (const k of ks) expect(w[k]![0]).toBeGreaterThanOrEqual(11);
  });
});
