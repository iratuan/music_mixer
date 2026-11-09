import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BASS_TUNINGS,
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
import { decodeAudio, getAudioContext, playAligned, setMasterGain, startMetronome, type AlignedHandle, type MetronomeHandle } from '../lib/audio.js';
import { MIDI_STEMS, sortStems, stemInfo } from '../lib/stems.js';

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
/** Abaixo disso a faixa fica compacta (knobs menores, sem legenda); abaixo de TINY_LANE_H, uma linha só. */
const FULL_LANE_H = 58;
const TINY_LANE_H = 40;
const MIN_LANE_H = 28;
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

function readStore<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? ({ ...fallback, ...(JSON.parse(raw) as object) } as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeStore(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sem persistência */
  }
}

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function Song({ songId, name, job, onSeparate, onAnalyze, onRemoved }: Props) {
  const [rec, setRec] = useState<LibrarySong | null>(null);
  const [analysis, setAnalysis] = useState<SongAnalysis | null>(null);
  const [lanes, setLanes] = useState<Lane[] | null>(null);
  const [semis, setSemis] = useState(0);
  const [transposing, setTransposing] = useState<{ target: number; percent: number } | null>(null);
  const [mix, setMix] = useState<Record<string, LaneMix>>(() => readStore(`bf-mix-${songId}`, {}));
  const [metro, setMetro] = useState(() => readStore('bf-metro', { on: false, vol: 0.6 }));
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [loop, setLoop] = useState<{ from: number; to: number } | null>(null);
  const [pps, setPps] = useState<number | null>(null);
  const [picker, setPicker] = useState(false);
  const [cpu, setCpu] = useState(false);
  const [voiceSplit, setVoiceSplit] = useState(false);
  const [bassNotes, setBassNotes] = useState<MidiNote[] | null>(null);
  const [bassState, setBassState] = useState<{ percent: number } | 'error' | null>(null);
  const [pianoNotes, setPianoNotes] = useState<MidiNote[] | null>(null);
  const [pianoState, setPianoState] = useState<{ percent: number } | 'error' | null>(null);
  const [dockInst, setDockInst] = useState<'bass' | 'piano' | 'guitar'>(() => readStore('bf-dock', { i: 'bass' as 'bass' | 'piano' | 'guitar' }).i);
  // Nível dos acordes (simples = tríades e 7; completo = qualidades da análise) e formas do violão (normal ou CAGED).
  const [chordLevel, setChordLevel] = useState<ChordLevel>(() => readStore('bf-chord-level', { v: 'full' as ChordLevel }).v);
  const [guitarMode, setGuitarMode] = useState<GuitarMode>(() => readStore('bf-guitar-mode', { v: 'normal' as GuitarMode }).v);
  // Painel de acordes: embaixo da linha do tempo ou à direita, na vertical (economiza altura).
  const [dockSide, setDockSide] = useState<boolean>(() => readStore('bf-dock-side', { v: false }).v);
  const [strings, setStrings] = useState<number>(() => readStore('bf-strings', { n: 4 }).n);
  // Volume geral: afeta todo o áudio do player e a mixagem exportada.
  const [masterVol, setMasterVol] = useState<number>(() => readStore('bf-master', { v: 1 }).v);
  useEffect(() => setMasterGain(masterVol), [masterVol]);
  useEffect(() => writeStore('bf-master', { v: masterVol }), [masterVol]);
  const [neckLabel, setNeckLabel] = useState<'note' | 'fret' | 'finger'>(() => readStore('bf-neck-label', { v: 'finger' as 'note' | 'fret' | 'finger' }).v);
  /** Piano: guiado pela harmonia (padrão) ou pelo que a faixa de piano toca (gravação). */
  const [pianoMode, setPianoMode] = useState<'harmony' | 'rec'>(() => readStore('bf-piano-mode', { v: 'harmony' as 'harmony' | 'rec' }).v);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [laneH, setLaneH] = useState(64);

  const aligned = useRef<AlignedHandle | null>(null);
  const metroH = useRef<MetronomeHandle | null>(null);
  const clock = useRef({ startedAt: 0, from: 0 });
  const scroller = useRef<HTMLDivElement | null>(null);
  const lanesBox = useRef<HTMLDivElement | null>(null);
  const loadSeq = useRef(0);
  const recRef = useRef<LibrarySong | null>(null);
  recRef.current = rec;
  const startApplied = useRef(false);

  const separated = !!rec?.stems && rec.stems.length > 0;
  const busy = job?.state === 'queued' || job?.state === 'separating' || job?.state === 'analyzing';
  const duration = lanes ? Math.max(...lanes.map((l) => l.buffer.duration)) : (analysis?.duration ?? 0);
  const tuning = BASS_TUNINGS.find((t) => t.strings.length === strings) ?? BASS_TUNINGS[0]!;

  useEffect(() => writeStore(`bf-mix-${songId}`, mix), [mix, songId]);
  useEffect(() => writeStore('bf-metro', metro), [metro]);
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
    })().catch((e: unknown) => setError(e instanceof Error ? e.message : 'falha ao abrir a música'));
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
        const bytes = await window.baixaria.libraryReadStem(songId, k, semis);
        out.push({ key: k, buffer: await decodeAudio(bytes) });
        if (seq !== loadSeq.current) return;
      }
      if (seq !== loadSeq.current) return;
      setLanes(out);
      // Estado inicial salvo na música (ex.: baixo mudo para tocar junto) vale ao abrir o player.
      const start = startApplied.current ? undefined : recRef.current?.startMix;
      startApplied.current = true;
      setMix((m) => {
        const next = { ...m };
        for (const l of out) {
          next[l.key] ??= { on: true, solo: false, vol: 0.8 };
          if (start && start[l.key] !== undefined) next[l.key] = { ...next[l.key]!, on: start[l.key]!, solo: false };
        }
        return next;
      });
    })().catch((e: unknown) => setError(e instanceof Error ? e.message : 'falha ao carregar as faixas'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songId, stemKey, semis]);

  // Notas do baixo (MIDI pelo Basic Pitch, em cache): alimentam o braço do painel inferior.
  const hasBass = !!rec?.stems?.includes('bass');
  useEffect(() => {
    if (!hasBass) {
      setBassNotes(null);
      return;
    }
    let cancelled = false;
    setBassState({ percent: 0 });
    const off = window.baixaria.onSongProgress((p) => {
      if (p.songId === songId && p.task === 'midi:bass' && !cancelled) setBassState({ percent: p.percent });
    });
    void window.baixaria
      .stemsMidi(songId, 'bass', semis)
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
  }, [songId, hasBass, semis]);

  // Notas do piano: só são extraídas quando o painel mostra o teclado (o Basic Pitch leva um tempo).
  const hasPiano = !!rec?.stems?.includes('piano');
  const canPiano = !!analysis;
  const inst: 'bass' | 'piano' | 'guitar' = dockInst === 'guitar' && canPiano ? 'guitar' : canPiano && (dockInst === 'piano' || !hasBass) ? 'piano' : 'bass';
  const pianoRec = hasPiano && pianoMode === 'rec';
  useEffect(() => writeStore('bf-dock', { i: dockInst }), [dockInst]);
  useEffect(() => writeStore('bf-piano-mode', { v: pianoMode }), [pianoMode]);
  useEffect(() => writeStore('bf-neck-label', { v: neckLabel }), [neckLabel]);
  useEffect(() => writeStore('bf-chord-level', { v: chordLevel }), [chordLevel]);
  useEffect(() => writeStore('bf-guitar-mode', { v: guitarMode }), [guitarMode]);
  useEffect(() => writeStore('bf-dock-side', { v: dockSide }), [dockSide]);
  useEffect(() => {
    setPianoNotes(null);
    if (!hasPiano || inst !== 'piano' || !pianoRec) return;
    let cancelled = false;
    setPianoState({ percent: 0 });
    const off = window.baixaria.onSongProgress((p) => {
      if (p.songId === songId && p.task === 'midi:piano' && !cancelled) setPianoState({ percent: p.percent });
    });
    void window.baixaria
      .stemsMidi(songId, 'piano', semis)
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
  }, [songId, hasPiano, inst, pianoRec, semis]);

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
      const x = m[key] ?? { on: true, solo: false, vol: 0.8 };
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
      setError(e instanceof Error ? e.message : 'falha ao salvar');
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
      lanes.map((l) => ({ buffer: l.buffer, gain: gainOf(l.key), pan: mix[l.key]?.pan ?? 0, offset: start })),
      at,
    );
    if (analysis) metroH.current = startMetronome(analysis.beats, analysis.firstDownbeat, at, start, metro.on ? metro.vol : 0);
    clock.current = { startedAt: at, from: start };
    setPos(start);
    setPlaying(true);
  }

  function pause() {
    const ctx = getAudioContext();
    const p = clock.current.from + (ctx.currentTime - clock.current.startedAt);
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

  // Instantes em que a tela muda (tempos e notas do baixo), em ordem.
  const events = useRef<Float64Array>(new Float64Array(0));
  useEffect(() => {
    const t: number[] = [...(analysis?.beats ?? [])];
    for (const n of (inst === 'piano' ? (pianoRec ? pianoNotes : null) : inst === 'bass' ? bassNotes : null) ?? []) t.push(n.startSec, n.startSec + n.durSec);
    events.current = Float64Array.from(t).sort();
  }, [analysis, bassNotes, pianoNotes, inst, pianoRec]);
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
      const p = clock.current.from + (ctx.currentTime - clock.current.startedAt);
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
    const at = playing ? clock.current.from + (getAudioContext().currentTime - clock.current.startedAt) : pos;
    try {
      if (target !== 0) {
        setTransposing({ target, percent: 0 });
        await window.baixaria.stemsTranspose(songId, target);
      }
      if (wasPlaying) pause();
      setLanes(null);
      setSemis(target);
      if (wasPlaying) resumeAt.current = at;
      else setPos(at);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'falha na transposição');
    } finally {
      setTransposing(null);
      const next = pendingSemis.current;
      pendingSemis.current = null;
      if (next !== null && next !== target) void changeSemis(next);
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
  // Altura das faixas: dividem a área disponível.
  const laneCount = lanes?.length ?? 0;
  const hasMetroLane = !!analysis;
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      // Régua e metrônomo têm altura fixa; as faixas dividem todo o resto, sem sobra (altura
      // fracionária) e descontando a barra de rolagem horizontal (clientHeight já desconta). As
      // bordas ficam dentro da altura de cada linha (box-sizing: border-box).
      const free = el.clientHeight - RULER_H - (hasMetroLane ? METRO_H : 0);
      setLaneH(Math.max(MIN_LANE_H, free / Math.max(1, laneCount)));
      // Zoom inicial: a música inteira cabe na largura.
      setPps((p) => p ?? (duration > 0 ? Math.max(MIN_PPS, (el.clientWidth - HEADER_W - 8) / duration) : null));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [laneCount, hasMetroLane, duration]);
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

  // Notas do baixo: digitadas uma vez para a música toda (continuidade entre compassos).
  const fingered = useMemo(() => {
    if (!bassNotes) return null;
    const z = fingerZones(
      bassNotes.map((n) => n.midi),
      tuning,
      bassNotes.map((n) => n.startSec),
    );
    return bassNotes.map((n, i) => ({ ...n, pos: z[i]?.pos ?? null, zone: z[i]?.zone ?? null }));
  }, [bassNotes, tuning]);

  const neckNotes: NeckNote[] = useMemo(() => {
    if (!fingered || !bar) return [];
    const inBar = fingered.filter((n) => n.pos && n.startSec >= bar.start - 0.03 && n.startSec < bar.end - 0.03);
    const nowIdx = inBar.findIndex((n) => pos >= n.startSec && pos < n.startSec + n.durSec);
    const nextIdx = inBar.findIndex((n) => n.startSec > pos);
    return inBar.map((n, i) => ({
      pos: n.pos!,
      midi: n.midi,
      finger: n.pos!.fret === 0 || n.zone === null ? 0 : n.pos!.fret - n.zone + 1,
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
    const vocal = barEnergy(analysis.bars, mix(['vocals', 'lead', 'backing']), rate);
    const total = barEnergy(analysis.bars, mix(lanes.map((l) => l.key)), rate);
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
  function changeSections(next: Section[]) {
    const norm = normalizeSections(next, nBars);
    setSections(norm);
    void window.baixaria.librarySetSections(songId, norm).catch((e: unknown) => setError(e instanceof Error ? e.message : 'falha ao salvar o mapa'));
  }
  function buildMap(): SongMap | null {
    if (!analysis || !songKey) return null;
    let prev = '';
    const bassIn = (b: { start: number; end: number }) => {
      const names = (bassNotes ?? []).filter((n) => n.startSec >= b.start - 0.03 && n.startSec < b.end - 0.03).map((n) => pcName(n.midi % 12, flats));
      return names.filter((x, i) => i === 0 || x !== names[i - 1]).slice(0, 8);
    };
    return {
      title: title,
      key: keyName(songKey),
      bpm: analysis.bpm,
      ...(variableTempo && analysis.tempo?.range ? { bpmRange: [analysis.tempo.range[0], analysis.tempo.range[1]] as const } : {}),
      transpose: semis,
      sections: spans.map((s) => ({
        name: s.name,
        from: s.from,
        to: s.to,
        bars: analysis.bars.slice(s.from, s.to + 1).map((b, k) => {
          const local = transposeKey(b.key, semis);
          const names = b.chords.map((c) => (c.chord ? chordName(transposeChord(c.chord, semis), local) : '—'));
          const chords = names.filter((x, i) => i === 0 || x !== names[i - 1]);
          const sig = chords.join(' ');
          // "%" (repete o compasso anterior) dentro da mesma parte, como numa partitura de ensaio.
          const same = k > 0 && sig === prev;
          prev = sig;
          return { n: s.from + k + 1, chords: same ? [] : chords, bass: bassIn(b) };
        }),
      })),
    };
  }
  async function exportMap(kind: 'pdf' | 'txt') {
    const map = buildMap();
    if (!map) return;
    setError(null);
    try {
      const picked = await window.baixaria.chooseExportPath(kind, `${cleanName(name)} - mapa${semis ? ` (${semis > 0 ? '+' : ''}${semis})` : ''}`);
      if (picked.canceled) return;
      if (kind === 'pdf') await window.baixaria.exportMapPdf(picked.path, map);
      else await window.baixaria.writeExportFile(picked.path, new TextEncoder().encode('\ufeff' + songMapText(map)));
      setMessage(`Mapa exportado em ${kind === 'pdf' ? 'PDF' : 'texto'}: ${map.sections.length} partes, ${nBars} compassos${bassNotes ? ', com as notas do baixo' : ''}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'falha ao exportar o mapa');
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
    () => (curChord ? guitarVoicing(curChord, { mode: guitarMode, level: chordLevel, near: handZone ?? 3 }) : null),
    [curChord, guitarMode, chordLevel, handZone],
  );
  const guitarNext = useMemo(
    () => (nextChord ? guitarVoicing(nextChord.chord, { mode: guitarMode, level: chordLevel, near: handZone ?? 3 }) : null),
    [nextChord, guitarMode, chordLevel, handZone],
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
      setError(e instanceof Error ? e.message : 'falha ao exportar');
    }
  }

  const [mixBusy, setMixBusy] = useState(false);
  const mixKeys = lanes ? lanes.filter((l) => mix[l.key]?.exp ?? true).map((l) => l.key) : [];
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
      const rate = chosen[0]!.buffer.sampleRate;
      const length = Math.max(...chosen.map((l) => l.buffer.length));
      const ctx = new OfflineAudioContext(2, length, rate);
      const master = ctx.createGain(); // mesmo volume geral que se ouve no player
      master.gain.value = masterVol;
      master.connect(ctx.destination);
      for (const l of chosen) {
        const m = mix[l.key] ?? { on: true, solo: false, vol: 0.8 };
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
      setError(e instanceof Error ? e.message : 'falha ao exportar a mixagem');
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
      setError(e instanceof Error ? e.message : 'falha ao gerar o MIDI');
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
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
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
          const m = x[k] ?? { on: true, solo: false, vol: 0.8 };
          return { ...x, [k]: e.shiftKey ? { ...m, solo: !m.solo } : { ...m, on: !m.on } };
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

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
          <button className={mapOpen ? 'ghost on' : 'ghost'} onClick={() => setMapOpen((o) => !o)} aria-expanded={mapOpen}>
            <Icon name="staff" size={16} /> Mapa
          </button>
        )}
        {lanes && (
          <button
            className="ghost"
            onClick={() => void exportMix()}
            disabled={mixBusy || mixKeys.length === 0}
            title="Junta as faixas marcadas (✓ ao lado do nome), com o volume, o pan e o tom de agora, num WAV"
          >
            {mixBusy ? <span className="spin" aria-hidden="true" /> : <Icon name="export" size={16} />} Exportar mixagem
            <span className="count-pill">{mixKeys.length}</span>
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
        <div className="card map-panel" role="region" aria-label="Mapa da música">
          <div className="map-head">
            <b>Mapa da música</b>
            <span className="muted small" title="Detectadas pela repetição dos acordes e pela voz">Renomeie, divida e junte as partes; fica salvo na música.</span>
            <div className="spacer" />
            <button className="ghost small-btn" onClick={() => changeSections(detect())} title="Descarta as edições e detecta de novo">
              Detectar de novo
            </button>
            <button className="ghost small-btn" onClick={() => void exportMap('txt')}>
              <Icon name="export" size={14} /> Texto
            </button>
            <button className="small-btn primary" onClick={() => void exportMap('pdf')}>
              <Icon name="export" size={14} /> Exportar PDF
            </button>
          </div>
          <datalist id="bf-section-names">
            {SECTION_NAMES.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <ol className="map-list">
            {spans.map((s, i) => (
              <li key={s.from} className={`map-row ${i === curSection ? 'cur' : ''}`} data-kind={sectionKind(s.name)}>
                <span className="map-dot" aria-hidden="true" />
                <input
                  className="map-name"
                  list="bf-section-names"
                  defaultValue={s.name}
                  key={`${s.from}-${s.name}`}
                  aria-label={`Nome da parte ${i + 1}`}
                  onBlur={(e) => e.currentTarget.value.trim() !== s.name && changeSections(sections.map((x) => (x.startBar === s.from ? { ...x, name: e.currentTarget.value } : x)))}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                />
                <button className="ghost map-range" onClick={() => seekRef.current(analysis.bars[s.from]!.start)} title="Ir para esta parte">
                  c. {s.from + 1}–{s.to + 1} <span className="muted">· {s.to - s.from + 1}</span>
                </button>
                <span className="map-chords">
                  {analysis.bars
                    .slice(s.from, Math.min(s.to + 1, s.from + 4))
                    .map((b) => {
                      const c = b.chords.find((x) => x.chord)?.chord;
                      return c ? chordName(transposeChord(c, semis), transposeKey(b.key, semis)) : '—';
                    })
                    .join('  ')}
                  {s.to - s.from >= 4 ? ' …' : ''}
                </span>
                <span className="map-acts">
                  <button
                    className={`ghost icon-btn ${loop && loop.from === s.from && loop.to === s.to ? 'on' : ''}`}
                    onClick={() => (loop && loop.from === s.from && loop.to === s.to ? setLoop(null) : loopPart(s.from, s.to))}
                    aria-label={`Tocar ${s.name} em loop`}
                    title="Tocar esta parte em loop"
                  >
                    <Icon name="loop" size={14} />
                  </button>
                  {i > 0 && (
                    <button className="ghost small-btn" onClick={() => changeSections(sections.filter((x) => x.startBar !== s.from))} title="Junta esta parte com a anterior">
                      Juntar
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ol>
          <div className="map-foot">
            <button
              className="ghost small-btn"
              disabled={barIdx <= 0 || spans.some((s) => s.from === barIdx)}
              onClick={() => changeSections([...sections, { startBar: barIdx, name: 'Parte' }])}
              title="Começa uma parte nova no compasso em que você está"
            >
              <Icon name="scissors" size={14} /> Dividir no compasso {barIdx >= 0 ? barIdx + 1 : '–'}
            </button>
            <span className="muted small">Dica: toque, pare no começo da parte e divida aqui.</span>
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
              const m = mix[l.key] ?? { on: true, solo: false, vol: 0.8 };
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
                    <Waveform buffer={l.buffer} pxPerSec={pxPerSec} height={Math.max(4, Math.floor(laneH - 6))} color={cssVar(`--stem-${l.key}`, '#8e8e93')} dim={!audible} />
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
                depois <b>{chordName(nextChord.chord, localKey)}</b> em {nextChord.inSec.toFixed(1)} s
              </span>
            )}
          </div>
            <div className="dock-neck-head">
              {canPiano ? (
                <div className="seg tiny" role="group" aria-label="Instrumento do painel">
                  {hasBass && (
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
              {inst !== 'guitar' && (
              <div className="seg tiny" role="group" aria-label="Rótulo das notas">
                {inst === 'bass' && (
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
            {inst === 'guitar' ? (
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
            ) : !hasBass ? (
              <p className="muted small">Separe o baixo ou o piano para ver as notas aqui.</p>
            ) : bassState === 'error' ? (
              <p className="alert small">Não foi possível extrair as notas do baixo.</p>
            ) : !fingered ? (
              <Progress value={bassState ? bassState.percent / 100 : null} label="Extraindo as notas do baixo (Basic Pitch)…" />
            ) : (
              <BassNeck tuning={tuning} notes={neckNotes} flats={flats} label={neckLabel} zone={handZone} nextZone={nextZone?.zone ?? null} vertical={dockSide} />
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
