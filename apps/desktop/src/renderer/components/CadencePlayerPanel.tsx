import { useMemo, useRef, useState } from 'react';
import { CADENCES, PROGRESSION_GENRES, cadenceChords, cadenceGenre, chordNoteNames, chordSymbol, harmonicField, keyUsesFlats, type Cadence, type Chord, type Key, type ProgressionGenre } from '@domain';
import { Icon } from './Icons.js';
import { RHYTHMS, TIMBRES, TIMBRE_GROUPS, previewTimbre, type Rhythm, type Timbre } from '../lib/harmonyAudioEngine.js';
import { readStore, writeStore } from '../lib/store.js';

/**
 * Painel de som e progressões da Harmonia:
 * - barra de som: tríades/tétrades, timbre (em grupos, com prévia), levada, tempos por acorde,
 *   andamento (com "bater o tempo"), bateria, loop e parar;
 * - campo harmônico do tom (cada cartão toca o acorde);
 * - progressões: busca, filtro por estilo, favoritas; cada linha mostra os acordes com o grau, o acorde
 *   que soa acende e uma barra mostra o andamento da progressão.
 */
interface Props {
  tonality: Key;
  tetrads: boolean;
  onTetrads(v: boolean): void;
  bpm: number;
  onBpm(v: number): void;
  timbre: Timbre;
  onTimbre(v: Timbre): void;
  loop: boolean;
  onLoop(v: boolean): void;
  rhythm: Rhythm;
  onRhythm(v: Rhythm): void;
  drums: boolean;
  onDrums(v: boolean): void;
  chordBeats: number;
  onChordBeats(v: number): void;
  /** Progressão tocando agora e o passo atual. */
  playing: { readonly id: string; readonly step: number } | null;
  onPlayChord(chord: Chord): void;
  onPlayCadence(c: Cadence): void;
  onStop(): void;
}

const FN_CLASS: Record<string, string> = { Tônica: 'fn-t', Subdominante: 'fn-s', Dominante: 'fn-d' };
type Filter = 'all' | 'fav' | ProgressionGenre;

