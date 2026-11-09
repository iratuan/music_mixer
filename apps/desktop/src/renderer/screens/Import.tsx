import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icons.js';
import { Progress } from '../components/Progress.js';
import { StemPicker } from '../components/StemPicker.js';
import { getAudioContext } from '../lib/audio.js';
import { sortStems, stemInfo } from '../lib/stems.js';
import type { AudioFormatName, SeparateOptions, VideoPreview } from '../../preload/preload.js';
import type { UrlDownload, UrlRequest } from '../App.js';

interface Props {
  /** Música adicionada à biblioteca a partir de um arquivo. */
  onImported(songId: string, name: string): void;
  /** Download em andamento ou o último que falhou. */
  download: UrlDownload | null;
  onStartUrl(req: UrlRequest): void;
  onCancelUrl(): void;
  onDismissUrl(): void;
  onOpen(songId: string, name: string): void;
}

type Tab = 'file' | 'url';
const TAB_KEY = 'bf-import-tab';
const NOTICE_KEY = 'bf-url-notice-ok';
const FORMAT_KEY = 'bf-url-format';
const SEPARATE_KEY = 'bf-url-separate';

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
    /* só nesta sessão */
  }
}

function fmtDuration(sec: number): string {
  if (!sec) return 'duração desconhecida';
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

function fmtSpeed(bps: number | null | undefined): string {
  if (!bps) return '';
  return bps >= 1024 * 1024 ? `${(bps / 1024 / 1024).toFixed(1).replace('.', ',')} MB/s` : `${Math.round(bps / 1024)} KB/s`;
}

const FORMATS: ReadonlyArray<{ id: AudioFormatName; label: string; title: string }> = [
  { id: 'flac', label: 'FLAC', title: 'Sem perdas sobre o áudio do site. Recomendado para separar as faixas.' },
  { id: 'mp3', label: 'MP3 320', title: 'Arquivo menor; uma compressão a mais sobre o áudio do site.' },
  { id: 'wav', label: 'WAV', title: 'Sem compressão; arquivo grande.' },
];

export function Import({ onImported, download, onStartUrl, onCancelUrl, onDismissUrl, onOpen }: Props) {
  const [tab, setTab] = useState<Tab>(() => (load(TAB_KEY) === 'url' ? 'url' : 'file'));
  useEffect(() => save(TAB_KEY, tab), [tab]);

  return (
    <section className="screen import">
      <header className="page-head">
        <h1>Importar</h1>
        <p className="muted">Traga uma música de um arquivo do computador ou do link de um vídeo. A separação e a análise rodam neste computador.</p>
      </header>
      <div className="tabs" role="tablist" aria-label="Origem da música">
        <button role="tab" id="tab-file" aria-selected={tab === 'file'} aria-controls="panel-file" onClick={() => setTab('file')}>
          <Icon name="import" size={16} /> Arquivo
        </button>
        <button role="tab" id="tab-url" aria-selected={tab === 'url'} aria-controls="panel-url" onClick={() => setTab('url')}>
          <Icon name="link" size={16} /> Link de vídeo
          {download && !download.error && <span className="nav-dot" aria-label="baixando" />}
        </button>
      </div>
      {tab === 'file' ? (
        <div role="tabpanel" id="panel-file" aria-labelledby="tab-file">
          <FileImport onImported={onImported} />
        </div>
      ) : (
        <div role="tabpanel" id="panel-url" aria-labelledby="tab-url">
          <UrlImport download={download} onStart={onStartUrl} onCancel={onCancelUrl} onDismiss={onDismissUrl} onOpen={onOpen} />
        </div>
      )}
    </section>
  );
}

function FileImport({ onImported }: { onImported(songId: string, name: string): void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick() {
    setError(null);
    setBusy(true);
    try {
      // Cria/retoma o contexto de áudio dentro do gesto do usuário.
      await getAudioContext().resume();
      const picked = await window.baixaria.pickAudioFile();
      if (picked.canceled) return;
      const name = picked.path.split(/[\\/]/).pop() ?? 'música';
      const song = await window.baixaria.libraryAdd(picked.path, name);
      onImported(song.id, song.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'falha ao importar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="import-drop" onClick={pick} disabled={busy}>
        <Icon name="import" size={28} />
        <strong>{busy ? 'Importando…' : 'Escolher arquivo de música'}</strong>
        <span className="muted small">MP3, WAV ou FLAC. Depois você escolhe as faixas a separar.</span>
      </button>
      {error && (
        <p className="alert" role="alert">
          <Icon name="alert" size={16} /> Não foi possível importar: {error}
        </p>
      )}
    </>
  );
}

interface UrlProps {
  download: UrlDownload | null;
  onStart(req: UrlRequest): void;
  onCancel(): void;
  onDismiss(): void;
  onOpen(songId: string, name: string): void;
}

function UrlImport({ download, onStart, onCancel, onDismiss, onOpen }: UrlProps) {
  const [noticeOk, setNoticeOk] = useState(() => load(NOTICE_KEY) === '1');
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState<VideoPreview | null>(null);
  const [looking, setLooking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<AudioFormatName>(() => {
    const f = load(FORMAT_KEY);
    return f === 'mp3' || f === 'wav' ? f : 'flac';
  });
  const [separate, setSeparate] = useState(() => load(SEPARATE_KEY) !== '0');
  const [choice, setChoice] = useState<{ stems: string[]; rest: boolean }>({ stems: [], rest: false });
  const [muted, setMuted] = useState<Set<string>>(new Set());
  const [cpu, setCpu] = useState(false);
  const [voiceSplit, setVoiceSplit] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => save(FORMAT_KEY, format), [format]);
  useEffect(() => save(SEPARATE_KEY, separate ? '1' : '0'), [separate]);
  useEffect(() => {
    void window.baixaria.stemsAvailable().then((r) => {
      setCpu(r.runtime === 'cpu');
      setVoiceSplit(!!r.voiceSplit);
    });
    void window.baixaria.ytdlpVersion().then((r) => setVersion(r.available ? r.version : null));
  }, []);

  async function lookup(raw: string) {
    const text = raw.trim();
    if (!text) return;
    const my = ++seq.current;
    setError(null);
    setPreview(null);
    setLooking(true);
    try {
      const p = await window.baixaria.videoInfo(text);
      if (my === seq.current) setPreview(p);
    } catch (e) {
      if (my === seq.current) setError(cleanIpcError(e));
    } finally {
      if (my === seq.current) setLooking(false);
    }
  }

  async function update() {
    setUpdating(true);
    setUpdateMsg(null);
    try {
      const r = await window.baixaria.ytdlpUpdate();
      if (r.updated) {
        setVersion(r.version ?? version);
        setUpdateMsg(`Baixador atualizado: ${r.version ?? ''}`);
      }
    } catch (e) {
      setUpdateMsg(`Não foi possível atualizar: ${cleanIpcError(e)}`);
    } finally {
      setUpdating(false);
    }
  }

  function start(options?: SeparateOptions) {
    if (!preview) return;
    const lanes = [...choice.stems, ...(choice.rest ? ['rest'] : [])];
    const startMix = options ? Object.fromEntries(lanes.map((k) => [k, !muted.has(k)])) : undefined;
    void getAudioContext().resume();
    onStart({ url: preview.url, title: preview.title, format, ...(options ? { separate: options } : {}), ...(startMix ? { startMix } : {}) });
  }

  if (!noticeOk) {
    return (
      <div className="card notice" role="region" aria-label="Uso responsável">
        <h2>Antes de baixar</h2>
        <p>Use este recurso só com conteúdo que você tem direito de baixar:</p>
        <ul>
          <li>vídeos seus;</li>
          <li>conteúdo em licença livre, como Creative Commons;</li>
          <li>material com autorização de quem tem os direitos, ou casos permitidos pelos termos do site e pela lei.</li>
        </ul>
        <p className="muted small">
          O app não contorna proteções: não baixa vídeo privado, pago ou com DRM, e não usa sua conta nem os cookies do navegador. Playlists não são baixadas; um vídeo por vez. A origem de cada
          música fica guardada na biblioteca.
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
    );
  }

  if (download) {
    const label = download.error
      ? 'Falhou'
      : download.phase === 'convert'
        ? 'Convertendo o áudio'
        : `Baixando${download.speed ? ` · ${fmtSpeed(download.speed)}` : ''}`;
    return (
      <div className="card url-job">
        <div className="url-job-head">
          <Icon name="link" size={18} />
          <strong title={download.title}>{download.title}</strong>
        </div>
        {download.error ? (
          <>
            <p className="alert" role="alert">
              <Icon name="alert" size={16} /> Não foi possível baixar: {download.error}
            </p>
            {download.outdated && (
              <p className="muted small">
                Sites mudam com frequência e o baixador precisa acompanhar.{' '}
                <button className="link-btn" onClick={() => void update()} disabled={updating}>
                  {updating ? 'Atualizando…' : 'Atualizar baixador'}
                </button>
              </p>
            )}
            {updateMsg && <p className="muted small">{updateMsg}</p>}
            <div className="row-end">
              <button className="ghost" onClick={onDismiss}>
                Voltar
              </button>
            </div>
          </>
        ) : (
          <>
            <Progress value={download.phase === 'convert' || download.percent === null ? null : download.percent / 100} label={label} />
            <p className="muted small">
              {download.separate ? 'Depois do download, a separação e a análise seguem em segundo plano. ' : ''}Você pode trocar de tela: o trabalho continua.
            </p>
            <div className="row-end">
              <button className="ghost" onClick={onCancel}>
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  const tooLong = !!preview && preview.duration > preview.maxDuration;
  const lanes = [...choice.stems, ...(choice.rest ? ['rest'] : [])];

  return (
    <div className="url-import">
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
            const text = e.clipboardData.getData('text');
            if (text) {
              e.preventDefault();
              setUrl(text.trim());
              void lookup(text);
            }
          }}
          aria-label="Link do vídeo"
          spellCheck={false}
          autoFocus
        />
        <button className="primary" type="submit" disabled={looking || url.trim().length === 0}>
          {looking ? 'Buscando…' : 'Buscar'}
        </button>
      </form>

      {looking && <Progress value={null} label="Lendo as informações do vídeo" />}
      {error && (
        <p className="alert" role="alert">
          <Icon name="alert" size={16} /> {error}
        </p>
      )}

      {preview && (
        <div className="card url-preview" aria-label="Prévia do vídeo">
          <div className="url-meta">
            {preview.thumbnailData ? <img className="url-thumb" src={preview.thumbnailData} alt="" /> : <div className="url-thumb empty" aria-hidden="true"><Icon name="wave" size={26} /></div>}
            <div className="url-text">
              <strong>{preview.title}</strong>
              <span className="muted">{[preview.channel, preview.site].filter(Boolean).join(' · ')}</span>
              <span className="muted small">{fmtDuration(preview.duration)}</span>
            </div>
          </div>

          {preview.existing ? (
            <div className="sp-foot">
              <span className="muted small">Este vídeo já está na biblioteca.</span>
              <div className="spacer" />
              <button className="primary" onClick={() => onOpen(preview.existing!.id, preview.existing!.name)}>
                Abrir música
              </button>
            </div>
          ) : tooLong ? (
            <p className="alert">O limite é de {Math.round(preview.maxDuration / 60)} minutos.</p>
          ) : (
            <>
              <div className="sp-section">
                <span className="sp-title">Formato do áudio</span>
                <div className="seg small" role="radiogroup" aria-label="Formato do áudio">
                  {FORMATS.map((f) => (
                    <button key={f.id} type="button" role="radio" aria-checked={format === f.id} aria-pressed={format === f.id} title={f.title} onClick={() => setFormat(f.id)}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="check challenge">
                <input type="checkbox" checked={separate} onChange={(e) => setSeparate(e.target.checked)} /> Separar as faixas depois de baixar
              </label>
              {separate ? (
                <StemPicker busy={false} cpu={cpu} voiceSplit={voiceSplit} submitLabel="Baixar e separar" onSubmit={(o) => start(o)} onChange={setChoice}>
                  {lanes.length > 0 && (
                    <div className="sp-section">
                      <span className="sp-title">Começar tocando</span>
                      <div className="sp-chips" role="group" aria-label="Começar tocando">
                        {sortStems(lanes).map((k) => {
                          const on = !muted.has(k);
                          const info = stemInfo(k);
                          return (
                            <label key={k} className={`sp-chip start stem-${k} ${on ? 'on' : 'off'}`} title={on ? 'Começa tocando' : 'Começa muda'}>
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={() =>
                                  setMuted((m) => {
                                    const n = new Set(m);
                                    if (n.has(k)) n.delete(k);
                                    else n.add(k);
                                    return n;
                                  })
                                }
                                aria-label={`${info.label}: ${on ? 'ativa' : 'muda'}`}
                              />
                              <Icon name={on ? info.icon : 'mute'} size={16} /> {info.label}
                              <span className="start-state">{on ? 'ativa' : 'muda'}</span>
                            </label>
                          );
                        })}
                      </div>
                      <span className="muted small">Por exemplo, baixo mudo e o resto ativo, para tocar junto. Dá para mudar tudo no player.</span>
                    </div>
                  )}
                </StemPicker>
              ) : (
                <div className="sp-foot">
                  <span className="muted small">A música entra na biblioteca; você separa as faixas quando quiser.</span>
                  <div className="spacer" />
                  <button className="primary" onClick={() => start()}>
                    <Icon name="import" size={16} /> Baixar
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <p className="muted small url-foot">
        {version ? `Baixador yt-dlp ${version}. ` : 'Baixador yt-dlp não encontrado. '}
        {version && (
          <button className="link-btn" onClick={() => void update()} disabled={updating}>
            {updating ? 'Atualizando…' : 'Atualizar baixador'}
          </button>
        )}
        {updateMsg && <span> · {updateMsg}</span>}
      </p>
    </div>
  );
}

/** "Error invoking remote method 'x': Error: motivo" → "motivo". */
export function cleanIpcError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}
