import { useEffect, useState } from 'react';
import { Icon, type IconName, applyTheme, readTheme, THEMES, type ThemeName } from '@baixaria/ui-core';
import { Home } from './features/home/Home.js';
import { Trails } from './features/trails/Trails.js';
import { Exercises } from './features/practice/Exercises.js';
import { Harmony } from './features/harmony/Harmony.js';
import { Academy } from './features/theory/Academy.js';
import { EarTraining } from './features/ear/EarTraining.js';
import { Profiles } from './features/profile/Profiles.js';
import { Achievements } from './features/profile/Achievements.js';
import { XpBar } from './shared/XpBar.js';
import { Splash } from './shared/Splash.js';
import { LegacyImportBanner } from './shared/LegacyImportBanner.js';
import markUrl from './assets/logo.png';

/** Telas do Academy (trilhas, prática, harmonia, teoria, ouvido e perfil). Sem nada do estúdio. */
type Screen = 'home' | 'trails' | 'exercises' | 'harmony' | 'theory' | 'ear' | 'profiles' | 'achievements';
const SCREENS: readonly Screen[] = ['home', 'trails', 'exercises', 'harmony', 'theory', 'ear', 'profiles', 'achievements'];

/** Tela inicial. O parâmetro ?screen= serve aos testes de fumaça. */
function initialScreen(): Screen {
  const requested = new URLSearchParams(window.location.search).get('screen');
  return SCREENS.find((s) => s === requested) ?? 'home';
}

const NAV: ReadonlyArray<{ title: string; items: ReadonlyArray<{ id: Screen; label: string; icon: IconName; hint: string }> }> = [
  { title: 'Início', items: [{ id: 'home', label: 'Início', icon: 'wave', hint: 'Início' }] },
  {
    title: 'Formação & Trilhas',
    items: [
      { id: 'trails', label: 'Trilhas', icon: 'library', hint: 'Trilhas de aprendizado' },
      { id: 'exercises', label: 'Prática livre & desafios', icon: 'exercise', hint: 'Exercícios' },
      { id: 'harmony', label: 'Harmonia', icon: 'chords', hint: 'Harmonia' },
    ],
  },
  {
    title: 'Academia',
    items: [
      { id: 'theory', label: 'Teoria & leitura', icon: 'chords', hint: 'Teoria musical e leitura' },
      { id: 'ear', label: 'Ear training', icon: 'wave', hint: 'Laboratório e ear training' },
    ],
  },
  {
    title: 'Perfil & evolução',
    items: [
      { id: 'profiles', label: 'Músicos', icon: 'exercise', hint: 'Trocar ou cadastrar músico' },
      { id: 'achievements', label: 'Conquistas & missões', icon: 'exercise', hint: 'Conquistas e missões' },
    ],
  },
];

