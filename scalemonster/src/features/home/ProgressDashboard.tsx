import { useRef, useState } from 'react';
import { HISTORY_FORMAT, dailySeries, levelFor, medals, mergeSessions, personalBests, sessionXp, streakDays, type PracticeSession } from '@domain';
import { writeStore } from '@baixaria/ui-core';
import { Icon } from '@baixaria/ui-core';
import { platform } from '../../platform/bridge.js';

/**
 * Evolução (estilo painel de saúde): nível e XP, medalhas, gráficos de precisão e BPM por dia,
 * recordes por exercício e as últimas sessões. Exporta e importa o histórico em JSON.
 */
interface Props {
  sessions: readonly PracticeSession[];
  onChange(next: PracticeSession[]): void;
}

function Chart({ values, labels, unit, max, color }: { values: readonly number[]; labels: readonly string[]; unit: string; max: number; color: string }) {
  const W = 320;
  const H = 110;
  const pad = 8;
  if (!values.length) return <p className="muted small">Sem dados ainda.</p>;
  const x = (i: number) => (values.length === 1 ? W / 2 : pad + (i * (W - pad * 2)) / (values.length - 1));
  const y = (v: number) => H - pad - (Math.max(0, Math.min(max, v)) / max) * (H - pad * 2);
  // Curva suave (Catmull-Rom → Bézier) e área preenchida embaixo dela.
  const P = values.map((v, i) => [x(i), y(v)] as const);
  let d = `M ${P[0]![0]} ${P[0]![1]}`;
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)]!;
    const p1 = P[i]!;
    const p2 = P[i + 1]!;
    const p3 = P[Math.min(P.length - 1, i + 2)]!;
    d += ` C ${p1[0] + (p2[0] - p0[0]) / 6} ${p1[1] + (p2[1] - p0[1]) / 6}, ${p2[0] - (p3[0] - p1[0]) / 6} ${p2[1] - (p3[1] - p1[1]) / 6}, ${p2[0]} ${p2[1]}`;
  }
  const area = `${d} L ${P[P.length - 1]![0]} ${H - pad} L ${P[0]![0]} ${H - pad} Z`;
  const gid = `g${color.replace(/[^a-z0-9]/gi, '')}`;
  return (
    <svg className="dash-chart" viewBox={`0 0 ${W} ${H + 14}`} role="img" aria-label={`Gráfico: ${values.map((v, i) => `${labels[i]} ${v}${unit}`).join(', ')}`}>
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1={pad} x2={W - pad} y1={H - pad - g * (H - pad * 2)} y2={H - pad - g * (H - pad * 2)} className="dash-grid" />
      ))}
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity={0.35} />
          <stop offset="1" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {P.length > 1 && <path d={area} fill={`url(#${gid})`} />}
      {P.length > 1 && <path d={d} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
      {values.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={3.5} fill={color}>
          <title>{`${labels[i]}: ${v}${unit}`}</title>
        </circle>
      ))}
      <text x={pad} y={H + 11} className="dash-axis">
        {labels[0]}
      </text>
      <text x={W - pad} y={H + 11} className="dash-axis" textAnchor="end">
        {labels[labels.length - 1]}
      </text>
    </svg>
  );
}

