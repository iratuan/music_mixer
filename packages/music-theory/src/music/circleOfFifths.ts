import { pc, pcName, type Chord, type Key } from './harmony.js';

/**
 * Ciclo das quintas: dados puros de teoria (sem áudio, sem DOM).
 * - 12 posições no sentido horário (C, G, D, A, E, B, F#/Gb, Db, Ab, Eb, Bb, F);
 * - em cada posição: o tom maior (anel externo), a relativa menor (anel do meio) e o acorde
 *   diminuto da sensível do tom maior (anel interno);
 * - armadura de clave, campo harmônico com funções e as cadências famosas transpostas.
 */
export const CIRCLE_MAJORS: readonly number[] = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];

/** Nomes escolhidos para o ciclo (grafia mais comum de cada tom). */
const MAJOR_NAMES = ['C', 'G', 'D', 'A', 'E', 'B', 'F♯/G♭', 'D♭', 'A♭', 'E♭', 'B♭', 'F'];
const MINOR_NAMES = ['Am', 'Em', 'Bm', 'F♯m', 'C♯m', 'G♯m', 'D♯m/E♭m', 'B♭m', 'Fm', 'Cm', 'Gm', 'Dm'];
const DIM_NAMES = ['B°', 'F♯°', 'C♯°', 'G♯°', 'D♯°', 'A♯°', 'E♯°/F°', 'C°', 'G°', 'D°', 'A°', 'E°'];

export type Ring = 'major' | 'minor' | 'dim';

export interface CircleSlot {
  /** Posição no ciclo (0 = C no topo; +1 = uma quinta acima). */
  readonly index: number;
  readonly major: { readonly root: number; readonly name: string };
  readonly minor: { readonly root: number; readonly name: string };
  readonly dim: { readonly root: number; readonly name: string };
  /** Armadura: número de sustenidos (positivo) ou bemóis (negativo). F#/Gb: 6 (ou −6). */
  readonly signature: number;
}

export const CIRCLE: readonly CircleSlot[] = CIRCLE_MAJORS.map((root, index) => ({
  index,
  major: { root, name: MAJOR_NAMES[index]! },
  minor: { root: pc(root + 9), name: MINOR_NAMES[index]! },
  dim: { root: pc(root + 11), name: DIM_NAMES[index]! },
  signature: index <= 6 ? index : index - 12,
}));

/** Posição no ciclo do tom maior de tônica `root` (ou do maior relativo, para menor). */
export function circleIndex(key: Key): number {
  const major = key.mode === 'major' ? pc(key.tonic) : pc(key.tonic + 3);
  return CIRCLE_MAJORS.indexOf(major);
}

/** Armadura de clave legível: "3 sustenidos (F♯ C♯ G♯)", "sem acidentes". */
const SHARP_ORDER = ['F♯', 'C♯', 'G♯', 'D♯', 'A♯', 'E♯'];
const FLAT_ORDER = ['B♭', 'E♭', 'A♭', 'D♭', 'G♭', 'C♭'];
export function signatureText(sig: number): string {
  if (sig === 0) return 'sem sustenidos nem bemóis';
  const n = Math.abs(sig);
  const list = (sig > 0 ? SHARP_ORDER : FLAT_ORDER).slice(0, n).join(' ');
  return `${n} ${sig > 0 ? (n === 1 ? 'sustenido' : 'sustenidos') : n === 1 ? 'bemol' : 'bemóis'} (${list})`;
}
export function signatureShort(sig: number): string {
  if (sig === 0) return '—';
  return `${Math.abs(sig)}${sig > 0 ? '♯' : '♭'}`;
}

export type HarmonicFunction = 'Tônica' | 'Subdominante' | 'Dominante';

export interface FieldChord {
  /** Grau romano (I, ii, iii, IV, V, vi, vii° no maior; i, ii°, III, iv, v, VI, VII no menor). */
  readonly degree: string;
  readonly chord: Chord;
  readonly fn: HarmonicFunction;
}

