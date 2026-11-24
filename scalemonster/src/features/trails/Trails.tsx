import { useEffect, useMemo, useState } from 'react';
import { CURRICULUM, curriculumProgress, type CurriculumExercise, type CurriculumInstrument } from '@domain';
import { call, loadUsers, type DbSession } from '../../lib/db.js';
import { readStore, writeStore } from '@baixaria/ui-core';

const INSTS: ReadonlyArray<{ id: CurriculumInstrument; label: string; icon: string; desc: string }> = [
  { id: 'bass', label: 'Contrabaixo', icon: '🎸', desc: 'Fundação rítmica, condução, walking bass e grooves' },
  { id: 'guitar', label: 'Guitarra & Violão', icon: '🎼', desc: 'CAGED, voicings, palhetada, bends e fraseado' },
  { id: 'keyboard', label: 'Teclado & Piano', icon: '🎹', desc: 'Arquitetura de acordes, independência e comping' },
];

const STATUS_LABEL = {
  locked: 'Bloqueado',
  unlocked: 'Liberado',
  completed: 'Concluído',
  mastered: 'Dominado ★',
} as const;

const CATEGORY_TAGS: Record<string, { label: string; color: string }> = {
  technique: { label: 'Técnica & Mecânica', color: '#6366f1' },
  scales: { label: 'Escalas & Modos', color: '#3b82f6' },
  arpeggios: { label: 'Arpejos & Tétrades', color: '#10b981' },
  grooves: { label: 'Groove & Estilo', color: '#f59e0b' },
  chords: { label: 'Harmonia & Voicings', color: '#ec4899' },
  rhythm: { label: 'Rítmica & Timekeeping', color: '#8b5cf6' },
};

/**
 * Trilhas de Aprendizado: Jornada Pedagógica Completa para o Músico Integral.
 * Árvore de habilidades, metas pedagógicas reais, progresso visual e integração com prática.
 */