/** Tela estreita (celular, tablet pequeno em retrato): barra inferior no lugar da lateral. */
const COMPACT_QUERY = '(max-width: 820px)';
function useCompact(): boolean {
  const [compact, setCompact] = useState(() => window.matchMedia?.(COMPACT_QUERY).matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.(COMPACT_QUERY);
    if (!mq) return;
    const on = () => setCompact(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return compact;
}

/** As 4 abas fixas da barra inferior; o resto fica em "Mais". */
const TABS: ReadonlyArray<{ id: Screen; label: string; icon: IconName }> = [
  { id: 'home', label: 'Início', icon: 'wave' },
  { id: 'trails', label: 'Trilhas', icon: 'library' },
  { id: 'exercises', label: 'Prática', icon: 'exercise' },
  { id: 'ear', label: 'Ouvido', icon: 'wave' },
];
const MORE = NAV.flatMap((s) => s.items).filter((i) => !TABS.some((t) => t.id === i.id));

function ThemePick({ theme, onPick }: { theme: ThemeName; onPick(t: ThemeName): void }) {
  return (
    <div className="theme-pick" role="radiogroup" aria-label="Tema">
      {THEMES.map((t) => (
        <button key={t.id} className={`t-${t.id}`} role="radio" aria-checked={theme === t.id} aria-pressed={theme === t.id} aria-label={t.label} title={t.label} onClick={() => onPick(t.id)} />
      ))}
    </div>
  );
}

interface NavState {
  screen: Screen;
  more?: boolean;
  /** Quantas entradas do app há abaixo desta (0 = raiz: Voltar sai do app no Android). */
  depth: number;
}
const navDepth = () => (history.state as NavState | null)?.depth ?? 0;

export function App() {
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [splash, setSplash] = useState(() => !new URLSearchParams(window.location.search).get('screen'));
  const [theme, setTheme] = useState<ThemeName>(readTheme);
  const [moreOpen, setMoreOpen] = useState(false);
  const compact = useCompact();

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Histórico do navegador = botão Voltar do Android (e do navegador): fecha o "Mais" e volta de tela
  // em vez de sair do app. Cada tela é uma entrada; a folha "Mais" aberta é uma entrada por cima.
  useEffect(() => {
    history.replaceState({ screen: initialScreen(), depth: 0 } satisfies NavState, '');
    const onPop = (e: PopStateEvent) => {
      const st = e.state as NavState | null;
      setScreen(st?.screen ?? 'home');
      setMoreOpen(!!st?.more);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const openMore = () => {
    history.pushState({ screen, more: true, depth: navDepth() + 1 } satisfies NavState, '');
    setMoreOpen(true);
  };
  const closeMore = () => {
    if ((history.state as NavState | null)?.more) history.back();
    else setMoreOpen(false);
  };

  useEffect(() => {
    if (!moreOpen) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && closeMore();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [moreOpen]);

  const go = (next: Screen) => {
    const fromMore = (history.state as NavState | null)?.more;
    if (fromMore) history.replaceState({ screen: next, depth: navDepth() } satisfies NavState, '');
    else if (next !== screen) history.pushState({ screen: next, depth: navDepth() + 1 } satisfies NavState, '');
    setScreen(next);
    setMoreOpen(false);
  };

  const content = (
    <div className="main-col">
      <LegacyImportBanner />
      {screen !== 'home' && (
        <div className="topbar">
          <XpBar onOpen={() => go('achievements')} />
        </div>
      )}
      <main key={screen} className="content screen-in">
        {screen === 'home' && <Home onGo={(next) => go(next)} />}
        {screen === 'trails' && <Trails onPractice={() => go('exercises')} />}
        {screen === 'exercises' && <Exercises />}
        {screen === 'harmony' && <Harmony onPracticeScale={() => go('exercises')} />}
        {screen === 'theory' && <Academy module="theory" onPractice={() => go('exercises')} />}
        {screen === 'ear' && <EarTraining />}
        {screen === 'profiles' && <Profiles onChanged={() => go('home')} />}
        {screen === 'achievements' && <Achievements />}
      </main>
    </div>
  );

  if (compact) {
    const inMore = MORE.some((m) => m.id === screen);
    return (
      <>
        {splash && <Splash onDone={() => setSplash(false)} />}
        <div className="shell compact">
          {content}
          <nav className="tabbar" aria-label="Navegação principal">
            {TABS.map((t) => (
              <button key={t.id} className={`tab ${screen === t.id ? 'active' : ''}`} aria-current={screen === t.id ? 'page' : undefined} onClick={() => go(t.id)}>
                <Icon name={t.icon} size={20} />
                <span>{t.label}</span>
              </button>
            ))}
            <button className={`tab ${inMore || moreOpen ? 'active' : ''}`} aria-expanded={moreOpen} aria-controls="more-sheet" onClick={() => (moreOpen ? closeMore() : openMore())}>
              <Icon name="chords" size={20} />
              <span>Mais</span>
            </button>
          </nav>
          {moreOpen && (
            <div className="more-scrim" onClick={closeMore}>
              <div id="more-sheet" className="more-sheet card" role="dialog" aria-label="Mais opções" onClick={(e) => e.stopPropagation()}>
                {MORE.map((item) => (
                  <button key={item.id} className={`nav-item ${screen === item.id ? 'active' : ''}`} aria-current={screen === item.id ? 'page' : undefined} onClick={() => go(item.id)}>
                    <Icon name={item.icon} size={18} />
                    <span>{item.label}</span>
                  </button>
                ))}
                <div className="nav-title">Tema</div>
                <ThemePick theme={theme} onPick={setTheme} />
              </div>
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      {splash && <Splash onDone={() => setSplash(false)} />}
      <div className="shell">
        <nav className="side" aria-label="Navegação principal">
          <div className="brand">
            <img className="brand-logo" src={markUrl} alt="ScaleMonster" />
          </div>
          {NAV.map((section) => (
            <div className="nav-section" key={section.title}>
              <div className="nav-title">{section.title}</div>
              {section.items.map((item) => (
                <button
                  key={item.id}
                  className={`nav-item ${screen === item.id ? 'active' : ''}`}
                  aria-current={screen === item.id ? 'page' : undefined}
                  onClick={() => go(item.id)}
                  title={item.hint}
                >
                  <Icon name={item.icon} size={18} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          ))}
          <div className="side-foot">
            <div className="nav-title">Tema</div>
            <ThemePick theme={theme} onPick={setTheme} />
          </div>
        </nav>
        {content}
      </div>
    </>
  );
}
