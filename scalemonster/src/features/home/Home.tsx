import { useEffect, useMemo, useState } from 'react';
import { CURRICULUM, THEORY_TOPICS, curriculumProgress, levelProgress, streakDays, type CurriculumExercise, type PracticeSession } from '@domain';
import { call, loadUsers, type DbSession, type DbUser } from '../../lib/db.js';
import { readStore, writeStore } from '@baixaria/ui-core';
import { practiceInstrumentOf } from '@baixaria/music-theory';
import { MetronomeModal, TunerModal } from '../practice/StudioTools.js';
import stageBg from '../../assets/stage-bg.jpg';

type Inst = 'bass' | 'guitar';
const INSTS: ReadonlyArray<{ id: Inst; label: string }> = [
  { id: 'bass', label: 'Contrabaixo' },
  { id: 'guitar', label: 'Guitarra e violão' },
];
export type HomeTarget = 'exercises' | 'harmony' | 'achievements' | 'trails' | 'theory' | 'ear' | 'profiles';
interface Quest {
  quest_code: string;
  title: string;
  target_value: number;
  current_value: number;
  xp_reward: number;
  completed: number;
}

const SHORTCUTS: ReadonlyArray<{ id: HomeTarget; title: string; text: string; color: string }> = [
  { id: 'trails', title: 'Trilhas', text: '100 exercícios em ordem', color: 'var(--brand-orange)' },
  { id: 'ear', title: 'Ear training', text: '60+ jogos de ouvido', color: 'var(--info-blue)' },
  { id: 'theory', title: 'Teoria', text: '21 tópicos e partitura', color: 'var(--ok-green)' },
  { id: 'harmony', title: 'Harmonia', text: 'Círculo das quintas', color: '#a855f7' },
];

function LevelRing({ fraction, level }: { fraction: number; level: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <svg className="hm-ring" width={132} height={132} viewBox="0 0 132 132" role="img" aria-label={`Nível ${level}, ${Math.round(fraction * 100)}% para o próximo`}>
      <circle cx={66} cy={66} r={r} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={10} />
      <circle cx={66} cy={66} r={r} fill="none" stroke="#ff6b2c" strokeWidth={10} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - fraction)} transform="rotate(-90 66 66)" className="dash-ring-arc" />
      <text x={66} y={62} textAnchor="middle" className="hm-ring-small">NÍVEL</text>
      <text x={66} y={90} textAnchor="middle" className="hm-ring-big">{level}</text>
    </svg>
  );
}

