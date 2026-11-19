import { useEffect, useMemo, useRef, useState } from 'react';
import { BASS_TUNINGS, fingerZones, hitWindowSec, keyUsesFlats, pcName, transposeChord, type Verdict } from '@domain';
import { Icon } from '@baixaria/ui-core';
import { Knob } from '@baixaria/ui-core';
import { Neck, type NeckMark } from '@baixaria/ui-core';
import { getAudioContext } from '@baixaria/audio-synth';
import { INSTRUMENT_INPUT, clickAt, listInputs, pluckAt, startInput, type InputEngine } from '../../lib/practice.js';
import { readStore, writeStore } from '@baixaria/ui-core';
import { PACK_EXTENSION, parseExchange, type Exercise, type PackSong } from '@baixaria/exchange-contract';
import { addToLibrary, exerciseToSong, loadLibrary, saveLibrary, type LibraryItem } from './exerciseLibrary.js';

/**
 * Linha do baixo de uma música como exercício progressivo (enviada pela Tablatura da música).
 * Trecho a trecho (2, 4 ou 8 compassos, ou uma parte do mapa): toca em loop e, no modo progressivo,
 * avança sozinho para o próximo trecho a cada N voltas; o andamento pode subir até o da música.
 * A linha pode ser transposta para qualquer tom; o braço mostra corda, casa e dedo, sem corda solta.
 */
/** A música vem do MixerMonster num pacote .mcraft-pack (contrato em @baixaria/exchange-contract). */
export type SongExerciseData = PackSong;

