import type { ExerciseId, TourKind } from './scales.js';

/**
 * Biblioteca de exercícios: rotinas prontas, organizadas por nível e por tema, sobre o motor de
 * escalas. Cada rotina é só um conjunto de ajustes (tom, escala, padrão, região, andamento) e uma
 * meta de andamento; o aluno pode abrir, tocar e depois mudar o que quiser.
 */
export type RoutineLevel = 'Iniciante' | 'Intermediário' | 'Avançado';
export type RoutineTopic = 'Aquecimento' | 'Escalas' | 'Arpejos' | 'Técnica' | 'Braço inteiro' | 'Mapa do braço';

export const ROUTINE_LEVELS: readonly RoutineLevel[] = ['Iniciante', 'Intermediário', 'Avançado'];
export const ROUTINE_TOPICS: readonly RoutineTopic[] = ['Mapa do braço', 'Aquecimento', 'Escalas', 'Arpejos', 'Técnica', 'Braço inteiro'];

export interface RoutineSettings {
  readonly root: number;
  /** Chave de SCALE_BANK. */
  readonly category: string;
  /** Variação dentro da categoria. */
  readonly mode: string;
  readonly exercise: ExerciseId;
  /** Posição 0–4 ou o braço inteiro. */
  readonly region: number | 'all';
  /** Andamento inicial. */
  readonly bpm: number;
  /** Acelera +5 BPM a cada `rampEvery` ciclos. */
  readonly ramp: boolean;
  readonly rampEvery: number;
  /** Percurso pelo braço (avançar sozinho por regiões e/ou grupos de cordas). */
  readonly tour?: TourKind;
  /** Tamanho do grupo de cordas (2, 3, 4…); sem valor = todas as cordas. */
  readonly groupSize?: number;
  /** Ciclos de cada etapa do percurso. */
  readonly repeats?: number;
}

export interface Routine {
  readonly id: string;
  readonly title: string;
  readonly level: RoutineLevel;
  readonly topic: RoutineTopic;
  /** Para que serve, em uma frase. */
  readonly goal: string;
  /** Andamento-alvo: quando o aluno chega nele com 90% de acerto, a rotina está dominada. */
  readonly targetBpm: number;
  readonly settings: RoutineSettings;
  /** Trilha do braço: escala da trilha e a etapa (1 de 4…). */
  readonly trail?: { readonly scale: string; readonly step: number; readonly of: number };
}

const r = (
  id: string,
  title: string,
  level: RoutineLevel,
  topic: RoutineTopic,
  goal: string,
  targetBpm: number,
  settings: Partial<RoutineSettings> & Pick<RoutineSettings, 'category' | 'mode' | 'exercise'>,
): Routine => ({
  id,
  title,
  level,
  topic,
  goal,
  targetBpm,
  settings: { root: 9, region: 0, bpm: 70, ramp: false, rampEvery: 2, ...settings },
});

