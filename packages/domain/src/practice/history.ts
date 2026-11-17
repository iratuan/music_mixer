/**
 * Histórico de prática: uma sessão por desafio concluído, com XP, níveis (I a V), recordes pessoais e
 * séries por dia para os gráficos. Puro (sem tela nem armazenamento): a tela guarda a lista no computador
 * e exporta/importa em JSON.
 */
export interface PracticeSession {
  /** Instante (ISO). */
  readonly at: string;
  /** Exercício ou progressão praticada (texto para mostrar). */
  readonly exercise: string;
  /** Chave estável do exercício (para recordes): ex. "A Pentatônica Menor #1". */
  readonly key: string;
  readonly instrument: string;
  readonly bpm: number;
  /** 0–100. */
  readonly accuracy: number;
  readonly maxStreak: number;
  readonly score: number;
  readonly hits: number;
  readonly misses: number;
}

export const HISTORY_FORMAT = 'mixercraft-historico';

/** XP da sessão: precisão e andamento contam; abaixo de 50% de precisão rende só participação. */
export function sessionXp(s: Pick<PracticeSession, 'accuracy' | 'bpm' | 'maxStreak' | 'hits'>): number {
  const base = 10 + Math.min(40, Math.floor(s.hits / 5));
  if (s.accuracy < 50) return base;
  const acc = Math.round((s.accuracy / 100) * 60);
  const tempo = Math.round(Math.min(300, s.bpm) / 10);
  const combo = Math.min(20, Math.floor(s.maxStreak / 5));
  return base + acc + tempo + combo;
}

export const LEVELS: ReadonlyArray<{ readonly level: number; readonly name: string; readonly xp: number }> = [
  { level: 1, name: 'Nível I · Iniciante', xp: 0 },
  { level: 2, name: 'Nível II · Aprendiz', xp: 300 },
  { level: 3, name: 'Nível III · Músico', xp: 1000 },
  { level: 4, name: 'Nível IV · Veterano', xp: 2500 },
  { level: 5, name: 'Nível V · Mestre', xp: 6000 },
];

export interface LevelInfo {
  readonly level: number;
  readonly name: string;
  readonly xp: number;
  /** XP que falta para o próximo nível (0 no último). */
  readonly toNext: number;
  /** 0–1 dentro do nível atual. */
  readonly progress: number;
}

export function levelFor(xp: number): LevelInfo {
  let cur = LEVELS[0]!;
  for (const l of LEVELS) if (xp >= l.xp) cur = l;
  const next = LEVELS.find((l) => l.xp > cur.xp);
  return { level: cur.level, name: cur.name, xp, toNext: next ? next.xp - xp : 0, progress: next ? (xp - cur.xp) / (next.xp - cur.xp) : 1 };
}

export interface Medal {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly earned: boolean;
}

const dayOf = (iso: string) => iso.slice(0, 10);

/** Dias seguidos (até o último dia praticado) com pelo menos uma sessão. */
export function streakDays(sessions: readonly PracticeSession[]): number {
  const days = [...new Set(sessions.map((s) => dayOf(s.at)))].sort().reverse();
  if (!days.length) return 0;
  let n = 1;
  for (let i = 1; i < days.length; i++) {
    const gap = (Date.parse(days[i - 1]!) - Date.parse(days[i]!)) / 86_400_000;
    if (gap === 1) n++;
    else break;
  }
  return n;
}

export function medals(sessions: readonly PracticeSession[]): Medal[] {
  const best = Math.max(0, ...sessions.map((s) => s.accuracy));
  const fast = Math.max(0, ...sessions.filter((s) => s.accuracy >= 80).map((s) => s.bpm));
  const combo = Math.max(0, ...sessions.map((s) => s.maxStreak));
  const days = streakDays(sessions);
  const m = (id: string, label: string, hint: string, earned: boolean): Medal => ({ id, label, hint, earned });
  return [
    m('first', 'Primeira sessão', 'Conclua um desafio', sessions.length >= 1),
    m('acc80', 'Meta batida', 'Termine um desafio com 80% de precisão', best >= 80),
    m('acc95', 'Afiado', 'Termine um desafio com 95% de precisão', best >= 95),
    m('combo30', 'Combo 4x', '30 notas certas seguidas', combo >= 30),
    m('bpm120', 'Ligeiro', '120 BPM com 80% de precisão', fast >= 120),
    m('days3', 'Constância', 'Pratique 3 dias seguidos', days >= 3),
    m('ten', 'Dez sessões', 'Conclua 10 desafios', sessions.length >= 10),
  ];
}

