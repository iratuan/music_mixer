/**
 * Ear training: gerador procedural de desafios auditivos. Puro (sem áudio nem tela): cada desafio descreve
 * o que tocar (eventos em tempos), como o usuário responde e qual é o gabarito. 8 categorias, 60+ variações.
 */
export type EarCategory = 'notes' | 'intervals' | 'chords' | 'circle' | 'scales' | 'rhythm' | 'bass' | 'tuning';
export type EarInteraction = 'choice' | 'pick' | 'sequence' | 'circle' | 'tap' | 'detune';
export type EarTimbre = 'piano' | 'rhodes' | 'guitar' | 'bass';

export interface EarEvent {
  /** Início em tempos. */
  readonly at: number;
  /** Notas MIDI (podem ser fracionárias, para afinação). Vazio + `click` = batida de metrônomo/bateria. */
  readonly midis: readonly number[];
  readonly dur: number;
  readonly click?: 'accent' | 'tick';
}
export interface EarChallenge {
  readonly typeId: string;
  readonly category: EarCategory;
  readonly interaction: EarInteraction;
  readonly prompt: string;
  readonly bpm: number;
  readonly timbre: EarTimbre;
  /** Nota de referência (âncora), tocada antes e acesa no palco. */
  readonly root: number;
  /** Tocado antes do som principal (a âncora). */
  readonly reference: readonly EarEvent[];
  readonly events: readonly EarEvent[];
  /** Nota longa de fundo (bordão). */
  readonly drone?: number;
  readonly options?: readonly string[];
  readonly answerIndex?: number;
  /** Para cada opção, o que tocar (comparação "sua resposta vs. correta"). */
  readonly optionEvents?: ReadonlyArray<readonly EarEvent[]>;
  /** Classes de altura corretas (clicar no palco): uma para `pick`, uma por passo em `sequence` e `circle`. */
  readonly answerPcs?: readonly number[];
  /** Notas MIDI da resposta (para mostrar o caminho no teclado). */
  readonly answerMidis?: readonly number[];
  /** Batidas esperadas, em tempos, para `tap`. */
  readonly rhythm?: readonly number[];
  /** Desvio em cents da 2ª nota (detune). */
  readonly cents?: number;
  readonly explain: string;
}

export interface EarType {
  readonly id: string;
  readonly category: EarCategory;
  readonly title: string;
  readonly level: 1 | 2 | 3;
  readonly interaction: EarInteraction;
  readonly make: (rng: () => number) => EarChallenge;
}

export const EAR_CATEGORIES: ReadonlyArray<{ readonly id: EarCategory; readonly title: string; readonly blurb: string }> = [
  { id: 'notes', title: 'Notas & ouvido relativo', blurb: 'Nota-âncora, ditado melódico e registros.' },
  { id: 'intervals', title: 'Intervalos', blurb: 'Melódicos, harmônicos, compostos e construtor.' },
  { id: 'chords', title: 'Qualidade de acordes', blurb: 'Tríades, tétrades, inversões e tensões.' },
  { id: 'circle', title: 'Círculo das quintas', blurb: 'Cadências, graus e modulação.' },
  { id: 'scales', title: 'Escalas & modos', blurb: 'Escalas essenciais e os 7 modos sobre bordão.' },
  { id: 'rhythm', title: 'Ritmo & compasso', blurb: 'Eco rítmico e detecção de compasso.' },
  { id: 'bass', title: 'Baixo & fundamental', blurb: 'Encontre a fundamental do acorde no braço.' },
  { id: 'tuning', title: 'Afinação', blurb: 'Micro-afinação em cents.' },
];

export const NOTE_NAMES = ['Dó', 'Dó#', 'Ré', 'Ré#', 'Mi', 'Fá', 'Fá#', 'Sol', 'Sol#', 'Lá', 'Lá#', 'Si'];
export const INTERVAL_NAMES: Readonly<Record<number, string>> = {
  0: 'Uníssono', 1: '2ª menor', 2: '2ª maior', 3: '3ª menor', 4: '3ª maior', 5: '4ª justa', 6: 'Trítono', 7: '5ª justa', 8: '6ª menor', 9: '6ª maior', 10: '7ª menor', 11: '7ª maior', 12: 'Oitava', 13: '9ª menor', 14: '9ª maior',
};

