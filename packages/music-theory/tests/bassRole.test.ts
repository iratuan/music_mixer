import { describe, expect, it } from 'vitest';
import { BASS_TUNINGS, bassRoleNotes, bassRolePattern, bassRootMidi } from '../src/index.js';

describe('papel do baixo na harmonia', () => {
  it('tônica na região grave, respeitando o baixo do acorde com barra', () => {
    expect(bassRootMidi({ root: 4, quality: '' })).toBe(28);
    expect(bassRootMidi({ root: 0, quality: '' })).toBe(36);
    expect(bassRootMidi({ root: 0, quality: '', bass: 7 })).toBe(31);
  });
  it('tônica nos tempos 1 e 3; tríade 1-3-5-3; arpejo com a sétima', () => {
    expect(bassRolePattern({ root: 9, quality: 'm' }, 'root')).toEqual([33, null, 33, null]);
    // Cozinha: fundamental, fundamental, quinta, fundamental (sem arpejo).
    expect(bassRolePattern({ root: 9, quality: 'm' }, 'groove')).toEqual([33, 33, 40, 33]);
    expect(bassRolePattern({ root: 0, quality: '' }, 'groove', 2)).toEqual([36, 36]);
    expect(bassRolePattern({ root: 9, quality: 'm' }, 'triad')).toEqual([33, 36, 40, 36]);
    expect(bassRolePattern({ root: 7, quality: '7' }, 'arpeggio')).toEqual([31, 35, 38, 41]);
    expect(bassRolePattern({ root: 0, quality: '' }, 'arpeggio')).toEqual([36, 40, 43, 48]);
    expect(bassRolePattern({ root: 0, quality: '' }, 'triad', 2)).toEqual([36, 40]);
  });
  it('as notas do padrão cabem no braço', () => {
    const notes = bassRoleNotes({ root: 2, quality: 'm7' }, 'arpeggio', BASS_TUNINGS[0]!);
    expect(notes.map((n) => n.midi)).toEqual([38, 41, 45, 48]);
    expect(notes.every((n) => BASS_TUNINGS[0]!.strings[n.pos.string]! + n.pos.fret === n.midi)).toBe(true);
  });
});
