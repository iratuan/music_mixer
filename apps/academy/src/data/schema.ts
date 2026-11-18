/**
 * Schema do banco do Academy (idêntico ao que rodava no processo principal do Electron, v3).
 * Migrações só crescem: nunca editar uma já publicada; acrescentar a próxima no fim.
 */
export const SCHEMA_VERSION = 3;
export const MIGRATIONS: readonly string[] = [
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
