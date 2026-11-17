import { useCallback, useEffect, useState } from 'react';
import { levelProgress } from '@domain';
import { call, loadUsers, type DbUser } from '../lib/db.js';

/** Barra de XP no topo: nível, título e progresso do músico ativo (atualiza a cada ganho de XP). */
export function XpBar({ onOpen }: { onOpen(): void }) {
  const [user, setUser] = useState<DbUser | null>(null);
  const refresh = useCallback(() => {
    void loadUsers()
      .then((r) => setUser(r.users.find((u) => u.id === r.active) ?? null))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    refresh();
    window.addEventListener('bf-xp', refresh);
    return () => window.removeEventListener('bf-xp', refresh);
  }, [refresh]);
  useEffect(() => {
    // Confere conquistas ao abrir (por exemplo, nível 10 ou sequência de dias).
    void loadUsers().then((r) => call('achievements.check', { userId: r.active })).catch(() => undefined);
  }, []);
  if (!user) return null;
  const lv = levelProgress(user.total_xp);
  return (
    <button className="xpbar" onClick={onOpen} title="Ver conquistas e missões" aria-label={`Nível ${lv.level}, ${lv.title}, ${user.total_xp} XP`}>
      <span className="xpbar-level">Nível {lv.level}</span>
      <span className="xpbar-title">{lv.title}</span>
      <span className="xpbar-track" role="progressbar" aria-valuenow={Math.round(lv.fraction * 100)} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${Math.round(lv.fraction * 100)}%` }} />
      </span>
      <span className="xpbar-xp">{user.total_xp} XP</span>
    </button>
  );
}
