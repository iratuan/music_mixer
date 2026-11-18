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
import { installPlatform } from './platform/bridge.js';
import { openWebData, webBridge } from './platform/web.js';

const root = createRoot(document.getElementById('root')!);

/** Ponto de entrada web: abre o banco deste navegador antes de montar a interface. */
openWebData()
  .then((data) => {
    installPlatform(webBridge, data);
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
        <p>O Academy guarda o progresso neste navegador (IndexedDB). Verifique se o armazenamento do site está liberado.</p>
      </div>,
    );
  });
