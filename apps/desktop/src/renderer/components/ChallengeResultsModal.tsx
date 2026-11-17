import { useEffect, useRef } from 'react';
import { Icon } from './Icons.js';

/** Resumo ao fim de um desafio no Palco: precisão, maior sequência, perfeitas, ligados e o botão +5 BPM. */
export interface ChallengeResult {
  score: number;
  accuracy: number;
  maxStreak: number;
  hits: number;
  perfect: number;
  great: number;
  good: number;
  octave: number;
  misses: number;
  hopoHits: number;
  hopoTotal: number;
  bpm: number;
  goal: number;
}

interface Props {
  result: ChallengeResult;
  onClose(): void;
  onRetry(): void;
  onFaster(): void;
  /** XP ganho na sessão (já salva no histórico). */
  xp?: number | undefined;
}

export function ChallengeResultsModal({ result: r, onClose, onRetry, onFaster, xp }: Props) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.querySelector<HTMLButtonElement>('button.primary')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const passed = r.accuracy >= r.goal;
  const stars = r.accuracy >= 98 ? 5 : r.accuracy >= 92 ? 4 : r.accuracy >= r.goal ? 3 : r.accuracy >= 60 ? 2 : 1;
  return (
    <div className="results-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} className="results-card card" role="dialog" aria-modal="true" aria-labelledby="results-title">
        <header className="results-head">
          <span className={`results-badge ${passed ? 'ok' : 'no'}`}>{passed ? 'Meta batida' : 'Abaixo da meta'}</span>
          <h2 id="results-title">Resultado do desafio</h2>
          <span className="results-stars" aria-label={`${stars} de 5 estrelas`}>
            {'★'.repeat(stars)}
            <span className="dim">{'★'.repeat(5 - stars)}</span>
          </span>
        </header>
        <div className="results-big">
          <div>
            <b>{r.accuracy}%</b>
            <span>Precisão (meta {r.goal}%)</span>
          </div>
          <div>
            <b>{r.score.toLocaleString('pt-BR')}</b>
            <span>Pontos a {r.bpm} BPM</span>
          </div>
        </div>
        {xp !== undefined && <p className="results-xp">+{xp} XP · sessão salva em Evolução</p>}
        <dl className="results-grid">
          <div>
            <dt>Maior sequência</dt>
            <dd>{r.maxStreak}</dd>
          </div>
          <div>
            <dt>Perfect / Great / Good</dt>
            <dd>
              {r.perfect} / {r.great} / {r.good}
            </dd>
          </div>
          <div>
            <dt>Ligados acertados</dt>
            <dd>{r.hopoTotal ? `${r.hopoHits} de ${r.hopoTotal}` : '—'}</dd>
          </div>
          <div>
            <dt>Oitava errada / erros</dt>
            <dd>
              {r.octave} / {r.misses}
            </dd>
          </div>
        </dl>
        <footer className="results-foot">
          <button className="ghost small-btn" onClick={onClose}>
            Fechar
          </button>
          <button className="ghost small-btn" onClick={onRetry}>
            <Icon name="play" size={13} /> De novo
          </button>
          <button className="primary small-btn" onClick={onFaster} title="Sobe o andamento em 5 BPM e começa de novo">
            <Icon name="plus" size={13} /> 5 BPM e de novo
          </button>
        </footer>
      </div>
    </div>
  );
}
