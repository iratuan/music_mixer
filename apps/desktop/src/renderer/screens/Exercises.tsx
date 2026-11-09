import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BASS_TUNINGS,
  EXERCISES,
  SCALE_BANK,
  buildScaleExercise,
  exerciseUnit,
  fingerFor,
  hitWindowSec,
  keyUsesFlats,
  pcName,
  stringGroups,
  type ExerciseId,
  type Verdict,
} from '@domain';
import { Icon } from '../components/Icons.js';
import { Knob } from '../components/Knob.js';
import { Neck, type MarkState, type NeckMark } from '../components/Neck.js';
import { getAudioContext } from '../lib/audio.js';
import { INSTRUMENT_INPUT, clickAt, listInputs, pluckAt, startInput, type InputEngine } from '../lib/practice.js';

/**
 * Exercícios de escala (motor do ScaleMonster): tom, escala, padrão, grupo de cordas, região do braço,
 * andamento com aceleração automática. Toca a sequência e, no modo desafio, ouve o instrumento
 * (UM2 ou microfone) e marca acerto, oitava e erro em cada nota.
 */
const ROOTS = Array.from({ length: 12 }, (_, i) => i);
const KEY = 'bf-exercise';

interface Settings {
  root: number;
  category: string;
  mode: string;
  exercise: ExerciseId;
  strings: number;
  group: string;
  region: number | 'all';
  bpm: number;
  ramp: boolean;
  rampEvery: number;
  label: 'finger' | 'note' | 'fret';
  sound: boolean;
  click: boolean;
}

const DEFAULTS: Settings = {
  root: 9,
  category: 'Pentatônica',
  mode: 'Menor',
  exercise: 1,
  strings: 4,
  group: 'all',
  region: 0,
  bpm: 80,
  ramp: false,
  rampEvery: 2,
  label: 'finger',
  sound: true,
  click: true,
};

function load(): Settings {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* sem preferência */
  }
  return DEFAULTS;
}

