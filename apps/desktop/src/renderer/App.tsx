import { useEffect, useRef, useState } from 'react';
import { Import } from './screens/Import.js';
import { GrabMp3 } from './screens/GrabMp3.js';
import { Library } from './screens/Library.js';
import { Song } from './screens/Song.js';
import { Exercises } from './screens/Exercises.js';
import { Icon, type IconName } from './components/Icons.js';
import { applyTheme, readTheme, THEMES, type ThemeName } from './lib/theme.js';
import type { AudioFormatName, GrabProgress, GrabQuality, GrabResult, SeparateOptions } from '../preload/preload.js';
import { cleanIpcError } from './screens/Import.js';
import markUrl from './assets/mark.png';

/**
 * Trabalho em segundo plano de uma música: separar em 6 faixas e depois analisar.
 * Continua rodando qualquer que seja a tela aberta.
 */
export type SongJob =
  | { readonly state: 'queued'; readonly analyzeOnly: boolean; readonly options?: SeparateOptions; readonly tempo?: 'auto' | 'fixed' }
  | { readonly state: 'separating'; readonly percent: number; readonly phase?: string }
  | { readonly state: 'analyzing'; readonly percent: number }
  | { readonly state: 'done' }
  | { readonly state: 'error'; readonly message: string };

/** Pedido de download pelo link de um vídeo. */
export interface UrlRequest {
  readonly url: string;
  readonly title: string;
  readonly format: AudioFormatName;
  /** Separar em seguida, com estas faixas. */
  readonly separate?: SeparateOptions;
  readonly startMix?: Record<string, boolean>;
}

/** Download em andamento (um por vez) ou o último que falhou. */
export interface UrlDownload extends UrlRequest {
  readonly phase: 'download' | 'convert';
  readonly percent: number | null;
  readonly speed?: number | null;
  readonly error?: string;
  /** O erro sugere atualizar o baixador. */
  readonly outdated?: boolean;
}

export interface GrabRequest {
  readonly url: string;
  readonly title: string;
  readonly quality: GrabQuality;
  readonly keepOriginal: boolean;
}

/** Download MP3 em andamento ou o último resultado/falha, preservado ao trocar de tela. */
export interface GrabDownload extends GrabRequest {
  readonly phase: GrabProgress['phase'];
  readonly percent: number | null;
  readonly speed?: number | null;
  readonly error?: string;
  readonly outdated?: boolean;
  readonly result?: GrabResult;
}

type Screen = 'library' | 'import' | 'grab' | 'song' | 'exercises';

/** Tela inicial. O parâmetro ?screen= só é usado no teste de fumaça (BF_SMOKE_SCREEN). */
function initialScreen(): Screen {
  const requested = new URLSearchParams(window.location.search).get('screen');
  return requested === 'import' || requested === 'grab' || requested === 'exercises' ? requested : 'library';
}

export const cleanName = (n: string) => n.replace(/\.[a-z0-9]{2,5}$/i, '');

