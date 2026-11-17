import { useEffect, useMemo, useState } from 'react';
import { CURRICULUM, curriculumProgress, type CurriculumExercise, type CurriculumInstrument } from '@domain';
import { call, loadUsers, type DbSession } from '../lib/db.js';
import { readStore, writeStore } from '../lib/store.js';

const INSTS: ReadonlyArray<{ id: CurriculumInstrument; label: string }> = [
  { id: 'bass', label: 'Contrabaixo' },
  { id: 'guitar', label: 'Guitarra' },
  { id: 'keyboard', label: 'Teclado' },
];
const STATUS_LABEL = { locked: 'Bloqueado', unlocked: 'Liberado', completed: 'Concluído', mastered: 'Dominado' } as const;

/** Mapa de trilhas: ordem pedagógica com desbloqueio por precisão e Modo Livre. */
export function Trails({ onPractice }: { onPractice(): void }) {
  const [inst, setInst] = useState<CurriculumInstrument>(() => readStore<CurriculumInstrument>('bf-trail-inst', 'bass'));
  const [free, setFree] = useState(() => readStore<boolean>('bf-trail-free', false));
  const [sessions, setSessions] = useState<DbSession[]>([]);
  useEffect(() => {
    void loadUsers()
      .then((r) => call<DbSession[]>('sessions.list', { userId: r.active }))
      .then(setSessions)
      .catch(() => setSessions([]));
  }, []);
  const progress = useMemo(() => curriculumProgress(sessions, free), [sessions, free]);
  const tracks = CURRICULUM.filter((t) => t.instrument === inst);
  const all = tracks.flatMap((t) => t.exercises);
  const done = all.filter((e) => progress[e.id]!.status === 'completed' || progress[e.id]!.status === 'mastered').length;

  function start(e: CurriculumExercise) {
    const prev = readStore<Record<string, unknown>>('bf-exercise', {});
    writeStore('bf-exercise', { ...prev, instrument: inst === 'bass' ? 'bass' : 'guitar', category: e.config.family, mode: e.config.mode, exercise: e.config.pattern, bpm: Math.max(40, e.targetBpm - 30) });
    writeStore('bf-ex-view', { ...readStore<Record<string, unknown>>('bf-ex-view', {}), tab: 'practice', routine: null });
    onPractice();
  }

  return (
    <div className="screen trails">
      <header className="page-head">
        <h1>Trilhas de aprendizado</h1>
        <p className="muted">
          {done} de {all.length} exercícios concluídos. Alcance {80}% de precisão para liberar o próximo.
        </p>
      </header>
      <div className="trails-bar">
        <div className="seg" role="group" aria-label="Instrumento">
          {INSTS.map((i) => (
            <button
              key={i.id}
              className={inst === i.id ? 'on' : ''}
              aria-pressed={inst === i.id}
              onClick={() => {
                setInst(i.id);
                writeStore('bf-trail-inst', i.id);
              }}
            >
              {i.label}
            </button>
          ))}
        </div>
        <button
          className={`primary ${free ? 'on' : ''}`}
          aria-pressed={free}
          onClick={() => {
            setFree(!free);
            writeStore('bf-trail-free', !free);
          }}
        >
          {free ? 'Modo Livre: Acesso Total (ligado)' : 'Modo Livre: Acesso Total'}
        </button>
      </div>
      {inst === 'keyboard' && <p className="card trails-note">O treino com teclado ainda não está disponível: estes exercícios aparecem como roteiro e abrem o treino no braço da guitarra.</p>}
      <div className="trails-grid">
        {tracks.map((t) => (
          <section key={t.id} className="card trail">
            <h3>{t.title}</h3>
            <p className="muted small">{t.description}</p>
            <ol className="trail-list">
              {t.exercises.map((e) => {
                const p = progress[e.id]!;
                const locked = p.status === 'locked';
                return (
                  <li key={e.id} className={`trail-ex ${p.status}`}>
                    <span className="trail-dot" aria-hidden="true">
                      {locked ? '🔒' : p.status === 'mastered' ? '★' : p.status === 'completed' ? '✓' : e.orderIndex}
                    </span>
                    <span className="trail-info">
                      <b>{e.title}</b>
                      <span className="muted small">
                        {e.difficulty} · meta {e.targetBpm} BPM · {STATUS_LABEL[p.status]}
                        {p.attempts ? ` · melhor ${p.bestAccuracy}%` : ''}
                      </span>
                    </span>
                    <button className="primary small-btn" disabled={locked} onClick={() => start(e)}>
                      Praticar
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