export function Trails({ onPractice }: { onPractice(): void }) {
  const [inst, setInst] = useState<CurriculumInstrument>(() => readStore<CurriculumInstrument>('bf-trail-inst', 'bass'));
  const [free, setFree] = useState(() => readStore<boolean>('bf-trail-free', false));
  const [sessions, setSessions] = useState<DbSession[]>([]);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);

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
  const pct = Math.round((done / Math.max(1, all.length)) * 100);

  function start(e: CurriculumExercise) {
    const prev = readStore<Record<string, unknown>>('bf-exercise', {});
    writeStore('bf-exercise', {
      ...prev,
      instrument: inst === 'bass' ? 'bass' : inst === 'keyboard' ? 'keyboard' : 'guitar',
      category: e.config.family,
      mode: e.config.mode,
      exercise: e.config.pattern,
      bpm: Math.max(40, e.targetBpm - 20),
    });
    writeStore('bf-ex-view', {
      ...readStore<Record<string, unknown>>('bf-ex-view', {}),
      tab: 'practice',
      routine: null,
    });
    onPractice();
  }

  const activeInstrumentMeta = INSTS.find((i) => i.id === inst) ?? INSTS[0]!;

  return (
    <div className="screen trails">
      {/* Topo da Jornada Pedagógica */}
      <header className="page-head trails-head-pro">
        <div className="trails-title-group">
          <span className="trails-badge">Formação & Linguagem Musical</span>
          <h1>Trilhas de Aprendizado</h1>
          <p className="trails-subtitle">
            Do fundamento rítmico à improvisação consciente. Cada etapa consolida a teoria aplicada no seu instrumento.
          </p>
        </div>

        {/* Card Resumo de Progresso do Músico */}
        <div className="trails-progress-card">
          <div className="trails-prog-header">
            <span>Progresso da Jornada</span>
            <span className="trails-prog-pct">{pct}%</span>
          </div>
          <div className="trails-bar-track">
            <div className="trails-bar-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="trails-prog-stats">
            <span><b>{done}</b> de {all.length} lições concluídas</span>
            <span>Meta: 80% de precisão</span>
          </div>
        </div>
      </header>

      {/* Barra de Seleção de Instrumento e Modo de Estudo */}
      <div className="trails-bar-pro">
        <div className="trails-inst-selector" role="group" aria-label="Instrumento">
          {INSTS.map((i) => (
            <button
              key={i.id}
              className={`trails-inst-btn ${inst === i.id ? 'active' : ''}`}
              aria-pressed={inst === i.id}
              onClick={() => {
                setInst(i.id);
                writeStore('bf-trail-inst', i.id);
              }}
            >
              <span className="trails-inst-icon">{i.icon}</span>
              <span className="trails-inst-label">{i.label}</span>
            </button>
          ))}
        </div>

        <div className="trails-actions-right">
          <button
            className={`trails-free-mode-btn ${free ? 'active' : ''}`}
            aria-pressed={free}
            onClick={() => {
              setFree(!free);
              writeStore('bf-trail-free', !free);
            }}
            title="Libera acesso a todas as lições sem exigir o destravamento sequencial"
          >
            {free ? '🔓 Modo Livre: Ativo' : '🔒 Progressão Guiada'}
          </button>
        </div>
      </div>

      {/* Descrição Pedagógica do Instrumento Atual */}
      <div className="trails-instrument-banner">
        <span className="trails-banner-icon">{activeInstrumentMeta.icon}</span>
        <div>
          <b>Jornada para {activeInstrumentMeta.label}:</b> {activeInstrumentMeta.desc}.
          {inst === 'keyboard' && (
            <span style={{ color: '#48bb78', marginLeft: '6px' }}>
              ✓ Visualizador interativo de piano e timbres acústico/Rhodes/órgão ativos.
            </span>
          )}
        </div>
      </div>

      {/* Grade de Trilhas e Módulos */}
      <div className="trails-grid-pro">
        {tracks.map((t, idx) => {
          const trackDone = t.exercises.filter(
            (e) => progress[e.id]!.status === 'completed' || progress[e.id]!.status === 'mastered',
          ).length;
          const trackPct = Math.round((trackDone / t.exercises.length) * 100);
          const isCollapsed = activeTrackId !== null && activeTrackId !== t.id;

          return (
            <section key={t.id} className="card trail-card-pro">
              <div className="trail-card-head">
                <div className="trail-badge-num">NÍVEL {idx + 1}</div>
                <div className="trail-head-text">
                  <h3>{t.title}</h3>
                  <p className="trail-desc">{t.description}</p>
                </div>
                <div className="trail-track-meter">
                  <div className="trail-meter-text">{trackDone}/{t.exercises.length}</div>
                  <div className="trail-meter-mini">
                    <div className="trail-meter-mini-fill" style={{ width: `${trackPct}%` }} />
                  </div>
                </div>
              </div>

              <ol className="trail-list-pro">
                {t.exercises.map((e) => {
                  const p = progress[e.id]!;
                  const locked = p.status === 'locked';
                  const cat = CATEGORY_TAGS[e.category] ?? { label: e.category, color: '#6366f1' };

                  return (
                    <li key={e.id} className={`trail-item-pro ${p.status}`}>
                      <div className="trail-status-dot" aria-hidden="true">
                        {locked ? '🔒' : p.status === 'mastered' ? '★' : p.status === 'completed' ? '✓' : e.orderIndex}
                      </div>

                      <div className="trail-item-content">
                        <div className="trail-item-title-row">
                          <b className="trail-item-name">{e.title}</b>
                          <span
                            className="trail-cat-badge"
                            style={{ borderColor: `${cat.color}40`, color: cat.color, background: `${cat.color}15` }}
                          >
                            {cat.label}
                          </span>
                        </div>

                        <div className="trail-item-meta">
                          <span className="trail-diff-badge">{e.difficulty}</span>
                          <span>Meta: <b>{e.targetBpm} BPM</b></span>
                          <span className="trail-status-tag">{STATUS_LABEL[p.status]}</span>
                          {p.attempts ? (
                            <span className="trail-score">
                              Melhor: <b>{p.bestAccuracy}%</b> ({p.attempts}x)
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <button
                        className={`small-btn ${locked ? 'ghost disabled' : 'primary'} trail-action-btn`}
                        disabled={locked}
                        onClick={() => start(e)}
                        title={locked ? 'Complete os exercícios anteriores com 80% para destravar' : 'Iniciar prática com playback e juiz de notas'}
                      >
                        {locked ? 'Travado' : p.status === 'mastered' ? 'Revisar' : 'Praticar'}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
      </div>
    </div>
  );
}

