import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BASS_ROLES,
  CIRCLE,
  bassRolePattern,
  type BassRole,
  cadenceChords,
  chordIntervals,
  chordSymbol,
  circleSlotOf,
  harmonicField,
  keyUsesFlats,
  mapFromBars,
  parseChordText,
  pcName,
  replaceChord,
  signatureText,
  type Cadence,
  type Chord,
  type HarmonicMapData,
  type Key,
  type Ring,
} from '@domain';
import { CircleOfFifthsWheel } from '@baixaria/ui-core';
import { CadencePlayerPanel } from '../practice/CadencePlayerPanel.js';
import type { MapDensity, MapView } from '@baixaria/ui-core';
import { Icon } from '@baixaria/ui-core';
import {
  playChord,
  playMidis,
  setPlayStyle,
  type PlayStyle,
  playProgression,
  stopAll,
  type ProgressionHandle,
  type Rhythm,
  type Timbre,
  startLiveInstrumentMonitor,
  stopLiveInstrumentMonitor,
  startPracticeRecording,
  type LiveMonitorHandle,
  type PracticeRecorderHandle,
} from '@baixaria/audio-synth';
import { listInputs } from '../../lib/practice.js';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { harmonicStore } from '@baixaria/ui-core';
import { readStore, writeStore } from '@baixaria/ui-core';
import { getAudioContext } from '@baixaria/audio-synth';

/**
 * Harmonia: Ciclo das Quintas interativo + campo harmônico e cadências + Mapa Harmônico
 * (cifra em texto, progressão do ciclo ou cadência), com inspetor de condução e reprodução.
 */
interface Props {
  /** Abre os Exercícios com a escala do tom escolhido. */
  onPracticeScale?(): void;
}

const SAMPLE = '| C | Am | Dm7 | G7 |\n| C | Am | Dm7 | G7 |\n| F | G | Em7 / A7 / | Dm7 |\n| Dm7 / G7 / | C | % | % |';

const INTERVAL_NAMES: Record<number, string> = {
  0: 'Tônica',
  1: '2ª menor',
  2: '2ª',
  3: '3ª menor',
  4: '3ª maior',
  5: '4ª',
  6: '5ª diminuta',
  7: '5ª justa',
  8: '5ª aumentada',
  9: '6ª',
  10: '7ª menor',
  11: '7ª maior',
  14: '9ª',
};

function chordToneMidis(chord: Chord): number[] {
  const offsets = chordIntervals(chord.quality);
  const out: number[] = [];
  for (const off of offsets) {
    let midi = chord.root + off;
    while (midi < 28) midi += 12;
    while (midi > 88) midi -= 12;
    out.push(midi);
  }
  return [...new Set(out)];
}

function chordTones(chord: Chord): { midi: number; interval: number }[] {
  const offsets = chordIntervals(chord.quality);
  return chordToneMidis(chord).map((midi, index) => ({ midi, interval: offsets[index] ?? 0 }));
}

