import { useState } from 'react';
import { pcName, type BassTuning, type FretPos } from '@baixaria/music-theory';

/**
 * Braço do baixo em SVG, genérico: janela de casas e marcações com estado.
 * Corda mais aguda em cima (como o baixista vê o braço). Usado no painel do player e nos exercícios.
 */
export type MarkState = 'scale' | 'root' | 'later' | 'next' | 'now' | 'done' | 'hit' | 'octave' | 'miss';

export interface NeckMark {
  readonly pos: FretPos;
  readonly label: string;
  readonly state: MarkState;
}

interface Props {
  tuning: BassTuning;
  fromFret: number;
  toFret: number;
  marks: readonly NeckMark[];
  flats: boolean;
  /** Altura de cada corda, em unidades do viewBox. */
  rowH?: number;
  /** Largura real em px: o desenho ocupa exatamente essa largura (1 unidade = 1 px). */
  width?: number;
  /** Zona da mão (casa do indicador): faixa sombreada sobre as 4 casas. */
  zone?: number | null;
  /** Próxima zona: contorno tracejado. */
  nextZone?: number | null;
  className?: string;
  /** Girado 90° (painel lateral): casas descendo, nut em cima, cordas agudas à direita. */
  vertical?: boolean;
  /** Clicar numa casa toca a nota exata daquela corda. */
  onPlay?: ((pos: FretPos, midi: number) => void) | undefined;
  /** Espaçamento real das casas: cada casa é menor que a anterior, em direção à ponte. */
  logSpacing?: boolean;
}

const INLAYS = new Set([3, 5, 7, 9, 15, 17, 19, 21]);
const ORDER: Record<MarkState, number> = { scale: 0, root: 1, done: 2, later: 3, next: 4, miss: 5, octave: 6, hit: 7, now: 8 };