const KEY = 'bf-song-exercise';
const OPTS = 'bf-song-exercise-opts';
const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Muda o tom de um nome de acorde ("F#m7/A" → +2 → "G#m7/B"). */
function transposeName(name: string, semis: number): string {
  if (!semis || name === '—') return name;
  const m = /^([A-G][#b]?)(.*?)(?:\/([A-G][#b]?))?$/.exec(name);
  if (!m) return name;
  const idx = (n: string) => (SHARPS.indexOf(n.replace('Db', 'C#').replace('Eb', 'D#').replace('Gb', 'F#').replace('Ab', 'G#').replace('Bb', 'A#')) + 12) % 12;
  const flats = /b/.test(m[1]!.slice(1));
  const root = idx(m[1]!);
  const c = transposeChord({ root, quality: m[2] ?? '', ...(m[3] ? { bass: idx(m[3]) } : {}) }, semis);
  const nm = (p: number) => pcName(p, flats);
  return `${nm(c.root)}${m[2] ?? ''}${c.bass !== undefined ? `/${nm(c.bass)}` : ''}`;
}

/** Botão de importação: lê um .mcraft-pack de música ou de exercício (arquivo não confiável, validado pelo contrato). */
function ImportPack({ onImported, onExercise, label }: { onImported(song: SongExerciseData): void; onExercise(ex: Exercise): void; label: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    const r = parseExchange(new Uint8Array(await file.arrayBuffer()));
    if (!r.ok) {
      const detail = r.issues?.slice(0, 5).map((i) => `${i.path || 'exercício'}: ${i.message}`).join('; ');
      return setError(`Não deu para importar "${file.name}": ${r.error}${detail ? ` (${detail})` : ''}.`);
    }
    if (r.kind === 'exercise') return onExercise(r.pack.exercise);
    onImported(r.pack.song);
  };
  return (
    <>
      <button className="primary small-btn" onClick={() => input.current?.click()} title="Abrir um pacote salvo pelo MixerMonster (Tablatura → Enviar ao ScaleMonster)">
        <Icon name="import" size={14} /> {label}
      </button>
      <input
        ref={input}
        type="file"
        accept={`${PACK_EXTENSION},application/json,application/octet-stream`}
        hidden
        aria-label="Arquivo do pacote da música"
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

/** Biblioteca de exercícios importados: tocar abre o exercício no treino; remover tira da lista. */
function ExerciseLibrary({ items, onPlay, onRemove, notice }: { items: LibraryItem[]; onPlay(ex: Exercise): void; onRemove(id: string): void; notice: string | null }) {
  return (
    <section className="card exercise-library" aria-label="Biblioteca de exercícios">
      <h3>Exercícios importados</h3>
      {notice && (
        <p className="muted small" role="status">
          {notice}
        </p>
      )}
      {items.length === 0 ? (
        <p className="muted small">Nenhum exercício guardado. Importe um pacote de exercício (gerado no MixerMonster ou por outra ferramenta).</p>
      ) : (
        <ul className="exercise-library-list">
          {items.map((it) => (
            <li key={it.id}>
              <span>
                <b>{it.exercise.title}</b>{' '}
                <span className="muted small">
                  · nível {it.exercise.level} · {it.exercise.steps.length} notas · {it.exercise.bpm} BPM · {it.exercise.origin.type === 'mixer' ? 'do MixerMonster' : 'autoral'}
                </span>
              </span>
              <span className="spacer" />
              <button className="ghost small-btn" onClick={() => onPlay(it.exercise)}>
                Tocar
              </button>
              <button className="ghost small-btn" onClick={() => onRemove(it.id)} aria-label={`Remover ${it.exercise.title}`}>
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function SongExercise() {
  const [data, setData] = useState(() => readStore<SongExerciseData | null>(KEY, null));
  const [library, setLibrary] = useState<LibraryItem[]>(() => loadLibrary());
  const [notice, setNotice] = useState<string | null>(null);
  const addExercise = (ex: Exercise) => {
    const next = addToLibrary(library, ex);
    saveLibrary(next);
    setLibrary(next);
    setNotice(`Exercício "${ex.title}" guardado na biblioteca.`);
  };
  const removeExercise = (id: string) => {
    const next = library.filter((x) => x.id !== id);
    saveLibrary(next);
    setLibrary(next);
  };
  const imported = (song: SongExerciseData) => {
    writeStore(KEY, song);
    setData(song);
    setBpm(Math.max(40, Math.round(song.bpm * 0.7)));
    setChunk(0);
  };
  const [o, setO] = useState(() => readStore(OPTS, { semis: 0, chunk: 4 as number | 'section', progressive: true, every: 2, strings: 4, ramp: true, label: 'finger' as 'finger' | 'fret' | 'note', click: true, sound: true }));
  useEffect(() => writeStore(OPTS, o), [o]);
  const set = <K extends keyof typeof o>(k: K, v: (typeof o)[K]) => setO((x) => ({ ...x, [k]: v }));
  /** Tocar um exercício da biblioteca: entra no treino como um trecho de música (sem acordes). */
  const playExercise = (ex: Exercise) => imported(exerciseToSong(ex));
  const [bpm, setBpm] = useState(() => Math.max(40, Math.round((data?.bpm ?? 100) * 0.7)));
  const tuning = BASS_TUNINGS.find((t) => t.strings.length === o.strings) ?? BASS_TUNINGS[0]!;

  // Trechos: blocos de N compassos, ou as partes do mapa.
  const chunks = useMemo(() => {
    if (!data) return [];
    const n = data.bars.length;
    if (o.chunk === 'section' && data.sections.length) return data.sections.map((s) => ({ from: s.from, to: s.to, name: s.name }));
    const size = typeof o.chunk === 'number' ? o.chunk : 4;
    const out: Array<{ from: number; to: number; name: string }> = [];
    for (let b = 0; b < n; b += size) out.push({ from: b, to: Math.min(n - 1, b + size - 1), name: `Compassos ${b + 1}–${Math.min(n, b + size)}` });
    return out;
  }, [data, o.chunk]);
  const [chunk, setChunk] = useState(0);
  useEffect(() => setChunk((c) => Math.min(c, Math.max(0, chunks.length - 1))), [chunks.length]);
  const cur = chunks[chunk];

  // Notas do trecho no tom escolhido, com corda, casa e dedo (zona da mão, sem corda solta).
  const notes = useMemo(() => {
    if (!data || !cur) return [];
    const lo = tuning.strings[0]!;
    const hi = tuning.strings[tuning.strings.length - 1]! + tuning.frets;
    const raw = data.bars.slice(cur.from, cur.to + 1).flatMap((b, k) =>
      b.notes.map((n) => {
        let m = n.midi + o.semis;
        while (m > hi) m -= 12;
        while (m < lo) m += 12;
        return { midi: m, beat: k * 4 + n.beat, len: n.len, bar: cur.from + k };
      }),
    );
    const z = fingerZones(
      raw.map((n) => n.midi),
      tuning,
      raw.map((n) => n.beat * 0.5),
    );
    return raw.map((n, i) => ({ ...n, pos: z[i]?.pos ?? null, zone: z[i]?.zone ?? null }));
  }, [data, cur, o.semis, tuning]);
  const beatsInChunk = cur ? (cur.to - cur.from + 1) * 4 : 4;

  /* ------------------------------ reprodução ------------------------------ */
  const [playing, setPlaying] = useState(false);
  const [beatPos, setBeatPos] = useState(-1);
  const [loops, setLoops] = useState(0);
  const sched = useRef<{ timer: number; out: GainNode; t0: number; beatSec: number } | null>(null);
  // Desafio: ouve o baixo (interface ou microfone) e julga cada nota (certa, oitava, errada).
  const [challenge, setChallenge] = useState(false);
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [latency, setLatency] = useState(() => readStore('bf-input-latency', { ms: 30 }).ms);
  useEffect(() => writeStore('bf-input-latency', { ms: latency }), [latency]);
  const [score, setScore] = useState({ hit: 0, octave: 0, miss: 0 });
  const [last, setLast] = useState<Verdict | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const input = useRef<InputEngine | null>(null);
  const due = useRef<Array<{ id: number; midi: number; at: number; deadline: number }>>([]);
  useEffect(() => {
    void listInputs()
      .then((list) => {
        setInputs(list);
        const um2 = list.find((d) => INSTRUMENT_INPUT.test(d.label));
        if (um2) setDeviceId(um2.deviceId);
      })
      .catch(() => setInputs([]));
  }, []);
  const live = useRef({ notes, beatsInChunk, bpm, chunk, chunks, o, loops: 0 });
  live.current = { ...live.current, notes, beatsInChunk, bpm, chunk, chunks, o };

  function stop() {
    if (sched.current) {
      window.clearInterval(sched.current.timer);
      sched.current.out.disconnect();
    }
    sched.current = null;
    input.current?.stop();
    input.current = null;
    due.current = [];
    setPlaying(false);
    setBeatPos(-1);
  }
  useEffect(() => () => stop(), []);

  async function start() {
    if (!notes.length) return;
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') await ctx.resume();
    stop();
    setScore({ hit: 0, octave: 0, miss: 0 });
    setLast(null);
    setInputError(null);
    if (challenge) {
      try {
        input.current = await startInput(
          deviceId,
          ({ verdict }) => {
            setScore((sc) => ({ ...sc, [verdict]: sc[verdict] + 1 }));
            setLast(verdict);
          },
          latency / 1000,
        );
      } catch (e) {
        setInputError(e instanceof Error ? e.message : 'não foi possível abrir a entrada de áudio');
        return;
      }
    }
    let noteId = 0;
    const out = ctx.createGain();
    out.connect(ctx.destination);
    const beatSec = 60 / bpm;
    const t0 = ctx.currentTime + 0.15;
    for (let k = 0; k < 4; k++) clickAt(t0 + k * beatSec, k === 0, 0.7, out); // contagem
    let loopStart = t0 + 4 * beatSec;
    let scheduledTo = loopStart;
    let loopBeat = beatSec;
    live.current.loops = 0;
    setLoops(0);
    const pump = () => {
      const L = live.current;
      const until = ctx.currentTime + 0.3;
      while (scheduledTo < until) {
        const loopEnd = loopStart + L.beatsInChunk * loopBeat;
        if (scheduledTo >= loopEnd - 1e-6) {
          // Fim da volta: progressivo avança o trecho; o andamento sobe 5 BPM até o da música.
          L.loops++;
          setLoops(L.loops);
          if (L.o.progressive && L.loops % L.o.every === 0) setChunk((c) => (c + 1) % Math.max(1, L.chunks.length));
          if (L.o.ramp && L.loops % L.o.every === 0) setBpm((b) => Math.min(Math.max(b, data?.bpm ?? b), b + 5));
          loopStart = loopEnd;
          loopBeat = 60 / live.current.bpm;
          // Trecho novo: espera a tela trocar as notas antes de agendar a próxima volta.
          if (L.o.progressive && L.loops % L.o.every === 0) return;
          continue;
        }
        // Agenda um tempo de cada vez: clique e as notas que caem nele.
        const beatIdx = Math.round((scheduledTo - loopStart) / loopBeat);
        if (L.o.click) clickAt(scheduledTo, beatIdx % 4 === 0, 0.4, out);
        for (const n of L.notes) {
          if (!(n.beat >= beatIdx && n.beat < beatIdx + 1)) continue;
          const at = loopStart + n.beat * loopBeat;
          // No desafio a guia toca baixinho; a nota que vale é a sua.
          if (L.o.sound) pluckAt(at, n.midi, input.current ? 0.12 : 0.45, out, n.len * loopBeat * 0.95);
          if (input.current) due.current.push({ id: noteId++, midi: n.midi, at, deadline: at + hitWindowSec(60 / loopBeat) });
        }
        scheduledTo += loopBeat;
      }
    };
    pump();
    const timer = window.setInterval(pump, 40);
    sched.current = { timer, out, t0: loopStart, beatSec };
    setPlaying(true);
    // Relógio da tela: posição em tempos dentro do trecho.
    const tick = () => {
      if (!sched.current) return;
      const L = live.current;
      const b = (ctx.currentTime - loopStart) / loopBeat;
      setBeatPos(b < 0 ? -1 : b % L.beatsInChunk);
      // Entrega ao juiz cada nota na hora em que ela deve soar.
      while (due.current.length && due.current[0]!.at <= ctx.currentTime) {
        const d = due.current.shift()!;
        input.current?.expect(d.id, d.midi, d.deadline);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  if (!data) {
    return (
      <>
      <div className="card song-ex-empty">
        <Icon name="tab" size={22} />
        <p className="muted">
          Estude a linha do baixo de uma música, compasso a compasso com a harmonia. No <b>MixerMonster</b>, abra a música, clique em <b>Tablatura</b> e em <b>Enviar ao ScaleMonster</b>; depois importe o arquivo aqui.
        </p>
        <ImportPack label="Importar música" onImported={imported} onExercise={addExercise} />
      </div>
      <ExerciseLibrary items={library} onPlay={playExercise} onRemove={removeExercise} notice={notice} />
      </>
    );
  }

  const flats = keyUsesFlats(null);
  const nowIdx = notes.findIndex((n) => beatPos >= n.beat && beatPos < n.beat + Math.max(0.25, n.len));
  const nextIdx = notes.findIndex((n) => n.beat > beatPos);
  const marks: NeckMark[] = [];
  const seen = new Set<string>();
  const labelOf = (n: (typeof notes)[number]) => (o.label === 'fret' ? String(n.pos!.fret) : o.label === 'note' ? pcName(n.midi, flats) : String(Math.max(1, Math.min(4, n.pos!.fret - (n.zone ?? n.pos!.fret) + 1))));
  notes.forEach((n) => {
    if (!n.pos) return;
    const k = `${n.pos.string}:${n.pos.fret}`;
    if (seen.has(k)) return;
    seen.add(k);
    marks.push({ pos: n.pos, label: labelOf(n), state: 'later' });
  });
  if (nextIdx >= 0 && notes[nextIdx]!.pos) marks.push({ pos: notes[nextIdx]!.pos!, label: labelOf(notes[nextIdx]!), state: 'next' });
  if (nowIdx >= 0 && notes[nowIdx]!.pos) marks.push({ pos: notes[nowIdx]!.pos!, label: labelOf(notes[nowIdx]!), state: 'now' });
  const frets = notes.flatMap((n) => (n.pos ? [n.pos.fret] : []));
  const fromFret = frets.length ? Math.max(0, Math.min(...frets) - 1) : 0;
  const toFret = frets.length ? Math.max(fromFret + 5, Math.max(...frets) + 1) : 12;
  const curBar = cur && beatPos >= 0 ? cur.from + Math.floor(beatPos / 4) : -1;

  return (
    <div className="song-ex">
      <ExerciseLibrary items={library} onPlay={playExercise} onRemove={removeExercise} notice={notice} />
      <div className="card song-ex-head">
        <div>
          <h2>{data.title}</h2>
          <span className="muted small">
            {data.source} · {data.bars.length} compassos · tom original {data.key} · {data.bpm} BPM
          </span>
        </div>
        <div className="spacer" />
        <ImportPack label="Importar outra" onImported={imported} onExercise={addExercise} />
        <div className="field">
          <span>Transpor</span>
          <div className="key-pick">
            <button className="ghost icon-btn" onClick={() => set('semis', Math.max(-12, o.semis - 1))} disabled={playing} aria-label="Meio tom abaixo">
              <Icon name="minus" size={13} />
            </button>
            <b className="semis">{o.semis === 0 ? 'original' : `${o.semis > 0 ? '+' : ''}${o.semis}`}</b>
            <button className="ghost icon-btn" onClick={() => set('semis', Math.min(12, o.semis + 1))} disabled={playing} aria-label="Meio tom acima">
              <Icon name="plus" size={13} />
            </button>
          </div>
        </div>
        <label className="field">
          <span>Trecho</span>
          <select value={String(o.chunk)} disabled={playing} onChange={(e) => set('chunk', e.target.value === 'section' ? 'section' : Number(e.target.value))}>
            <option value="1">1 compasso</option>
            <option value="2">2 compassos</option>
            <option value="4">4 compassos</option>
            <option value="8">8 compassos</option>
            <option value="section">Partes do mapa</option>
          </select>
        </label>
        <div className="field">
          <span>Cordas</span>
          <div className="seg small">
            {[4, 5, 6].map((n) => (
              <button key={n} aria-pressed={o.strings === n} disabled={playing} onClick={() => set('strings', n)}>
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card ex-stage">
        <div className="ex-stage-head">
          <h2>{cur?.name ?? '—'}</h2>
          <span className="tour-stage">
            Trecho {chunk + 1} de {chunks.length}
          </span>
          <div className="spacer" />
          <button className="ghost icon-btn" disabled={playing || chunk === 0} onClick={() => setChunk((c) => Math.max(0, c - 1))} aria-label="Trecho anterior">
            <Icon name="back" size={14} />
          </button>
          <button className="ghost icon-btn flip" disabled={playing || chunk >= chunks.length - 1} onClick={() => setChunk((c) => Math.min(chunks.length - 1, c + 1))} aria-label="Próximo trecho">
            <Icon name="back" size={14} />
          </button>
          <div className="seg tiny" role="group" aria-label="Rótulo das notas">
            {(
              [
                ['finger', 'Dedo'],
                ['fret', 'Casa'],
                ['note', 'Nota'],
              ] as const
            ).map(([v, l]) => (
              <button key={v} aria-pressed={o.label === v} onClick={() => set('label', v)}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="song-ex-bars">
          {cur &&
            data.bars.slice(cur.from, cur.to + 1).map((b, k) => (
              <span key={k} className={`song-ex-bar ${cur.from + k === curBar ? 'cur' : ''}`}>
                <i>{cur.from + k + 1}</i> {b.chords.map((c) => transposeName(c, o.semis)).join('  ')}
              </span>
            ))}
        </div>
        {notes.length ? (
          <Neck className="ex-neck" tuning={tuning} fromFret={fromFret} toFret={toFret} marks={marks} flats={flats} rowH={30} />
        ) : (
          <p className="muted">Sem notas neste trecho (pausa do baixo). Avance para o próximo.</p>
        )}
      </div>

      <footer className="ex-transport card">
        <button className="primary round big" onClick={() => (playing ? stop() : void start())} disabled={!notes.length} aria-label={playing ? 'Parar' : 'Começar'}>
          <Icon name={playing ? 'stop' : 'play'} size={20} />
        </button>
        <div className="bpm">
          <Knob value={bpm} min={40} max={240} step={1} defaultValue={Math.round(data.bpm * 0.7)} size={40} disabled={playing} label="Andamento" format={(v) => `${Math.round(v)} BPM`} onChange={(v) => setBpm(Math.round(v))} />
          <span className="bpm-value">
            <b>{bpm}</b> BPM <span className="muted small">({Math.round((bpm / data.bpm) * 100)}% da música)</span>
          </span>
        </div>
        <label className="check">
          <input type="checkbox" checked={o.progressive} onChange={() => set('progressive', !o.progressive)} /> Progressivo: próximo trecho a cada
        </label>
        <select className="input-select" value={o.every} onChange={(e) => set('every', Number(e.target.value))} aria-label="Voltas por trecho">
          {[1, 2, 3, 4, 6, 8].map((n) => (
            <option key={n} value={n}>
              {n} {n === 1 ? 'volta' : 'voltas'}
            </option>
          ))}
        </select>
        <label className="check">
          <input type="checkbox" checked={o.ramp} onChange={() => set('ramp', !o.ramp)} /> Acelerar até o andamento da música
        </label>
        <label className="check">
          <input type="checkbox" checked={o.click} onChange={() => set('click', !o.click)} /> Metrônomo
        </label>
        <div className="spacer" />
        <label className="check">
          <input type="checkbox" checked={o.sound} onChange={() => set('sound', !o.sound)} /> Som da linha
        </label>
        <label className="check challenge">
          <input type="checkbox" checked={challenge} disabled={playing} onChange={() => setChallenge((c) => !c)} /> Desafio
        </label>
        {challenge && (
          <>
            <select className="input-select" value={deviceId ?? ''} disabled={playing} onChange={(e) => setDeviceId(e.target.value || null)} aria-label="Entrada de áudio">
              <option value="">Entrada padrão</option>
              {inputs.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || 'Entrada sem nome'}
                </option>
              ))}
            </select>
            <label className="check" title="Atraso da sua interface de áudio: se notas certas aparecem como erradas, aumente">
              Atraso
              <select className="input-select" value={latency} disabled={playing} onChange={(e) => setLatency(Number(e.target.value))}>
                {[0, 10, 20, 30, 45, 60, 80, 100, 130, 160].map((v) => (
                  <option key={v} value={v}>
                    {v} ms
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {(() => {
          const total = score.hit + score.octave + score.miss;
          const pct = total ? Math.round(((score.hit + score.octave * 0.5) / total) * 100) : null;
          return (
            <span className="score" title={`${score.hit} certas, ${score.octave} na oitava errada, ${score.miss} erradas`}>
              {pct !== null && (
                <>
                  <b>{pct}%</b> · {score.hit}✓ {score.octave ? `${score.octave}↕ ` : ''}
                  {score.miss}✗ {last && <span className={`verdict ${last}`}>{last === 'hit' ? 'certa' : last === 'octave' ? 'oitava' : 'errada'}</span>} ·{' '}
                </>
              )}
              {loops > 0 && `${loops} voltas`}
            </span>
          );
        })()}
      </footer>
      {inputError && (
        <p className="alert" role="alert">
          <Icon name="alert" size={16} /> Entrada de áudio: {inputError}
        </p>
      )}
    </div>
  );
}
