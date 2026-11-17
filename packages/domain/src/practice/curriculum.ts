/**
 * Currículo: 3 instrumentos × 5 trilhas, ~100 exercícios em ordem pedagógica. Cada exercício aponta para
 * uma configuração do treino (família de escala, modo e padrão de exercício) e traz a meta de BPM e a
 * precisão mínima para liberar o seguinte. Puro: o progresso vem do histórico de prática.
 */
export type CurriculumInstrument = 'bass' | 'guitar' | 'keyboard';
export type ExerciseCategory = 'technique' | 'scales' | 'arpeggios' | 'grooves' | 'chords' | 'rhythm';
export type Difficulty = 'iniciante' | 'intermediario' | 'avancado' | 'mestre';

export interface CurriculumExercise {
  readonly id: string;
  readonly instrument: CurriculumInstrument;
  readonly trackId: string;
  readonly orderIndex: number;
  readonly title: string;
  readonly category: ExerciseCategory;
  readonly difficulty: Difficulty;
  readonly targetBpm: number;
  readonly minAccuracyToUnlock: number;
  /** Configuração do treino (SCALE_BANK e EXERCISES). */
  readonly config: { readonly family: string; readonly mode: string; readonly pattern: number };
}
export interface CurriculumTrack {
  readonly id: string;
  readonly instrument: CurriculumInstrument;
  readonly title: string;
  readonly description: string;
  readonly levelOrder: number;
  readonly exercises: readonly CurriculumExercise[];
}

type Row = readonly [title: string, cat: ExerciseCategory, family: string, mode: string, pattern: number, bpm: number];
interface TrackDef {
  readonly title: string;
  readonly description: string;
  readonly rows: readonly Row[];
}

const PM = 'Pentatônica';
const GR = 'Modos Gregos';
const BL = 'Escala Blues';
const MAJ = 'Jônio (Maior)';

const BASS: readonly TrackDef[] = [
  { title: 'Fundamentos & Digitação (1-2-3-4)', description: 'Independência de dedos, saltos de corda, abafamento, oitavas e quintas.', rows: [
    ['Um dedo por casa: subir e descer', 'technique', GR, MAJ, 1, 60], ['Notas repetidas: 2 vezes cada', 'technique', GR, MAJ, 2, 60],
    ['Independência 1-2-3-4', 'technique', GR, MAJ, 5, 60], ['Saltos de corda 4-2, 3-1', 'technique', GR, MAJ, 9, 64],
    ['Abafamento: 3 vezes cada nota', 'technique', GR, MAJ, 3, 66], ['Saltos de oitava', 'technique', GR, MAJ, 15, 68], ['Saltos de quinta', 'technique', GR, MAJ, 12, 70] ] },
  { title: 'Escalas Essenciais & Modos Gregos', description: 'Maior, menor, pentatônicas, blues e modos.', rows: [
    ['Escala maior', 'scales', GR, MAJ, 1, 70], ['Menor natural', 'scales', GR, 'Eólio (Menor)', 1, 70], ['Pentatônica maior', 'scales', PM, 'Maior', 1, 80],
    ['Pentatônica menor', 'scales', PM, 'Menor', 1, 80], ['Escala blues', 'scales', BL, 'Menor', 1, 80], ['Dórico', 'scales', GR, 'Dórico', 10, 76],
    ['Mixolídio', 'scales', GR, 'Mixolídio', 10, 76], ['Lídio', 'scales', GR, 'Lídio', 10, 76] ] },
  { title: 'Arpejos & Condução Harmônica', description: 'Tríades, tétrades e walking bass.', rows: [
    ['Tríades maiores', 'arpeggios', GR, MAJ, 7, 70], ['Tríades menores', 'arpeggios', GR, 'Eólio (Menor)', 7, 70], ['Tríades diminutas', 'arpeggios', GR, 'Lócrio', 7, 70],
    ['Tétrades 7M', 'arpeggios', GR, MAJ, 8, 72], ['Tétrades 7 (dominante)', 'arpeggios', GR, 'Mixolídio', 8, 72], ['Tétrades m7', 'arpeggios', GR, 'Dórico', 8, 72],
    ['Tétrades m7b5', 'arpeggios', GR, 'Lócrio', 8, 72], ['Walking bass: terças', 'arpeggios', GR, 'Dórico', 6, 90] ] },
  { title: 'Grooves & Rítmica', description: 'Colcheias, semicolcheias, funk, soul, rock e baião.', rows: [
    ['Colcheias no groove de rock', 'grooves', PM, 'Menor', 2, 90], ['Semicolcheias na pentatônica', 'grooves', PM, 'Menor', 3, 80], ['Funk: grupos de 3', 'grooves', GR, 'Dórico', 4, 90],
    ['Soul: ir e voltar', 'grooves', PM, 'Maior', 10, 92], ['Baião: quintas', 'grooves', GR, 'Mixolídio', 12, 96], ['Samba: grupos de 4', 'grooves', GR, MAJ, 5, 100],
    ['Ghost notes (notas repetidas)', 'rhythm', BL, 'Menor', 3, 90] ] },
  { title: 'Técnicas Avançadas', description: 'Slap, hammer-on/pull-off e velocidade.', rows: [
    ['Slap: oitavas', 'technique', GR, 'Mixolídio', 15, 100], ['Pop: quartas', 'technique', GR, 'Dórico', 11, 100], ['HOPO: permutação 1-3-2-4', 'technique', GR, MAJ, 14, 110],
    ['Velocidade 120', 'technique', PM, 'Menor', 1, 120], ['Velocidade 140', 'technique', PM, 'Menor', 5, 140], ['Velocidade 160', 'technique', BL, 'Menor', 4, 160] ] },
];