export function Home({ onGo }: { onGo(screen: HomeTarget): void }) {
  const history = useMemo(() => readStore<PracticeSession[]>('bf-history', []), []);
  const [user, setUser] = useState<DbUser | null>(null);
  const [dbSessions, setDbSessions] = useState<DbSession[]>([]);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [theoryDone, setTheoryDone] = useState(0);
  const [inst, setInst] = useState<Inst>(() => (practiceInstrumentOf(String(readStore<{ instrument?: string }>('bf-exercise', {}).instrument ?? 'bass')) ?? 'bass') as Inst);
  const [tool, setTool] = useState<'tuner' | 'metro' | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const r = await loadUsers();
        setUser(r.users.find((u) => u.id === r.active) ?? null);
        setQuests(await call<Quest[]>('quests.today', { userId: r.active }));
        setTheoryDone((await call<unknown[]>('theory.progress', { userId: r.active })).length);
        setDbSessions(await call<DbSession[]>('sessions.list', { userId: r.active }));
      } catch {
        /* sem banco: usa o histórico local */
      }
    })();
  }, []);

  const xp = user?.total_xp ?? 0;
  const lv = levelProgress(xp);
  const today = new Date().toISOString().slice(0, 10);
  const todays = history.filter((s) => s.at.slice(0, 10) === today);
  const todayAcc = todays.length ? Math.round(todays.reduce((t, s) => t + s.accuracy, 0) / todays.length) : 0;
  const streak = Math.max(user?.current_streak ?? 0, streakDays(history));
  const last = history[history.length - 1];
  const hour = new Date().getHours();
  const name = user?.name ?? 'Músico';

  /** Próximo exercício liberado na trilha do instrumento escolhido. */
  const nextEx: CurriculumExercise | null = useMemo(() => {
    const trailInst = inst === 'bass' ? 'bass' : 'guitar';
    const prog = curriculumProgress(dbSessions);
    return CURRICULUM.filter((t) => t.instrument === trailInst).flatMap((t) => t.exercises).find((e) => prog[e.id]?.status === 'unlocked') ?? null;
  }, [dbSessions, inst]);

  /** Sessões por dia nos últimos 7 dias. */
  const week = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(Date.now() - (6 - i) * 86400000);
      return { key: d.toISOString().slice(0, 10), label: d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''), n: 0 };
    });
    for (const s of history) {
      const d = days.find((x) => x.key === s.at.slice(0, 10));
      if (d) d.n++;
    }
    return days;
  }, [history]);
  const weekMax = Math.max(3, ...week.map((d) => d.n));
  const weekTotal = week.reduce((t, d) => t + d.n, 0);

  function setInstrument(i: Inst) {
    setInst(i);
    writeStore('bf-exercise', { ...readStore<Record<string, unknown>>('bf-exercise', {}), instrument: i });
  }
  function goPractice(e?: CurriculumExercise | null) {
    const prev = readStore<Record<string, unknown>>('bf-exercise', {});
    writeStore('bf-exercise', e ? { ...prev, instrument: inst, category: e.config.family, mode: e.config.mode, exercise: e.config.pattern, bpm: Math.max(40, e.targetBpm - 30) } : { ...prev, instrument: inst });
    writeStore('bf-ex-view', { ...readStore<Record<string, unknown>>('bf-ex-view', {}), tab: 'practice', routine: null });
    onGo('exercises');
  }

  return (
    <div className="screen home hm">
      <section className="hm-hero" style={{ backgroundImage: `linear-gradient(100deg, rgba(8,8,14,0.92) 20%, rgba(8,8,14,0.55) 70%, rgba(8,8,14,0.35)), url(${stageBg})` }}>
        <div className="hm-hero-text">
          <span className="hm-eyebrow">{hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'}</span>
          <h1>Olá, {name}!</h1>
          <p>Pronto para o treino de hoje? Escolha o instrumento e continue de onde parou.</p>
          <div className="seg hm-seg" role="group" aria-label="Instrumento">
            {INSTS.map((i) => (
              <button key={i.id} className={inst === i.id ? 'on' : ''} aria-pressed={inst === i.id} onClick={() => setInstrument(i.id)}>
                {i.label}
              </button>
            ))}
          </div>
          <div className="hm-cta">
            <button className="primary hm-big" onClick={() => goPractice(nextEx)}>
              {nextEx ? 'Continuar a trilha' : 'Praticar agora'}
            </button>
            <button className="hm-big hm-white" onClick={() => goPractice(null)}>
              Iniciar desafio 3D
            </button>
          </div>
          {nextEx && (
            <span className="hm-next">
              Próximo: <b>{nextEx.title}</b> · meta {nextEx.targetBpm} BPM
            </span>
          )}
        </div>
        <button className="hm-level" onClick={() => onGo('achievements')} aria-label="Ver conquistas e missões">
          <LevelRing fraction={lv.fraction} level={lv.level} />
          <span className="hm-level-title">{lv.title}</span>
          <span className="hm-level-xp">
            {xp} XP{lv.level < 100 ? ` · faltam ${lv.span - lv.into}` : ''}
          </span>
        </button>
      </section>

      <section className="hm-stats" aria-label="Seus números">
        <div className="card hm-stat">
          <span>Sequência</span>
          <b>{streak}</b>
          <small>{streak === 1 ? 'dia seguido' : 'dias seguidos'}</small>
        </div>
        <div className="card hm-stat">
          <span>Hoje</span>
          <b>{todays.length}<i>/3</i></b>
          <small>sessões na esteira</small>
        </div>
        <div className="card hm-stat">
          <span>Precisão hoje</span>
          <b>{todays.length ? `${todayAcc}%` : '—'}</b>
          <small>média das sessões</small>
        </div>
        <div className="card hm-stat">
          <span>Academia</span>
          <b>{Math.round((theoryDone / THEORY_TOPICS.length) * 100)}%</b>
          <small>{theoryDone} de {THEORY_TOPICS.length} tópicos</small>
        </div>
      </section>

      <div className="hm-cols">
        <section className="card hm-panel">
          <header>
            <h3>Missões do dia</h3>
            <button className="ghost small-btn" onClick={() => onGo('achievements')}>Ver todas</button>
          </header>
          {quests.length === 0 ? (
            <p className="muted small">Carregando as missões…</p>
          ) : (
            <ul className="hm-quests">
              {quests.map((q) => (
                <li key={q.quest_code} className={q.completed ? 'done' : ''}>
                  <span className="hm-check" aria-hidden="true">{q.completed ? '✓' : ''}</span>
                  <span className="hm-quest-text">
                    <b>{q.title}</b>
                    <span className="hm-bar"><span style={{ width: `${Math.round((q.current_value / q.target_value) * 100)}%` }} /></span>
                  </span>
                  <span className="muted small">+{q.xp_reward} XP</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card hm-panel">
          <header>
            <h3>Sua semana</h3>
            <span className="muted small">{weekTotal} {weekTotal === 1 ? 'sessão' : 'sessões'}</span>
          </header>
          <div className="hm-bars" role="img" aria-label={`Sessões por dia: ${week.map((d) => `${d.label} ${d.n}`).join(', ')}`}>
            {week.map((d, i) => (
              <div key={d.key} className={`hm-col ${i === 6 ? 'today' : ''}`}>
                <span className="hm-col-n">{d.n || ''}</span>
                <span className="hm-col-bar"><span style={{ height: `${(d.n / weekMax) * 100}%` }} /></span>
                <span className="hm-col-l">{d.label}</span>
              </div>
            ))}
          </div>
          {last && (
            <p className="hm-last muted small">
              Última sessão: <b>{last.exercise}</b> · {last.accuracy}% · {last.bpm} BPM
            </p>
          )}
        </section>
      </div>

      <section aria-label="Atalhos">
        <h3 className="hm-h">Explorar</h3>
        <div className="hm-tiles">
          {SHORTCUTS.map((s) => (
            <button key={s.id} className="hm-tile" style={{ ['--tile' as string]: s.color }} onClick={() => onGo(s.id)}>
              <b>{s.title}</b>
              <span>{s.text}</span>
            </button>
          ))}
          <button className="hm-tile" style={{ ['--tile' as string]: '#06b6d4' }} onClick={() => setTool('tuner')}>
            <b>Afinador</b>
            <span>Cromático, pelo microfone</span>
          </button>
          <button className="hm-tile" style={{ ['--tile' as string]: '#f43f5e' }} onClick={() => setTool('metro')}>
            <b>Metrônomo</b>
            <span>Com tap tempo</span>
          </button>
        </div>
      </section>

      {tool === 'tuner' && <TunerModal onClose={() => setTool(null)} />}
      {tool === 'metro' && <MetronomeModal onClose={() => setTool(null)} />}
    </div>
  );
}
