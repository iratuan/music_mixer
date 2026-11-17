import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { ACHIEVEMENTS, CURRICULUM, CURRICULUM_EXERCISES, THEORY_TOPICS, THEORY_XP_PER_TOPIC, dailyQuests, levelProgress, QUEST_POOL } from '@domain';
// sql.js em JavaScript puro (sem módulo nativo): o banco SQLite fica em memória e é gravado em userData/mixercraft.sqlite.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const initSqlJs = require('sql.js/dist/sql-asm.js') as (cfg?: unknown) => Promise<{ Database: new (data?: Uint8Array) => Db }>;

interface Stmt {
  bind(v: unknown[]): void;
  step(): boolean;
  getAsObject(): Record<string, unknown>;
  free(): void;
}
interface Db {
  run(sql: string, params?: unknown[]): void;
  prepare(sql: string): Stmt;
  export(): Uint8Array;
  exec(sql: string): unknown;
}

const SCHEMA_VERSION = 3;
const MIGRATIONS: readonly string[] = [
  `CREATE TABLE users (
     id TEXT PRIMARY KEY, name TEXT NOT NULL, avatar_url TEXT, primary_instrument TEXT NOT NULL DEFAULT 'bass',
     skill_level TEXT NOT NULL DEFAULT 'iniciante', total_xp INTEGER NOT NULL DEFAULT 0, current_streak INTEGER NOT NULL DEFAULT 0,
     last_practice_date TEXT, created_at TEXT NOT NULL);
   CREATE TABLE tracks (
     id TEXT PRIMARY KEY, instrument TEXT NOT NULL, title TEXT NOT NULL, description TEXT, level_order INTEGER NOT NULL, icon TEXT);
   CREATE TABLE exercises (
     id TEXT PRIMARY KEY, track_id TEXT NOT NULL REFERENCES tracks(id), order_index INTEGER NOT NULL, title TEXT NOT NULL,
     category TEXT NOT NULL, difficulty TEXT NOT NULL, target_bpm INTEGER NOT NULL, min_accuracy_to_unlock INTEGER NOT NULL, config_json TEXT NOT NULL);
   CREATE TABLE user_progress (
     id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL REFERENCES users(id), exercise_id TEXT NOT NULL REFERENCES exercises(id),
     status TEXT NOT NULL DEFAULT 'locked', best_score INTEGER NOT NULL DEFAULT 0, best_accuracy INTEGER NOT NULL DEFAULT 0,
     max_bpm_achieved INTEGER NOT NULL DEFAULT 0, attempts_count INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, UNIQUE(user_id, exercise_id));
   CREATE TABLE practice_sessions (
     id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL REFERENCES users(id), exercise_id TEXT, key TEXT,
     instrument_used TEXT, score INTEGER NOT NULL, accuracy INTEGER NOT NULL, bpm INTEGER NOT NULL, max_combo INTEGER NOT NULL,
     duration_seconds INTEGER NOT NULL DEFAULT 0, played_at TEXT NOT NULL);
   CREATE INDEX idx_sessions_user ON practice_sessions(user_id, played_at);
   CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT);`,
  `CREATE TABLE theory_topics (id TEXT PRIMARY KEY, module_id INTEGER NOT NULL, title TEXT NOT NULL, source TEXT NOT NULL);
   CREATE TABLE user_theory_progress (
     user_id TEXT NOT NULL REFERENCES users(id), topic_id TEXT NOT NULL REFERENCES theory_topics(id),
     completed_at TEXT NOT NULL, xp INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(user_id, topic_id));`,
  `CREATE TABLE ear_training_stats (
     id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL REFERENCES users(id), category TEXT NOT NULL, exercise_type TEXT NOT NULL,
     total_attempts INTEGER NOT NULL DEFAULT 0, correct_answers INTEGER NOT NULL DEFAULT 0, best_streak INTEGER NOT NULL DEFAULT 0,
     avg_response_time_ms INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, UNIQUE(user_id, exercise_type));
   CREATE TABLE daily_quests (
     id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL REFERENCES users(id), quest_date TEXT NOT NULL, quest_code TEXT NOT NULL,
     title TEXT NOT NULL, target_value INTEGER NOT NULL, current_value INTEGER NOT NULL DEFAULT 0, xp_reward INTEGER NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
     UNIQUE(user_id, quest_date, quest_code));
   CREATE TABLE user_achievements (
     id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL REFERENCES users(id), achievement_code TEXT NOT NULL, unlocked_at TEXT NOT NULL,
     UNIQUE(user_id, achievement_code));`,
];

