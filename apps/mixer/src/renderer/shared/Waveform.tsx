import { memo, useEffect, useMemo, useRef } from 'react';

/**
 * Forma de onda de uma faixa, desenhada em blocos de canvas (até 2048 px cada): aguenta zoom
 * em músicas longas sem estourar o limite de tamanho de canvas. Os picos são calculados uma vez
 * por buffer (200 por segundo) e reamostrados para a largura em pixels.
 */
const PEAKS_PER_SEC = 200;
const TILE = 2048;
const cache = new WeakMap<AudioBuffer, Float32Array>();

function peaksOf(buffer: AudioBuffer): Float32Array {
  const hit = cache.get(buffer);
  if (hit) return hit;
  const bins = Math.max(1, Math.ceil(buffer.duration * PEAKS_PER_SEC));
  const out = new Float32Array(bins);
  const chans = Array.from({ length: Math.min(2, buffer.numberOfChannels) }, (_, c) => buffer.getChannelData(c));
  const step = buffer.length / bins;
  for (let b = 0; b < bins; b++) {
    const from = Math.floor(b * step);
    const to = Math.min(buffer.length, Math.floor((b + 1) * step));
    let peak = 0;
    for (const data of chans) {
      for (let i = from; i < to; i += 2) {
        const a = Math.abs(data[i]!);
        if (a > peak) peak = a;
      }
    }
    out[b] = peak;
  }
  cache.set(buffer, out);
  return out;
}

interface Props {
  buffer: AudioBuffer;
  pxPerSec: number;
  height: number;
  color: string;
  dim: boolean;
}

function Tile({ peaks, x0, width, pxPerSec, height, color }: { peaks: Float32Array; x0: number; width: number; pxPerSec: number; height: number; color: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || height <= 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(width * dpr);
    cv.height = Math.round(height * dpr);
    const g = cv.getContext('2d');
    if (!g) return;
    g.scale(dpr, dpr);
    g.clearRect(0, 0, width, height);
    g.fillStyle = color;
    const mid = height / 2;
    const binsPerPx = PEAKS_PER_SEC / pxPerSec;
    for (let px = 0; px < width; px++) {
      const a = Math.floor((x0 + px) * binsPerPx);
      const b = Math.max(a + 1, Math.floor((x0 + px + 1) * binsPerPx));
      let peak = 0;
      for (let i = a; i < b && i < peaks.length; i++) if (peaks[i]! > peak) peak = peaks[i]!;
      // Escala com raiz: faixas baixas continuam visíveis sem achatar as altas.
      const h = Math.max(0.5, Math.sqrt(peak) * (height * 0.46));
      g.fillRect(px, mid - h, 1, h * 2);
    }
  }, [peaks, x0, width, pxPerSec, height, color]);
  return <canvas ref={ref} style={{ position: 'absolute', left: x0, top: 0, width, height }} />;
}

export const Waveform = memo(function Waveform({ buffer, pxPerSec, height, color, dim }: Props) {
  const peaks = useMemo(() => peaksOf(buffer), [buffer]);
  const total = Math.ceil(buffer.duration * pxPerSec);
  const tiles = [];
  for (let x = 0; x < total; x += TILE) tiles.push(x);
  return (
    <div className={`waveform ${dim ? 'dim' : ''}`} style={{ width: total, height }} aria-hidden="true">
      {tiles.map((x0) => (
        <Tile key={`${x0}-${pxPerSec}`} peaks={peaks} x0={x0} width={Math.min(TILE, total - x0)} pxPerSec={pxPerSec} height={height} color={color} />
      ))}
    </div>
  );
});