export const ROUTINES: readonly Routine[] = [
  // Iniciante
  r('ini-penta-lam', 'Pentatônica menor de Lá', 'Iniciante', 'Escalas', 'A primeira escala do baixista: subir e descer na posição 1, um dedo por casa.', 100, {
    category: 'Pentatônica',
    mode: 'Menor',
    exercise: 1,
    bpm: 60,
  }),
  r('ini-maior-do', 'Escala maior de Dó', 'Iniciante', 'Escalas', 'A escala de referência para entender graus e acordes.', 100, {
    root: 0,
    category: 'Modos Gregos',
    mode: 'Jônio (Maior)',
    exercise: 1,
    bpm: 60,
  }),
  r('ini-aquec-2x', 'Aquecimento: 2 vezes cada nota', 'Iniciante', 'Aquecimento', 'Firmeza de mão esquerda e alternância de dedos da direita.', 110, {
    category: 'Pentatônica',
    mode: 'Menor',
    exercise: 2,
    bpm: 70,
  }),
  r('ini-triades-sol', 'Arpejo de tríade em Sol maior', 'Iniciante', 'Arpejos', 'Fundamental, terça e quinta: a base de qualquer linha de baixo.', 100, {
    root: 7,
    category: 'Modos Gregos',
    mode: 'Jônio (Maior)',
    exercise: 7,
    bpm: 60,
  }),
  r('ini-penta-maior-mi', 'Pentatônica maior de Mi', 'Iniciante', 'Escalas', 'Som de country e pop; a mesma forma da menor, deslocada.', 100, {
    root: 4,
    category: 'Pentatônica',
    mode: 'Maior',
    exercise: 1,
    bpm: 60,
  }),
  // Intermediário
  r('int-grupos3', 'Grupos de 3 na escala maior', 'Intermediário', 'Técnica', 'Sequências de três notas: fluência sem perder o tempo.', 110, {
    root: 0,
    category: 'Modos Gregos',
    mode: 'Jônio (Maior)',
    exercise: 4,
    bpm: 70,
    ramp: true,
  }),
  r('int-tercas', 'Saltos de terça no Dórico', 'Intermediário', 'Técnica', 'Intervalos de terça soam melódicos e preparam os arpejos.', 110, {
    root: 2,
    category: 'Modos Gregos',
    mode: 'Dórico',
    exercise: 6,
    bpm: 70,
  }),
  r('int-tetrades', 'Arpejos de tétrade em Fá', 'Intermediário', 'Arpejos', 'Acordes com sétima: o vocabulário do groove, do samba e do jazz.', 100, {
    root: 5,
    category: 'Modos Gregos',
    mode: 'Jônio (Maior)',
    exercise: 8,
    bpm: 65,
  }),
  r('int-blues-mi', 'Escala blues de Mi', 'Intermediário', 'Escalas', 'A nota de passagem (blue note) que dá o tempero do blues e do rock.', 110, {
    root: 4,
    category: 'Escala Blues',
    mode: 'Menor',
    exercise: 1,
    bpm: 70,
  }),
  r('int-mixo', 'Mixolídio de Sol: ir e voltar', 'Intermediário', 'Técnica', 'O modo dos acordes dominantes, com o padrão 1-2-1 para controle.', 110, {
    root: 7,
    category: 'Modos Gregos',
    mode: 'Mixolídio',
    exercise: 10,
    bpm: 70,
  }),
  r('int-penta-braco', 'Pentatônica no braço inteiro', 'Intermediário', 'Braço inteiro', 'Liga as cinco posições: sair da "caixinha" da posição 1.', 100, {
    category: 'Pentatônica',
    mode: 'Menor',
    exercise: 1,
    region: 'all',
    bpm: 70,
  }),
  // Avançado
  r('adv-grupos4', 'Grupos de 4 com aceleração', 'Avançado', 'Técnica', 'Resistência: o andamento sobe 5 BPM a cada 2 ciclos.', 140, {
    root: 0,
    category: 'Modos Gregos',
    mode: 'Jônio (Maior)',
    exercise: 5,
    bpm: 80,
    ramp: true,
  }),
  r('adv-menor-harm', 'Menor harmônica de Ré', 'Avançado', 'Escalas', 'O salto de um tom e meio entre o 6º e o 7º grau, comum no flamenco e no metal.', 120, {
    root: 2,
    category: 'Menor Harmônica',
    mode: 'Padrão',
    exercise: 1,
    bpm: 75,
  }),
  r('adv-oitavas', 'Saltos de oitava', 'Avançado', 'Técnica', 'O desenho da disco e do funk: precisão nos saltos de corda.', 130, {
    root: 5,
    category: 'Pentatônica',
    mode: 'Menor',
    exercise: 15,
    bpm: 80,
  }),
  r('adv-3nps', 'Três notas por corda, braço inteiro', 'Avançado', 'Braço inteiro', 'Deslocamentos longos com a mão aberta, em todas as posições.', 120, {
    root: 9,
    category: 'Modos Gregos',
    mode: 'Eólio (Menor)',
    exercise: 13,
    region: 'all',
    bpm: 70,
  }),
  r('adv-dim', 'Diminuta tom-semitom', 'Avançado', 'Escalas', 'Simetria a cada três casas: tensão sobre acordes diminutos e dominantes.', 110, {
    root: 0,
    category: 'Escalas Simétricas',
    mode: 'Diminuta (Tom-Semitom)',
    exercise: 1,
    bpm: 65,
  }),
];

/**
 * Trilhas do braço: para cada escala conhecida, quatro etapas que levam o aluno a dominar o braço
 * inteiro — duas cordas, três cordas, todas as cordas região por região e o braço inteiro sem parar.
 * Nas etapas com grupos, o exercício avança sozinho por todas as regiões e por todos os grupos de
 * cordas do tamanho pedido (no baixo de 5 e 6 cordas, os grupos maiores também existem).
 */
