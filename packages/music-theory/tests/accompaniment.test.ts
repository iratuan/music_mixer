import { describe, expect, it } from 'vitest';
import {
  BASS_PATTERNS,
  BASS_TUNINGS,
  DEFAULT_ACCOMP_OPTIONS,
  GUITAR_PATTERNS,
  GUITAR_TUNING,
  PIANO_PATTERNS,
  bassNoteOf,
  bassShape,
  buildAccompaniment,
  chordTones,
  guitarPitches,
  guitarVoicing,
  noOpenString,
  type AccompOptions,
  type AccompPart,
  type BassPattern,
  type Chord,
} from '../src/index.js';

// 120 BPM, 4 compassos de 4 tempos (16 tempos de 0,5 s), primeiro tempo 1 no índice 0.
const beats = Array.from({ length: 16 }, (_, i) => i * 0.5);
const C: Chord = { root: 0, quality: '' };
const Am: Chord = { root: 9, quality: 'm' };
const G7: Chord = { root: 7, quality: '7' };
const chords = [
  { start: 0, chord: C },
  { start: 2, chord: Am },
  { start: 4, chord: null },
  { start: 6, chord: G7 },
];
const ALL = new Set<AccompPart>(['bass', 'piano', 'guitar']);
const only = (p: AccompPart) => new Set<AccompPart>([p]);
const withBass = (pattern: BassPattern, extra: Partial<AccompOptions['bass']> = {}): AccompOptions => ({ ...DEFAULT_ACCOMP_OPTIONS, bass: { ...DEFAULT_ACCOMP_OPTIONS.bass, pattern, ...extra } });
const chordAtT = (t: number) => [...chords].reverse().find((c) => c.start <= t + 1e-6)!.chord;

describe('baixo do acompanhamento: regras do braço', () => {
  it('nenhuma levada usa corda solta, e toda nota fica na zona da mão (um dedo por casa, no máximo uma casa de abertura)', () => {
    for (const tuning of BASS_TUNINGS) {
      for (const p of BASS_PATTERNS) {
        const notes = buildAccompaniment(chords, beats, 0, withBass(p.id, { tuning })).part('bass');
        expect(notes.length, `${p.id} ${tuning.id}`).toBeGreaterThan(0);
        for (const n of notes) {
          expect(n.pos!.fret, `${p.id} ${tuning.id}`).toBeGreaterThan(0);
          expect(tuning.strings[n.pos!.string]! + n.pos!.fret).toBe(n.midi);
          expect(n.pos!.fret).toBeGreaterThanOrEqual(n.zone! - 1);
          expect(n.pos!.fret).toBeLessThanOrEqual(n.zone! + 4);
          expect(n.finger).toBeGreaterThanOrEqual(1);
          expect(n.finger).toBeLessThanOrEqual(4);
        }
      }
    }
  });

  it('nota que seria solta vai para a 5ª casa da corda de cima (Lá → corda Mi, casa 5)', () => {
    const t = BASS_TUNINGS[0]!;
    expect(noOpenString(33, t)!.pos).toEqual({ string: 0, fret: 5 });
    expect(noOpenString(38, t)!.pos).toEqual({ string: 1, fret: 5 });
    expect(noOpenString(43, t)!.pos).toEqual({ string: 2, fret: 5 });
    // Mi grave do 4 cordas: não há corda de cima; sobe uma oitava, presa.
    expect(noOpenString(28, t)!.pos.fret).toBeGreaterThan(0);
    // No 5 cordas, o Mi grave fica na corda Si, casa 5.
    expect(noOpenString(28, BASS_TUNINGS[1]!)!.pos).toEqual({ string: 0, fret: 5 });
  });

  it('acorde de Lá na região baixa: fundamental na corda Mi, casa 5, nunca na corda Lá solta', () => {
    const s = bassShape({ root: 9, quality: 'm' }, BASS_TUNINGS[0]!, null, 1);
    expect(s.root.pos.fret).toBeGreaterThan(0);
    expect(s.root.pos).toEqual({ string: 0, fret: 5 });
  });

  it('região escolhida é respeitada', () => {
    for (const region of [1, 5, 9]) {
      for (const n of buildAccompaniment(chords, beats, 0, withBass('arpeggio', { region })).part('bass')) {
        expect(Math.abs(n.zone! - region), `região ${region}`).toBeLessThanOrEqual(2);
      }
    }
  });

  it('fundamental nas cordas graves e notas do acorde corretas no arpejo', () => {
    const notes = buildAccompaniment(chords, beats, 0, withBass('arpeggio')).part('bass');
    const first = notes.filter((n) => n.t < 2);
    expect(first.map((n) => n.midi % 12)).toEqual([0, 4, 7, 0]);
    expect(first[0]!.pos!.string).toBeLessThanOrEqual(1);
    const g7 = notes.filter((n) => n.t >= 6);
    expect(g7.map((n) => n.midi % 12)).toEqual([7, 11, 2, 5]); // G B D F: sétima no acorde com sétima
  });

  it('walking: última nota antes da troca é aproximação cromática da próxima fundamental', () => {
    const notes = buildAccompaniment(chords, beats, 0, withBass('walking')).part('bass');
    const beforeAm = notes.filter((n) => n.t < 2).at(-1)!;
    const amRoot = notes.find((n) => n.t >= 2)!;
    expect(Math.abs(beforeAm.midi - amRoot.midi)).toBe(1);
  });

  it('tercinas: três notas por tempo (fundamental, quinta e oitava)', () => {
    const notes = buildAccompaniment(chords, beats, 0, withBass('triplet')).part('bass').filter((n) => n.t < 0.5 - 1e-6);
    expect(notes).toHaveLength(3);
    expect(notes.map((n) => n.midi - notes[0]!.midi)).toEqual([0, 7, 12]);
  });

  it('a mão anda pouco entre acordes', () => {
    const prog = [0, 5, 7, 0, 9, 2, 7, 0].map((root, k) => ({ start: k * 2, chord: { root, quality: '' } as Chord }));
    const bs = Array.from({ length: 32 }, (_, i) => i * 0.5);
    const zones = [...new Set(buildAccompaniment(prog, bs, 0, withBass('root')).part('bass').map((n) => `${Math.floor(n.t / 2)}:${n.zone}`))].map((x) => Number(x.split(':')[1]));
    for (let k = 1; k < zones.length; k++) expect(Math.abs(zones[k]! - zones[k - 1]!)).toBeLessThanOrEqual(5);
  });

  it('inversão: o baixo toca a nota do baixo (C/E → Mi)', () => {
    expect(bassNoteOf({ root: 0, quality: '', bass: 4 }) % 12).toBe(4);
  });
});

