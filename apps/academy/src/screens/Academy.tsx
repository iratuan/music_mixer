import { useEffect, useMemo, useState } from 'react';
import { THEORY_MODULES, THEORY_SOURCES, THEORY_TOPICS, THEORY_XP_PER_TOPIC, type TheoryTopic } from '@domain';
import { Staff, type StaffNote } from '@baixaria/ui-core';
import { call, loadUsers } from '../lib/db.js';
import { readStore, writeStore } from '@baixaria/ui-core';
import { getAudioContext } from '@baixaria/audio-synth';
import { masterBus, pluckAt, setBassTimbre } from '../lib/practice.js';
import { playMidis } from '@baixaria/audio-synth';

type Inst = 'bass' | 'guitar' | 'keyboard';
const INSTS: ReadonlyArray<{ id: Inst; label: string }> = [
  { id: 'bass', label: 'Contrabaixo' },
  { id: 'guitar', label: 'Guitarra' },
  { id: 'keyboard', label: 'Teclado' },
];
const NAMES = ['Dó', 'Dó#', 'Ré', 'Ré#', 'Mi', 'Fá', 'Fá#', 'Sol', 'Sol#', 'Lá', 'Lá#', 'Si'];
const BLACK = new Set([1, 3, 6, 8, 10]);
const OPEN: Record<'bass' | 'guitar', number[]> = { bass: [43, 38, 33, 28], guitar: [64, 59, 55, 50, 45, 40] };

const ROOT = (inst: Inst) => (inst === 'bass' ? 36 : inst === 'guitar' ? 48 : 60);

/** Toca o exemplo com o timbre do instrumento escolhido (relógio único do contexto de áudio). */
function playExample(t: TheoryTopic, inst: Inst): void {
  const ctx = getAudioContext();
  void ctx.resume();
  const root = ROOT(inst);
  const notes = t.example.semitones.map((s) => root + s);
  const start = ctx.currentTime + 0.05;
  const hit = (at: number, midi: number, dur: number) => {
    if (inst === 'bass') {
      setBassTimbre('jazz');
      pluckAt(at, midi, 0.8, masterBus(), dur);
    } else playMidis([midi], inst === 'keyboard' ? 'piano' : 'strat', at, dur);
  };
  if (t.example.play === 'harmonic') {
    if (inst === 'bass') notes.forEach((m, i) => hit(start + i * 0.03, m + (i ? 12 : 0), 1.6));
    else playMidis(notes, inst === 'keyboard' ? 'piano' : 'strat', start, 1.8);
  } else if (t.example.play === 'rhythm') {
    let at = start;
    for (const beat of t.example.rhythm ?? [1]) {
      hit(at, notes[0]!, Math.max(0.2, beat * 0.4));
      at += beat * (60 / 90);
    }
  } else notes.forEach((m, i) => hit(start + i * 0.42, m, 0.6));
}

/** Trecho escrito: baixo em clave de Fá e guitarra em Sol, ambos uma oitava acima do som (como se escreve); teclado em Sol. */
function staffColumns(t: TheoryTopic, inst: Inst): { clef: 'treble' | 'bass'; columns: StaffNote[][] } {
  const written = ROOT(inst) + (inst === 'keyboard' ? 0 : 12);
  const notes = t.example.semitones.map((s) => written + s);
  const ex = t.example;
  const columns: StaffNote[][] =
    ex.play === 'harmonic'
      ? [notes.map((midi) => ({ midi, beats: 4 }))]
      : ex.play === 'rhythm'
        ? (ex.rhythm ?? [1]).map((beats) => [{ midi: notes[0]!, beats }])
        : notes.map((midi) => [{ midi, beats: 1 }]);
  return { clef: inst === 'bass' ? 'bass' : 'treble', columns };
}