const GUITAR: readonly TrackDef[] = [
  { title: 'Mecânica & Palhetada', description: 'Palhetada alternada e sincronia das mãos.', rows: [
    ['Palhetada alternada: cromática', 'technique', 'Escalas Simétricas', 'Cromática', 1, 60], ['Alternada: 2 vezes cada', 'technique', 'Escalas Simétricas', 'Cromática', 2, 70],
    ['Sincronia 1-2-3-4', 'technique', 'Escalas Simétricas', 'Cromática', 5, 70], ['Grupos de 3', 'technique', GR, MAJ, 4, 80], ['Saltos de corda', 'technique', GR, MAJ, 9, 80], ['Permutação 1-3-2-4', 'technique', 'Escalas Simétricas', 'Cromática', 14, 90] ] },
  { title: 'Sistema CAGED & Escalas', description: 'Shapes da pentatônica, escala maior, modos e menor harmônica.', rows: [
    ['Pentatônica menor: shape 1', 'scales', PM, 'Menor', 1, 80], ['Pentatônica menor: ir e voltar', 'scales', PM, 'Menor', 10, 84], ['Pentatônica maior', 'scales', PM, 'Maior', 1, 84],
    ['Escala maior: 3 notas por corda', 'scales', GR, MAJ, 13, 80], ['Dórico', 'scales', GR, 'Dórico', 1, 84], ['Mixolídio', 'scales', GR, 'Mixolídio', 1, 84], ['Menor harmônica', 'scales', 'Menor Harmônica', 'Padrão', 1, 80] ] },
  { title: 'Acordes, Tríades & Inversões', description: 'Power chords, pestanas, tríades e voicings.', rows: [
    ['Tríades maiores', 'chords', GR, MAJ, 7, 70], ['Tríades menores', 'chords', GR, 'Eólio (Menor)', 7, 70], ['Tétrades 7M', 'chords', GR, MAJ, 8, 72],
    ['Tétrades dominantes', 'chords', GR, 'Mixolídio', 8, 72], ['Voicings m7 (jazz)', 'chords', GR, 'Dórico', 8, 72], ['Saltos de terça (neo-soul)', 'chords', GR, 'Dórico', 6, 76] ] },
  { title: 'Expressão & Fraseado', description: 'Bends, vibratos, slides, legato e double stops.', rows: [
    ['Blues menor: frase base', 'technique', BL, 'Menor', 1, 76], ['Bends: notas repetidas', 'technique', BL, 'Menor', 2, 72], ['Slides: ir e voltar', 'technique', PM, 'Menor', 10, 80],
    ['Legato: grupos de 3', 'technique', GR, MAJ, 4, 90], ['Legato: grupos de 4', 'technique', GR, MAJ, 5, 90], ['Double stops: terças', 'technique', GR, MAJ, 6, 80], ['Blues maior', 'scales', BL, 'Maior', 1, 84] ] },
  { title: 'Arpejos & Velocidade', description: 'Sweep, string skipping e riffs sincopados.', rows: [
    ['Sweep de tríades', 'arpeggios', GR, 'Eólio (Menor)', 7, 90], ['Sweep de tétrades', 'arpeggios', GR, 'Dórico', 8, 90], ['String skipping', 'technique', GR, MAJ, 9, 100],
    ['Riff sincopado: pentatônica', 'rhythm', PM, 'Menor', 3, 110], ['Velocidade 130', 'technique', PM, 'Menor', 5, 130], ['Velocidade 150', 'technique', GR, 'Eólio (Menor)', 4, 150] ] },
];