let db: Db | null = null;
let file = '';

function persist(): void {
  if (db) fs.writeFileSync(file, Buffer.from(db.export()));
}
function all(sql: string, params: unknown[] = []): Record<string, unknown>[] {
  const st = db!.prepare(sql);
  st.bind(params);
  const out: Record<string, unknown>[] = [];
  while (st.step()) out.push(st.getAsObject());
  st.free();
  return out;
}

/** Abre (ou cria) o banco, aplica as migrações e semeia trilhas e exercícios. */
export async function openDatabase(): Promise<void> {
  if (db) return;
  const SQL = await initSqlJs();
  file = path.join(app.getPath('userData'), 'mixercraft.sqlite');
  db = new SQL.Database(fs.existsSync(file) ? new Uint8Array(fs.readFileSync(file)) : undefined);
  const has = all(`SELECT name FROM sqlite_master WHERE type='table' AND name='meta'`).length > 0;
  let version = has ? Number(all(`SELECT v FROM meta WHERE k='schema'`)[0]?.v ?? 0) : 0;
  while (version < SCHEMA_VERSION) {
    db.exec(MIGRATIONS[version]!);
    version++;
    db.run(`INSERT OR REPLACE INTO meta(k,v) VALUES('schema',?)`, [String(version)]);
  }
  seed();
  if (all(`SELECT id FROM users`).length === 0) createUser('Músico', 'bass');
  persist();
}

/** Trilhas e exercícios do currículo (reaplicado a cada abertura: atualiza títulos e metas). */
function seed(): void {
  for (const t of CURRICULUM) {
    db!.run(`INSERT OR REPLACE INTO tracks(id,instrument,title,description,level_order,icon) VALUES(?,?,?,?,?,?)`, [t.id, t.instrument, t.title, t.description, t.levelOrder, t.instrument]);
  }
  for (const t of THEORY_TOPICS) db!.run(`INSERT OR REPLACE INTO theory_topics(id,module_id,title,source) VALUES(?,?,?,?)`, [t.id, t.module, t.title, t.source]);
  for (const e of CURRICULUM_EXERCISES) {
    db!.run(`INSERT OR REPLACE INTO exercises(id,track_id,order_index,title,category,difficulty,target_bpm,min_accuracy_to_unlock,config_json) VALUES(?,?,?,?,?,?,?,?,?)`, [
      e.id, e.trackId, e.orderIndex, e.title, e.category, e.difficulty, e.targetBpm, e.minAccuracyToUnlock, JSON.stringify(e.config),
    ]);
  }
}