export function Neck({ tuning, fromFret, toFret, marks, flats, rowH = 26, width, zone, nextZone, className, vertical, onPlay, logSpacing }: Props) {
  const [vib, setVib] = useState<{ string: number } | null>(null);
  const n = tuning.strings.length;
  const lo = Math.max(0, fromFret === 0 ? 0 : fromFret - 1);
  const top = Math.min(tuning.frets, Math.max(toFret, lo + 4));
  const cols = top - lo;
  const left = 46;
  const right = 14;
  const W = width && width > 200 ? width : Math.max(520, 70 * cols + left + right);
  const H = 34 + n * rowH;
  const span = W - left - right;
  // Posição da linha da casa f em fração do comprimento total (escala real: 1 − 2^(−f/12)).
  const fp = (f: number) => (logSpacing ? 1 - 2 ** (-f / 12) : f);
  const edge = (i: number) => left + ((fp(lo + i) - fp(lo)) / Math.max(1e-9, fp(top) - fp(lo))) * span;
  const mid = (i: number) => (edge(i) + edge(i + 1)) / 2;
  const yOf = (s: number) => 20 + (n - 1 - s) * rowH;
  const xOf = (f: number) => (f === 0 ? left - 16 : mid(f - lo - 1));
  const midY = (yOf(0) + yOf(n - 1)) / 2;
  const r = Math.min(12, rowH * 0.42);
  // Girado: os textos voltam à horizontal, cada um em torno do próprio ponto.
  const upright = (x: number, y: number) => (vertical ? `rotate(-90 ${x} ${y})` : undefined);

  return (
    <svg
      className={`neck ${className ?? ''}`}
      viewBox={vertical ? `0 0 ${H} ${W}` : `0 0 ${W} ${H}`}
      style={vertical ? { width: H, height: W } : undefined}
      role="img"
      aria-label="Braço do instrumento"
    >
      <g transform={vertical ? `translate(${H} 0) rotate(90)` : undefined}>
      <rect x={left} y={yOf(n - 1) - rowH / 2} width={W - left - right} height={(n - 1) * rowH + rowH} className="neck-wood" rx={6} />
      {zone != null && zone >= lo + 1 && zone <= top && (
        <rect
          x={edge(zone - 1 - lo)}
          y={yOf(n - 1) - rowH / 2}
          width={edge(zone - 1 - lo + Math.min(4, top - zone + 1)) - edge(zone - 1 - lo)}
          height={(n - 1) * rowH + rowH}
          className="neck-zone"
          rx={4}
        />
      )}
      {nextZone != null && nextZone !== zone && nextZone >= lo + 1 && nextZone <= top && (
        <rect
          x={edge(nextZone - 1 - lo) + 1}
          y={yOf(n - 1) - rowH / 2 + 1}
          width={edge(nextZone - 1 - lo + Math.min(4, top - nextZone + 1)) - edge(nextZone - 1 - lo) - 2}
          height={(n - 1) * rowH + rowH - 2}
          className="neck-zone-next"
          rx={4}
        />
      )}
      {Array.from({ length: cols + 1 }, (_, i) => {
        const f = lo + i;
        const x = edge(i);
        const cxm = i < cols ? mid(i) : x;
        return (
          <g key={f}>
            <line x1={x} x2={x} y1={yOf(n - 1) - rowH / 2} y2={yOf(0) + rowH / 2} className={f === 0 ? 'neck-nut' : 'neck-fret'} />
            {i < cols && INLAYS.has(f + 1) && <circle cx={cxm} cy={midY} r={4} className="neck-inlay" />}
            {i < cols && (f + 1 === 12 || f + 1 === 24) && (
              <>
                <circle cx={cxm} cy={midY - rowH / 2} r={4} className="neck-inlay" />
                <circle cx={cxm} cy={midY + rowH / 2} r={4} className="neck-inlay" />
              </>
            )}
            {i < cols && (
              <text x={cxm} y={H - 4} className="neck-num" textAnchor="middle" transform={upright(cxm, H - 8)}>
                {f + 1}
              </text>
            )}
          </g>
        );
      })}
      {tuning.strings.map((open, s) => (
        <g key={s} className={`neck-string-g${vib?.string === s ? ' vib' : ''}`}>
          <line x1={left} x2={W - right} y1={yOf(s)} y2={yOf(s)} className="neck-string" strokeWidth={1 + (n - s) * 0.35} />
          <text x={8} y={yOf(s) + 4} className="neck-open" transform={upright(14, yOf(s))}>
            {pcName(open, flats)}
          </text>
        </g>
      ))}
      {onPlay &&
        tuning.strings.flatMap((open, s) =>
          Array.from({ length: cols + 1 }, (_, i) => {
            const f = lo + i;
            if (f > tuning.frets || (f === lo && lo > 0)) return null;
            const cx = f === 0 ? left - 16 : mid(f - lo - 1);
            const w = f === 0 ? 30 : edge(f - lo) - edge(f - lo - 1);
            return (
              <rect
                key={`hit-${s}-${f}`}
                x={cx - w / 2}
                y={yOf(s) - rowH / 2}
                width={w}
                height={rowH}
                className="neck-hit"
                onClick={() => {
                  setVib({ string: s });
                  window.setTimeout(() => setVib(null), 700);
                  onPlay({ string: s, fret: f }, open + f);
                }}
              />
            );
          }),
        )}
      {[...marks]
        .filter((m) => m.pos.fret >= lo && m.pos.fret <= top)
        .sort((a, b) => ORDER[a.state] - ORDER[b.state])
        .map((m, i) => (
          <g key={`${m.pos.string}-${m.pos.fret}-${i}`} className={`neck-note ${m.state}`} transform={`translate(${xOf(m.pos.fret)} ${yOf(m.pos.string)})`}>
            <circle r={m.state === 'now' ? r + 1.5 : m.state === 'scale' ? r - 2 : r} />
            {m.label && (
              <text y={vertical ? 0 : 4} textAnchor="middle" dominantBaseline={vertical ? 'central' : undefined} transform={upright(0, 0)}>
                {m.label}
              </text>
            )}
          </g>
        ))}
      </g>
    </svg>
  );
}