export function CadencePlayerPanel(p: Props) {
  const { tonality, tetrads, playing } = p;
  const flats = keyUsesFlats(tonality);
  const field = harmonicField(tonality, tetrads);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>(() => readStore<Filter>('bf-harmony-filter', 'all'));
  const [favs, setFavs] = useState<string[]>(() => readStore<string[]>('bf-harmony-favs', []));
  const taps = useRef<number[]>([]);

  const inKey = useMemo(() => CADENCES.filter((c) => !c.mode || c.mode === tonality.mode), [tonality.mode]);
  const q = query.trim().toLowerCase();
  const list = inKey.filter((c) => {
    if (filter === 'fav' && !favs.includes(c.id)) return false;
    if (filter !== 'all' && filter !== 'fav' && cadenceGenre(c) !== filter) return false;
    return !q || `${c.style} ${c.name} ${cadenceGenre(c)}`.toLowerCase().includes(q);
  });
  const genres = PROGRESSION_GENRES.filter((g) => inKey.some((c) => cadenceGenre(c) === g));
  const playingCad = playing ? CADENCES.find((c) => c.id === playing.id) : undefined;
  const playingChords = playingCad ? cadenceChords(playingCad, tonality, tetrads) : [];
  const nowChord = playing ? playingChords[playing.step] : undefined;
  const keyLabel = `${chordSymbol({ root: tonality.tonic, quality: tonality.mode === 'minor' ? 'm' : '' }, flats)} ${tonality.mode === 'minor' ? 'menor' : 'maior'}`;
  const count = (g: Filter) => (g === 'all' ? inKey.length : g === 'fav' ? inKey.filter((c) => favs.includes(c.id)).length : inKey.filter((c) => cadenceGenre(c) === g).length);

  function setF(f: Filter) {
    setFilter(f);
    writeStore('bf-harmony-filter', f);
  }
  function toggleFav(id: string) {
    const next = favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id];
    setFavs(next);
    writeStore('bf-harmony-favs', next);
  }
  function tap() {
    const now = performance.now();
    taps.current = [...taps.current.filter((t) => now - t < 2500), now].slice(-6);
    if (taps.current.length >= 2) {
      const gaps = taps.current.slice(1).map((t, i) => t - taps.current[i]!);
      const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      p.onBpm(Math.max(40, Math.min(200, Math.round(60000 / avg))));
    }
  }

  return (
    <div className="cadence-panel">
      <div className="cad-controls card" role="toolbar" aria-label="Som do acompanhamento">
        <div className="cad-ctl">
          <span className="cad-ctl-label">Acordes</span>
          <div className="seg tiny" role="group" aria-label="Tríades ou tétrades">
            <button aria-pressed={!tetrads} onClick={() => p.onTetrads(false)}>
              Tríades
            </button>
            <button aria-pressed={tetrads} onClick={() => p.onTetrads(true)}>
              Tétrades
            </button>
          </div>
        </div>
        <div className="cad-ctl">
          <span className="cad-ctl-label">Timbre</span>
          <div className="cad-inline">
            <select value={p.timbre} onChange={(e) => p.onTimbre(e.target.value as Timbre)} aria-label="Timbre">
              {TIMBRE_GROUPS.map((g) => (
                <optgroup key={g} label={g}>
                  {TIMBRES.filter((t) => t.group === g).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button className="ghost icon-btn" onClick={() => previewTimbre(p.timbre)} aria-label="Ouvir o timbre" title="Ouvir o timbre">
              <Icon name="play" size={12} />
            </button>
          </div>
        </div>
        <div className="cad-ctl">
          <span className="cad-ctl-label">Levada</span>
          <select value={p.rhythm} onChange={(e) => p.onRhythm(e.target.value as Rhythm)} aria-label="Levada">
            {RHYTHMS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div className="cad-ctl">
          <span className="cad-ctl-label">Tempos por acorde</span>
          <div className="seg tiny" role="group" aria-label="Tempos por acorde">
            {[2, 4, 8].map((n) => (
              <button key={n} aria-pressed={p.chordBeats === n} onClick={() => p.onChordBeats(n)}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className="cad-ctl cad-bpm">
          <span className="cad-ctl-label">Andamento</span>
          <div className="cad-inline">
            <input type="range" min={40} max={200} value={p.bpm} onChange={(e) => p.onBpm(Number(e.target.value))} aria-label="Andamento" />
            <b className="bpm-num">{p.bpm}</b>
            <button className="ghost small-btn" onClick={tap} title="Bata no ritmo (2 ou mais toques) para definir o andamento">
              Bater
            </button>
          </div>
        </div>
        <div className="cad-ctl cad-toggles">
          <label className="check">
            <input type="checkbox" checked={p.drums} onChange={() => p.onDrums(!p.drums)} /> Bateria
          </label>
          <label className="check">
            <input type="checkbox" checked={p.loop} onChange={() => p.onLoop(!p.loop)} /> Loop
          </label>
          <button className={playing ? 'primary small-btn' : 'ghost small-btn'} onClick={p.onStop} title="Parar tudo (Espaço também)">
            <Icon name="stop" size={13} /> Parar
          </button>
        </div>
      </div>

      <section className="card">
        <h3 className="cad-title">Campo harmônico de {keyLabel}</h3>
        <div className="field-grid">
          {field.map((f) => {
            const on = !!nowChord && nowChord.chord.root === f.chord.root;
            return (
              <button key={f.degree} className={`field-card ${FN_CLASS[f.fn]} ${on ? 'on' : ''}`} onClick={() => p.onPlayChord(f.chord)} title={`Tocar ${chordSymbol(f.chord, flats)}`}>
                <span className="fc-degree">{f.degree}</span>
                <b className="fc-chord">{chordSymbol(f.chord, flats)}</b>
                <span className="fc-fn">{f.fn}</span>
                <span className="fc-notes">{chordNoteNames(f.chord, flats).join(' ')}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="card prog-card">
        <header className="prog-head">
          <h3 className="cad-title">
            Progressões em {keyLabel} <span className="muted small">· {list.length} de {inKey.length}</span>
          </h3>
          <input className="prog-search" type="search" placeholder="Buscar (ex.: blues, ii – V)" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.stopPropagation()} aria-label="Buscar progressão" />
        </header>
        <nav className="coll-bar prog-filters" aria-label="Estilo">
          {(['all', 'fav', ...genres] as Filter[]).map((g) => (
            <button key={g} className={`coll-chip ${filter === g ? 'on' : ''}`} aria-pressed={filter === g} onClick={() => setF(g)}>
              {g === 'all' ? 'Todas' : g === 'fav' ? '★ Favoritas' : g}
              <span className="coll-n">{count(g)}</span>
            </button>
          ))}
        </nav>
        {list.length === 0 ? (
          <p className="muted small">{filter === 'fav' ? 'Marque uma progressão com ☆ para ela aparecer aqui.' : 'Nenhuma progressão com esta busca.'}</p>
        ) : (
          <div className="cad-list">
            {list.map((c) => {
              const chords = cadenceChords(c, tonality, tetrads);
              const isOn = playing?.id === c.id;
              const fav = favs.includes(c.id);
              return (
                <div key={c.id} className={`cad-row ${isOn ? 'on' : ''}`}>
                  <button className={isOn ? 'primary round-btn' : 'ghost round-btn'} onClick={() => (isOn ? p.onStop() : p.onPlayCadence(c))} aria-label={isOn ? `Parar ${c.style}` : `Tocar ${c.style}`}>
                    <Icon name={isOn ? 'stop' : 'play'} size={13} />
                  </button>
                  <span className="cad-name">
                    <b>{c.style}</b>
                    <span className="muted small">
                      {c.name} · <span className="prog-genre">{cadenceGenre(c)}</span>
                    </span>
                  </span>
                  <span className="cad-chords">
                    {chords.map((f, k) => (
                      <button key={k} type="button" className={`cad-chip ${FN_CLASS[f.fn] ?? ''} ${isOn && playing!.step === k ? 'now' : ''}`} onClick={() => p.onPlayChord(f.chord)} title={`${f.fn} · ${chordNoteNames(f.chord, flats).join(' ')}`}>
                        <b>{chordSymbol(f.chord, flats)}</b>
                        <span>{f.degree}</span>
                      </button>
                    ))}
                  </span>
                  <button className={`ghost icon-btn prog-fav ${fav ? 'on' : ''}`} onClick={() => toggleFav(c.id)} aria-pressed={fav} aria-label={fav ? 'Tirar das favoritas' : 'Marcar como favorita'} title={fav ? 'Tirar das favoritas' : 'Favorita'}>
                    {fav ? '★' : '☆'}
                  </button>
                  {isOn && (
                    <span className="prog-progress" aria-hidden="true">
                      <span style={{ width: `${((playing!.step + 1) / chords.length) * 100}%` }} />
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