const fmtDay = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Anéis de atividade do dia: sessões (meta 3), precisão média (meta 80%) e dias seguidos (meta 7). */
function Rings({ rings }: { rings: ReadonlyArray<{ label: string; value: number; goal: number; color: string; text: string }> }) {
  const size = 132;
  return (
    <div className="dash-rings">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={rings.map((r) => `${r.label}: ${r.text}`).join(', ')}>
        {rings.map((r, i) => {
          const rad = size / 2 - 10 - i * 17;
          const c = 2 * Math.PI * rad;
          const frac = Math.max(0, Math.min(1, r.value / r.goal));
          return (
            <g key={r.label} transform={`rotate(-90 ${size / 2} ${size / 2})`}>
              <circle cx={size / 2} cy={size / 2} r={rad} fill="none" stroke={r.color} strokeOpacity={0.18} strokeWidth={13} />
              <circle className="dash-ring-arc" cx={size / 2} cy={size / 2} r={rad} fill="none" stroke={r.color} strokeWidth={13} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} />
            </g>
          );
        })}
      </svg>
      <div className="dash-ring-legend">
        {rings.map((r) => (
          <span key={r.label}>
            <i style={{ background: r.color }} />
            {r.label} <b>{r.text}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

export function ProgressDashboard({ sessions, onChange }: Props) {
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const xp = sessions.reduce((t, s) => t + sessionXp(s), 0);
  const lvl = levelFor(xp);
  const series = dailySeries(sessions).slice(-14);
  const bests = personalBests(sessions).slice(0, 8);
  const recent = [...sessions].reverse().slice(0, 10);
  const got = medals(sessions);
  const today = new Date().toISOString().slice(0, 10);
  const todays = sessions.filter((x) => x.at.slice(0, 10) === today);
  const todayAcc = todays.length ? Math.round(todays.reduce((t, x) => t + x.accuracy, 0) / todays.length) : 0;
  const days = streakDays(sessions);

  async function exportJson() {
    try {
      const bytes = new TextEncoder().encode(JSON.stringify({ format: HISTORY_FORMAT, version: 1, exportedAt: new Date().toISOString(), sessions }, null, 2));
      if ((await platform().saveFile('historico de pratica', bytes, 'json')) === 'canceled') return;
      setMsg(`Histórico exportado (${sessions.length} sessões).`);
    } catch {
      setMsg('Não foi possível exportar o histórico.');
    }
  }
  async function importJson(f: File | undefined) {
    if (!f) return;
    try {
      if (f.size > 5_000_000) throw new Error('grande demais');
      const data = JSON.parse(await f.text()) as { format?: string; sessions?: unknown };
      if (data.format !== HISTORY_FORMAT || !Array.isArray(data.sessions)) throw new Error('formato');
      const r = mergeSessions(sessions, data.sessions);
      writeStore('bf-history', r.sessions);
      onChange(r.sessions);
      setMsg(r.added ? `${r.added} sessões importadas.` : 'Nada novo neste arquivo.');
    } catch {
      setMsg('Este arquivo não é um histórico de prática do ScaleMonster (nem do mixerCraft antigo).');
    } finally {
      if (file.current) file.current.value = '';
    }
  }

  return (
    <div className="dash">
      <section className="card dash-level">
        <div>
          <span className="muted small">Seu nível</span>
          <h2>{lvl.name}</h2>
          <div className="dash-bar" role="progressbar" aria-valuenow={Math.round(lvl.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${Math.round(lvl.progress * 100)}%` }} />
          </div>
          <span className="muted small">{lvl.toNext ? `${xp} XP · faltam ${lvl.toNext} para o próximo nível` : `${xp} XP · nível máximo`}</span>
        </div>
        <Rings
          rings={[
            { label: 'Sessões hoje', value: todays.length, goal: 3, color: '#ff5a3c', text: `${todays.length}/3` },
            { label: 'Precisão hoje', value: todayAcc, goal: 80, color: '#3ddc97', text: todays.length ? `${todayAcc}%` : '—' },
            { label: 'Dias seguidos', value: days, goal: 7, color: '#4fd1c5', text: `${days}/7` },
          ]}
        />
        <dl className="dash-stats">
          <div>
            <dt>Sessões</dt>
            <dd>{sessions.length}</dd>
          </div>
          <div>
            <dt>Dias seguidos</dt>
            <dd>{streakDays(sessions)}</dd>
          </div>
          <div>
            <dt>Melhor precisão</dt>
            <dd>{sessions.length ? `${Math.max(...sessions.map((s) => s.accuracy))}%` : '—'}</dd>
          </div>
        </dl>
        <div className="dash-actions">
          <button className="ghost small-btn" onClick={() => void exportJson()} disabled={!sessions.length}>
            Exportar JSON
          </button>
          <button className="ghost small-btn" onClick={() => file.current?.click()}>
            Importar
          </button>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => void importJson(e.target.files?.[0])} />
        </div>
      </section>
      {msg && (
        <p className="ok-line" role="status">
          {msg}
        </p>
      )}

      <div className="dash-grid2">
        <section className="card">
          <h3>Precisão por dia</h3>
          <Chart values={series.map((d) => d.accuracy)} labels={series.map((d) => fmtDay(d.day))} unit="%" max={100} color="var(--good)" />
        </section>
        <section className="card">
          <h3>BPM mais alto por dia</h3>
          <Chart values={series.map((d) => d.bpm)} labels={series.map((d) => fmtDay(d.day))} unit=" BPM" max={Math.max(120, ...series.map((d) => d.bpm))} color="var(--accent)" />
        </section>
      </div>

      <section className="card">
        <h3>Medalhas</h3>
        <div className="dash-medals">
          {got.map((m) => (
            <span key={m.id} className={`dash-medal ${m.earned ? 'on' : ''}`} title={m.hint}>
              <b>{m.earned ? '★' : '☆'}</b> {m.label}
              <span className="muted small">{m.hint}</span>
            </span>
          ))}
        </div>
      </section>

      <div className="dash-grid2">
        <section className="card">
          <h3>Recordes por exercício</h3>
          {bests.length === 0 ? (
            <p className="muted small">Conclua um desafio na aba Treino para ver seus recordes.</p>
          ) : (
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Exercício</th>
                  <th>Precisão</th>
                  <th>BPM (80%+)</th>
                  <th>Pontos</th>
                </tr>
              </thead>
              <tbody>
                {bests.map((b) => (
                  <tr key={b.key}>
                    <td>{b.exercise}</td>
                    <td>{b.bestAccuracy}%</td>
                    <td>{b.bestBpm || '—'}</td>
                    <td>{b.bestScore.toLocaleString('pt-BR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="card">
          <h3>Últimas sessões</h3>
          {recent.length === 0 ? (
            <p className="muted small">Nenhuma sessão ainda.</p>
          ) : (
            <ul className="dash-recent">
              {recent.map((s) => (
                <li key={`${s.at}|${s.key}`}>
                  <span>
                    <b>{s.exercise}</b>
                    <span className="muted small">
                      {new Date(s.at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · {s.bpm} BPM · combo {s.maxStreak}
                    </span>
                  </span>
                  <b className={s.accuracy >= 80 ? 'good' : 'warn'}>{s.accuracy}%</b>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
