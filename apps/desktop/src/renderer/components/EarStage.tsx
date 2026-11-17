import { NOTE_NAMES } from '@domain';

/**
 * Palcos do Ear Training: teclado de 2 oitavas, braço (baixo ou guitarra) e Círculo das Quintas.
 * Todos mostram a nota raiz com anel pulsante, ondas nas notas que soam, acerto/erro e o caminho entre a
 * nota-base e a resposta escolhida.
 */
export type StageKind = 'piano' | 'bass' | 'guitar' | 'circle';

export interface StageProps {
  kind: StageKind;
  /** Classe de altura da nota raiz/referência. */
  rootPc: number | null;
  /** Notas soando agora (MIDI). */
  lit: readonly number[];
  /** Muda a cada som para reiniciar as ondas. */
  pulse: number;
  chosenPcs: readonly number[];
  correctPcs: readonly number[];
  wrongPcs: readonly number[];
  /** Caminho entre duas classes de altura (nota-base → resposta). */
  path: { from: number; to: number } | null;
  disabled: boolean;
  onPick(midi: number): void;
}

const pcOf = (m: number) => ((Math.round(m) % 12) + 12) % 12;
const BLACK = new Set([1, 3, 6, 8, 10]);
const OPEN: Record<'bass' | 'guitar', number[]> = { bass: [43, 38, 33, 28], guitar: [64, 59, 55, 50, 45, 40] };

function cls(pc: number, p: StageProps, litPcs: Set<number>): string {
  return [
    pc === p.rootPc ? 'root' : '',
    litPcs.has(pc) ? 'lit' : '',
    p.chosenPcs.includes(pc) ? 'chosen' : '',
    p.correctPcs.includes(pc) ? 'right' : '',
    p.wrongPcs.includes(pc) ? 'wrong' : '',
  ].join(' ');
}

function Piano(p: StageProps) {
  const lo = 48;
  const hi = 72;
  const W = 30;
  const keys = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const whites = keys.filter((m) => !BLACK.has(m % 12));
  const litPcs = new Set(p.lit.map(pcOf));
  const xOf = (m: number) => {
    const idx = whites.filter((w) => w < m).length;
    return BLACK.has(m % 12) ? idx * W : idx * W + W / 2;
  };
  const pathTo = p.path ? keys.find((m) => pcOf(m) === p.path!.to) : undefined;
  const pathFrom = p.path ? keys.find((m) => pcOf(m) === p.path!.from) : undefined;
  const dist = p.path ? (((p.path.to - p.path.from) % 12) + 12) % 12 : 0;
  return (
    <svg className="ear-stage ear-piano" viewBox={`0 0 ${whites.length * W} 150`} role="group" aria-label="Teclado de duas oitavas">
      {whites.map((m, i) => (
        <g key={m}>
          <rect className={`ear-key white ${cls(pcOf(m), p, litPcs)}`} x={i * W} y={30} width={W - 1.5} height={110} rx={3} onClick={() => !p.disabled && p.onPick(m)} />
          {(m % 12 === 0 || pcOf(m) === p.rootPc) && (
            <text x={i * W + W / 2} y={132} textAnchor="middle" className="ear-key-label">{NOTE_NAMES[pcOf(m)]}</text>
          )}
          {litPcs.has(pcOf(m)) && <circle key={p.pulse} className="ear-ripple" cx={i * W + W / 2} cy={100} r={8} />}
        </g>
      ))}
      {keys.filter((m) => BLACK.has(m % 12)).map((m) => {
        const idx = whites.filter((w) => w < m).length;
        return <rect key={m} className={`ear-key black ${cls(pcOf(m), p, litPcs)}`} x={idx * W - W * 0.3} y={30} width={W * 0.6} height={68} rx={2} onClick={() => !p.disabled && p.onPick(m)} />;
      })}
      {pathFrom !== undefined && pathTo !== undefined && (
        <g className="ear-path">
          <path d={`M ${xOf(pathFrom)} 26 Q ${(xOf(pathFrom) + xOf(pathTo)) / 2} -10 ${xOf(pathTo)} 26`} fill="none" />
          <text x={(xOf(pathFrom) + xOf(pathTo)) / 2} y={10} textAnchor="middle">{dist} semitons</text>
        </g>
      )}
    </svg>
  );
}