export function App() {
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [open, setOpen] = useState<{ id: string; name: string } | null>(null);
  const [theme, setTheme] = useState<ThemeName>(readTheme);
  const [version, setVersion] = useState('');
  useEffect(() => {
    void window.baixaria
      .getAppInfo()
      .then((i) => setVersion(i.version))
      .catch(() => undefined);
  }, []);
  const [jobs, setJobs] = useState<Record<string, SongJob>>({});
  const [download, setDownload] = useState<UrlDownload | null>(null);
  const [grabDownload, setGrabDownload] = useState<GrabDownload | null>(null);
  const running = useRef(false);
  const screenRef = useRef(screen);
  screenRef.current = screen;

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const offStems = window.baixaria.onStemsProgress((p) => {
      if (!p.songId) return;
      setJobs((j) =>
        j[p.songId!]?.state === 'separating' ? { ...j, [p.songId!]: { state: 'separating', percent: p.percent, ...(p.phase ? { phase: p.phase } : {}) } } : j,
      );
    });
    const offSong = window.baixaria.onSongProgress((p) => {
      if (p.task !== 'analyze') return;
      setJobs((j) => (j[p.songId]?.state === 'analyzing' ? { ...j, [p.songId]: { state: 'analyzing', percent: p.percent } } : j));
    });
    const offImport = window.baixaria.onImportProgress((p) => {
      setDownload((d) => (d && !d.error && d.url === p.url ? { ...d, phase: p.phase, percent: p.percent, speed: p.speed ?? null } : d));
    });
    const offGrab = window.baixaria.onGrabProgress((p) => {
      setGrabDownload((d) => (d && !d.error && !d.result && d.url === p.url ? { ...d, phase: p.phase, percent: p.percent, speed: p.speed ?? null } : d));
    });
    return () => {
      offStems();
      offSong();
      offImport();
      offGrab();
    };
  }, []);

  // Fila: um trabalho por vez (a separação usa a GPU/CPU inteira).
  useEffect(() => {
    if (running.current) return;
    const next = Object.entries(jobs).find(([, j]) => j.state === 'queued');
    if (!next) return;
    const [songId, job] = next as [string, Extract<SongJob, { state: 'queued' }>];
    running.current = true;
    void (async () => {
      try {
        if (!job.analyzeOnly) {
          setJobs((j) => ({ ...j, [songId]: { state: 'separating', percent: 0 } }));
          await window.baixaria.separateStems(songId, job.options);
        }
        setJobs((j) => ({ ...j, [songId]: { state: 'analyzing', percent: 0 } }));
        await window.baixaria.analyzeSong(songId, job.tempo ? { tempo: job.tempo } : undefined);
        setJobs((j) => ({ ...j, [songId]: { state: 'done' } }));
      } catch (e) {
        const message = e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'falha';
        // Cancelada pelo usuário: some da fila, sem mensagem de erro.
        if (/separação cancelada/.test(message))
          setJobs((j) => {
            const { [songId]: _gone, ...rest } = j;
            return rest;
          });
        else setJobs((j) => ({ ...j, [songId]: { state: 'error', message } }));
      } finally {
        running.current = false;
        setJobs((j) => ({ ...j })); // reavalia a fila
      }
    })();
  }, [jobs]);

  function enqueue(songId: string, analyzeOnly: boolean, options?: SeparateOptions, tempo?: 'auto' | 'fixed') {
    setJobs((j) => {
      const cur = j[songId];
      if (cur && (cur.state === 'queued' || cur.state === 'separating' || cur.state === 'analyzing')) return j;
      return { ...j, [songId]: { state: 'queued', analyzeOnly, ...(options ? { options } : {}), ...(tempo ? { tempo } : {}) } };
    });
  }

  /** Baixa o áudio do vídeo; ao terminar, separa (se pedido) e abre a música se a tela Importar seguir aberta. */
  function startUrl(req: UrlRequest) {
    setDownload({ ...req, phase: 'download', percent: 0 });
    void (async () => {
      try {
        const song = await window.baixaria.importUrl(req.url, req.format, req.startMix);
        setDownload(null);
        if (req.separate) enqueue(song.id, false, req.separate);
        if (screenRef.current === 'import') openSong(song.id, song.name);
      } catch (e) {
        const message = cleanIpcError(e);
        if (message === 'download cancelado') setDownload(null);
        else setDownload((d) => ({ ...(d ?? { ...req, phase: 'download', percent: null }), error: message, outdated: /desatualizado/.test(message) }));
      }
    })();
  }

  function openSong(id: string, name: string) {
    setOpen({ id, name });
    setScreen('song');
  }

  function startGrab(req: GrabRequest) {
    if (grabDownload && !grabDownload.error && !grabDownload.result) return;
    setGrabDownload({ ...req, phase: 'download', percent: 0 });
    void (async () => {
      try {
        const result = await window.baixaria.grabFetch(req.url, req.quality, req.keepOriginal);
        setGrabDownload((current) => (current?.url === req.url ? { ...current, phase: 'verify', percent: null, result } : current));
      } catch (e) {
        const message = cleanIpcError(e);
        if (message === 'download cancelado') setGrabDownload(null);
        else setGrabDownload((current) => (current?.url === req.url ? { ...current, error: message, outdated: /desatualizado/i.test(message) } : current));
      }
    })();
  }

  function cancelGrab() {
    void window.baixaria.grabCancel().catch((e) => {
      const message = cleanIpcError(e);
      setGrabDownload((current) => (current ? { ...current, error: message } : current));
    });
  }

  const nav: ReadonlyArray<{ id: Screen; label: string; icon: IconName }> = [
    { id: 'library', label: 'Biblioteca', icon: 'library' },
    { id: 'import', label: 'Importar', icon: 'import' },
  ];
  const openJob = open ? jobs[open.id] : undefined;
  const busyJob = openJob && (openJob.state === 'separating' || openJob.state === 'analyzing' || openJob.state === 'queued');

  return (
    <div className="shell">
      <nav className="side" aria-label="Navegação principal">
        <div className="brand">
          <img className="brand-logo" src={markUrl} alt="" />
          <span className="brand-name">
            mixer<b>Craft</b>
          </span>
        </div>
        <div className="nav-section">
          <div className="nav-title">Músicas</div>
          {nav.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${screen === item.id ? 'active' : ''}`}
              aria-current={screen === item.id ? 'page' : undefined}
              onClick={() => setScreen(item.id)}
            >
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
              {item.id === 'import' && download && !download.error && <span className="nav-dot" aria-label="baixando" />}
            </button>
          ))}
        </div>
        <div className="nav-section">
          <div className="nav-title">Ferramentas</div>
          <button className={`nav-item ${screen === 'grab' ? 'active' : ''}`} aria-current={screen === 'grab' ? 'page' : undefined} onClick={() => setScreen('grab')}>
            <Icon name="import" size={18} />
            <span>Baixar MP3</span>
            {grabDownload && !grabDownload.error && !grabDownload.result && <span className="nav-dot" aria-label="baixando" />}
          </button>
        </div>
        <div className="nav-section">
          <div className="nav-title">Prática</div>
          <button
            className={`nav-item ${screen === 'exercises' ? 'active' : ''}`}
            aria-current={screen === 'exercises' ? 'page' : undefined}
            onClick={() => setScreen('exercises')}
          >
            <Icon name="exercise" size={18} />
            <span>Exercícios</span>
          </button>
        </div>
        {open && (
          <div className="nav-section">
            <div className="nav-title">Tocando</div>
            <button
              className={`nav-item now ${screen === 'song' ? 'active' : ''}`}
              aria-current={screen === 'song' ? 'page' : undefined}
              onClick={() => setScreen('song')}
              title={open.name}
            >
              <Icon name="wave" size={18} />
              <span className="nav-song">{cleanName(open.name)}</span>
              {busyJob && <span className="nav-dot" aria-label="trabalhando" />}
            </button>
          </div>
        )}
        <div className="side-foot">
          <div className="nav-title">Tema</div>
          <div className="theme-pick" role="radiogroup" aria-label="Tema">
            {THEMES.map((t) => (
              <button key={t.id} className={`t-${t.id}`} role="radio" aria-checked={theme === t.id} aria-pressed={theme === t.id} aria-label={t.label} title={t.label} onClick={() => setTheme(t.id)} />
            ))}
          </div>
          <div className="about-line">
            <span title="Versão do app">{version ? `v${version.replace('-beta.', ' beta ')}` : ''}</span>
            <button className="link-btn" onClick={() => void window.baixaria.openAppFolder('licenses').catch(() => undefined)} title="Componentes de terceiros e suas licenças">
              Licenças
            </button>
            <button className="link-btn" onClick={() => void window.baixaria.openAppFolder('logs').catch(() => undefined)} title="Pasta com o registro de erros: anexe o main.log ao relatar um problema">
              Registros
            </button>
          </div>
        </div>
      </nav>

      <div className="main-col">
        <main className={`content ${screen === 'song' ? 'full' : ''}`}>
          {screen === 'import' && (
            <Import
              onImported={(id, name) => openSong(id, name)}
              download={download}
              onStartUrl={startUrl}
              onCancelUrl={() => void window.baixaria.cancelImportUrl()}
              onDismissUrl={() => setDownload(null)}
              onOpen={openSong}
            />
          )}
          {screen === 'grab' && (
            <GrabMp3
              download={grabDownload}
              onStart={startGrab}
              onCancel={cancelGrab}
              onDismiss={() => setGrabDownload(null)}
            />
          )}
          {screen === 'exercises' && <Exercises />}
          {screen === 'library' && <Library
              jobs={jobs}
              download={download}
              currentId={open?.id ?? null}
              onOpen={openSong}
              onImport={() => setScreen('import')}
              onRemoved={(ids) => {
                setOpen((o) => (o && ids.includes(o.id) ? null : o));
                setJobs((j) => Object.fromEntries(Object.entries(j).filter(([id]) => !ids.includes(id))));
              }}
            />}
          {screen === 'song' && open && (
            <Song
              key={open.id}
              songId={open.id}
              name={open.name}
              job={jobs[open.id]}
              onSeparate={(options) => enqueue(open.id, false, options)}
              onAnalyze={(tempo) => enqueue(open.id, true, undefined, tempo)}
              onRemoved={() => {
                setOpen(null);
                setScreen('library');
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
}
