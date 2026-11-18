import { memo, type ReactNode } from 'react';
import { CIRCLE, signatureShort, type Ring } from '@baixaria/music-theory';

/**
 * Ciclo das quintas em SVG puro e responsivo: anel externo (tons maiores e armadura), anel do meio
 * (relativas menores), anel interno (diminutos da sensível) e o centro (conteúdo livre: tom escolhido,
 * armadura e botões). Estados: normal, hover (CSS), selecionado (o tom), campo harmônico (grau em
 * selo) e ativo (o acorde soando agora).
 */
export interface WheelMark {
  readonly ring: Ring;
  readonly index: number;
}

interface Props {
  /** Fatia do tom escolhido (anel e posição). */
  selected: WheelMark | null;
  /** Fatias do campo harmônico do tom, com o grau ("I", "ii", "V"…). */
  field: ReadonlyArray<WheelMark & { readonly degree: string }>;
  /** Acorde soando agora. */
  active: WheelMark | null;
  onPick(ring: Ring, index: number): void;
  children?: ReactNode;
}

const R = { majorOut: 196, majorIn: 140, minorIn: 98, dimIn: 66 } as const;
const STEP = (Math.PI * 2) / 12;

function arc(r0: number, r1: number, i: number): string {
  const a0 = i * STEP - Math.PI / 2 - STEP / 2 + 0.006;
  const a1 = i * STEP - Math.PI / 2 + STEP / 2 - 0.006;
  const p = (r: number, a: number) => `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
  return `M ${p(r1, a0)} A ${r1} ${r1} 0 0 1 ${p(r1, a1)} L ${p(r0, a1)} A ${r0} ${r0} 0 0 0 ${p(r0, a0)} Z`;
}
function at(r: number, i: number): [number, number] {
  const a = i * STEP - Math.PI / 2;
  return [r * Math.cos(a), r * Math.sin(a)];
}

export const CircleOfFifthsWheel = memo(function CircleOfFifthsWheel({ selected, field, active, onPick, children }: Props) {
  const fieldOf = (ring: Ring, i: number) => field.find((f) => f.ring === ring && f.index === i);
  const rings: ReadonlyArray<{ ring: Ring; r0: number; r1: number; name: (i: number) => string; size: number }> = [
    { ring: 'major', r0: R.majorIn, r1: R.majorOut, name: (i) => CIRCLE[i]!.major.name, size: 17 },
    { ring: 'minor', r0: R.minorIn, r1: R.majorIn, name: (i) => CIRCLE[i]!.minor.name, size: 12.5 },
    { ring: 'dim', r0: R.dimIn, r1: R.minorIn, name: (i) => CIRCLE[i]!.dim.name, size: 10 },
  ];
  return (
    <div className="cof-wrap">
      <svg className="cof" viewBox="-205 -205 410 410" role="group" aria-label="Ciclo das quintas">
        {rings.map(({ ring, r0, r1, name, size }) =>
          CIRCLE.map((slot, i) => {
            const f = fieldOf(ring, i);
            const isSel = selected?.ring === ring && selected.index === i;
            const isAct = active?.ring === ring && active.index === i;
            const label = name(i).split('/');
            const [tx, ty] = at((r0 + r1) / 2 + (ring === 'major' ? 6 : 0), i);
            return (
              <g
                key={`${ring}-${i}`}
                className={`cof-slice ring-${ring} ${f ? 'related' : ''} ${isSel ? 'selected' : ''} ${isAct ? 'active' : ''}`}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onPick(ring, i))}
                aria-label={`${name(i)}${f ? `, grau ${f.degree}` : ''}`}
                onClick={() => onPick(ring, i)}
              >
                <path d={arc(r0, r1, i)} />
                <text x={tx} y={ty + (label.length > 1 ? -size * 0.25 : size * 0.35)} fontSize={label.length > 1 ? size * 0.72 : size}>
                  {label[0]}
                </text>
                {label.length > 1 && (
                  <text x={tx} y={ty + size * 0.65} fontSize={size * 0.62} className="enh">
                    {label[1]}
                  </text>
                )}
                {ring === 'major' && (
                  <text x={at(R.majorOut - 13, i)[0]} y={at(R.majorOut - 13, i)[1] + 3} className="sig">
                    {signatureShort(slot.signature)}
                  </text>
                )}
                {f && (
                  <g className="cof-badge" transform={`translate(${at(r0 + 9, i)[0]} ${at(r0 + 9, i)[1]})`}>
                    <rect x={-11} y={-6.5} width={22} height={13} rx={6.5} />
                    <text y={3.6}>{f.degree}</text>
                  </g>
                )}
              </g>
            );
          }),
        )}
        <circle className="cof-hub" r={R.dimIn - 3} />
      </svg>
      <div className="cof-center">{children}</div>
    </div>
  );
});
