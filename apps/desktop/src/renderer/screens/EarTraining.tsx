import { useCallback, useEffect, useRef, useState } from 'react';
import { EAR_CATEGORIES, comboMultiplier, earTypesOf, earXp, judgeTaps, randomChallenge, type EarCategory, type EarChallenge, type EarEvent } from '@domain';
import { EarStage, type StageKind } from '../components/EarStage.js';
import { call, loadUsers } from '../lib/db.js';
import { playEvents, playOne, type PlayHandle } from '../lib/earAudio.js';
import { readStore, writeStore } from '@baixaria/ui-core';

type Mode = 'practice' | 'survival' | 'time';
type Phase = 'listening' | 'answer' | 'path' | 'done';
const pc = (m: number) => ((Math.round(m) % 12) + 12) % 12;
const MODES: ReadonlyArray<{ id: Mode; label: string; hint: string }> = [
  { id: 'practice', label: 'Prática livre', hint: 'Sem limite: aprenda no seu ritmo.' },
  { id: 'survival', label: 'Sobrevivência', hint: '3 vidas; a dificuldade sobe a cada 5 acertos seguidos.' },
  { id: 'time', label: 'Contra o relógio', hint: '60 segundos: quantos você acerta?' },
];
const STAGES: ReadonlyArray<{ id: 'piano' | 'bass' | 'guitar'; label: string }> = [
  { id: 'piano', label: 'Teclado' },
  { id: 'bass', label: 'Braço de baixo' },
  { id: 'guitar', label: 'Braço de guitarra' },
];

interface Game {
  lives: number;
  correct: number;
  total: number;
  streak: number;
  best: number;
  xp: number;
}
const FRESH: Game = { lives: 3, correct: 0, total: 0, streak: 0, best: 0, xp: 0 };

