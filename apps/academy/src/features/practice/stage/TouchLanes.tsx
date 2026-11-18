import { useRef, useState, type PointerEvent } from 'react';

/**
 * Pistas de toque do desafio (modo "Teclado ou toque"): o mesmo gesto das teclas 1–N + Enter, para
 * celular e tablet. Segure a pista da corda (como segurar a casa) e toque em "Palhetar". Pointer Events
 * cobrem dedo, mouse e caneta; vários dedos ao mesmo tempo funcionam (uma captura por pista).
 */
interface Props {
  lanes: number;
  names: readonly string[];
  disabled?: boolean;
  onPress(lane: number): void;
  onRelease(lane: number): void;
  onStrike(): void;
}

export function TouchLanes({ lanes, names, disabled, onPress, onRelease, onStrike }: Props) {
  const [down, setDown] = useState<ReadonlySet<number>>(new Set());
  const [striking, setStriking] = useState(false);
  const held = useRef(new Map<number, number>()); // pointerId -> pista

  const press = (lane: number) => (e: PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    e.preventDefault();
    try {
      // Mantém o dedo "na pista" mesmo se escorregar; se o navegador recusar, a pista funciona sem.
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* sem captura */
    }
    held.current.set(e.pointerId, lane);
    setDown((d) => new Set(d).add(lane));
    onPress(lane);
  };
  const release = (e: PointerEvent<HTMLButtonElement>) => {
    const lane = held.current.get(e.pointerId);
    if (lane === undefined) return;
    held.current.delete(e.pointerId);
    if (![...held.current.values()].includes(lane)) {
      setDown((d) => {
        const n = new Set(d);
        n.delete(lane);
        return n;
      });
      onRelease(lane);
    }
  };

  return (
    <div className="touch-lanes" aria-label="Pistas de toque">
      <div className="touch-lanes-row" style={{ ['--lanes' as string]: lanes }}>
        {Array.from({ length: lanes }, (_, i) => (
          <button
            key={i}
            type="button"
            className="touch-lane"
            data-down={down.has(i)}
            disabled={disabled}
            aria-label={`Casa na corda ${i + 1} (${names[i] ?? ''})`}
            aria-pressed={down.has(i)}
            onPointerDown={press(i)}
            onPointerUp={release}
            onPointerCancel={release}
            onContextMenu={(e) => e.preventDefault()}
          >
            {names[i] ?? i + 1}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="touch-strike"
        data-down={striking}
        disabled={disabled}
        onPointerDown={(e) => {
          if (disabled) return;
          e.preventDefault();
          setStriking(true);
          onStrike();
        }}
        onPointerUp={() => setStriking(false)}
        onPointerCancel={() => setStriking(false)}
        onContextMenu={(e) => e.preventDefault()}
      >
        Palhetar
      </button>
    </div>
  );
}
