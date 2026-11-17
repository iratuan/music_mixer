import { useEffect, useState } from 'react';
import { ACHIEVEMENTS, EAR_CATEGORIES, RANKS, levelProgress } from '@domain';
import { call, loadUsers, type DbUser } from '../lib/db.js';

interface Quest {
  quest_code: string;
  title: string;
  target_value: number;
  current_value: number;
  xp_reward: number;
  completed: number;
}
interface EarStat {
  category: string;
  total_attempts: number;
  correct_answers: number;
  best_streak: number;
}

/** Conquistas, missões do dia e estatísticas de ouvido do músico ativo. */
export function Achievements() {
  const [user, setUser] = useState<DbUser | null>(null);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [unlocked, setUnlocked] = useState<Map<string, string>>(new Map());
  const [stats, setStats] = useState<EarStat[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const r = await loadUsers();
        await call('achievements.check', { userId: r.active });
        setUser(r.users.find((u) => u.id === r.active) ?? null);
        setQuests(await call<Quest[]>('quests.today', { userId: r.active }));
        const list = await call<Array<{ code: string; unlocked_at: string }>>('achievements.list', { userId: r.active });
        setUnlocked(new Map(list.map((x) => [x.code, x.unlocked_at])));
        setStats(await call<EarStat[]>('ear.stats', { userId: r.active }));
      } catch {
        /* sem banco */
      }
    })();
  }, []);

  const lv = levelProgress(user?.total_xp ?? 0);
  const byCat = EAR_CATEGORIES.map((c) => {
    const rows = stats.filter((s) => s.category === c.id);
    const total = rows.reduce((t, r) => t + r.total_attempts, 0);
    const ok = rows.reduce((t, r) => t + r.correct_answers, 0);
    return { c, total, ok, best: rows.reduce((m, r) => Math.max(m, r.best_streak), 0) };
  });

  return (
    <div className="screen">
      <header className="page-head">
        <h1>Conquistas & missões</h1>
        <p className="muted">XP único para todo o app: esteira, teoria e ear training.</p>
      </header>

      <section className="card ach-level">
        <div>
          <span className="muted small">Nível {lv.level} de 100</span>
          <h2>{lv.title}</h2>
          <div className="dash-bar"><span style={{ width: `${Math.round(lv.fraction * 100)}%` }} /></div>
          <span className="muted small">{lv.xp} XP · {lv.level >= 100 ? 'nível máximo' : `${lv.span - lv.into} XP para o nível ${lv.level + 1}`}</span>
        </div>
        <ol className="ach-ranks">
          {RANKS.map((r) => (
            <li key={r.from} className={lv.level >= r.from ? 'on' : ''}><b>{r.from}</b> {r.title}</li>
          ))}
        </ol>
      </section>

      <section className="card">
        <h3>Missões de hoje</h3>
        <ul className="quest-list">
          {quests.map((q) => (
            <li key={q.quest_code} className={q.completed ? 'done' : ''}>
              <span>
                <b>{q.title}</b>
                <span className="muted small"> · +{q.xp_reward} XP</span>
              </span>
              <span className="quest-bar"><span style={{ width: `${Math.round((q.current_value / q.target_value) * 100)}%` }} /></span>
              <span className="muted small">{q.completed ? 'Concluída ✓' : `${q.current_value}/${q.target_value}`}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h3>Galeria de conquistas</h3>
        <div className="ach-grid">
          {ACHIEVEMENTS.map((a) => {
            const at = unlocked.get(a.code);
            return (
              <div key={a.code} className={`ach-badge ${at ? 'on' : ''}`}>
                <span className="ach-medal" aria-hidden="true">{at ? '★' : '🔒'}</span>
                <b>{a.title}</b>
                <span className="muted small">{a.hint}</span>
                {at && <span className="small ach-date">{new Date(at).toLocaleDateString('pt-BR')}</span>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h3>Ear training por categoria</h3>
        <table className="dash-table">
          <thead><tr><th>Categoria</th><th>Respostas</th><th>Acertos</th><th>Melhor sequência</th></tr></thead>
          <tbody>
            {byCat.map((r) => (
              <tr key={r.c.id}><td>{r.c.title}</td><td>{r.total}</td><td>{r.total ? `${Math.round((r.ok / r.total) * 100)}%` : '—'}</td><td>{r.best}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