export function EarTraining() {
  const [view, setView] = useState<'lobby' | 'play' | 'end'>('lobby');
  const [cat, setCat] = useState<EarCategory>(() => readStore<EarCategory>('bf-ear-cat', 'intervals'));
  const [typeId, setTypeId] = useState<string>(() => readStore<string>('bf-ear-type', 'mix'));
  const [mode, setMode] = useState<Mode>(() => readStore<Mode>('bf-ear-mode', 'practice'));
  const [stageInst, setStageInst] = useState<'piano' | 'bass' | 'guitar'>(() => readStore('bf-ear-stage', 'piano'));
  const [game, setGame] = useState<Game>(FRESH);
  const [ch, setCh] = useState<EarChallenge | null>(null);
  const [phase, setPhase] = useState<Phase>('listening');
  const [picks, setPicks] = useState<number[]>([]);
  const [chosenIdx, setChosenIdx] = useState<number | null>(null);
  const [taps, setTaps] = useState<number[]>([]);
  const [lit, setLit] = useState<number[]>([]);
  const [pulse, setPulse] = useState(0);
  const [path, setPath] = useState<{ from: number; to: number } | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string; badges: string[]; quests: string[] } | null>(null);
  const [timeLeft, setTimeLeft] = useState(60);
  const handle = useRef<PlayHandle | null>(null);
  const startedAt = useRef(0);
  const gameRef = useRef(game);
  gameRef.current = game;
  const chRef = useRef<EarChallenge | null>(null);
  chRef.current = ch;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const types = earTypesOf(cat);

  useEffect(() => () => handle.current?.cancel(), []);

  const flash = useCallback((midis: readonly number[]) => {
    setLit([...midis]);
    setPulse((p) => p + 1);
    window.setTimeout(() => setLit([]), 650);
  }, []);

  const listen = useCallback(
    (c: EarChallenge, open = true) => {
      handle.current?.cancel();
      const gap = c.typeId.startsWith('rhythm-echo') ? 0 : c.reference.length ? 2.2 : 0;
      const events: EarEvent[] = [...c.reference, ...c.events.map((e) => ({ ...e, at: e.at + gap }))];
      handle.current = playEvents(events, c.bpm, c.timbre, flash, c.drone);
      if (open) {
        setPhase('listening');
        window.setTimeout(() => setPhase((p) => (p === 'listening' ? 'answer' : p)), Math.min(handle.current.seconds * 1000, 12000));
      }
    },
    [flash],
  );

  const next = useCallback(
    (g: Game = gameRef.current) => {
      const tier = mode === 'survival' ? Math.min(3, 1 + Math.floor(g.streak / 5)) : 3;
      const c = randomChallenge(cat, tier, Math.random, typeId === 'mix' ? undefined : typeId);
      setCh(c);
      setPicks([]);
      setChosenIdx(null);
      setTaps([]);
      setPath(null);
      setResult(null);
      setLit([]);
      startedAt.current = performance.now();
      listen(c);
    },
    [cat, typeId, mode, listen],
  );

  function start() {
    writeStore('bf-ear-cat', cat);
    writeStore('bf-ear-type', typeId);
    writeStore('bf-ear-mode', mode);
    writeStore('bf-ear-stage', stageInst);
    const g = { ...FRESH };
    setGame(g);
    setTimeLeft(60);
    setView('play');
    next(g);
  }

  useEffect(() => {
    if (view !== 'play' || mode !== 'time') return;
    const id = window.setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(id);
  }, [view, mode]);
  useEffect(() => {
    if (view === 'play' && mode === 'time' && timeLeft <= 0) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft]);

  function finish() {
    handle.current?.cancel();
    setView('end');
  }

  async function evaluate(ok: boolean, c: EarChallenge) {
    const g = gameRef.current;
    const streak = ok ? g.streak + 1 : 0;
    const xp = ok ? earXp(streak) : 0;
    const ng: Game = { lives: ok || mode !== 'survival' ? g.lives : g.lives - 1, correct: g.correct + (ok ? 1 : 0), total: g.total + 1, streak, best: Math.max(g.best, streak), xp: g.xp + xp };
    setGame(ng);
    setPhase('done');
    setResult({ ok, text: c.explain, badges: [], quests: [] });
    try {
      const u = await loadUsers();
      const r = await call<{ badges: string[]; quests: string[] } | null>('ear.record', { userId: u.active, category: c.category, type: c.typeId, correct: ok, ms: Math.round(performance.now() - startedAt.current), streak, xp });
      if (r) setResult({ ok, text: c.explain, badges: r.badges, quests: r.quests });
      window.dispatchEvent(new Event('bf-xp'));
    } catch {
      /* sem banco: o jogo continua */
    }
    if (mode === 'time') window.setTimeout(() => timeLeft > 0 && next(ng), 1100);
    if (mode === 'survival' && ng.lives <= 0) window.setTimeout(finish, 1800);
  }

  function onPick(midi: number) {
    const c = chRef.current;
    if (!c || phaseRef.current !== 'answer') return;
    playOne(midi, c.timbre);
    setLit([midi]);
    setPulse((p) => p + 1);
    const p = pc(midi);
    if (c.interaction === 'pick') {
      setPicks([p]);
      setPath({ from: pc(c.root), to: p });
      setPhase('path');
      window.setTimeout(() => void evaluate((c.answerPcs ?? []).includes(p), c), 700);
    } else if (c.interaction === 'sequence' || c.interaction === 'circle') {
      const nextPicks = [...picks, p];
      setPicks(nextPicks);
      setPath({ from: pc(c.root), to: p });
      if (nextPicks.length >= (c.answerPcs?.length ?? 0)) {
        setPhase('path');
        window.setTimeout(() => void evaluate(nextPicks.every((x, i) => x === c.answerPcs![i]), c), 700);
      }
    }
  }

  function onChoose(i: number) {
    const c = chRef.current;
    if (!c || phaseRef.current === 'done' || phaseRef.current === 'path') return;
    setChosenIdx(i);
    if (c.optionEvents?.[i]) handle.current = playEvents(c.optionEvents[i]!, c.bpm, c.timbre, flash, c.drone);
    setPhase('path');
    window.setTimeout(() => void evaluate(i === c.answerIndex, c), 600);
  }

  const tap = useCallback(() => {
    if (phaseRef.current !== 'answer' || chRef.current?.interaction !== 'tap') return;
    setTaps((t) => [...t, performance.now() / 1000]);
    setPulse((p) => p + 1);
    playEvents([{ at: 0, midis: [], dur: 0.05, click: 'tick' }], 60, 'piano');
  }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.code === 'Space' && view === 'play' && chRef.current?.interaction === 'tap') {
        e.preventDefault();
        tap();
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [view, tap]);

  function confirmTaps() {
    const c = chRef.current;
    if (!c?.rhythm) return;
    void evaluate(judgeTaps(c.rhythm, taps, c.bpm).ok, c);
  }

  /** Dica sem punição: toca a resposta do usuário e a correta, lado a lado. */
  function compare() {
    const c = chRef.current;
    if (!c) return;
    handle.current?.cancel();
    let mine: EarEvent[] = [];
    if (c.interaction === 'choice' && chosenIdx !== null) mine = [...(c.optionEvents?.[chosenIdx] ?? [])];
    else if (picks.length) mine = picks.map((p, i) => ({ at: i * 0.8, midis: [60 + p], dur: 0.7 }));
    const gap = (mine.length ? Math.max(...mine.map((e) => e.at + 1.4)) : 0) + 1;
    handle.current = playEvents([...mine, ...c.events.map((e) => ({ ...e, at: e.at + gap }))], c.bpm, c.timbre, flash, c.drone);
  }

  const kind: StageKind = !ch ? 'piano' : ch.interaction === 'circle' ? 'circle' : ch.category === 'bass' ? (stageInst === 'guitar' ? 'guitar' : 'bass') : stageInst;
  const showStage = ch && ch.category !== 'rhythm' && ch.category !== 'tuning';
  const done = phase === 'done';
  const pickingOnStage = ch && (ch.interaction === 'pick' || ch.interaction === 'sequence' || ch.interaction === 'circle');
  const answerPcs = ch?.answerPcs ?? [];
  const correctPcs = done && pickingOnStage ? answerPcs : [];
  const wrongPcs = done && pickingOnStage ? picks.filter((p, i) => (ch!.interaction === 'pick' ? !answerPcs.includes(p) : p !== answerPcs[i])) : [];
  const mult = comboMultiplier(game.streak);

  // ------------------------------------------------------------------ telas
  if (view === 'lobby')
    return (
      <div className="screen ear">
        <header className="page-head">
          <h1>Ear training</h1>
          <p className="muted">Treine o ouvido: 8 categorias e mais de 60 variações, com palco visual e XP em tudo que você acerta.</p>
        </header>
        <div className="ear-cats">
          {EAR_CATEGORIES.map((c) => (
            <button key={c.id} className={`ear-cat ${cat === c.id ? 'on' : ''}`} aria-pressed={cat === c.id} onClick={() => { setCat(c.id); setTypeId('mix'); }}>
              <b>{c.title}</b>
              <span>{c.blurb}</span>
              <small>{earTypesOf(c.id).length} variações</small>
            </button>
          ))}
        </div>
        <section className="card ear-setup">
          <h3>{EAR_CATEGORIES.find((c) => c.id === cat)!.title}</h3>
          <div className="ear-types">
            <button className={typeId === 'mix' ? 'on' : ''} aria-pressed={typeId === 'mix'} onClick={() => setTypeId('mix')}>
              Misto (todas)
            </button>
            {types.map((t) => (
              <button key={t.id} className={typeId === t.id ? 'on' : ''} aria-pressed={typeId === t.id} onClick={() => setTypeId(t.id)}>
                {t.title}
              </button>
            ))}
          </div>
          <div className="ear-opts">
            <div>
              <span className="muted small">Modo</span>
              <div className="seg" role="group" aria-label="Modo">
                {MODES.map((m) => (
                  <button key={m.id} className={mode === m.id ? 'on' : ''} aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>
                    {m.label}
                  </button>
                ))}
              </div>
              <p className="muted small">{MODES.find((m) => m.id === mode)!.hint}</p>
            </div>
            <div>
              <span className="muted small">Palco</span>
              <div className="seg" role="group" aria-label="Palco">
                {STAGES.map((s) => (
                  <button key={s.id} className={stageInst === s.id ? 'on' : ''} aria-pressed={stageInst === s.id} onClick={() => setStageInst(s.id)}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <button className="primary ear-start" onClick={start}>
            Começar
          </button>
        </section>
      </div>
    );

  if (view === 'end')
    return (
      <div className="screen ear">
        <section className="card ear-end">
          <h1>{mode === 'time' ? 'Tempo esgotado' : mode === 'survival' ? 'Fim das vidas' : 'Resumo'}</h1>
          <div className="ear-end-grid">
            <div><b>{game.correct}</b><span>acertos de {game.total}</span></div>
            <div><b>{game.total ? Math.round((game.correct / game.total) * 100) : 0}%</b><span>precisão</span></div>
            <div><b>{game.best}</b><span>maior sequência</span></div>
            <div><b>+{game.xp}</b><span>XP ganho</span></div>
          </div>
          <div className="ear-actions">
            <button className="primary" onClick={start}>Jogar de novo</button>
            <button onClick={() => setView('lobby')}>Trocar exercício</button>
          </div>
        </section>
      </div>
    );

  return (
    <div className="screen ear">
      <div className="ear-hud card">
        <div className="ear-hud-left">
          <b>{EAR_CATEGORIES.find((c) => c.id === cat)!.title}</b>
          <span className="muted small">{mode === 'practice' ? 'Prática livre' : mode === 'survival' ? 'Sobrevivência' : 'Contra o relógio'}</span>
        </div>
        <div className="ear-hud-stats">
          {mode === 'survival' && <span className="ear-hearts" aria-label={`${game.lives} vidas`}>{'♥'.repeat(Math.max(0, game.lives))}<i>{'♥'.repeat(Math.max(0, 3 - game.lives))}</i></span>}
          {mode === 'time' && <span className={`ear-time ${timeLeft <= 10 ? 'low' : ''}`}>{Math.max(0, timeLeft)} s</span>}
          <span>Acertos <b>{game.correct}/{game.total}</b></span>
          <span>Sequência <b>{game.streak}</b>{mult > 1 && <em className="ear-mult">{mult}x</em>}</span>
          <span>XP <b>+{game.xp}</b></span>
        </div>
        <button className="danger small-btn" onClick={finish}>Encerrar</button>
      </div>

      {ch && (
        <section className="card ear-play">
          <p className="ear-prompt">{ch.prompt}</p>
          {showStage && (
            <EarStage
              kind={kind}
              rootPc={pc(ch.root)}
              lit={lit}
              pulse={pulse}
              chosenPcs={picks}
              correctPcs={correctPcs}
              wrongPcs={wrongPcs}
              path={path}
              disabled={phase !== 'answer' || !pickingOnStage}
              onPick={onPick}
            />
          )}

          {(ch.interaction === 'choice' || ch.interaction === 'detune') && (
            <div className="ear-choices" role="group" aria-label="Respostas">
              {ch.options!.map((o, i) => (
                <button
                  key={o}
                  className={done ? (i === ch.answerIndex ? 'right' : i === chosenIdx ? 'wrong' : '') : i === chosenIdx ? 'chosen' : ''}
                  disabled={phase === 'listening' && ch.interaction !== 'detune' ? false : done || phase === 'path'}
                  onClick={() => onChoose(i)}
                >
                  {o}
                </button>
              ))}
            </div>
          )}

          {ch.interaction === 'tap' && (
            <div className="ear-tap">
              <button className={`ear-pad ${phase === 'answer' ? 'ready' : ''}`} onClick={tap} disabled={phase !== 'answer'} aria-label="Bater o ritmo">
                {phase === 'answer' ? 'BATA AQUI (ou espaço)' : phase === 'listening' ? 'Ouça o padrão…' : 'Pronto'}
              </button>
              <span className="muted small">{taps.length} de {ch.rhythm!.length} batidas</span>
              <button className="primary" onClick={confirmTaps} disabled={phase !== 'answer' || taps.length === 0}>Confirmar resposta</button>
              <button onClick={() => setTaps([])} disabled={phase !== 'answer'}>Limpar</button>
            </div>
          )}

          {(ch.interaction === 'sequence' || ch.interaction === 'circle') && (
            <p className="muted small">Notas escolhidas: {picks.length} de {ch.answerPcs!.length}{phase === 'answer' && picks.length > 0 && <button className="small-btn ear-undo" onClick={() => setPicks(picks.slice(0, -1))}>Desfazer</button>}</p>
          )}

          <div className="ear-actions">
            <button className="audio" onClick={() => listen(ch, false)} disabled={phase === 'path'}>Ouvir novamente</button>
            <button className="audio" onClick={() => handle.current = playEvents(ch.reference.length ? ch.reference : [{ at: 0, midis: [ch.root], dur: 1 }], ch.bpm, ch.timbre, flash)} disabled={ch.interaction === 'tap' || phase === 'path'}>Nota de referência</button>
            {done && !result?.ok && <button className="audio" onClick={compare}>Comparar com referência</button>}
            {done && mode !== 'time' && (
              <button className="primary" onClick={() => (game.lives <= 0 && mode === 'survival' ? finish() : next())}>
                {game.lives <= 0 && mode === 'survival' ? 'Ver resultado' : 'Próximo desafio'}
              </button>
            )}
          </div>

          {result && (
            <div className={`ear-feedback ${result.ok ? 'ok' : 'no'}`} role="status">
              <b>{result.ok ? `Acertou! +${earXp(game.streak)} XP${mult > 1 ? ` (combo ${mult}x)` : ''}` : 'Quase!'}</b> {result.text}
              {result.quests.map((q) => <div key={q} className="ear-toast">Missão cumprida: {q}</div>)}
              {result.badges.map((b) => <div key={b} className="ear-toast">Conquista desbloqueada: {b}</div>)}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
