import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { errorText } from '../lib/errors.js';
import {
  BASS_TUNINGS,
  CIRCLE,
  analyzeMap,
  chordSymbol,
  circleSlotOf,
  harmonicField,
  positionsOf,
  semitonesBetween,
  type ChordInsight,
  type HarmonicMapData,
  type Ring,
  buildAccompaniment,
  cleanBassLine,
  BASS_PATTERNS,
  BASS_REGIONS,
  type BassPattern,
  type BassRegion,
  barAt,
  beatInBar,
  chordAt,
  chordDegree,
  chordName,
  barEnergy,
  detectSections,
  encodeWav,
  fingerZones,
  guitarVoicing,
  simplifyChord,
  type Chord,
  type ChordLevel,
  type GuitarMode,
  normalizeSections,
  sectionLetters,
  nameByForm,
  pcName,
  sectionSpans,
  songMapText,
  splitHands,
  voiceChords,
  SECTION_NAMES,
  type Section,
  type SongMap,
  keyName,
  keyNameSolfege,
  keyUsesFlats,
  readMidi,
  transposeChord,
  transposeKey,
  type Key,
  type MidiNote,
} from '@domain';
import type { SeparateOptions, SongAnalysis, LibrarySong } from '../../preload/preload.js';
import type { SongJob } from '../App.js';
import { cleanName } from '../App.js';
import { Icon } from '../components/Icons.js';
import { Progress } from '../components/Progress.js';
import { StemPicker } from '../components/StemPicker.js';
import { Knob } from '../components/Knob.js';
import { Waveform } from '../components/Waveform.js';
import { BassNeck, type NeckNote } from '../components/BassNeck.js';
import { PianoKeys, keyboardRange, type KeyMark } from '../components/PianoKeys.js';
import { GuitarChord } from '../components/GuitarChord.js';
import { CircleOfFifthsWheel } from '../components/CircleOfFifthsWheel.js';
import { VoiceLeadingInspector } from '../components/VoiceLeadingInspector.js';
import type { MapDensity, MapView } from '../components/HarmonicGrid.js';
import { playChord as playHarmonyChord } from '../lib/harmonyAudioEngine.js';
import { harmonicStore } from '../lib/harmonicSyncStore.js';
import { decodeAudio, getAudioContext, playAligned, setMasterGain, startMetronome, type AlignedHandle, type MetronomeHandle } from '../lib/audio.js';
import { MIDI_STEMS, matchPreset, presetsFor, sortStems, stemInfo } from '../lib/stems.js';
import { readStore, writeStore } from '../lib/store.js';

/**
 * Página da música: player com as faixas separadas ocupando toda a área, régua de compassos com
 * acordes, transposição em meios tons, metrônomo alinhado aos tempos detectados e, durante a
 * reprodução, um painel inferior com o compasso atual e as notas do baixo no braço.
 */
interface Props {
  songId: string;
  name: string;
  job: SongJob | undefined;
  onSeparate(options: SeparateOptions): void;
  /** Refaz a análise; `tempo` força o modo do andamento (senão mantém o anterior). */
  onAnalyze(tempo?: 'auto' | 'fixed'): void;
  onRemoved(): void;
  /** Linha do baixo enviada para os Exercícios (abre a tela de exercícios). */
  onStudyExercise?(): void;
}

interface Lane {
  readonly key: string;
  readonly buffer: AudioBuffer;
}
interface LaneMix {
  on: boolean;
  solo: boolean;
  vol: number;
  /** −1 esquerda … +1 direita. */
  pan?: number;
  /** Entra na exportação da mixagem (padrão: sim). */
  exp?: boolean;
}

const HEADER_W = 252;
/** Braço do violão/guitarra para estudar uma faixa (6 cordas, Mi Lá Ré Sol Si Mi). */
const GUITAR_STUDY_TUNING = { id: 'g6', label: 'Violão (E A D G B E)', strings: [40, 45, 50, 55, 59, 64], frets: 19 } as const;
/** Estado de uma faixa sem ajuste salvo. */
const DEFAULT_MIX: LaneMix = { on: true, solo: false, vol: 0.8 };

/** Preferências das guias harmônicas visuais (não geram uma faixa de áudio). */
interface AccompSettings {
  /** Linha harmônica mostrada no braço do baixo. */
  bass: { pattern: BassPattern; region: BassRegion };
  /** Região usada para escolher a forma do acorde no braço do violão. */
  guitar: { region: number };
}
const DEFAULT_ACCOMP: AccompSettings = {
  bass: { pattern: 'root-fifth', region: 'auto' },
  guitar: { region: 5 },
};
/** Regiões do violão: casa perto da qual ficam as formas móveis (CAGED). */
const GUITAR_REGIONS: ReadonlyArray<{ id: number; label: string }> = [
  { id: 3, label: 'Casas 1–5' },
  { id: 5, label: 'Casas 3–8' },
  { id: 7, label: 'Casas 5–10' },
  { id: 9, label: 'Casas 7–12' },
];
/** Abaixo disso a faixa fica compacta (knobs menores, sem legenda); abaixo de TINY_LANE_H, uma linha só. */
const FULL_LANE_H = 58;
const TINY_LANE_H = 40;
const TRACK_H = 62;
const RULER_H = 62;
const METRO_H = 44;
const MIN_PPS = 4;
const MAX_PPS = 400;

/** Ganho em dB (0,8 → −1,9 dB); 0 = mudo. */
function fmtGain(v: number): string {
  if (v <= 0.001) return '−∞ dB';
  const db = 20 * Math.log10(v);
  return `${db >= 0 ? '+' : '−'}${Math.abs(db).toFixed(1).replace('.', ',')} dB`;
}
function fmtPan(v: number): string {
  if (Math.abs(v) < 0.02) return 'Centro';
  return `${Math.round(Math.abs(v) * 100)}% ${v < 0 ? 'esquerda' : 'direita'}`;
}

/** Primeiro instante da lista depois de t (busca binária); Infinity se não houver. */
function nextEventAfter(ev: Float64Array, t: number): number {
  let lo = 0;
  let hi = ev.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ev[mid]! <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo < ev.length ? ev[lo]! : Infinity;
}

