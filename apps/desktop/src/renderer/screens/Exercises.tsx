import { useEffect, useMemo, useRef, useState } from 'react';
import { errorText } from '../lib/errors.js';
import {
  INSTRUMENT_INFO,
  tuningsFor,
  type PracticeInstrument,
  EXERCISES,
  ALL_ROUTINES,
  TOUR_KINDS,
  FRET_RANGES,
  neckWindows,
  windowsInRange,
  type FretRange,
  buildNeckTour,
  groupsOfSize,
  type NeckTour,
  type ScaleExercise,
  type TourKind,
  ROUTINE_LEVELS,
  ROUTINE_TOPICS,
  SCALE_BANK,
  mergeRecord,
  routineById,
  routineMastered,
  type Routine,
  type RoutineLevel,
  type RoutineRecord,
  type RoutineTopic,
  buildScaleExercise,
  exerciseUnit,
  fingerFor,
  hitWindowSec,
  keyUsesFlats,
  pcName,
  stringGroups,
  type ExerciseId,
  type Verdict,
  FofHighwayEngine,
  SUBDIVISIONS,
  chartNote,
  type ScaleNote,
  type Subdivision,
  mergeSessions,
  sessionXp,
  exerciseIdForKey,
  practiceXp,
  type PracticeSession,
} from '@domain';
import { ProgressDashboard } from '../components/ProgressDashboard.js';
import { ArcadeStageCanvas, LANE_KEYS, type StageFeed } from '../components/ArcadeStageCanvas.js';
import { ChallengeResultsModal, type ChallengeResult } from '../components/ChallengeResultsModal.js';
import { Icon } from '../components/Icons.js';
import { Knob } from '../components/Knob.js';
import { Neck, type MarkState, type NeckMark } from '../components/Neck.js';
import { getAudioContext } from '../lib/audio.js';
import { INSTRUMENT_INPUT, clickAt, BASS_TIMBRES, TIMBRES_OF, listInputs, masterBus, openMidi, pluckAt, setBassTimbre, type BassTimbre, startInput, type InputEngine, type MidiInput } from '../lib/practice.js';
import { recordSession } from '../lib/db.js';
import { readStore, writeStore } from '../lib/store.js';
import { SongExercise } from './SongExercise.js';

/**
 * Exercícios de escala (motor do ScaleMonster): tom, escala, padrão, grupo de cordas, região do braço,
 * andamento com aceleração automática. Toca a sequência e, no modo desafio, ouve o instrumento
 * (UM2 ou microfone) e marca acerto, oitava e erro em cada nota.
 */
const ROOTS = Array.from({ length: 12 }, (_, i) => i);
const KEY = 'bf-exercise';
const RECORDS_KEY = 'bf-ex-records';
const VIEW_KEY = 'bf-ex-view';

