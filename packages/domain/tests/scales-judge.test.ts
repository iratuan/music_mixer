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
} from '../src/index.js';

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