export function Exercises() {
  const [s, setS] = useState<Settings>(load);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((x) => ({ ...x, [k]: v }));
  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* só nesta sessão */
    }
  }, [s]);

  const tuning = BASS_TUNINGS.find((t) => t.strings.length === s.strings) ?? BASS_TUNINGS[0]!;
  const groups = useMemo(() => stringGroups(tuning.strings.length), [tuning]);
  const group = groups.find((g) => g.id === s.group) ?? groups[0]!;
  const modes = Object.keys(SCALE_BANK[s.category] ?? {});
  const mode = SCALE_BANK[s.category]?.[s.mode] ?? SCALE_BANK[s.category]?.[modes[0]!];
  const minor = /Menor|Eólio|Dórico|Frígio|Lócrio/.test(s.mode);
  const flats = keyUsesFlats({ tonic: s.root, mode: minor ? 'minor' : 'major' });

  const ex = useMemo(
    () => (mode ? buildScaleExercise({ tuning, root: s.root, mode }, s.exercise, group.strings, s.region) : null),
    [tuning, s.root, mode, s.exercise, group, s.region],
  );

  /* ------------------------------ reprodução ------------------------------ */
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(-1);
  const [bpmNow, setBpmNow] = useState(s.bpm);
  const [loops, setLoops] = useState(0);
  const sched = useRef<{ timer: number; out: GainNode; times: number[]; startLoop: number; due: Array<{ id: number; midi: number; at: number; deadline: number }> } | null>(null);

  const [challenge, setChallenge] = useState(false);
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [verdicts, setVerdicts] = useState<Record<number, Verdict>>({});
  const [score, setScore] = useState({ hit: 0, octave: 0, miss: 0 });
  const [inputError, setInputError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const input = useRef<InputEngine | null>(null);

  useEffect(() => {
    void listInputs()
      .then((list) => {
        setInputs(list);
        const um2 = list.find((d) => INSTRUMENT_INPUT.test(d.label));
        if (um2) setDeviceId(um2.deviceId);
      })
      .catch(() => setInputs([]));
  }, []);

  function stop() {
    if (sched.current) {
      window.clearInterval(sched.current.timer);
      sched.current.out.disconnect();
    }
    sched.current = null;
    input.current?.stop();
    input.current = null;
    setPlaying(false);
    setStep(-1);
  }
  useEffect(() => () => stop(), []);
  // Mudou o exercício: para.
  useEffect(() => {
    if (playing) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ex]);

  async function start() {
    if (!ex || ex.sequence.length === 0) return;
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') await ctx.resume();
    stop();
    setVerdicts({});
    setScore({ hit: 0, octave: 0, miss: 0 });
    setLoops(0);
    setInputError(null);
    if (challenge) {
      try {
        input.current = await startInput(deviceId, ({ id, verdict }) => {
          setVerdicts((v) => ({ ...v, [id]: verdict }));
          setScore((sc) => ({ ...sc, [verdict]: sc[verdict] + 1 }));
        });
      } catch (e) {
        setInputError(e instanceof Error ? e.message : 'não foi possível abrir a entrada de áudio');
        return;
      }
    }
    const out = ctx.createGain();
    out.connect(ctx.destination);
    const seq = ex.sequence;
    const unit = exerciseUnit(s.exercise);
    // Contagem de 4 tempos antes de começar.
    let bpm = s.bpm;
    let beat = 60 / bpm;
    const t0 = ctx.currentTime + 0.15;
    if (s.click) for (let k = 0; k < 4; k++) clickAt(t0 + k * beat, k === 0, 0.7, out);
    let next = t0 + 4 * beat;
    let i = 0;
    let loopCount = 0;
    const times: number[] = new Array(seq.length).fill(Infinity);
    const state = { timer: 0, out, times, startLoop: next, due: [] as Array<{ id: number; midi: number; at: number; deadline: number }> };
    const pump = () => {
      while (next < ctx.currentTime + 0.25) {
        const idx = i % seq.length;
        if (idx === 0 && i > 0) {
          loopCount++;
          setLoops(loopCount);
          if (s.ramp && loopCount % s.rampEvery === 0) {
            bpm = Math.min(300, bpm + 5);
            beat = 60 / bpm;
            setBpmNow(bpm);
          }
          times.fill(Infinity);
          state.startLoop = next;
        }
        const n = seq[idx]!;
        times[idx] = next;
        if (s.sound && !challenge) pluckAt(next, n.midi, 0.35, out);
        else if (s.sound && challenge) pluckAt(next, n.midi, 0.12, out); // guia baixinho no desafio
        if (s.click) clickAt(next, idx === 0 || idx % (unit * 4) === 0, 0.45, out);
        // O juiz recebe a nota na hora em que ela soa (ver o relógio da tela), não no agendamento.
        if (challenge) state.due.push({ id: idx + loopCount * seq.length, midi: n.midi, at: next, deadline: next + hitWindowSec(bpm) });
        next += beat;
        i++;
      }
    };
    pump();
    state.timer = window.setInterval(pump, 40);
    sched.current = state;
    setBpmNow(bpm);
    setPlaying(true);
  }

  // Nota atual pela posição do relógio.
  useEffect(() => {
    if (!playing || !ex) return;
    const ctx = getAudioContext();
    let raf = 0;
    const tick = () => {
      const st = sched.current;
      if (st) {
        const now = ctx.currentTime;
        let cur = -1;
        st.times.forEach((t, k) => {
          if (t <= now && (cur < 0 || t > st.times[cur]!)) cur = k;
        });
        setStep(cur);
        while (st.due.length && st.due[0]!.at <= now) {
          const d = st.due.shift()!;
          input.current?.expect(d.id, d.midi, d.deadline);
        }
        if (input.current) setLevel(Math.round(input.current.level() * 20) / 20); // degraus de 5%: menos redesenho
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, ex]);

  /* ------------------------------ braço ------------------------------ */
  const marks: NeckMark[] = useMemo(() => {
    if (!ex) return [];
    const seq = ex.sequence;
    const active = seq.map((n) => ({ string: n.string, fret: n.fret }));
    const labelOf = (n: (typeof seq)[number]) =>
      s.label === 'fret' ? String(n.fret) : s.label === 'note' ? pcName(n.midi, flats) : fingerFor(n.fret, n.string, active.filter((p) => inWindowOf(n.fret, p.fret)));
    // Dedo: compara só com as notas da mesma janela de posição (no braço inteiro, cada posição tem sua mão).
    function inWindowOf(fret: number, other: number): boolean {
      const w = ex!.windows.find(([a, b]) => fret >= a && fret <= b);
      return w ? other >= w[0] && other <= w[1] : Math.abs(other - fret) <= 3;
    }
    const inSeq = new Set(seq.map((n) => `${n.string}:${n.fret}`));
    const out: NeckMark[] = [];
    // Notas da escala fora do padrão: discretas.
    for (const n of ex.scaleNotes) {
      if (inSeq.has(`${n.string}:${n.fret}`)) continue;
      out.push({ pos: n, label: '', state: 'scale' });
    }
    const seen = new Set<string>();
    seq.forEach((n) => {
      const k = `${n.string}:${n.fret}`;
      if (seen.has(k)) return;
      seen.add(k);
      out.push({ pos: n, label: labelOf(n), state: n.pc === s.root ? 'root' : 'later' });
    });
    if (step >= 0) {
      const cur = seq[step]!;
      const nxt = seq[(step + 1) % seq.length]!;
      out.push({ pos: nxt, label: labelOf(nxt), state: 'next' });
      // Último veredito da nota atual (no desafio).
      const loopBase = loops * seq.length;
      const v = verdicts[loopBase + step - 1] ?? null;
      const prev = seq[(step - 1 + seq.length) % seq.length]!;
      if (v) out.push({ pos: prev, label: labelOf(prev), state: v as MarkState });
      out.push({ pos: cur, label: labelOf(cur), state: 'now' });
    }
    return out;
  }, [ex, s.label, s.root, flats, step, verdicts, loops]);

  const total = score.hit + score.octave + score.miss;
  const pct = total ? Math.round(((score.hit + score.octave * 0.5) / total) * 100) : null;
  const seqLen = ex?.sequence.length ?? 0;

  return (
    <section className="screen exercises">
      <header className="page-head row">
        <div>
          <h1>Exercícios</h1>
          <p className="muted">Escalas e técnica no braço do baixo. Toque junto, ou ligue o desafio para ser avaliado pela UM2 ou pelo microfone.</p>
        </div>
      </header>

      <div className="ex-controls card">
        <label className="field">
          <span>Tom</span>
          <select value={s.root} onChange={(e) => set('root', Number(e.target.value))}>
            {ROOTS.map((r) => (
              <option key={r} value={r}>
                {pcName(r, flats)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Escala</span>
          <select
            value={s.category}
            onChange={(e) => {
              const cat = e.target.value;
              setS((x) => ({ ...x, category: cat, mode: Object.keys(SCALE_BANK[cat] ?? {})[0] ?? '' }));
            }}
          >
            {Object.keys(SCALE_BANK).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Variação</span>
          <select value={s.mode} onChange={(e) => set('mode', e.target.value)}>
            {modes.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label className="field wide">
          <span>Exercício</span>
          <select value={s.exercise} onChange={(e) => set('exercise', Number(e.target.value) as ExerciseId)}>
            {EXERCISES.map((x) => (
              <option key={x.id} value={x.id}>
                {x.id}. {x.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Região</span>
          <select value={String(s.region)} onChange={(e) => set('region', e.target.value === 'all' ? 'all' : Number(e.target.value))}>
            {(ex?.windows ?? []).map(([a, b], k) => (
              <option key={k} value={k}>
                Posição {k + 1} (casas {a}–{b})
              </option>
            ))}
            <option value="all">Braço inteiro</option>
          </select>
        </label>
        <div className="field">
          <span>Cordas</span>
          <div className="seg small">
            {[4, 5, 6].map((n) => (
              <button key={n} aria-pressed={s.strings === n} onClick={() => setS((x) => ({ ...x, strings: n, group: 'all' }))}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>Grupo de cordas</span>
          <select value={group.id} onChange={(e) => set('group', e.target.value)}>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="ex-stage card">
        <div className="ex-stage-head">
          <h2>
            {pcName(s.root, flats)} {s.category} · {s.mode}
          </h2>
          <span className="muted small">
            {EXERCISES.find((x) => x.id === s.exercise)?.name} · {seqLen} notas por ciclo
          </span>
          <div className="spacer" />
          <div className="seg tiny" role="group" aria-label="Rótulo das notas">
            {(
              [
                ['finger', 'Dedo'],
                ['note', 'Nota'],
                ['fret', 'Casa'],
              ] as const
            ).map(([v, l]) => (
              <button key={v} aria-pressed={s.label === v} onClick={() => set('label', v)}>
                {l}
              </button>
            ))}
          </div>
        </div>
        {ex && ex.sequence.length > 0 ? (
          <Neck className="ex-neck" tuning={tuning} fromFret={ex.fromFret} toFret={ex.toFret} marks={marks} flats={flats} rowH={34} />
        ) : (
          <p className="muted">Sem notas nesta combinação de região e grupo de cordas.</p>
        )}
        <div className="ex-seq" aria-label="Sequência">
          {ex?.sequence.slice(0, 64).map((n, k) => (
            <span key={k} className={`ex-pill ${k === step ? 'now' : ''} ${verdicts[loops * seqLen + k] ?? ''}`}>
              {pcName(n.midi, flats)}
            </span>
          ))}
          {seqLen > 64 && <span className="muted small">+{seqLen - 64}</span>}
        </div>
      </div>

      <footer className="ex-transport card">
        <button className="primary round big" onClick={() => (playing ? stop() : void start())} disabled={!ex || seqLen === 0} aria-label={playing ? 'Parar' : 'Começar'}>
          <Icon name={playing ? 'stop' : 'play'} size={20} />
        </button>
        <div className="bpm">
          <Knob
            value={playing ? bpmNow : s.bpm}
            min={40}
            max={300}
            step={1}
            defaultValue={80}
            size={40}
            disabled={playing}
            label="Andamento"
            format={(v) => `${Math.round(v)} BPM`}
            onChange={(v) => set('bpm', Math.round(v))}
          />
          <span className="bpm-value">
            <b>{playing ? bpmNow : s.bpm}</b> BPM
          </span>
        </div>
        <label className="check">
          <input type="checkbox" checked={s.ramp} onChange={() => set('ramp', !s.ramp)} disabled={playing} /> Acelerar +5 BPM a cada {s.rampEvery} ciclos
        </label>
        <label className="check">
          <input type="checkbox" checked={s.sound} onChange={() => set('sound', !s.sound)} /> Som das notas
        </label>
        <label className="check">
          <input type="checkbox" checked={s.click} onChange={() => set('click', !s.click)} /> Metrônomo
        </label>
        <div className="spacer" />
        <label className="check challenge">
          <input type="checkbox" checked={challenge} onChange={() => setChallenge((c) => !c)} disabled={playing} /> Desafio
        </label>
        {challenge && (
          <select className="input-select" value={deviceId ?? ''} onChange={(e) => setDeviceId(e.target.value || null)} disabled={playing} aria-label="Entrada de áudio">
            <option value="">Entrada padrão</option>
            {inputs.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || 'Entrada sem nome'}
              </option>
            ))}
          </select>
        )}
        {challenge && playing && <span className="meter" aria-label="Nível de entrada" style={{ ['--lvl' as string]: level }} />}
        {pct !== null && (
          <span className="score" title={`${score.hit} certas, ${score.octave} na oitava errada, ${score.miss} erradas`}>
            <b>{pct}%</b> · {score.hit}✓ {score.octave ? `${score.octave}↕ ` : ''}
            {score.miss}✗{loops > 0 ? ` · ${loops} ciclos` : ''}
          </span>
        )}
      </footer>
      {inputError && (
        <p className="alert" role="alert">
          <Icon name="alert" size={16} /> Entrada de áudio: {inputError}
        </p>
      )}
    </section>
  );
}
