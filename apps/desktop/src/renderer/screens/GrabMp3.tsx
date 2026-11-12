import { useEffect, useRef, useState } from 'react';
import type { GrabPreview, GrabQuality } from '../../preload/preload.js';
import type { GrabDownload, GrabRequest } from '../App.js';
import { Icon } from '../components/Icons.js';
import { Progress } from '../components/Progress.js';
import { cleanIpcError } from './Import.js';

interface Props {
  download: GrabDownload | null;
  onStart(request: GrabRequest): void;
  onCancel(): void;
  onDismiss(): void;
}

const NOTICE_KEY = 'bf-grab-notice-ok';
const QUALITY_KEY = 'bf-grab-quality';
const KEEP_KEY = 'bf-grab-keep-original';

function load(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function save(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // A preferência permanece apenas nesta sessão.
  }
}

function fmtDuration(sec: number): string {
  const total = Math.round(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

function fmtBytes(bytes: number): string {
  return bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(2).replace('.', ',')} GB`
    : `${(bytes / 1024 ** 2).toFixed(1).replace('.', ',')} MB`;
}

function fmtSpeed(bps: number | null | undefined): string {
  if (!bps) return '';
  return bps >= 1024 ** 2
    ? `${(bps / 1024 ** 2).toFixed(1).replace('.', ',')} MB/s`
    : `${Math.round(bps / 1024)} KB/s`;
}

function sourceLabel(preview: GrabPreview): string {
  const source = preview.source;
  if (!source) return 'Formato da fonte desconhecido';
  const codec = source.codec === 'aac' ? 'AAC' : source.codec === 'opus' ? 'Opus' : source.codec.toUpperCase();
  const bitrate = source.bitrate === null ? '' : ` · ${Math.round(source.bitrate)} kbps`;
  const rate = source.sampleRate === null ? '' : ` · ${(source.sampleRate / 1000).toFixed(source.sampleRate % 1000 === 0 ? 0 : 1)} kHz`;
  const channels = source.channels === 1 ? ' · mono' : source.channels !== null && source.channels >= 2 ? ' · estéreo' : '';
  return `${codec}${bitrate}${rate}${channels}`;
}

export function GrabMp3({ download, onStart, onCancel, onDismiss }: Props) {
  const [noticeOk, setNoticeOk] = useState(() => load(NOTICE_KEY) === '1');
  const [url, setUrl] = useState('');
  const [folder, setFolder] = useState<string | null>(null);
  const [folderReady, setFolderReady] = useState(false);
  const [preview, setPreview] = useState<GrabPreview | null>(null);
  const [looking, setLooking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quality, setQuality] = useState<GrabQuality>(() => (load(QUALITY_KEY) === 'cbr320' ? 'cbr320' : 'v0'));
  const [keepOriginal, setKeepOriginal] = useState(() => load(KEEP_KEY) === '1');
  const [updating, setUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    let active = true;
    void window.baixaria
      .grabFolder()
      .then(({ folder: saved }) => {
        if (active) setFolder(saved);
      })
      .catch((e) => {
        if (active) setError(`Não foi possível ler a pasta de destino: ${cleanIpcError(e)}`);
      })
      .finally(() => {
        if (active) setFolderReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => save(QUALITY_KEY, quality), [quality]);
  useEffect(() => save(KEEP_KEY, keepOriginal ? '1' : '0'), [keepOriginal]);

  async function pickFolder() {
    setError(null);
    try {
      const result = await window.baixaria.grabPickFolder();
      if (!result.canceled) setFolder(result.folder);
    } catch (e) {
      setError(`Não foi possível escolher a pasta: ${cleanIpcError(e)}`);
    }
  }

  async function lookup(raw: string) {
    const text = raw.trim();
    if (!text) {
      setError('Cole o link do vídeo para buscar.');
      return;
    }
    const request = ++seq.current;
    setError(null);
    setUpdateMessage(null);
    setPreview(null);
    setLooking(true);
    try {
      const result = await window.baixaria.grabInfo(text);
      if (request === seq.current) setPreview(result);
    } catch (e) {
      if (request === seq.current) setError(cleanIpcError(e));
    } finally {
      if (request === seq.current) setLooking(false);
    }
  }

  async function updateDownloader() {
    setUpdating(true);
    setUpdateMessage(null);
    try {
      const result = await window.baixaria.ytdlpUpdate();
      setUpdateMessage(result.updated ? `Baixador atualizado${result.version ? `: ${result.version}` : ''}.` : 'Atualização cancelada.');
    } catch (e) {
      setUpdateMessage(`Não foi possível atualizar: ${cleanIpcError(e)}`);
    } finally {
      setUpdating(false);
    }
  }

  if (!noticeOk) {
    return (
      <section className="screen grab-screen">
        <header className="page-head">
          <h1>Baixar MP3</h1>
          <p className="muted">Salve uma cópia em MP3 de um vídeo, sem adicionar à biblioteca.</p>
        </header>
        <div className="card notice" role="region" aria-label="Uso responsável">
          <h2>Antes de baixar</h2>
          <p>Use este recurso somente com conteúdo que você tem direito de baixar, como vídeos seus, conteúdo livre ou material autorizado.</p>
          <p className="muted small">
            O app não contorna proteções, não acessa conteúdo privado ou pago e não usa sua conta nem os cookies do navegador. Um vídeo por vez.
          </p>
          <div className="row-end">
            <button
              className="primary"
              onClick={() => {
                save(NOTICE_KEY, '1');
                setNoticeOk(true);
              }}
            >
              Entendi
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (download) {
    if (download.result) {
      const result = download.result;
      const original = result.original;
      const reveal = (file: string) => {
        void window.baixaria.grabReveal(file).catch((e) => setError(cleanIpcError(e)));
      };
      return (
        <section className="screen grab-screen">
          <header className="page-head">
            <h1>Baixar MP3</h1>
            <p className="muted">O arquivo foi salvo fora da biblioteca.</p>
          </header>
          <div className="card grab-result">
            <div className="grab-result-head">
              <Icon name="check" size={20} />
              <div>
                <h2>MP3 pronto</h2>
                <p className="muted">{result.name} · {fmtBytes(result.bytes)}</p>
              </div>
            </div>
            <div className="grab-checks" aria-label="Verificação do arquivo">
              {result.report.checks.map((check) => (
                <div className={`grab-check ${check.level}`} key={check.id}>
                  <Icon name={check.level === 'fail' ? 'alert' : 'check'} size={15} />
                  <span>{check.detail}</span>
                </div>
              ))}
            </div>
            {result.warnings.length > 0 && (
              <ul className="grab-warnings">
                {result.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            )}
            {original && <p className="muted small">O áudio original do site também foi salvo.</p>}
            <div className="row-end">
              {original && (
                <button className="ghost" onClick={() => reveal(original)}>
                  Mostrar original
                </button>
              )}
              <button className="primary" onClick={() => reveal(result.path)}>
                Mostrar MP3 na pasta
              </button>
            </div>
            {error && <p className="alert" role="alert">{error}</p>}
            <div className="row-end">
              <button className="ghost" onClick={onDismiss}>Baixar outro</button>
            </div>
          </div>
        </section>
      );
    }

    return (
      <section className="screen grab-screen">
        <header className="page-head">
          <h1>Baixar MP3</h1>
          <p className="muted">{download.title}</p>
        </header>
        {download.error ? (
          <div className="card grab-result">
            <p className="alert" role="alert"><Icon name="alert" size={16} /> Não foi possível baixar: {download.error}</p>
            {download.outdated && (
              <p className="muted small">
                Sites mudam com frequência e o baixador precisa acompanhar.{' '}
                <button className="link-btn" onClick={() => void updateDownloader()} disabled={updating}>
                  {updating ? 'Atualizando…' : 'Atualizar baixador'}
                </button>
              </p>
            )}
            {updateMessage && <p className="muted small">{updateMessage}</p>}
            <div className="row-end">
              <button className="ghost" onClick={onDismiss}>Voltar</button>
            </div>
          </div>
        ) : (
          <div className="card grab-job">
            <Progress
              value={download.phase === 'download' && download.percent !== null ? download.percent / 100 : null}
              label={
                download.phase === 'download'
                  ? `Baixando${download.speed ? ` · ${fmtSpeed(download.speed)}` : ''}`
                  : download.phase === 'convert'
                    ? 'Convertendo para MP3'
                    : 'Verificando o arquivo'
              }
            />
            <p className="muted small">O download continua se você trocar de tela.</p>
            <div className="row-end">
              <button className="ghost" onClick={onCancel}>Cancelar</button>
            </div>
          </div>
        )}
      </section>
    );
  }

  const tooLong = !!preview && preview.duration > preview.maxDuration;

  return (
    <section className="screen grab-screen">
      <header className="page-head">
        <h1>Baixar MP3</h1>
        <p className="muted">Baixe o áudio de um vídeo e salve uma cópia em MP3, sem importar ou separar faixas.</p>
      </header>

      <div className="card grab-destination">
        <div>
          <strong>Pasta de destino</strong>
          <p className="muted small">{folderReady ? folder ?? 'Nenhuma pasta escolhida' : 'Carregando pasta…'}</p>
        </div>
        <button className="ghost" onClick={() => void pickFolder()}>
          Escolher pasta
        </button>
      </div>

      <div className="grab-import">
        <form
          className="url-bar"
          onSubmit={(e) => {
            e.preventDefault();
            void lookup(url);
          }}
        >
          <Icon name="link" size={18} />
          <input
            type="url"
            inputMode="url"
            placeholder="Cole o link do vídeo (https://…)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text').trim();
              if (text) {
                e.preventDefault();
                setUrl(text);
                void lookup(text);
              }
            }}
            aria-label="Link do vídeo"
            spellCheck={false}
          />
          <button className="primary" type="submit" disabled={looking || url.trim().length === 0}>
            {looking ? 'Buscando…' : 'Buscar'}
          </button>
        </form>

        {looking && <Progress value={null} label="Lendo as informações do vídeo" />}
        {error && <p className="alert" role="alert"><Icon name="alert" size={16} /> {error}</p>}

        {preview && (
          <div className="card url-preview" aria-label="Prévia do vídeo">
            <div className="url-meta">
              {preview.thumbnailData ? (
                <img className="url-thumb" src={preview.thumbnailData} alt="" />
              ) : (
                <div className="url-thumb empty" aria-hidden="true"><Icon name="wave" size={26} /></div>
              )}
              <div className="url-text">
                <strong>{preview.title}</strong>
                <span className="muted">{[preview.channel, preview.site].filter(Boolean).join(' · ')}</span>
                <span className="muted small">{fmtDuration(preview.duration)} · {sourceLabel(preview)}</span>
              </div>
            </div>
            {preview.warnings.length > 0 && (
              <ul className="grab-warnings">
                {preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            )}
            {tooLong ? (
              <p className="alert">O limite é de {Math.round(preview.maxDuration / 60)} minutos.</p>
            ) : (
              <>
                <div className="sp-section">
                  <span className="sp-title">Qualidade do MP3</span>
                  <div className="seg small" role="radiogroup" aria-label="Qualidade do MP3">
                    <button type="button" role="radio" aria-checked={quality === 'v0'} aria-pressed={quality === 'v0'} title="VBR de alta qualidade; geralmente cerca de 245 kbps." onClick={() => setQuality('v0')}>
                      V0 variável
                    </button>
                    <button type="button" role="radio" aria-checked={quality === 'cbr320'} aria-pressed={quality === 'cbr320'} title="320 kbps constantes. Não aumenta a qualidade da fonte." onClick={() => setQuality('cbr320')}>
                      320 kbps fixos
                    </button>
                  </div>
                  <p className="muted small">O MP3 não pode ter qualidade maior que o áudio original do site.</p>
                </div>
                <label className="check challenge">
                  <input type="checkbox" checked={keepOriginal} onChange={(e) => setKeepOriginal(e.target.checked)} />
                  Guardar também o áudio original do site
                </label>
                <div className="sp-foot">
                  {!folder && <span className="muted small">Escolha uma pasta de destino para continuar.</span>}
                  <div className="spacer" />
                  <button
                    className="primary"
                    disabled={!folder || !folderReady || looking}
                    onClick={() => onStart({ url: preview.url, title: preview.title, quality, keepOriginal })}
                  >
                    <Icon name="import" size={16} /> Baixar MP3
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