/** A rotina continua valendo enquanto os ajustes dela não forem mudados. */
/** Grupo de cordas da rotina: o mais grave do tamanho pedido, ou todas. */
function routineGroup(r: Routine, strings: number): string {
  const size = r.settings.groupSize;
  return size && size < strings ? (groupsOfSize(strings, size)[0]?.id ?? 'all') : 'all';
}
function followsRoutine(s: Settings, r: Routine | null): boolean {
  if (!r) return false;
  const x = r.settings;
  // Tom, região e parte do braço ficam a critério do aluno: a rotina continua valendo em qualquer tom e região.
  return (
    s.category === x.category &&
    s.mode === x.mode &&
    s.exercise === x.exercise &&
    // A região também é escolha do aluno; só o modo (região fixa ou braço contínuo) faz parte da rotina.
    (s.region === 'all') === (x.region === 'all') &&
    s.group === routineGroup(r, s.strings) &&
    s.tour === (x.tour ?? 'off') &&
    (s.tour === 'off' || s.repeats === (x.repeats ?? 1))
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

interface Settings {
  root: number;
  category: string;
  mode: string;
  exercise: ExerciseId;
  strings: number;
  /** Baixo ou guitarra: afinação, timbre e detecção de altura seguem o instrumento. */
  instrument: PracticeInstrument;
  group: string;
  region: number | 'all';
  /** Percurso: avançar sozinho pelas regiões e/ou grupos de cordas. */
  tour: TourKind;
  /** Ciclos de cada etapa do percurso. */
  repeats: number;
  /** Parte do braço usada: um id de FRET_RANGES ou 'custom' (casas rangeLo a rangeHi). */
  rangeId: string;
  rangeLo: number;
  rangeHi: number;
  bpm: number;
  ramp: boolean;
  rampEvery: number;
  label: 'finger' | 'note' | 'fret';
  sound: boolean;
  click: boolean;
  /** Notas por tempo (1 semínima … 4 semicolcheias). */
  subdivision: Subdivision;
  /** Desafio: como as notas entram (instrumento pela entrada de áudio, MIDI ou teclado do computador). */
  inputMode: InputMode;
  /** Som do baixo (guia das notas). */
  timbre: BassTimbre;
  /** Desafio abre em tela cheia ao começar. */
  autoMax: boolean;
}
type InputMode = 'audio' | 'midi' | 'keys';
const INPUT_MODES: ReadonlyArray<{ id: InputMode; label: string; hint: string }> = [
  { id: 'audio', label: 'Instrumento (áudio)', hint: 'Toque o instrumento ligado à interface ou perto do microfone' },
  { id: 'midi', label: 'Instrumento MIDI', hint: 'Teclado, baixo ou guitarra MIDI ligado ao computador' },
  { id: 'keys', label: 'Teclado do computador', hint: 'Segure a casa (1 a 6, corda grave = 1) e palhete com Enter ou Espaço; ligados valem só com a casa' },
];
/** Precisão mínima do desafio no Palco. */
const STAGE_GOAL = 80;

const DEFAULTS: Settings = {
  root: 9,
  category: 'Pentatônica',
  mode: 'Menor',
  exercise: 1,
  strings: 4,
  group: 'all',
  region: 0,
  tour: 'off',
  repeats: 1,
  rangeId: 'all',
  rangeLo: 0,
  rangeHi: 12,
  bpm: 80,
  ramp: false,
  rampEvery: 2,
  label: 'finger',
  sound: true,
  click: true,
  subdivision: 1,
  inputMode: 'audio',
  autoMax: true,
  timbre: 'jazz',
  instrument: 'bass',
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
  /** Aba (biblioteca de rotinas ou treino livre), rotina aberta e filtros da biblioteca. */
  const [view, setView] = useState(() =>
    readStore<{ tab: 'library' | 'practice' | 'song' | 'progress'; routine: string | null; level: RoutineLevel | 'all'; topic: RoutineTopic | 'all'; scale?: string; key?: number | 'orig' }>(VIEW_KEY, {
      tab: 'library',
      routine: null,
      level: 'all',
      topic: 'all',
    }),
  );
  useEffect(() => writeStore(VIEW_KEY, view), [view]);
  const [records, setRecords] = useState<Record<string, RoutineRecord>>(() => readStore<Record<string, RoutineRecord>>(RECORDS_KEY, {}));
  const recordsRef = useRef(records);
  recordsRef.current = records;
  const routine = routineById(view.routine);
  const onRoutine = followsRoutine(s, routine);

  function openRoutine(r: Routine) {
    const x = r.settings;
    setS((cur) => ({
      ...cur,
      // Tom escolhido na biblioteca (ou o da rotina).
      root: view.key === 'orig' || view.key === undefined ? x.root : view.key,
      category: x.category,
      mode: x.mode,
      exercise: x.exercise,
      region: x.region,
      bpm: x.bpm,
      ramp: x.ramp,
      rampEvery: x.rampEvery,
      group: routineGroup(r, cur.strings),
      tour: x.tour ?? 'off',
      repeats: x.repeats ?? 1,
    }));
    setView((v) => ({ ...v, tab: 'practice', routine: r.id }));
  }
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((x) => ({ ...x, [k]: v }));
  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* só nesta sessão */
    }
  }, [s]);

  const instrument: PracticeInstrument = s.instrument ?? 'bass';
  const tunings = tuningsFor(instrument);
  const tuning = tunings.find((t) => t.strings.length === s.strings) ?? tunings[0]!;
  const groups = useMemo(() => stringGroups(tuning.strings.length), [tuning]);
  const group = groups.find((g) => g.id === s.group) ?? groups[0]!;
  const modes = Object.keys(SCALE_BANK[s.category] ?? {});
  const mode = SCALE_BANK[s.category]?.[s.mode] ?? SCALE_BANK[s.category]?.[modes[0]!];
  const minor = /Menor|Eólio|Dórico|Frígio|Lócrio/.test(s.mode);
  const flats = keyUsesFlats({ tonic: s.root, mode: minor ? 'minor' : 'major' });

  // Percurso pelo braço (avança sozinho) ou uma região fixa. No braço inteiro contínuo não há etapas.
  const touring = s.tour !== 'off' && s.region !== 'all';
  // Parte do braço escolhida e as regiões (posições) que cabem nela.
  const range: FretRange | null = s.rangeId === 'custom' ? [Math.min(s.rangeLo, s.rangeHi), Math.max(s.rangeLo, s.rangeHi)] : (FRET_RANGES.find((x) => x.id === s.rangeId)?.range ?? null);
  const allWindows = useMemo(() => (mode ? neckWindows(s.root, mode.offset, tuning.frets) : []), [mode, s.root, tuning]);
  const allowed = useMemo(() => windowsInRange(allWindows, range), [allWindows, range?.[0], range?.[1]]);
  // A região fixa precisa estar dentro da parte escolhida (ao mudar o tom, as janelas mudam).
  useEffect(() => {
    if (typeof s.region === 'number' && allowed.length && !allowed.includes(s.region)) setS((x) => ({ ...x, region: allowed[0]! }));
  }, [allowed, s.region]);
  const ex: (ScaleExercise & { stages?: NeckTour['stages'] }) | null = useMemo(() => {
    if (!mode) return null;
    const ctx = { tuning, root: s.root, mode };
    if (s.tour !== 'off' && s.region !== 'all') return buildNeckTour(ctx, s.exercise, s.tour, group, s.region, s.repeats, range);
    return buildScaleExercise(ctx, s.exercise, group.strings, s.region, range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tuning, s.root, mode, s.exercise, group, s.region, s.tour, s.repeats, range?.[0], range?.[1]]);

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
  const midiIn = useRef<MidiInput | null>(null);
  /** Palco: juiz da pista, batidas e casas apertadas, lidos pelo desenho a cada quadro. */
  const feed = useRef<StageFeed>({ engine: null, beats: [], pressed: new Set(), now: () => getAudioContext().currentTime, playing: false });
  const [result, setResult] = useState<ChallengeResult | null>(null);
  /** Nome e chave do exercício em andamento (para o histórico). */
  const historyKey = useRef<{ label: string; key: string; instrument: PracticeInstrument }>({ label: '', key: '', instrument: 'bass' });
  const [restart, setRestart] = useState(false);
  /** Palco em tela cheia dentro do app (Esc ou o botão voltam). */
  const [stageMax, setStageMax] = useState(false);
  const stagePanel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!stageMax) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setStageMax(false);
    // Sai da tela cheia do sistema (Esc ou F11): volta ao tamanho normal.
    const onFs = () => !document.fullscreenElement && setStageMax(false);
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFs);
    };
  }, [stageMax]);
  /** Maximizar: tela cheia de verdade (quando o sistema permite) e, de todo jeito, o palco cobrindo a janela. */
  function toggleStageMax() {
    if (stageMax) {
      setStageMax(false);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    } else {
      setStageMax(true);
      void stagePanel.current?.requestFullscreen?.().catch(() => undefined);
    }
  }
  const [lastXp, setLastXp] = useState<number | undefined>(undefined);
  const [history, setHistory] = useState<PracticeSession[]>(() => readStore<PracticeSession[]>('bf-history', []));
  useEffect(() => setBassTimbre(TIMBRES_OF[s.instrument ?? 'bass'].includes(s.timbre) ? s.timbre : TIMBRES_OF[s.instrument ?? 'bass'][0]!), [s.timbre, s.instrument]);
  /** Rotina do treino em andamento (para o recorde) e os números mais recentes, lidos ao parar. */
  const session = useRef<string | null>(null);
  const scoreRef = useRef(score);
  scoreRef.current = score;
  const loopsRef = useRef(loops);
  loopsRef.current = loops;
  const bpmRef = useRef(bpmNow);
  bpmRef.current = bpmNow;

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
    // Fim de um treino de rotina: guarda o recorde (melhor acerto no desafio e maior andamento).
    const sess = session.current;
    session.current = null;
    if (sess && sched.current) {
      const sc = scoreRef.current;
      const total = sc.hit + sc.octave + sc.miss;
      const enough = loopsRef.current >= 1 || total >= 8;
      if (enough) {
        const pct = total >= 8 ? Math.round(((sc.hit + sc.octave * 0.5) / total) * 100) : null;
        // Grava direto: ao sair da tela, o treino para depois que a tela já foi desmontada.
        const next = { ...recordsRef.current, [sess]: mergeRecord(recordsRef.current[sess], { pct, bpm: bpmRef.current, at: new Date().toISOString() }) };
        recordsRef.current = next;
        writeStore(RECORDS_KEY, next);
        setRecords(next);
      }
    }
    const eng = feed.current.engine;
    if (eng && sched.current && eng.judged > 0) {
      const st = eng.stats;
      const accuracy = eng.accuracy() ?? 0;
      setResult({ score: st.score, accuracy, maxStreak: st.maxStreak, hits: st.hits, perfect: st.perfect, great: st.great, good: st.good, octave: st.octave, misses: st.misses, hopoHits: st.hopoHits, hopoTotal: st.hopoTotal, bpm: bpmRef.current, goal: STAGE_GOAL });
      // Salva a sessão no histórico (vinculada ao exercício e ao tom praticados).
      const stage = historyKey.current;
      const sess: PracticeSession = { at: new Date().toISOString(), exercise: stage.label, key: stage.key, instrument: INSTRUMENT_INFO[historyKey.current.instrument].label, bpm: bpmRef.current, accuracy, maxStreak: st.maxStreak, score: st.score, hits: st.hits, misses: st.misses };
      setLastXp(sessionXp(sess));
      void recordSession({ exerciseId: exerciseIdForKey(stage.key), key: stage.key, instrument: stage.instrument, score: st.score, accuracy, bpm: bpmRef.current, maxCombo: st.maxStreak, xp: practiceXp(accuracy) });
      // O resumo aparece no app: sai da tela cheia.
      setStageMax(false);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      const merged = mergeSessions(readStore<PracticeSession[]>('bf-history', []), [sess]).sessions;
      writeStore('bf-history', merged);
      setHistory(merged);
    }
    if (eng) eng.onJudged = null;
    feed.current.playing = false;
    feed.current.pressed.clear();
    if (sched.current) {
      window.clearInterval(sched.current.timer);
      sched.current.out.disconnect();
    }
    sched.current = null;
    input.current?.stop();
    input.current = null;
    midiIn.current?.stop();
    midiIn.current = null;
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
    // Desafio: o palco abre em tela cheia ao começar (ainda dentro do clique, para o sistema permitir).
    if (challenge && (s.autoMax ?? true) && !stageMax) {
      setStageMax(true);
      void stagePanel.current?.requestFullscreen?.().catch(() => undefined);
    }
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') await ctx.resume();
    stop();
    setResult(null);
    setVerdicts({});
    setScore({ hit: 0, octave: 0, miss: 0 });
    setLoops(0);
    setInputError(null);
    // Desafio = Palco: o juiz da pista recebe as notas (o juiz de áudio decide sozinho os erros).
    const engine = challenge ? new FofHighwayEngine({ autoMiss: s.inputMode !== 'audio' }) : null;
    if (engine) {
      engine.onJudged = (n) => {
        const v = n.state as Verdict;
        setVerdicts((x) => ({ ...x, [n.id]: v }));
        setScore((sc) => ({ ...sc, [v]: sc[v] + 1 }));
      };
    }
    feed.current.engine = engine;
    feed.current.beats = [];
    feed.current.countIn = [];
    historyKey.current = { label: `${pcName(s.root, flats)} ${s.category} · ${s.mode} · ${EXERCISES.find((x) => x.id === s.exercise)?.name ?? ''}`, key: `${instrument}|${s.root}|${s.category}|${s.mode}|${s.exercise}`, instrument };
    if (engine && s.inputMode === 'audio') {
      try {
        input.current = await startInput(deviceId, ({ id, verdict }) => engine.verdict(id, verdict, ctx.currentTime), readStore('bf-input-latency', { ms: 30 }).ms / 1000, { fmin: INSTRUMENT_INFO[instrument].fminHz, fmax: INSTRUMENT_INFO[instrument].fmaxHz }); // atraso ajustado no exercício da música
      } catch (e) {
        setInputError(errorText(e, 'não foi possível abrir a entrada de áudio'));
        return;
      }
    } else if (engine && s.inputMode === 'midi') {
      try {
        midiIn.current = await openMidi((m) => engine.midiOn(m, ctx.currentTime));
      } catch (e) {
        setInputError(errorText(e, 'não foi possível abrir a entrada MIDI'));
        return;
      }
    }
    const out = ctx.createGain();
    out.connect(masterBus());
    const seq = ex.sequence;
    const unit = exerciseUnit(s.exercise);
    const sub = s.subdivision;
    const mode = s.inputMode;
    // Contagem de 4 tempos antes de começar.
    let bpm = s.bpm;
    let beat = 60 / bpm;
    const t0 = ctx.currentTime + 0.15;
    for (let k = 0; k < 4; k++) {
      if (s.click) clickAt(t0 + k * beat, k === 0, 0.7, out);
      feed.current.beats.push(t0 + k * beat);
      feed.current.countIn!.push(t0 + k * beat);
    }
    // Produção (com antecedência, para a pista mostrar as notas chegando) e consumo (som e juiz).
    const LOOK = engine ? 2.6 : 0.25;
    let next = t0 + 4 * beat;
    let i = 0;
    let loopCount = 0;
    let prev: ScaleNote | null = null;
    const queue: Array<{ idx: number; loop: number; at: number; bpm: number; k: number }> = [];
    const times: number[] = new Array(seq.length).fill(Infinity);
    const state = { timer: 0, out, times, startLoop: next, due: [] as Array<{ id: number; midi: number; at: number; deadline: number }> };
    const pump = () => {
      const now = ctx.currentTime;
      while (next < now + LOOK) {
        const idx = i % seq.length;
        if (idx === 0 && i > 0) {
          loopCount++;
          if (s.ramp && loopCount % s.rampEvery === 0) {
            bpm = Math.min(300, bpm + 5);
            beat = 60 / bpm;
          }
        }
        const n = seq[idx]!;
        queue.push({ idx, loop: loopCount, at: next, bpm, k: i });
        if (i % sub === 0) feed.current.beats.push(next);
        engine?.add(chartNote(idx + loopCount * seq.length, n, prev, next, bpm, sub));
        prev = n;
        next += beat / sub;
        i++;
      }
      while (queue.length && queue[0]!.at < now + 0.25) {
        const ev = queue.shift()!;
        if (ev.idx === 0 && ev.loop > 0) {
          setLoops(ev.loop);
          setBpmNow(ev.bpm);
          bpmRef.current = ev.bpm;
          times.fill(Infinity);
          state.startLoop = ev.at;
        }
        const n = seq[ev.idx]!;
        const step = 60 / ev.bpm / sub;
        times[ev.idx] = ev.at;
        // No desafio com o instrumento, o guia toca baixinho; no teclado do computador, toca normal.
        if (s.sound) pluckAt(ev.at, n.midi, !engine || mode === 'keys' ? 0.42 : 0.12, out, step * 0.92);
        if (s.click && ev.k % sub === 0) {
          const accent = sub === 1 ? ev.idx === 0 || ev.idx % (unit * 4) === 0 : ev.idx === 0 || (ev.k / sub) % 4 === 0;
          clickAt(ev.at, accent, 0.45, out);
        }
        // O juiz de áudio recebe a nota na hora em que ela soa (ver o relógio da tela), não no agendamento.
        if (engine && mode === 'audio') state.due.push({ id: ev.idx + ev.loop * seq.length, midi: n.midi, at: ev.at, deadline: ev.at + hitWindowSec(ev.bpm * sub) });
      }
      const beats = feed.current.beats;
      while (beats.length > 4 && beats[0]! < now - 1) beats.shift();
    };
    pump();
    state.timer = window.setInterval(pump, 40);
    sched.current = state;
    setBpmNow(s.bpm);
    bpmRef.current = s.bpm;
    session.current = onRoutine && routine ? routine.id : null;
    feed.current.playing = true;
    setPlaying(true);
  }

  // "+5 BPM e de novo": recomeça depois que o andamento novo entrou nos ajustes.
  useEffect(() => {
    if (!restart) return;
    setRestart(false);
    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restart]);

  // Teclado do computador no Palco: segure a casa (1–6 ou F1–F6) e palhete (Enter, Espaço, ↑/↓).
  useEffect(() => {
    if (!playing || !challenge || s.inputMode !== 'keys') return;
    const ctx = getAudioContext();
    const laneOf = (e: KeyboardEvent): number => {
      const k = LANE_KEYS.indexOf(e.key);
      if (k >= 0) return k;
      const f = /^F([1-6])$/.exec(e.key);
      return f ? Number(f[1]) - 1 : -1;
    };
    const onDown = (e: KeyboardEvent) => {
      const tg = e.target as HTMLElement | null;
      if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA')) return;
      const eng = feed.current.engine;
      if (!eng) return;
      const lane = laneOf(e);
      const now = ctx.currentTime;
      if (lane >= 0 && lane < s.strings) {
        e.preventDefault();
        if (e.repeat) return;
        feed.current.pressed.add(lane);
        eng.tap(lane, now);
      } else if (e.key === 'Enter' || e.code === 'Space' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (e.repeat) return;
        // Vale a casa mais aguda apertada (como no braço: a de cima soa).
        const lanes = [...feed.current.pressed].sort((a, b) => b - a);
        eng.strike(lanes.length ? lanes[0]! : -1, now);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      const lane = laneOf(e);
      if (lane >= 0) feed.current.pressed.delete(lane);
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    const pressed = feed.current.pressed;
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      pressed.clear();
    };
  }, [playing, challenge, s.inputMode, s.strings]);

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
        // Palco: erros vencidos, caudas sustentadas (nota segurada ou ainda soando) e energia.
        const eng = feed.current.engine;
        if (eng) {
          const mode = s.inputMode;
          eng.update(now, (n) =>
            mode === 'keys' ? feed.current.pressed.has(n.lane) : mode === 'midi' ? !!midiIn.current?.held.has(n.midi) : (input.current?.level() ?? 0) > 0.04,
          );
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, ex]);

  /* ------------------------------ braço ------------------------------ */
  // Etapa do percurso em que o aluno está (antes de começar, a primeira).
  const stage = ex?.stages?.length ? (ex.stages.find((st) => step >= st.from && step < st.to) ?? ex.stages[0]!) : null;
  const stageIdx = stage && ex?.stages ? ex.stages.indexOf(stage) : -1;
  const marks: NeckMark[] = useMemo(() => {
    if (!ex) return [];
    const seq = ex.sequence;
    // No percurso, o braço mostra só as notas da etapa atual.
    const view = stage ? seq.slice(stage.from, stage.to) : seq;
    const scaleNotes = stage ? stage.scaleNotes : ex.scaleNotes;
    const active = view.map((n) => ({ string: n.string, fret: n.fret }));
    const labelOf = (n: (typeof seq)[number]) =>
      s.label === 'fret' ? String(n.fret) : s.label === 'note' ? pcName(n.midi, flats) : fingerFor(n.fret, n.string, active.filter((p) => inWindowOf(n.fret, p.fret)));
    // Dedo: compara só com as notas da mesma janela de posição (no braço inteiro, cada posição tem sua mão).
    function inWindowOf(fret: number, other: number): boolean {
      const w = ex!.windows.find(([a, b]) => fret >= a && fret <= b);
      return w ? other >= w[0] && other <= w[1] : Math.abs(other - fret) <= 3;
    }
    const inSeq = new Set(view.map((n) => `${n.string}:${n.fret}`));
    const out: NeckMark[] = [];
    // Notas da escala fora do padrão: discretas.
    for (const n of scaleNotes) {
      if (inSeq.has(`${n.string}:${n.fret}`)) continue;
      out.push({ pos: n, label: '', state: 'scale' });
    }
    const seen = new Set<string>();
    view.forEach((n) => {
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
  }, [ex, stage, s.label, s.root, flats, step, verdicts, loops]);

  const total = score.hit + score.octave + score.miss;
  const pct = total ? Math.round(((score.hit + score.octave * 0.5) / total) * 100) : null;
  const seqLen = ex?.sequence.length ?? 0;

  return (
    <section className="screen exercises">
      <header className="page-head row">
        <div>
          <h1>Exercícios</h1>
          <p className="muted">Escalas e técnica no braço do baixo, da guitarra ou do violão. Toque junto, ou ligue o desafio para ser avaliado pela UM2 ou pelo microfone.</p>
        </div>
        <div className="spacer" />
        <div className="seg" role="tablist" aria-label="Exercícios">
          <button role="tab" aria-selected={view.tab === 'library'} aria-pressed={view.tab === 'library'} onClick={() => (playing && stop(), setView((v) => ({ ...v, tab: 'library' })))}>
            <Icon name="library" size={15} /> Biblioteca
          </button>
          <button role="tab" aria-selected={view.tab === 'song'} aria-pressed={view.tab === 'song'} onClick={() => (playing && stop(), setView((v) => ({ ...v, tab: 'song' })))} title="A linha do baixo de uma música, trecho por trecho">
            <Icon name="tab" size={15} /> Música
          </button>
          <button role="tab" aria-selected={view.tab === 'progress'} aria-pressed={view.tab === 'progress'} onClick={() => (playing && stop(), setView((v) => ({ ...v, tab: 'progress' })))} title="Seu histórico, níveis e recordes">
            <Icon name="tab" size={15} /> Evolução
          </button>
          <button role="tab" aria-selected={view.tab === 'practice'} aria-pressed={view.tab === 'practice'} onClick={() => setView((v) => ({ ...v, tab: 'practice' }))}>
            <Icon name="exercise" size={15} /> Treino
          </button>
        </div>
      </header>

      {view.tab === 'progress' ? (
        <ProgressDashboard sessions={history} onChange={setHistory} />
      ) : view.tab === 'song' ? (
        <SongExercise />
      ) : view.tab === 'library' ? (
        <RoutineLibrary
          level={view.level}
          topic={view.topic}
          records={records}
          current={view.routine}
          scale={view.scale ?? 'all'}
          keyChoice={view.key ?? 'orig'}
          onKey={(key) => setView((v) => ({ ...v, key }))}
          onFilter={(level, topic) => setView((v) => ({ ...v, level, topic }))}
          onScale={(scale) => setView((v) => ({ ...v, scale }))}
          onOpen={openRoutine}
        />
      ) : (
      <div className={challenge ? 'ex-split' : 'ex-single'}>
      <div className="ex-left">
      {routine && (
        <div className={`routine-banner card ${onRoutine ? '' : 'off'}`} role="status">
          <span className={`lvl-badge lvl-${routine.level === 'Iniciante' ? 1 : routine.level === 'Intermediário' ? 2 : 3}`}>{routine.level}</span>
          <div className="routine-banner-text">
            <b>
              {routine.title} <span className="muted">em {pcName(s.root, flats)}</span>
            </b>
            <span className="muted small">
              {onRoutine
                ? `Meta: ${routine.targetBpm} BPM com 90% de acerto no desafio.${records[routine.id] ? ` ${recordLine(records[routine.id]!)}` : ''}`
                : 'Você mudou os ajustes: este treino não conta para o recorde da rotina.'}
            </span>
          </div>
          <div className="spacer" />
          {!onRoutine && (
            <button className="ghost small-btn" onClick={() => openRoutine(routine)}>
              Voltar aos ajustes da rotina
            </button>
          )}
          <button className="ghost small-btn" onClick={() => (playing && stop(), setView((v) => ({ ...v, routine: null })))}>
            Treino livre
          </button>
        </div>
      )}

      <div className="ex-controls card">
        <div className="field">
          <span>Tom</span>
          <div className="key-pick">
            <button className="ghost icon-btn" onClick={() => set('root', (s.root + 11) % 12)} aria-label="Meio tom abaixo" title="Meio tom abaixo">
              <Icon name="minus" size={13} />
            </button>
            <select value={s.root} onChange={(e) => set('root', Number(e.target.value))} aria-label="Tom">
              {ROOTS.map((r) => (
                <option key={r} value={r}>
                  {pcName(r, flats)}
                </option>
              ))}
            </select>
            <button className="ghost icon-btn" onClick={() => set('root', (s.root + 1) % 12)} aria-label="Meio tom acima" title="Meio tom acima">
              <Icon name="plus" size={13} />
            </button>
            <button className="ghost small-btn" onClick={() => set('root', (s.root + 5) % 12)} title="Próximo tom no ciclo das quartas (C → F → Bb…): para passar a escala por todos os tons">
              4ª
            </button>
          </div>
        </div>
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
          <select
            value={String(s.region)}
            disabled={touring && (s.tour === 'positions' || s.tour === 'full')}
            title={touring && s.tour !== 'groups' ? 'O percurso passa por todas as regiões' : undefined}
            onChange={(e) => set('region', e.target.value === 'all' ? 'all' : Number(e.target.value))}
          >
            {allowed.map((k) => (
              <option key={k} value={k}>
                Região {k + 1} (casas {allWindows[k]![0]}–{allWindows[k]![1]})
              </option>
            ))}
            <option value="all">{range ? 'Toda a parte escolhida, contínuo' : 'Braço inteiro contínuo'}</option>
          </select>
        </label>
        <label className="field">
          <span>Parte do braço</span>
          <select value={s.rangeId} onChange={(e) => set('rangeId', e.target.value)} title="Casas do instrumento que você quer usar: as regiões e o percurso ficam dentro delas">
            {FRET_RANGES.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
            <option value="custom">Escolher as casas…</option>
          </select>
        </label>
        {s.rangeId === 'custom' && (
          <div className="field">
            <span>Casas</span>
            <div className="key-pick">
              <select value={s.rangeLo} onChange={(e) => set('rangeLo', Number(e.target.value))} aria-label="Da casa">
                {Array.from({ length: tuning.frets - 3 }, (_, f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <span className="muted small">a</span>
              <select value={s.rangeHi} onChange={(e) => set('rangeHi', Number(e.target.value))} aria-label="Até a casa">
                {Array.from({ length: tuning.frets - 3 }, (_, f) => f + 4).map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        <label className="field">
          <span>Percurso</span>
          <select
            value={s.tour}
            onChange={(e) => {
              const tour = e.target.value as TourKind;
              setS((x) => ({ ...x, tour, region: tour !== 'off' && x.region === 'all' ? 0 : x.region }));
            }}
            title="Avança sozinho pelo braço: região por região e/ou grupo de cordas por grupo"
          >
            {TOUR_KINDS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        {touring && (
          <label className="field">
            <span>Ciclos por etapa</span>
            <select value={s.repeats} onChange={(e) => set('repeats', Number(e.target.value))}>
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="field wide">
          <span>Instrumento</span>
          <div className="seg small" role="group" aria-label="Instrumento">
            {(['bass', 'guitar', 'acoustic'] as const).map((k) => (
              <button
                key={k}
                aria-pressed={instrument === k}
                disabled={playing}
                onClick={() =>
                  setS((x) => ({ ...x, instrument: k, strings: INSTRUMENT_INFO[k].defaultStrings, group: 'all', timbre: TIMBRES_OF[k][0]!, region: 0, tour: 'off', rangeId: 'all' }))
                }
              >
                {INSTRUMENT_INFO[k].label}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>Cordas</span>
          <div className="seg small">
            {INSTRUMENT_INFO[instrument].strings.map((n) => (
              <button key={n} aria-pressed={s.strings === n} onClick={() => setS((x) => ({ ...x, strings: n, group: 'all' }))}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>{touring && s.tour !== 'positions' ? 'Tamanho do grupo' : 'Grupo de cordas'}</span>
          <select value={group.id} onChange={(e) => set('group', e.target.value)}>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.id === 'all' ? 'Todas as cordas' : `${g.strings.length} cordas: ${g.label}`}
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
          <span className="ex-tags">
            {routine && <span className={`lvl-badge lvl-${routine.level === 'Iniciante' ? 1 : routine.level === 'Intermediário' ? 2 : 3}`}>{routine.level}</span>}
            <span className="tag">Escala</span>
            <span className="tag">{s.bpm} BPM</span>
          </span>
          <span className="muted small">
            {EXERCISES.find((x) => x.id === s.exercise)?.name} · {seqLen} notas por ciclo
          </span>
          {stage && ex?.stages && (
            <span className="tour-stage" role="status">
              Etapa {stageIdx + 1} de {ex.stages.length} · região {stage.region + 1} (casas {stage.window[0]}–{stage.window[1]}) ·{' '}
              {stage.group.id === 'all' ? 'todas as cordas' : `cordas ${stage.group.label}`}
            </span>
          )}
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
          <Neck
            className="ex-neck"
            tuning={tuning}
            fromFret={ex.fromFret}
            toFret={ex.toFret}
            marks={marks}
            flats={flats}
            rowH={stage ? 28 : 34}
            logSpacing
            onPlay={(_pos, midi) => {
              const ctx = getAudioContext();
              void ctx.resume();
              // Clique no braço: a nota exata daquela corda e casa, no timbre escolhido.
              pluckAt(ctx.currentTime + 0.01, midi, 0.5, masterBus(), 1.6);
            }}
            zone={stage ? Math.max(1, stage.window[0]) : null}
          />
        ) : (
          <p className="muted">Sem notas nesta combinação de região e grupo de cordas.</p>
        )}
        <div className="ex-seq" aria-label="Sequência">
          {(() => {
            // No percurso, só a etapa atual.
            const base = stage?.from ?? 0;
            const end = stage?.to ?? seqLen;
            const shown = ex?.sequence.slice(base, Math.min(end, base + 64)) ?? [];
            return (
              <>
                {shown.map((n, j) => {
                  const k = base + j;
                  return (
                    <span key={k} className={`ex-pill ${k === step ? 'now' : ''} ${verdicts[loops * seqLen + k] ?? ''}`}>
                      {pcName(n.midi, flats)}
                    </span>
                  );
                })}
                {end - base > 64 && <span className="muted small">+{end - base - 64}</span>}
              </>
            );
          })()}
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
        <select className="input-select" value={TIMBRES_OF[instrument].includes(s.timbre) ? s.timbre : TIMBRES_OF[instrument][0]!} onChange={(e) => set('timbre', e.target.value as BassTimbre)} aria-label="Som do instrumento" title="Timbre que toca as notas">
          {TIMBRES_OF[instrument].map((k) => (
            <option key={k} value={k}>
              {BASS_TIMBRES[k].label}
            </option>
          ))}
        </select>
        <select className="input-select" value={s.subdivision} onChange={(e) => set('subdivision', Number(e.target.value) as Subdivision)} disabled={playing} aria-label="Ritmo das notas" title="Quantas notas por tempo do metrônomo">
          {SUBDIVISIONS.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
        <div className="spacer" />
        <label className="check challenge" title="Abre o Palco ao lado: a pista de notas com pontos, sequência e multiplicador">
          <input type="checkbox" checked={challenge} onChange={() => setChallenge((c) => !c)} disabled={playing} /> Desafio
        </label>
        {challenge && (
          <label className="check" title="O palco ocupa a tela toda ao começar o desafio">
            <input type="checkbox" checked={s.autoMax ?? true} onChange={() => set('autoMax', !(s.autoMax ?? true))} /> Tela cheia ao começar
          </label>
        )}
        {challenge && (
          <select className="input-select" value={s.inputMode} onChange={(e) => set('inputMode', e.target.value as InputMode)} disabled={playing} aria-label="Como tocar no desafio" title={INPUT_MODES.find((m) => m.id === s.inputMode)?.hint}>
            {INPUT_MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        )}
        {challenge && s.inputMode === 'audio' && (
          <select className="input-select" value={deviceId ?? ''} onChange={(e) => setDeviceId(e.target.value || null)} disabled={playing} aria-label="Entrada de áudio">
            <option value="">Entrada padrão</option>
            {inputs.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || 'Entrada sem nome'}
              </option>
            ))}
          </select>
        )}
        {challenge && playing && s.inputMode === 'audio' && <span className="meter" aria-label="Nível de entrada" style={{ ['--lvl' as string]: level }} />}
        {pct !== null && (
          <span className="score" title={`${score.hit} certas, ${score.octave} na oitava errada, ${score.miss} erradas`}>
            <b>{pct}%</b> · {score.hit}✓ {score.octave ? `${score.octave}↕ ` : ''}
            {score.miss}✗{loops > 0 ? ` · ${loops} ciclos` : ''}
          </span>
        )}
      </footer>
      {inputError && (
        <p className="alert" role="alert">
          <Icon name="alert" size={16} /> {s.inputMode === 'midi' && challenge ? 'Entrada MIDI' : 'Entrada de áudio'}: {inputError}
        </p>
      )}
      </div>
      {challenge && (
        <aside ref={stagePanel} className={`arcade-panel card ${stageMax ? 'maximized' : ''}`} aria-label="Palco do desafio">
          {stageMax && (
            <button className="arcade-stop" onClick={() => (playing ? stop() : void start())} aria-label={playing ? 'Parar o desafio' : 'Começar o desafio'}>
              <Icon name={playing ? 'stop' : 'play'} size={14} /> {playing ? 'Parar' : 'Começar'}
            </button>
          )}
          <button className="arcade-max" onClick={toggleStageMax} aria-pressed={stageMax} aria-label={stageMax ? 'Sair da tela cheia' : 'Maximizar o palco'} title={stageMax ? 'Sair da tela cheia (Esc)' : 'Palco em tela cheia'}>
            <span aria-hidden="true">{stageMax ? '⤡' : '⤢'}</span> {stageMax ? 'Sair da tela cheia' : 'Tela cheia'}
          </button>
          <ArcadeStageCanvas feed={feed} lanes={tuning.strings.length} stringNames={tuning.strings.map((m) => pcName(m, false))} goal={STAGE_GOAL} />
          <p className="arcade-legend muted small">
            {s.inputMode === 'keys' ? (
              <>
                Segure a casa (<kbd>1</kbd>…<kbd>{tuning.strings.length}</kbd>, corda grave = 1) e palhete com <kbd>Enter</kbd> ou <kbd>Espaço</kbd>. Gema de miolo branco é ligado: vale só com a casa.
              </>
            ) : s.inputMode === 'midi' ? (
              'Toque as notas no instrumento MIDI. Segure as notas com cauda até o fim.'
            ) : (
              `Toque ${instrument === 'guitar' ? 'na guitarra' : instrument === 'acoustic' ? 'no violão' : 'no baixo'} quando a gema chegar à linha. Gema de miolo branco é ligado (sem novo ataque); deixe soar as notas com cauda.`
            )}
          </p>
        </aside>
      )}
      </div>
      )}
      {result && (
        <ChallengeResultsModal
          result={result}
          onClose={() => setResult(null)}
          xp={lastXp}
          onRetry={() => (setResult(null), setRestart(true))}
          onFaster={() => {
            setResult(null);
            setS((x) => ({ ...x, bpm: Math.min(300, result.bpm + 5) }));
            setRestart(true);
          }}
        />
      )}
    </section>
  );
}

/** Resumo do recorde em uma linha. */
function recordLine(rec: RoutineRecord): string {
  const best = rec.bestPct !== undefined ? `Melhor: ${rec.bestPct}% a ${rec.bestPctBpm} BPM.` : rec.maxBpm ? `Até ${rec.maxBpm} BPM (sem desafio).` : '';
  return `${best} ${rec.sessions} ${rec.sessions === 1 ? 'treino' : 'treinos'}${rec.last ? `, o último em ${fmtDate(rec.last)}` : ''}.`.trim();
}

/** Biblioteca de rotinas: filtros por nível e tema, cartões com objetivo, meta e recorde. */
function RoutineLibrary({
  level,
  topic,
  records,
  current,
  onFilter,
  onOpen,
  scale,
  onScale,
  keyChoice,
  onKey,
}: {
  keyChoice: number | 'orig';
  onKey(key: number | 'orig'): void;
  scale: string;
  onScale(scale: string): void;
  level: RoutineLevel | 'all';
  topic: RoutineTopic | 'all';
  records: Record<string, RoutineRecord>;
  current: string | null;
  onFilter(level: RoutineLevel | 'all', topic: RoutineTopic | 'all'): void;
  onOpen(r: Routine): void;
}) {
  const ROUTINES = ALL_ROUTINES;
  const scales = [...new Set(ROUTINES.flatMap((r) => (r.trail ? [r.trail.scale] : [])))];
  const list = ROUTINES.filter((r) => (level === 'all' || r.level === level) && (topic === 'all' || r.topic === topic) && (scale === 'all' || r.trail?.scale === scale));
  const mastered = ROUTINES.filter((r) => routineMastered(r, records[r.id])).length;
  const practiced = ROUTINES.filter((r) => records[r.id]).length;
  return (
    <div className="routines">
      <div className="routine-filters">
        <nav className="coll-bar" aria-label="Nível">
          {(['all', ...ROUTINE_LEVELS] as const).map((l) => (
            <button key={l} className={`coll-chip ${level === l ? 'on' : ''}`} aria-pressed={level === l} onClick={() => onFilter(l, topic)}>
              {l === 'all' ? 'Todos os níveis' : l}
              <span className="coll-n">{l === 'all' ? ROUTINES.length : ROUTINES.filter((r) => r.level === l).length}</span>
            </button>
          ))}
        </nav>
        <div className="spacer" />
        <label className="lib-select">
          <span>Tema</span>
          <select value={topic} onChange={(e) => onFilter(level, e.target.value as RoutineTopic | 'all')}>
            <option value="all">Todos</option>
            {ROUTINE_TOPICS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="lib-select">
          <span>Escala</span>
          <select value={scale} onChange={(e) => onScale(e.target.value)}>
            <option value="all">Todas</option>
            {scales.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
        <label className="lib-select">
          <span>Tom</span>
          <select value={String(keyChoice)} onChange={(e) => onKey(e.target.value === 'orig' ? 'orig' : Number(e.target.value))} title="Tom em que as rotinas abrem">
            <option value="orig">O de cada rotina</option>
            {ROOTS.map((r) => (
              <option key={r} value={r}>
                {pcName(r, keyUsesFlats({ tonic: r, mode: 'major' }))}
              </option>
            ))}
          </select>
        </label>
        <span className="muted small">
          {practiced} de {ROUTINES.length} praticadas · {mastered} dominadas
        </span>
      </div>
      {list.length === 0 ? (
        <p className="muted">Nenhuma rotina com este nível e tema.</p>
      ) : (
        <div className="routine-grid">
          {list.map((r) => {
            const rec = records[r.id];
            const done = routineMastered(r, rec);
            const lvl = r.level === 'Iniciante' ? 1 : r.level === 'Intermediário' ? 2 : 3;
            return (
              <article key={r.id} className={`routine-card card ${r.id === current ? 'current' : ''}`}>
                <header className="routine-head">
                  <span className={`lvl-badge lvl-${lvl}`}>{r.level}</span>
                  <span className="muted small">{r.trail ? `Trilha · etapa ${r.trail.step} de ${r.trail.of}` : r.topic}</span>
                  <div className="spacer" />
                  {done && (
                    <span className="done-badge" title="Meta de andamento alcançada com 90% de acerto">
                      <Icon name="check" size={12} /> Dominada
                    </span>
                  )}
                </header>
                <h3>
                  {r.title} <span className="muted">em {pcName(keyChoice === 'orig' ? r.settings.root : keyChoice, keyUsesFlats({ tonic: keyChoice === 'orig' ? r.settings.root : keyChoice, mode: 'major' }))}</span>
                </h3>
                <p className="muted small">{r.goal}</p>
                <p className="routine-meta small">
                  Começa em <b>{r.settings.bpm}</b> BPM · meta <b>{r.targetBpm}</b> BPM{r.settings.ramp ? ' · acelera sozinho' : ''}
                </p>
                <p className="routine-rec small">{rec ? recordLine(rec) : <span className="muted">Ainda não praticada.</span>}</p>
                <button className="primary small-btn" onClick={() => onOpen(r)}>
                  <Icon name="play" size={13} /> Praticar
                </button>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