export interface PersonalBest {
  readonly key: string;
  readonly exercise: string;
  readonly bestAccuracy: number;
  readonly bestBpm: number;
  readonly bestScore: number;
  readonly sessions: number;
}

/** Recordes por exercício: melhor precisão, maior andamento (com 80%+) e maior pontuação. */
export function personalBests(sessions: readonly PracticeSession[]): PersonalBest[] {
  const by = new Map<string, PersonalBest>();
  for (const s of sessions) {
    const p = by.get(s.key);
    by.set(s.key, {
      key: s.key,
      exercise: s.exercise,
      bestAccuracy: Math.max(p?.bestAccuracy ?? 0, s.accuracy),
      bestBpm: Math.max(p?.bestBpm ?? 0, s.accuracy >= 80 ? s.bpm : 0),
      bestScore: Math.max(p?.bestScore ?? 0, s.score),
      sessions: (p?.sessions ?? 0) + 1,
    });
  }
  return [...by.values()].sort((a, b) => b.sessions - a.sessions);
}

export interface DayPoint {
  readonly day: string;
  readonly accuracy: number;
  readonly bpm: number;
  readonly sessions: number;
}

/** Uma média de precisão e o maior BPM por dia, em ordem de data. */
export function dailySeries(sessions: readonly PracticeSession[]): DayPoint[] {
  const by = new Map<string, PracticeSession[]>();
  for (const s of sessions) by.set(dayOf(s.at), [...(by.get(dayOf(s.at)) ?? []), s]);
  return [...by.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, list]) => ({
      day,
      accuracy: Math.round(list.reduce((t, s) => t + s.accuracy, 0) / list.length),
      bpm: Math.max(...list.map((s) => s.bpm)),
      sessions: list.length,
    }));
}

/** Valida uma sessão vinda de um arquivo (campos e limites); null se estiver estragada. */
export function parseSession(v: unknown): PracticeSession | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const num = (x: unknown, lo: number, hi: number): number | null => (typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi ? x : null);
  const str = (x: unknown): string | null => (typeof x === 'string' && x.length > 0 && x.length <= 160 ? x : null);
  const at = str(o.at);
  const exercise = str(o.exercise);
  const key = str(o.key);
  const instrument = str(o.instrument) ?? 'Baixo';
  const bpm = num(o.bpm, 20, 400);
  const accuracy = num(o.accuracy, 0, 100);
  const maxStreak = num(o.maxStreak, 0, 100000);
  const score = num(o.score, 0, 1e9);
  const hits = num(o.hits, 0, 1e6);
  const misses = num(o.misses, 0, 1e6);
  if (!at || Number.isNaN(Date.parse(at)) || !exercise || !key || bpm === null || accuracy === null || maxStreak === null || score === null || hits === null || misses === null) return null;
  return { at, exercise, key, instrument, bpm, accuracy, maxStreak, score, hits, misses };
}

/** Junta sessões novas às que já existem, sem repetir (mesmo instante + exercício), mais recentes por último. */
export function mergeSessions(current: readonly PracticeSession[], incoming: readonly unknown[], cap = 1000): { sessions: PracticeSession[]; added: number } {
  const seen = new Set(current.map((s) => `${s.at}|${s.key}`));
  const out = [...current];
  let added = 0;
  for (const raw of incoming) {
    const s = parseSession(raw);
    if (!s || seen.has(`${s.at}|${s.key}`)) continue;
    seen.add(`${s.at}|${s.key}`);
    out.push(s);
    added++;
  }
  out.sort((a, b) => a.at.localeCompare(b.at));
  return { sessions: out.slice(-cap), added };
}
