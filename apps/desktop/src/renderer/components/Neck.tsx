import { pcName, type BassTuning, type FretPos } from '@domain';

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
}

const INLAYS = new Set([3, 5, 7, 9, 15, 17, 19, 21]);
const ORDER: Record<MarkState, number> = { scale: 0, root: 1, done: 2, later: 3, next: 4, miss: 5, octave: 6, hit: 7, now: 8 };

export function Neck({ tuning, fromFret, toFret, marks, flats, rowH = 26, width, zone, nextZone, className, vertical }: Props) {
  const n = tuning.strings.length;
  const lo = Math.max(0, fromFret === 0 ? 0 : fromFret - 1);
  const top = Math.min(tuning.frets, Math.max(toFret, lo + 4));
  const cols = top - lo;
  const left = 46;
  const right = 14;
  const W = width && width > 200 ? width : Math.max(520, 70 * cols + left + right);
  const H = 34 + n * rowH;
  const colW = (W - left - right) / Math.max(1, cols);
  const yOf = (s: number) => 20 + (n - 1 - s) * rowH;
  const xOf = (f: number) => (f === 0 ? left - 16 : left + (f - lo - 0.5) * colW);
  const midY = (yOf(0) + yOf(n - 1)) / 2;
  const r = Math.min(12, rowH * 0.42);

  return (
    <svg
      className={`neck ${className ?? ''}`}
      viewBox={vertical ? `0 0 ${H} ${W}` : `0 0 ${W} ${H}`}
      style={vertical ? { width: H, height: W } : undefined}
      role="img"
      aria-label="Braço do baixo"
    >
      <g transform={vertical ? `translate(${H} 0) rotate(90)` : undefined}>
      <rect x={left} y={yOf(n - 1) - rowH / 2} width={W - left - right} height={(n - 1) * rowH + rowH} className="neck-wood" rx={6} />
      {zone != null && zone >= lo + 1 && zone <= top && (
        <rect
          x={left + (zone - 1 - lo) * colW}
          y={yOf(n - 1) - rowH / 2}
          width={Math.min(4, top - zone + 1) * colW}
          height={(n - 1) * rowH + rowH}
          className="neck-zone"
          rx={4}
        />
      )}
      {nextZone != null && nextZone !== zone && nextZone >= lo + 1 && nextZone <= top && (
        <rect
          x={left + (nextZone - 1 - lo) * colW + 1}
          y={yOf(n - 1) - rowH / 2 + 1}
          width={Math.min(4, top - nextZone + 1) * colW - 2}
          height={(n - 1) * rowH + rowH - 2}
          className="neck-zone-next"
          rx={4}
        />
      )}
      {Array.from({ length: cols + 1 }, (_, i) => {
        const f = lo + i;
        const x = left + i * colW;
        return (
          <g key={f}>
            <line x1={x} x2={x} y1={yOf(n - 1) - rowH / 2} y2={yOf(0) + rowH / 2} className={f === 0 ? 'neck-nut' : 'neck-fret'} />
            {i < cols && INLAYS.has(f + 1) && <circle cx={x + colW / 2} cy={midY} r={4} className="neck-inlay" />}
            {i < cols && f + 1 === 12 && (
              <>
                <circle cx={x + colW / 2} cy={midY - rowH / 2} r={4} className="neck-inlay" />
                <circle cx={x + colW / 2} cy={midY + rowH / 2} r={4} className="neck-inlay" />
              </>
            )}
            {i < cols && (
              <text x={x + colW / 2} y={H - 4} className="neck-num" textAnchor="middle">
                {f + 1}
              </text>
            )}
          </g>
        );
      })}
      {tuning.strings.map((open, s) => (
        <g key={s}>
          <line x1={left} x2={W - right} y1={yOf(s)} y2={yOf(s)} className="neck-string" strokeWidth={1 + (n - s) * 0.35} />
          <text x={8} y={yOf(s) + 4} className="neck-open">
            {pcName(open, flats)}
          </text>
        </g>
      ))}
      {[...marks]
        .filter((m) => m.pos.fret >= lo && m.pos.fret <= top)
        .sort((a, b) => ORDER[a.state] - ORDER[b.state])
        .map((m, i) => (
          <g key={`${m.pos.string}-${m.pos.fret}-${i}`} className={`neck-note ${m.state}`} transform={`translate(${xOf(m.pos.fret)} ${yOf(m.pos.string)})`}>
            <circle r={m.state === 'now' ? r + 1.5 : m.state === 'scale' ? r - 2 : r} />
            {m.label && (
              <text y={4} textAnchor="middle">
                {m.label}
              </text>
            )}
          </g>
        ))}
      </g>
    </svg>
  );
}
