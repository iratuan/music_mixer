/**
 * Gamificação global: XP único para todo o app, níveis 1–100 com títulos, multiplicador de combo,
 * missões diárias e conquistas. Puro: o banco guarda os números, aqui ficam as regras.
 */
export const XP_RULES = {
  /** Tópico de teoria concluído. */
  theory: 40,
  /** Acerto no ear training (antes do multiplicador). */
  earCorrect: 15,
  /** Esteira 3D: base e bônus de precisão. */
  practiceMin: 50,
  practiceMax: 150,
  /** Missão diária concluída: valor próprio da missão. */
  stemsMinutes: 10,
  stemsXp: 60,
} as const;

/** XP total necessário para chegar ao nível n (n = 1 é zero). */
export const xpForLevel = (n: number): number => (n <= 1 ? 0 : Math.round(50 * Math.pow(n - 1, 1.7)));
export const MAX_LEVEL = 100;

export const RANKS: ReadonlyArray<{ readonly from: number; readonly title: string }> = [
  { from: 1, title: 'Iniciante de Garagem' },
  { from: 10, title: 'Sideman' },
  { from: 25, title: 'Groove Master' },
  { from: 45, title: 'Arquiteto Harmônico' },
  { from: 70, title: 'Ouvido Absoluto' },
  { from: 100, title: 'Maestro mixerCraft' },
];

export interface LevelProgress {
  readonly level: number;
  readonly title: string;
  readonly xp: number;
  readonly into: number;
  readonly span: number;
  readonly fraction: number;
}
export function levelProgress(totalXp: number): LevelProgress {
  const xp = Math.max(0, Math.round(totalXp));
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) level++;
  const lo = xpForLevel(level);
  const hi = level >= MAX_LEVEL ? lo : xpForLevel(level + 1);
  const title = [...RANKS].reverse().find((r) => level >= r.from)!.title;
  return { level, title, xp, into: xp - lo, span: Math.max(1, hi - lo), fraction: level >= MAX_LEVEL ? 1 : (xp - lo) / (hi - lo) };
}

/** Multiplicador por sequência de acertos: 2x a partir de 3, 3x a partir de 6, 5x a partir de 10. */
export const comboMultiplier = (streak: number): 1 | 2 | 3 | 5 => (streak >= 10 ? 5 : streak >= 6 ? 3 : streak >= 3 ? 2 : 1);
export const earXp = (streak: number): number => XP_RULES.earCorrect * comboMultiplier(streak);

/** Esteira 3D: 50 a 150 XP pela precisão, com bônus acima de 90%. */
export function practiceXp(accuracy: number): number {
  const a = Math.max(0, Math.min(100, accuracy));
  return Math.round(XP_RULES.practiceMin + (a / 100) * 60 + (a > 90 ? 40 * ((a - 90) / 10) : 0));
}

// ---------------------------------------------------------------- missões
export interface QuestDef {
  readonly code: string;
  readonly title: string;
  readonly target: number;
  readonly xp: number;
  /** Como o progresso soma: `add` acumula, `max` guarda o maior valor (sequências). */
  readonly mode: 'add' | 'max';
}
export const QUEST_POOL: readonly QuestDef[] = [
  { code: 'ear_streak10', title: 'Acerte 10 seguidos no Ear Training', target: 10, xp: 80, mode: 'max' },
  { code: 'ear_answers20', title: 'Responda 20 desafios de Ear Training', target: 20, xp: 60, mode: 'add' },
  { code: 'ear_correct15', title: 'Acerte 15 desafios de Ear Training', target: 15, xp: 70, mode: 'add' },
  { code: 'theory_1', title: 'Conclua 1 tópico de Teoria Musical', target: 1, xp: 50, mode: 'add' },
  { code: 'theory_2', title: 'Conclua 2 tópicos de Teoria Musical', target: 2, xp: 80, mode: 'add' },
  { code: 'practice_1', title: 'Conclua 1 desafio na Esteira 3D', target: 1, xp: 60, mode: 'add' },
  { code: 'practice_acc80', title: 'Faça um desafio com 80% de precisão', target: 80, xp: 90, mode: 'max' },
  { code: 'circle_5', title: 'Acerte 5 progressões no Círculo das Quintas', target: 5, xp: 70, mode: 'add' },
];
/** Três missões do dia, sempre as mesmas para a mesma data. */
export function dailyQuests(dateIso: string): QuestDef[] {
  let h = 0;
  for (const ch of dateIso) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const pool = [...QUEST_POOL];
  const out: QuestDef[] = [];
  while (out.length < 3) {
    h = (h * 1103515245 + 12345) >>> 0;
    out.push(pool.splice(h % pool.length, 1)[0]!);
  }
  return out;
}

// ---------------------------------------------------------------- conquistas
export interface AchievementDef {
  readonly code: string;
  readonly title: string;
  readonly hint: string;
}
export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { code: 'first_ear', title: 'Primeiro acerto', hint: 'Acerte seu primeiro desafio de Ear Training.' },
  { code: 'interval_sniper', title: 'Sniper de Intervalos', hint: 'Acerte 50 desafios de intervalos.' },
  { code: 'circle_master', title: 'Mestre do Círculo das Quintas', hint: 'Acerte 20 desafios do Círculo das Quintas.' },
  { code: 'chord_ear', title: 'Ouvido de Acordes', hint: 'Acerte 30 desafios de acordes.' },
  { code: 'ear_100', title: 'Cem Acertos', hint: 'Acerte 100 desafios de Ear Training.' },
  { code: 'streak_20', title: 'Sequência de 20', hint: 'Acerte 20 seguidos no Ear Training.' },
  { code: 'fire_30', title: '30 Dias de Fogo', hint: 'Pratique 30 dias seguidos.' },
  { code: 'theory_all', title: 'Aluno Aplicado', hint: 'Conclua todos os tópicos de Teoria Musical.' },
  { code: 'polyvalent', title: 'Polivalente: Baixo, Guitarra e Teclado', hint: 'Pratique contrabaixo e guitarra na esteira e conclua um tópico de teoria.' },
  { code: 'level_10', title: 'Sideman', hint: 'Chegue ao nível 10.' },
];
