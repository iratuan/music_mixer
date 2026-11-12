import { contextBridge, ipcRenderer } from 'electron';

/**
 * API mínima exposta ao renderer. Nenhum acesso genérico a ipcRenderer, fs ou shell.
 * Cada função corresponde a um canal de ALLOWED_CHANNELS no processo principal.
 */
export type ExportKindName = 'midi' | 'wav' | 'pdf' | 'txt';
export interface LibrarySong {
  readonly id: string;
  readonly name: string;
  readonly addedAt?: string;
  readonly path?: string;
  readonly stems: string[] | null;
  readonly meta?: { readonly bpm?: number; readonly key?: string; readonly bpmRange?: readonly [number, number] };
  readonly origin?: { readonly kind: 'file' } | { readonly kind: 'url'; readonly site: string; readonly url: string; readonly channel: string; readonly downloadedAt: string };
  /** Estado inicial do mixer: faixa → começa tocando (true) ou muda (false). */
  readonly startMix?: Readonly<Record<string, boolean>>;
  /** Mapa da música salvo (partes por compasso). */
  readonly sections?: ReadonlyArray<{ readonly startBar: number; readonly name: string }>;
  /** Coleções em que a música está. */
  readonly collections?: readonly string[];
  /** Há miniatura do vídeo (libraryReadCover). */
  readonly cover?: boolean;
}

/** Prévia de um vídeo antes de baixar. */
export interface VideoPreview {
  readonly url: string;
  readonly title: string;
  readonly channel: string;
  readonly duration: number;
  readonly site: string;
  readonly thumbnailData: string | null;
  /** Limite de duração em segundos. */
  readonly maxDuration: number;
  /** O mesmo vídeo já está na biblioteca. */
  readonly existing?: { readonly id: string; readonly name: string };
}

export type AudioFormatName = 'mp3' | 'flac' | 'wav';

/** Qualidade do MP3 na ferramenta "Baixar MP3": V0 (VBR transparente) ou 320 kbps fixos. */
export type GrabQuality = 'v0' | 'cbr320';

export interface GrabSource {
  readonly codec: string;
  readonly bitrate: number | null;
  readonly sampleRate: number | null;
  readonly channels: number | null;
}

/** Prévia da ferramenta: o vídeo, o formato do melhor fluxo de áudio e os avisos da fonte. */
export interface GrabPreview extends VideoPreview {
  readonly id: string | null;
  readonly source: GrabSource | null;
  readonly warnings: readonly string[];
}

export interface GrabProgress {
  readonly url: string;
  readonly phase: 'download' | 'convert' | 'verify';
  readonly percent: number | null;
  readonly speed?: number | null;
  readonly eta?: number | null;
}

export interface GrabProbe {
  readonly codec: string;
  readonly sampleRate: number;
  readonly channels: number;
  readonly durationSec: number;
  readonly bitrate: number | null;
  readonly tags: Readonly<Record<string, string>>;
}

export interface GrabCheck {
  readonly id: string;
  readonly level: 'ok' | 'warn' | 'fail';
  readonly detail: string;
}

export interface GrabResult {
  readonly path: string;
  readonly name: string;
  readonly bytes: number;
  /** Cópia do fluxo original (Opus/M4A), quando pedida. */
  readonly original: string | null;
  readonly report: {
    readonly source: GrabProbe | null;
    readonly output: GrabProbe | null;
    readonly checks: readonly GrabCheck[];
    readonly decoded: boolean;
    readonly peakDb: number | null;
  };
  readonly warnings: readonly string[];
}

export interface ImportProgress {
  readonly url: string;
  readonly phase: 'download' | 'convert';
  /** 0–100 ou null (tamanho desconhecido, conversão). */
  readonly percent: number | null;
  readonly speed?: number | null;
  readonly eta?: number | null;
}

export interface StemsProgress {
  readonly percent: number;
  /** Música que está sendo separada. */
  readonly songId?: string;
  /** Etapa em texto ("Separando com o Demucs", "Separando voz principal e backing vocals"…). */
  readonly phase?: string;
}

