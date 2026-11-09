import { useEffect, useRef, useState } from 'react';
import { pcName, type BassTuning, type FretPos } from '@domain';
import { Neck } from './Neck.js';

/**
 * Braço do painel inferior do player: o braço inteiro (da pestana à última casa), ocupando toda a
 * largura do painel, com as notas de baixo do compasso. A janela não pula de compasso em compasso.
 */
export interface NeckNote {
  readonly pos: FretPos;
  readonly midi: number;
  readonly state: 'done' | 'now' | 'next' | 'later';
  /** Dedo na zona: 1 indicador … 4 mínimo; 0 corda solta. */
  readonly finger?: number;
}

interface Props {
  tuning: BassTuning;
  notes: readonly NeckNote[];
  flats: boolean;
  label: 'note' | 'fret' | 'finger';
  /** Zona da mão agora (casa do indicador). */
  zone?: number | null;
  /** Próxima zona (troca de posição a caminho). */
  nextZone?: number | null;
  /** Painel lateral: o braço gira 90° (casas descendo). */
  vertical?: boolean;
}

export function BassNeck({ tuning, notes, flats, label, zone, nextZone, vertical }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Cordas mais baixas quando há muitas (5 e 6 cordas) para o painel não crescer demais.
  const n = tuning.strings.length;
  // Na vertical, o espaçamento das cordas usa a largura do painel: o braço ocupa uns 60% dela.
  const rowH = vertical ? Math.max(22, Math.min(56, Math.floor((w * 0.6 - 34) / n))) : n >= 6 ? 21 : n === 5 ? 23 : 25;
  return (
    <div ref={box} className={`bass-neck-box${vertical ? ' vertical' : ''}`}>
      {w > 0 && (
        <Neck
          className="bass-neck"
          tuning={tuning}
          fromFret={0}
          toFret={tuning.frets}
          width={vertical ? Math.min(w, 260) : w}
          zone={zone ?? null}
          nextZone={nextZone ?? null}
          rowH={rowH}
          flats={flats}
          vertical={!!vertical}
          marks={notes.map((x) => ({ pos: x.pos, state: x.state, label: label === 'fret' ? String(x.pos.fret) : label === 'finger' ? String(x.finger ?? '') : pcName(x.midi, flats) }))}
        />
      )}
    </div>
  );
}