export const CHORDS: Readonly<Record<string, { name: string; iv: readonly number[] }>> = {
  maj: { name: 'Maior', iv: [0, 4, 7] }, min: { name: 'Menor', iv: [0, 3, 7] }, dim: { name: 'Diminuta', iv: [0, 3, 6] }, aug: { name: 'Aumentada', iv: [0, 4, 8] },
  sus2: { name: 'sus2', iv: [0, 2, 7] }, sus4: { name: 'sus4', iv: [0, 5, 7] },
  maj7: { name: '7M', iv: [0, 4, 7, 11] }, dom7: { name: '7 (dominante)', iv: [0, 4, 7, 10] }, m7: { name: 'm7', iv: [0, 3, 7, 10] },
  m7b5: { name: 'm7(b5)', iv: [0, 3, 6, 10] }, dim7: { name: 'dim7', iv: [0, 3, 6, 9] }, mMaj7: { name: 'm(7M)', iv: [0, 3, 7, 11] },
  n9: { name: '9', iv: [0, 4, 7, 10, 14] }, n11: { name: '11', iv: [0, 7, 10, 14, 17] }, s11: { name: '#11', iv: [0, 4, 7, 10, 18] }, n13: { name: '13', iv: [0, 4, 7, 10, 21] },
};

export const SCALES: Readonly<Record<string, { name: string; iv: readonly number[] }>> = {
  major: { name: 'Maior', iv: [0, 2, 4, 5, 7, 9, 11, 12] }, minor: { name: 'Menor natural', iv: [0, 2, 3, 5, 7, 8, 10, 12] },
  harmonic: { name: 'Menor harmônica', iv: [0, 2, 3, 5, 7, 8, 11, 12] }, melodic: { name: 'Menor melódica', iv: [0, 2, 3, 5, 7, 9, 11, 12] },
  pentMaj: { name: 'Pentatônica maior', iv: [0, 2, 4, 7, 9, 12] }, pentMin: { name: 'Pentatônica menor', iv: [0, 3, 5, 7, 10, 12] },
  blues: { name: 'Blues', iv: [0, 3, 5, 6, 7, 10, 12] },
};
export const MODES: Readonly<Record<string, { name: string; iv: readonly number[]; note: string }>> = {
  ionian: { name: 'Jônio', iv: [0, 2, 4, 5, 7, 9, 11, 12], note: 'é a escala maior' },
  dorian: { name: 'Dórico', iv: [0, 2, 3, 5, 7, 9, 10, 12], note: 'menor com a 6ª maior' },
  phrygian: { name: 'Frígio', iv: [0, 1, 3, 5, 7, 8, 10, 12], note: 'tem a 2ª menor' },
  lydian: { name: 'Lídio', iv: [0, 2, 4, 6, 7, 9, 11, 12], note: 'tem a 4ª aumentada' },
  mixolydian: { name: 'Mixolídio', iv: [0, 2, 4, 5, 7, 9, 10, 12], note: 'maior com a 7ª menor' },
  aeolian: { name: 'Eólio', iv: [0, 2, 3, 5, 7, 8, 10, 12], note: 'é a menor natural' },
  locrian: { name: 'Lócrio', iv: [0, 1, 3, 5, 6, 8, 10, 12], note: 'tem b2 e b5' },
};