interface TrailScale {
  readonly category: string;
  readonly mode: string;
  /** Nome curto para o título ("Pentatônica menor"). */
  readonly name: string;
  readonly root: number;
  readonly level: RoutineLevel;
}

const TRAIL_SCALES: readonly TrailScale[] = [
  { category: 'Pentatônica', mode: 'Menor', name: 'Pentatônica menor', root: 9, level: 'Iniciante' },
  { category: 'Pentatônica', mode: 'Maior', name: 'Pentatônica maior', root: 7, level: 'Iniciante' },
  { category: 'Modos Gregos', mode: 'Jônio (Maior)', name: 'Escala maior (Jônio)', root: 0, level: 'Iniciante' },
  { category: 'Modos Gregos', mode: 'Eólio (Menor)', name: 'Menor natural (Eólio)', root: 9, level: 'Iniciante' },
  { category: 'Escala Blues', mode: 'Menor', name: 'Blues menor', root: 4, level: 'Intermediário' },
  { category: 'Escala Blues', mode: 'Maior', name: 'Blues maior', root: 7, level: 'Intermediário' },
  { category: 'Modos Gregos', mode: 'Dórico', name: 'Dórico', root: 2, level: 'Intermediário' },
  { category: 'Modos Gregos', mode: 'Mixolídio', name: 'Mixolídio', root: 7, level: 'Intermediário' },
  { category: 'Modos Gregos', mode: 'Lídio', name: 'Lídio', root: 5, level: 'Intermediário' },
  { category: 'Modos Gregos', mode: 'Frígio', name: 'Frígio', root: 4, level: 'Intermediário' },
  { category: 'Menor Harmônica', mode: 'Padrão', name: 'Menor harmônica', root: 9, level: 'Intermediário' },
  { category: 'Menor Melódica', mode: 'Lídio b7 (Nordestina)', name: 'Nordestina (Lídio b7)', root: 7, level: 'Intermediário' },
  { category: 'Bebop', mode: 'Dominante', name: 'Bebop dominante', root: 7, level: 'Intermediário' },
  { category: 'Modos Gregos', mode: 'Lócrio', name: 'Lócrio', root: 11, level: 'Avançado' },
  { category: 'Menor Melódica', mode: 'Padrão', name: 'Menor melódica', root: 0, level: 'Avançado' },
  { category: 'Menor Harmônica', mode: 'Frígio Dominante (5º modo)', name: 'Frígio dominante', root: 4, level: 'Avançado' },
  { category: 'Menor Melódica', mode: 'Alterada (Superlócria)', name: 'Alterada', root: 7, level: 'Avançado' },
  { category: 'Menor Melódica', mode: 'Mixolídio b6', name: 'Mixolídio b6', root: 0, level: 'Avançado' },
  { category: 'Menor Melódica', mode: 'Lócrio #2 (Meio-diminuta)', name: 'Lócrio #2 (meio-diminuta)', root: 11, level: 'Avançado' },
  { category: 'Menor Melódica', mode: 'Lídio Aumentado', name: 'Lídio aumentado', root: 5, level: 'Avançado' },
  { category: 'Bebop', mode: 'Maior', name: 'Bebop maior', root: 0, level: 'Avançado' },
  { category: 'Escalas Simétricas', mode: 'Diminuta (Tom-Semitom)', name: 'Diminuta tom-semitom', root: 0, level: 'Avançado' },
  { category: 'Escalas Simétricas', mode: 'Dom Diminuta (Semitom-Tom)', name: 'Diminuta semitom-tom', root: 7, level: 'Avançado' },
  { category: 'Escalas Simétricas', mode: 'Hexafônica (Tons Inteiros)', name: 'Tons inteiros', root: 0, level: 'Avançado' },
  { category: 'Escalas Simétricas', mode: 'Cromática', name: 'Cromática', root: 4, level: 'Avançado' },
  { category: 'Exóticas', mode: 'Húngara Menor', name: 'Húngara menor', root: 9, level: 'Avançado' },
  { category: 'Exóticas', mode: 'Dupla Harmônica (Árabe)', name: 'Dupla harmônica (árabe)', root: 4, level: 'Avançado' },
  { category: 'Exóticas', mode: 'Hirajoshi (Japonesa)', name: 'Hirajoshi (japonesa)', root: 9, level: 'Avançado' },
];