/** Escolha de faixas: bass, drums, guitar, piano, other e vocals (voz inteira) ou lead + backing. */
export interface SeparateOptions {
  readonly quality?: 'fast' | 'best';
  readonly stems?: readonly string[];
}

/** Progresso de tarefas longas de uma música: análise, transposição, MIDI ("midi:bass"). */
export interface SongProgress {
  readonly songId: string;
  readonly task: string;
  readonly percent: number;
}

/** Análise da música inteira (bf_tools.py analyze). Tons e acordes em classes de altura (0 = Dó). */
export interface SongAnalysis {
  readonly version: number;
  readonly duration: number;
  readonly bpm: number;
  /** Andamento (versão 3+): variável em gravações ao vivo; faixa p5–p95; modo escolhido. */
  readonly tempo?: {
    readonly variable: boolean;
    readonly range?: readonly [number, number];
    readonly curve?: ReadonlyArray<readonly [number, number]>;
    readonly mode?: 'auto' | 'fixed';
  };
  readonly beats: readonly number[];
  /** Índice, em `beats`, do primeiro tempo 1 de compasso. */
  readonly firstDownbeat: number;
  readonly tuningCents: number;
  readonly key: { readonly tonic: number; readonly mode: 'major' | 'minor'; readonly confidence: number };
  readonly bars: ReadonlyArray<{
    readonly index: number;
    readonly start: number;
    readonly end: number;
    readonly key: { readonly tonic: number; readonly mode: 'major' | 'minor' };
    readonly chords: ReadonlyArray<{
      readonly beat: number;
      readonly start: number;
      readonly beats: number;
      readonly chord: { readonly root: number; readonly quality: string; readonly bass?: number } | null;
    }>;
  }>;
}

