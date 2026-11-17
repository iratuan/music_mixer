import { useEffect, useRef, useState, type ReactNode } from 'react';
import { yinPitch } from '@domain';
import { getAudioContext } from '../lib/audio.js';
import { clickAt, masterBus } from '../lib/practice.js';

const NAMES = ['Dó', 'Dó#', 'Ré', 'Ré#', 'Mi', 'Fá', 'Fá#', 'Sol', 'Sol#', 'Lá', 'Lá#', 'Si'];

function Sheet({ title, onClose, children }: { title: string; onClose(): void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="tool-scrim" onClick={onClose}>
      <div className="tool-sheet card" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="tool-head">
          <h2>{title}</h2>
          <button className="ghost small-btn" onClick={onClose}>
            Fechar
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Afinador cromático pelo microfone/entrada (altura por YIN, de 25 Hz a 1,2 kHz). */
export function TunerModal({ onClose }: { onClose(): void }) {
  const [note, setNote] = useState<{ name: string; cents: number; hz: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let raf = 0;
    let stream: MediaStream | null = null;
    let dead = false;
    void (async () => {
      try {
        const ctx = getAudioContext();
        if (ctx.state === 'suspended') await ctx.resume();
        stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
        if (dead) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const src = ctx.createMediaStreamSource(stream);
        const an = ctx.createAnalyser();
        an.fftSize = 4096;
        src.connect(an);
        const buf = new Float32Array(an.fftSize);
        let last = 0;
        const loop = () => {
          an.getFloatTimeDomainData(buf);
          let s = 0;
          for (let i = 0; i < buf.length; i++) s += buf[i]! * buf[i]!;
          const rms = Math.sqrt(s / buf.length);
          const est = rms > 0.01 ? yinPitch(buf, ctx.sampleRate, 25, 1200) : null;
          if (est && est.clarity > 0.8) {
            const m = 69 + 12 * Math.log2(est.hz / 440);
            const r = Math.round(m);
            last = performance.now();
            setNote({ name: `${NAMES[((r % 12) + 12) % 12]}${Math.floor(r / 12) - 1}`, cents: Math.round((m - r) * 100), hz: est.hz });
          } else if (performance.now() - last > 600) setNote(null);
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      } catch {
        setErr('Não consegui abrir o microfone ou a entrada de áudio.');
      }
    })();
    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  const c = note?.cents ?? 0;
  const inTune = note !== null && Math.abs(c) <= 5;
  return (
    <Sheet title="Afinador cromático" onClose={onClose}>
      {err ? (
        <p className="muted">{err}</p>
      ) : (
        <div className={`tuner ${inTune ? 'ok' : ''}`}>
          <b className="tuner-note">{note ? note.name : '—'}</b>
          <div className="tuner-scale" aria-hidden="true">
            <i style={{ left: `${50 + Math.max(-50, Math.min(50, c))}%` }} />
          </div>
          <span className="muted">{note ? `${c > 0 ? '+' : ''}${c} cents · ${note.hz.toFixed(1)} Hz` : 'Toque uma corda…'}</span>
        </div>
      )}
    </Sheet>
  );
}

/** Metrônomo com toque do andamento (tap tempo). */
export function MetronomeModal({ onClose }: { onClose(): void }) {
  const [bpm, setBpm] = useState(100);
  const [on, setOn] = useState(false);
  const taps = useRef<number[]>([]);
  useEffect(() => {
    if (!on) return;
    const ctx = getAudioContext();
    void ctx.resume();
    const out = masterBus();
    let next = ctx.currentTime + 0.08;
    let n = 0;
    const id = window.setInterval(() => {
      while (next < ctx.currentTime + 0.2) {
        clickAt(next, n % 4 === 0, 0.7, out);
        next += 60 / bpm;
        n++;
      }
    }, 40);
    return () => clearInterval(id);
  }, [on, bpm]);
  function tap() {
    const t = performance.now();
    const a = taps.current.filter((x) => t - x < 2500);
    a.push(t);
    taps.current = a;
    if (a.length >= 2) setBpm(Math.max(30, Math.min(260, Math.round(60000 / ((a[a.length - 1]! - a[0]!) / (a.length - 1))))));
  }
  return (
    <Sheet title="Metrônomo e Tap Tempo" onClose={onClose}>
      <div className="metro">
        <b className="metro-bpm">{bpm}</b>
        <span className="muted">BPM</span>
        <input type="range" min={30} max={260} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} aria-label="Andamento" />
        <div className="metro-btns">
          <button className="ghost" onClick={tap}>
            Tap
          </button>
          <button className="primary" onClick={() => setOn((v) => !v)}>
            {on ? 'Parar' : 'Tocar'}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