const MAJOR_FIELD: ReadonlyArray<[number, string, string, string, HarmonicFunction]> = [
  [0, '', 'maj7', 'I', 'Tônica'],
  [2, 'm', 'm7', 'ii', 'Subdominante'],
  [4, 'm', 'm7', 'iii', 'Tônica'],
  [5, '', 'maj7', 'IV', 'Subdominante'],
  [7, '', '7', 'V', 'Dominante'],
  [9, 'm', 'm7', 'vi', 'Tônica'],
  [11, 'dim', 'm7b5', 'vii°', 'Dominante'],
];
const MINOR_FIELD: ReadonlyArray<[number, string, string, string, HarmonicFunction]> = [
  [0, 'm', 'm7', 'i', 'Tônica'],
  [2, 'dim', 'm7b5', 'ii°', 'Subdominante'],
  [3, '', 'maj7', 'III', 'Tônica'],
  [5, 'm', 'm7', 'iv', 'Subdominante'],
  [7, 'm', 'm7', 'v', 'Dominante'],
  [8, '', 'maj7', 'VI', 'Subdominante'],
  [10, '', '7', 'VII', 'Dominante'],
];

/** Campo harmônico do tom: 7 acordes (tríades ou tétrades) com grau e função. */
export function harmonicField(key: Key, tetrads = false): FieldChord[] {
  const table = key.mode === 'major' ? MAJOR_FIELD : MINOR_FIELD;
  return table.map(([iv, tri, tet, degree, fn]) => ({ degree: tetrads ? tetradDegree(degree, tet) : degree, chord: { root: pc(key.tonic + iv), quality: tetrads ? tet : tri }, fn }));
}
function tetradDegree(d: string, q: string): string {
  if (q === 'maj7') return `${d}maj7`;
  if (q === 'm7b5') return `${d.replace('°', '')}ø7`;
  return `${d}7`;
}