function Fretboard(p: StageProps & { instrument: 'bass' | 'guitar' }) {
  const strings = OPEN[p.instrument];
  const shift = p.instrument === 'bass' ? 12 : 0; // o palco usa a mesma altura do teclado: o baixo soa uma oitava abaixo
  const litPcs = new Set(p.lit.map(pcOf));
  const FW = 54;
  const SG = 28;
  const frets = 13;
  const w = frets * FW + 36;
  const h = strings.length * SG + 40;
  const dist = p.path ? (((p.path.to - p.path.from) % 12) + 12) % 12 : 0;
  return (
    <svg className="ear-stage ear-neck" viewBox={`0 0 ${w} ${h}`} role="group" aria-label={`Braço de ${p.instrument === 'bass' ? 'contrabaixo' : 'guitarra'}`}>
      {Array.from({ length: frets + 1 }, (_, f) => (
        <line key={f} x1={36 + f * FW} x2={36 + f * FW} y1={20} y2={20 + (strings.length - 1) * SG} stroke={f === 0 ? '#ddd' : '#555a6b'} strokeWidth={f === 0 ? 4 : 1.2} />
      ))}
      {[3, 5, 7, 9].map((f) => (
        <circle key={f} cx={36 + f * FW - FW / 2} cy={h - 8} r={3} fill="#555a6b" />
      ))}
      {strings.map((open, si) => (
        <g key={si}>
          <line x1={36} x2={36 + frets * FW} y1={20 + si * SG} y2={20 + si * SG} stroke="#9aa0b4" strokeWidth={1 + (strings.length - si) * 0.18} />
          {Array.from({ length: frets }, (_, f) => {
            const midi = open + f + shift;
            const c = cls(pcOf(midi), p, litPcs);
            const x = 36 + f * FW + FW / 2;
            return (
              <g key={f} onClick={() => !p.disabled && p.onPick(midi)}>
                <rect x={36 + f * FW} y={20 + si * SG - SG / 2} width={FW} height={SG} fill="transparent" className="ear-hit" />
                {c.trim() && <circle className={`ear-dot ${c}`} cx={x} cy={20 + si * SG} r={9} />}
                {litPcs.has(pcOf(midi)) && <circle key={p.pulse} className="ear-ripple" cx={x} cy={20 + si * SG} r={9} />}
                {c.trim() && <text x={x} y={20 + si * SG + 3.5} textAnchor="middle" className="ear-dot-label">{NOTE_NAMES[pcOf(midi)]}</text>}
              </g>
            );
          })}
        </g>
      ))}
      {p.path && <text x={w / 2} y={h - 4} textAnchor="middle" className="ear-path-text">distância: {dist} semitons</text>}
    </svg>
  );
}

function Circle(p: StageProps) {
  const R = 118;
  const r0 = 62;
  const c = 150;
  const litPcs = new Set(p.lit.map(pcOf));
  const ang = (i: number) => (i * 30 - 90) * (Math.PI / 180);
  const pos = (i: number, rad: number) => [c + Math.cos(ang(i)) * rad, c + Math.sin(ang(i)) * rad] as const;
  const slot = (pc: number) => (pc * 7) % 12;
  const arc = (i: number) => {
    const a0 = ang(i) - Math.PI / 12;
    const a1 = ang(i) + Math.PI / 12;
    const p0 = [c + Math.cos(a0) * R, c + Math.sin(a0) * R];
    const p1 = [c + Math.cos(a1) * R, c + Math.sin(a1) * R];
    const p2 = [c + Math.cos(a1) * r0, c + Math.sin(a1) * r0];
    const p3 = [c + Math.cos(a0) * r0, c + Math.sin(a0) * r0];
    return `M ${p0[0]} ${p0[1]} A ${R} ${R} 0 0 1 ${p1[0]} ${p1[1]} L ${p2[0]} ${p2[1]} A ${r0} ${r0} 0 0 0 ${p3[0]} ${p3[1]} Z`;
  };
  const steps = p.path ? Math.min((slot(p.path.to) - slot(p.path.from) + 12) % 12, (slot(p.path.from) - slot(p.path.to) + 12) % 12) : 0;
  return (
    <svg className="ear-stage ear-circle" viewBox="0 0 300 300" role="group" aria-label="Círculo das quintas">
      {Array.from({ length: 12 }, (_, i) => {
        const pc = (i * 7) % 12;
        const [x, y] = pos(i, (R + r0) / 2);
        return (
          <g key={i} onClick={() => !p.disabled && p.onPick(60 + pc)}>
            <path className={`ear-slice ${cls(pc, p, litPcs)}`} d={arc(i)} />
            <text x={x} y={y + 4} textAnchor="middle" className="ear-slice-label">{NOTE_NAMES[pc]}</text>
            {litPcs.has(pc) && <circle key={p.pulse} className="ear-ripple" cx={x} cy={y} r={14} />}
          </g>
        );
      })}
      {p.path && (() => {
        const a = pos(slot(p.path.from), r0 - 6);
        const b = pos(slot(p.path.to), r0 - 6);
        return (
          <g className="ear-path">
            <path d={`M ${a[0]} ${a[1]} Q ${c} ${c} ${b[0]} ${b[1]}`} fill="none" />
            <text x={c} y={c + 4} textAnchor="middle">{steps} {steps === 1 ? 'passo' : 'passos'}</text>
          </g>
        );
      })()}
      <text x={c} y={c - 18} textAnchor="middle" className="ear-circle-center">{p.rootPc !== null ? `I = ${NOTE_NAMES[p.rootPc]}` : ''}</text>
    </svg>
  );
}

export function EarStage(p: StageProps) {
  if (p.kind === 'circle') return <Circle {...p} />;
  if (p.kind === 'piano') return <Piano {...p} />;
  return <Fretboard {...p} instrument={p.kind} />;
}
