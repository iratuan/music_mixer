import { useEffect, useState } from 'react';
import { readStore, writeStore } from '@baixaria/ui-core';
import { call, loadUsers, setActiveUser, type DbUser } from '../../lib/db.js';

/** Cada músico tem o próprio histórico: ao trocar, o histórico atual é guardado e o do outro é carregado. */
function switchHistory(from: string, to: string) {
  if (from === to) return;
  writeStore(`bf-history:${from}`, readStore<unknown[]>('bf-history', []));
  writeStore('bf-history', readStore<unknown[]>(`bf-history:${to}`, []));
}

const LABEL = { bass: 'Contrabaixo', guitar: 'Guitarra', keyboard: 'Teclado' } as const;

export function Profiles({ onChanged }: { onChanged(): void }) {
  const [list, setList] = useState<DbUser[]>([]);
  const [active, setActive] = useState('');
  const [name, setName] = useState('');
  const [instrument, setInstrument] = useState<DbUser['primary_instrument']>('bass');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    loadUsers()
      .then((r) => {
        setList(r.users);
        setActive(r.active);
      })
      .catch(() => setErr('Não consegui abrir o banco de dados.'));
  }, []);

  function pick(id: string) {
    switchHistory(active, id);
    setActiveUser(id);
    setActive(id);
    onChanged();
  }
  async function add() {
    const n = name.trim();
    if (!n) return;
    try {
      const id = await call<string>('users.create', { name: n, instrument });
      setName('');
      const r = await loadUsers();
      setList(r.users);
      switchHistory(active, id);
      setActiveUser(id);
      setActive(id);
    } catch {
      setErr('Não consegui cadastrar o músico.');
    }
  }
  return (
    <div className="screen">
      <header className="page-head">
        <h1>Músicos</h1>
        <p className="muted">Cada músico tem o próprio histórico, XP e progresso nas trilhas (guardados no banco SQLite do app).</p>
      </header>
      {err && <p className="warn-line" role="alert">{err}</p>}
      <div className="profile-grid">
        {list.map((p) => (
          <section key={p.id} className={`card profile ${p.id === active ? 'on' : ''}`}>
            <span className="home-avatar" aria-hidden="true">
              {p.name.slice(0, 1).toUpperCase()}
            </span>
            <b>{p.name}</b>
            <span className="muted small">
              {LABEL[p.primary_instrument]} · {p.total_xp} XP · {p.current_streak} {p.current_streak === 1 ? 'dia' : 'dias'}
            </span>
            <button className={p.id === active ? 'ghost' : 'primary'} disabled={p.id === active} onClick={() => pick(p.id)}>
              {p.id === active ? 'Ativo' : 'Usar este músico'}
            </button>
          </section>
        ))}
      </div>
      <section className="card profile-new">
        <h3>Cadastrar músico</h3>
        <div className="profile-form">
          <input type="text" value={name} placeholder="Nome" maxLength={40} onChange={(e) => setName(e.target.value)} aria-label="Nome" />
          <select value={instrument} onChange={(e) => setInstrument(e.target.value as DbUser['primary_instrument'])} aria-label="Instrumento principal">
            <option value="bass">Contrabaixo</option>
            <option value="guitar">Guitarra</option>
            <option value="keyboard">Teclado</option>
          </select>
          <button className="primary" onClick={() => void add()} disabled={!name.trim()}>
            Cadastrar
          </button>
        </div>
      </section>
    </div>
  );
}