const SHAPES: Record<string, readonly number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  '7': [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  m7b5: [0, 3, 6, 10],
  dim7: [0, 3, 6, 9],
  '6': [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  '9': [0, 4, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
  m9: [0, 3, 7, 10, 14],
  add9: [0, 4, 7, 14],
  '7sus4': [0, 5, 7, 10],
};

/** Intervalos (semitons) do acorde a partir da fundamental. */
export function chordIntervals(quality: string): readonly number[] {
  return SHAPES[quality] ?? (quality.startsWith('m') && !quality.startsWith('maj') ? SHAPES.m! : SHAPES['']!);
}

/** Notas MIDI do acorde numa região confortável (fundamental entre Dó 3 e Si 3); baixo invertido abaixo. */
export function chordMidis(chord: Chord, octaveBase = 48): number[] {
  const root = octaveBase + pc(chord.root);
  const notes = chordIntervals(chord.quality).map((i) => root + i);
  if (chord.bass !== undefined && pc(chord.bass) !== pc(chord.root)) notes.unshift(octaveBase - 12 + pc(chord.bass));
  else notes.unshift(root - 12);
  return notes;
}

/** Nome das notas do acorde ("C E G B"). */
export function chordNoteNames(chord: Chord, flats = false): string[] {
  return chordIntervals(chord.quality).map((i) => pcName(chord.root + i, flats));
}

/** Nome da cifra no estilo do app (C, Am, Bdim → B°, Bm7b5 → Bm7(♭5)). */
export function chordSymbol(chord: Chord, flats = false): string {
  const q = chord.quality === 'dim' ? '°' : chord.quality === 'm7b5' ? 'm7(♭5)' : chord.quality === 'dim7' ? '°7' : chord.quality;
  const bass = chord.bass !== undefined && pc(chord.bass) !== pc(chord.root) ? `/${pcName(chord.bass, flats)}` : '';
  return `${pcName(chord.root, flats)}${q}${bass}`;
}

export interface Cadence {
  readonly id: string;
  readonly name: string;
  readonly style: string;
  /** Graus da cadência (índices 0–6 do campo harmônico; 'V/' etc. não usados aqui). */
  readonly steps: readonly number[];
  /** Só faz sentido neste modo (Andaluza = menor). */
  readonly mode?: 'major' | 'minor';
  /** Usa tétrades (ii7 – V7 – Imaj7). */
  readonly tetrads?: boolean;
}

export const CADENCES: readonly Cadence[] = [
  // Maior
  { id: 'pop', name: 'I – V – vi – IV', style: 'Pop / Rock clássico', steps: [0, 4, 5, 3], mode: 'major' },
  { id: 'doowop', name: 'I – vi – IV – V', style: 'Doo-wop / balada', steps: [0, 5, 3, 4], mode: 'major' },
  { id: 'sadpop', name: 'vi – IV – I – V', style: 'Pop melancólico', steps: [5, 3, 0, 4], mode: 'major' },
  { id: 'canon', name: 'I – V – vi – iii – IV – I – IV – V', style: 'Cânone (barroco / pop)', steps: [0, 4, 5, 2, 3, 0, 3, 4], mode: 'major' },
  { id: 'blues12', name: 'I I I I – IV IV I I – V IV I V', style: 'Blues de 12 compassos', steps: [0, 0, 0, 0, 3, 3, 0, 0, 4, 3, 0, 4], mode: 'major' },
  { id: 'rock145', name: 'I – IV – V – IV', style: 'Rock de três acordes', steps: [0, 3, 4, 3], mode: 'major' },
  { id: 'rhythm', name: 'I – vi – ii – V', style: 'Turnaround (anos 30 / bossa)', steps: [0, 5, 1, 4], mode: 'major', tetrads: true },
  { id: 'royal', name: 'IV – V – iii – vi', style: 'Estrada real (pop japonês)', steps: [3, 4, 2, 5], mode: 'major', tetrads: true },
  { id: 'i-iii-iv', name: 'I – iii – IV – V', style: 'Balada ascendente', steps: [0, 2, 3, 4], mode: 'major' },
  { id: 'i-iv-vi-v', name: 'I – IV – vi – V', style: 'Pop alternativo', steps: [0, 3, 5, 4], mode: 'major' },
  { id: 'gospel', name: 'I – IV – ii – V', style: 'Gospel / soul', steps: [0, 3, 1, 4], mode: 'major', tetrads: true },
  { id: 'neosoul', name: 'IVmaj7 – iii7 – ii7 – Imaj7', style: 'Neo-Soul / R&B descendente', steps: [3, 2, 1, 0], mode: 'major', tetrads: true },
  { id: 'neosoul-vamp', name: 'IVmaj7 – iii7 – vi7', style: 'Neo-Soul Groove Vamp', steps: [3, 2, 5], mode: 'major', tetrads: true },
  { id: 'plagal', name: 'I – IV – I', style: 'Cadência plagal ("amém")', steps: [0, 3, 0], mode: 'major' },
  { id: 'vamp', name: 'I – IV', style: 'Vamp de dois acordes (funk / reggae)', steps: [0, 3], mode: 'major' },
  { id: 'half', name: 'I – ii – IV – V', style: 'Meia cadência (termina no V)', steps: [0, 1, 3, 4], mode: 'major' },
  { id: 'pop80', name: 'I – IV – V – vi', style: 'Pop anos 80', steps: [0, 3, 4, 5], mode: 'major' },
  { id: 'pop-ballad80', name: 'vi – V – IV – V', style: 'Balada anos 80 (Toto / A-ha)', steps: [5, 4, 3, 4], mode: 'major' },
  { id: 'motown', name: 'I – ii – iii – IV', style: 'Motown walkup', steps: [0, 1, 2, 3], mode: 'major', tetrads: true },
  { id: 'folk', name: 'I – V – IV – I', style: 'Folk / Country clássico', steps: [0, 4, 3, 0], mode: 'major' },
  { id: 'pop-anthem', name: 'I – vi – IV – I', style: 'Hino Pop / Britpop', steps: [0, 5, 3, 0], mode: 'major' },
  // Rock & Blues
  { id: 'blues12', name: 'I I I I – IV IV I I – V IV I V', style: 'Blues de 12 compassos', steps: [0, 0, 0, 0, 3, 3, 0, 0, 4, 3, 0, 4], mode: 'major' },
  { id: 'blues8', name: 'I – V – IV – IV – I – V – I – V', style: 'Blues de 8 compassos (Key to the Highway)', steps: [0, 4, 3, 3, 0, 4, 0, 4], mode: 'major' },
  { id: 'rock145', name: 'I – IV – V – IV', style: 'Rock de três acordes', steps: [0, 3, 4, 3], mode: 'major' },
  { id: 'southern-rock', name: 'I – IV – I – V', style: 'Country rock / Southern rock', steps: [0, 3, 0, 4], mode: 'major' },
  { id: 'grunge', name: 'I – IV – vi – IV', style: 'Rock alternativo / Grunge', steps: [0, 3, 5, 3], mode: 'major' },
  // Brasil / MPB, Samba & Regional
  { id: 'bossa', name: 'ii7 – V7 – Imaj7 – vi7', style: 'Bossa nova tradicional', steps: [1, 4, 0, 5], mode: 'major', tetrads: true },
  { id: 'bossa-steps', name: 'Imaj7 – ii7 – iii7 – ii7', style: 'Bossa em degraus (Garota de Ipanema)', steps: [0, 1, 2, 1], mode: 'major', tetrads: true },
  { id: 'samba', name: 'I – vi – ii – V – I', style: 'Samba / Partido alto', steps: [0, 5, 1, 4, 0], mode: 'major', tetrads: true },
  { id: 'mpb', name: 'I – iii – vi – ii – V', style: 'MPB / samba-canção', steps: [0, 2, 5, 1, 4], mode: 'major', tetrads: true },
  { id: 'choro', name: 'I – IV – ii – V – I', style: 'Choro / Seresta', steps: [0, 3, 1, 4, 0], mode: 'major', tetrads: true },
  { id: 'choro-maxixe', name: 'I – V – I – IV – I – V – I', style: 'Choro clássico / Maxixe', steps: [0, 4, 0, 3, 0, 4, 0], mode: 'major' },
  { id: 'clube-esquina', name: 'Imaj7 – IVmaj7 – iii7 – vi7', style: 'Clube da Esquina / MPB mineira', steps: [0, 3, 2, 5], mode: 'major', tetrads: true },
  { id: 'ijexa', name: 'I – ii – IV – I', style: 'Ijexá / Samba de Roda', steps: [0, 1, 3, 0], mode: 'major' },
  { id: 'baiao', name: 'i – VII – i – VII', style: 'Baião / Forró pé de serra', steps: [0, 6, 0, 6], mode: 'minor' },
  { id: 'forro', name: 'i – iv – v – VII', style: 'Forró pé de serra menor', steps: [0, 3, 4, 6], mode: 'minor' },
  { id: 'maracatu', name: 'i – VI – i – VI', style: 'Maracatu / Afropop', steps: [0, 5, 0, 5], mode: 'minor' },
  // Jazz & Soul
  { id: 'jazz', name: 'ii – V – I', style: 'Jazz turnaround', steps: [1, 4, 0] },
  { id: 'jazz7', name: 'ii7 – V7 – Imaj7', style: 'Jazz com tétrades', steps: [1, 4, 0], tetrads: true },
  { id: 'neosoul-251', name: 'ii7 – V7 – iii7 – vi7', style: 'Neo-Soul Turnaround (Badu)', steps: [1, 4, 2, 5], mode: 'major', tetrads: true },
  { id: 'jazz-circle4', name: 'iii7 – vi7 – ii7 – V7', style: 'Jazz turnaround cíclico (III-VI-II-V)', steps: [2, 5, 1, 4], mode: 'major', tetrads: true },
  { id: 'jazz-bird', name: 'Imaj7 – IVmaj7 – iii7 – vi7 – ii7 – V7', style: 'Bebop / Bird blues turnaround', steps: [0, 3, 2, 5, 1, 4], mode: 'major', tetrads: true },
  { id: 'jazz-rhythm', name: 'Imaj7 – vi7 – ii7 – V7 – iii7 – vi7 – ii7 – V7', style: 'Rhythm Changes (A)', steps: [0, 5, 1, 4, 2, 5, 1, 4], mode: 'major', tetrads: true },
  { id: 'soul-ascend', name: 'ii7 – iii7 – IVmaj7 – V7', style: 'Soul ascendente (Stevie Wonder)', steps: [1, 2, 3, 4], mode: 'major', tetrads: true },
  { id: 'authentic', name: 'I – IV – V – I', style: 'Cadência autêntica', steps: [0, 3, 4, 0] },
  { id: 'fourths', name: 'iii – vi – ii – V – I', style: 'Ciclo de quartas', steps: [2, 5, 1, 4, 0] },
  { id: 'fullcycle', name: 'I – IV – vii – iii – vi – ii – V – I', style: 'Ciclo diatônico completo', steps: [0, 3, 6, 2, 5, 1, 4, 0], tetrads: true },
  // Menor
  { id: 'andalusian', name: 'i – VII – VI – V', style: 'Andaluza / flamenco', steps: [0, 6, 5, 4], mode: 'minor' },
  { id: 'passacaglia', name: 'i – iv – VII – III – VI – ii° – V – i', style: 'Passacaglia / Folia barroca', steps: [0, 3, 6, 2, 5, 1, 4, 0], mode: 'minor', tetrads: true },
  { id: 'epic', name: 'i – VI – III – VII', style: 'Épico / rock menor', steps: [0, 5, 2, 6], mode: 'minor' },
  { id: 'aeolian', name: 'i – VII – VI – VII', style: 'Eólio (rock / metal)', steps: [0, 6, 5, 6], mode: 'minor' },
  { id: 'minor-blues', name: 'i – iv – v – i', style: 'Menor natural / blues menor', steps: [0, 3, 4, 0], mode: 'minor' },
  { id: 'minor-turnaround', name: 'i7 – iv7 – V7 – i7', style: 'Turnaround menor harmônico', steps: [0, 3, 4, 0], mode: 'minor', tetrads: true },
  { id: 'dorian-vamp', name: 'i7 – IV7', style: 'Dórico Vamp (Santana / So What)', steps: [0, 3], mode: 'minor', tetrads: true },
  { id: 'minor-vamp', name: 'i7 – iv7', style: 'Vamp menor (Soul jazz)', steps: [0, 3], mode: 'minor', tetrads: true },
  { id: 'dark-wave', name: 'i – VI – i – VII', style: 'Darkwave / Post-punk', steps: [0, 5, 0, 6], mode: 'minor' },
  { id: 'synthwave', name: 'i – VI – iv – v', style: 'Synthwave / Retrowave', steps: [0, 5, 3, 4], mode: 'minor' },
  { id: 'minor-cycle', name: 'i – iv – VII – III', style: 'Ciclo de quartas menor', steps: [0, 3, 6, 2], mode: 'minor' },
  { id: 'lament', name: 'i – VI – iv – i', style: 'Lamento', steps: [0, 5, 3, 0], mode: 'minor' },
  { id: 'minor-iivi', name: 'iiø – V7 – i', style: 'Jazz menor', steps: [1, 4, 0], mode: 'minor', tetrads: true },
  { id: 'minor-pop', name: 'i – III – VII – VI', style: 'Pop menor', steps: [0, 2, 6, 5], mode: 'minor' },
  { id: 'flamenco-rumba', name: 'i – iv – III – VII', style: 'Rumba Flamenca / Gipsy', steps: [0, 3, 2, 6], mode: 'minor' },
];

/** Estilos para filtrar a lista de progressões. */
export type ProgressionGenre = 'Pop' | 'Rock & Blues' | 'Jazz & Soul' | 'Brasil' | 'Clássica' | 'Menor';
export const PROGRESSION_GENRES: readonly ProgressionGenre[] = ['Pop', 'Rock & Blues', 'Jazz & Soul', 'Brasil', 'Clássica', 'Menor'];
const GENRE_OF: Record<string, ProgressionGenre> = {
  pop: 'Pop', doowop: 'Pop', sadpop: 'Pop', royal: 'Pop', 'i-iii-iv': 'Pop', 'i-iv-vi-v': 'Pop', vamp: 'Pop', pop80: 'Pop', 'pop-ballad80': 'Pop', motown: 'Pop', folk: 'Pop', 'pop-anthem': 'Pop',
  blues12: 'Rock & Blues', blues8: 'Rock & Blues', rock145: 'Rock & Blues', 'southern-rock': 'Rock & Blues', grunge: 'Rock & Blues', authentic: 'Rock & Blues',
  jazz: 'Jazz & Soul', jazz7: 'Jazz & Soul', 'jazz-circle4': 'Jazz & Soul', 'jazz-bird': 'Jazz & Soul', 'jazz-rhythm': 'Jazz & Soul', rhythm: 'Jazz & Soul', gospel: 'Jazz & Soul', neosoul: 'Jazz & Soul', 'neosoul-vamp': 'Jazz & Soul', 'neosoul-251': 'Jazz & Soul', 'soul-ascend': 'Jazz & Soul', fourths: 'Jazz & Soul', 'minor-iivi': 'Jazz & Soul', 'dorian-vamp': 'Jazz & Soul', 'minor-vamp': 'Jazz & Soul',
  bossa: 'Brasil', 'bossa-steps': 'Brasil', samba: 'Brasil', mpb: 'Brasil', choro: 'Brasil', 'choro-maxixe': 'Brasil', 'clube-esquina': 'Brasil', baiao: 'Brasil', forro: 'Brasil', maracatu: 'Brasil', ijexa: 'Brasil',
  canon: 'Clássica', plagal: 'Clássica', half: 'Clássica', fullcycle: 'Clássica', passacaglia: 'Clássica',
  andalusian: 'Menor', epic: 'Menor', aeolian: 'Menor', 'minor-blues': 'Menor', 'minor-turnaround': 'Menor', 'minor-cycle': 'Menor', lament: 'Menor', 'minor-pop': 'Menor', 'dark-wave': 'Menor', synthwave: 'Menor', 'flamenco-rumba': 'Menor',
};
/** Estilo da progressão (para os filtros). */
export function cadenceGenre(c: Cadence): ProgressionGenre {
  return GENRE_OF[c.id] ?? (c.mode === 'minor' ? 'Menor' : 'Pop');
}

/** Acordes da cadência no tom. No menor, o V da Andaluza e do ii–V–i é maior (dominante da harmônica). */
export function cadenceChords(c: Cadence, key: Key, tetrads = false): FieldChord[] {
  const field = harmonicField(key, tetrads || !!c.tetrads);
  return c.steps.map((i, k) => {
    const f = field[i]!;
    if (key.mode === 'minor' && i === 4 && (c.id === 'andalusian' || (k === c.steps.length - 2 && c.steps[c.steps.length - 1] === 0))) {
      return { ...f, degree: tetrads || c.tetrads ? 'V7' : 'V', chord: { root: f.chord.root, quality: tetrads || c.tetrads ? '7' : '' }, fn: 'Dominante' };
    }
    return f;
  });
}

/** Em que anel e posição do ciclo um acorde aparece (para iluminar a fatia), ou null. */
export function circleSlotOf(chord: Chord): { ring: Ring; index: number } | null {
  const r = pc(chord.root);
  const q = chord.quality;
  const minor = q.startsWith('m') && !q.startsWith('maj') && q !== 'm7b5';
  const dim = q === 'dim' || q === 'dim7' || q === 'm7b5';
  if (dim) {
    const i = CIRCLE.findIndex((s) => s.dim.root === r);
    return i >= 0 ? { ring: 'dim', index: i } : null;
  }
  if (minor) {
    const i = CIRCLE.findIndex((s) => s.minor.root === r);
    return i >= 0 ? { ring: 'minor', index: i } : null;
  }
  const i = CIRCLE.findIndex((s) => s.major.root === r);
  return i >= 0 ? { ring: 'major', index: i } : null;
}

/** Hz da nota MIDI. */
export const midiHz = (m: number): number => 440 * 2 ** ((m - 69) / 12);