export const EAR_CADENCES: ReadonlyArray<{ id: string; label: string; steps: ReadonlyArray<readonly [number, string]> }> = [
  { id: 'I-IV-V-I', label: 'I – IV – V – I', steps: [[0, 'maj'], [5, 'maj'], [7, 'maj'], [0, 'maj']] },
  { id: 'II-V-I', label: 'II – V – I', steps: [[2, 'm7'], [7, 'dom7'], [0, 'maj7']] },
  { id: 'I-VI-II-V', label: 'I – VI – II – V', steps: [[0, 'maj7'], [9, 'm7'], [2, 'm7'], [7, 'dom7']] },
  { id: 'I-bVII-IV', label: 'I – bVII – IV', steps: [[0, 'maj'], [10, 'maj'], [5, 'maj']] },
  { id: 'I-V-VI-IV', label: 'I – V – vi – IV', steps: [[0, 'maj'], [7, 'maj'], [9, 'min'], [5, 'maj']] },
  { id: 'VI-IV-I-V', label: 'vi – IV – I – V', steps: [[9, 'min'], [5, 'maj'], [0, 'maj'], [7, 'maj']] },
];
export const DEGREES: ReadonlyArray<{ label: string; semis: number; q: string }> = [
  { label: 'I', semis: 0, q: 'maj7' }, { label: 'IIm', semis: 2, q: 'm7' }, { label: 'IIIm', semis: 4, q: 'm7' }, { label: 'IV', semis: 5, q: 'maj7' },
  { label: 'V7', semis: 7, q: 'dom7' }, { label: 'VIm', semis: 9, q: 'm7' }, { label: 'VIIm7(b5)', semis: 11, q: 'm7b5' },
];
export const METERS: ReadonlyArray<{ id: string; label: string; unit: number; units: number; accents: readonly number[] }> = [
  { id: '4/4', label: '4/4', unit: 1, units: 4, accents: [0] },
  { id: '3/4', label: '3/4', unit: 1, units: 3, accents: [0] },
  { id: '6/8', label: '6/8', unit: 0.5, units: 6, accents: [0, 3] },
  { id: '5/4', label: '5/4', unit: 1, units: 5, accents: [0, 3] },
  { id: '7/8', label: '7/8', unit: 0.5, units: 7, accents: [0, 2, 4] },
];
export const RHYTHM_LEVELS: ReadonlyArray<ReadonlyArray<readonly number[]>> = [
  [[0, 1, 2, 3], [0, 1, 1.5, 2, 3], [0, 0.5, 1, 2, 3], [0, 1, 2, 2.5, 3]],
  [[0, 0.5, 1, 1.5, 2, 3], [0, 0.25, 0.5, 1, 2, 2.5, 3], [0, 1, 1.75, 2, 3], [0, 0.5, 0.75, 1, 2, 3.5]],
  [[0, 1 / 3, 2 / 3, 1, 2, 3], [0, 1, 1 + 1 / 3, 1 + 2 / 3, 2, 3], [0, 0.5, 1, 2, 2 + 1 / 3, 2 + 2 / 3, 3]],
  [[0, 0.5, 1.5, 2.5, 3], [0, 0.75, 1.5, 2, 3.5], [0.5, 1.5, 2.5, 3.5], [0, 1.5, 2, 3.5, 4, 5.5, 6, 7]],
];

// ---------------------------------------------------------------- utilidades
const pick = <T,>(rng: () => number, list: readonly T[]): T => list[Math.floor(rng() * list.length) % list.length]!;
const shuffle = <T,>(rng: () => number, list: readonly T[]): T[] => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
};
const pc = (m: number) => ((Math.round(m) % 12) + 12) % 12;
/** Tônica aleatória entre Dó3 (48) e Fá#3 (54): dá espaço para 1,5 oitava acima no palco de 2 oitavas. */
const randomRoot = (rng: () => number) => 48 + Math.floor(rng() * 7);
const note = (at: number, midi: number, dur = 0.9): EarEvent => ({ at, midis: [midi], dur });
const together = (at: number, midis: readonly number[], dur = 1.6): EarEvent => ({ at, midis, dur });
const seq = (midis: readonly number[], step = 1, dur = 0.9): EarEvent[] => midis.map((m, i) => note(i * step, m, dur));

function base(typeId: string, category: EarCategory, interaction: EarInteraction, root: number, rest: Partial<EarChallenge> & Pick<EarChallenge, 'prompt' | 'events' | 'explain'>): EarChallenge {
  return { typeId, category, interaction, bpm: 80, timbre: 'piano', root, reference: [], ...rest };
}

/** Monta uma pergunta de escolha com as opções embaralhadas e os sons de cada opção. */
function choice(typeId: string, category: EarCategory, root: number, labels: readonly string[], correct: number, eventsOf: (i: number) => readonly EarEvent[], prompt: string, explain: string, extra: Partial<EarChallenge> = {}): EarChallenge {
  const order = shuffle(Math.random, labels.map((_, i) => i));
  return base(typeId, category, 'choice', root, {
    prompt,
    events: eventsOf(correct),
    options: order.map((i) => labels[i]!),
    answerIndex: order.indexOf(correct),
    optionEvents: order.map((i) => eventsOf(i)),
    explain,
    ...extra,
  });
}