function fmt(sec: number): string {
  const s = Math.max(0, sec);
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function Song({ songId, name, job, onSeparate, onAnalyze, onRemoved, onStudyExercise }: Props) {
  const [rec, setRec] = useState<LibrarySong | null>(null);
  const [analysis, setAnalysis] = useState<SongAnalysis | null>(null);
  const [lanes, setLanes] = useState<Lane[] | null>(null);
  const [semis, setSemis] = useState(0);
  /** Velocidade do player em % (100 = original): tudo mais lento, sem mudar o tom. */
  const [speed, setSpeed] = useState(100);
  /** Velocidade das faixas carregadas agora (o relógio usa esta, não a pedida). */
  const [laneRate, setLaneRate] = useState(1);
  const [transposing, setTransposing] = useState<{ target: number; percent: number } | null>(null);
  const [mix, setMix] = useState<Record<string, LaneMix>>(() => readStore(`bf-mix-${songId}`, {}));
  const [metro, setMetro] = useState(() => readStore('bf-metro', { on: false, vol: 0.6 }));
  const [accomp, setAccomp] = useState<AccompSettings>(() => {
    const a = readStore<{ bass?: Partial<AccompSettings['bass']>; guitar?: Partial<AccompSettings['guitar']> }>('bf-accomp', {});
    return {
      bass: {
        pattern: a.bass?.pattern ?? DEFAULT_ACCOMP.bass.pattern,
        region: a.bass?.region ?? DEFAULT_ACCOMP.bass.region,
      },
      guitar: { region: a.guitar?.region ?? DEFAULT_ACCOMP.guitar.region },
    };
  });
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [loop, setLoop] = useState<{ from: number; to: number } | null>(null);
  const [pps, setPps] = useState<number | null>(null);
  const [picker, setPicker] = useState(false);
  const [cpu, setCpu] = useState(false);
  const [voiceSplit, setVoiceSplit] = useState(false);
  const [bassRaw, setBassNotes] = useState<MidiNote[] | null>(null);
  const [bassState, setBassState] = useState<{ percent: number } | 'error' | null>(null);
  const [pianoNotes, setPianoNotes] = useState<MidiNote[] | null>(null);
  const [pianoState, setPianoState] = useState<{ percent: number } | 'error' | null>(null);
  const [dockInst, setDockInst] = useState<'bass' | 'piano' | 'guitar'>(() => readStore('bf-dock', { i: 'bass' as 'bass' | 'piano' | 'guitar' }).i);
  // Nível dos acordes (simples = tríades e 7; completo = qualidades da análise) e formas do violão (normal ou CAGED).
  const [chordLevel, setChordLevel] = useState<ChordLevel>(() => readStore('bf-chord-level', { v: 'full' as ChordLevel }).v);
  const [guitarMode, setGuitarMode] = useState<GuitarMode>(() => readStore('bf-guitar-mode-2', { v: 'caged' as GuitarMode }).v);
  // Painel de acordes: embaixo da linha do tempo ou à direita, na vertical (economiza altura).
  const [dockSide, setDockSide] = useState<boolean>(() => readStore('bf-dock-side', { v: false }).v);
  const [strings, setStrings] = useState<number>(() => readStore('bf-strings', { n: 4 }).n);
  // Volume geral: afeta todo o áudio do player e a mixagem exportada.
  const [masterVol, setMasterVol] = useState<number>(() => readStore('bf-master', { v: 1 }).v);
  useEffect(() => setMasterGain(masterVol), [masterVol]);
  useEffect(() => writeStore('bf-master', { v: masterVol }), [masterVol]);
  const [neckLabel, setNeckLabel] = useState<'note' | 'fret' | 'finger'>(() => readStore('bf-neck-label', { v: 'finger' as 'note' | 'fret' | 'finger' }).v);
  /** Piano: guiado pela harmonia (padrão) ou pelo que a faixa de piano toca (gravação). */
  /** Baixo no painel: a linha da gravação (transcrita) ou a linha-guia gerada pela harmonia. */
  const [bassMode, setBassMode] = useState<'rec' | 'acomp'>(() => readStore('bf-bass-mode', { v: 'rec' as 'rec' | 'acomp' }).v);
  useEffect(() => writeStore('bf-bass-mode', { v: bassMode }), [bassMode]);
  const [guidePanel, setGuidePanel] = useState(false);
  const [pianoMode, setPianoMode] = useState<'harmony' | 'rec'>(() => readStore('bf-piano-mode', { v: 'harmony' as 'harmony' | 'rec' }).v);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const aligned = useRef<AlignedHandle | null>(null);
  const metroH = useRef<MetronomeHandle | null>(null);
  const clock = useRef({ startedAt: 0, from: 0, rate: 1 });
  const scroller = useRef<HTMLDivElement | null>(null);
  const lanesBox = useRef<HTMLDivElement | null>(null);
  const loadSeq = useRef(0);
  const recRef = useRef<LibrarySong | null>(null);
  recRef.current = rec;
  const startApplied = useRef(false);

  const separated = !!rec?.stems && rec.stems.length > 0;
  const busy = job?.state === 'queued' || job?.state === 'separating' || job?.state === 'analyzing';
  // Duração em tempo da MÚSICA (as faixas mais lentas são mais longas no relógio).
  const duration = lanes ? Math.max(...lanes.map((l) => l.buffer.duration)) * laneRate : (analysis?.duration ?? 0);
  const tuning = BASS_TUNINGS.find((t) => t.strings.length === strings) ?? BASS_TUNINGS[0]!;

  useEffect(() => writeStore(`bf-mix-${songId}`, mix), [mix, songId]);
  useEffect(() => writeStore('bf-metro', metro), [metro]);
  useEffect(() => writeStore('bf-accomp', accomp), [accomp]);
  useEffect(() => writeStore('bf-strings', { n: strings }), [strings]);
  useEffect(() => {
    void window.baixaria.stemsAvailable().then((r) => {
      setCpu(r.runtime === 'cpu');
      setVoiceSplit(!!r.voiceSplit);
    });
  }, []);

  // Registro da música (faixas) e análise; relê quando um trabalho termina.
  const jobState = job?.state;
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await window.baixaria.libraryList();
      if (cancelled) return;
      const r = list.find((s) => s.id === songId) ?? null;
      setRec(r);
      if (r?.stems?.length) {
        const a = await window.baixaria.libraryReadAnalysis(songId);
        if (cancelled) return;
        setAnalysis(a);
        if (!a && !jobState) onAnalyze();
      }
    })().catch((e: unknown) => setError(errorText(e, 'falha ao abrir a música')));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songId, jobState]);

  // Faixas no tom escolhido (decodificadas; só uma versão de tom fica em memória).
  const stemKey = rec?.stems?.join(',') ?? '';
  useEffect(() => {
    if (!stemKey) {
      setLanes(null);
      return;
    }
    const seq = ++loadSeq.current;
    void (async () => {
      const out: Lane[] = [];
      for (const k of sortStems(stemKey.split(','))) {
        const bytes = await window.baixaria.libraryReadStem(songId, k, semis, speed);
        out.push({ key: k, buffer: await decodeAudio(bytes) });
        if (seq !== loadSeq.current) return;
      }
      if (seq !== loadSeq.current) return;
      setLaneRate(speed / 100);
      setLanes(out);
      // Estado inicial salvo na música (ex.: baixo mudo para tocar junto) vale ao abrir o player.
      const start = startApplied.current ? undefined : recRef.current?.startMix;
      startApplied.current = true;
      setMix((m) => {
        const next = { ...m };
        for (const l of out) {
          next[l.key] ??= DEFAULT_MIX;
          if (start && start[l.key] !== undefined) next[l.key] = { ...next[l.key]!, on: start[l.key]!, solo: false };
        }
        return next;
      });
    })().catch((e: unknown) => setError(errorText(e, 'falha ao carregar as faixas')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songId, stemKey, semis, speed]);

  // Estudar uma faixa: as notas dela (Basic Pitch) no braço do baixo, no teclado ou no braço do violão.
  const [studyStem, setStudyStem] = useState<string | null>(null);
  const studyable = (rec?.stems ?? []).filter((k) => MIDI_STEMS.has(k));
  // Linha do baixo limpa (fantasmas, notas partidas, oitava errada, encaixe na grade): tablatura, braço e exercício.
  // Faixas de outros instrumentos (podem ter acordes) ficam como vieram.
  const bassNotes = useMemo(() => (bassRaw && !studyStem && analysis ? cleanBassLine(bassRaw, analysis.beats) : bassRaw), [bassRaw, studyStem, analysis]);
  // Notas do baixo (MIDI pelo Basic Pitch, em cache): alimentam o braço do painel inferior.
  const hasBass = !!rec?.stems?.includes('bass');
  const lineStem = studyStem ?? 'bass';
  useEffect(() => {
    if (!hasBass && !studyStem) {
      setBassNotes(null);
      return;
    }
    let cancelled = false;
    setBassState({ percent: 0 });
    const off = window.baixaria.onSongProgress((p) => {
      if (p.songId === songId && p.task === `midi:${lineStem}` && !cancelled) setBassState({ percent: p.percent });
    });
    setBassNotes(null);
    void window.baixaria
      .stemsMidi(songId, lineStem, semis)
      .then((bytes) => {
        if (cancelled) return;
        setBassNotes(readMidi(bytes));
        setBassState(null);
      })
      .catch(() => !cancelled && setBassState('error'));
    return () => {
      cancelled = true;
      off();
    };
  }, [songId, hasBass, semis, lineStem, studyStem]);

  // Notas do piano: só são extraídas quando o painel mostra o teclado (o Basic Pitch leva um tempo).
  const hasPiano = !!rec?.stems?.includes('piano');
  const canPiano = !!analysis;
  const inst: 'bass' | 'piano' | 'guitar' = dockInst === 'guitar' && canPiano ? 'guitar' : canPiano && (dockInst === 'piano' || !hasBass) ? 'piano' : 'bass';
  const pianoRec = !!studyStem || (hasPiano && pianoMode === 'rec');
  useEffect(() => writeStore('bf-dock', { i: dockInst }), [dockInst]);
  useEffect(() => writeStore('bf-piano-mode', { v: pianoMode }), [pianoMode]);
  useEffect(() => writeStore('bf-neck-label', { v: neckLabel }), [neckLabel]);
  useEffect(() => writeStore('bf-chord-level', { v: chordLevel }), [chordLevel]);
  useEffect(() => writeStore('bf-guitar-mode-2', { v: guitarMode }), [guitarMode]);
  useEffect(() => writeStore('bf-dock-side', { v: dockSide }), [dockSide]);
  useEffect(() => {
    setPianoNotes(null);
    if ((!hasPiano && !studyStem) || inst !== 'piano' || !pianoRec) return;
    const pianoStem = studyStem ?? 'piano';
    let cancelled = false;
    setPianoState({ percent: 0 });
    const off = window.baixaria.onSongProgress((p) => {
      if (p.songId === songId && p.task === `midi:${pianoStem}` && !cancelled) setPianoState({ percent: p.percent });
    });
    void window.baixaria
      .stemsMidi(songId, pianoStem, semis)
      .then((bytes) => {
        if (cancelled) return;
        setPianoNotes(readMidi(bytes));
        setPianoState(null);
      })
      .catch(() => !cancelled && setPianoState('error'));
    return () => {
      cancelled = true;
      off();
    };
  }, [songId, hasPiano, inst, pianoRec, semis, studyStem]);

  // Progresso da transposição.
  useEffect(
    () =>
      window.baixaria.onSongProgress((p) => {
        if (p.songId === songId && p.task === 'transpose') setTransposing((t) => (t ? { ...t, percent: p.percent } : t));
      }),
    [songId],
  );

  /* ------------------------------ reprodução ------------------------------ */
  const anySolo = Object.values(mix).some((m) => m.solo);
  const gainOf = useCallback(
    (key: string, m = mix) => {
      const x = m[key] ?? DEFAULT_MIX;
      const solo = Object.values(m).some((v) => v.solo);
      return x.on && (!solo || x.solo) ? x.vol : 0;
    },
    [mix],
  );

  async function saveStartMix() {
    if (!lanes) return;
    const start = Object.fromEntries(lanes.map((l) => [l.key, mix[l.key]?.on ?? true]));
    try {
      await window.baixaria.librarySetStartMix(songId, start);
      setRec((r) => (r ? { ...r, startMix: start } : r));
      setMessage('Estado das faixas salvo: a música abre assim.');
    } catch (e) {
      setError(errorText(e, 'falha ao salvar'));
    }
  }

  function stopAll() {
    aligned.current?.stop();
    aligned.current = null;
    metroH.current?.stop();
    metroH.current = null;
  }

  async function play(from = pos) {
    if (!lanes) return;
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') await ctx.resume();
    stopAll();
    const at = ctx.currentTime + 0.06;
    const start = Math.max(0, Math.min(from, duration - 0.05));
    aligned.current = playAligned(
      lanes.map((l) => ({ buffer: l.buffer, gain: gainOf(l.key), pan: mix[l.key]?.pan ?? 0, offset: start / laneRate })),
      at,
    );
    if (analysis) {
      metroH.current = startMetronome(analysis.beats, analysis.firstDownbeat, at, start, metro.on ? metro.vol : 0, laneRate);
    }
    clock.current = { startedAt: at, from: start, rate: laneRate };
    setPos(start);
    setPlaying(true);
  }

  function pause() {
    const ctx = getAudioContext();
    const p = clock.current.from + (ctx.currentTime - clock.current.startedAt) * clock.current.rate;
    stopAll();
    setPlaying(false);
    setPos(Math.max(0, Math.min(duration, p)));
  }

  /** Toca uma parte do mapa em loop (do primeiro ao último compasso dela). */
  function loopPart(from: number, to: number) {
    if (!analysis) return;
    const l = { from, to };
    loopRef.current = l;
    setLoop(l);
    void play(analysis.bars[from]?.start ?? 0);
  }
  const loopPartRef = useRef(loopPart);
  loopPartRef.current = loopPart;
  const stableLoopPart = useCallback((from: number, to: number) => loopPartRef.current(from, to), []);

  function seek(t: number) {
    const x = Math.max(0, Math.min(duration, t));
    if (playing) void play(x);
    else setPos(x);
  }

  // Referência estável para filhos memorizados (a régua não redesenha a cada quadro).
  const seekRef = useRef(seek);
  seekRef.current = seek;
  const stableSeek = useCallback((t: number) => seekRef.current(t), []);

  useEffect(() => () => stopAll(), []);

  // Instantes em que a tela muda (tempos e notas do baixo), em ordem: preenchidos mais abaixo.
  const events = useRef<Float64Array>(new Float64Array(0));
  const playheadRef = useRef<HTMLDivElement | null>(null);
  const pxRef = useRef(20);

  // Relógio da tela: posição, loop e fim da música.
  const loopRef = useRef(loop);
  loopRef.current = loop;
  useEffect(() => {
    if (!playing) return;
    const ctx = getAudioContext();
    let raf = 0;
    let lastCtx = ctx.currentTime;
    let lastMove = performance.now();
    let stallWarned = false;
    let lastRender = 0;
    let lastP = -1;
    let nextEvent = -1;
    const tick = () => {
      const p = clock.current.from + (ctx.currentTime - clock.current.startedAt) * clock.current.rate;
      // Relógio parado: o dispositivo de saída não está processando áudio.
      if (ctx.currentTime !== lastCtx) {
        lastCtx = ctx.currentTime;
        lastMove = performance.now();
      } else if (performance.now() - lastMove > 1500 && !stallWarned) {
        stallWarned = true;
        setError('O som não está saindo: o dispositivo de saída de áudio não responde. Confira a saída de som do Windows (fone, caixa ou UM2) e toque de novo.');
      }
      const lp = loopRef.current;
      if (lp && analysis) {
        const end = analysis.bars[lp.to]?.end ?? duration;
        if (p >= end) {
          void play(analysis.bars[lp.from]?.start ?? 0);
          return;
        }
      }
      if (p >= duration) {
        stopAll();
        setPlaying(false);
        setPos(0);
        return;
      }
      // Cursor: direto no DOM a cada quadro. O React só redesenha quando algo musical muda
      // (tempo do compasso, início ou fim de nota do baixo) ou a cada 250 ms (relógio).
      const ph = playheadRef.current;
      if (ph) ph.style.transform = `translateX(${HEADER_W + p * pxRef.current}px)`;
      const now = performance.now();
      if (p >= nextEvent || p < lastP || now - lastRender > 250) {
        lastRender = now;
        nextEvent = nextEventAfter(events.current, p);
        setPos(p);
      }
      lastP = p;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, duration, analysis]);

  // Ganhos ao vivo.
  useEffect(() => {
    if (!lanes) return;
    lanes.forEach((l, i) => {
      aligned.current?.setGain(i, gainOf(l.key));
      aligned.current?.setPan(i, mix[l.key]?.pan ?? 0);
    });
  }, [mix, lanes, gainOf]);
  useEffect(() => {
    metroH.current?.setGain(metro.on ? metro.vol : 0);
  }, [metro]);

  // Pedido de tom feito enquanto outro ainda gera: vale o último (aplicado ao terminar).
  const pendingSemis = useRef<number | null>(null);
  // Tom pedido mais recente (inclusive o da fila): base dos passos + e −, para cliques seguidos não se perderem.
  const desiredSemis = useRef(semis);
  if (!transposing && pendingSemis.current === null) desiredSemis.current = semis;
  function stepSemis(delta: number) {
    void changeSemis(Math.max(-6, Math.min(6, desiredSemis.current + delta)));
  }
  // Troca de tom: gera as faixas transpostas (cache) e continua tocando do mesmo ponto.
  async function changeSemis(target: number) {
    if (target < -6 || target > 6) return;
    desiredSemis.current = target;
    if (transposing) {
      pendingSemis.current = target;
      return;
    }
    if (target === semis) return;
    setError(null);
    const wasPlaying = playing;
    const at = playing ? clock.current.from + (getAudioContext().currentTime - clock.current.startedAt) * clock.current.rate : pos;
    try {
      if (target !== 0 || speed !== 100) {
        setTransposing({ target, percent: 0 });
        await window.baixaria.stemsTranspose(songId, target, speed);
      }
      if (wasPlaying) pause();
      setLanes(null);
      setSemis(target);
      if (wasPlaying) resumeAt.current = at;
      else setPos(at);
    } catch (e) {
      setError(errorText(e, 'falha na transposição'));
    } finally {
      setTransposing(null);
      const next = pendingSemis.current;
      pendingSemis.current = null;
      if (next !== null && next !== target) void changeSemis(next);
    }
  }
  /** Velocidade: gera as faixas mais lentas (Rubber Band, sem mudar o tom; ficam em cache) e segue do mesmo ponto. */
  const [slowing, setSlowing] = useState<number | null>(null);
  async function changeSpeed(target: number) {
    if (target === speed || slowing !== null || transposing) return;
    setError(null);
    const wasPlaying = playing;
    const at = playing ? clock.current.from + (getAudioContext().currentTime - clock.current.startedAt) * clock.current.rate : pos;
    try {
      if (target !== 100 || semis !== 0) {
        setSlowing(target);
        await window.baixaria.stemsTranspose(songId, semis, target);
      }
      if (wasPlaying) pause();
      setLanes(null);
      setSpeed(target);
      if (wasPlaying) resumeAt.current = at;
      else setPos(at);
    } catch (e) {
      setError(errorText(e, 'falha ao mudar a velocidade'));
    } finally {
      setSlowing(null);
    }
  }
  const resumeAt = useRef<number | null>(null);
  useEffect(() => {
    if (lanes && resumeAt.current !== null) {
      const t = resumeAt.current;
      resumeAt.current = null;
      void play(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lanes]);

  /* ------------------------------ zoom e rolagem ------------------------------ */
  const laneH = TRACK_H;
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      // Zoom inicial: a música inteira cabe na largura.
      setPps((p) => p ?? (duration > 0 ? Math.max(MIN_PPS, (el.clientWidth - HEADER_W - 8) / duration) : null));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [duration]);
  const pxPerSec = pps ?? 20;
  pxRef.current = pxPerSec;
  const density = laneH >= FULL_LANE_H ? '' : laneH >= TINY_LANE_H ? 'compact' : 'tiny';
  const knobSize = density ? 22 : 30;

  const zoom = useCallback(
    (factor: number) => {
      setPps((p) => Math.max(MIN_PPS, Math.min(MAX_PPS, (p ?? 20) * factor)));
    },
    [],
  );
  const fit = () => {
    const el = scroller.current;
    if (el && duration > 0) setPps(Math.max(MIN_PPS, (el.clientWidth - HEADER_W - 8) / duration));
  };

  // Rolagem segue a reprodução.
  useEffect(() => {
    const el = scroller.current;
    if (!el || !playing) return;
    const x = HEADER_W + pos * pxPerSec;
    const view = el.clientWidth - HEADER_W;
    if (x < el.scrollLeft + HEADER_W || x > el.scrollLeft + HEADER_W + view * 0.85) el.scrollLeft = Math.max(0, x - HEADER_W - view * 0.15);
  }, [pos, pxPerSec, playing]);

  // Ctrl + roda = zoom.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoom(e.deltaY < 0 ? 1.25 : 0.8);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoom, lanes]);

  /* ------------------------------ harmonia no instante ------------------------------ */
  const songKey: Key | null = analysis ? transposeKey(analysis.key, semis) : null;
  const barIdx = analysis ? barAt(analysis.bars, pos) : -1;
  const bar = analysis && barIdx >= 0 ? analysis.bars[barIdx]! : null;
  const localKey: Key | null = bar ? transposeKey(bar.key, semis) : null;
  const current = bar ? chordAt(bar.chords, pos) : null;
  const curChord = current?.chord ? transposeChord(current.chord, semis) : null;
  const beat = analysis ? beatInBar(analysis.beats, analysis.firstDownbeat, pos).beat : -1;
  const flats = keyUsesFlats(localKey ?? songKey);

  // Próximo acorde diferente (para antecipar a troca).
  const nextChord = useMemo(() => {
    if (!analysis || barIdx < 0) return null;
    const curStart = current?.start ?? -1;
    for (let i = barIdx; i < Math.min(analysis.bars.length, barIdx + 8); i++) {
      for (const c of analysis.bars[i]!.chords) {
        if (c.start > curStart + 1e-3 && c.chord && (!current?.chord || c.chord.root !== current.chord.root || c.chord.quality !== current.chord.quality)) {
          return { chord: transposeChord(c.chord, semis), inSec: c.start - pos, bar: i };
        }
      }
    }
    return null;
  }, [analysis, barIdx, current, semis, pos]);

  /* ------------------------------ acordes corrigidos no mapa ------------------------------ */
  // Correções do músico por compasso (tom original): valem no mapa, na exportação e nas guias visuais.
  type BarEdit = Array<{ beat: number; beats: number; chord: Chord }>;
  const [chordEdits, setChordEdits] = useState<Record<number, BarEdit>>(() => readStore<Record<number, BarEdit>>(`bf-chord-edits-${songId}`, {}));
  useEffect(() => writeStore(`bf-chord-edits-${songId}`, chordEdits), [chordEdits, songId]);
  const effectiveBars = useMemo(() => {
    if (!analysis) return [];
    return analysis.bars.map((b) => {
      const e = chordEdits[b.index];
      if (!e) return b;
      const len = Math.max(0.1, b.end - b.start);
      return { ...b, chords: e.map((x) => ({ beat: x.beat, start: b.start + (x.beat / 4) * len, beats: x.beats, chord: x.chord })) };
    });
  }, [analysis, chordEdits]);

  // Linhas-guia visuais derivadas dos acordes da música, no tom e no nível escolhidos.
  const accompaniment = useMemo(() => {
    if (!analysis) return null;
    const chords = effectiveBars.flatMap((b) => b.chords.map((c) => ({ start: c.start, chord: c.chord ? simplifyChord(transposeChord(c.chord, semis), chordLevel) : null })));
    return buildAccompaniment(chords, analysis.beats, analysis.firstDownbeat, {
      bass: { pattern: accomp.bass.pattern, region: accomp.bass.region, tuning },
      guitar: { pattern: 'pop', mode: guitarMode, region: accomp.guitar.region },
      piano: { pattern: 'block' },
    });
  }, [analysis, effectiveBars, semis, chordLevel, accomp.bass.pattern, accomp.bass.region, accomp.guitar.region, guitarMode, tuning]);
  // A linha harmônica do baixo mantém continuidade entre compassos e digitação sem cordas soltas.
  const bassAcomp = bassMode === 'acomp' && !!accompaniment && !studyStem;
  // Faixa estudada no violão: braço de 6 cordas; no baixo, a afinação escolhida.
  const neckTuning = inst === 'guitar' && studyStem ? GUITAR_STUDY_TUNING : tuning;
  const accFingered = useMemo(
    () =>
      accompaniment
        ? accompaniment.part('bass').map((n) => ({ midi: n.midi, startSec: n.t, durSec: n.dur, velocity: 100, pos: n.pos ?? null, zone: n.zone ?? null, finger: n.finger ?? 0 }))
        : null,
    [accompaniment],
  );
  const recFingered = useMemo(() => {
    if (!bassNotes) return null;
    // Faixa de outro instrumento (voz, guitarra…): as notas vão para a oitava que cabe no braço.
    const lo = neckTuning.strings[0]!;
    const hi = neckTuning.strings[neckTuning.strings.length - 1]! + neckTuning.frets;
    const fit = (m: number) => {
      let x = m;
      while (x > hi) x -= 12;
      while (x < lo) x += 12;
      return x;
    };
    const notes = bassNotes.map((n) => ({ ...n, midi: fit(n.midi) }));
    const z = fingerZones(
      notes.map((n) => n.midi),
      neckTuning,
      notes.map((n) => n.startSec),
    );
    return notes.map((n, i) => ({ ...n, pos: z[i]?.pos ?? null, zone: z[i]?.zone ?? null, finger: undefined as number | undefined }));
  }, [bassNotes, neckTuning]);
  const fingered = bassAcomp ? accFingered : recFingered;

  /* ------------------------------ tablatura do baixo ------------------------------ */
  const [tabOpen, setTabOpen] = useState(false);
  const [tabSrc, setTabSrc] = useState<'rec' | 'acomp'>(() => readStore('bf-tab-src', { v: 'rec' as 'rec' | 'acomp' }).v);
  useEffect(() => writeStore('bf-tab-src', { v: tabSrc }), [tabSrc]);
  // Linha do baixo para a tablatura: a da gravação (transcrita) ou a guia harmônica.
  const tabLine = useMemo(() => {
    if (tabSrc === 'acomp' || !bassNotes) {
      return (accompaniment?.part('bass') ?? []).filter((n) => n.pos).map((n) => ({ t: n.t, dur: n.dur, midi: n.midi, pos: n.pos!, finger: n.finger ?? 1 }));
    }
    const lo = tuning.strings[0]!;
    const hi = tuning.strings[tuning.strings.length - 1]! + tuning.frets;
    const fit = (m: number) => {
      let x = m;
      while (x > hi) x -= 12;
      while (x < lo) x += 12;
      return x;
    };
    const ms = bassNotes.map((n) => fit(n.midi));
    const z = fingerZones(ms, tuning, bassNotes.map((n) => n.startSec));
    return bassNotes.flatMap((n, i) => (z[i] ? [{ t: n.startSec, dur: n.durSec, midi: ms[i]!, pos: z[i]!.pos, finger: z[i]!.pos.fret === 0 ? 0 : z[i]!.pos.fret - z[i]!.zone + 1 }] : []));
  }, [tabSrc, bassNotes, accompaniment, tuning]);
  const tabSrcLabel = tabSrc === 'acomp' || !bassNotes ? `Linha harmônica (${(BASS_PATTERNS.find((x) => x.id === accomp.bass.pattern)?.label ?? '').toLowerCase()})` : studyStem ? `Faixa ${stemInfo(studyStem).label.toLowerCase()} (transcrita)` : 'Baixo da gravação (transcrito)';
  const tabStrings = tuning.strings.map((m) => pcName(m % 12, false));
  /** Notas da tablatura dentro de um compasso: corda, casa e posição (0–1). */
  const tabInBar = (b: { start: number; end: number }) =>
    tabLine
      .filter((n) => n.t >= b.start - 0.02 && n.t < b.end - 0.02)
      .slice(0, 24)
      .map((n) => ({ s: n.pos.string, f: n.pos.fret, x: Math.max(0, Math.min(1, (n.t - b.start) / Math.max(0.1, b.end - b.start))), t: n.t, end: n.t + Math.max(0.08, n.dur) }));

  /** Envia a linha do baixo, compasso a compasso com a harmonia, para os Exercícios. */
  function studyAsExercise() {
    if (!analysis) return;
    const bars = analysis.bars.map((b) => {
      const local = transposeKey(b.key, semis);
      const names = b.chords.map((c) => (c.chord ? chordName(transposeChord(c.chord, semis), local) : '—'));
      const len = Math.max(0.1, b.end - b.start);
      return {
        chords: names.filter((x, k) => k === 0 || x !== names[k - 1]),
        notes: tabLine.filter((n) => n.t >= b.start - 0.02 && n.t < b.end - 0.02).map((n) => ({ midi: n.midi, beat: Math.max(0, ((n.t - b.start) / len) * 4), len: Math.max(0.25, Math.min(4, (n.dur / len) * 4)) })),
      };
    });
    const sec = spans.map((sp) => ({ name: sp.name, from: sp.from, to: sp.to }));
    writeStore('bf-song-exercise', { title: cleanName(name), source: tabSrcLabel, key: songKey ? keyName(songKey) : '', bpm: Math.round(analysis.bpm), bars, sections: sec });
    writeStore('bf-ex-view', { ...readStore<Record<string, unknown>>('bf-ex-view', {}), tab: 'song' });
    stopAll();
    setPlaying(false);
    onStudyExercise?.();
  }
  // Instantes em que a tela muda (tempos e notas do baixo), em ordem.
  useEffect(() => {
    const t: number[] = [...(analysis?.beats ?? [])];
    const line = inst === 'piano' ? (pianoRec ? pianoNotes : null) : inst === 'bass' || studyStem ? (bassAcomp ? accFingered : bassNotes) : null;
    for (const n of line ?? []) t.push(n.startSec, n.startSec + n.durSec);
    // Tablatura aberta: começo e fim de cada nota dela, para a nota marcada trocar na hora.
    if (tabOpen) for (const n of tabLine) t.push(n.t, n.t + Math.max(0.08, n.dur));
    events.current = Float64Array.from(t).sort();
  }, [analysis, bassNotes, pianoNotes, inst, pianoRec, bassAcomp, accFingered, studyStem, tabOpen, tabLine]);

  const neckNotes: NeckNote[] = useMemo(() => {
    if (!fingered || !bar) return [];
    const inBar = fingered.filter((n) => n.pos && n.startSec >= bar.start - 0.03 && n.startSec < bar.end - 0.03);
    const nowIdx = inBar.findIndex((n) => pos >= n.startSec && pos < n.startSec + n.durSec);
    const nextIdx = inBar.findIndex((n) => n.startSec > pos);
    return inBar.map((n, i) => ({
      pos: n.pos!,
      midi: n.midi,
      finger: n.finger ?? (n.pos!.fret === 0 || n.zone === null ? 0 : n.pos!.fret - n.zone + 1),
      state: i === nowIdx ? 'now' : i === nextIdx ? 'next' : n.startSec + n.durSec <= pos ? 'done' : 'later',
    }));
  }, [fingered, bar, pos]);

  // Piano: extensão fixa para a música toda; no compasso, as teclas tocando agora, as do próximo ataque e as demais.
  // Harmonia: todos os acordes da música em ordem, com os voicings encadeados (condução de vozes).
  const chordTrack = useMemo(() => {
    if (!analysis) return [];
    const flat = analysis.bars.flatMap((b) =>
      b.chords.filter((c) => c.chord).map((c) => ({ start: c.start, chord: simplifyChord(transposeChord(c.chord!, semis), chordLevel) })),
    );
    const v = voiceChords(flat.map((c) => c.chord));
    return flat.map((c, i) => ({ ...c, v: v[i]! }));
  }, [analysis, semis, chordLevel]);

  // Campo harmônico: os acordes da música em ordem (sem repetir o mesmo seguido), com o atual marcado.
  const strip = useMemo(() => {
    const out: Array<{ start: number; chord: Chord; name: string }> = [];
    for (const c of chordTrack) {
      const name = chordName(c.chord, localKey);
      if (!out.length || out[out.length - 1]!.name !== name) out.push({ start: c.start, chord: c.chord, name });
    }
    return out;
  }, [chordTrack, localKey]);
  const stripOn = useMemo(() => {
    let i = -1;
    for (let k = 0; k < strip.length && strip[k]!.start <= pos + 1e-3; k++) i = k;
    return i;
  }, [strip, pos]);
  // Tablatura e mapa rolam sozinhos: o compasso tocando fica sempre à vista (no meio do painel).
  useEffect(() => {
    if (barIdx < 0) return;
    for (const sel of ['.tab-panel', '.map-panel.chart:not(.tab-panel)']) {
      const box = document.querySelector<HTMLElement>(`${sel} .chart-sections`);
      const cur = box?.querySelector<HTMLElement>('.chart-bar.cur');
      if (!box || !cur) continue;
      const top = cur.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
      const target = top - box.clientHeight / 2 + cur.clientHeight / 2;
      if (Math.abs(box.scrollTop - target) > cur.clientHeight * 0.75) box.scrollTo({ top: Math.max(0, target), behavior: playing ? 'smooth' : 'auto' });
    }
  }, [barIdx, playing]);
  const stripRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const box = stripRef.current;
    const el = box?.querySelector<HTMLElement>('.strip-chord.on');
    if (box && el) box.scrollTo({ left: el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2, behavior: 'smooth' });
  }, [stripOn]);
  // Duração do tempo no ponto atual (andamento variável: muda ao longo da música).
  const beatSec = useMemo(() => {
    const b = analysis?.beats;
    if (!b || b.length < 2) return analysis && analysis.bpm > 0 ? 60 / analysis.bpm : 0.5;
    let k = b.findIndex((t) => t > pos);
    if (k < 0) k = b.length - 1;
    const lo = Math.max(0, k - 3);
    const hi = Math.min(b.length - 1, k + 2);
    return hi > lo ? (b[hi]! - b[lo]!) / (hi - lo) : 60 / analysis!.bpm;
  }, [analysis, pos]);
  const variableTempo = !!analysis?.tempo?.variable;
  const localBpm = variableTempo ? 60 / beatSec : (analysis?.bpm ?? 0);
  const harmMarks: KeyMark[] = useMemo(() => {
    if (!chordTrack.length) return [];
    let i = -1;
    for (let k = 0; k < chordTrack.length && chordTrack[k]!.start <= pos + 1e-3; k++) i = k;
    if (i < 0) i = 0;
    const c = chordTrack[i]!;
    // Arpejo na mão direita: uma nota por tempo, de baixo para cima e volta ao começo.
    const step = Math.max(0, Math.floor((pos - c.start) / beatSec));
    const playingNow = playing || pos > 0;
    const nowIdx = playingNow ? step % c.v.right.length : -1;
    const nextIdx = (nowIdx + 1) % c.v.right.length;
    const left: KeyMark[] = c.v.left.map((m) => ({ midi: m, state: 'now', hand: 'L', role: 'base' }));
    const right: KeyMark[] = c.v.right.map((m, k) => ({ midi: m, state: k === nowIdx ? 'now' : k === nextIdx ? 'next' : 'later', hand: 'R', role: 'arp', order: k + 1 }));
    return [...left, ...right];
  }, [chordTrack, pos, beatSec, playing]);
  const pianoRange = useMemo(
    () => (pianoRec ? keyboardRange((pianoNotes ?? []).map((n) => n.midi)) : keyboardRange(chordTrack.flatMap((c) => [...c.v.left, ...c.v.right]))),
    [pianoRec, pianoNotes, chordTrack],
  );
  const recMarks: KeyMark[] = useMemo(() => {
    if (!pianoNotes || !bar) return [];
    const inBar = pianoNotes.filter((n) => n.startSec < bar.end - 0.03 && n.startSec + n.durSec > bar.start + 0.03);
    const nextOnset = inBar.reduce((t, n) => (n.startSec > pos && n.startSec < t ? n.startSec : t), Infinity);
    const stateOf = (n: MidiNote): KeyMark['state'] =>
      pos >= n.startSec && pos < n.startSec + n.durSec ? 'now' : Math.abs(n.startSec - nextOnset) < 0.04 ? 'next' : n.startSec + n.durSec <= pos ? 'done' : 'later';
    // Acorde do compasso (o que soa agora; senão o primeiro do compasso) para a mão esquerda.
    const chordNow = curChord ?? (bar.chords.find((c) => c.chord)?.chord ? transposeChord(bar.chords.find((c) => c.chord)!.chord!, semis) : null);
    return splitHands(inBar, chordNow).map((h) => ({
      midi: h.midi,
      state: h.src === undefined ? 'later' : stateOf(inBar[h.src]!),
      hand: h.hand,
      role: h.role,
      ...(h.order ? { order: h.order } : {}),
    }));
  }, [pianoNotes, bar, pos, curChord, semis]);
  const pianoMarks = pianoRec ? recMarks : harmMarks;
  const pianoNames = useCallback(
    (st: string) =>
      [...new Set(pianoMarks.filter((m) => m.state === st).map((m) => m.midi))]
        .sort((a, b) => a - b)
        .map((m) => pcNameOct(m, flats)),
    [pianoMarks, flats],
  );
  const pianoNow = useMemo(() => pianoNames('now'), [pianoNames]);
  const pianoNext = useMemo(() => pianoNames('next'), [pianoNames]);
  // Resumo das mãos no compasso: acorde base (esquerda) e arpejo em ordem (direita).
  const hands = useMemo(() => {
    const uniq = (xs: number[]) => [...new Set(xs)];
    const left = uniq(pianoMarks.filter((m) => m.hand === 'L' && m.role !== 'extra').map((m) => m.midi)).sort((a, b) => a - b);
    const suggested = pianoMarks.some((m) => m.role === 'suggest');
    const right = [...pianoMarks.filter((m) => m.hand === 'R')].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const arp = uniq(right.map((m) => m.midi));
    return { left: left.map((m) => pcName(m % 12, flats)), suggested, arp: arp.map((m) => pcName(m % 12, flats)) };
  }, [pianoMarks, flats]);

  /* ------------------------------ mapa da música (partes) ------------------------------ */
  const [mapOpen, setMapOpen] = useState(false);
  /** O que entra no mapa exportado (PDF e texto). */
  const [mapOpts, setMapOpts] = useState(() => readStore('bf-map-opts', { tab: true, rec: true, shapes: true }));
  useEffect(() => writeStore('bf-map-opts', mapOpts), [mapOpts]);
  const [sections, setSections] = useState<Section[] | null>(null);
  const nBars = analysis?.bars.length ?? 0;
  // Energia por compasso (voz e mix) a partir das faixas já carregadas: ajuda a separar as partes.
  const energy = useMemo(() => {
    if (!analysis || !lanes?.length) return undefined;
    const rate = lanes[0]!.buffer.sampleRate;
    const len = Math.min(...lanes.map((l) => l.buffer.length));
    const mix = (keys: string[]) => {
      const ls = lanes.filter((l) => keys.includes(l.key));
      if (!ls.length) return null;
      const out = new Float32Array(len);
      for (const l of ls) {
        const d = l.buffer.getChannelData(0);
        for (let i = 0; i < len; i++) out[i]! += d[i]!;
      }
      return out;
    };
    // Faixas mais lentas: um segundo da música ocupa rate/laneRate amostras.
    const vocal = barEnergy(analysis.bars, mix(['vocals', 'lead', 'backing']), rate / laneRate);
    const total = barEnergy(analysis.bars, mix(lanes.map((l) => l.key)), rate / laneRate);
    return analysis.bars.map((_, i) => ({ vocal: vocal[i]!, total: total[i]! }));
  }, [analysis, lanes]);
  const hasVocals = !!lanes?.some((l) => ['vocals', 'lead', 'backing'].includes(l.key));
  const detect = useCallback(() => (analysis ? detectSections(analysis.bars, hasVocals ? energy : undefined) : []), [analysis, energy, hasVocals]);
  useEffect(() => {
    if (!analysis) return setSections(null);
    if (rec?.sections?.length) return setSections((cur) => cur ?? normalizeSections(rec.sections!, analysis.bars.length));
    if (!lanes) return; // espera as faixas para usar a energia
    setSections((cur) => cur ?? normalizeSections(detect(), analysis.bars.length));
  }, [analysis, rec, lanes, detect]);
  const spans = useMemo(() => (sections && nBars ? sectionSpans(sections, nBars) : []), [sections, nBars]);
  const curSection = spans.findIndex((s) => barIdx >= s.from && barIdx <= s.to);
  // Forma da música: partes com os mesmos acordes, compasso a compasso, recebem a mesma letra.
  const letters = useMemo(() => {
    if (!analysis) return [];
    const sig = (b: (typeof analysis.bars)[number]) => b.chords.map((c) => (c.chord ? `${c.chord.root}${c.chord.quality}/${c.chord.bass ?? ''}` : '-')).join(',');
    return sectionLetters(spans.map((x) => analysis.bars.slice(x.from, x.to + 1).map(sig)));
  }, [analysis, spans]);
  /* ------------------------------ mapa harmônico da música ------------------------------ */
  const [mapLook, setMapLook] = useState(() => readStore('bf-song-map-look', { view: 'chords' as MapView, density: 'stage' as MapDensity, circle: false }));
  useEffect(() => writeStore('bf-song-map-look', mapLook), [mapLook]);
  const [selBar, setSelBar] = useState<number | null>(null);
  const mapFlats = keyUsesFlats(songKey);
  // Compassos com os acordes (tom de agora), tempo de início no compasso e duração em tempos.
  const songHarm: HarmonicMapData | null = useMemo(() => {
    if (!analysis || !songKey) return null;
    const measures = effectiveBars.map((b) => {
      const len = Math.max(0.1, b.end - b.start);
      const raw = b.chords.filter((c) => c.chord);
      const chords = raw.map((c, k) => {
        const beat = Math.max(0, Math.min(3, Math.round(((c.start - b.start) / len) * 4)));
        const next = raw[k + 1];
        const endBeat = next ? Math.max(beat + 1, Math.min(4, Math.round(((next.start - b.start) / len) * 4))) : 4;
        return { chord: transposeChord(c.chord!, semis), beat, beats: Math.max(1, endBeat - beat) };
      });
      // Acordes iguais seguidos no mesmo compasso viram um só.
      const merged: Array<{ chord: Chord; beat: number; beats: number }> = [];
      for (const c of chords) {
        const p = merged[merged.length - 1];
        if (p && chordSymbol(p.chord) === chordSymbol(c.chord)) merged[merged.length - 1] = { ...p, beats: p.beats + c.beats };
        else merged.push(c);
      }
      return { index: b.index, beats: 4, chords: merged, start: b.start, end: b.end };
    });
    return {
      title: cleanName(name),
      key: songKey,
      bpm: Math.round(analysis.bpm),
      timeSig: [4, 4] as const,
      measures,
      sections: spans.map((sp, i) => ({ name: sp.name, from: sp.from, to: sp.to, ...(letters[i] ? { letter: letters[i]!.letter } : {}) })),
    };
  }, [analysis, songKey, effectiveBars, semis, spans, letters, name]);
  const songInsight: ChordInsight[][] = useMemo(() => (songHarm ? analyzeMap(songHarm, mapFlats) : []), [songHarm, mapFlats]);
  /** Correção de acorde feita no tom de agora: guardada no tom original da música. */
  function editBar(bar: number, chordIdx: number, chord: Chord) {
    const m = songHarm?.measures[bar];
    if (!m) return;
    const back = (c: Chord): Chord => transposeChord(c, -semis);
    const list = m.chords.map((c, k) => ({ beat: c.beat, beats: c.beats, chord: back(k === chordIdx ? chord : c.chord) }));
    setChordEdits((e) => ({ ...e, [bar]: list }));
    setMessage(`Compasso ${bar + 1}: ${chordSymbol(chord, mapFlats)}. A correção vale no mapa, na exportação e nas guias harmônicas.`);
  }
  function splitBar(bar: number) {
    const m = songHarm?.measures[bar];
    if (!m || m.chords.length !== 1) return;
    const c = transposeChord(m.chords[0]!.chord, -semis);
    setChordEdits((e) => ({ ...e, [bar]: [{ beat: 0, beats: 2, chord: c }, { beat: 2, beats: 2, chord: c }] }));
  }
  // Ciclo sincronizado: o acorde soando acende; o compasso escolhido vai para o braço (notas-alvo).
  useEffect(() => {
    harmonicStore.set({ active: curChord });
  }, [curChord?.root, curChord?.quality, curChord?.bass]);
  const selChord = selBar !== null ? (songHarm?.measures[selBar]?.chords[0] ?? null) : null;
  const selInsight = selBar !== null ? (songInsight[selBar]?.[0] ?? null) : null;
  useEffect(() => {
    harmonicStore.set({ selected: selChord && selInsight ? { chord: selChord.chord, degree: selInsight.roman, scale: selInsight.scale, targets: selInsight.targets.pcs } : null });
  }, [selChord, selInsight]);
  // Notas do acorde escolhido no braço do baixo (casas 1–12); alvos (1, 3, 7) em destaque.
  const neckHints = useMemo(() => {
    if (!selChord || !selInsight) return [];
    const tones = new Set(harmonicFieldTones(selChord.chord));
    const targets = new Set(selInsight.targets.pcs);
    const out: Array<{ pos: { string: number; fret: number }; label: string; state: 'scale' | 'root' }> = [];
    for (let m = tuning.strings[0]!; m <= tuning.strings[tuning.strings.length - 1]! + 12; m++) {
      if (!tones.has(m % 12)) continue;
      for (const p of positionsOf(m, tuning)) if (p.fret >= 1 && p.fret <= 12) out.push({ pos: p, label: '', state: targets.has(m % 12) ? 'root' : 'scale' });
    }
    return out;
  }, [selChord, selInsight, tuning]);
  /** Clique no ciclo: com compasso escolhido, troca o acorde; senão leva a música para aquele tom. */
  function pickOnCircle(ring: Ring, index: number) {
    const slot = CIRCLE[index]!;
    const chord: Chord = ring === 'major' ? { root: slot.major.root, quality: '' } : ring === 'minor' ? { root: slot.minor.root, quality: 'm' } : { root: slot.dim.root, quality: 'dim' };
    if (selBar !== null) {
      editBar(selBar, 0, chord);
      playHarmonyChord(chord);
      return;
    }
    if (!analysis || ring === 'dim') return;
    // Mesmo modo da música: o tom clicado; modo trocado: a relativa (Am numa música maior → Dó maior).
    const target = ring === 'major' ? (analysis.key.mode === 'major' ? { tonic: slot.major.root, mode: 'major' as const } : { tonic: slot.minor.root, mode: 'minor' as const }) : analysis.key.mode === 'minor' ? { tonic: slot.minor.root, mode: 'minor' as const } : { tonic: slot.major.root, mode: 'major' as const };
    void changeSemis(semitonesBetween(analysis.key, target));
  }

  /** Partes repetidas mostradas por inteiro no mapa (as outras ficam resumidas). */
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());
  /** Nomes de músico pela forma: Intro, Parte A, Parte B, Pré-refrão, Refrão, Ponte, Outro. */
  function nameSectionsByForm() {
    if (!sections || !spans.length) return;
    const en = energy ? spans.map((x) => energy.slice(x.from, x.to + 1).reduce((a, e) => a + e.total, 0) / (x.to - x.from + 1)) : undefined;
    const names = nameByForm(spans, letters, en);
    changeSections(sections.map((x) => {
      const k = spans.findIndex((sp) => sp.from === x.startBar);
      return k >= 0 ? { ...x, name: names[k]! } : x;
    }));
    setMessage('Partes nomeadas pela forma. Renomeie à vontade.');
  }
  /** Muda o começo de uma parte um compasso para trás ou para a frente (sem passar das vizinhas). */
  function shiftSection(i: number, delta: number) {
    if (!sections || i <= 0) return;
    const sp = spans[i]!;
    const prev = spans[i - 1]!;
    const next = sp.from + delta;
    if (next <= prev.from || next > sp.to) return;
    changeSections(sections.map((x) => (x.startBar === sp.from ? { ...x, startBar: next } : x)));
  }
  function changeSections(next: Section[]) {
    const norm = normalizeSections(next, nBars);
    setSections(norm);
    void window.baixaria.librarySetSections(songId, norm).catch((e: unknown) => setError(errorText(e, 'falha ao salvar o mapa')));
  }
  function buildMap(): SongMap | null {
    if (!analysis || !songKey) return null;
    let prev = '';
    const bassIn = (b: { start: number; end: number }) => {
      const names = (bassNotes ?? []).filter((n) => n.startSec >= b.start - 0.03 && n.startSec < b.end - 0.03).map((n) => pcName(n.midi % 12, flats));
      return names.filter((x, i) => i === 0 || x !== names[i - 1]).slice(0, 8);
    };
    // Tablatura do baixo: a linha escolhida no painel Tablatura (gravação transcrita ou guia harmônica).
    const accBass = mapOpts.tab ? tabLine : [];
    const tabIn = (b: { start: number; end: number }) => (accBass.length ? tabInBar(b) : []);
    // Formas do violão: um diagrama por acorde diferente da música, na ordem em que aparecem.
    const shapes: Array<{ name: string; frets: ReadonlyArray<number | null>; base: number }> = [];
    if (mapOpts.shapes) {
      for (const c of strip) {
        if (shapes.some((x) => x.name === c.name) || shapes.length >= 48) continue;
        const v = guitarVoicing(c.chord, { mode: guitarMode, level: chordLevel, near: accomp.guitar.region });
        if (v) shapes.push({ name: c.name, frets: v.frets, base: v.baseFret });
      }
    }
    const regionLabel = BASS_REGIONS.find((r) => r.id === accomp.bass.region)?.label ?? '';
    return {
      title: title,
      key: keyName(songKey),
      bpm: analysis.bpm,
      ...(variableTempo && analysis.tempo?.range ? { bpmRange: [analysis.tempo.range[0], analysis.tempo.range[1]] as const } : {}),
      transpose: semis,
      ...(accBass.length
        ? {
            strings: tuning.strings.map((m) => pcName(m % 12, false)),
            bassStyle: tabSrc === 'acomp' || !bassNotes ? `${BASS_PATTERNS.find((x) => x.id === accomp.bass.pattern)?.label ?? ''}, ${regionLabel.toLowerCase()}` : tabSrcLabel,
          }
        : {}),
      ...(shapes.length ? { shapes } : {}),
      sections: spans.map((s, si) => ({
        name: s.name,
        from: s.from,
        to: s.to,
        ...(letters[si] ? { letter: letters[si]!.letter } : {}),
        ...(letters[si]?.repeatOf != null ? { repeatOf: spans[letters[si]!.repeatOf!]!.name } : {}),
        bars: effectiveBars.slice(s.from, s.to + 1).map((b, k) => {
          const local = transposeKey(b.key, semis);
          const names = b.chords.map((c) => (c.chord ? chordName(transposeChord(c.chord, semis), local) : '—'));
          const chords = names.filter((x, i) => i === 0 || x !== names[i - 1]);
          const sig = chords.join(' ');
          // "%" (repete o compasso anterior) dentro da mesma parte, como numa partitura de ensaio.
          const same = k > 0 && sig === prev;
          prev = sig;
          const tab = tabIn(b);
          return { n: s.from + k + 1, chords: same ? [] : chords, bass: mapOpts.rec ? bassIn(b) : [], ...(tab.length ? { tab } : {}) };
        }),
      })),
    };
  }
  async function exportMap(kind: 'pdf' | 'txt', forceTab = false) {
    const map = forceTab ? withTab() : buildMap();
    if (!map) return;
    setError(null);
    try {
      const picked = await window.baixaria.chooseExportPath(kind, `${cleanName(name)} - mapa${semis ? ` (${semis > 0 ? '+' : ''}${semis})` : ''}`);
      if (picked.canceled) return;
      if (kind === 'pdf') await window.baixaria.exportMapPdf(picked.path, map);
      else await window.baixaria.writeExportFile(picked.path, new TextEncoder().encode('\ufeff' + songMapText(map)));
      const extras = [map.strings ? 'a tablatura do baixo' : '', map.shapes ? `${map.shapes.length} formas de acorde` : '', mapOpts.rec && bassNotes ? 'as notas do baixo da gravação' : ''].filter(Boolean);
      setMessage(`Mapa exportado em ${kind === 'pdf' ? 'PDF' : 'texto'}: ${map.sections.length} partes, ${nBars} compassos${extras.length ? `, com ${extras.join(', ')}` : ''}.`);
    } catch (e) {
      setError(errorText(e, 'falha ao exportar o mapa'));
    }
  }

  /** Mapa com a tablatura garantida (exportação pelo painel Tablatura). */
  function withTab(): SongMap | null {
    const keep = mapOpts.tab;
    mapOpts.tab = true;
    try {
      return buildMap();
    } finally {
      mapOpts.tab = keep;
    }
  }

  // Zona da mão agora: a da nota que soa; senão, a da próxima.
  const handZone = useMemo(() => {
    if (!fingered) return null;
    const n = fingered.find((x) => x.zone !== null && x.startSec + x.durSec > pos);
    return n?.zone ?? null;
  }, [fingered, pos]);

  // Próxima troca de zona da mão (até 6 s à frente): para preparar a mudança.
  const nextZone = useMemo(() => {
    if (!fingered || handZone === null) return null;
    const n = fingered.find((x) => x.startSec > pos && x.zone !== null && x.zone !== handZone);
    return n && n.startSec - pos <= 6 ? { zone: n.zone!, inSec: n.startSec - pos } : null;
  }, [fingered, pos, handZone]);

  // Violão: forma do acorde atual e do próximo. No CAGED, a raiz fica na zona da mão.
  const guitarNow = useMemo(
    () => (curChord ? guitarVoicing(curChord, { mode: guitarMode, level: chordLevel, near: accomp.guitar.region }) : null),
    [curChord, guitarMode, chordLevel, accomp.guitar.region],
  );
  const guitarNext = useMemo(
    () => (nextChord ? guitarVoicing(nextChord.chord, { mode: guitarMode, level: chordLevel, near: accomp.guitar.region }) : null),
    [nextChord, guitarMode, chordLevel, accomp.guitar.region],
  );

  // Próxima nota (pode estar no compasso seguinte) e quanto falta.
  const upcoming = useMemo(() => {
    if (!fingered) return null;
    const n = fingered.find((x) => x.startSec > pos && x.pos);
    return n ? { name: pcNameOct(n.midi, flats), pos: n.pos!, inSec: n.startSec - pos } : null;
  }, [fingered, pos, flats]);

  /* ------------------------------ ações ------------------------------ */
  async function exportWav(lane: Lane) {
    setError(null);
    try {
      const info = stemInfo(lane.key);
      const picked = await window.baixaria.chooseExportPath('wav', `${cleanName(name)} - ${info.label}${semis ? ` (${semis > 0 ? '+' : ''}${semis})` : ''}`);
      if (picked.canceled) return;
      const chans = Array.from({ length: Math.min(2, lane.buffer.numberOfChannels) }, (_, c) => lane.buffer.getChannelData(c));
      const bytes = encodeWav(chans, lane.buffer.sampleRate);
      await window.baixaria.writeExportFile(picked.path, bytes);
      setMessage(`${info.label} exportada em WAV (${(bytes.byteLength / 1048576).toFixed(1)} MB).`);
    } catch (e) {
      setError(errorText(e, 'falha ao exportar'));
    }
  }

  const [mixBusy, setMixBusy] = useState(false);
  const mixKeys = lanes ? lanes.filter((l) => mix[l.key]?.exp ?? true).map((l) => l.key) : [];
  const mixCount = mixKeys.length;
  /** Renderiza as faixas marcadas, com o volume, o pan e o tom de agora, num WAV estéreo. */
  async function exportMix() {
    if (!lanes) return;
    setError(null);
    const chosen = lanes.filter((l) => mix[l.key]?.exp ?? true);
    if (chosen.length === 0) return;
    const labels = chosen.map((l) => stemInfo(l.key).label);
    const suffix = chosen.length === lanes.length ? 'mixagem' : `mixagem (${labels.join(', ')})`;
    try {
      const picked = await window.baixaria.chooseExportPath('wav', `${cleanName(name)} - ${suffix}${semis ? ` (${semis > 0 ? '+' : ''}${semis})` : ''}`);
      if (picked.canceled) return;
      setMixBusy(true);
      const rate = lanes[0]!.buffer.sampleRate;
      const length = Math.max(...lanes.map((l) => l.buffer.length));
      const ctx = new OfflineAudioContext(2, length, rate);
      const master = ctx.createGain(); // mesmo volume geral que se ouve no player
      master.gain.value = masterVol;
      master.connect(ctx.destination);
      for (const l of chosen) {
        const m = mix[l.key] ?? DEFAULT_MIX;
        const src = ctx.createBufferSource();
        src.buffer = l.buffer;
        const g = ctx.createGain();
        g.gain.value = m.vol;
        const p = ctx.createStereoPanner();
        p.pan.value = m.pan ?? 0;
        src.connect(g).connect(p).connect(master);
        src.start(0);
      }
      const out = await ctx.startRendering();
      const chans = [out.getChannelData(0), out.getChannelData(1)];
      // Sem clipe: se a soma passar de 0 dBFS, abaixa tudo por igual.
      let peak = 0;
      for (const c of chans) for (let i = 0; i < c.length; i++) peak = Math.max(peak, Math.abs(c[i]!));
      const scaled = peak > 0.989;
      if (scaled) {
        const k = 0.989 / peak;
        for (const c of chans) for (let i = 0; i < c.length; i++) c[i]! *= k;
      }
      const bytes = encodeWav(chans, rate);
      await window.baixaria.writeExportFile(picked.path, bytes);
      setMessage(
        `Mixagem exportada em WAV com ${labels.join(', ')} (${(bytes.byteLength / 1048576).toFixed(1)} MB).${scaled ? ` O volume total foi reduzido em ${(20 * Math.log10(peak / 0.989)).toFixed(1).replace('.', ',')} dB para não distorcer.` : ''}`,
      );
    } catch (e) {
      setError(errorText(e, 'falha ao exportar a mixagem'));
    } finally {
      setMixBusy(false);
    }
  }

  const [midiBusy, setMidiBusy] = useState<string | null>(null);
  async function exportMidi(lane: Lane) {
    setError(null);
    const info = stemInfo(lane.key);
    setMidiBusy(lane.key);
    try {
      const bytes = await window.baixaria.stemsMidi(songId, lane.key, semis);
      const picked = await window.baixaria.chooseExportPath('midi', `${cleanName(name)} - ${info.label}${semis ? ` (${semis > 0 ? '+' : ''}${semis})` : ''}`);
      if (picked.canceled) return;
      await window.baixaria.writeExportFile(picked.path, bytes);
      setMessage(`${info.label} exportada em MIDI. As notas são estimadas pelo Basic Pitch: confira antes de usar.`);
    } catch (e) {
      setError(errorText(e, 'falha ao gerar o MIDI'));
    } finally {
      setMidiBusy(null);
    }
  }

  async function remove() {
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    stopAll();
    await window.baixaria.libraryRemove(songId);
    onRemoved();
  }

  // Atalhos de teclado.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (playing) pause();
        else void play();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        if (!analysis) return;
        e.preventDefault();
        const i = Math.max(0, Math.min(analysis.bars.length - 1, Math.max(0, barIdx) + (e.key === 'ArrowRight' ? 1 : -1)));
        seek(analysis.bars[i]!.start);
      } else if (e.key === 'm' || e.key === 'M') setMetro((m) => ({ ...m, on: !m.on }));
      else if (e.key === 'l' || e.key === 'L') setLoop((l) => (l ? null : barIdx >= 0 ? { from: barIdx, to: Math.min((analysis?.bars.length ?? 1) - 1, barIdx + 3) } : null));
      else if (e.key === '+' || e.key === '=') stepSemis(1);
      else if (e.key === '-') stepSemis(-1);
      else if (/^Digit[1-9]$/.test(e.code) && lanes && !e.ctrlKey && !e.altKey) {
        // Tecla do número da faixa: mudo (com Shift: solo).
        const lane = lanes[Number(e.code.slice(5)) - 1];
        if (!lane) return;
        const k = lane.key;
        setMix((x) => {
          const m = x[k] ?? DEFAULT_MIX;
          return { ...x, [k]: e.shiftKey ? { ...m, solo: !m.solo } : { ...m, on: !m.on } };
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /* ------------------------------ montagem pelas faixas ------------------------------ */
  const laneKeys = useMemo(() => (lanes ?? []).map((l) => l.key), [lanes]);
  const presets = useMemo(() => presetsFor(laneKeys), [laneKeys]);
  const preset = anySolo ? null : matchPreset(laneKeys, (k) => mix[k]?.on ?? true);
  function applyPreset(id: string) {
    const p = presets.find((x) => x.id === id);
    if (!p) return;
    setMix((m) => {
      const next = { ...m };
      for (const k of laneKeys) next[k] = { ...(next[k] ?? DEFAULT_MIX), on: p.on(k), solo: false };
      return next;
    });
    setMessage(`Montagem: ${p.label.toLowerCase()} (${p.hint.toLowerCase()}).`);
  }

  /* ------------------------------ telas sem faixas ------------------------------ */
  const title = cleanName(name);
  if (rec && !separated) {
    return (
      <section className="screen song-empty">
        <header className="page-head">
          <h1>{title}</h1>
          <p className="muted">Escolha as faixas que quer separar. Tudo roda neste computador.</p>
        </header>
        {job?.state === 'separating' || job?.state === 'queued' || job?.state === 'analyzing' ? (
          <div className="card">
            <JobProgress job={job} songId={songId} />
          </div>
        ) : (
          <div className="card">
            {job?.state === 'error' && (
              <p className="alert" role="alert">
                <Icon name="alert" size={16} /> {job.message}
              </p>
            )}
            <StemPicker busy={false} cpu={cpu} voiceSplit={voiceSplit} submitLabel="Separar faixas" onSubmit={onSeparate} />
          </div>
        )}
      </section>
    );
  }

  /* ------------------------------ player ------------------------------ */
  const showPanel = playing || pos > 0;
  const totalW = Math.ceil(duration * pxPerSec);

  return (
    <section className="song">
      <header className="song-head">
        <div className="song-id">
          <h1 title={name}>{title}</h1>
          <div className="song-facts">
            {songKey ? (
              <span className="fact key" title={keyNameSolfege(songKey)}>
                <b>{keyName(songKey)}</b>
                {semis !== 0 && analysis && <span className="muted"> · original {keyName(analysis.key)}</span>}
              </span>
            ) : (
              <span className="fact muted">{job?.state === 'analyzing' ? 'analisando…' : 'sem análise'}</span>
            )}
            {analysis && (
              <span className="fact tempo-fact">
                {variableTempo && analysis.tempo?.range ? (
                  <span title="Gravação sem metrônomo: o andamento muda ao longo da música e os compassos o acompanham.">
                    {Math.round(analysis.tempo.range[0])}–{Math.round(analysis.tempo.range[1])} BPM <span className="tempo-badge">variável</span>
                  </span>
                ) : (
                  <span>
                    {Math.round(analysis.bpm)} BPM{analysis.tempo?.mode === 'fixed' && <span className="tempo-badge">fixo</span>}
                  </span>
                )}
                {(variableTempo || analysis.tempo?.mode === 'fixed') && !busy && (
                  <button
                    className="link-btn"
                    onClick={() => onAnalyze(variableTempo ? 'fixed' : 'auto')}
                    aria-label={variableTempo ? 'usar andamento fixo' : 'detectar variação'}
                    title={
                      variableTempo
                        ? 'Se a grade não bate com a música, refaz a análise com um andamento só (cerca de meio minuto).'
                        : 'Refaz a análise deixando o andamento acompanhar a gravação (cerca de meio minuto).'
                    }
                  >
                    {variableTempo ? 'fixar' : 'auto'}
                  </button>
                )}
              </span>
            )}
            {analysis && <span className="fact">{analysis.bars.length} compassos</span>}
            {duration > 0 && <span className="fact">{fmt(duration)}</span>}
            {analysis && Math.abs(analysis.tuningCents) >= 15 && (
              <span className="fact warn" title="A gravação não está em Lá = 440 Hz. Use a transposição se você conhece a música em outro tom.">
                afinação {analysis.tuningCents > 0 ? '+' : ''}
                {Math.round(analysis.tuningCents)} cents
              </span>
            )}
          </div>
        </div>
        <div className="spacer" />
        {analysis && (
          <button className={guidePanel ? 'ghost on' : 'ghost'} onClick={() => setGuidePanel((open) => !open)} aria-expanded={guidePanel} title="Configurar as visualizações harmônicas do braço e do teclado">
            <Icon name="chords" size={16} /> Guias harmônicos
          </button>
        )}
        {analysis && (
          <button className={tabOpen ? 'ghost on' : 'ghost'} onClick={() => setTabOpen((o) => !o)} aria-expanded={tabOpen} title="Tablatura do baixo por compasso, com a harmonia">
            <Icon name="tab" size={16} /> Tablatura
          </button>
        )}
        {analysis && (
          <button className={mapOpen ? 'ghost on' : 'ghost'} onClick={() => setMapOpen((o) => !o)} aria-expanded={mapOpen}>
            <Icon name="staff" size={16} /> Mapa
          </button>
        )}
        {lanes && (
          <button
            className="ghost"
            onClick={() => void exportMix()}
            disabled={mixBusy || mixCount === 0}
            title="Junta as faixas marcadas com o volume, o pan e o tom de agora, num WAV"
          >
            {mixBusy ? <span className="spin" aria-hidden="true" /> : <Icon name="export" size={16} />} Exportar mixagem
            <span className="count-pill">{mixCount}</span>
          </button>
        )}
        {lanes && (
          <button className="ghost" onClick={() => void saveStartMix()} title="Ao abrir a música, cada faixa começa muda ou tocando como está agora">
            <Icon name="check" size={15} /> Salvar como padrão
          </button>
        )}
        <button className="ghost" onClick={() => setPicker((p) => !p)} disabled={busy} aria-expanded={picker}>
          <Icon name="scissors" size={16} /> Separar de novo
        </button>
        <button className={confirmRemove ? 'danger' : 'ghost'} onClick={() => void remove()} onBlur={() => setConfirmRemove(false)}>
          {confirmRemove ? 'Confirmar remoção' : 'Remover'}
        </button>
      </header>

      {mapOpen && analysis && sections && (
        <div className="card map-panel chart" role="region" aria-label="Mapa da música">
          <div className="map-head">
            <b>Mapa da música</b>
            <span className="muted small">
              {keyName(songKey ?? analysis.key)} · {Math.round((analysis.bpm * speed) / 100)} BPM{speed !== 100 ? ` (${speed}%)` : ''} · 4/4 · {nBars} compassos
            </span>
            <div className="spacer" />
            <div className="seg tiny" role="group" aria-label="Visão do mapa">
              <button aria-pressed={mapLook.view === 'chords'} onClick={() => setMapLook((l) => ({ ...l, view: 'chords' }))}>
                Cifras
              </button>
              <button aria-pressed={mapLook.view === 'degrees'} onClick={() => setMapLook((l) => ({ ...l, view: 'degrees' }))}>
                Graus
              </button>
              <button aria-pressed={mapLook.view === 'hybrid'} onClick={() => setMapLook((l) => ({ ...l, view: 'hybrid' }))}>
                Híbrido
              </button>
            </div>
            <div className="seg tiny" role="group" aria-label="Densidade do mapa">
              <button aria-pressed={mapLook.density === 'stage'} onClick={() => setMapLook((l) => ({ ...l, density: 'stage' }))} title="Só a harmonia: para tocar">
                Palco
              </button>
              <button aria-pressed={mapLook.density === 'study'} onClick={() => setMapLook((l) => ({ ...l, density: 'study' }))} title="Notas-alvo (1·3·7) e a nota de condução para o próximo acorde">
                Estudo
              </button>
            </div>
            <button className={mapLook.circle ? 'ghost small-btn on' : 'ghost small-btn'} onClick={() => setMapLook((l) => ({ ...l, circle: !l.circle }))} title="Ciclo das quintas sincronizado com a música">
              <Icon name="chords" size={14} /> Ciclo
            </button>
            <button className="ghost small-btn" onClick={() => nameSectionsByForm()} title="Dá nomes de músico pela forma: Intro, Parte A, Parte B, Pré-refrão, Refrão, Ponte, Outro">
              <Icon name="staff" size={14} /> Nomear pela forma
            </button>
            <button className="ghost small-btn" onClick={() => changeSections(detect())} title="Descarta as edições e detecta as partes de novo">
              Detectar de novo
            </button>
            <button className="ghost small-btn" onClick={() => void exportMap('txt')}>
              <Icon name="export" size={14} /> Texto
            </button>
            <button className="small-btn primary" onClick={() => void exportMap('pdf')}>
              <Icon name="export" size={14} /> Exportar PDF
            </button>
          </div>
          {/* Forma da música: uma ficha por parte, na ordem; clique para ir até ela. */}
          <div className="form-strip" aria-label="Forma da música">
            {spans.map((sp, i) => (
              <button
                key={sp.from}
                className={`form-chip ${i === curSection ? 'cur' : ''}`}
                data-kind={sectionKind(sp.name)}
                style={{ flexGrow: sp.to - sp.from + 1 }}
                onClick={() => seekRef.current(analysis.bars[sp.from]!.start)}
                title={`${sp.name} · compassos ${sp.from + 1}–${sp.to + 1}`}
              >
                <b>{letters[i]?.letter}</b> {sp.name}
              </button>
            ))}
          </div>
          <div className="map-opts" role="group" aria-label="O que entra no mapa exportado">
            <span className="muted small">No PDF:</span>
            <label className="check" title="Linha harmônica do baixo, com corda e casa">
              <input type="checkbox" checked={mapOpts.tab} onChange={() => setMapOpts((o) => ({ ...o, tab: !o.tab }))} /> Tablatura do baixo
            </label>
            <label className="check" title="Notas que o baixo da gravação toca (estimadas)">
              <input type="checkbox" checked={mapOpts.rec} onChange={() => setMapOpts((o) => ({ ...o, rec: !o.rec }))} /> Notas da gravação
            </label>
            <label className="check" title="Diagrama de cada acorde no violão (formas do painel)">
              <input type="checkbox" checked={mapOpts.shapes} onChange={() => setMapOpts((o) => ({ ...o, shapes: !o.shapes }))} /> Acordes no violão
            </label>
            <div className="spacer" />
            <span className="muted small">Para tocar junto mais devagar, use Velocidade na barra de baixo.</span>
          </div>
          <datalist id="bf-section-names">
            {SECTION_NAMES.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <div className="chart-sections">
            {spans.map((sp, i) => {
              const rep = letters[i]?.repeatOf;
              const looping = !!loop && loop.from === sp.from && loop.to === sp.to;
              const open = rep == null || expanded.has(sp.from);
              let prevSig = '';
              return (
                <section key={sp.from} className={`chart-sec ${i === curSection ? 'cur' : ''}`} data-kind={sectionKind(sp.name)}>
                  <header className="chart-sec-head">
                    <span className="chart-letter" title="Forma: partes com os mesmos acordes têm a mesma letra">
                      {letters[i]?.letter ?? ''}
                    </span>
                    <input
                      className="map-name"
                      list="bf-section-names"
                      defaultValue={sp.name}
                      key={`${sp.from}-${sp.name}`}
                      aria-label={`Nome da parte ${i + 1}`}
                      onBlur={(e) => e.currentTarget.value.trim() !== sp.name && changeSections(sections.map((x) => (x.startBar === sp.from ? { ...x, name: e.currentTarget.value } : x)))}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') e.currentTarget.blur();
                      }}
                    />
                    <span className="muted small">
                      c. {sp.from + 1}–{sp.to + 1} · {sp.to - sp.from + 1} comp.
                    </span>
                    {rep != null && <span className="chart-rep">= {spans[rep]!.name}</span>}
                    <div className="spacer" />
                    {i > 0 && (
                      <span className="map-shift" role="group" aria-label={`Começo de ${sp.name}`}>
                        <button className="ghost icon-btn" onClick={() => shiftSection(i, -1)} disabled={sp.from - 1 <= spans[i - 1]!.from} title="Começar um compasso antes" aria-label="Começar um compasso antes">
                          <Icon name="back" size={12} />
                        </button>
                        <button className="ghost icon-btn flip" onClick={() => shiftSection(i, 1)} disabled={sp.from + 1 > sp.to} title="Começar um compasso depois" aria-label="Começar um compasso depois">
                          <Icon name="back" size={12} />
                        </button>
                      </span>
                    )}
                    <button className={`ghost icon-btn ${looping ? 'on' : ''}`} onClick={() => (looping ? setLoop(null) : loopPart(sp.from, sp.to))} aria-label={`Tocar ${sp.name} em loop`} title="Tocar esta parte em loop">
                      <Icon name="loop" size={14} />
                    </button>
                    {i > 0 && (
                      <button className="ghost small-btn" onClick={() => changeSections(sections.filter((x) => x.startBar !== sp.from))} title="Junta esta parte com a anterior">
                        Juntar
                      </button>
                    )}
                  </header>
                  {open ? (
                    <div className="chart-grid">
                      {analysis.bars.slice(sp.from, sp.to + 1).map((b) => {
                        const m = songHarm?.measures[b.index];
                        const ins = songInsight[b.index] ?? [];
                        const sig = m ? m.chords.map((c) => chordSymbol(c.chord, mapFlats)).join(' ') : '';
                        const same = sig === prevSig && mapLook.density === 'stage' && mapLook.view === 'chords';
                        prevSig = sig;
                        const curBar = b.index === barIdx;
                        const edited = !!chordEdits[b.index];
                        return (
                          <button
                            key={b.index}
                            className={`chart-bar ${curBar ? 'cur' : ''} ${selBar === b.index ? 'sel' : ''} ${edited ? 'edited' : ''} ${loop && b.index >= loop.from && b.index <= loop.to ? 'in-loop' : ''}`}
                            onClick={() => {
                              seekRef.current(b.start);
                              setSelBar((x) => (x === b.index ? null : b.index));
                            }}
                            title={`Compasso ${b.index + 1}: ${sig}${edited ? ' (corrigido)' : ''}`}
                          >
                            <span className="bar-n">{b.index + 1}</span>
                            {same || !m ? (
                              <span className="bar-rep">%</span>
                            ) : (
                              <span className="bar-harm">
                                {m.chords.map((c, k) => (
                                  <span key={k} className={`hm-chord ${ins[k] && ins[k]!.kind !== 'diatonic' ? `k-${ins[k]!.kind}` : ''}`} style={{ flexGrow: c.beats }}>
                                    {mapLook.view !== 'degrees' && <b className="hm-name">{chordSymbol(c.chord, mapFlats)}</b>}
                                    {mapLook.view !== 'chords' && ins[k] && <span className={mapLook.view === 'degrees' ? 'hm-roman big' : 'hm-roman'}>{ins[k]!.roman}</span>}
                                    {mapLook.density === 'study' && ins[k] && (
                                      <span className="hm-targets" title="Notas-alvo e a nota de condução para o próximo acorde">
                                        {[ins[k]!.targets.root, ins[k]!.targets.third, ins[k]!.targets.seventh].filter(Boolean).join('·')}
                                        {ins[k]!.approach && <i> → {ins[k]!.approach!.note}</i>}
                                      </span>
                                    )}
                                    {ins[k]?.resolves && <span className={`hm-arrow ${ins[k]!.resolves}`} />}
                                  </span>
                                ))}
                              </span>
                            )}
                            {curBar && <span className="bar-beat" style={{ width: `${((beat + 1) / 4) * 100}%` }} />}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <button className="chart-collapsed" onClick={() => setExpanded((x) => new Set(x).add(sp.from))}>
                      Mesmos acordes de “{spans[rep!]!.name}” · mostrar os compassos
                    </button>
                  )}
                </section>
              );
            })}
          </div>
          {(selBar !== null || mapLook.circle) && songHarm && (
            <div className="map-cof">
              {mapLook.circle && (
                <div className="map-cof-wheel">
                  <CircleOfFifthsWheel
                    selected={circleSlotOf({ root: songHarm.key.tonic, quality: songHarm.key.mode === 'minor' ? 'm' : '' })}
                    field={harmonicField(songHarm.key).flatMap((f) => {
                      const sl = circleSlotOf(f.chord);
                      return sl ? [{ ...sl, degree: f.degree }] : [];
                    })}
                    active={curChord ? circleSlotOf(curChord) : null}
                    onPick={pickOnCircle}
                  >
                    <b className="hub-key">{keyName(songHarm.key)}</b>
                    <span className="hub-sig">{selBar !== null ? `troca o c. ${selBar + 1}` : 'clique: transpor'}</span>
                  </CircleOfFifthsWheel>
                </div>
              )}
              {selBar !== null ? (
                <VoiceLeadingInspector
                  map={songHarm}
                  insight={songInsight}
                  measure={selBar}
                  flats={mapFlats}
                  onPlay={(c) => playHarmonyChord(c)}
                  onReplace={(k, c) => editBar(selBar, k, c)}
                  onSplit={() => splitBar(selBar)}
                  onClose={() => setSelBar(null)}
                />
              ) : (
                <p className="muted small">O acorde tocando acende no ciclo. Clique num tom para transpor a música; escolha um compasso para trocar o acorde dele pelo ciclo.</p>
              )}
            </div>
          )}
          {selBar !== null && chordEdits[selBar] && (
            <button
              className="ghost small-btn"
              onClick={() =>
                setChordEdits((e) => {
                  const { [selBar]: _gone, ...rest } = e;
                  return rest;
                })
              }
            >
              Desfazer a correção do compasso {selBar + 1}
            </button>
          )}
          <div className="map-foot">
            <button
              className="ghost small-btn"
              disabled={barIdx <= 0 || spans.some((x) => x.from === barIdx)}
              onClick={() => changeSections([...sections, { startBar: barIdx, name: 'Parte' }])}
              title="Começa uma parte nova no compasso em que você está"
            >
              <Icon name="scissors" size={14} /> Dividir no compasso {barIdx >= 0 ? barIdx + 1 : '–'}
            </button>
            <span className="muted small">Clique num compasso para ir até ele; o compasso tocando acende.</span>
          </div>
        </div>
      )}
      {tabOpen && analysis && (
        <div className="card map-panel chart tab-panel" role="region" aria-label="Tablatura do baixo">
          <div className="map-head">
            <b>Tablatura do baixo</b>
            <span className="muted small">
              {tabSrcLabel} · cordas {tabStrings.join(' ')} (aguda em cima) · número = casa
            </span>
            <div className="spacer" />
            <div className="seg tiny" role="group" aria-label="Origem da tablatura">
              <button aria-pressed={tabSrc === 'rec' && !!bassNotes} disabled={!bassNotes} onClick={() => setTabSrc('rec')} title="O que o baixo da gravação toca (notas estimadas)">
                Gravação
              </button>
              <button aria-pressed={tabSrc === 'acomp' || !bassNotes} onClick={() => setTabSrc('acomp')} title="Linha harmônica guiada no braço">
                Linha harmônica
              </button>
            </div>
            <button className="ghost small-btn" onClick={() => void exportMap('txt', true)}>
              <Icon name="export" size={14} /> Texto
            </button>
            <button className="ghost small-btn" onClick={() => void exportMap('pdf', true)}>
              <Icon name="export" size={14} /> PDF
            </button>
            <button className="small-btn primary" disabled={!tabLine.length} onClick={studyAsExercise} title="Estudar esta linha nos Exercícios, trecho por trecho, no tom que quiser">
              <Icon name="exercise" size={14} /> Estudar como exercício
            </button>
          </div>
          {!tabLine.length ? (
            <p className="muted small">{bassState && bassState !== 'error' ? 'Extraindo as notas do baixo…' : 'Sem notas de baixo: separe a faixa ou use a linha harmônica guiada.'}</p>
          ) : (
            <div className="chart-sections">
              {spans.map((sp) => (
                <section key={sp.from} className={`chart-sec ${barIdx >= sp.from && barIdx <= sp.to ? 'cur' : ''}`} data-kind={sectionKind(sp.name)}>
                  <header className="chart-sec-head">
                    <b>{sp.name}</b>
                    <span className="muted small">
                      c. {sp.from + 1}–{sp.to + 1}
                    </span>
                  </header>
                  <div className="chart-grid">
                    {analysis.bars.slice(sp.from, sp.to + 1).map((b) => {
                      const local = transposeKey(b.key, semis);
                      const names = b.chords.map((c) => (c.chord ? chordName(transposeChord(c.chord, semis), local) : '—'));
                      const chords = names.filter((x, k) => k === 0 || x !== names[k - 1]);
                      const notes = tabInBar(b);
                      const n = tabStrings.length;
                      const H = 8 + (n - 1) * 9;
                      return (
                        <button key={b.index} className={`chart-bar tab-bar ${b.index === barIdx ? 'cur' : ''}`} onClick={() => seekRef.current(b.start)} title={`Compasso ${b.index + 1}`}>
                          <span className="bar-n">{b.index + 1}</span>
                          <span className="tab-chords">{chords.join('  ')}</span>
                          <svg className="tab-svg" viewBox={`0 0 160 ${H}`} aria-hidden="true">
                            {tabStrings.map((_, st) => (
                              <line key={st} x1="0" x2="160" y1={4 + (n - 1 - st) * 9} y2={4 + (n - 1 - st) * 9} />
                            ))}
                            {notes.map((t, k) => (
                              <g
                                key={k}
                                className={b.index === barIdx && pos >= t.t - 0.01 && pos < t.end ? 'tab-now' : b.index === barIdx && t.end <= pos ? 'tab-done' : undefined}
                                transform={`translate(${8 + t.x * 144} ${4 + (n - 1 - t.s) * 9})`}
                              >
                                <rect x="-5" y="-4.2" width="10" height="8.4" rx="1.5" />
                                <text y="3">{t.f}</text>
                              </g>
                            ))}
                          </svg>
                          {b.index === barIdx && <span className="bar-beat" style={{ width: `${((beat + 1) / 4) * 100}%` }} />}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      )}
      {guidePanel && analysis && (
        <div className="card acc-panel" role="region" aria-label="Guias harmônicos">
          <div className="map-head">
            <b>Guias harmônicos</b>
            <span className="muted small">Visualizações baseadas nos acordes da música; não adicionam áudio à mixagem.</span>
            <div className="spacer" />
            <button className="ghost icon-btn" onClick={() => setGuidePanel(false)} aria-label="Fechar guias harmônicos">
              <Icon name="close" size={13} />
            </button>
          </div>
          <div className="acc-cols">
            <section className="acc-col" aria-label="Baixo">
              <div className="acc-col-head"><Icon name="bass" size={15} /> <b>Baixo</b></div>
              <label className="field">
                <span>Levada</span>
                <select value={accomp.bass.pattern} onChange={(e) => setAccomp((a) => ({ ...a, bass: { ...a.bass, pattern: e.target.value as BassPattern } }))}>
                  {BASS_PATTERNS.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="muted small">{BASS_PATTERNS.find((x) => x.id === accomp.bass.pattern)?.hint}</p>
              <label className="field">
                <span>Região do braço</span>
                <select
                  value={String(accomp.bass.region)}
                  onChange={(e) => setAccomp((a) => ({ ...a, bass: { ...a.bass, region: e.target.value === 'auto' ? 'auto' : Number(e.target.value) } }))}
                >
                  {BASS_REGIONS.map((x) => (
                    <option key={String(x.id)} value={String(x.id)}>
                      {x.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="acc-rule small">
                Mão parada numa região (um dedo por casa). Sem corda solta: a nota solta vai para a 5ª casa da corda de cima. Baixo de {strings} cordas.
              </p>
              <button
                className="ghost small-btn"
                onClick={() => {
                  setDockInst('bass');
                  setBassMode('acomp');
                  if (!playing && pos === 0 && analysis.bars[0]) seek(analysis.bars[0].start + 0.01);
                }}
              >
                Ver no braço
              </button>
            </section>
            <section className="acc-col" aria-label="Violão ou guitarra">
              <div className="acc-col-head"><Icon name="guitar" size={15} /> <b>Violão / guitarra</b></div>
              <div className="field">
                <span>Formas</span>
                <div className="seg tiny" role="group" aria-label="Formas do guia harmônico no violão">
                  <button aria-pressed={guitarMode === 'caged'} onClick={() => setGuitarMode('caged')} title="Formas CAGED móveis na região, sem cordas soltas">
                    CAGED
                  </button>
                  <button aria-pressed={guitarMode === 'normal'} onClick={() => setGuitarMode('normal')} title="Formas abertas famosas das primeiras casas">
                    Abertas
                  </button>
                </div>
              </div>
              <label className="field">
                <span>Região do braço</span>
                <select
                  value={accomp.guitar.region}
                  onChange={(e) => setAccomp((a) => ({ ...a, guitar: { ...a.guitar, region: Number(e.target.value) } }))}
                >
                  {GUITAR_REGIONS.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.label}
                    </option>
                  ))}
                </select>
              </label>
              <button className="ghost small-btn" onClick={() => setDockInst('guitar')}>
                Ver as formas
              </button>
            </section>
            <section className="acc-col" aria-label="Piano">
              <div className="acc-col-head"><Icon name="piano" size={15} /> <b>Piano</b></div>
              <p className="acc-rule small">O teclado mostra a harmonia principal da música, com condução de vozes entre os acordes.</p>
              <button className="ghost small-btn" onClick={() => setDockInst('piano')}>
                Ver no teclado
              </button>
            </section>
          </div>
        </div>
      )}
      {picker && !busy && (
        <div className="card song-picker">
          <StemPicker
            busy={false}
            cpu={cpu}
            voiceSplit={voiceSplit}
            submitLabel="Separar de novo"
            onCancel={() => setPicker(false)}
            onSubmit={(o) => {
              stopAll();
              setPlaying(false);
              setPicker(false);
              setLanes(null);
              setAnalysis(null);
              onSeparate(o);
            }}
          />
        </div>
      )}
      {analysis && analysis.version < 3 && !busy && (
        <p className="info-line song-msg" role="status">
          <Icon name="analyze" size={16} />
          {analysis.version < 2
            ? ' Análise nova disponível: acordes mais detalhados (maj7, sus, diminutos, inversões como C/E) e compassos que acompanham gravações ao vivo.'
            : ' Análise nova disponível: compassos que acompanham o andamento de gravações ao vivo.'}
          <button className="ghost small-btn" onClick={() => onAnalyze()} title="Refaz a análise com as faixas já separadas (cerca de meio minuto)">
            Atualizar análise
          </button>
        </p>
      )}
      {busy && job && (
        <div className="song-status">
          <JobProgress job={job} songId={songId} />
        </div>
      )}
      {(error || message) && (
        <p className={error ? 'alert song-msg' : 'ok-line song-msg'} role={error ? 'alert' : 'status'}>
          <Icon name={error ? 'alert' : 'check'} size={16} /> {error ?? message}
          <button className="ghost icon-btn" onClick={() => (setError(null), setMessage(null))} aria-label="Fechar aviso">
            <Icon name="close" size={13} />
          </button>
        </p>
      )}

      {/* Linha do tempo: régua + faixas, rolagem horizontal compartilhada. */}
      <div className={`song-body${dockSide ? ' side' : ''}`}>
      <div className="timeline" ref={lanesBox}>
        <div className="tl-scroll" ref={scroller}>
          <div className="tl-inner" style={{ width: HEADER_W + totalW + 8 }}>
            <div className="tl-row ruler-row" style={{ height: RULER_H }}>
              <div className="tl-head ruler-head">
                {lanes && laneKeys.length > 1 && (
                  <label className="mix-preset" title="Montagem das faixas separadas que tocam">
                    <Icon name="mixer" size={15} />
                    <select aria-label="Montagem das faixas" value={preset?.id ?? 'custom'} onChange={(e) => applyPreset(e.target.value)}>
                      {!preset && <option value="custom">Personalizada</option>}
                      {presets.map((p) => (
                        <option key={p.id} value={p.id} title={p.hint}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="zoom-row">
                  <button className="ghost icon-btn" onClick={() => zoom(0.8)} aria-label="Diminuir zoom" title="Diminuir zoom (Ctrl + roda)">
                    <Icon name="minus" size={14} />
                  </button>
                  <button className="ghost small-btn" onClick={fit} title="Música inteira na tela">
                    Ajustar
                  </button>
                  <button className="ghost icon-btn" onClick={() => zoom(1.25)} aria-label="Aumentar zoom" title="Aumentar zoom (Ctrl + roda)">
                    <Icon name="plus" size={14} />
                  </button>
                </div>
              </div>
              <Ruler
                bars={analysis?.bars ?? null}
                duration={duration}
                pxPerSec={pxPerSec}
                semis={semis}
                songKey={songKey}
                loop={loop}
                current={barIdx}
                sections={spans}
                onLoopPart={stableLoopPart}
                onSeek={stableSeek}
                onLoop={setLoop}
              />
            </div>
            {!lanes && (
              <div className="tl-loading">
                <Progress value={null} label={semis ? `Carregando as faixas em ${semis > 0 ? '+' : ''}${semis}…` : 'Carregando as faixas…'} />
              </div>
            )}
            {lanes?.map((l, i) => {
              const info = stemInfo(l.key);
              const m = mix[l.key] ?? DEFAULT_MIX;
              const audible = gainOf(l.key) > 0;
              return (
                <div key={l.key} className={`tl-row lane stem-${l.key} ${audible ? '' : 'silent'} ${density}`} style={{ height: laneH }}>
                  <div className="tl-head lane-head">
                    <span className="lane-color" aria-hidden="true" />
                    <div className="lane-top">
                      <span className="lane-title">
                        <Icon name={info.icon} size={15} />
                        <span>{info.label}</span>
                      </span>
                      <button
                        role="checkbox"
                        className={`mix-mark ${(m.exp ?? true) ? 'on' : ''}`}
                        aria-checked={m.exp ?? true}
                        aria-label={`Incluir ${info.label} na mixagem`}
                        title={(m.exp ?? true) ? 'Entra na mixagem exportada' : 'Fora da mixagem exportada'}
                        onClick={() => setMix((x) => ({ ...x, [l.key]: { ...(x[l.key] ?? m), exp: !(m.exp ?? true) } }))}
                      >
                        <Icon name="check" size={11} />
                      </button>
                      <kbd className="lane-num" title={`Tecla ${i + 1}: mudo`}>
                        {i + 1}
                      </kbd>
                    </div>
                    <div className="lane-ctrls">
                      <div className="ms-pair">
                        <button
                          className={`ms mute ${m.on ? '' : 'on'}`}
                          aria-pressed={!m.on}
                          aria-label={`Mudo em ${info.label}`}
                          title={`Mudo (${i + 1})`}
                          onClick={() => setMix((x) => ({ ...x, [l.key]: { ...m, on: !m.on } }))}
                        >
                          M
                        </button>
                        <button
                          className={`ms solo ${m.solo ? 'on' : ''}`}
                          aria-pressed={m.solo}
                          aria-label={`Solo em ${info.label}`}
                          title="Solo: só as faixas em solo tocam"
                          onClick={() => setMix((x) => ({ ...x, [l.key]: { ...m, solo: !m.solo } }))}
                        >
                          S
                        </button>
                      </div>
                      <Knob
                        value={m.vol}
                        min={0}
                        max={1.2}
                        step={0.01}
                        defaultValue={0.8}
                        size={knobSize}
                        caption={density ? undefined : 'Vol'}
                        label={`Volume de ${info.label}`}
                        format={fmtGain}
                        onChange={(v) => setMix((x) => ({ ...x, [l.key]: { ...(x[l.key] ?? m), vol: v } }))}
                      />
                      <Knob
                        value={m.pan ?? 0}
                        min={-1}
                        max={1}
                        step={0.02}
                        defaultValue={0}
                        bipolar
                        size={knobSize}
                        caption={density ? undefined : 'Pan'}
                        label={`Pan de ${info.label}`}
                        format={fmtPan}
                        onChange={(v) => setMix((x) => ({ ...x, [l.key]: { ...(x[l.key] ?? m), pan: v } }))}
                      />
                      <div className="lane-export">
                        <button className="icon-btn ghost" onClick={() => void exportWav(l)} aria-label={`Exportar ${info.label} em WAV`} title="Exportar WAV">
                          <Icon name="export" size={15} />
                        </button>
                        {MIDI_STEMS.has(l.key) && (
                          <button
                            className="icon-btn ghost"
                            onClick={() => void exportMidi(l)}
                            disabled={midiBusy !== null}
                            aria-label={`Exportar ${info.label} em MIDI`}
                            title="Exportar MIDI (notas estimadas pelo Basic Pitch)"
                          >
                            {midiBusy === l.key ? <span className="spin" aria-hidden="true" /> : <Icon name="midi" size={15} />}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="lane-body" onClick={(e) => seek((e.clientX - e.currentTarget.getBoundingClientRect().left) / pxPerSec)}>
                    <Waveform buffer={l.buffer} pxPerSec={pxPerSec * laneRate} height={Math.max(4, Math.floor(laneH - 6))} color={cssVar(`--stem-${l.key}`, '#8e8e93')} dim={!audible} />
                  </div>
                </div>
              );
            })}
            {lanes && analysis && (
              <div className={`tl-row lane stem-metro ${metro.on ? '' : 'silent'}`} style={{ height: METRO_H }}>
                <div className="tl-head lane-head">
                  <span className="lane-color" aria-hidden="true" />
                  <span className="lane-title">
                    <Icon name="metronome" size={16} />
                    <span>Metrônomo</span>
                    <kbd className="lane-num">M</kbd>
                  </span>
                  <div className="lane-ctrls">
                    <button
                      className={`ms mute ${metro.on ? '' : 'on'}`}
                      aria-pressed={!metro.on}
                      aria-label="Metrônomo mudo"
                      title="Mudo (M liga e desliga)"
                      onClick={() => setMetro((x) => ({ ...x, on: !x.on }))}
                    >
                      M
                    </button>
                    <Knob value={metro.vol} min={0} max={1} step={0.01} defaultValue={0.6} size={26} label="Volume do metrônomo" format={fmtGain} onChange={(v) => setMetro((x) => ({ ...x, vol: v }))} />
                  </div>
                </div>
                <BeatTicks beats={analysis.beats} first={analysis.firstDownbeat} pxPerSec={pxPerSec} width={totalW} />
              </div>
            )}
            <div className="playhead" ref={playheadRef} style={{ transform: `translateX(${HEADER_W + pos * pxPerSec}px)` }} aria-hidden="true" />
          </div>
        </div>
      </div>

      {/* Painel inferior: compasso atual, harmonia e notas do baixo. */}
      {showPanel && (
        <div className={`dock${dockSide ? ' dock--side' : ''}`} aria-live="off" aria-label="Compasso atual">
          <div className="dock-bar">
            <span className="dock-label">Compasso</span>
            <span className="dock-big">{bar ? bar.index + 1 : '–'}</span>
            <span className="muted small">de {analysis?.bars.length ?? '–'}</span>
            <div className="beats" aria-label={beat >= 0 ? `tempo ${beat + 1}` : undefined}>
              {[0, 1, 2, 3].map((b) => (
                <span key={b} className={`beat ${b === beat ? 'on' : ''} ${b === 0 ? 'one' : ''}`} />
              ))}
            </div>
          </div>
          <div className="dock-chord">
            <span className="dock-label">Acorde</span>
            <span className="chord-big">{curChord ? chordName(curChord, localKey) : '—'}</span>
            <span className="muted small">
              {curChord && localKey ? chordDegree(curChord, localKey) : ''}
              {localKey ? ` · tom do trecho ${keyName(localKey)}` : ''}
            </span>
            {nextChord && (
              <span className="next-chord">
                depois <b>{chordName(nextChord.chord, localKey)}</b> em {nextChord.inSec.toFixed(1).replace('.', ',')} s
              </span>
            )}
          </div>
            <div className="dock-neck-head">
              {studyable.length > 0 && (
                <label className="study-pick" title="Escolha uma faixa da mixagem para ver as notas dela no braço do baixo, no teclado ou no braço do violão">
                  <span className="dock-label">Estudar</span>
                  <select value={studyStem ?? ''} onChange={(e) => setStudyStem(e.target.value || null)} aria-label="Faixa para estudar">
                    <option value="">Harmonia e baixo</option>
                    {sortStems(studyable).map((k) => (
                      <option key={k} value={k}>
                        Faixa: {stemInfo(k).label}
                      </option>
                    ))}
                  </select>
                  {studyStem && (
                    <span className="seg tiny" role="group" aria-label="Ouvir a faixa estudada">
                      <button
                        aria-pressed={!!mix[studyStem]?.solo}
                        onClick={() => setMix((x) => ({ ...x, [studyStem]: { ...(x[studyStem] ?? DEFAULT_MIX), solo: !x[studyStem]?.solo } }))}
                        title="Ouvir só esta faixa"
                      >
                        Só ela
                      </button>
                      <button
                        aria-pressed={mix[studyStem]?.on === false}
                        onClick={() => setMix((x) => ({ ...x, [studyStem]: { ...(x[studyStem] ?? DEFAULT_MIX), on: !(x[studyStem]?.on ?? true) } }))}
                        title="Tirar esta faixa para tocar no lugar dela"
                      >
                        Sem ela
                      </button>
                    </span>
                  )}
                </label>
              )}
              {canPiano ? (
                <div className="seg tiny" role="group" aria-label="Instrumento do painel">
                  {(hasBass || !!accompaniment || !!studyStem) && (
                    <button aria-pressed={inst === 'bass'} onClick={() => setDockInst('bass')}>
                      <Icon name="bass" size={13} /> Baixo
                    </button>
                  )}
                  <button aria-pressed={inst === 'piano'} onClick={() => setDockInst('piano')}>
                    <Icon name="piano" size={13} /> Piano
                  </button>
                  <button aria-pressed={inst === 'guitar'} onClick={() => setDockInst('guitar')}>
                    <Icon name="guitar" size={13} /> Violão
                  </button>
                </div>
              ) : (
                <span className="dock-label">{inst === 'piano' ? 'Piano neste compasso' : 'Baixo neste compasso'}</span>
              )}
              {inst === 'bass' && upcoming && (
                <span className="next-note">
                  próxima <b>{upcoming.name}</b> · corda {tuning.strings.length - upcoming.pos.string}, casa {upcoming.pos.fret}
                  {handZone !== null && (
                    <>
                      {' · '}mão nas casas{' '}
                      <b>
                        {handZone}–{handZone + 3}
                      </b>
                    </>
                  )}
                  {nextZone && (
                    <span className="zone-next">
                      {' · '}troca para{' '}
                      <b>
                        {nextZone.zone}–{nextZone.zone + 3}
                      </b>{' '}
                      em {nextZone.inSec.toFixed(1).replace('.', ',')} s
                    </span>
                  )}
                </span>
              )}
              {inst === 'piano' && (pianoRec ? !!pianoNotes : harmMarks.length > 0) && (
                <span className="next-note hands">
                  <span className="hand-tag left">Esquerda</span>
                  {hands.left.length ? <b>{hands.left.join(' ')}</b> : '—'}
                  {hands.suggested && <span className="muted"> (sugestão)</span>}
                  <span className="hand-tag right">Direita</span>
                  {hands.arp.length ? <b>{hands.arp.join(' → ')}</b> : '—'}
                </span>
              )}
              {inst === 'piano' && pianoRec && pianoNotes && (
                <span className="next-note">
                  {pianoNow.length > 0 && (
                    <>
                      agora <b>{pianoNow.join(' ')}</b>
                    </>
                  )}
                  {pianoNow.length > 0 && pianoNext.length > 0 && ' · '}
                  {pianoNext.length > 0 && (
                    <>
                      depois <b>{pianoNext.join(' ')}</b>
                    </>
                  )}
                  {pianoNow.length + pianoNext.length === 0 && 'sem notas no resto do compasso'}
                </span>
              )}
              <div className="seg tiny" role="group" aria-label="Posição do painel">
                <button aria-pressed={!dockSide} onClick={() => setDockSide(false)} title="Painel embaixo da linha do tempo">
                  Embaixo
                </button>
                <button aria-pressed={dockSide} onClick={() => setDockSide(true)} title="Painel à direita, na vertical, para ganhar espaço">
                  Lateral
                </button>
              </div>
              {inst !== 'bass' && (
                <div className="seg tiny" role="group" aria-label="Nível dos acordes">
                  <button aria-pressed={chordLevel === 'simple'} onClick={() => setChordLevel('simple')} title="Só maior, menor e 7 (sem pestanas difíceis)">
                    Simples
                  </button>
                  <button aria-pressed={chordLevel === 'full'} onClick={() => setChordLevel('full')} title="Todas as qualidades da análise: maj7, m7b5, sus, dim">
                    Completo
                  </button>
                </div>
              )}
              {inst === 'guitar' && (
                <div className="seg tiny" role="group" aria-label="Formas do violão">
                  <button aria-pressed={guitarMode === 'normal'} onClick={() => setGuitarMode('normal')} title="Formas nas primeiras casas, as mais fáceis de tocar">
                    Normal
                  </button>
                  <button aria-pressed={guitarMode === 'caged'} onClick={() => setGuitarMode('caged')} title="Formas CAGED móveis, com a raiz na zona da mão">
                    CAGED
                  </button>
                </div>
              )}
              <div className="spacer" />
              {inst === 'bass' && accompaniment && (
                <div className="seg tiny" role="group" aria-label="Linha do baixo">
                  <button aria-pressed={!bassAcomp} disabled={!hasBass} onClick={() => setBassMode('rec')} title="O que o baixo da gravação toca (notas estimadas)">
                    Gravação
                  </button>
                  <button aria-pressed={bassAcomp} onClick={() => setBassMode('acomp')} title="Linha harmônica guiada, na região confortável e sem corda solta">
                    Linha harmônica
                  </button>
                </div>
              )}
              {inst === 'piano' && hasPiano && (
                <div className="seg tiny" role="group" aria-label="Guia do piano">
                  <button aria-pressed={!pianoRec} onClick={() => setPianoMode('harmony')} title="Acorde da análise: base na esquerda, arpejo na direita">
                    Harmonia
                  </button>
                  <button aria-pressed={pianoRec} onClick={() => setPianoMode('rec')} title="O que a faixa de piano toca (notas estimadas)">
                    Gravação
                  </button>
                </div>
              )}
              {(inst !== 'guitar' || !!studyStem) && (
              <div className="seg tiny" role="group" aria-label="Rótulo das notas">
                {(inst === 'bass' || (inst === 'guitar' && !!studyStem)) && (
                  <button aria-pressed={neckLabel === 'finger'} onClick={() => setNeckLabel('finger')} title="Dedo da mão esquerda na zona (1 indicador … 4 mínimo; 0 corda solta)">
                    Dedo
                  </button>
                )}
                <button aria-pressed={neckLabel === 'fret' || (inst === 'piano' && neckLabel === 'finger')} onClick={() => setNeckLabel('fret')}>
                  {inst === 'piano' ? 'Ordem' : 'Casa'}
                </button>
                <button aria-pressed={neckLabel === 'note'} onClick={() => setNeckLabel('note')}>
                  Nota
                </button>
              </div>
              )}
              {inst === 'bass' && (
                <div className="seg tiny" role="group" aria-label="Cordas do baixo">
                  {[4, 5, 6].map((n) => (
                    <button key={n} aria-pressed={strings === n} onClick={() => setStrings(n)}>
                      {n}
                    </button>
                  ))}
                </div>
              )}
            </div>
          {strip.length > 0 && (
            <div className="chord-strip" ref={stripRef} aria-label="Campo harmônico da música">
              <button className="strip-step" aria-label="Acorde anterior" disabled={stripOn <= 0} onClick={() => seek(strip[stripOn - 1]!.start)}>
                ◀
              </button>
              {strip.map((c, k) => (
                <button key={k} className={`strip-chord ${k === stripOn ? 'on' : ''}`} aria-current={k === stripOn ? 'step' : undefined} onClick={() => seek(c.start)}>
                  {c.name}
                </button>
              ))}
              <button
                className="strip-step"
                aria-label="Próximo acorde"
                disabled={stripOn >= strip.length - 1}
                onClick={() => seek(strip[stripOn + 1]!.start)}
              >
                ▶
              </button>
            </div>
          )}
          <div className="dock-neck">
            {inst === 'guitar' && studyStem ? (
              !fingered ? (
                <Progress value={bassState && bassState !== 'error' ? bassState.percent / 100 : null} label={`Extraindo as notas de ${stemInfo(studyStem).label} (Basic Pitch)…`} />
              ) : (
                <BassNeck tuning={GUITAR_STUDY_TUNING} notes={neckNotes} flats={flats} label={neckLabel} zone={handZone} nextZone={nextZone?.zone ?? null} vertical={dockSide} />
              )
            ) : inst === 'guitar' ? (
              <div className="guitar-box">
                {curChord && guitarNow ? (
                  <figure className="gchord-card">
                    <GuitarChord voicing={guitarNow} name={chordName(simplifyChord(curChord, chordLevel), localKey)} />
                    <figcaption>
                      <b>{guitarNow.form}</b>
                      <span className="muted small">{guitarMode === 'caged' ? 'forma CAGED' : 'forma normal'}</span>
                    </figcaption>
                  </figure>
                ) : (
                  <p className="muted small">{curChord ? 'Sem forma tocável para este acorde neste modo. Tente o modo Normal.' : 'Sem acorde neste trecho.'}</p>
                )}
                {nextChord && guitarNext && (
                  <figure className="gchord-card next">
                    <GuitarChord voicing={guitarNext} name={chordName(simplifyChord(nextChord.chord, chordLevel), localKey)} large={false} />
                    <figcaption>
                      <span className="muted small">depois · {guitarNext.form}</span>
                    </figcaption>
                  </figure>
                )}
              </div>
            ) : inst === 'piano' ? (
              !pianoRec ? (
                <PianoKeys low={pianoRange.low} high={pianoRange.high} marks={pianoMarks} flats={flats} label={neckLabel === 'note' ? 'note' : 'order'} vertical={dockSide} />
              ) : pianoState === 'error' ? (
                <p className="alert small">Não foi possível extrair as notas do piano.</p>
              ) : !pianoNotes ? (
                <Progress value={pianoState ? pianoState.percent / 100 : null} label="Extraindo as notas do piano (Basic Pitch)…" />
              ) : (
                <PianoKeys low={pianoRange.low} high={pianoRange.high} marks={pianoMarks} flats={flats} label={neckLabel === 'note' ? 'note' : 'order'} vertical={dockSide} />
              )
            ) : !hasBass && !bassAcomp && !studyStem ? (
              <p className="muted small">Separe o baixo ou o piano para ver as notas aqui.</p>
            ) : bassState === 'error' && !bassAcomp ? (
              <p className="alert small">Não foi possível extrair as notas do baixo.</p>
            ) : !fingered ? (
              <Progress value={bassState && bassState !== 'error' ? bassState.percent / 100 : null} label="Extraindo as notas do baixo (Basic Pitch)…" />
            ) : (
              <BassNeck tuning={tuning} notes={neckNotes} flats={flats} label={neckLabel} zone={handZone} nextZone={nextZone?.zone ?? null} vertical={dockSide} hints={mapOpen ? neckHints : []} />
            )}
          </div>
        </div>
      )}

      </div>

      {/* Transporte */}
      <footer className="transport-bar">
        <div className="transport-keys" role="group" aria-label="Transporte">
          <button
            className="tkey"
            onClick={() => {
              stopAll();
              setPlaying(false);
              setPos(loop && analysis ? (analysis.bars[loop.from]?.start ?? 0) : 0);
            }}
            aria-label="Parar"
            title="Parar"
          >
            <Icon name="stop" size={15} />
          </button>
          <button className="tkey play" onClick={() => (playing ? pause() : void play())} disabled={!lanes} aria-label={playing ? 'Pausar' : 'Tocar'} title="Tocar/pausar (Espaço)">
            <Icon name={playing ? 'pause' : 'play'} size={20} />
          </button>
          <button
            className={`tkey ${loop ? 'on' : ''}`}
            onClick={() => setLoop((l) => (l ? null : barIdx >= 0 && analysis ? { from: barIdx, to: Math.min(analysis.bars.length - 1, barIdx + 3) } : null))}
            disabled={!analysis}
            aria-pressed={!!loop}
            aria-label={loop ? `Loop ${loop.from + 1}–${loop.to + 1}` : 'Loop'}
            title="Loop de compassos (L). Arraste na régua para escolher o trecho."
          >
            <Icon name="loop" size={16} />
          </button>
        </div>
        <div className="lcd" aria-label="Posição">
          <div className="lcd-cell big">
            <span className="lcd-label">Compasso</span>
            <span className="lcd-value">
              {bar ? bar.index + 1 : '–'}
              <span className="lcd-dim">.{beat >= 0 ? beat + 1 : '–'}</span>
            </span>
          </div>
          <div className="lcd-cell">
            <span className="lcd-label">Tempo</span>
            <span className="lcd-value clock">
              {fmt(pos)}
              <span className="lcd-dim"> / {fmt(duration)}</span>
            </span>
          </div>
          <div className="lcd-cell">
            <span className="lcd-label">BPM</span>
            <span className="lcd-value" title={variableTempo ? 'Andamento neste trecho' : undefined}>
              {analysis ? Math.round(localBpm) : '–'}
            </span>
          </div>
          <div className="lcd-cell">
            <span className="lcd-label">Tom</span>
            <span className="lcd-value key">{localKey ? keyName(localKey) : songKey ? keyName(songKey) : '–'}</span>
          </div>
          {loop && (
            <div className="lcd-cell">
              <span className="lcd-label">Loop</span>
              <span className="lcd-value accent">
                {loop.from + 1}–{loop.to + 1}
              </span>
            </div>
          )}
        </div>
        <div className="spacer" />
        <div className="tone" role="group" aria-label="Tom">
          <span className="tone-label">Transpor</span>
          {analysis && (
            <select className="tone-select" aria-label="Tom de destino" value={semis} onChange={(e) => void changeSemis(Number(e.target.value))} disabled={!separated}>
              {Array.from({ length: 12 }, (_, k) => {
                // Meio-tom mais próximo de cada tom, dentro de ±6 (a quarta aumentada é o limite).
                const s = (((k - analysis.key.tonic) % 12) + 12) % 12;
                const off = s > 6 ? s - 12 : s;
                return (
                  <option key={k} value={off}>
                    {keyName({ tonic: k, mode: analysis.key.mode })}
                    {off ? ` (${off > 0 ? '+' : ''}${off})` : ' (original)'}
                  </option>
                );
              })}
            </select>
          )}
          <button className="round small" onClick={() => stepSemis(-1)} disabled={semis <= -6 || !separated} aria-label="Baixar meio tom" title="Baixar meio tom (−)">
            <Icon name="minus" size={14} />
          </button>
          <span className="tone-value" title={songKey ? keyNameSolfege(songKey) : undefined}>
            {transposing ? `${transposing.target > 0 ? '+' : ''}${transposing.target} · ${transposing.percent}%` : semis === 0 ? 'original' : `${semis > 0 ? '+' : ''}${semis} ${Math.abs(semis) === 1 ? 'semitom' : 'semitons'}`}
          </span>
          <button className="round small" onClick={() => stepSemis(1)} disabled={semis >= 6 || !separated} aria-label="Subir meio tom" title="Subir meio tom (+)">
            <Icon name="plus" size={14} />
          </button>
          {semis !== 0 && !transposing && (
            <button className="ghost small-btn" onClick={() => void changeSemis(0)}>
              Original
            </button>
          )}
        </div>
        <div className="tone speed" role="group" aria-label="Velocidade">
          <span className="tone-label">Velocidade</span>
          <select
            className="tone-select"
            aria-label="Velocidade do mixer"
            value={slowing ?? speed}
            disabled={!separated || slowing !== null || !!transposing}
            onChange={(e) => void changeSpeed(Number(e.target.value))}
            title="Deixa a música inteira mais lenta (todas as faixas e o metrônomo), sem mudar o tom"
          >
            {[100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50].map((v) => (
              <option key={v} value={v}>
                {v === 100 ? '100% (original)' : `${v}%`}
              </option>
            ))}
          </select>
          {slowing !== null ? (
            <span className="tone-value">gerando {slowing}%…</span>
          ) : (
            analysis &&
            speed !== 100 && (
              <span className="tone-value" title="Andamento tocando agora">
                {Math.round((analysis.bpm * speed) / 100)} BPM
              </span>
            )
          )}
        </div>
        <div className="master-vol" role="group" aria-label="Volume geral">
          <Knob value={masterVol} min={0} max={1} step={0.01} defaultValue={1} size={26} label="Volume geral" format={fmtGain} onChange={setMasterVol} />
        </div>
        <button className={`chip-btn ${metro.on ? 'on' : ''}`} onClick={() => setMetro((m) => ({ ...m, on: !m.on }))} disabled={!analysis} title="Metrônomo (M)">
          <Icon name="metronome" size={15} /> Metrônomo
        </button>
        {anySolo && (
          <button className="ghost small-btn" onClick={() => setMix((m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { ...v, solo: false }])))}>
            Tirar solos
          </button>
        )}
      </footer>
    </section>
  );
}

const NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
function pcNameOct(midi: number, flats: boolean): string {
  return `${(flats ? NAMES_FLAT : NAMES_SHARP)[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

function JobProgress({ job, songId }: { job: SongJob; songId: string }) {
  const [asked, setAsked] = useState(false);
  if (job.state === 'queued') return <Progress value={null} label="Na fila…" />;
  if (job.state === 'separating')
    return (
      <div className="job-row">
        <Progress value={job.percent / 100} label={asked ? 'Cancelando…' : (job.phase ?? 'Separando as faixas')} />
        <button
          className="ghost small-btn"
          disabled={asked}
          onClick={() => {
            setAsked(true);
            void window.baixaria.cancelSeparation(songId);
          }}
          title="Para a separação. As faixas que já existiam continuam."
        >
          Cancelar
        </button>
      </div>
    );
  if (job.state === 'analyzing') return <Progress value={job.percent / 100} label="Analisando andamento, compassos, acordes e tom" />;
  return null;
}

/* ------------------------------ régua de compassos ------------------------------ */
interface RulerProps {
  bars: SongAnalysis['bars'] | null;
  duration: number;
  pxPerSec: number;
  semis: number;
  songKey: Key | null;
  loop: { from: number; to: number } | null;
  current: number;
  sections: ReadonlyArray<{ name: string; from: number; to: number }>;
  onLoopPart(from: number, to: number): void;
  onSeek(t: number): void;
  onLoop(l: { from: number; to: number } | null): void;
}

/** Tipo da parte pelo nome (para a cor): refrão, intro/outro, ponte/solo ou parte. */
/** Classes de altura das notas do acorde. */
function harmonicFieldTones(c: Chord): number[] {
  const iv: Record<string, number[]> = { '': [0, 4, 7], m: [0, 3, 7], dim: [0, 3, 6], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], m7b5: [0, 3, 6, 10], sus2: [0, 2, 7], sus4: [0, 5, 7], aug: [0, 4, 8] };
  return (iv[c.quality] ?? (c.quality.startsWith('m') && !c.quality.startsWith('maj') ? iv.m! : iv['']!)).map((x) => (c.root + x) % 12);
}

function sectionKind(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('refr') || n.includes('chorus')) return 'chorus';
  if (n.includes('intro') || n.includes('outro') || n.includes('final')) return 'edge';
  if (n.includes('ponte') || n.includes('solo') || n.includes('bridge') || n.includes('interl')) return 'bridge';
  if (n.includes('pré') || n.includes('pre')) return 'pre';
  return 'verse';
}

const Ruler = memo(function Ruler({ bars, duration, pxPerSec, semis, songKey, loop, current, sections, onLoopPart, onSeek, onLoop }: RulerProps) {
  const drag = useRef<number | null>(null);
  const [preview, setPreview] = useState<{ from: number; to: number } | null>(null);
  if (!bars) {
    // Sem análise: marcas de tempo a cada 10 s.
    const step = pxPerSec > 30 ? 5 : 10;
    return (
      <div className="ruler" style={{ width: Math.ceil(duration * pxPerSec) }} onClick={(e) => onSeek((e.clientX - e.currentTarget.getBoundingClientRect().left) / pxPerSec)}>
        {Array.from({ length: Math.floor(duration / step) + 1 }, (_, i) => (
          <span key={i} className="ruler-tick" style={{ left: i * step * pxPerSec }}>
            {fmt(i * step)}
          </span>
        ))}
      </div>
    );
  }
  const barW = (b: { start: number; end: number }) => (b.end - b.start) * pxPerSec;
  const avgW = bars.length ? (duration * pxPerSec) / bars.length : 40;
  const every = avgW >= 26 ? 1 : avgW >= 12 ? 4 : 8;
  // Número do compasso atual sempre aparece; os vizinhos numerados perto dele somem para não encavalar.
  const numGap = Math.max(1, Math.ceil(24 / Math.max(1, avgW)));
  const sel = preview ?? loop;
  // Rótulos de acorde só onde cabem (≥ 38 px do anterior); o resto fica no tooltip do compasso.
  const shownChords = new Set<string>();
  let lastX = -Infinity;
  if (avgW >= 30) {
    bars.forEach((b, i) =>
      b.chords.forEach((c, k) => {
        const x = c.start * pxPerSec;
        if (c.chord && x - lastX >= 38) {
          shownChords.add(`${i}:${k}`);
          lastX = x;
        }
      }),
    );
  }
  return (
    <div
      className="ruler bars"
      style={{ width: Math.ceil(duration * pxPerSec) }}
      onMouseLeave={() => {
        if (drag.current !== null) {
          drag.current = null;
          setPreview(null);
        }
      }}
    >
      {sections.map((s) => {
        const a = bars[s.from];
        const z = bars[s.to];
        if (!a || !z) return null;
        return (
          <div
            key={`s${s.from}`}
            className="rsec"
            data-kind={sectionKind(s.name)}
            style={{ left: a.start * pxPerSec, width: (z.end - a.start) * pxPerSec }}
            title={`${s.name} · compassos ${s.from + 1}–${s.to + 1}. Duplo clique: tocar em loop.`}
            onClick={() => onSeek(a.start)}
            onDoubleClick={() => onLoopPart(s.from, s.to)}
          >
            <span>{s.name}</span>
          </div>
        );
      })}
      {bars.map((b, i) => {
        const prevKey = i > 0 ? bars[i - 1]!.key : null;
        const keyChange = prevKey && (prevKey.tonic !== b.key.tonic || prevKey.mode !== b.key.mode);
        const local = transposeKey(b.key, semis);
        const inSel = sel && i >= Math.min(sel.from, sel.to) && i <= Math.max(sel.from, sel.to);
        return (
          <div
            key={i}
            className={`rbar ${i === current ? 'cur' : ''} ${inSel ? 'sel' : ''} ${i % 4 === 0 ? 'four' : ''}`}
            style={{ left: b.start * pxPerSec, width: barW(b) }}
            onMouseDown={(e) => {
              e.preventDefault();
              drag.current = i;
              setPreview({ from: i, to: i });
            }}
            onMouseEnter={() => drag.current !== null && setPreview({ from: drag.current, to: i })}
            onMouseUp={() => {
              const from = drag.current;
              drag.current = null;
              setPreview(null);
              if (from === null || from === i) onSeek(b.start);
              else onLoop({ from: Math.min(from, i), to: Math.max(from, i) });
            }}
            title={`Compasso ${i + 1}${b.chords.length ? ` · ${b.chords.map((c) => (c.chord ? chordName(transposeChord(c.chord, semis), local) : '—')).join(' ')}` : ''} · ${keyName(local)}`}
          >
            {(i === current || (i % every === 0 && (current < 0 || Math.abs(i - current) >= numGap))) && <span className="rbar-num">{i + 1}</span>}
            {avgW >= 30 &&
              b.chords.map((c, k) =>
                c.chord && shownChords.has(`${i}:${k}`) ? (
                  <span key={k} className="rbar-chord" style={{ left: (c.start - b.start) * pxPerSec }}>
                    {chordName(transposeChord(c.chord, semis), local)}
                  </span>
                ) : null,
              )}
            {keyChange && songKey && (
              <span className="rbar-key" title={`Mudança de tom: ${keyName(local)}`}>
                {avgW >= 70 ? keyName(local) : `${pcName(local.tonic, keyUsesFlats(local))}${local.mode === 'minor' ? 'm' : ''}`}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
});

/* ------------------------------ metrônomo (marcas) ------------------------------ */
const BeatTicks = memo(function BeatTicks({ beats, first, pxPerSec, width }: { beats: readonly number[]; first: number; pxPerSec: number; width: number }) {
  const minGap = (60 / 240) * pxPerSec;
  const showAll = minGap >= 4;
  return (
    <div className="lane-body beat-ticks" style={{ width }} aria-hidden="true">
      {beats.map((t, i) => {
        const one = (((i - first) % 4) + 4) % 4 === 0;
        if (!showAll && !one) return null;
        return <span key={i} className={`tick ${one ? 'one' : ''}`} style={{ left: t * pxPerSec }} />;
      })}
    </div>
  );
});
