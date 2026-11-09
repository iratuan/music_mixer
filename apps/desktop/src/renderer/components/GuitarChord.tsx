import { memo } from 'react';
import type { GuitarVoicing } from '@domain';

interface Props {
  readonly voicing: GuitarVoicing | null;
  /** Nome do acorde mostrado no título (ex.: "G7"). */
  readonly name: string;
  readonly large?: boolean;
}

const ROWS = 5; // casas desenhadas (cobre o intervalo máximo de 4 casas)
const ROW_H = 20;
const TOP = 26;
const X0 = 20;
const X1 = 100;
const GAP = (X1 - X0) / 5;

/**
 * Diagrama de acorde de violão (6 cordas, 6ª à esquerda, como se toca de frente).
 * Pestana, dedos (1 indicador … 4 mínimo), cordas mudas (×) e soltas (○). Sem casa 1 (nut), mostra a casa inicial.
 */
export const GuitarChord = memo(function GuitarChord({ voicing, name, large = true }: Props) {
  if (!voicing) return <p className="muted small">Sem forma tocável para {name} neste modo.</p>;
  const sx = (s: number) => X0 + s * GAP;
  const sy = (fret: number) => TOP + (fret - voicing.baseFret + 0.5) * ROW_H;
  const H = TOP + ROWS * ROW_H + 6;
  const barre = voicing.barre;
  return (
    <svg className={`gchord ${large ? 'lg' : 'sm'}`} viewBox={`0 0 120 ${H}`} role="img" aria-label={`${name}: ${voicing.form}`}>
      <title>{`${name} · ${voicing.form}`}</title>
      {voicing.baseFret === 1 ? (
        <line className="gchord-nut" x1={X0 - 3} x2={X1 + 3} y1={TOP} y2={TOP} />
      ) : (
        <text className="gchord-base" x={2} y={TOP + ROW_H * 0.6}>
          {voicing.baseFret}ª
        </text>
      )}
      {Array.from({ length: ROWS + 1 }, (_, i) => (
        <line key={`f${i}`} className="gchord-fret" x1={X0} x2={X1} y1={TOP + i * ROW_H} y2={TOP + i * ROW_H} />
      ))}
      {Array.from({ length: 6 }, (_, s) => (
        <line key={`s${s}`} className="gchord-string" x1={sx(s)} x2={sx(s)} y1={TOP} y2={TOP + ROWS * ROW_H} />
      ))}
      {voicing.frets.map((f, s) =>
        f == null ? (
          <text key={`x${s}`} className="gchord-mark" x={sx(s)} y={TOP - 7}>
            ×
          </text>
        ) : f === 0 ? (
          <circle key={`o${s}`} className="gchord-open" cx={sx(s)} cy={TOP - 9} r={3.5} />
        ) : null,
      )}
      {barre && (
        <>
          <rect className="gchord-barre" x={sx(barre.from) - 6} y={sy(barre.fret) - 6.5} width={sx(barre.to) - sx(barre.from) + 12} height={13} rx={6.5} />
          <text className="gchord-dot-text" x={(sx(barre.from) + sx(barre.to)) / 2} y={sy(barre.fret)}>
            1
          </text>
        </>
      )}
      {voicing.frets.map((f, s) => {
        if (f == null || f === 0) return null;
        if (barre && s >= barre.from && s <= barre.to && f === barre.fret) return null; // coberta pela pestana
        const finger = voicing.fingers[s] ?? 0;
        return (
          <g key={`d${s}`}>
            <circle className="gchord-dot" cx={sx(s)} cy={sy(f)} r={6.5} />
            {finger > 0 && (
              <text className="gchord-dot-text" x={sx(s)} y={sy(f)}>
                {finger}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
});