/** Diagrama: teclado (2 oitavas) ou braço (casas 0–12) com as notas do exemplo acesas. */
function Diagram({ topic, inst }: { topic: TheoryTopic; inst: Inst }) {
  const pcs = new Set(topic.example.semitones.map((s) => ((s % 12) + 12) % 12));
  const tonic = 0;
  if (inst === 'keyboard') {
    const W = 22;
    const keys = Array.from({ length: 25 }, (_, i) => i);
    const whites = keys.filter((i) => !BLACK.has(i % 12));
    return (
      <svg className="th-diagram" viewBox={`0 0 ${whites.length * W} 96`} role="img" aria-label="Teclado com as notas do exemplo">
        {whites.map((k, i) => (
          <g key={k}>
            <rect x={i * W} y={0} width={W - 1} height={90} rx={2} fill={pcs.has(k % 12) ? (k % 12 === tonic ? '#ff6b2c' : '#2563eb') : '#f2f2f4'} />
            {pcs.has(k % 12) && <text x={i * W + W / 2} y={82} textAnchor="middle" fontSize={8} fill="#fff">{NAMES[k % 12]}</text>}
          </g>
        ))}
        {keys.filter((i) => BLACK.has(i % 12)).map((k) => {
          const idx = whites.filter((w) => w < k).length;
          return <rect key={k} x={idx * W - W * 0.3} y={0} width={W * 0.6} height={54} rx={2} fill={pcs.has(k % 12) ? '#2563eb' : '#15161b'} />;
        })}
      </svg>
    );
  }
  const strings = OPEN[inst];
  const FW = 44;
  return (
    <svg className="th-diagram" viewBox={`0 0 ${13 * FW + 20} ${strings.length * 22 + 20}`} role="img" aria-label="Braço com as notas do exemplo">
      {strings.map((open, si) => (
        <g key={si}>
          <line x1={20} x2={13 * FW + 20} y1={14 + si * 22} y2={14 + si * 22} stroke="#8b8fa0" strokeWidth={1.2} />
          {Array.from({ length: 13 }, (_, f) => {
            const pc = (open + f) % 12;
            return pcs.has(pc) ? (
              <g key={f}>
                <circle cx={20 + f * FW + FW / 2} cy={14 + si * 22} r={8} fill={pc === tonic ? '#ff6b2c' : '#2563eb'} />
                <text x={20 + f * FW + FW / 2} y={17.5 + si * 22} textAnchor="middle" fontSize={8} fill="#fff">{NAMES[pc]}</text>
              </g>
            ) : null;
          })}
        </g>
      ))}
      {Array.from({ length: 14 }, (_, f) => (
        <line key={f} x1={20 + f * FW} x2={20 + f * FW} y1={6} y2={strings.length * 22 + 6} stroke="#4a4e5e" strokeWidth={f === 0 ? 3 : 1} />
      ))}
    </svg>
  );
}