const KEYS: readonly TrackDef[] = [
  { title: 'Postura & Independência das Mãos', description: 'Estilo Hanon, passagem de polegar, movimento paralelo e contrário.', rows: [
    ['Cinco dedos: subir e descer', 'technique', GR, MAJ, 1, 60], ['Hanon: grupos de 4', 'technique', GR, MAJ, 5, 66], ['Passagem de polegar', 'technique', GR, MAJ, 4, 66],
    ['Escala em movimento paralelo', 'technique', GR, MAJ, 1, 72], ['Movimento contrário', 'technique', GR, MAJ, 10, 72], ['Saltos de oitava', 'technique', GR, MAJ, 15, 76] ] },
  { title: 'Escalas & Modos no Teclado', description: 'Maiores e menores, pentatônica, bebop e modos.', rows: [
    ['Escalas maiores (ciclo das quintas)', 'scales', GR, MAJ, 1, 80], ['Escalas menores', 'scales', GR, 'Eólio (Menor)', 1, 80], ['Pentatônica', 'scales', PM, 'Maior', 1, 84],
    ['Bebop dominante', 'scales', 'Bebop', 'Dominante', 1, 90], ['Dórico', 'scales', GR, 'Dórico', 1, 84], ['Lídio', 'scales', GR, 'Lídio', 1, 84], ['Mixolídio', 'scales', GR, 'Mixolídio', 1, 84] ] },
  { title: 'Formação de Acordes & Inversões', description: 'Tríades, tétrades e condução de vozes.', rows: [
    ['Tríades maiores', 'chords', GR, MAJ, 7, 70], ['Tríades menores', 'chords', GR, 'Eólio (Menor)', 7, 70], ['Tétrades 7M', 'chords', GR, MAJ, 8, 72],
    ['Tétrades dominantes', 'chords', GR, 'Mixolídio', 8, 72], ['Condução I-V-vi-IV', 'chords', GR, MAJ, 6, 76], ['Condução II-V-I', 'chords', GR, 'Dórico', 6, 80] ] },
  { title: 'Acompanhamento & Comping Rítmico', description: 'Pop/rock, bossa nova, funk e baixo na mão esquerda.', rows: [
    ['Comping pop/rock', 'rhythm', GR, MAJ, 2, 90], ['Bossa nova', 'rhythm', GR, 'Dórico', 3, 100], ['Funk (Rhodes/Clavinet)', 'rhythm', GR, 'Mixolídio', 4, 96],
    ['Baixo na esquerda + acordes', 'rhythm', GR, MAJ, 12, 90], ['Blues: comping', 'rhythm', BL, 'Menor', 3, 90], ['Samba', 'rhythm', GR, 'Mixolídio', 5, 100] ] },
  { title: 'Arpejos & Improvisação', description: 'Arpejos estendidos e frases sobre bases.', rows: [
    ['Arpejos 9ª', 'arpeggios', GR, MAJ, 8, 80], ['Arpejos 11ª', 'arpeggios', GR, 'Dórico', 8, 84], ['Arpejos 13ª', 'arpeggios', GR, 'Mixolídio', 8, 84],
    ['Frase pentatônica', 'scales', PM, 'Menor', 10, 100], ['Improviso blues', 'scales', BL, 'Menor', 10, 100], ['Improviso modal', 'scales', GR, 'Dórico', 10, 110] ] },
];