export function Harmony({ onPracticeScale }: Props) {
  const HARMONY_DEFAULTS = { tonic: 0, mode: 'major' as 'major' | 'minor', tetrads: false, bpm: 90, timbre: 'epiano' as Timbre, loop: true, view: 'hybrid' as MapView, density: 'stage' as MapDensity, flats: false, text: SAMPLE, bassRole: 'root' as BassRole, bassOn: true, style: 'chord' as PlayStyle, rhythm: 'block' as Rhythm, drums: true, chords: true, chordBeats: 4, chordLevel: 1.0, v: 4 };
  const [opts, setOpts] = useState<typeof HARMONY_DEFAULTS>(() => {
    const saved = readStore<Partial<typeof HARMONY_DEFAULTS>>('bf-harmony', {});
    // Versão 4: backing track com controle de volume independente, monitoramento de instrumento e gravação
    return saved.v === 4 ? { ...HARMONY_DEFAULTS, ...saved } : { ...HARMONY_DEFAULTS, ...saved, v: 4, chordLevel: saved.chordLevel ?? 1.0 };
  });
  useEffect(() => writeStore('bf-harmony', opts), [opts]);
  const set = <K extends keyof typeof opts>(k: K, v: (typeof opts)[K]) => setOpts((o) => ({ ...o, [k]: v }));
  const bassRole: BassRole = opts.bassRole ?? 'root';
  /** Acordes tocando junto com a base (ligado por padrão para música de background). */
  const chordsOn = opts.chords ?? true;
  const bassOn = opts.bassOn ?? true;
  const playStyle: PlayStyle = opts.style ?? 'chord';
  useEffect(() => {
    setPlayStyle(playStyle);
    return () => setPlayStyle('chord'); // fora da Harmonia, os acordes voltam a soar juntos
  }, [playStyle]);
  /** O baixo do acompanhamento marca só a tônica, a tríade ou o arpejo de cada acorde. */
  const bassLine = bassOn ? (c: Chord, beats: number) => bassRolePattern(c, bassRole, beats) : undefined;
  const tonality: Key = { tonic: opts.tonic, mode: opts.mode };
  const flats = keyUsesFlats(tonality) || opts.flats;

  // Tom do ciclo para o resto do app (exercícios, braço, mapa).
  useEffect(() => {
    harmonicStore.changeKey(tonality, harmonicField(tonality, opts.tetrads).map((f) => f.chord));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.tonic, opts.mode, opts.tetrads]);

  /* ------------------------------ reprodução ------------------------------ */
  const handle = useRef<ProgressionHandle | null>(null);
  const [cadence, setCadence] = useState<{ id: string; step: number } | null>(null);
  const [active, setActive] = useState<Chord | null>(null);
  /** Tempo do acorde que está soando (−1 parado): acende a nota do baixo no braço. */
  /** Caixa da cifra em texto: escondida até pedir para editar. */
  const [showText] = useState(() => readStore('bf-harmony-text-open', false));
  useEffect(() => writeStore('bf-harmony-text-open', showText), [showText]);
  const [dockOpen] = useState(() => readStore('bf-harmony-dock', true));
  useEffect(() => writeStore('bf-harmony-dock', dockOpen), [dockOpen]);
  const stop = useCallback(() => {
    handle.current?.stop();
    handle.current = null;
    stopAll();
    setCadence(null);
    setActive(null);
    harmonicStore.set({ active: null });
  }, []);
  useEffect(() => () => stop(), [stop]);

  const hearTimer = useRef<number | null>(null);
  const hear = (c: Chord) => {
    setActive(c);
    harmonicStore.set({ active: c });
    playChord(c, opts.timbre);
    if (hearTimer.current) window.clearTimeout(hearTimer.current);
    hearTimer.current = window.setTimeout(() => {
      setActive(null);
      harmonicStore.set({ active: null });
    }, 650);
  };

  /* ------------------------------ monitoramento e gravacao ------------------------------ */
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(() => readStore<string | null>('bf-harmony-device', null));
  const [micActive, setMicActive] = useState(false);
  const [micGain, setMicGain] = useState(0.8);
  const [vuLevel, setVuLevel] = useState(0);
  const monitorHandle = useRef<LiveMonitorHandle | null>(null);
  const recorderHandle = useRef<PracticeRecorderHandle | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordedAudio, setRecordedAudio] = useState<{ url: string; blob: Blob; durationSec: number } | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    void listInputs().then((devs) => {
      setInputs(devs);
      if (!selectedDevice && devs.length > 0) {
        setSelectedDevice(devs[0]!.deviceId);
      }
    });
  }, [selectedDevice]);

  const toggleMic = async () => {
    if (micActive) {
      monitorHandle.current?.stop();
      monitorHandle.current = null;
      setMicActive(false);
      setVuLevel(0);
    } else {
      try {
        const h = await startLiveInstrumentMonitor(selectedDevice, micGain, true);
        monitorHandle.current = h;
        setMicActive(true);
        setStatusMessage('Instrumento conectado! Use fones para evitar microfonia.');
      } catch (err) {
        setError('Não foi possível acessar a entrada de áudio. Verifique as permissões de microfone.');
      }
    }
  };

  useEffect(() => {
    if (!micActive || !monitorHandle.current) return;
    monitorHandle.current.setGain(micGain);
    const interval = window.setInterval(() => {
      if (monitorHandle.current) {
        setVuLevel(monitorHandle.current.level());
      }
    }, 60);
    return () => window.clearInterval(interval);
  }, [micActive, micGain]);

  useEffect(() => {
    return () => {
      stopLiveInstrumentMonitor();
    };
  }, []);

  const startRecord = () => {
    try {
      setRecordedAudio(null);
      recorderHandle.current = startPracticeRecording();
      setRecording(true);
      setStatusMessage('Gravando sessão de prática...');
    } catch (e) {
      setError('Gravação não suportada neste navegador.');
    }
  };

  const stopRecord = async () => {
    if (!recorderHandle.current) return;
    const res = await recorderHandle.current.stop();
    recorderHandle.current = null;
    setRecording(false);
    setRecordedAudio(res);
    setStatusMessage(`Sessão gravada (${res.durationSec}s)! Você pode ouvir ou compartilhar.`);
  };

  const shareAudio = async () => {
    if (!recordedAudio) return;
    try {
      // Tenta compartilhar nativamente via Capacitor no tablet/mobile
      const reader = new FileReader();
      reader.readAsDataURL(recordedAudio.blob);
      reader.onloadend = async () => {
        const base64data = reader.result as string;
        const fileName = `pratica-harmonia-${Date.now()}.webm`;
        try {
          const saved = await Filesystem.writeFile({
            path: fileName,
            data: base64data,
            directory: Directory.Cache,
          });
          await Share.share({
            title: 'Minha Prática na Harmonia (ScaleMonster)',
            text: `Gravação de improvisação e harmonia (${recordedAudio.durationSec} segundos).`,
            url: saved.uri,
            dialogTitle: 'Compartilhar prática de áudio',
          });
        } catch {
          // Fallback para download no desktop / web
          const a = document.createElement('a');
          a.href = recordedAudio.url;
          a.download = fileName;
          a.click();
        }
      };
    } catch (err) {
      const a = document.createElement('a');
      a.href = recordedAudio.url;
      a.download = `pratica-harmonia-${Date.now()}.webm`;
      a.click();
    }
  };

  function playCadence(c: Cadence) {
    stop();
    const chords = cadenceChords(c, tonality, opts.tetrads);
    setCadence({ id: c.id, step: 0 });
    handle.current = playProgression(
      chords.map((f) => ({ chord: f.chord, beats: opts.chordBeats ?? 4 })),
      opts.bpm,
      {
        timbre: opts.timbre,
        loop: opts.loop,
        rhythm: opts.rhythm ?? 'block',
        drums: !!opts.drums,
        chordLevel: chordsOn ? (opts.chordLevel ?? 1) : 0,
        ...(bassLine ? { bass: bassLine } : {}),
        onStep: (i) => {
          setCadence({ id: c.id, step: i });
          setActive(chords[i]!.chord);
          harmonicStore.set({ active: chords[i]!.chord });
        },
        onEnd: () => (setCadence(null), setActive(null)),
      },
    );
  }

  /* ------------------------------ ciclo ------------------------------ */
  const [selMeasure, setSelMeasure] = useState<number | null>(null);
  const [map, setMap] = useState<HarmonicMapData | null>(() => readStore<HarmonicMapData | null>('bf-harmony-map', null));
  useEffect(() => writeStore('bf-harmony-map', map), [map]);

  function pick(ring: Ring, index: number) {
    const slot = CIRCLE[index]!;
    const chord: Chord = ring === 'major' ? { root: slot.major.root, quality: opts.tetrads ? 'maj7' : '' } : ring === 'minor' ? { root: slot.minor.root, quality: opts.tetrads ? 'm7' : 'm' } : { root: slot.dim.root, quality: opts.tetrads ? 'm7b5' : 'dim' };
    // Com um compasso selecionado no mapa, o clique troca o acorde dele (reharmonização).
    if (map && selMeasure !== null) {
      setMap(replaceChord(map, selMeasure, 0, chord));
      hear(chord);
      return;
    }
    if (ring !== 'dim') setOpts((o) => ({ ...o, tonic: chord.root, mode: ring === 'major' ? 'major' : 'minor' }));
    hear(chord);
  }

  const selectedSlot = circleSlotOf({ root: tonality.tonic, quality: tonality.mode === 'minor' ? 'm' : '' });
  const field = useMemo(
    () =>
      harmonicField(tonality).flatMap((f) => {
        const s = circleSlotOf(f.chord);
        return s ? [{ ...s, degree: f.degree }] : [];
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [opts.tonic, opts.mode],
  );
  const activeSlot = active ? circleSlotOf(active) : null;

  // Teclado: ← / → giram o ciclo (quartas / quintas); Espaço toca ou para.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const step = e.key === 'ArrowRight' ? 7 : 5;
        setOpts((o) => ({ ...o, tonic: (o.tonic + step) % 12 }));
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (handle.current) stop();
                else playCadence(cadenceChordsDefault());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const cadenceChordsDefault = (): Cadence => ({ id: 'authentic', name: 'I – IV – V – I', style: 'Cadência autêntica', steps: [0, 3, 4, 0] });

  /* ------------------------------ mapa harmônico ------------------------------ */
  const [error, setError] = useState<string | null>(null);

  // O mapa acompanha a cifra enquanto você escreve (sem precisar apertar "Gerar mapa").
  const typed = useRef(false);
  useEffect(() => {
    if (!typed.current) return;
    const id = window.setTimeout(() => {
      const bars = parseChordText(opts.text);
      if (!bars.length) return;
      setError(null);
      setSelMeasure(null);
      setMap(mapFromBars('Mapa harmônico', bars, { bpm: opts.bpm }));
    }, 450);
    return () => window.clearTimeout(id);
  }, [opts.text, opts.bpm]);

  const keyName = `${chordSymbol({ root: tonality.tonic, quality: tonality.mode === 'minor' ? 'm' : '' }, flats)}${tonality.mode === 'minor' ? ' menor' : ' maior'}`;
  const sigSlot = CIRCLE.find((s) => s.major.root === (tonality.mode === 'major' ? tonality.tonic : (tonality.tonic + 3) % 12))!;
  const scaleMidis = (tonality.mode === 'major' ? [0, 2, 4, 5, 7, 9, 11, 12] : [0, 2, 3, 5, 7, 8, 10, 12]).map((x) => 48 + tonality.tonic + x);
  const currentChord = useMemo(
    () =>
      active ?? {
        root: tonality.tonic,
        quality: opts.tetrads ? (tonality.mode === 'major' ? 'maj7' : 'm7') : tonality.mode === 'major' ? '' : 'm',
      },
    [active, opts.tetrads, tonality.mode, tonality.tonic],
  );

  return (
    <section className="screen harmony">
      <header className="page-head row harmony-page-head">
        <div>
          <h1>Harmonia</h1>
          <p className="muted">Ciclo das quintas e progressões. Clique no ciclo para escolher o tom e ouvir os acordes; ← / → giram o ciclo; Espaço toca e para.</p>
        </div>
        {onPracticeScale && (
          <button
            className="small-btn harmony-practice-btn"
            onClick={() => {
              writeStore('bf-exercise', {
                ...readStore<Record<string, unknown>>('bf-exercise', {}),
                root: tonality.tonic,
                category: 'Modos Gregos',
                mode: tonality.mode === 'major' ? 'Jônio (Maior)' : 'Eólio (Menor)',
              });
              writeStore('bf-ex-view', { ...readStore<Record<string, unknown>>('bf-ex-view', {}), tab: 'practice', routine: null });
              onPracticeScale();
            }}
          >
            <Icon name="exercise" size={14} /> Praticar escala no baixo
          </button>
        )}
      </header>
      {error && (
        <p className="alert" role="alert">
          <Icon name="alert" size={16} /> {error}
        </p>
      )}
      <div className="harmony-top">
        <div className="card cof-card">
          <CircleOfFifthsWheel selected={selectedSlot} field={field} active={activeSlot} onPick={pick}>
            <b className="hub-key">{keyName}</b>
            <span className="hub-sig">{signatureText(tonality.mode === 'major' ? sigSlot.signature : sigSlot.signature)}</span>
            <span className="hub-acts">
              <button className="ghost small-btn hub-btn" onClick={playScaleNow} title="Tocar a escala do tom (sobe e desce)">
                Escala
              </button>
              <button className="ghost small-btn hub-btn" onClick={() => playField()}>
                Campo
              </button>
            </span>
          </CircleOfFifthsWheel>
          <div className="chord-now" aria-live="polite">
            <div className="seg tiny" role="group" aria-label="Como os acordes soam">
              <button aria-pressed={playStyle === 'chord'} className={playStyle === 'chord' ? 'on' : ''} onClick={() => set('style', 'chord')} title="Todas as notas juntas">
                Acorde
              </button>
              <button aria-pressed={playStyle === 'arpeggio'} className={playStyle === 'arpeggio' ? 'on' : ''} onClick={() => set('style', 'arpeggio')} title="As notas uma depois da outra, subindo">
                Arpejo
              </button>
            </div>
            <div className="seg tiny" role="group" aria-label="Papel do baixo">
              {BASS_ROLES.map((r) => (
                <button key={r.id} aria-pressed={bassRole === r.id} className={bassRole === r.id ? 'on' : ''} onClick={() => set('bassRole', r.id)} title={r.hint}>
                  {r.label}
                </button>
              ))}
            </div>
            <button aria-pressed={chordsOn} className={`ghost small-btn ${chordsOn ? 'on' : ''}`} onClick={() => set('chords', !chordsOn)} title="Liga ou desliga os acordes tocando junto com a cozinha">
              {chordsOn ? 'Acordes: ligados' : 'Acordes: desligados'}
            </button>
            <div className="chord-now-head">
              <span className="muted small">{active ? 'Tocando agora' : 'Acorde do tom'}</span>
              <b>{chordSymbol(currentChord, flats)}</b>
              <button className="ghost small-btn" onClick={() => hear(currentChord)} aria-label="Ouvir o acorde">
                <Icon name="play" size={12} /> Ouvir
              </button>
            </div>
            <div className="harmony-tone-list" role="list" aria-label="Notas que formam o acorde">
              {chordTones(currentChord).map((tone) => (
                <span className="harmony-tone-chip" role="listitem" key={`${tone.midi}-${tone.interval}`}>
                  <b>{pcName(tone.midi % 12, flats)}</b>
                  <span>{INTERVAL_NAMES[tone.interval] ?? `${tone.interval} semitons`}</span>
                </span>
              ))}
            </div>
          </div>
          <div className="cof-foot">
            {selMeasure !== null && map ? (
              <span className="muted small">Compasso {selMeasure + 1} selecionado: clique numa fatia para trocar o acorde dele.</span>
            ) : (
              <span className="muted small">Clique num tom para escolher o centro; o acorde toca.</span>
            )}
          </div>
        </div>

        <CadencePlayerPanel
          tonality={tonality}
          tetrads={opts.tetrads}
          onTetrads={(v) => set('tetrads', v)}
          bpm={opts.bpm}
          onBpm={(v) => set('bpm', v)}
          timbre={opts.timbre}
          onTimbre={(v) => set('timbre', v)}
          loop={opts.loop}
          onLoop={(v) => set('loop', v)}
          rhythm={opts.rhythm ?? 'block'}
          onRhythm={(v) => set('rhythm', v)}
          drums={!!opts.drums}
          onDrums={(v) => set('drums', v)}
          chordBeats={opts.chordBeats ?? 4}
          onChordBeats={(v) => set('chordBeats', v)}
          chords={chordsOn}
          onChords={(v) => set('chords', v)}
          chordLevel={opts.chordLevel ?? 1.0}
          onChordLevel={(v) => set('chordLevel', v)}
          bassOn={bassOn}
          onBassOn={(v) => set('bassOn', v)}
          bassRole={bassRole}
          onBassRole={(v) => set('bassRole', v)}
          playing={cadence}
          onPlayChord={hear}
          onPlayCadence={playCadence}
          onStop={stop}
        />
      </div>

      <div className="card harmony-jam-panel" role="region" aria-label="Prática e improvisação com instrumento ao vivo">
        <div className="jam-head">
          <div className="jam-title">
            <Icon name="audio" size={18} />
            <b>Prática com Instrumento e Gravação</b>
            <span className="muted small">Conecte seu instrumento ou microfone, toque junto com a harmonia e grave sua sessão</span>
          </div>
          <div className="spacer" />
          {statusMessage && <span className="jam-status-text">{statusMessage}</span>}
        </div>

        <div className="jam-controls">
          <div className="jam-input-group">
            <button
              type="button"
              className={`small-btn ${micActive ? 'primary on' : 'ghost'}`}
              onClick={toggleMic}
              title="Ativa ou desativa a captura e monitoramento do seu instrumento"
            >
              <Icon name="audio" size={14} /> {micActive ? 'Instrumento Conectado' : 'Conectar Instrumento / Mic'}
            </button>

            {inputs.length > 0 && (
              <select
                className="input-select tiny jam-device-select"
                value={selectedDevice ?? ''}
                onChange={(e) => {
                  setSelectedDevice(e.target.value);
                  writeStore('bf-harmony-device', e.target.value);
                  if (micActive) {
                    toggleMic();
                  }
                }}
                disabled={micActive}
                title="Selecione a entrada (interface USB, cabo P2/P3 ou microfone)"
              >
                {inputs.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Entrada ${d.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            )}

            {micActive && (
              <div className="jam-vu-wrapper" title="Nível de entrada do instrumento">
                <span className="jam-vu-label">Nível:</span>
                <div className="jam-vu-meter">
                  <div className="jam-vu-fill" style={{ width: `${Math.round(vuLevel * 100)}%` }} />
                </div>
                <label className="jam-gain-label">
                  Ganho:
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.05"
                    value={micGain}
                    onChange={(e) => setMicGain(Number(e.target.value))}
                    className="jam-gain-slider"
                  />
                  <span>{Math.round(micGain * 100)}%</span>
                </label>
              </div>
            )}
          </div>

          <div className="jam-record-group">
            {!recording ? (
              <button
                type="button"
                className="small-btn danger-btn jam-rec-btn"
                onClick={startRecord}
                title="Grava a saída da harmonia combinada com o seu instrumento tocando junto"
              >
                <Icon name="record" size={14} /> Gravar Sessão
              </button>
            ) : (
              <button
                type="button"
                className="small-btn primary on jam-rec-btn recording-pulse"
                onClick={stopRecord}
                title="Finalizar gravação"
              >
                <Icon name="stop" size={14} /> Parar Gravação
              </button>
            )}

            {recordedAudio && !recording && (
              <div className="jam-playback-group">
                <audio controls src={recordedAudio.url} className="jam-audio-player" />
                <button
                  type="button"
                  className="small-btn primary jam-share-btn"
                  onClick={shareAudio}
                  title="Compartilhar pelo WhatsApp, Drive ou salvar arquivo"
                >
                  <Icon name="export" size={14} /> Compartilhar / Salvar
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

    </section>
  );

  function playScaleNow() {
    // Escala do tom, subindo e descendo, uma nota por tempo.
    stop();
    const seq = [...scaleMidis, ...[...scaleMidis].reverse().slice(1)];
    const beat = 60 / opts.bpm;
    const t0 = getAudioContext().currentTime + 0.05;
    seq.forEach((m, k) => playMidis([m], opts.timbre, t0 + k * beat, beat * 0.9));
  }
  function playField() {
    stop();
    const chords = harmonicField(tonality, opts.tetrads);
    handle.current = playProgression(
      chords.map((f) => ({ chord: f.chord, beats: 2 })),
      opts.bpm,
      { timbre: opts.timbre, chordLevel: chordsOn ? 1 : 0, drums: !!opts.drums, rhythm: opts.rhythm ?? 'block', ...(bassLine ? { bass: bassLine } : {}), onStep: (i) => (setActive(chords[i]!.chord), harmonicStore.set({ active: chords[i]!.chord })), onEnd: () => stop() },
    );
  }
}

/** Edição feita na visão transposta volta para o tom do mapa guardado. */