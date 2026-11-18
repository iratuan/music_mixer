import { ACHIEVEMENTS, CURRICULUM, CURRICULUM_EXERCISES, THEORY_TOPICS, THEORY_XP_PER_TOPIC, dailyQuests, levelProgress, QUEST_POOL } from '@domain';
import type { DatabaseAdapter, Row } from '../platform/database.js';
import { MIGRATIONS, SCHEMA_VERSION } from './schema.js';

/**
 * Regras de músicos, trilhas, sessões, missões, conquistas, ear training e teoria.
 * Portadas de apps/academy/src/legacy/db.main.ts (processo principal do Electron) sem mudar SQL nem
 * regra: só passaram a ser assíncronas sobre DatabaseAdapter. Toda escrita roda dentro de uma
 * transação aberta por `createAcademyData` (uma por operação).
 */

const num = (v: unknown, max = 1e9) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
const str = (v: unknown, max = 200) => String(v ?? '').slice(0, max);
const today = () => new Date().toISOString().slice(0, 10);

export function createServices(db: DatabaseAdapter) {
  const all = <T extends Row = Row>(sql: string, params: readonly unknown[] = []) => db.query<T>(sql, params);
  const first = async (sql: string, params: readonly unknown[] = []) => (await all(sql, params))[0];
  const addXp = (userId: string, xp: number) => db.run(`UPDATE users SET total_xp=total_xp+? WHERE id=?`, [Math.max(0, Math.min(5000, Math.round(xp))), userId]);

  async function createUser(name: string, instrument: string): Promise<string> {
    const id = `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const inst = ['bass', 'guitar', 'keyboard'].includes(instrument) ? instrument : 'bass';
    await db.run(`INSERT INTO users(id,name,primary_instrument,created_at) VALUES(?,?,?,?)`, [id, name.slice(0, 40), inst, new Date().toISOString()]);
    return id;
  }

  /** Migrações, trilhas e exercícios do currículo (reaplicados a cada abertura) e o músico padrão. */
  async function migrateAndSeed(): Promise<number> {
    const has = (await all(`SELECT name FROM sqlite_master WHERE type='table' AND name='meta'`)).length > 0;
    let version = has ? Number((await first(`SELECT v FROM meta WHERE k='schema'`))?.v ?? 0) : 0;
    while (version < SCHEMA_VERSION) {
      await db.script(MIGRATIONS[version]!);
      version++;
      await db.run(`INSERT OR REPLACE INTO meta(k,v) VALUES('schema',?)`, [String(version)]);
    }
    for (const t of CURRICULUM) {
      await db.run(`INSERT OR REPLACE INTO tracks(id,instrument,title,description,level_order,icon) VALUES(?,?,?,?,?,?)`, [t.id, t.instrument, t.title, t.description, t.levelOrder, t.instrument]);
    }
    for (const t of THEORY_TOPICS) await db.run(`INSERT OR REPLACE INTO theory_topics(id,module_id,title,source) VALUES(?,?,?,?)`, [t.id, t.module, t.title, t.source]);
    for (const e of CURRICULUM_EXERCISES) {
      await db.run(`INSERT OR REPLACE INTO exercises(id,track_id,order_index,title,category,difficulty,target_bpm,min_accuracy_to_unlock,config_json) VALUES(?,?,?,?,?,?,?,?,?)`, [
        e.id, e.trackId, e.orderIndex, e.title, e.category, e.difficulty, e.targetBpm, e.minAccuracyToUnlock, JSON.stringify(e.config),
      ]);
    }
    if ((await all(`SELECT id FROM users`)).length === 0) await createUser('Músico', 'bass');
    return version;
  }

  const UserService = {
    list: () => all(`SELECT * FROM users ORDER BY created_at`),
    create: (name: string, instrument: string) => createUser(str(name, 40) || 'Músico', str(instrument, 12)),
  };

  const TrackService = {
    list: () => all(`SELECT * FROM tracks ORDER BY instrument, level_order`),
    exercises: (trackId: string) => all(`SELECT * FROM exercises WHERE track_id=? ORDER BY order_index`, [str(trackId, 40)]),
  };

  const QuestService = {
    /** Cria (se preciso) e devolve as 3 missões de hoje. */
    async today(userId: string) {
      const d = today();
      for (const q of dailyQuests(d)) {
        await db.run(`INSERT OR IGNORE INTO daily_quests(user_id,quest_date,quest_code,title,target_value,xp_reward) VALUES(?,?,?,?,?,?)`, [userId, d, q.code, q.title, q.target, q.xp]);
      }
      return all(`SELECT quest_code, title, target_value, current_value, xp_reward, completed FROM daily_quests WHERE user_id=? AND quest_date=? ORDER BY id`, [userId, d]);
    },
    /** Soma ou guarda o maior valor; ao completar, dá o XP da missão. Devolve os títulos concluídos agora. */
    async bump(userId: string, code: string, amount: number): Promise<string[]> {
      await QuestService.today(userId);
      const def = QUEST_POOL.find((q) => q.code === code);
      const row = await first(`SELECT id, current_value, target_value, xp_reward, completed, title FROM daily_quests WHERE user_id=? AND quest_date=? AND quest_code=?`, [userId, today(), code]);
      if (!def || !row || row.completed) return [];
      const cur = def.mode === 'max' ? Math.max(Number(row.current_value), amount) : Number(row.current_value) + amount;
      const done = cur >= Number(row.target_value);
      await db.run(`UPDATE daily_quests SET current_value=?, completed=? WHERE id=?`, [Math.min(cur, Number(row.target_value)), done ? 1 : 0, row.id]);
      if (done) await addXp(userId, Number(row.xp_reward));
      return done ? [String(row.title)] : [];
    },
  };

  const AchievementService = {
    list: (userId: string) => all(`SELECT achievement_code code, unlocked_at FROM user_achievements WHERE user_id=?`, [userId]),
    /** Confere todas as regras e desbloqueia o que faltar. Devolve os títulos novos. */
    async check(userId: string): Promise<string[]> {
      const have = new Set((await AchievementService.list(userId)).map((r) => String(r.code)));
      const sum = async (where: string) => Number((await first(`SELECT COALESCE(SUM(correct_answers),0) n FROM ear_training_stats WHERE user_id=? ${where}`, [userId]))?.n ?? 0);
      const u = await first(`SELECT total_xp x, current_streak c FROM users WHERE id=?`, [userId]);
      if (!u) return [];
      const insts = new Set((await all(`SELECT DISTINCT instrument_used i FROM practice_sessions WHERE user_id=?`, [userId])).map((r) => String(r.i)));
      const theory = Number((await first(`SELECT COUNT(*) n FROM user_theory_progress WHERE user_id=?`, [userId]))?.n ?? 0);
      const rules: Record<string, boolean> = {
        first_ear: (await sum('')) >= 1,
        interval_sniper: (await sum(`AND category='intervals'`)) >= 50,
        circle_master: (await sum(`AND category='circle'`)) >= 20,
        chord_ear: (await sum(`AND category='chords'`)) >= 30,
        ear_100: (await sum('')) >= 100,
        streak_20: Number((await first(`SELECT COALESCE(MAX(best_streak),0) n FROM ear_training_stats WHERE user_id=?`, [userId]))?.n ?? 0) >= 20,
        fire_30: Number(u.c) >= 30,
        theory_all: theory >= THEORY_TOPICS.length,
        polyvalent: insts.has('bass') && (insts.has('guitar') || insts.has('acoustic')) && theory >= 1,
        level_10: levelProgress(Number(u.x)).level >= 10,
      };
      const fresh: string[] = [];
      for (const a of ACHIEVEMENTS) {
        if (rules[a.code] && !have.has(a.code)) {
          await db.run(`INSERT OR IGNORE INTO user_achievements(user_id,achievement_code,unlocked_at) VALUES(?,?,?)`, [userId, a.code, new Date().toISOString()]);
          fresh.push(a.title);
        }
      }
      return fresh;
    },
  };

  const ProgressService = {
    sessions: (userId: string) => all(`SELECT key, accuracy, bpm, exercise_id, played_at FROM practice_sessions WHERE user_id=? ORDER BY played_at`, [str(userId, 40)]),
    progress: (userId: string) => all(`SELECT * FROM user_progress WHERE user_id=?`, [str(userId, 40)]),
    /** Grava a sessão, atualiza o progresso do exercício (recordes, tentativas, status) e o XP/sequência do músico. */
    async record(s: Record<string, unknown>): Promise<void> {
      const userId = str(s.userId, 40);
      const exerciseId = s.exerciseId ? str(s.exerciseId, 40) : null;
      const accuracy = num(s.accuracy, 100);
      const bpm = num(s.bpm, 400);
      const score = num(s.score);
      const at = new Date().toISOString();
      await db.run(`INSERT INTO practice_sessions(user_id,exercise_id,key,instrument_used,score,accuracy,bpm,max_combo,duration_seconds,played_at) VALUES(?,?,?,?,?,?,?,?,?,?)`, [
        userId, exerciseId, str(s.key), str(s.instrument, 30), score, accuracy, bpm, num(s.maxCombo), num(s.durationSeconds, 86400), at,
      ]);
      if (exerciseId) {
        const ex = await first(`SELECT min_accuracy_to_unlock m, target_bpm t FROM exercises WHERE id=?`, [exerciseId]);
        if (ex) {
          const prev = await first(`SELECT * FROM user_progress WHERE user_id=? AND exercise_id=?`, [userId, exerciseId]);
          const bestAcc = Math.max(accuracy, Number(prev?.best_accuracy ?? 0));
          const bestBpm = accuracy >= Number(ex.m) ? Math.max(bpm, Number(prev?.max_bpm_achieved ?? 0)) : Number(prev?.max_bpm_achieved ?? 0);
          const status = bestAcc < Number(ex.m) ? 'unlocked' : bestBpm >= Number(ex.t) ? 'mastered' : 'completed';
          await db.run(`INSERT OR REPLACE INTO user_progress(user_id,exercise_id,status,best_score,best_accuracy,max_bpm_achieved,attempts_count,updated_at) VALUES(?,?,?,?,?,?,?,?)`, [
            userId, exerciseId, status, Math.max(score, Number(prev?.best_score ?? 0)), bestAcc, bestBpm, Number(prev?.attempts_count ?? 0) + 1, at,
          ]);
        }
      }
      const todayStr = at.slice(0, 10);
      const u = await first(`SELECT last_practice_date d, current_streak c, total_xp x FROM users WHERE id=?`, [userId]);
      if (u) {
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        const streak = u.d === todayStr ? Number(u.c) : u.d === yesterday ? Number(u.c) + 1 : 1;
        await db.run(`UPDATE users SET total_xp=?, current_streak=?, last_practice_date=? WHERE id=?`, [Number(u.x) + num(s.xp, 5000), streak, todayStr, userId]);
      }
      await QuestService.bump(userId, 'practice_1', 1);
      await QuestService.bump(userId, 'practice_acc80', accuracy);
      await AchievementService.check(userId);
    },
  };

  const EarService = {
    stats: (userId: string) => all(`SELECT category, exercise_type, total_attempts, correct_answers, best_streak, avg_response_time_ms FROM ear_training_stats WHERE user_id=?`, [userId]),
    async record(a: Record<string, unknown>) {
      const userId = str(a.userId, 40);
      if (!(await all(`SELECT id FROM users WHERE id=?`, [userId])).length) return null;
      const category = str(a.category, 20);
      const type = str(a.type, 60);
      const correct = a.correct === true;
      const ms = num(a.ms, 600000);
      const streak = num(a.streak, 10000);
      const xp = correct ? num(a.xp, 500) : 0;
      const prev = await first(`SELECT * FROM ear_training_stats WHERE user_id=? AND exercise_type=?`, [userId, type]);
      const attempts = Number(prev?.total_attempts ?? 0) + 1;
      await db.run(`INSERT OR REPLACE INTO ear_training_stats(user_id,category,exercise_type,total_attempts,correct_answers,best_streak,avg_response_time_ms,updated_at) VALUES(?,?,?,?,?,?,?,?)`, [
        userId, category, type, attempts, Number(prev?.correct_answers ?? 0) + (correct ? 1 : 0), Math.max(Number(prev?.best_streak ?? 0), streak),
        Math.round((Number(prev?.avg_response_time_ms ?? 0) * (attempts - 1) + ms) / attempts), new Date().toISOString(),
      ]);
      if (xp) await addXp(userId, xp);
      const quests: string[] = [...(await QuestService.bump(userId, 'ear_answers20', 1))];
      if (correct) {
        quests.push(...(await QuestService.bump(userId, 'ear_correct15', 1)));
        if (category === 'circle') quests.push(...(await QuestService.bump(userId, 'circle_5', 1)));
      }
      quests.push(...(await QuestService.bump(userId, 'ear_streak10', streak)));
      const badges = await AchievementService.check(userId);
      return { xp, quests, badges, totalXp: Number((await first(`SELECT total_xp x FROM users WHERE id=?`, [userId]))?.x ?? 0) };
    },
  };

  const TheoryService = {
    progress: (userId: string) => all(`SELECT topic_id, completed_at FROM user_theory_progress WHERE user_id=?`, [str(userId, 40)]),
    /** Marca o tópico como concluído (uma vez) e dá o XP teórico. */
    async complete(userId: string, topicId: string): Promise<boolean> {
      const u = str(userId, 40);
      const t = str(topicId, 20);
      if (!(await all(`SELECT id FROM theory_topics WHERE id=?`, [t])).length || !(await all(`SELECT id FROM users WHERE id=?`, [u])).length) return false;
      if ((await all(`SELECT 1 FROM user_theory_progress WHERE user_id=? AND topic_id=?`, [u, t])).length) return false;
      await db.run(`INSERT INTO user_theory_progress(user_id,topic_id,completed_at,xp) VALUES(?,?,?,?)`, [u, t, new Date().toISOString(), THEORY_XP_PER_TOPIC]);
      await addXp(u, THEORY_XP_PER_TOPIC);
      await QuestService.bump(u, 'theory_1', 1);
      await QuestService.bump(u, 'theory_2', 1);
      await AchievementService.check(u);
      return true;
    },
  };

  /** Entrada única: só operações conhecidas (mesmos nomes do antigo canal IPC 'db:call'). */
  async function call(op: unknown, a: Record<string, unknown> = {}): Promise<unknown> {
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

  return { migrateAndSeed, call };
}

/** Operações que só leem. `quests.today` e `achievements.check` escrevem (criam missões e conquistas). */
const READ_ONLY_OPS: ReadonlySet<string> = new Set([
  'users.list', 'tracks.list', 'tracks.exercises', 'sessions.list', 'progress.list', 'ear.stats', 'achievements.list', 'theory.progress',
]);

/**
 * Abre os dados do Academy sobre um adapter: migra e semeia, e devolve `call` com as operações em fila
 * (uma por vez, cada uma numa transação: nada se intercala entre um `await` e outro).
 */
export async function createAcademyData(db: DatabaseAdapter) {
  const services = createServices(db);
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = queue.then(fn, fn);
    queue = next.catch(() => undefined);
    return next;
  };
  const version = await serial(() => db.transaction(() => services.migrateAndSeed()));
  return {
    schemaVersion: version,
    // Leituras puras não abrem transação (nada a persistir); as demais escrevem e persistem ao confirmar.
    call: (op: string, args?: Record<string, unknown>) =>
      serial(() => (READ_ONLY_OPS.has(op) ? services.call(op, args ?? {}) : db.transaction(() => services.call(op, args ?? {})))),
    exportBytes: () => serial(() => db.exportBytes()),
  };
}
export type AcademyData = Awaited<ReturnType<typeof createAcademyData>>;