// ---------------------------------------------------------------- fábricas de tipos
const types: EarType[] = [];
const add = (id: string, category: EarCategory, title: string, level: 1 | 2 | 3, interaction: EarInteraction, make: EarType['make']) => types.push({ id, category, title, level, interaction, make });

// 1. Notas
const ANCHOR = [
  { l: 1 as const, name: 'Tônica, terça e quinta', pool: [0, 4, 7] },
  { l: 2 as const, name: 'Notas da escala maior', pool: [0, 2, 4, 5, 7, 9, 11] },
  { l: 3 as const, name: 'Todas as 12 notas', pool: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
];
for (const a of ANCHOR) {
  add(`notes-anchor-${a.l}`, 'notes', `Nota-âncora: ${a.name}`, a.l, 'pick', (rng) => {
    const root = randomRoot(rng);
    const st = pick(rng, a.pool);
    const target = root + st + (rng() < 0.3 ? 12 : 0);
    return base(`notes-anchor-${a.l}`, 'notes', 'pick', root, {
      prompt: 'Ouça a nota de referência e depois a nota misteriosa. Clique nela no instrumento.',
      reference: [note(0, root, 1)], events: [note(0, target, 1.2)], answerPcs: [pc(target)], answerMidis: [target],
      explain: `Era ${NOTE_NAMES[pc(target)]}: ${INTERVAL_NAMES[st] ?? st} acima da referência.`,
    });
  });
}
for (let n = 2; n <= 8; n++) {
  add(`notes-dictation-${n}`, 'notes', `Ditado melódico: ${n} notas`, n <= 3 ? 1 : n <= 5 ? 2 : 3, 'sequence', (rng) => {
    const root = randomRoot(rng);
    const pool = n <= 3 ? [0, 2, 4, 7] : [0, 2, 4, 5, 7, 9, 11, 12];
    const ms = Array.from({ length: n }, () => root + pick(rng, pool));
    return base(`notes-dictation-${n}`, 'notes', 'sequence', root, {
      prompt: `Ouça ${n} notas e toque a melodia clicando nas notas, na ordem.`, reference: [note(0, root, 1)], events: seq(ms, 0.8, 0.7),
      answerPcs: ms.map(pc), answerMidis: ms, explain: `Melodia: ${ms.map((m) => NOTE_NAMES[pc(m)]).join(' – ')}.`,
    });
  });
}
for (const [id, title, lo] of [['octave-bass', 'Registros: grave, médio ou agudo', 0], ['octave-wide', 'Registros: 3 oitavas', 1]] as const) {
  add(`notes-${id}`, 'notes', title, lo === 0 ? 1 : 2, 'choice', (rng) => {
    const reg = Math.floor(rng() * 3);
    const m = [36, 48, 72][reg]! + Math.floor(rng() * 12);
    const labels = ['Grave', 'Médio', 'Agudo'];
    return choice(`notes-${id}`, 'notes', 60, labels, reg, (i) => [note(0, [36, 48, 72][i]! + (m % 12), 1.2)], 'Em qual registro está a nota?', `A nota estava na região ${labels[reg]!.toLowerCase()}.`, { reference: [], events: [note(0, m, 1.4)], timbre: lo === 0 ? 'bass' : 'piano' });
  });
}

// 2. Intervalos
const BASIC = [1, 2, 3, 4, 5, 7, 12];
const COMPOUND = [6, 8, 9, 10, 11, 13, 14];
const intervalMake = (id: string, set: readonly number[], dir: 'asc' | 'desc' | 'harm', timbre: EarTimbre = 'piano'): EarType['make'] => (rng) => {
  const root = randomRoot(rng) + (dir === 'desc' ? 12 : 0);
  const labels = set.map((s) => INTERVAL_NAMES[s]!);
  const ci = Math.floor(rng() * set.length);
  const ev = (i: number): EarEvent[] => {
    const s = set[i]!;
    return dir === 'harm' ? [together(0, [root, root + s], 1.8)] : dir === 'asc' ? [note(0, root, 0.9), note(1, root + s, 1.2)] : [note(0, root, 0.9), note(1, root - s, 1.2)];
  };
  const word = dir === 'asc' ? 'ascendente' : dir === 'desc' ? 'descendente' : 'harmônico (juntas)';
  return choice(id, 'intervals', root, labels, ci, ev, `Que intervalo ${word} você ouviu?`, `Era ${labels[ci]} (${set[ci]} semitons).`, { timbre });
};
add('int-basic-asc', 'intervals', 'Duelo básico: ascendente', 1, 'choice', intervalMake('int-basic-asc', BASIC, 'asc'));
add('int-basic-desc', 'intervals', 'Duelo básico: descendente', 1, 'choice', intervalMake('int-basic-desc', BASIC, 'desc'));
add('int-basic-harm', 'intervals', 'Duelo básico: harmônico', 2, 'choice', intervalMake('int-basic-harm', BASIC, 'harm'));
add('int-comp-asc', 'intervals', 'Compostos e dissonâncias: ascendente', 2, 'choice', intervalMake('int-comp-asc', COMPOUND, 'asc'));
add('int-comp-desc', 'intervals', 'Compostos e dissonâncias: descendente', 3, 'choice', intervalMake('int-comp-desc', COMPOUND, 'desc'));
add('int-comp-harm', 'intervals', 'Compostos e dissonâncias: harmônico', 3, 'choice', intervalMake('int-comp-harm', COMPOUND, 'harm'));
add('int-all-bass', 'intervals', 'Todos os intervalos no baixo', 3, 'choice', intervalMake('int-all-bass', [...BASIC, ...COMPOUND], 'asc', 'bass'));
add('int-tritone', 'intervals', 'Caça ao trítono', 2, 'choice', (rng) => {
  const root = randomRoot(rng);
  const set = [5, 6, 7];
  const ci = Math.floor(rng() * 3);
  return choice('int-tritone', 'intervals', root, set.map((s) => INTERVAL_NAMES[s]!), ci, (i) => [together(0, [root, root + set[i]!], 1.8)], 'Qual é o intervalo? Cuidado com o trítono.', `Era ${INTERVAL_NAMES[set[ci]!]}.`);
});
add('int-builder', 'intervals', 'Construtor de intervalos no instrumento', 2, 'pick', (rng) => {
  const root = randomRoot(rng);
  const s = pick(rng, [3, 4, 5, 7, 9, 10, 12]);
  return base('int-builder', 'intervals', 'pick', root, {
    prompt: `A nota de referência está acesa. Clique na nota que forma uma ${INTERVAL_NAMES[s]} acima dela.`,
    reference: [note(0, root, 1)], events: [together(0, [root, root + s], 1.8)], answerPcs: [pc(root + s)], answerMidis: [root + s],
    explain: `${INTERVAL_NAMES[s]} = ${s} semitons acima: ${NOTE_NAMES[pc(root + s)]}.`,
  });
});

// 3. Acordes
const chordMake = (id: string, keys: readonly string[], opts: { invert?: boolean; timbre?: EarTimbre } = {}): EarType['make'] => (rng) => {
  const root = randomRoot(rng) - 12 + 12;
  const labels = keys.map((k) => CHORDS[k]!.name);
  const ci = Math.floor(rng() * keys.length);
  const inv = opts.invert ? Math.floor(rng() * 3) : 0;
  const voicing = (k: string) => {
    let m = CHORDS[k]!.iv.map((i) => root + i);
    for (let r = 0; r < inv && m.length > 1; r++) m = [...m.slice(1), m[0]! + 12];
    return m;
  };
  return choice(id, 'chords', root, labels, ci, (i) => [together(0, voicing(keys[i]!), 2)], opts.invert ? 'Qual é a qualidade do acorde (pode estar invertido)?' : 'Qual é a qualidade do acorde?', `Era ${labels[ci]}: ${CHORDS[keys[ci]!]!.iv.map((i) => NOTE_NAMES[pc(root + i)]).join(' – ')}.`, { timbre: opts.timbre ?? 'piano' });
};
add('chord-triad', 'chords', 'Tríades: estado fundamental', 1, 'choice', chordMake('chord-triad', ['maj', 'min', 'dim', 'aug']));
add('chord-triad-inv', 'chords', 'Tríades invertidas', 2, 'choice', chordMake('chord-triad-inv', ['maj', 'min', 'dim', 'aug'], { invert: true }));
add('chord-sus', 'chords', 'Tríades com sus2 e sus4', 2, 'choice', chordMake('chord-sus', ['maj', 'min', 'sus2', 'sus4']));
add('chord-tetrad', 'chords', 'Tétrades essenciais', 2, 'choice', chordMake('chord-tetrad', ['maj7', 'dom7', 'm7', 'm7b5']));
add('chord-jazz', 'chords', 'Vocabulário jazz/MPB', 3, 'choice', chordMake('chord-jazz', ['maj7', 'dom7', 'm7', 'm7b5', 'dim7', 'mMaj7'], { timbre: 'rhodes' }));
add('chord-ext', 'chords', 'Acordes com tensões', 3, 'choice', chordMake('chord-ext', ['dom7', 'n9', 'n11', 's11', 'n13'], { timbre: 'rhodes' }));
add('chord-ext-piano', 'chords', 'Tensões ao piano de cauda', 3, 'choice', chordMake('chord-ext-piano', ['maj7', 'n9', 's11', 'n13']));

// 4. Círculo das quintas
const circleMake = (cad: (typeof EAR_CADENCES)[number]): EarType['make'] => (rng) => {
  const tonic = 48 + Math.floor(rng() * 12);
  const chords = cad.steps.map(([s, q]) => CHORDS[q]!.iv.map((i) => tonic + s + i));
  return base(`circle-${cad.id}`, 'circle', 'circle', tonic, {
    prompt: 'O centro tonal (I) está aceso no círculo. Ouça a progressão e clique nos setores dos acordes, na ordem.',
    bpm: 70, reference: [together(0, CHORDS.maj!.iv.map((i) => tonic + i), 1.4)], events: chords.map((c, i) => together(i * 1.6, c, 1.8)),
    answerPcs: cad.steps.map(([s]) => pc(tonic + s)), explain: `Cadência ${cad.label}.`,
  });
};
for (const cad of EAR_CADENCES) add(`circle-${cad.id}`, 'circle', `Radar: ${cad.label}`, cad.id === 'I-IV-V-I' ? 1 : cad.id === 'II-V-I' ? 2 : 3, 'circle', circleMake(cad));
for (const [id, title, lvl, degs] of [['degree-tri', 'Identificar grau (campo harmônico)', 2, [0, 3, 4, 5]], ['degree-all', 'Identificar grau: todos os 7', 3, [0, 1, 2, 3, 4, 5, 6]]] as const) {
  add(`circle-${id}`, 'circle', title, lvl, 'choice', (rng) => {
    const tonic = 48 + Math.floor(rng() * 12);
    const labels = degs.map((d) => DEGREES[d]!.label);
    const ci = Math.floor(rng() * degs.length);
    const chordOf = (i: number) => CHORDS[DEGREES[degs[i]!]!.q]!.iv.map((x) => tonic + DEGREES[degs[i]!]!.semis + x);
    return choice(`circle-${id}`, 'circle', tonic, labels, ci, (i) => [together(0, chordOf(i), 1.8)], 'O acorde de repouso (I) toca primeiro. Que grau foi tocado depois?', `Era o grau ${labels[ci]}.`, {
      reference: [together(0, CHORDS.maj7!.iv.map((x) => tonic + x), 1.6)], answerPcs: [pc(tonic + DEGREES[degs[ci]!]!.semis)],
    });
  });
}
add('circle-modulation', 'circle', 'Modulação: o tom mudou?', 3, 'choice', (rng) => {
  const tonic = 48 + Math.floor(rng() * 12);
  const mod = rng() < 0.5;
  const shift = pick(rng, [2, 5, 7]);
  const prog = (t: number) => [[0, 'maj'], [5, 'maj'], [7, 'dom7'], [0, 'maj']].map(([s, q], i) => together(i * 1.4, CHORDS[q as string]!.iv.map((x) => t + (s as number) + x), 1.6));
  const first = prog(tonic);
  const second = prog(mod ? tonic + shift : tonic).map((e) => ({ ...e, at: e.at + 6 }));
  const labels = ['Continuou no mesmo tom', 'Modulou para outro tom'];
  return choice('circle-modulation', 'circle', tonic, labels, mod ? 1 : 0, () => [...first, ...second], 'Duas frases em sequência: o centro tonal mudou na segunda?', mod ? `Modulou: a 2ª frase está ${shift} semitons acima.` : 'A 2ª frase repete o mesmo tom.', { bpm: 70 });
});

// 5. Escalas e modos
for (const [k, sc] of Object.entries(SCALES)) {
  add(`scale-${k}`, 'scales', `Escala: ${sc.name}`, k === 'major' || k === 'minor' ? 1 : 2, 'choice', (rng) => {
    const root = randomRoot(rng);
    const keys = Object.keys(SCALES);
    const pool = shuffle(rng, keys.filter((x) => x !== k)).slice(0, 3);
    const labels = shuffle(rng, [k, ...pool]).map((x) => SCALES[x]!.name);
    const names = Object.fromEntries(Object.entries(SCALES).map(([key, v]) => [v.name, key]));
    const ci = labels.indexOf(sc.name);
    return choice(`scale-${k}`, 'scales', root, labels, ci, (i) => seq(SCALES[names[labels[i]!]!]!.iv.map((x) => root + x), 0.5, 0.45), 'Qual escala foi tocada?', `Era a escala ${sc.name}.`, { bpm: 100 });
  });
}
for (const [k, md] of Object.entries(MODES)) {
  add(`mode-${k}`, 'scales', `Modo ${md.name} sobre bordão`, k === 'ionian' || k === 'aeolian' || k === 'dorian' ? 2 : 3, 'choice', (rng) => {
    const root = 48 + Math.floor(rng() * 7);
    const keys = Object.keys(MODES);
    const set = shuffle(rng, [k, ...shuffle(rng, keys.filter((x) => x !== k)).slice(0, 3)]);
    const ci = set.indexOf(k);
    return choice(`mode-${k}`, 'scales', root, set.map((x) => MODES[x]!.name), ci, (i) => seq(MODES[set[i]!]!.iv.map((x) => root + x), 0.5, 0.5), 'Um bordão toca a tônica. Qual modo foi tocado?', `${md.name}: ${md.note}.`, { drone: root - 12, bpm: 100 });
  });
}

// 6. Ritmo
const RHY_NAMES = ['Colcheias simples', 'Semicolcheias', 'Tercinas', 'Síncopes'];
RHYTHM_LEVELS.forEach((pats, li) =>
  add(`rhythm-echo-${li + 1}`, 'rhythm', `Eco rítmico: ${RHY_NAMES[li]}`, (li < 2 ? 1 : li === 2 ? 2 : 3) as 1 | 2 | 3, 'tap', (rng) => {
    const p = pick(rng, pats);
    return base(`rhythm-echo-${li + 1}`, 'rhythm', 'tap', 60, {
      prompt: 'Ouça o padrão (4 tempos de contagem antes). Depois repita batendo na barra de espaço ou no pad.', bpm: 84,
      reference: [0, 1, 2, 3].map((t) => ({ at: t, midis: [], dur: 0.1, click: (t === 0 ? 'accent' : 'tick') as 'accent' | 'tick' })),
      events: p.map((t) => ({ at: 4 + t, midis: [72], dur: 0.2 })), rhythm: p, explain: `Padrão: ${p.length} batidas.`,
    });
  }),
);
for (const [id, title, set, lvl] of [['meter-basic', 'Compasso: 4/4, 3/4 e 6/8', ['4/4', '3/4', '6/8'], 2], ['meter-odd', 'Compasso: inclui 5/4 e 7/8', ['4/4', '3/4', '6/8', '5/4', '7/8'], 3]] as const) {
  add(`rhythm-${id}`, 'rhythm', title, lvl as 2 | 3, 'choice', (rng) => {
    const ms = METERS.filter((m) => set.includes(m.id as never));
    const ci = Math.floor(rng() * ms.length);
    const loop = (m: (typeof METERS)[number]): EarEvent[] => {
      const ev: EarEvent[] = [];
      for (let bar = 0; bar < 2; bar++)
        for (let u = 0; u < m.units; u++) {
          const at = (bar * m.units + u) * m.unit;
          const strong = m.accents.includes(u);
          ev.push({ at, midis: [], dur: 0.1, click: strong ? 'accent' : 'tick' });
          if (strong) ev.push({ at, midis: [36], dur: 0.4 });
        }
      return ev;
    };
    return choice(`rhythm-${id}`, 'rhythm', 36, ms.map((m) => m.label), ci, (i) => loop(ms[i]!), 'Ouça a levada (bateria e baixo). Em que compasso está?', `Era ${ms[ci]!.label}.`, { bpm: 110, timbre: 'bass' });
  });
}

// 7. Baixo e guitarra
for (const [id, title, keys, lvl] of [['root-triad', 'Fundamental de tríades', ['maj', 'min', 'dim'], 2], ['root-tetrad', 'Fundamental de tétrades invertidas', ['maj7', 'dom7', 'm7', 'm7b5'], 3]] as const) {
  add(`bass-${id}`, 'bass', title, lvl as 2 | 3, 'pick', (rng) => {
    const root = randomRoot(rng);
    const key = pick(rng, keys);
    let m = CHORDS[key]!.iv.map((i) => root + i);
    if (lvl === 3) for (let r = Math.floor(rng() * 3); r > 0; r--) m = [...m.slice(1), m[0]! + 12];
    return base(`bass-${id}`, 'bass', 'pick', root, {
      prompt: 'Ouça o acorde cheio e encontre a nota fundamental (a que dá nome ao acorde) no braço do baixo.', events: [together(0, m, 2.2)], timbre: 'guitar',
      answerPcs: [pc(root)], answerMidis: [root], explain: `Fundamental: ${NOTE_NAMES[pc(root)]} (${CHORDS[key]!.name}).`,
    });
  });
}
for (const [id, title, range, lvl] of [['detune-wide', 'Detune Hunter: ±50 cents', 50, 1], ['detune-mid', 'Detune Hunter: ±25 cents', 25, 2], ['detune-fine', 'Detune Hunter: ±12 cents', 12, 3]] as const) {
  add(`tuning-${id}`, 'tuning', title, lvl as 1 | 2 | 3, 'detune', (rng) => {
    const r = rng();
    const cents = r < 0.34 ? 0 : (r < 0.67 ? -1 : 1) * (range * (0.5 + rng() * 0.5));
    const m = 57 + Math.floor(rng() * 12);
    const ans = cents === 0 ? 1 : cents < 0 ? 0 : 2;
    return base(`tuning-${id}`, 'tuning', 'detune', m, {
      prompt: 'Duas notas: a referência e a segunda. A segunda está mais grave, afinada ou mais aguda?', bpm: 60, reference: [note(0, m, 1.3)], events: [note(0, m + cents / 100, 1.3)],
      options: ['Mais grave', 'Afinada', 'Mais aguda'], answerIndex: ans, cents, explain: cents === 0 ? 'Estava afinada.' : `Estava ${Math.abs(Math.round(cents))} cents ${cents < 0 ? 'abaixo' : 'acima'}.`,
    });
  });
}

export const EAR_TYPES: readonly EarType[] = types;
export const earTypesOf = (category: EarCategory): EarType[] => EAR_TYPES.filter((t) => t.category === category);
export const earTypeById = (id: string): EarType | undefined => EAR_TYPES.find((t) => t.id === id);

/** Desafio aleatório de uma categoria com nível até `maxLevel` (modo sobrevivência sobe o nível). */
export function randomChallenge(category: EarCategory, maxLevel = 3, rng: () => number = Math.random, onlyType?: string): EarChallenge {
  const all = earTypesOf(category);
  const ok = all.filter((x) => x.level <= maxLevel);
  const t = onlyType ? earTypeById(onlyType)! : pick(rng, ok.length ? ok : all);
  return t.make(rng);
}

/** Confere o clique no palco: classe de altura (qualquer oitava). */
export const pickIsRight = (c: EarChallenge, midi: number): boolean => (c.answerPcs ?? []).includes(pc(midi));

/** Julga as batidas do usuário: alinha pela primeira, tolerância de 0,2 tempo e mesma quantidade. */
export function judgeTaps(expected: readonly number[], tapsSec: readonly number[], bpm: number): { ok: boolean; hits: number } {
  if (tapsSec.length === 0) return { ok: false, hits: 0 };
  const beat = 60 / bpm;
  const t0 = tapsSec[0]!;
  const taps = tapsSec.map((t) => (t - t0) / beat + expected[0]!);
  let hits = 0;
  for (const e of expected) if (taps.some((t) => Math.abs(t - e) <= 0.2)) hits++;
  return { ok: hits === expected.length && tapsSec.length === expected.length, hits };
}
