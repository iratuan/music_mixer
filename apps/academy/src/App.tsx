import { useEffect, useState } from 'react';
import { Icon, type IconName, applyTheme, readTheme, THEMES, type ThemeName } from '@baixaria/ui-core';
import { Home } from './screens/Home.js';
import { Trails } from './screens/Trails.js';
import { Exercises } from './screens/Exercises.js';
import { Harmony } from './screens/Harmony.js';
import { Academy } from './screens/Academy.js';
import { EarTraining } from './screens/EarTraining.js';
import { Profiles } from './screens/Profiles.js';
import { Achievements } from './screens/Achievements.js';
import { XpBar } from './components/XpBar.js';
import { Splash } from './components/Splash.js';
import { LegacyImportBanner } from './components/LegacyImportBanner.js';
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

export function App() {
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [splash, setSplash] = useState(() => !new URLSearchParams(window.location.search).get('screen'));
  const [theme, setTheme] = useState<ThemeName>(readTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <>
      {splash && <Splash onDone={() => setSplash(false)} />}
      <div className="shell">
        <nav className="side" aria-label="Navegação principal">
          <div className="brand">
            <img className="brand-logo" src={markUrl} alt="Academy" />
          </div>
          {NAV.map((section) => (
            <div className="nav-section" key={section.title}>
              <div className="nav-title">{section.title}</div>
              {section.items.map((item) => (
                <button
                  key={item.id}
                  className={`nav-item ${screen === item.id ? 'active' : ''}`}
                  aria-current={screen === item.id ? 'page' : undefined}
                  onClick={() => setScreen(item.id)}
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
            <div className="theme-pick" role="radiogroup" aria-label="Tema">
              {THEMES.map((t) => (
                <button key={t.id} className={`t-${t.id}`} role="radio" aria-checked={theme === t.id} aria-pressed={theme === t.id} aria-label={t.label} title={t.label} onClick={() => setTheme(t.id)} />
              ))}
            </div>
          </div>
        </nav>

        <div className="main-col">
          <LegacyImportBanner />
          {screen !== 'home' && (
            <div className="topbar">
              <XpBar onOpen={() => setScreen('achievements')} />
            </div>
          )}
          <main key={screen} className="content screen-in">
            {screen === 'home' && <Home onGo={(next) => setScreen(next)} />}
            {screen === 'trails' && <Trails onPractice={() => setScreen('exercises')} />}
            {screen === 'exercises' && <Exercises />}
            {screen === 'harmony' && <Harmony onPracticeScale={() => setScreen('exercises')} />}
            {screen === 'theory' && <Academy module="theory" onPractice={() => setScreen('exercises')} />}
            {screen === 'ear' && <EarTraining />}
            {screen === 'profiles' && <Profiles onChanged={() => setScreen('home')} />}
            {screen === 'achievements' && <Achievements />}
          </main>
        </div>
      </div>
    </>
  );
}
