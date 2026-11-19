import { readStore, writeStore } from '@baixaria/ui-core';
import { academyData } from '../platform/bridge.js';

/** Acesso ao banco SQLite do Academy (via DatabaseAdapter da plataforma) e ao músico ativo. */
export interface DbUser {
  id: string;
  name: string;
  primary_instrument: 'bass' | 'guitar' | 'keyboard';
  total_xp: number;
  current_streak: number;
  created_at: string;
}
export interface DbSession {
  key: string;
  accuracy: number;
  bpm: number;
}

export const call = <T>(op: string, args?: Record<string, unknown>): Promise<T> => academyData().call(op, args) as Promise<T>;

export function activeUserId(): string | null {
  return readStore<string | null>('bf-user', null);
}
export function setActiveUser(id: string): void {
  writeStore('bf-user', id);
}

/** Lista os músicos; se o ativo não existir mais, usa o primeiro. */
export async function loadUsers(): Promise<{ users: DbUser[]; active: string }> {
  const users = await call<DbUser[]>('users.list');
  let active = activeUserId();
  if (!active || !users.some((u) => u.id === active)) {
    active = users[0]?.id ?? '';
    if (active) setActiveUser(active);
  }
  return { users, active };
}

/** Grava a sessão no banco (sem travar a tela se falhar). */
export async function recordSession(s: Record<string, unknown>): Promise<void> {
  try {
    const userId = activeUserId() ?? (await loadUsers()).active;
    if (userId) await call('sessions.record', { ...s, userId });
  } catch {
    /* o histórico local continua valendo */
  }
}
