import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { CURRICULUM_EXERCISES, THEORY_TOPICS, THEORY_XP_PER_TOPIC } from '@domain';
import { SCHEMA_VERSION } from '../src/data/schema.js';
import { createAcademyData } from '../src/data/services.js';
import { sqlJsAdapter, type SqlJsStatic } from '../src/platform/sqljs.js';

const require = createRequire(import.meta.url);
const initSqlJs = require('sql.js') as () => Promise<SqlJsStatic>;

/** Banco novo (ou a partir de bytes) com as gravações capturadas, como o shell faria no IndexedDB. */
async function open(initial: Uint8Array | null = null) {
  const SQL = await initSqlJs();
  const saved: Uint8Array[] = [];
  const adapter = sqlJsAdapter(SQL, initial, async (b) => void saved.push(b));
  const data = await createAcademyData(adapter);
  return { data, adapter, saved };
}
type User = { id: string; name: string; total_xp: number; current_streak: number; last_practice_date: string | null };

describe('dados do Academy (DatabaseAdapter + sql.js)', () => {
  it('migra até a versão atual, semeia o currículo e cria o músico padrão', async () => {
    const { data, adapter, saved } = await open();
    expect(data.schemaVersion).toBe(SCHEMA_VERSION);
    const users = (await data.call('users.list')) as User[];
    expect(users.map((u) => u.name)).toEqual(['Músico']);
    const ex = await adapter.query<{ n: number }>('SELECT COUNT(*) n FROM exercises');
    expect(ex[0]!.n).toBe(CURRICULUM_EXERCISES.length);
    const topics = await adapter.query<{ n: number }>('SELECT COUNT(*) n FROM theory_topics');
    expect(topics[0]!.n).toBe(THEORY_TOPICS.length);
    expect(saved.length).toBe(1); // migração + semente numa transação só
  });

  it('reabrir a partir dos bytes persistidos não duplica nada e mantém os dados', async () => {
    const first = await open();
    const id = (await first.data.call('users.create', { name: 'Ana', instrument: 'guitar' })) as string;
    const bytes = first.saved.at(-1)!;
    const second = await open(bytes);
    const users = (await second.data.call('users.list')) as User[];
    expect(users.map((u) => u.name)).toEqual(['Músico', 'Ana']);
    expect(users.some((u) => u.id === id)).toBe(true);
    const ex = await second.adapter.query<{ n: number }>('SELECT COUNT(*) n FROM exercises');
    expect(ex[0]!.n).toBe(CURRICULUM_EXERCISES.length);
  });

  it('leituras não persistem; escritas persistem uma vez por operação', async () => {
    const { data, saved } = await open();
    const before = saved.length;
    await data.call('users.list');
    await data.call('tracks.list');
    expect(saved.length).toBe(before);
    await data.call('users.create', { name: 'Bia', instrument: 'bass' });
    expect(saved.length).toBe(before + 1);
  });

  it('sessão de prática: grava, atualiza progresso, XP, sequência e missão do dia', async () => {
    const { data } = await open();
    const [user] = (await data.call('users.list')) as User[];
    const exercise = CURRICULUM_EXERCISES[0]!;
    await data.call('sessions.record', { userId: user!.id, exerciseId: exercise.id, accuracy: 95, bpm: exercise.targetBpm, score: 1200, xp: 40, instrument: 'bass', key: 'C' });
    const progress = (await data.call('progress.list', { userId: user!.id })) as Array<{ exercise_id: string; status: string; attempts_count: number; best_accuracy: number }>;
    expect(progress).toHaveLength(1);
    expect(progress[0]).toMatchObject({ exercise_id: exercise.id, status: 'mastered', attempts_count: 1, best_accuracy: 95 });
    const [after] = (await data.call('users.list')) as User[];
    expect(after!.current_streak).toBe(1);
    expect(after!.last_practice_date).toBe(new Date().toISOString().slice(0, 10));
    expect(after!.total_xp).toBeGreaterThanOrEqual(40);
    const quests = (await data.call('quests.today', { userId: user!.id })) as Array<{ quest_code: string; current_value: number }>;
    expect(quests).toHaveLength(3);
    const sessions = (await data.call('sessions.list', { userId: user!.id })) as unknown[];
    expect(sessions).toHaveLength(1);
  });

  it('ear training: acumula estatística e libera "first_ear"', async () => {
    const { data } = await open();
    const [user] = (await data.call('users.list')) as User[];
    const r = (await data.call('ear.record', { userId: user!.id, category: 'intervals', type: 'interval-3M', correct: true, ms: 800, streak: 1, xp: 10 })) as { xp: number; badges: string[] };
    expect(r.xp).toBe(10);
    await data.call('ear.record', { userId: user!.id, category: 'intervals', type: 'interval-3M', correct: false, ms: 1200, streak: 0 });
    const stats = (await data.call('ear.stats', { userId: user!.id })) as Array<{ total_attempts: number; correct_answers: number; avg_response_time_ms: number }>;
    expect(stats[0]).toMatchObject({ total_attempts: 2, correct_answers: 1, avg_response_time_ms: 1000 });
    const ach = (await data.call('achievements.list', { userId: user!.id })) as Array<{ code: string }>;
    expect(ach.map((a) => a.code)).toContain('first_ear');
  });

  it('teoria: concluir dá XP uma vez só; tópico ou músico inexistente é recusado', async () => {
    const { data } = await open();
    const [user] = (await data.call('users.list')) as User[];
    const topic = THEORY_TOPICS[0]!.id;
    expect(await data.call('theory.complete', { userId: user!.id, topicId: topic })).toBe(true);
    expect(await data.call('theory.complete', { userId: user!.id, topicId: topic })).toBe(false);
    expect(await data.call('theory.complete', { userId: user!.id, topicId: 'nao-existe' })).toBe(false);
    expect(await data.call('theory.complete', { userId: 'ninguem', topicId: topic })).toBe(false);
    const [after] = (await data.call('users.list')) as User[];
    expect(after!.total_xp).toBeGreaterThanOrEqual(THEORY_XP_PER_TOPIC);
  });

  it('operação desconhecida falha sem gravar, e a fila segue funcionando', async () => {
    const { data, saved } = await open();
    const before = saved.length;
    await expect(data.call('drop.everything')).rejects.toThrow('operação desconhecida');
    expect(saved.length).toBe(before);
    expect(((await data.call('users.list')) as unknown[]).length).toBe(1);
  });

  it('operações concorrentes não se intercalam dentro de uma transação', async () => {
    const { data } = await open();
    const names = Array.from({ length: 8 }, (_, i) => `M${i}`);
    await Promise.all(names.map((name) => data.call('users.create', { name, instrument: 'bass' })));
    const users = (await data.call('users.list')) as User[];
    expect(users).toHaveLength(1 + names.length);
  });
});
