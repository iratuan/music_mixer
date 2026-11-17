import { BASS_TUNINGS, chordCandidates, chordNoteNames, chordSymbol, parseChord, pc, positionsOf, type Chord, type ChordInsight, type HarmonicMapData } from '@domain';
import { useState } from 'react';
import { Icon } from './Icons.js';
import { Neck, type NeckMark } from './Neck.js';

/**
 * Inspetor de condução de um compasso: notas de cada acorde, baixo/inversão, escala sugerida,
 * notas-alvo, condução até o próximo acorde e o braço do baixo com as notas do acorde (alvos em
 * destaque). Permite trocar o acorde por uma leitura alternativa, digitar outro ou dividir o compasso.
 */
interface Props {
  map: HarmonicMapData;
  insight: ChordInsight[][];
  measure: number;
  flats: boolean;
  onPlay(chord: Chord): void;
  onReplace?(chordIdx: number, chord: Chord): void;
  onSplit?(): void;
  onClose(): void;
}

const tuning = BASS_TUNINGS[0]!;

export function VoiceLeadingInspector({ map, insight, measure, flats, onPlay, onReplace, onSplit, onClose }: Props) {
  const m = map.measures[measure];
  const [draft, setDraft] = useState<string | null>(null);
  if (!m) return null;
  return (
    <aside className="card vl-inspector" aria-label={`Compasso ${measure + 1}`}>
      <header className="vl-head">
        <b>Compasso {measure + 1}</b>
        <span className="muted small">
          {m.beats} tempos · {m.chords.length === 1 ? '1 acorde' : `${m.chords.length} acordes`}
        </span>
        <div className="spacer" />
        {onSplit && m.chords.length === 1 && (
          <button className="ghost small-btn" onClick={onSplit} title="Dois acordes no compasso, dois tempos cada">
            Dividir em 2
          </button>
        )}
        <button className="ghost icon-btn" onClick={onClose} aria-label="Fechar inspetor">
          <Icon name="close" size={13} />
        </button>
      </header>
      {m.chords.map((c, k) => {
        const ins = insight[measure]?.[k];
        if (!ins) return null;
        const pcsAll = new Set([...chordNoteNames(c.chord, flats)]);
        const targetPcs = new Set(ins.targets.pcs);
        // Notas do acorde nas casas 1–7 do baixo; alvos (1, 3, 7) em destaque.
        const marks: NeckMark[] = [];
        for (let m2 = tuning.strings[0]!; m2 <= tuning.strings[tuning.strings.length - 1]! + 7; m2++) {
          const name = chordNoteNames({ root: m2, quality: '' }, flats)[0]!;
          if (!pcsAll.has(name)) continue;
          for (const p of positionsOf(m2, tuning)) {
            if (p.fret < 1 || p.fret > 7) continue;
            const isRoot = pc(m2) === pc(c.chord.root);
            marks.push({ pos: p, label: name, state: isRoot ? 'root' : targetPcs.has(pc(m2)) ? 'next' : 'later' });
          }
        }
        if (ins.approach) {
          for (const p of positionsOf(tuning.strings[0]! + ((ins.approach.pc - tuning.strings[0]! + 120) % 12), tuning)) {
            if (p.fret >= 1 && p.fret <= 7) marks.push({ pos: p, label: ins.approach.note, state: 'octave' });
          }
        }
        const symbol = chordSymbol(c.chord, flats);
        return (
          <div key={k} className="vl-chord">
            <div className="vl-row">
              <button className="vl-name" onClick={() => onPlay(c.chord)} title="Ouvir o acorde">
                <Icon name="play" size={12} /> {symbol}
              </button>
              <span className="hm-roman">{ins.roman}</span>
              {ins.fn && <span className="muted small">{ins.fn}</span>}
              {ins.kind !== 'diatonic' && <span className="vl-kind">{ins.kind === 'borrowed' ? 'empréstimo modal' : ins.kind === 'secondary' ? 'dominante secundário' : 'fora do tom'}</span>}
              <span className="muted small">
                tempo {Math.round(c.beat) + 1}, {c.beats} {c.beats === 1 ? 'tempo' : 'tempos'}
              </span>
            </div>
            <dl className="vl-facts">
              <dt>Notas</dt>
              <dd>{chordNoteNames(c.chord, flats).join(' · ')}</dd>
              <dt>Baixo</dt>
              <dd>{c.chord.bass !== undefined ? `${chordNoteNames({ root: c.chord.bass, quality: '' }, flats)[0]} (inversão ${symbol})` : 'fundamental'}</dd>
              <dt>Notas-alvo</dt>
              <dd>
                <b>{ins.targets.root}</b> (1) {ins.targets.third && <><b>{ins.targets.third}</b> (3) </>}
                {ins.targets.seventh && <><b>{ins.targets.seventh}</b> (7)</>}
              </dd>
              <dt>Escala</dt>
              <dd>{ins.scale}</dd>
              {ins.approach && (
                <>
                  <dt>Condução</dt>
                  <dd>{ins.approach.text}</dd>
                </>
              )}
            </dl>
            <Neck className="vl-neck" tuning={tuning} fromFret={1} toFret={7} marks={marks} flats={flats} rowH={22} />
            {onReplace && (
              <div className="vl-edit">
                <span className="muted small">Outras leituras:</span>
                {chordCandidates(c.chord).map((alt, j) => (
                  <button key={j} className="ghost small-btn" onClick={() => onReplace(k, alt)} title="Trocar por esta leitura">
                    {chordSymbol(alt, flats)}
                  </button>
                ))}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const parsed = draft ? parseChord(draft) : null;
                    if (parsed) onReplace(k, parsed);
                    setDraft(null);
                  }}
                >
                  <input className="vl-input" placeholder="outro acorde (ex.: Am7, C/E)" value={draft ?? ''} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.stopPropagation()} aria-label="Digitar acorde" />
                </form>
              </div>
            )}
          </div>
        );
      })}
    </aside>
  );
}
