import { useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react';

/**
 * Knob giratório, flat (SVG sem sombra nem gradiente). Arco de 270°, cor do token --c.
 * Arrastar para cima/baixo (Shift = ajuste fino), roda do mouse, setas do teclado,
 * PageUp/PageDown, Home/End, e duplo clique volta ao padrão.
 * Bipolar (ex.: pan): o arco parte do centro.
 */
interface Props {
  value: number;
  min: number;
  max: number;
  /** Valor do duplo clique. */
  defaultValue: number;
  onChange(v: number): void;
  label: string;
  /** Texto do valor para leitores de tela e para o balão. */
  format?(v: number): string;
  size?: number;
  step?: number;
  bipolar?: boolean;
  disabled?: boolean;
  /** Legenda curta embaixo (ex.: VOL, PAN). */
  caption?: string | undefined;
}

const START = -135;
const SWEEP = 270;

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function arc(cx: number, cy: number, r: number, from: number, to: number): string {
  if (Math.abs(to - from) < 0.01) return '';
  const [a, b] = from < to ? [from, to] : [to, from];
  const [x1, y1] = polar(cx, cy, r, a);
  const [x2, y2] = polar(cx, cy, r, b);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)}A${r} ${r} 0 ${b - a > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export function Knob({ value, min, max, defaultValue, onChange, label, format, size = 30, step, bipolar = false, disabled = false, caption }: Props) {
  const drag = useRef<{ y: number; v: number } | null>(null);
  const [active, setActive] = useState(false);
  const range = max - min;
  const unit = step ?? range / 100;
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / unit) * unit));
  const t = (Math.min(max, Math.max(min, value)) - min) / range;
  const angle = START + t * SWEEP;
  const zeroAngle = bipolar ? START + ((0 - min) / range) * SWEEP : START;
  const text = format ? format(value) : String(Math.round(value * 100) / 100);

  const c = size / 2;
  const rTrack = c - 2.5;
  const rBody = c - 6;
  const [px, py] = polar(c, c, rBody - 1.5, angle);
  const [qx, qy] = polar(c, c, rBody * 0.35, angle);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, v: value };
    setActive(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    // 150 px de curso cobrem a faixa inteira; com Shift, 4× mais fino.
    const per = range / (e.shiftKey ? 600 : 150);
    onChange(clamp(d.v + (d.y - e.clientY) * per));
  };
  const end = () => {
    drag.current = null;
    setActive(false);
  };
  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (disabled || e.ctrlKey) return;
    onChange(clamp(value + (e.deltaY < 0 ? 1 : -1) * unit * (e.shiftKey ? 1 : 3)));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const big = range / 10;
    const map: Record<string, number> = {
      ArrowUp: value + unit,
      ArrowRight: value + unit,
      ArrowDown: value - unit,
      ArrowLeft: value - unit,
      PageUp: value + big,
      PageDown: value - big,
      Home: min,
      End: max,
    };
    const next = map[e.key];
    if (next === undefined) return;
    e.preventDefault();
    e.stopPropagation(); // não aciona os atalhos do player (setas = compasso)
    onChange(clamp(next));
  };

  return (
    <div className={`knob ${active ? 'active' : ''} ${disabled ? 'disabled' : ''}`} style={{ width: size }}>
      <div
        className="knob-dial"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Math.round(value * 1000) / 1000}
        aria-valuetext={text}
        aria-disabled={disabled || undefined}
        title={`${label}: ${text}\nArraste, use a roda ou as setas. Duplo clique: padrão.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
        onDoubleClick={() => !disabled && onChange(defaultValue)}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <path className="knob-track" d={arc(c, c, rTrack, START, START + SWEEP)} />
          <path className="knob-value" d={arc(c, c, rTrack, zeroAngle, angle)} />
          <circle className="knob-body" cx={c} cy={c} r={rBody} />
          <line className="knob-pointer" x1={qx} y1={qy} x2={px} y2={py} />
        </svg>
        {active && <span className="knob-tip">{text}</span>}
      </div>
      {caption && <span className="knob-caption">{caption}</span>}
    </div>
  );
}
