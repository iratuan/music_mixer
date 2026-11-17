import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
