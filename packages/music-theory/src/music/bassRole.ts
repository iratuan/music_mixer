/**
 * Papel do baixo no acompanhamento da Harmonia: o baixo marca só a tônica, a tríade ou o arpejo
 * do acorde (nada de escalas ou aproximações). Gera as notas, uma por tempo, e onde tocá-las.
 */
import { fingerLine, type BassTuning, type FretPos } from '../instrument/bass.js';
import { type Chord } from './harmony.js';
import { chordIntervals } from './circleOfFifths.js';

export type BassRole = 'root' | 'groove' | 'triad' | 'arpeggio';

export const BASS_ROLES: ReadonlyArray<{ readonly id: BassRole; readonly label: string; readonly hint: string }> = [
  { id: 'root', label: 'Tônica', hint: 'Fundamental sustentada nos tempos 1 e 3: base sólida para improvisar em cima sem arpejos' },
  { id: 'groove', label: 'Cozinha', hint: 'Levada da base: fundamental, fundamental, quinta, fundamental' },
  { id: 'triad', label: 'Tríade', hint: 'Fundamental, terça e quinta: 1-3-5-3' },
  { id: 'arpeggio', label: 'Arpejo', hint: 'Todas as notas do acorde subindo (com a sétima, se houver) e a oitava' },
];

/** Fundamental do baixo (a nota de baixo do acorde com barra) na região grave: Mi1 (28) a Ré#2. */
export function bassRootMidi(chord: Chord): number {
  const pc = chord.bass ?? chord.root;
  return 28 + ((((pc - 4) % 12) + 12) % 12);
}

/** Alturas do padrão para `beats` tempos (repete o desenho se o acorde for longo). */
export function bassRolePattern(chord: Chord, role: BassRole, beats = 4): Array<number | null> {
  const r = bassRootMidi(chord);
  const ints = chordIntervals(chord.quality).filter((i) => i > 0 && i < 12);
  const third = ints.find((i) => i === 3 || i === 4) ?? ints.find((i) => i === 2 || i === 5) ?? 4;
  const fifth = ints.find((i) => i >= 6 && i <= 8) ?? 7;
  const seventh = ints.find((i) => i === 9 || i === 10 || i === 11);
  let cell: Array<number | null>;
  if (role === 'groove') cell = [r, r, r + fifth, r];
  else if (role === 'root') cell = [r, null];
  else if (role === 'triad') cell = [r, r + third, r + fifth, r + third];
  else cell = [r, r + third, r + fifth, seventh !== undefined ? r + seventh : r + 12];
  const out: Array<number | null> = [];
  for (let k = 0; k < Math.max(1, Math.round(beats)); k++) out.push(cell[k % cell.length]!);
  return out;
}

/** Notas (sem repetição) do padrão com a digitação no braço, em ordem. */
export function bassRoleNotes(chord: Chord, role: BassRole, tuning: BassTuning): Array<{ midi: number; pos: FretPos; order: number }> {
  const midis = [...new Set(bassRolePattern(chord, role, 4).filter((m): m is number => m !== null))];
  const pos = fingerLine(midis, tuning);
  const out: Array<{ midi: number; pos: FretPos; order: number }> = [];
  midis.forEach((midi, k) => {
    const p = pos[k];
    if (p) out.push({ midi, pos: p, order: k + 1 });
  });
  return out;
}
