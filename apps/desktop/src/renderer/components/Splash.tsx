import { useEffect, useState } from 'react';
import logoUrl from '../assets/logo.png';
import { getAudioContext } from '../lib/audio.js';
import { masterBus } from '../lib/practice.js';

/** Abertura: logo pulsando enquanto o áudio é preparado, barra de progresso e saída suave. */
export function Splash({ onDone }: { onDone(): void }) {
  const [pct, setPct] = useState(4);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    let dead = false;
    const timers: number[] = [];
    const step = (p: number, at: number) => timers.push(window.setTimeout(() => !dead && setPct(p), at));
    step(30, 150);
    step(62, 450);
    try {
      getAudioContext();
      masterBus();
    } catch {
      /* sem áudio: segue assim mesmo */
    }
    step(88, 750);
    step(100, 1000);
    timers.push(window.setTimeout(() => !dead && setLeaving(true), 1150));
    timers.push(window.setTimeout(() => !dead && onDone(), 1600));
    return () => {
      dead = true;
      timers.forEach(clearTimeout);
    };
  }, [onDone]);
  return (
    <div className={`splash ${leaving ? 'leaving' : ''}`} role="status" aria-label="Carregando o mixerCraft">
      <img className="splash-logo" src={logoUrl} alt="" />
      <div className="splash-spin" aria-hidden="true" />
      <div className="splash-foot">
        <span>Designed for Musicians</span>
        <div className="splash-bar">
          <span style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