describe('acompanhamento: levadas', () => {
  it('sem acorde, silêncio', () => {
    expect(buildAccompaniment(chords, beats, 0).notesBetween(4, 6, ALL)).toEqual([]);
  });

  it('nenhuma nota invade o acorde seguinte, em nenhuma levada', () => {
    for (let k = 0; k < 7; k++) {
      const opts: AccompOptions = {
        bass: { ...DEFAULT_ACCOMP_OPTIONS.bass, pattern: BASS_PATTERNS[k % BASS_PATTERNS.length]!.id },
        guitar: { ...DEFAULT_ACCOMP_OPTIONS.guitar, pattern: GUITAR_PATTERNS[k % GUITAR_PATTERNS.length]!.id },
        piano: { pattern: PIANO_PATTERNS[k % PIANO_PATTERNS.length]!.id },
      };
      for (const n of buildAccompaniment(chords, beats, 0, opts).notesBetween(0, 8, ALL)) {
        const next = chords.find((c) => c.start > n.t + 1e-6);
        if (next) expect(n.t + n.dur, `${n.part} ${k}`).toBeLessThanOrEqual(next.start + 1e-6);
      }
    }
  });

  it('piano e violão só tocam notas do acorde, em todas as levadas', () => {
    for (const gp of GUITAR_PATTERNS) {
      for (const pp of PIANO_PATTERNS) {
        const acc = buildAccompaniment(chords, beats, 0, { ...DEFAULT_ACCOMP_OPTIONS, guitar: { ...DEFAULT_ACCOMP_OPTIONS.guitar, pattern: gp.id }, piano: { pattern: pp.id } });
        for (const n of acc.notesBetween(0, 4, new Set<AccompPart>(['piano', 'guitar']))) {
          expect(chordTones(chordAtT(n.t)!), `${n.part} ${gp.id}/${pp.id}`).toContain(n.midi % 12);
        }
      }
    }
  });

  it('violão: batida simples a cada tempo; acordes longos uma vez por compasso; tercinas três por tempo', () => {
    const at = (pattern: (typeof GUITAR_PATTERNS)[number]['id']) =>
      buildAccompaniment(chords, beats, 0, { ...DEFAULT_ACCOMP_OPTIONS, guitar: { ...DEFAULT_ACCOMP_OPTIONS.guitar, pattern } }).notesBetween(0, 2, only('guitar'));
    expect(new Set(at('strum').map((n) => Math.round(n.t * 2) / 2)).size).toBe(4);
    expect(new Set(at('long').map((n) => Math.round(n.t * 2) / 2)).size).toBe(1);
    expect(at('triplet').filter((n) => n.t < 0.5 - 1e-6)).toHaveLength(3);
  });

  it('violão no modo CAGED: formas móveis na região, sem cordas soltas', () => {
    for (let root = 0; root < 12; root++) {
      for (const quality of ['', 'm', '7', 'm7', 'maj7']) {
        const v = guitarVoicing({ root, quality }, { mode: 'caged', near: 5 });
        expect(v, `${root}${quality}`).not.toBeNull();
        for (const f of v!.frets) if (f !== null) expect(f, `${root}${quality}`).toBeGreaterThan(0);
      }
    }
  });

  it('forma do violão de Dó soa Dó, Mi e Sol', () => {
    expect(new Set(guitarPitches(C).map((m) => m % 12))).toEqual(new Set([0, 4, 7]));
    expect(GUITAR_TUNING).toHaveLength(6);
  });

  it('nada pedido, nada tocado', () => {
    expect(buildAccompaniment(chords, beats, 0).notesBetween(0, 8, new Set())).toEqual([]);
  });
});