export interface BaixariaApi {
  getAppInfo(): Promise<{ name: string; version: string; platform: string }>;
  openAppFolder(which: 'logs' | 'licenses'): Promise<{ ok: true }>;
  pickAudioFile(): Promise<{ canceled: true } | { canceled: false; path: string }>;
  readAudioFile(path: string): Promise<Uint8Array>;
  chooseExportPath(kind: ExportKindName, suggestedName: string): Promise<{ canceled: true } | { canceled: false; path: string }>;
  writeExportFile(path: string, bytes: Uint8Array): Promise<{ bytes: number }>;
  /** runtime: 'cpu' = runtime embutido do instalador (mais lento); 'local' = ambiente do projeto (GPU, se houver). */
  stemsAvailable(): Promise<{ available: boolean; model: string; runtime?: 'cpu' | 'local'; voiceSplit?: boolean }>;
  /**
   * quality: 'fast' (uma passada) ou 'best' (duas passadas deslocadas, ~2× mais lenta). Sem valor: escolha automática.
   * stems: faixas a manter; as demais viram "rest". Sem valor: as 6 do Demucs.
   */
  separateStems(songId: string, options?: SeparateOptions): Promise<{ stems: string[]; elapsedMs: number }>;
  libraryList(): Promise<LibrarySong[]>;
  libraryAdd(path: string, name?: string): Promise<LibrarySong>;
  libraryReadOriginal(id: string): Promise<{ name: string; path: string; bytes: Uint8Array }>;
  /** Faixa separada; com `semitones` ≠ 0, a versão transposta (gerada antes por stemsTranspose). */
  libraryReadStem(id: string, stem: string, semitones?: number): Promise<Uint8Array>;
  libraryReadAnalysis(id: string): Promise<SongAnalysis | null>;
  libraryRemove(id: string): Promise<void>;
  /** Analisa a música inteira (andamento, compassos, acordes, tom) e guarda na biblioteca. */
  analyzeSong(id: string, opts?: { tempo?: 'auto' | 'fixed' }): Promise<SongAnalysis>;
  /** Gera as faixas transpostas (Rubber Band), em cache. −6…+6 meios tons. */
  stemsTranspose(id: string, semitones: number): Promise<{ stems: string[] }>;
  /** MIDI da faixa (Basic Pitch), já transposto. */
  stemsMidi(id: string, stem: string, semitones: number): Promise<Uint8Array>;
  onStemsProgress(listener: (p: StemsProgress) => void): () => void;
  /** Faixas ainda em WAV: bytes e número de músicas. */
  libraryStorage(): Promise<{ wavBytes: number; songs: number }>;
  /** Compacta as faixas em FLAC (todas as músicas); progresso por onCompactProgress. */
  libraryCompact(): Promise<{ songs: number; freed: number }>;
  onCompactProgress(listener: (p: { done: number; total: number; freed: number; name?: string }) => void): () => void;
  onSongProgress(listener: (p: SongProgress) => void): () => void;
  /** Lê título, canal, duração e miniatura de um vídeo (yt-dlp), sem baixar. */
  videoInfo(url: string): Promise<VideoPreview>;
  /** Baixa o áudio do vídeo para a biblioteca. */
  importUrl(url: string, format: AudioFormatName, startMix?: Record<string, boolean>): Promise<{ id: string; name: string; existing: boolean }>;
  cancelImportUrl(): Promise<{ cancelled: boolean }>;
  /** Ferramenta "Baixar MP3": pasta de destino lembrada (null na primeira vez). */
  grabFolder(): Promise<{ folder: string | null }>;
  grabPickFolder(): Promise<{ canceled: true } | { canceled: false; folder: string }>;
  /** Lê o vídeo e o formato do melhor fluxo de áudio, sem baixar. */
  grabInfo(url: string): Promise<GrabPreview>;
  /** Baixa e converte uma vez para MP3, com verificação. */
  grabFetch(url: string, quality: GrabQuality, keepOriginal: boolean): Promise<GrabResult>;
  grabCancel(): Promise<{ cancelled: boolean }>;
  onGrabProgress(listener: (p: GrabProgress) => void): () => void;
  /** Abre a pasta com o arquivo selecionado (só dentro da pasta de destino). */
  grabReveal(path: string): Promise<{ ok: boolean }>;
  cancelSeparation(songId: string): Promise<{ cancelled: boolean }>;
  /** Modelo de divisão da voz (baixado sob demanda). */
  voiceModelStatus(): Promise<{ installed: boolean; downloading: boolean; bytes: number }>;
  voiceModelDownload(): Promise<{ installed: boolean }>;
  voiceModelCancel(): Promise<{ cancelled: boolean }>;
  onVoiceModelProgress(listener: (p: { received: number; total: number; speed: number }) => void): () => void;
  onImportProgress(listener: (p: ImportProgress) => void): () => void;
  ytdlpVersion(): Promise<{ available: false } | { available: true; version: string }>;
  /** Pede confirmação (diálogo nativo) e atualiza o yt-dlp. */
  ytdlpUpdate(): Promise<{ updated: boolean; version?: string }>;
  librarySetStartMix(id: string, startMix: Record<string, boolean>): Promise<void>;
  libraryCollections(): Promise<string[]>;
  libraryCollectionOp(op: 'create' | 'rename' | 'delete' | 'add' | 'remove', name: string, extra?: { to?: string; ids?: readonly string[] }): Promise<string[]>;
  librarySetSections(id: string, sections: ReadonlyArray<{ startBar: number; name: string }>): Promise<void>;
  exportMapPdf(path: string, map: unknown): Promise<{ bytes: number }>;
  libraryReadCover(id: string): Promise<string | null>;
  /** Abre a página de origem no navegador do sistema, depois de confirmar. */
  libraryOpenOrigin(id: string): Promise<{ opened: boolean }>;
}

