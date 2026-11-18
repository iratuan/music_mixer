import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BASS_ROLES,
  BASS_TUNINGS,
  CIRCLE,
  bassRoleNotes,
  bassRolePattern,
  type BassRole,
  analyzeMap,
  cadenceChords,
  chordIntervals,
  chordSymbol,
  circleSlotOf,
  guitarVoicing,
  harmonicField,
  keyUsesFlats,
  mapFromBars,
  mapText,
  parseChordText,
  pcName,
  positionsOf,
  replaceChord,
  simplifyChord,
  signatureText,
  splitMeasure,
  transposeMap,
  type BassTuning,
  type Cadence,
  type Chord,
  type HarmonicMapData,
  type Key,
  type Ring,
} from '@domain';
import { CircleOfFifthsWheel } from '@baixaria/ui-core';
import { CadencePlayerPanel } from '../components/CadencePlayerPanel.js';
import { GuitarChord } from '@baixaria/ui-core';
import { HarmonicGrid, type MapDensity, type MapView } from '@baixaria/ui-core';
import { HarmonicMapToolbar } from '@baixaria/ui-core';
import { Icon } from '@baixaria/ui-core';
import { keyboardRange, PianoKeys } from '@baixaria/ui-core';
import { VoiceLeadingInspector } from '@baixaria/ui-core';
import { BassNeck, type NeckNote } from '@baixaria/ui-core';
import { playChord, playMidis, setPlayStyle, type PlayStyle, playProgression, stopAll, type ProgressionHandle, type Rhythm, type Timbre } from '@baixaria/audio-synth';
import { harmonicStore } from '@baixaria/ui-core';
import { readStore, writeStore } from '@baixaria/ui-core';
import { errorText } from '@baixaria/ui-core';
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
  const [opts, setOpts] = useState(() =>
    readStore('bf-harmony', { tonic: 0, mode: 'major' as 'major' | 'minor', tetrads: false, bpm: 90, timbre: 'epiano' as Timbre, loop: false, view: 'hybrid' as MapView, density: 'stage' as MapDensity, flats: false, text: SAMPLE, bassRole: 'triad' as BassRole, bassOn: true, style: 'chord' as PlayStyle, rhythm: 'block' as Rhythm, drums: false, chordBeats: 4 }),
  );
  useEffect(() => writeStore('bf-harmony', opts), [opts]);
  const set = <K extends keyof typeof opts>(k: K, v: (typeof opts)[K]) => setOpts((o) => ({ ...o, [k]: v }));
  // Opções guardadas antes desta versão não têm o papel do baixo.
  const bassRole: BassRole = opts.bassRole ?? 'triad';
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
  const [mapPos, setMapPos] = useState<{ measure: number; beat: number }>({ measure: -1, beat: -1 });
  /** Tempo do acorde que está soando (−1 parado): acende a nota do baixo no braço. */
  const [beatNow, setBeatNow] = useState(-1);
  /** Caixa da cifra em texto: escondida até pedir para editar. */
  const [showText, setShowText] = useState(() => readStore('bf-harmony-text-open', false));
  useEffect(() => writeStore('bf-harmony-text-open', showText), [showText]);
  const [dockOpen, setDockOpen] = useState(() => readStore('bf-harmony-dock', true));
  useEffect(() => writeStore('bf-harmony-dock', dockOpen), [dockOpen]);
  const stop = useCallback(() => {
    handle.current?.stop();
    handle.current = null;
    stopAll();
    setCadence(null);
    setActive(null);
    setMapPos({ measure: -1, beat: -1 });
    setBeatNow(-1);
    harmonicStore.set({ active: null });
  }, []);
  useEffect(() => () => stop(), [stop]);

  const hear = (c: Chord) => {
    setActive(c);
    harmonicStore.set({ active: c });
    playChord(c, opts.timbre);
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
        ...(bassLine ? { bass: bassLine } : {}),
        onBeat: (_i: number, b: number) => setBeatNow(b),
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
  const [instrument, setInstrument] = useState<'bass' | 'guitar' | 'piano'>('bass');
  const [bassStrings, setBassStrings] = useState<number>(4);
  const [chordLevel, setChordLevel] = useState<'simple' | 'full'>('simple');
  const [neckLabel, setNeckLabel] = useState<'note' | 'fret' | 'finger'>('note');
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
  const [semis, setSemis] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const shown = useMemo(() => (map ? transposeMap(map, semis) : null), [map, semis]);
  const insight = useMemo(() => (shown ? analyzeMap(shown, flats) : []), [shown, flats]);

  function buildFromText() {
    const bars = parseChordText(opts.text);
    if (!bars.length) {
      setError('Não achei acordes. Escreva como "| C | Am | Dm7 / G7 / |".');
      return;
    }
    setError(null);
    setSemis(0);
    setSelMeasure(null);
    const m = mapFromBars('Mapa harmônico', bars, { bpm: opts.bpm });
    setMap(m);
    setOpts((o) => ({ ...o, tonic: m.key.tonic, mode: m.key.mode }));
  }
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

  function mapFromCadence(c: Cadence) {
    const chords = cadenceChords(c, tonality, opts.tetrads);
    const bars = [...chords, ...chords].map((f) => ({ chords: [{ chord: f.chord, beat: 0, beats: 4 }] }));
    setSemis(0);
    setSelMeasure(null);
    setMap(mapFromBars(`${c.style} em ${chordSymbol({ root: tonality.tonic, quality: tonality.mode === 'minor' ? 'm' : '' }, flats)}`, bars, { key: tonality, bpm: opts.bpm }));
  }

  function playMap() {
    if (!shown) return;
    stop();
    const steps = shown.measures.flatMap((m) => m.chords.map((c) => ({ chord: c.chord, beats: c.beats, measure: m.index, beat: c.beat })));
    handle.current = playProgression(steps, opts.bpm, {
      timbre: opts.timbre,
      loop: opts.loop,
      ...(bassLine ? { bass: bassLine } : {}),
      onBeat: (_i: number, b: number) => setBeatNow(b),
      onStep: (i) => {
        const s = steps[i]!;
        setMapPos({ measure: s.measure, beat: s.beat });
        setActive(s.chord);
        harmonicStore.set({ active: s.chord });
      },
      onEnd: () => stop(),
    });
  }

  async function exportMap(kind: 'pdf' | 'txt' | 'json') {
    if (!shown) return;
    setError(null);
    try {
      const picked = await window.baixaria.chooseExportPath(kind, `${shown.title}${semis ? ` (${semis > 0 ? '+' : ''}${semis})` : ''}`);
      if (picked.canceled) return;
      if (kind === 'json') await window.baixaria.writeExportFile(picked.path, new TextEncoder().encode(JSON.stringify({ ...shown, analysis: insight }, null, 2)));
      else if (kind === 'txt') await window.baixaria.writeExportFile(picked.path, new TextEncoder().encode('﻿' + mapText(shown, { degrees: opts.view !== 'chords', flats })));
      else {
        await window.baixaria.exportMapPdf(picked.path, {
          title: shown.title,
          key: `${chordSymbol({ root: shown.key.tonic, quality: '' }, flats)} ${shown.key.mode === 'minor' ? 'menor' : 'maior'}`,
          bpm: shown.bpm,
          transpose: semis,
          sections: shown.sections.map((s) => ({
            name: s.name,
            from: s.from,
            to: s.to,
            ...(s.letter ? { letter: s.letter } : {}),
            ...(s.repeatOf ? { repeatOf: s.repeatOf } : {}),
            bars: shown.measures.slice(s.from, s.to + 1).map((m) => ({
              n: m.index + 1,
              chords: m.chords.map((c, k) => (opts.view === 'degrees' ? insight[m.index]![k]!.roman : opts.view === 'hybrid' ? `${chordSymbol(c.chord, flats)} ${insight[m.index]![k]!.roman}` : chordSymbol(c.chord, flats))),
              bass: opts.density === 'study' ? m.chords.map((c, k) => `${insight[m.index]![k]!.targets.root}${insight[m.index]![k]!.approach ? `→${insight[m.index]![k]!.approach!.note}` : ''}`) : [],
            })),
          })),
        });
      }
      setNotice(`Mapa exportado em ${kind === 'json' ? 'JSON' : kind === 'pdf' ? 'PDF' : 'texto'}.`);
    } catch (e) {
      setError(errorText(e, 'falha ao exportar o mapa'));
    }
  }

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
  const levelChord = useMemo(() => (chordLevel === 'simple' ? simplifyChord(currentChord, 'simple') : currentChord), [chordLevel, currentChord]);
  const bassTuning = BASS_TUNINGS.find((t) => t.strings.length === bassStrings) ?? BASS_TUNINGS[0]!;
  const bassPattern = bassRoleNotes(levelChord, bassRole, bassTuning);
  const beatPattern = bassRolePattern(levelChord, bassRole, 4);
  const currentBassMidi = beatNow >= 0 ? (beatPattern[beatNow % beatPattern.length] ?? null) : null;
  const bassDisplay: NeckNote[] = bassPattern.map((n) => ({
    pos: n.pos,
    midi: n.midi,
    state: beatNow < 0 ? (n.order === 1 ? 'now' : 'next') : n.midi === currentBassMidi ? 'now' : 'later',
    finger: n.pos.fret === 0 ? 0 : ((n.pos.fret - 1) % 4) + 1,
  }));
  const tones = chordTones(levelChord);
  const orderedPianoMidis = tones.map((tone) => tone.midi).sort((a, b) => a - b);
  const pianoMarks = orderedPianoMidis.map((midi, index) => ({ midi, state: 'now' as const, role: 'base' as const, order: index + 1 }));
  const pianoRange = keyboardRange(orderedPianoMidis);
  const guitarVoicingDisplay = guitarVoicing(levelChord, { mode: 'caged', level: chordLevel, near: 3 });

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
      {(error || notice) && (
        <p className={error ? 'alert' : 'ok-line'} role={error ? 'alert' : 'status'}>
          <Icon name={error ? 'alert' : 'check'} size={16} /> {error ?? notice}
        </p>
      )}
      <div className="harmony-top">
        <div className="card cof-card">
          <CircleOfFifthsWheel selected={selectedSlot} field={field} active={activeSlot} onPick={pick}>
            <b className="hub-key">{keyName}</b>
            <span className="hub-sig">{signatureText(tonality.mode === 'major' ? sigSlot.signature : sigSlot.signature)}</span>
            <span className="hub-acts">
              <button className="ghost small-btn" onClick={playScaleNow} title="Tocar a escala do tom (sobe e desce)">
                Escala
              </button>
              <button className="ghost small-btn" onClick={() => playField()}>
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
          playing={cadence}
          onPlayChord={hear}
          onPlayCadence={playCadence}
          onStop={stop}
        />
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
      { timbre: opts.timbre, ...(bassLine ? { bass: bassLine } : {}), onBeat: (_i: number, b: number) => setBeatNow(b), onStep: (i) => (setActive(chords[i]!.chord), harmonicStore.set({ active: chords[i]!.chord })), onEnd: () => stop() },
    );
  }
}

/** Edição feita na visão transposta volta para o tom do mapa guardado. */
function transposeChordBack(c: Chord, semis: number): Chord {
  if (!semis) return c;
  const t = (x: number) => (((x - semis) % 12) + 12) % 12;
  return { ...c, root: t(c.root), ...(c.bass !== undefined ? { bass: t(c.bass) } : {}) };
}