function Theory({ onPractice }: { onPractice(): void }) {
  const [sel, setSel] = useState<string>(() => readStore<string>('bf-theory-topic', '1.1'));
  const [inst, setInst] = useState<Inst>(() => readStore<Inst>('bf-theory-inst', 'bass'));
  const [done, setDone] = useState<Set<string>>(new Set());
  const [user, setUser] = useState('');
  const topic = useMemo(() => THEORY_TOPICS.find((t) => t.id === sel) ?? THEORY_TOPICS[0]!, [sel]);
  const idx = THEORY_TOPICS.indexOf(topic);
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => setPicked(null), [sel]);
  const sc = useMemo(() => staffColumns(topic, inst), [topic, inst]);

  useEffect(() => {
    void loadUsers()
      .then(async (r) => {
        setUser(r.active);
        const rows = await call<Array<{ topic_id: string }>>('theory.progress', { userId: r.active });
        setDone(new Set(rows.map((x) => x.topic_id)));
      })
      .catch(() => undefined);
  }, []);

  function go(id: string) {
    setSel(id);
    writeStore('bf-theory-topic', id);
  }
  async function conclude() {
    if (!user) return;
    try {
      await call('theory.complete', { userId: user, topicId: topic.id });
      setDone(new Set([...done, topic.id]));
    } catch {
      /* sem banco: nada a salvar */
    }
  }
  function practice() {
    const p = topic.practice;
    if (!p) return;
    writeStore('bf-exercise', { ...readStore<Record<string, unknown>>('bf-exercise', {}), instrument: inst === 'bass' ? 'bass' : 'guitar', category: p.family, mode: p.mode, exercise: p.pattern });
    writeStore('bf-ex-view', { ...readStore<Record<string, unknown>>('bf-ex-view', {}), tab: 'practice', routine: null });
    onPractice();
  }
  const pct = Math.round((done.size / THEORY_TOPICS.length) * 100);
  const isDone = done.has(topic.id);

  return (
    <div className="screen theory">
      <header className="page-head">
        <h1>Teoria musical & leitura</h1>
        <p className="muted">
          {done.size} de {THEORY_TOPICS.length} tópicos concluídos ({pct}%) · {THEORY_XP_PER_TOPIC} XP por tópico
        </p>
      </header>
      <div className="th-layout">
        <nav className="card th-index" aria-label="Módulos">
          {THEORY_MODULES.map((m) => (
            <div key={m.id} className="th-module">
              <div className="th-module-title">
                {m.id}. {m.title}
              </div>
              {m.topics.map((t) => (
                <button key={t.id} className={`th-item ${t.id === topic.id ? 'on' : ''}`} aria-current={t.id === topic.id ? 'true' : undefined} onClick={() => go(t.id)}>
                  <span>{done.has(t.id) ? '✓' : t.id}</span> {t.title}
                </button>
              ))}
            </div>
          ))}
          <details className="th-biblio">
            <summary>Bibliografia</summary>
            <ul>
              {Object.values(THEORY_SOURCES).map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </details>
        </nav>
        <article key={topic.id} className="card th-study">
          <span className="muted small">Módulo {topic.module}</span>
          <h2>
            {topic.id} · {topic.title}
          </h2>
          <p className="th-lead">{topic.keyIdea}</p>
          <ul className="th-points">
            {topic.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <div className="seg" role="group" aria-label="Instrumento do exemplo">
            {INSTS.map((i) => (
              <button
                key={i.id}
                className={inst === i.id ? 'on' : ''}
                aria-pressed={inst === i.id}
                onClick={() => {
                  setInst(i.id);
                  writeStore('bf-theory-inst', i.id);
                  setPicked(null);
                }}
              >
                {i.label}
              </button>
            ))}
          </div>
          <div className="th-figure">
            <span className="th-figure-label">Na pauta</span>
            <Staff clef={sc.clef} columns={sc.columns} flats={topic.example.flats ?? false} keySharps={topic.example.keySharps ?? 0} />
          </div>
          <div className="th-figure">
            <span className="th-figure-label">{inst === 'keyboard' ? 'No teclado' : 'No braço'}</span>
            <Diagram topic={topic} inst={inst} />
          </div>
          <p className="muted small">{topic.example.caption}</p>
          <div className="th-actions">
            <button className="primary" onClick={() => playExample(topic, inst)}>
              Ouvir exemplo
            </button>
            {topic.practice && (
              <button className="primary" onClick={practice}>
                Praticar este conceito na esteira 3D
              </button>
            )}
            <button className={isDone ? 'done' : ''} disabled={isDone} onClick={() => void conclude()}>
              {isDone ? 'Concluído ✓' : 'Concluir tópico'}
            </button>
          </div>
          <div className="th-cols">
            <section className="th-box">
              <h4>No {INSTS.find((i) => i.id === inst)!.label.toLowerCase()}</h4>
              <p>{topic.inPractice[inst]}</p>
            </section>
            <section className="th-box">
              <h4>Erros comuns</h4>
              <ul>
                {topic.mistakes.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </section>
          </div>
          <section className="th-quiz" aria-label="Pergunta de fixação">
            <h4>Fixação</h4>
            <p>{topic.quiz.question}</p>
            <div className="th-options">
              {topic.quiz.options.map((o, i) => (
                <button key={o} className={picked === null ? '' : i === topic.quiz.answer ? 'ok' : i === picked ? 'bad' : ''} disabled={picked !== null} onClick={() => setPicked(i)}>
                  {o}
                </button>
              ))}
            </div>
            {picked !== null && (
              <p className={picked === topic.quiz.answer ? 'th-right' : 'th-wrong'} role="status">
                {picked === topic.quiz.answer ? 'Correto. ' : 'Não foi dessa vez. '}
                {topic.quiz.why}
              </p>
            )}
          </section>
          <div className="th-nav">
            <button disabled={idx === 0} onClick={() => go(THEORY_TOPICS[idx - 1]!.id)}>
              ← Anterior
            </button>
            <button disabled={idx === THEORY_TOPICS.length - 1} onClick={() => go(THEORY_TOPICS[idx + 1]!.id)}>
              Próximo →
            </button>
          </div>
          <footer className="th-source">Fonte: {THEORY_SOURCES[topic.source]}</footer>
        </article>
      </div>
    </div>
  );
}

const EAR = ['Percepção de intervalos', 'Reconhecimento de acordes', 'Ditado melódico', 'Ditado rítmico'];

/** Módulos da Academia: teoria completa; ear training ainda em preparação. */
export function Academy({ module, onPractice }: { module: 'theory' | 'ear'; onPractice(): void }) {
  if (module === 'theory') return <Theory onPractice={onPractice} />;
  return (
    <div className="screen">
      <header className="page-head">
        <h1>Laboratório prático & ear training</h1>
        <p className="muted">Módulo em breve</p>
      </header>
      <div className="trails-grid">
        {EAR.map((i) => (
          <section key={i} className="card trail">
            <h3>{i}</h3>
            <p className="muted small">Em breve</p>
          </section>
        ))}
      </div>
    </div>
  );
}