function subscribe<T>(channel: string, listener: (p: T) => void): () => void {
  const handler = (_event: unknown, p: T) => listener(p);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

const api: BaixariaApi = {
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  openAppFolder: (which) => ipcRenderer.invoke('app:open-folder', { which }),
  pickAudioFile: () => ipcRenderer.invoke('dialog:pick-audio'),
  readAudioFile: (path: string) => ipcRenderer.invoke('audio:read', path),
  chooseExportPath: (kind, suggestedName) => ipcRenderer.invoke('dialog:save', { kind, suggestedName }),
  writeExportFile: (path, bytes) => ipcRenderer.invoke('file:write', { path, bytes }),
  stemsAvailable: () => ipcRenderer.invoke('stems:available'),
  separateStems: (songId, options = {}) => ipcRenderer.invoke('stems:separate', { id: songId, quality: options.quality, stems: options.stems }),
  libraryList: () => ipcRenderer.invoke('library:list'),
  libraryAdd: (path, name) => ipcRenderer.invoke('library:add', { path, name }),
  libraryReadOriginal: (id) => ipcRenderer.invoke('library:read-original', { id }),
  libraryReadStem: (id, stem, semitones = 0) => ipcRenderer.invoke('library:read-stem', { id, stem, semitones }),
  libraryReadAnalysis: (id) => ipcRenderer.invoke('library:read-analysis', { id }),
  libraryRemove: (id) => ipcRenderer.invoke('library:remove', { id }),
  analyzeSong: (id, opts) => ipcRenderer.invoke('song:analyze', { id, tempo: opts?.tempo }),
  stemsTranspose: (id, semitones) => ipcRenderer.invoke('stems:transpose', { id, semitones }),
  stemsMidi: (id, stem, semitones) => ipcRenderer.invoke('stems:midi', { id, stem, semitones }),
  onStemsProgress: (listener) => subscribe('stems:progress', listener),
  libraryStorage: () => ipcRenderer.invoke('library:storage'),
  libraryCompact: () => ipcRenderer.invoke('library:compact'),
  onCompactProgress: (listener) => subscribe('library:compact-progress', listener),
  onSongProgress: (listener) => subscribe('song:progress', listener),
  videoInfo: (url) => ipcRenderer.invoke('import:url-info', { url }),
  importUrl: (url, format, startMix) => ipcRenderer.invoke('import:url', { url, format, startMix }),
  cancelImportUrl: () => ipcRenderer.invoke('import:url-cancel'),
  grabFolder: () => ipcRenderer.invoke('grab:folder'),
  grabPickFolder: () => ipcRenderer.invoke('grab:pick-folder'),
  grabInfo: (url) => ipcRenderer.invoke('grab:info', { url }),
  grabFetch: (url, quality, keepOriginal) => ipcRenderer.invoke('grab:fetch', { url, quality, keepOriginal }),
  grabCancel: () => ipcRenderer.invoke('grab:cancel'),
  onGrabProgress: (listener) => subscribe('grab:progress', listener),
  grabReveal: (path) => ipcRenderer.invoke('grab:reveal', { path }),
  cancelSeparation: (songId) => ipcRenderer.invoke('stems:cancel', { id: songId }),
  voiceModelStatus: () => ipcRenderer.invoke('voice:status'),
  voiceModelDownload: () => ipcRenderer.invoke('voice:download'),
  voiceModelCancel: () => ipcRenderer.invoke('voice:cancel'),
  onVoiceModelProgress: (listener) => subscribe('voice:progress', listener),
  onImportProgress: (listener) => subscribe('import:progress', listener),
  ytdlpVersion: () => ipcRenderer.invoke('ytdlp:version'),
  ytdlpUpdate: () => ipcRenderer.invoke('ytdlp:update'),
  librarySetStartMix: (id, startMix) => ipcRenderer.invoke('library:set-start-mix', { id, startMix }),
  libraryCollections: () => ipcRenderer.invoke('library:collections'),
  libraryCollectionOp: (op, name, extra) => ipcRenderer.invoke('library:collection-op', { op, name, ...(extra ?? {}) }),
  librarySetSections: (id, sections) => ipcRenderer.invoke('library:set-sections', { id, sections }),
  exportMapPdf: (path, map) => ipcRenderer.invoke('export:map-pdf', { path, map }),
  libraryReadCover: (id) => ipcRenderer.invoke('library:read-cover', { id }),
  libraryOpenOrigin: (id) => ipcRenderer.invoke('library:open-origin', { id }),
};

contextBridge.exposeInMainWorld('baixaria', api);
