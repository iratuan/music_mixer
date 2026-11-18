import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@baixaria/ui-core/tokens.css';
import './styles/base.css';
import './styles/shell.css';
import './styles/library.css';
import './styles/song.css';
import './styles/practice.css';
import './styles/harmony.css';
import './styles/stage.css';
import './styles/hig.css';
import './styles/home.css';
import './styles/standard.css';
import './styles/solid.css';
import './styles/ear.css';
import './styles/home2.css';
import { App } from './App.js';
import { installPlatform, type PlatformBridge } from './platform/bridge.js';
import { androidBridge, isAndroid, openAndroidData } from './platform/android.js';
import { desktopApi, desktopBridge, openDesktopData } from './platform/desktop.js';
import { openWebData, webBridge } from './platform/web.js';
import type { AcademyData } from './data/services.js';

const root = createRoot(document.getElementById('root')!);

/** Mesmo build para todas as plataformas: Android (Capacitor), shell desktop (Electron) ou navegador. */
async function boot(): Promise<[PlatformBridge, AcademyData]> {
  if (isAndroid()) return [androidBridge, await openAndroidData()];
  const desktop = desktopApi();
  if (desktop) return [desktopBridge(desktop), await openDesktopData(desktop)];
  return [webBridge, await openWebData()];
}

/** Abre o banco antes de montar a interface. */
boot()
  .then(([bridge, data]) => {
    installPlatform(bridge, data);
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch((e: unknown) => {
    root.render(
      <div className="boot-error" role="alert" style={{ padding: 24 }}>
        <h1>Não foi possível abrir seus dados</h1>
        <p>{e instanceof Error ? e.message : String(e)}</p>
        <p>{desktopApi() ? 'O Academy guarda o progresso na pasta de dados do app.' : 'O Academy guarda o progresso neste navegador (IndexedDB). Verifique se o armazenamento do site está liberado.'}</p>
      </div>,
    );
  });