function difficultyOf(trackIdx: number): Difficulty {
  return (['iniciante', 'iniciante', 'intermediario', 'avancado', 'mestre'] as const)[trackIdx] ?? 'iniciante';
}

function build(instrument: CurriculumInstrument, defs: readonly TrackDef[]): CurriculumTrack[] {
  return defs.map((d, ti) => {
    const trackId = `${instrument}-${ti + 1}`;
    return {
      id: trackId,
      instrument,
      title: `Trilha ${ti + 1} — ${d.title}`,
      description: d.description,
      levelOrder: ti + 1,
      exercises: d.rows.map((r, i) => ({
        id: `${trackId}-${i + 1}`,
        instrument,
        trackId,
        orderIndex: i + 1,
        title: r[0],
        category: r[1],
        difficulty: difficultyOf(ti),
        targetBpm: r[5],
        minAccuracyToUnlock: 80,
        config: { family: r[2], mode: r[3], pattern: r[4] },
      })),
    };
  });
}

export const CURRICULUM: readonly CurriculumTrack[] = [...build('bass', BASS), ...build('guitar', GUITAR), ...build('keyboard', KEYS)];
export const CURRICULUM_EXERCISES: readonly CurriculumExercise[] = CURRICULUM.flatMap((t) => t.exercises);

export type ExerciseStatus = 'locked' | 'unlocked' | 'completed' | 'mastered';
export interface ExerciseProgress {
  readonly status: ExerciseStatus;
  readonly bestAccuracy: number;
  readonly bestBpm: number;
  readonly attempts: number;
}

/**
 * Estado de cada exercício a partir das sessões (chave do histórico: instrumento|tom|família|modo|padrão).
 * Concluído: precisão mínima atingida; dominado: meta de BPM atingida com a precisão mínima.
 * Em ordem: o seguinte só abre quando o anterior da mesma trilha foi concluído (ou com `freeMode`).
 */
export function curriculumProgress(
  sessions: ReadonlyArray<{ key: string; accuracy: number; bpm: number }>,
  freeMode = false,
): Record<string, ExerciseProgress> {
  const out: Record<string, ExerciseProgress> = {};
  for (const t of CURRICULUM) {
    let prevDone = true;
    for (const e of t.exercises) {
      const tail = `|${e.config.family}|${e.config.mode}|${e.config.pattern}`;
      const owns = (k: string) => (e.instrument === 'bass' ? k.startsWith('bass|') : e.instrument === 'guitar' ? k.startsWith('guitar|') || k.startsWith('acoustic|') : false);
      const mine = sessions.filter((s) => s.key.endsWith(tail) && owns(s.key));
      const bestAccuracy = mine.reduce((m, s) => Math.max(m, s.accuracy), 0);
      const bestBpm = mine.filter((s) => s.accuracy >= e.minAccuracyToUnlock).reduce((m, s) => Math.max(m, s.bpm), 0);
      const done = bestAccuracy >= e.minAccuracyToUnlock;
      const status: ExerciseStatus = done ? (bestBpm >= e.targetBpm ? 'mastered' : 'completed') : prevDone || freeMode ? 'unlocked' : 'locked';
      out[e.id] = { status, bestAccuracy, bestBpm, attempts: mine.length };
      prevDone = done;
    }
  }
  return out;
}

/** Exercício do currículo que corresponde a uma chave de histórico (instrumento|tom|família|modo|padrão), se houver. */
export function exerciseIdForKey(key: string): string | null {
  const parts = key.split('|');
  if (parts.length < 5) return null;
  const inst = parts[0] === 'bass' ? 'bass' : parts[0] === 'guitar' || parts[0] === 'acoustic' ? 'guitar' : null;
  if (!inst) return null;
  const tail = `|${parts[2]}|${parts[3]}|${parts[4]}`;
  const hit = CURRICULUM_EXERCISES.find((e) => e.instrument === inst && `|${e.config.family}|${e.config.mode}|${e.config.pattern}` === tail);
  return hit?.id ?? null;
}