const TRAIL_STEPS: ReadonlyArray<{
  readonly key: string;
  readonly title: string;
  readonly goal: string;
  readonly settings: Partial<RoutineSettings>;
  readonly bpm: number;
  readonly target: number;
}> = [
  {
    key: '2c',
    title: 'duas cordas pelo braço',
    goal: 'A escala em pares de cordas vizinhas, em todas as regiões do braço: o mapa começa pequeno.',
    settings: { exercise: 1, tour: 'full', groupSize: 2, repeats: 1, region: 0 },
    bpm: 60,
    target: 100,
  },
  {
    key: '3c',
    title: 'três cordas pelo braço',
    goal: 'Grupos de três cordas em todas as regiões, com grupos de 3 notas para ligar as cordas.',
    settings: { exercise: 4, tour: 'full', groupSize: 3, repeats: 1, region: 0 },
    bpm: 60,
    target: 100,
  },
  {
    key: 'reg',
    title: 'todas as cordas, região por região',
    goal: 'A posição inteira em cada região, da pestana ao fim do braço, avançando sozinho.',
    settings: { exercise: 1, tour: 'positions', repeats: 2, region: 0 },
    bpm: 65,
    target: 110,
  },
  {
    key: 'all',
    title: 'braço inteiro sem parar',
    goal: 'Subir e descer o braço todo ligando as regiões pelas notas de passagem: o domínio do braço.',
    settings: { exercise: 1, region: 'all', ramp: true, rampEvery: 2 },
    bpm: 70,
    target: 120,
  },
];

const slug = (x: string) =>
  x
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const TRAILS: readonly Routine[] = TRAIL_SCALES.flatMap((sc) =>
  TRAIL_STEPS.map((st) =>
    r(`trilha-${slug(sc.category)}-${slug(sc.mode)}-${st.key}`, `${sc.name}: ${st.title}`, sc.level, 'Mapa do braço', st.goal, st.target, {
      category: sc.category,
      mode: sc.mode,
      exercise: 1,
      root: sc.root,
      bpm: st.bpm,
      ...st.settings,
    }),
  ).map((x, k) => ({ ...x, trail: { scale: sc.name, step: k + 1, of: TRAIL_STEPS.length } })),
);

/** Toda a biblioteca: as trilhas do braço e as rotinas avulsas. */
export const ALL_ROUTINES: readonly Routine[] = [...TRAILS, ...ROUTINES];

export function routineById(id: string | null | undefined): Routine | null {
  return ALL_ROUTINES.find((x) => x.id === id) ?? null;
}

/** Recorde pessoal de uma rotina (guardado no computador do aluno). */
export interface RoutineRecord {
  /** Melhor acerto no desafio (0–100), quando houve desafio. */
  readonly bestPct?: number;
  /** Andamento em que o melhor acerto foi feito. */
  readonly bestPctBpm?: number;
  /** Maior andamento alcançado (com ou sem desafio). */
  readonly maxBpm?: number;
  /** Quantas vezes foi praticada. */
  readonly sessions: number;
  /** Data ISO da última prática. */
  readonly last: string;
}

/** Junta uma sessão ao recorde: guarda o melhor acerto (desempate pelo andamento) e o maior andamento. */
export function mergeRecord(prev: RoutineRecord | undefined, session: { pct: number | null; bpm: number; at: string }): RoutineRecord {
  const better = session.pct !== null && (prev?.bestPct === undefined || session.pct > prev.bestPct || (session.pct === prev.bestPct && session.bpm > (prev.bestPctBpm ?? 0)));
  return {
    ...(better ? { bestPct: session.pct!, bestPctBpm: session.bpm } : prev?.bestPct !== undefined ? { bestPct: prev.bestPct, bestPctBpm: prev.bestPctBpm ?? session.bpm } : {}),
    maxBpm: Math.max(prev?.maxBpm ?? 0, session.bpm),
    sessions: (prev?.sessions ?? 0) + 1,
    last: session.at,
  };
}

/** Rotina dominada: chegou à meta de andamento com 90% de acerto ou mais. */
export function routineMastered(routine: Routine, rec: RoutineRecord | undefined): boolean {
  return !!rec && rec.bestPct !== undefined && rec.bestPct >= 90 && (rec.bestPctBpm ?? 0) >= routine.targetBpm;
}
