import { memo, useEffect, useRef } from 'react';
import { chordSymbol, type ChordInsight, type HarmonicMapData } from '@domain';

/**
 * Grade do mapa harmônico (estilo Real Book): seções com letra e repetição, 4 compassos por linha,
 * acordes como blocos proporcionais aos tempos. Visão: cifra, grau ou híbrida; densidade: palco
 * (só harmonia) ou estudo (notas-alvo 1-3-7 e nota de condução). Setas marcam resoluções fortes
 * (dominante → tônica). O compasso tocando acende e a grade rola sozinha até ele.
 */
export type MapView = 'chords' | 'degrees' | 'hybrid';
export type MapDensity = 'stage' | 'study';

interface Props {
  map: HarmonicMapData;
  insight: ChordInsight[][];
  view: MapView;
  density: MapDensity;
  flats: boolean;
  /** Compasso e tempo tocando agora (−1 = parado). */
  current: number;
  beat: number;
  selected: number | null;
  onSelect(measure: number): void;
}

const KIND_CLASS: Record<string, string> = { borrowed: 'k-borrowed', secondary: 'k-secondary', chromatic: 'k-chromatic' };
const kindOf = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes('refr')) return 'chorus';
  if (n.includes('intro') || n.includes('outro')) return 'edge';
  if (n.includes('ponte') || n.includes('solo') || n.includes('interl')) return 'bridge';
  if (n.includes('pré')) return 'pre';
  return 'verse';
};

export const HarmonicGrid = memo(function HarmonicGrid({ map, insight, view, density, flats, current, beat, selected, onSelect }: Props) {
  const box = useRef<HTMLDivElement | null>(null);
  // Auto-rolagem suave: o compasso tocando fica no meio da grade.
  useEffect(() => {
    const el = box.current;
    const cur = el?.querySelector<HTMLElement>('.hm-measure.cur');
    if (!el || !cur) return;
    const top = cur.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop;
    const target = top - el.clientHeight / 2 + cur.clientHeight / 2;
    if (Math.abs(el.scrollTop - target) > cur.clientHeight * 0.75) el.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  }, [current]);

  return (
    <div className={`hm-grid density-${density}`} ref={box}>
      {map.sections.map((s) => (
        <section key={s.from} className="hm-section" data-kind={kindOf(s.name)}>
          <header className="hm-sec-head">
            {s.letter && <span className="chart-letter">{s.letter}</span>}
            <b>{s.name}</b>
            <span className="muted small">
              {s.to - s.from + 1} compassos{s.repeatOf ? ` · = ${s.repeatOf}` : ''}
            </span>
          </header>
          <div className="hm-rows">
            {map.measures.slice(s.from, s.to + 1).map((m) => (
              <button key={m.index} className={`hm-measure ${m.index === current ? 'cur' : ''} ${m.index === selected ? 'sel' : ''}`} onClick={() => onSelect(m.index)} title={`Compasso ${m.index + 1}`}>
                <span className="bar-n">{m.index + 1}</span>
                <span className="hm-chords">
                  {m.chords.map((c, k) => {
                    const ins = insight[m.index]?.[k];
                    const name = chordSymbol(c.chord, flats);
                    return (
                      <span key={k} className={`hm-chord ${ins ? (KIND_CLASS[ins.kind] ?? '') : ''}`} style={{ flexGrow: c.beats }}>
                        {view !== 'degrees' && <b className="hm-name">{name}</b>}
                        {view !== 'chords' && ins && <span className={view === 'degrees' ? 'hm-roman big' : 'hm-roman'}>{ins.roman}</span>}
                        {density === 'study' && ins && (
                          <span className="hm-targets" title="Notas-alvo: fundamental, terça e sétima">
                            {[ins.targets.root, ins.targets.third, ins.targets.seventh].filter(Boolean).join('·')}
                            {ins.approach && <i title={ins.approach.text}> → {ins.approach.note}</i>}
                          </span>
                        )}
                        <span className="hm-slashes" aria-hidden="true">
                          {Array.from({ length: Math.max(0, Math.round(c.beats) - 1) }, () => '/').join(' ')}
                        </span>
                        {ins?.resolves && <span className={`hm-arrow ${ins.resolves}`} title={ins.resolves === 'dominante' ? 'Dominante resolvendo na tônica' : 'ii → V'} />}
                      </span>
                    );
                  })}
                </span>
                {m.index === current && beat >= 0 && <span className="bar-beat" style={{ width: `${((beat + 1) / Math.max(1, m.beats)) * 100}%` }} />}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
});