// ---------------------------------------------------------------- serviços
function createUser(name: string, instrument: string): string {
  const id = `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const inst = ['bass', 'guitar', 'keyboard'].includes(instrument) ? instrument : 'bass';
  db!.run(`INSERT INTO users(id,name,primary_instrument,created_at) VALUES(?,?,?,?)`, [id, name.slice(0, 40), inst, new Date().toISOString()]);
  return id;
}

const num = (v: unknown, max = 1e9) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
const str = (v: unknown, max = 200) => String(v ?? '').slice(0, max);

export const UserService = {
  list: () => all(`SELECT * FROM users ORDER BY created_at`),
  create: (name: string, instrument: string) => {
    const id = createUser(str(name, 40) || 'Músico', str(instrument, 12));
    persist();
    return id;
  },
};
export const TrackService = {
  list: () => all(`SELECT * FROM tracks ORDER BY instrument, level_order`),
  exercises: (trackId: string) => all(`SELECT * FROM exercises WHERE track_id=? ORDER BY order_index`, [str(trackId, 40)]),
};
export const ProgressService = {
  sessions: (userId: string) => all(`SELECT key, accuracy, bpm, exercise_id, played_at FROM practice_sessions WHERE user_id=? ORDER BY played_at`, [str(userId, 40)]),
  progress: (userId: string) => all(`SELECT * FROM user_progress WHERE user_id=?`, [str(userId, 40)]),
  /** Grava a sessão, atualiza o progresso do exercício (recordes, tentativas, status) e o XP/sequência do músico. */
  record: (s: Record<string, unknown>) => {
    const userId = str(s.userId, 40);
    const exerciseId = s.exerciseId ? str(s.exerciseId, 40) : null;
    const accuracy = num(s.accuracy, 100);
    const bpm = num(s.bpm, 400);
    const score = num(s.score);
    const at = new Date().toISOString();
    db!.run(`INSERT INTO practice_sessions(user_id,exercise_id,key,instrument_used,score,accuracy,bpm,max_combo,duration_seconds,played_at) VALUES(?,?,?,?,?,?,?,?,?,?)`, [
      userId, exerciseId, str(s.key), str(s.instrument, 30), score, accuracy, bpm, num(s.maxCombo), num(s.durationSeconds, 86400), at,
    ]);
    if (exerciseId) {
      const ex = all(`SELECT min_accuracy_to_unlock m, target_bpm t FROM exercises WHERE id=?`, [exerciseId])[0];
      if (ex) {
        const prev = all(`SELECT * FROM user_progress WHERE user_id=? AND exercise_id=?`, [userId, exerciseId])[0];
        const bestAcc = Math.max(accuracy, Number(prev?.best_accuracy ?? 0));
        const bestBpm = accuracy >= Number(ex.m) ? Math.max(bpm, Number(prev?.max_bpm_achieved ?? 0)) : Number(prev?.max_bpm_achieved ?? 0);
        const status = bestAcc < Number(ex.m) ? 'unlocked' : bestBpm >= Number(ex.t) ? 'mastered' : 'completed';
        db!.run(`INSERT OR REPLACE INTO user_progress(user_id,exercise_id,status,best_score,best_accuracy,max_bpm_achieved,attempts_count,updated_at) VALUES(?,?,?,?,?,?,?,?)`, [
          userId, exerciseId, status, Math.max(score, Number(prev?.best_score ?? 0)), bestAcc, bestBpm, Number(prev?.attempts_count ?? 0) + 1, at,
        ]);
      }
    }
    const todayStr = at.slice(0, 10);
    const u = all(`SELECT last_practice_date d, current_streak c, total_xp x FROM users WHERE id=?`, [userId])[0];
    if (u) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const streak = u.d === todayStr ? Number(u.c) : u.d === yesterday ? Number(u.c) + 1 : 1;
      db!.run(`UPDATE users SET total_xp=?, current_streak=?, last_practice_date=? WHERE id=?`, [Number(u.x) + num(s.xp, 5000), streak, todayStr, userId]);
    }
    QuestService.bump(userId, 'practice_1', 1);
    QuestService.bump(userId, 'practice_acc80', accuracy);
    AchievementService.check(userId);
    persist();
  },
};

// ---------------------------------------------------------------- gamificação
const today = () => new Date().toISOString().slice(0, 10);
const addXp = (userId: string, xp: number) => db!.run(`UPDATE users SET total_xp=total_xp+? WHERE id=?`, [Math.max(0, Math.min(5000, Math.round(xp))), userId]);

export const QuestService = {
  /** Cria (se preciso) e devolve as 3 missões de hoje. */
  today: (userId: string) => {
    const d = today();
    for (const q of dailyQuests(d)) {
      db!.run(`INSERT OR IGNORE INTO daily_quests(user_id,quest_date,quest_code,title,target_value,xp_reward) VALUES(?,?,?,?,?,?)`, [userId, d, q.code, q.title, q.target, q.xp]);
    }
    return all(`SELECT quest_code, title, target_value, current_value, xp_reward, completed FROM daily_quests WHERE user_id=? AND quest_date=? ORDER BY id`, [userId, d]);
  },
  /** Soma ou guarda o maior valor; ao completar, dá o XP da missão. Devolve os títulos concluídos agora. */
  bump: (userId: string, code: string, amount: number): string[] => {
    QuestService.today(userId);
    const def = QUEST_POOL.find((q) => q.code === code);
    const row = all(`SELECT id, current_value, target_value, xp_reward, completed, title FROM daily_quests WHERE user_id=? AND quest_date=? AND quest_code=?`, [userId, today(), code])[0];
    if (!def || !row || row.completed) return [];
    const cur = def.mode === 'max' ? Math.max(Number(row.current_value), amount) : Number(row.current_value) + amount;
    const done = cur >= Number(row.target_value);
    db!.run(`UPDATE daily_quests SET current_value=?, completed=? WHERE id=?`, [Math.min(cur, Number(row.target_value)), done ? 1 : 0, row.id]);
    if (done) addXp(userId, Number(row.xp_reward));
    return done ? [String(row.title)] : [];
  },
};

export const AchievementService = {
  list: (userId: string) => all(`SELECT achievement_code code, unlocked_at FROM user_achievements WHERE user_id=?`, [userId]),
  /** Confere todas as regras e desbloqueia o que faltar. Devolve os títulos novos. */
  check: (userId: string): string[] => {
    const have = new Set(AchievementService.list(userId).map((r) => String(r.code)));
    const sum = (where: string) => Number(all(`SELECT COALESCE(SUM(correct_answers),0) n FROM ear_training_stats WHERE user_id=? ${where}`, [userId])[0]?.n ?? 0);
    const u = all(`SELECT total_xp x, current_streak c FROM users WHERE id=?`, [userId])[0];
    if (!u) return [];
    const insts = new Set(all(`SELECT DISTINCT instrument_used i FROM practice_sessions WHERE user_id=?`, [userId]).map((r) => String(r.i)));
    const theory = Number(all(`SELECT COUNT(*) n FROM user_theory_progress WHERE user_id=?`, [userId])[0]?.n ?? 0);
    const rules: Record<string, boolean> = {
      first_ear: sum('') >= 1,
      interval_sniper: sum(`AND category='intervals'`) >= 50,
      circle_master: sum(`AND category='circle'`) >= 20,
      chord_ear: sum(`AND category='chords'`) >= 30,
      ear_100: sum('') >= 100,
      streak_20: Number(all(`SELECT COALESCE(MAX(best_streak),0) n FROM ear_training_stats WHERE user_id=?`, [userId])[0]?.n ?? 0) >= 20,
      fire_30: Number(u.c) >= 30,
      theory_all: theory >= THEORY_TOPICS.length,
      polyvalent: insts.has('bass') && (insts.has('guitar') || insts.has('acoustic')) && theory >= 1,
      level_10: levelProgress(Number(u.x)).level >= 10,
    };
    const fresh: string[] = [];
    for (const a of ACHIEVEMENTS) {
      if (rules[a.code] && !have.has(a.code)) {
        db!.run(`INSERT OR IGNORE INTO user_achievements(user_id,achievement_code,unlocked_at) VALUES(?,?,?)`, [userId, a.code, new Date().toISOString()]);
        fresh.push(a.title);
      }
    }
    return fresh;
  },
};

export const EarService = {
  stats: (userId: string) => all(`SELECT category, exercise_type, total_attempts, correct_answers, best_streak, avg_response_time_ms FROM ear_training_stats WHERE user_id=?`, [userId]),
  record: (a: Record<string, unknown>) => {
    const userId = str(a.userId, 40);
    if (!all(`SELECT id FROM users WHERE id=?`, [userId]).length) return null;
    const category = str(a.category, 20);
    const type = str(a.type, 60);
    const correct = a.correct === true;
    const ms = num(a.ms, 600000);
    const streak = num(a.streak, 10000);
    const xp = correct ? num(a.xp, 500) : 0;
    const prev = all(`SELECT * FROM ear_training_stats WHERE user_id=? AND exercise_type=?`, [userId, type])[0];
    const attempts = Number(prev?.total_attempts ?? 0) + 1;
    db!.run(`INSERT OR REPLACE INTO ear_training_stats(user_id,category,exercise_type,total_attempts,correct_answers,best_streak,avg_response_time_ms,updated_at) VALUES(?,?,?,?,?,?,?,?)`, [
      userId, category, type, attempts, Number(prev?.correct_answers ?? 0) + (correct ? 1 : 0), Math.max(Number(prev?.best_streak ?? 0), streak),
      Math.round((Number(prev?.avg_response_time_ms ?? 0) * (attempts - 1) + ms) / attempts), new Date().toISOString(),
    ]);
    if (xp) addXp(userId, xp);
    const quests: string[] = [...QuestService.bump(userId, 'ear_answers20', 1)];
    if (correct) {
      quests.push(...QuestService.bump(userId, 'ear_correct15', 1));
      if (category === 'circle') quests.push(...QuestService.bump(userId, 'circle_5', 1));
    }
    quests.push(...QuestService.bump(userId, 'ear_streak10', streak));
    const badges = AchievementService.check(userId);
    persist();
    return { xp, quests, badges, totalXp: Number(all(`SELECT total_xp x FROM users WHERE id=?`, [userId])[0]?.x ?? 0) };
  },
};

export const TheoryService = {
  progress: (userId: string) => all(`SELECT topic_id, completed_at FROM user_theory_progress WHERE user_id=?`, [str(userId, 40)]),
  /** Marca o tópico como concluído (uma vez) e dá o XP teórico. */
  complete: (userId: string, topicId: string) => {
    const u = str(userId, 40);
    const t = str(topicId, 20);
    if (!all(`SELECT id FROM theory_topics WHERE id=?`, [t]).length || !all(`SELECT id FROM users WHERE id=?`, [u]).length) return false;
    if (all(`SELECT 1 FROM user_theory_progress WHERE user_id=? AND topic_id=?`, [u, t]).length) return false;
    db!.run(`INSERT INTO user_theory_progress(user_id,topic_id,completed_at,xp) VALUES(?,?,?,?)`, [u, t, new Date().toISOString(), THEORY_XP_PER_TOPIC]);
    addXp(u, THEORY_XP_PER_TOPIC);
    QuestService.bump(u, 'theory_1', 1);
    QuestService.bump(u, 'theory_2', 1);
    AchievementService.check(u);
    persist();
    return true;
  },
};

/** Entrada única do IPC: só operações conhecidas. */
export function dbCall(op: unknown, a: Record<string, unknown> = {}): unknown {
  if (!db) throw new Error('banco indisponível');
  switch (op) {
    case 'users.list': return UserService.list();
    case 'users.create': return UserService.create(str(a.name, 40), str(a.instrument, 12));
    case 'tracks.list': return TrackService.list();
    case 'tracks.exercises': return TrackService.exercises(str(a.trackId, 40));
    case 'sessions.list': return ProgressService.sessions(str(a.userId, 40));
    case 'progress.list': return ProgressService.progress(str(a.userId, 40));
    case 'ear.record': return EarService.record(a);
    case 'ear.stats': return EarService.stats(str(a.userId, 40));
    case 'quests.today': return QuestService.today(str(a.userId, 40));
    case 'achievements.list': return AchievementService.list(str(a.userId, 40));
    case 'achievements.check': return AchievementService.check(str(a.userId, 40));
    case 'theory.progress': return TheoryService.progress(str(a.userId, 40));
    case 'theory.complete': return TheoryService.complete(str(a.userId, 40), str(a.topicId, 20));
    case 'sessions.record': return ProgressService.record(a);
    default: throw new Error('operação desconhecida');
  }
}
