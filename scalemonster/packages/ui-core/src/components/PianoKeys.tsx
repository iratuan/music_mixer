import { memo, useEffect, useRef, useState } from 'react';

/**
 * Teclado do painel inferior do player: ocupa toda a largura e acende as notas do piano no
 * compasso (tocando agora, próximas, já tocadas). A extensão é fixa para a música toda (do Dó
 * abaixo da nota mais grave ao Si acima da mais aguda), para as teclas não mudarem de lugar.
 */
export type KeyState = 'now' | 'next' | 'later' | 'done';

export interface KeyMark {
  readonly midi: number;
  readonly state: KeyState;
  /** Mão: esquerda (acorde base) ou direita (arpejo). */
  readonly hand?: 'L' | 'R';
  /** base = nota do acorde; extra = fora do acorde; suggest = acorde sugerido (não tocado); arp = arpejo. */
  readonly role?: 'base' | 'extra' | 'suggest' | 'arp';
  /** Ordem no arpejo (mão direita). */
  readonly order?: number;
}

interface Props {
  /** Extensão: primeira e última nota MIDI (ajustadas para Dó … Si). */
  low: number;
  high: number;
  marks: readonly KeyMark[];
  flats: boolean;
  /** O que escrever nas teclas marcadas: nome da nota ou ordem do arpejo (mão direita). */
  label: 'note' | 'order';
  /** Painel lateral: o teclado gira 90° (agudo em cima). */
  vertical?: boolean;
}

const BLACK = new Set([1, 3, 6, 8, 10]);
const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const RANK: Record<KeyState, number> = { done: 0, later: 1, next: 2, now: 3 };

/**
 * Extensão estável para um conjunto de notas: oitavas inteiras, no mínimo 3, dentro do piano de 88
 * teclas. Ignora os 1% mais graves e mais agudos (vazamento de outros instrumentos na separação),
 * para o teclado não ficar miúdo por causa de poucas notas soltas.
 */
export function keyboardRange(midis: readonly number[]): { low: number; high: number } {
  if (midis.length === 0) return { low: 48, high: 83 };
  const sorted = [...midis].sort((a, b) => a - b);
  const cut = Math.floor(sorted.length * 0.01);
  let lo = sorted[cut]!;
  let hi = sorted[sorted.length - 1 - cut]!;
  lo = Math.max(21, lo - (((lo % 12) + 12) % 12));
  hi = Math.min(108, hi + (11 - (((hi % 12) + 12) % 12)));
  while (hi - lo + 1 < 36) {
    if (lo - 12 >= 21) lo -= 12;
    else if (hi + 12 <= 108) hi += 12;
    else break;
  }
  return { low: lo, high: hi };
}

export const PianoKeys = memo(function PianoKeys({ low, high, marks, flats, label, vertical }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const state = new Map<number, KeyMark>();
  for (const m of marks) {
    const cur = state.get(m.midi);
    if (!cur || RANK[m.state] > RANK[cur.state] || (cur.role === 'suggest' && m.role !== 'suggest')) state.set(m.midi, m);
  }
  const cls = (m: KeyMark | undefined) => (m ? `${m.state} ${m.hand === 'L' ? 'lh' : 'rh'} ${m.role ?? ''}` : '');
  const name = (m: number) => (flats ? FLAT : SHARP)[m % 12]!;
  const text = (midi: number, m: KeyMark) => (label === 'note' ? name(midi) : m.order ? String(m.order) : '');
  const whites: number[] = [];
  for (let m = low; m <= high; m++) if (!BLACK.has(m % 12)) whites.push(m);
  const W = Math.max(300, w);
  const ww = W / Math.max(1, whites.length);
  // Na vertical, H é a largura do teclado girado: mais largo para as teclas ficarem legíveis.
  const H = vertical ? 150 : Math.round(Math.min(130, Math.max(84, ww * 4.6)));
  const bh = H * 0.62;
  const bw = ww * 0.62;
  const xWhite = new Map<number, number>();
  whites.forEach((m, i) => xWhite.set(m, i * ww));

  // Painel lateral: o mesmo desenho, girado 90° anti-horário (graves embaixo, agudos em cima).
  const rot = vertical ? { style: { width: H, height: W }, viewBox: `0 0 ${H} ${W}`, g: `translate(0 ${W}) rotate(-90)` } : null;

  return (
    <div ref={box} className={`piano-box${vertical ? ' vertical' : ''}`}>
      {w > 0 && (
        <svg
          className="piano"
          viewBox={rot ? rot.viewBox : `0 0 ${W} ${H}`}
          style={rot?.style}
          role="img"
          aria-label="Teclado do piano"
        >
          <g transform={rot?.g}>
            {whites.map((m) => {
              const x = xWhite.get(m)!;
              const st = state.get(m);
              return (
                <g key={m} className={`pkey white ${cls(st)}`}>
                  <rect x={x + 0.5} y={0.5} width={ww - 1} height={H - 1} rx={3} />
                  {st && text(m, st) ? (
                    <text x={x + ww / 2} y={H - 9} textAnchor="middle" className="pkey-name">
                      {text(m, st)}
                    </text>
                  ) : (
                    m % 12 === 0 && (
                      <text x={x + ww / 2} y={H - 9} textAnchor="middle" className="pkey-c">
                        C{Math.floor(m / 12) - 1}
                      </text>
                    )
                  )}
                </g>
              );
            })}
            {Array.from({ length: high - low + 1 }, (_, i) => low + i)
              .filter((m) => BLACK.has(m % 12))
              .map((m) => {
                const x = (xWhite.get(m - 1) ?? 0) + ww - bw / 2;
                const st = state.get(m);
                return (
                  <g key={m} className={`pkey black ${cls(st)}`}>
                    <rect x={x} y={0} width={bw} height={bh} rx={2.5} />
                    {st && bw >= 12 && text(m, st) && (
                      <text x={x + bw / 2} y={bh - 7} textAnchor="middle" className="pkey-name">
                        {text(m, st)}
                      </text>
                    )}
                  </g>
                );
              })}
          </g>
        </svg>
      )}
    </div>
  );
});
