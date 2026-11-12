import { app, BrowserWindow, dialog, ipcMain, session, shell, type IpcMainInvokeEvent } from 'electron';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { Library, isSemitones } from './library.js';
import { sanitizeMap, sanitizeSections, songMapHtml } from './songmap.js';
import { DEMUCS_STEMS, parseStemChoice } from './stems.js';
import { VOICE_MODEL, downloadVoiceModel } from './voicemodel.js';
import { busyKeys, initLog, killAll, killTree, logLine, requireFree, runTool, single, track } from './procs.js';
import {
  AUDIO_FORMAT_SELECTOR,
  buildFfmpegArgs,
  grabFileName,
  isGrabQuality,
  mp3Channels,
  mp3SampleRate,
  parseGrabMeta,
  parseProbe,
  sourceWarnings,
  uniqueBaseName,
  verifyGrab,
  type GrabCheck,
  type GrabMeta,
  type GrabQuality,
  type ProbeInfo,
} from './grab.js';
import {
  DEFAULT_MAX_DURATION_SEC,
  PROGRESS_TEMPLATE,
  explainYtdlpError,
  isAudioFormat,
  parseProgressLine,
  parseVideoInfo,
  sanitizeStartMix,
  validateVideoUrl,
  type VideoInfo,
} from './video.js';
import {
  AUDIO_EXTENSIONS,
  CONTENT_SECURITY_POLICY,
  EXPORT_KINDS,
  GrantedPaths,
  GrantedWrites,
  MAX_EXPORT_BYTES,
  MAX_IMPORT_BYTES,
  SECURE_WEB_PREFERENCES,
  isAllowedChannel,
  isAllowedNavigation,
  isExportKind,
  sanitizeSuggestedName,
  type ExportKind,
} from './security.js';

/**
 * Processo principal. O renderer só lê arquivos e só escreve arquivos que o usuário
 * escolheu em diálogos nativos nesta sessão. Permissão de mídia: apenas áudio, apenas o app.
 *
 * Variáveis de teste de fumaça (não usadas pelo usuário final):
 *   BF_SMOKE_SCREENSHOT=<arquivo.png> captura a janela e encerra.
 *   BF_SMOKE_SCREEN=<tela>            abre direto em uma tela.
 */

const APP_ORIGIN = 'file://';
const granted = new GrantedPaths();
const grantedWrites = new GrantedWrites();
let libraryRoot = '';
let library: Library;

function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url ?? '';
  return url.startsWith(APP_ORIGIN);
}

function ownerOf(event: IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender);
}

function guard(channel: (typeof import('./security.js'))['ALLOWED_CHANNELS'][number], event: IpcMainInvokeEvent): void {
  if (!isAllowedChannel(channel) || !isTrustedSender(event)) throw new Error('acesso negado');
}

function registerIpc(): void {
  ipcMain.handle('app:info', (event) => {
    guard('app:info', event);
    return { name: app.getName(), version: app.getVersion(), platform: process.platform };
  });

  /** Abre uma pasta fixa do app no Explorer: licenças de terceiros ou registros (para relatar problemas). */
  ipcMain.handle('app:open-folder', async (event, input: unknown) => {
    guard('app:open-folder', event);
    const which = (input as { which?: unknown })?.which;
    const dir =
      which === 'logs'
        ? path.join(app.getPath('userData'), 'logs')
        : which === 'licenses'
          ? [path.join(process.resourcesPath, 'licenses'), path.join(app.getAppPath(), 'tooling', 'licenses')].find((d) => existsSync(d))
          : undefined;
    if (!dir) throw new Error('pasta indisponível');
    await mkdir(dir, { recursive: true });
    const err = await shell.openPath(dir);
    if (err) throw new Error(err);
    return { ok: true };
  });

  ipcMain.handle('dialog:pick-audio', async (event) => {
    guard('dialog:pick-audio', event);
    const owner = ownerOf(event);
    const options = {
      title: 'Importar música',
      properties: ['openFile' as const],
      filters: [{ name: 'Áudio', extensions: AUDIO_EXTENSIONS.map((e) => e.slice(1)) }],
    };
    const picked = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
    const file = picked.filePaths[0];
    if (picked.canceled || !file) return { canceled: true as const };
    granted.grant(file);
    return { canceled: false as const, path: file };
  });

  ipcMain.handle('audio:read', async (event, input: unknown) => {
    guard('audio:read', event);
    const check = granted.check(input);
    if (!check.ok) throw new Error(check.reason);
    const info = await stat(check.value);
    if (!info.isFile()) throw new Error('não é um arquivo');
    if (info.size > MAX_IMPORT_BYTES) throw new Error('arquivo acima do limite de importação');
    return new Uint8Array(await readFile(check.value));
  });

  ipcMain.handle('dialog:save', async (event, input: unknown) => {
    guard('dialog:save', event);
    const req = (input ?? {}) as { kind?: unknown; suggestedName?: unknown };
    if (!isExportKind(req.kind)) throw new Error('tipo de exportação inválido');
    const kind: ExportKind = req.kind;
    const ext = EXPORT_KINDS[kind].slice(1);
    const LABELS: Record<ExportKind, string> = { midi: 'MIDI', wav: 'Áudio WAV', pdf: 'PDF', txt: 'Texto' };
    const options = {
      title: `Exportar ${LABELS[kind]}`,
      defaultPath: `${sanitizeSuggestedName(req.suggestedName)}${EXPORT_KINDS[kind]}`,
      filters: [{ name: LABELS[kind], extensions: [ext] }],
    };
    const owner = ownerOf(event);
    const res = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options);
    if (res.canceled || !res.filePath) return { canceled: true as const };
    grantedWrites.grant(res.filePath, kind);
    return { canceled: false as const, path: res.filePath };
  });

  ipcMain.handle('stems:available', (event) => {
    guard('stems:available', event);
    const py = stemsPython();
    // Voz principal/backing: precisa do audio-separator e do modelo de karaokê (não vêm no instalador).
    const voiceSplit = voiceModelReady();
    return { available: existsSync(py.exe), model: STEM_MODEL, runtime: py.bundled ? 'cpu' : 'local', voiceSplit };
  });

  ipcMain.handle('library:list', async (event) => {
    guard('library:list', event);
    return (await library.list()).map((s) => ({
      id: s.id,
      name: s.name,
      addedAt: s.addedAt,
      stems: s.stems ? Object.keys(s.stems).sort() : null,
      ...(s.meta ? { meta: s.meta } : {}),
      origin: s.origin.kind === 'url' ? { kind: 'url' as const, site: s.origin.site, url: s.origin.url, channel: s.origin.channel, downloadedAt: s.origin.downloadedAt } : { kind: 'file' as const },
      ...(s.startMix ? { startMix: s.startMix } : {}),
      ...(s.sections ? { sections: s.sections } : {}),
      ...(s.collections?.length ? { collections: s.collections } : {}),
      cover: existsSync(library.coverPath(s.id)),
    }));
  });

  ipcMain.handle('library:add', async (event, input: unknown) => {
    guard('library:add', event);
    const req = (input ?? {}) as { path?: unknown; name?: unknown };
    const check = granted.check(req.path);
    if (!check.ok) throw new Error(check.reason);
    const name = typeof req.name === 'string' ? req.name : path.parse(check.value).name;
    const rec = await library.add(name, check.value);
    return { id: rec.id, name: rec.name, path: rec.sourcePath, stems: rec.stems ? Object.keys(rec.stems).sort() : null };
  });

  ipcMain.handle('library:read-original', async (event, input: unknown) => {
    guard('library:read-original', event);
    const id = String((input as { id?: unknown })?.id ?? '');
    const rec = await library.get(id);
    if (!rec) throw new Error('música não encontrada');
    const info = await stat(rec.sourcePath);
    if (info.size > MAX_IMPORT_BYTES) throw new Error('arquivo acima do limite de importação');
    return { name: rec.name, path: rec.sourcePath, bytes: new Uint8Array(await readFile(rec.sourcePath)) };
  });

  ipcMain.handle('library:read-stem', async (event, input: unknown) => {
    guard('library:read-stem', event);
    const req = (input ?? {}) as { id?: unknown; stem?: unknown; semitones?: unknown };
    const id = String(req.id ?? '');
    const stem = String(req.stem ?? '');
    const semitones = req.semitones ?? 0;
    if (!isSemitones(semitones)) throw new Error('transposição inválida');
    const original = await library.stemPath(id, stem);
    if (!original) throw new Error('faixa não separada');
    const p = semitones === 0 ? original : library.transposedPath(id, stem, semitones);
    if (!existsSync(p)) throw new Error('faixa transposta ainda não gerada');
    const info = await stat(p);
    if (info.size > MAX_IMPORT_BYTES) throw new Error('faixa acima do limite');
    return new Uint8Array(await readFile(p));
  });

  ipcMain.handle('library:read-analysis', async (event, input: unknown) => {
    guard('library:read-analysis', event);
    return library.readAnalysis(String((input as { id?: unknown })?.id ?? ''));
  });

  /** Analisa a música inteira a partir das faixas separadas (bf_tools.py analyze) e guarda o resultado. */
  ipcMain.handle('song:analyze', async (event, input: unknown) => {
    guard('song:analyze', event);
    const req = (input ?? {}) as { id?: unknown; tempo?: unknown };
    const id = String(req.id ?? '');
    const tempo = req.tempo === 'fixed' || req.tempo === 'auto' ? req.tempo : undefined;
    return single(`analyze:${id}`, () => analyzeSong(event, id, tempo));
  });
  async function analyzeSong(event: IpcMainInvokeEvent, id: string, tempoReq?: 'auto' | 'fixed') {
    const rec = await library.get(id);
    if (!rec?.stems) throw new Error('separe a música antes de analisar');
    const demucsDir = demucsDirOf(id, rec.sourcePath);
    const win = ownerOf(event);
    const send = (percent: number) => {
      if (win && !win.isDestroyed()) win.webContents.send('song:progress', { songId: id, task: 'analyze', percent });
    };
    send(0);
    const out = library.analysisPath(id);
    const tmp = `${out}.tmp`;
    // Sem escolha explícita, mantém a da análise anterior (o usuário pode ter fixado o andamento).
    const prev = (await library.readAnalysis(id).catch(() => null)) as { tempo?: { mode?: string } } | null;
    const tempo = tempoReq ?? (prev?.tempo?.mode === 'fixed' ? 'fixed' : 'auto');
    await runPython([bfToolsPath(), 'analyze', demucsDir, tmp, '--tempo', tempo], send, ANALYZE_TIMEOUT_MS);
    await rename(tmp, out);
    // MIDI em cache levam o mapa de andamento da análise anterior: refeitos quando pedidos.
    await rm(path.join(library.songDir(id), 'midi'), { recursive: true, force: true });
    const analysis = JSON.parse(await readFile(out, 'utf8')) as { bpm?: number; key?: { tonic: number; mode: string }; tempo?: { variable?: boolean; range?: [number, number] } };
    if (analysis.key)
      await library.setMeta(id, {
        bpm: analysis.bpm,
        key: keyName(analysis.key.tonic, analysis.key.mode),
        bpmRange: analysis.tempo?.variable && analysis.tempo.range ? analysis.tempo.range : null,
      });
    send(100);
    return analysis;
  }

  /** Gera (uma vez) todas as faixas transpostas em `semitones` meios tons, com Rubber Band, em paralelo. */
  ipcMain.handle('stems:transpose', async (event, input: unknown) => {
    guard('stems:transpose', event);
    const req = (input ?? {}) as { id?: unknown; semitones?: unknown };
    const id = String(req.id ?? '');
    const semitones = req.semitones;
    if (!isSemitones(semitones) || semitones === 0) throw new Error('transposição inválida');
    const rec = await library.get(id);
    const map = rec?.stems;
    if (!map) throw new Error('faixas não separadas');
    const win = ownerOf(event);
    const stems = Object.keys(map).sort();
    let done = 0;
    const send = () => {
      if (win && !win.isDestroyed()) win.webContents.send('song:progress', { songId: id, task: 'transpose', percent: Math.round((done / stems.length) * 100) });
    };
    send();
    await Promise.all(
      stems.map(async (stem) => {
        const out = library.transposedPath(id, stem, semitones);
        if (!existsSync(out)) {
          await mkdir(path.dirname(out), { recursive: true });
          const tmp = `${out}.tmp.flac`; // o Rubber Band escolhe o formato pela extensão
          await runRubberbandPitch(map[stem]!, tmp, semitones, stem === 'vocals');
          await rename(tmp, out);
        }
        done++;
        send();
      }),
    );
    return { stems };
  });

  /** MIDI de uma faixa (Basic Pitch), já transposto; fica em cache na pasta da música. */
  ipcMain.handle('stems:midi', async (event, input: unknown) => {
    guard('stems:midi', event);
    const req = (input ?? {}) as { id?: unknown; stem?: unknown; semitones?: unknown };
    const id = String(req.id ?? '');
    const stem = String(req.stem ?? '');
    const semitones = req.semitones ?? 0;
    if (!isSemitones(semitones)) throw new Error('transposição inválida');
    if (!MIDI_STEMS.includes(stem)) throw new Error('esta faixa não tem notas de altura definida para MIDI');
    const src = await library.stemPath(id, stem);
    if (!src) throw new Error('faixa não separada');
    const out = library.midiPath(id, stem, semitones);
    if (!existsSync(out)) await single(`midi:${out}`, async () => {
      if (existsSync(out)) return;
      const analysis = (await library.readAnalysis(id)) as { bpm?: number } | null;
      await mkdir(path.dirname(out), { recursive: true });
      const win = ownerOf(event);
      const send = (percent: number) => {
        if (win && !win.isDestroyed()) win.webContents.send('song:progress', { songId: id, task: `midi:${stem}`, percent });
      };
      const tmp = `${out}.tmp.mid`;
      const args = [bfToolsPath(), 'midi', src, stem, tmp, '--transpose', String(semitones)];
      if (analysis?.bpm) args.push('--bpm', String(analysis.bpm));
      // Mapa de andamento e compassos da análise no MIDI (andamento variável, compasso de entrada).
      if (analysis) args.push('--analysis', library.analysisPath(id));
      await runPython(args, send, MIDI_TIMEOUT_MS);
      await rename(tmp, out);
      for (const old of library.oldMidiPaths(id, stem, semitones)) await rm(old, { force: true });
    });
    return new Uint8Array(await readFile(out));
  });

  ipcMain.handle('library:remove', async (event, input: unknown) => {
    guard('library:remove', event);
    await library.remove(String((input as { id?: unknown })?.id ?? ''));
    return { ok: true };
  });

  /**
   * Separa a música. `stems` escolhe as faixas: as 6 do Demucs (bass, drums, guitar, piano, vocals, other)
   * e/ou a voz dividida em principal (lead) e backing vocals (backing). As não escolhidas viram "rest".
   */
  ipcMain.handle('stems:separate', async (event, input: unknown) => {
    guard('stems:separate', event);
    const req = (input ?? {}) as { id?: unknown; quality?: unknown; stems?: unknown };
    const id = String(req.id ?? '');
    const quality: 'fast' | 'best' | undefined = req.quality === 'fast' || req.quality === 'best' ? req.quality : undefined;
    const keep = parseStemChoice(req.stems);
    const rec = await library.get(id);
    if (!rec) throw new Error('música não encontrada na biblioteca');
    if (separating) throw new Error('já há uma separação em andamento');
    // Faixas em WAV: ~100 MB por minuto de música (mais a divisão da voz). Margem para 10 min.
    await requireFree(library.songDir(id), 1.5 * 1024 ** 3, 'separar as faixas');
    const win = ownerOf(event);
    const custom = keep.length !== DEMUCS_STEMS.length || keep.some((k) => !DEMUCS_STEMS.includes(k));
    const send = (percent: number, phase: string) => {
      if (win && !win.isDestroyed()) win.webContents.send('stems:progress', { percent, songId: id, phase });
    };
    send(0, 'Separando com o Demucs');
    separating = true;
    const job = { id, cancelled: false, child: null as ChildProcess | null };
    sepJob = job;
    const onSpawn = (c: ChildProcess) => (job.child = c);
    try {
      const songDir = library.songDir(id);
      // Caches de uma separação anterior deixam de valer.
      for (const d of ['faixas', 'tom', 'midi']) await rm(path.join(songDir, d), { recursive: true, force: true });
      const outRoot = path.join(songDir, 'demucs');
      const started = Date.now();
      // Peso de cada etapa na barra, pelo tempo medido: dividir a voz (Roformer) leva ~4× o Demucs;
      // só juntar as faixas não escolhidas é quase instantâneo.
      const splitVoice = keep.includes('lead') || keep.includes('backing');
      const demucsShare = !custom ? 1 : splitVoice ? 0.25 : 0.9;
      const extraShare = 1 - demucsShare;
      await runDemucs(rec.sourcePath, outRoot, (p) => send(Math.round(p * demucsShare), 'Separando com o Demucs'), quality, onSpawn);
      if (job.cancelled) throw new Error('separação cancelada');
      const dir = demucsDirOf(id, rec.sourcePath);
      const map: Record<string, string> = {};
      if (custom) {
        const phase = splitVoice ? 'Separando voz principal e backing vocals' : 'Montando as faixas escolhidas';
        const base = Math.round(demucsShare * 100);
        send(base, phase);
        const out = await runPython(
          [bfToolsPath(), 'stems', dir, path.join(songDir, 'faixas'), '--keep', keep.join(','), '--models', separatorModelsDir()],
          (p) => send(base + Math.round(p * extraShare), phase),
          SEPARATE_EXTRA_TIMEOUT_MS,
          onSpawn,
        );
        const parsed = JSON.parse(out.trim().split(/\r?\n/).pop() ?? '{}') as Record<string, string>;
        for (const [k, v] of Object.entries(parsed)) map[k] = path.resolve(v);
      } else {
        const files = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith('.wav')).sort();
        for (const f of files) map[path.parse(f).name] = path.join(dir, f);
      }
      // Faixas em FLAC 24 bits (sem perda audível): ~70% menos espaço que o WAV de ponto flutuante.
      send(99, 'Compactando as faixas (FLAC)');
      const compact = await compressSongStems(id, rec.sourcePath, map);
      await library.setStems(id, compact.map);
      send(100, 'Pronto');
      return { stems: Object.keys(compact.map).sort(), elapsedMs: Date.now() - started };
    } catch (e) {
      if (job.cancelled) throw new Error('separação cancelada');
      throw e;
    } finally {
      separating = false;
      sepJob = null;
    }
  });

  /** Espaço das faixas ainda em WAV (biblioteca anterior à compactação) e quanto a compactação libera. */
  ipcMain.handle('library:storage', async (event) => {
    guard('library:storage', event);
    let wavBytes = 0;
    let songs = 0;
    for (const s of await library.list()) {
      const n = await wavBytesOf(s.id, s.sourcePath);
      if (n > 0) (wavBytes += n), songs++;
    }
    return { wavBytes, songs };
  });

  /** Compacta em FLAC as faixas de todas as músicas ainda em WAV (uma por vez, com progresso). */
  ipcMain.handle('library:compact', async (event) => {
    guard('library:compact', event);
    if (separating || busyKeys().length) throw new Error('espere a separação ou análise em andamento terminar');
    if (compacting) throw new Error('a compactação já está em andamento');
    compacting = true;
    const win = ownerOf(event);
    try {
      const todo = [];
      for (const s of await library.list()) if (s.stems && (await wavBytesOf(s.id, s.sourcePath)) > 0) todo.push(s);
      let freed = 0;
      for (let i = 0; i < todo.length; i++) {
        const s = todo[i]!;
        if (win && !win.isDestroyed()) win.webContents.send('library:compact-progress', { done: i, total: todo.length, freed, name: s.name });
        const r = await compressSongStems(s.id, s.sourcePath, s.stems!);
        await library.setStems(s.id, r.map);
        freed += r.freed;
      }
      if (win && !win.isDestroyed()) win.webContents.send('library:compact-progress', { done: todo.length, total: todo.length, freed });
      logLine(`biblioteca compactada: ${todo.length} músicas, ${(freed / 1024 ** 2).toFixed(0)} MB liberados`);
      return { songs: todo.length, freed };
    } finally {
      compacting = false;
    }
  });

  /** Modelo de divisão da voz: instalado? baixando? */
  ipcMain.handle('voice:status', (event) => {
    guard('voice:status', event);
    return { installed: voiceModelReady(), downloading: !!voiceDownload, bytes: VOICE_MODEL.bytes };
  });

  /** Baixa o modelo (913 MB, uma vez). Progresso em "voice:progress"; "voice:cancel" interrompe (o parcial fica para retomar). */
  ipcMain.handle('voice:download', async (event) => {
    guard('voice:download', event);
    if (voiceModelReady()) return { installed: true };
    if (voiceDownload) throw new Error('o download do modelo já está em andamento');
    const dir = userVoiceDir();
    await requireFree(path.dirname(dir), VOICE_MODEL.bytes + 200 * 1024 ** 2, 'baixar o modelo de voz');
    const config = bundledVoiceConfig();
    if (!config) throw new Error('configuração do modelo ausente na instalação');
    const ctrl = new AbortController();
    voiceDownload = ctrl;
    const win = ownerOf(event);
    try {
      await downloadVoiceModel(
        dir,
        (p) => {
          if (win && !win.isDestroyed()) win.webContents.send('voice:progress', p);
        },
        ctrl.signal,
      );
      await copyFile(config, path.join(dir, VOICE_MODEL.config));
      logLine('modelo de voz baixado');
      return { installed: voiceModelReady() };
    } catch (e) {
      logLine('download do modelo de voz falhou', e instanceof Error ? e : String(e));
      throw e;
    } finally {
      voiceDownload = null;
    }
  });

  ipcMain.handle('voice:cancel', (event) => {
    guard('voice:cancel', event);
    voiceDownload?.abort();
    return { cancelled: !!voiceDownload };
  });

  ipcMain.handle('stems:cancel', (event, input: unknown) => {
    guard('stems:cancel', event);
    const id = String((input as { id?: unknown })?.id ?? '');
    if (!sepJob || sepJob.id !== id) return { cancelled: false };
    sepJob.cancelled = true;
    killTree(sepJob.child);
    return { cancelled: true };
  });

  /* ------------------------- importar pelo link de um vídeo (yt-dlp) ------------------------- */

  /** Metadados antes de baixar: título, canal, duração, site e miniatura (como data: URL). */
  ipcMain.handle('import:url-info', async (event, input: unknown) => {
    guard('import:url-info', event);
    const check = validateVideoUrl((input as { url?: unknown })?.url);
    if (!check.ok) throw new Error(check.reason);
    const info = await fetchVideoInfo(check.url);
    const existing = (await library.findByUrl(info.url)) ?? (await library.findByUrl(check.url));
    const thumb = info.thumbnail ? await fetchThumbnail(info.thumbnail) : null;
    if (thumb) thumbCache.set(info.url, thumb);
    return {
      ...info,
      thumbnailData: thumb ? `data:${thumb.mime};base64,${Buffer.from(thumb.bytes).toString('base64')}` : null,
      maxDuration: maxVideoDuration(),
      ...(existing ? { existing: { id: existing.id, name: existing.name } } : {}),
    };
  });

  /**
   * Baixa só o áudio para songs/<id>/original.<formato>. Um download por vez; "import:url-cancel"
   * encerra o processo e apaga os arquivos parciais.
   */
  ipcMain.handle('import:url', async (event, input: unknown) => {
    guard('import:url', event);
    const req = (input ?? {}) as { url?: unknown; format?: unknown; startMix?: unknown };
    const check = validateVideoUrl(req.url);
    if (!check.ok) throw new Error(check.reason);
    const format = isAudioFormat(req.format) ? req.format : 'flac';
    const startMix = req.startMix === undefined ? undefined : sanitizeStartMix(req.startMix);
    if (download) throw new Error('já há um download em andamento');
    await requireFree(libraryRoot, 600 * 1024 ** 2, 'baixar o áudio');
    const info = infoCache.get(check.url) ?? (await fetchVideoInfo(check.url));
    const existing = await library.findByUrl(info.url);
    if (existing) return { id: existing.id, name: existing.name, existing: true };
    const ff = ffmpegDir();
    if (!ff) throw new Error('ffmpeg não encontrado (necessário para extrair o áudio)');
    const id = library.newId();
    const dir = library.songDir(id);
    const win = ownerOf(event);
    const send = (p: { phase: 'download' | 'convert'; percent: number | null; speed?: number | null; eta?: number | null }) => {
      if (win && !win.isDestroyed()) win.webContents.send('import:progress', { url: info.url, ...p });
    };
    await mkdir(dir, { recursive: true });
    const state = { child: null as ChildProcess | null, cancelled: false };
    download = state;
    try {
      send({ phase: 'download', percent: 0 });
      const args = [
        ...YTDLP_BASE_ARGS,
        '--newline',
        '--no-mtime',
        '--restrict-filenames',
        '--no-part',
        '--ffmpeg-location',
        ff,
        '-f',
        'bestaudio/best',
        '--extract-audio',
        '--audio-format',
        format,
        '--audio-quality',
        format === 'mp3' ? '320K' : '0',
        '--max-filesize',
        '500M',
        '--progress-template',
        PROGRESS_TEMPLATE,
        '-o',
        path.join(dir, 'original.%(ext)s'),
        '--',
        info.url,
      ];
      const res = await runYtdlp(args, DOWNLOAD_TIMEOUT_MS, (line) => {
        const p = parseProgressLine(line);
        if (p) send({ phase: 'download', percent: p.percent, speed: p.speed, eta: p.eta });
        else if (line.startsWith('[ExtractAudio]')) send({ phase: 'convert', percent: null });
      }, (child) => (state.child = child));
      if (state.cancelled) throw new Error('download cancelado');
      if (res.code !== 0) throw new Error(explainYtdlpError(res.stderr).reason);
      const file = path.join(dir, `original.${format}`);
      if (!existsSync(file)) throw new Error('o baixador terminou sem gravar o áudio');
      const size = (await stat(file)).size;
      if (size < 1024 || size > MAX_IMPORT_BYTES) throw new Error('áudio baixado com tamanho fora do limite');
      // Sobras (vídeo intermediário, legendas…) não ficam na pasta.
      for (const f of await readdir(dir)) if (f !== `original.${format}`) await rm(path.join(dir, f), { recursive: true, force: true });
      const thumb = thumbCache.get(info.url);
      if (thumb) await writeFile(library.coverPath(id), thumb.bytes);
      const rec = await library.addDownloaded(
        id,
        info.title,
        file,
        { kind: 'url', url: info.url, site: info.site, title: info.title, channel: info.channel, downloadedAt: new Date().toISOString() },
        startMix,
      );
      return { id: rec.id, name: rec.name, existing: false };
    } catch (e) {
      await rm(dir, { recursive: true, force: true });
      throw e;
    } finally {
      download = null;
    }
  });

  ipcMain.handle('import:url-cancel', (event) => {
    guard('import:url-cancel', event);
    if (!download) return { cancelled: false };
    download.cancelled = true;
    killTree(download.child);
    return { cancelled: true };
  });

  /**
   * Ferramenta "Baixar MP3": baixa o melhor fluxo de áudio e codifica uma vez com o LAME,
   * fora da biblioteca e sem separar faixas. A pasta é escolhida pelo usuário (diálogo nativo)
   * e fica lembrada; nenhum caminho vem do renderer.
   */
  ipcMain.handle('grab:folder', async (event) => {
    guard('grab:folder', event);
    return { folder: await grabFolder() };
  });

  ipcMain.handle('grab:pick-folder', async (event) => {
    guard('grab:pick-folder', event);
    const owner = ownerOf(event);
    const res = owner
      ? await dialog.showOpenDialog(owner, { properties: ['openDirectory', 'createDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    const picked = res.filePaths[0];
    if (res.canceled || !picked) return { canceled: true as const };
    const folder = path.resolve(picked);
    await mkdir(folder, { recursive: true });
    await setGrabFolder(folder);
    return { canceled: false as const, folder };
  });

  ipcMain.handle('grab:info', async (event, input) => {
    guard('grab:info', event);
    const check = validateVideoUrl((input as { url?: unknown })?.url);
    if (!check.ok) throw new Error(check.reason);
    const meta = grabMetaCache.get(check.url) ?? (await fetchGrabMeta(check.url));
    const cached = meta.info.thumbnail ? thumbCache.get(meta.info.url) : undefined;
    const thumb = cached ?? (meta.info.thumbnail ? await fetchThumbnail(meta.info.thumbnail) : null);
    if (thumb) thumbCache.set(meta.info.url, thumb);
    return {
      ...meta.info,
      id: meta.id,
      source: meta.source,
      warnings: sourceWarnings(meta.source),
      thumbnailData: thumb ? `data:${thumb.mime};base64,${Buffer.from(thumb.bytes).toString('base64')}` : null,
      maxDuration: maxVideoDuration(),
    };
  });

  ipcMain.handle('grab:fetch', async (event, input) => {
    guard('grab:fetch', event);
    const req = (input ?? {}) as { url?: unknown; quality?: unknown; keepOriginal?: unknown };
    const check = validateVideoUrl(req.url);
    if (!check.ok) throw new Error(check.reason);
    const quality: GrabQuality = isGrabQuality(req.quality) ? req.quality : 'v0';
    const keepOriginal = req.keepOriginal === true;
    const folder = await grabFolder();
    if (!folder) throw new Error('escolha a pasta de destino antes de baixar');
    if (grab) throw new Error('já há um download em andamento');
    const ffmpeg = ffmpegDir();
    if (!ffmpeg) throw new Error('ffmpeg não encontrado (necessário para converter o áudio)');
    const ffmpegExe = path.join(ffmpeg, 'ffmpeg.exe');
    const ffprobe = ffprobeExe();
    const meta = grabMetaCache.get(check.url) ?? (await fetchGrabMeta(check.url));
    await requireFree(folder, 600 * 1024 ** 2, 'baixar o áudio');
    const win = ownerOf(event);
    const send = (p: { phase: 'download' | 'convert' | 'verify'; percent: number | null; speed?: number | null; eta?: number | null }) => {
      if (win && !win.isDestroyed()) win.webContents.send('grab:progress', { url: meta.info.url, ...p });
    };
    const tmp = path.join(folder, `.bfgrab-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`);
    await mkdir(tmp, { recursive: true });
    const state = { child: null as ChildProcess | null, cancelled: false };
    grab = state;
    try {
      send({ phase: 'download', percent: 0 });
      const args = [
        ...YTDLP_BASE_ARGS,
        '--newline',
        '--no-mtime',
        '--ffmpeg-location',
        ffmpeg,
        '-f',
        AUDIO_FORMAT_SELECTOR,
        '--max-filesize',
        '500M',
        '--concurrent-fragments',
        '4',
        '--progress-template',
        PROGRESS_TEMPLATE,
        '-o',
        path.join(tmp, 'source.%(ext)s'),
        '--',
        meta.info.url,
      ];
      const res = await runYtdlp(
        args,
        DOWNLOAD_TIMEOUT_MS,
        (line) => {
          const p = parseProgressLine(line);
          if (p) send({ phase: 'download', percent: p.percent, speed: p.speed, eta: p.eta });
        },
        (child) => (state.child = child),
      );
      if (state.cancelled) throw new Error('download cancelado');
      if (res.code !== 0) throw new Error(explainYtdlpError(res.stderr).reason);
      const names = await readdir(tmp);
      const srcName = names.find(
        (n) => !n.endsWith('.part') && !n.endsWith('.ytdl') && /\.(webm|m4a|opus|mp3|ogg|aac|wav|flac)$/i.test(n),
      );
      if (!srcName) throw new Error('o baixador terminou sem gravar o áudio');
      const srcPath = path.join(tmp, srcName);
      const srcSize = (await stat(srcPath)).size;
      if (srcSize < 1024 || srcSize > MAX_IMPORT_BYTES) throw new Error('áudio baixado com tamanho fora do limite');

      const sourceProbe = ffprobe ? await probeFile(ffprobe, srcPath) : null;
      const sampleRate = mp3SampleRate(sourceProbe?.sampleRate ?? meta.source?.sampleRate ?? null);
      const channels = mp3Channels(sourceProbe?.channels ?? meta.source?.channels ?? null);

      let coverPath: string | null = null;
      if (meta.info.thumbnail) {
        const thumb = thumbCache.get(meta.info.url) ?? (await fetchThumbnail(meta.info.thumbnail));
        if (thumb) {
          thumbCache.set(meta.info.url, thumb);
          const ext = thumb.mime === 'image/png' ? '.png' : thumb.mime === 'image/webp' ? '.webp' : '.jpg';
          coverPath = path.join(tmp, `cover${ext}`);
          await writeFile(coverPath, thumb.bytes);
        }
      }

      send({ phase: 'convert', percent: null });
      const outTmp = path.join(tmp, 'out.mp3');
      const fres = await runTool(
        ffmpegExe,
        buildFfmpegArgs({
          input: srcPath,
          output: outTmp,
          cover: coverPath,
          quality,
          sampleRate,
          channels,
          tags: { title: meta.info.title, artist: meta.info.channel || meta.info.site, date: meta.uploadDate, comment: meta.info.url },
        }),
        15 * 60 * 1000,
        (child) => (state.child = child),
      );
      if (state.cancelled) throw new Error('download cancelado');
      if (fres.code !== 0) {
        const tail = fres.stderr.split(/\r?\n/).filter((l) => l.trim().length > 0).pop() ?? '';
        throw new Error(`ffmpeg falhou${tail ? `: ${tail.slice(0, 200)}` : ''}`);
      }

      send({ phase: 'verify', percent: null });
      const outProbe = ffprobe ? await probeFile(ffprobe, outTmp) : null;
      const { decoded, peakDb } = await decodePeak(ffmpegExe, outTmp);
      if (state.cancelled) throw new Error('download cancelado');
      const checks: GrabCheck[] = outProbe
        ? verifyGrab({ source: sourceProbe, output: outProbe, decoded, expectedSampleRate: sampleRate, expectedChannels: channels })
        : [
            {
              id: 'verificacao',
              level: 'warn',
              detail: ffprobe ? 'ffprobe não conseguiu ler os metadados; verificação limitada à decodificação' : 'ffprobe não encontrado; verificação limitada à decodificação',
            },
            { id: 'decode', level: decoded ? 'ok' : 'fail', detail: decoded ? 'decodifica por inteiro' : 'há trechos corrompidos' },
          ];
      if (peakDb !== null) {
        checks.push({ id: 'pico', level: peakDb > -0.1 ? 'warn' : 'ok', detail: peakDb === -Infinity ? 'silêncio digital' : `pico ${peakDb.toFixed(1)} dBFS` });
      }
      const failed = checks.find((c) => c.level === 'fail');
      if (failed) throw new Error(`verificação falhou: ${failed.detail}`);

      const stem = grabFileName(meta).replace(/\.mp3$/i, '');
      const srcExt = path.extname(srcName).toLowerCase();
      const base = uniqueBaseName(
        stem,
        (candidate) =>
          existsSync(path.join(folder, `${candidate}.mp3`)) || (keepOriginal && existsSync(path.join(folder, `${candidate}${srcExt}`))),
      );
      const finalPath = path.join(folder, `${base}.mp3`);
      await rename(outTmp, finalPath);
      if (state.cancelled) {
        await rm(finalPath, { force: true });
        throw new Error('download cancelado');
      }
      let originalPath: string | null = null;
      if (keepOriginal) {
        try {
          originalPath = path.join(folder, `${base}${srcExt}`);
          await copyFile(srcPath, originalPath);
        } catch (e) {
          originalPath = null;
          logLine('cópia do original falhou', e);
        }
      }
      if (state.cancelled) {
        await rm(finalPath, { force: true });
        if (originalPath) await rm(originalPath, { force: true });
        throw new Error('download cancelado');
      }
      return {
        path: finalPath,
        name: path.basename(finalPath),
        bytes: (await stat(finalPath)).size,
        original: originalPath,
        report: { source: sourceProbe, output: outProbe, checks, decoded, peakDb },
        warnings: sourceWarnings(meta.source),
      };
    } catch (e) {
      logLine('baixar-mp3 falhou', e);
      throw e;
    } finally {
      grab = null;
      await rm(tmp, { recursive: true, force: true });
    }
  });

  ipcMain.handle('grab:cancel', (event) => {
    guard('grab:cancel', event);
    if (!grab) return { cancelled: false };
    grab.cancelled = true;
    killTree(grab.child);
    return { cancelled: true };
  });

  ipcMain.handle('grab:reveal', async (event, input) => {
    guard('grab:reveal', event);
    const folder = await grabFolder();
    const raw = (input as { path?: unknown })?.path;
    if (!folder || typeof raw !== 'string') throw new Error('caminho inválido');
    const resolvedFolder = path.resolve(folder);
    const target = path.resolve(raw);
    const relative = path.relative(resolvedFolder, target);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || !existsSync(target) || !(await stat(target)).isFile()) {
      throw new Error('caminho inválido');
    }
    shell.showItemInFolder(target);
    return { ok: true };
  });

  ipcMain.handle('ytdlp:version', async (event) => {
    guard('ytdlp:version', event);
    const exe = ytdlpExe();
    if (!exe) return { available: false as const };
    const res = await runYtdlp(['--version'], 20_000);
    return { available: true as const, version: res.code === 0 ? res.stdout.trim().split(/\r?\n/)[0]!.slice(0, 40) : 'desconhecida' };
  });

  /** Atualiza o baixador (yt-dlp -U) numa cópia em userData, depois de confirmar com o usuário. */
  ipcMain.handle('ytdlp:update', async (event) => {
    guard('ytdlp:update', event);
    if (process.env.BF_YTDLP) throw new Error('baixador de teste não é atualizado');
    const owner = ownerOf(event);
    const opts = {
      type: 'question' as const,
      buttons: ['Atualizar', 'Cancelar'],
      defaultId: 0,
      cancelId: 1,
      title: 'Atualizar baixador',
      message: 'Baixar a versão mais recente do yt-dlp?',
      detail: 'O yt-dlp é baixado do site oficial (github.com/yt-dlp). Use quando os downloads começarem a falhar.',
    };
    const answer = owner ? await dialog.showMessageBox(owner, opts) : await dialog.showMessageBox(opts);
    if (answer.response !== 0) return { updated: false };
    const local = userYtdlp();
    if (!existsSync(local)) {
      const src = ytdlpExe();
      if (!src) throw new Error('baixador não encontrado');
      await mkdir(path.dirname(local), { recursive: true });
      await copyFile(src, local);
    }
    const res = await runYtdlp(['--update'], 3 * 60_000);
    if (res.code !== 0) throw new Error(explainYtdlpError(res.stderr + res.stdout).reason);
    const v = await runYtdlp(['--version'], 20_000);
    return { updated: true, version: v.stdout.trim().split(/\r?\n/)[0]!.slice(0, 40) };
  });

  ipcMain.handle('library:set-start-mix', async (event, input: unknown) => {
    guard('library:set-start-mix', event);
    const req = (input ?? {}) as { id?: unknown; startMix?: unknown };
    await library.setStartMix(String(req.id ?? ''), sanitizeStartMix(req.startMix));
    return { ok: true };
  });

  ipcMain.handle('library:collections', async (event) => {
    guard('library:collections', event);
    return library.collections();
  });

  ipcMain.handle('library:collection-op', async (event, input: unknown) => {
    guard('library:collection-op', event);
    const req = (input ?? {}) as { op?: unknown; name?: unknown; to?: unknown; ids?: unknown };
    const ops = ['create', 'rename', 'delete', 'add', 'remove'] as const;
    const op = ops.find((o) => o === req.op);
    if (!op) throw new Error('operação de coleção inválida');
    return library.collectionOp(op, req.name, { to: req.to, ids: req.ids });
  });

  ipcMain.handle('library:set-sections', async (event, input: unknown) => {
    guard('library:set-sections', event);
    const req = (input ?? {}) as { id?: unknown; sections?: unknown };
    await library.setSections(String(req.id ?? ''), sanitizeSections(req.sections));
    return { ok: true };
  });

  /**
   * Mapa em PDF: o HTML é montado aqui (com escape) a partir dos dados validados e impresso numa
   * janela oculta sem preload, sem JavaScript e sem rede.
   */
  ipcMain.handle('export:map-pdf', async (event, input: unknown) => {
    guard('export:map-pdf', event);
    const req = (input ?? {}) as { path?: unknown; map?: unknown };
    const check = grantedWrites.check(req.path);
    if (!check.ok) throw new Error(check.reason);
    if (!check.value.toLowerCase().endsWith('.pdf')) throw new Error('o mapa em PDF precisa terminar em .pdf');
    const html = songMapHtml(sanitizeMap(req.map));
    // Sessão própria (em memória): o bloqueio de rede não interfere na janela do app.
    const printSession = session.fromPartition('bf-print');
    printSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*', 'file://*/*'] }, (_d, cb) => cb({ cancel: true }));
    const win = new BrowserWindow({ show: false, webPreferences: { session: printSession, javascript: false, sandbox: true, contextIsolation: true, nodeIntegration: false } });
    try {
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      const pdf = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { marginType: 'none' } });
      await writeFile(check.value, pdf);
      return { bytes: pdf.byteLength };
    } finally {
      win.destroy();
    }
  });

  ipcMain.handle('library:read-cover', async (event, input: unknown) => {
    guard('library:read-cover', event);
    const p = library.coverPath(String((input as { id?: unknown })?.id ?? ''));
    if (!existsSync(p)) return null;
    const bytes = new Uint8Array(await readFile(p));
    const mime = imageMime(bytes);
    if (!mime || bytes.byteLength > MAX_THUMB_BYTES) return null;
    return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
  });

  /** Abre a página de origem no navegador do sistema, só http(s) e depois de confirmar. */
  ipcMain.handle('library:open-origin', async (event, input: unknown) => {
    guard('library:open-origin', event);
    const rec = await library.get(String((input as { id?: unknown })?.id ?? ''));
    if (!rec || rec.origin.kind !== 'url') throw new Error('esta música não veio de um link');
    const check = validateVideoUrl(rec.origin.url);
    if (!check.ok) throw new Error(check.reason);
    const owner = ownerOf(event);
    const opts = {
      type: 'question' as const,
      buttons: ['Abrir no navegador', 'Cancelar'],
      defaultId: 0,
      cancelId: 1,
      title: 'Abrir origem',
      message: `Abrir ${rec.origin.site} no navegador?`,
      detail: check.url,
    };
    const answer = owner ? await dialog.showMessageBox(owner, opts) : await dialog.showMessageBox(opts);
    if (answer.response !== 0) return { opened: false };
    await shell.openExternal(check.url);
    return { opened: true };
  });

  ipcMain.handle('file:write', async (event, input: unknown) => {
    guard('file:write', event);
    const req = (input ?? {}) as { path?: unknown; bytes?: unknown };
    const check = grantedWrites.check(req.path);
    if (!check.ok) throw new Error(check.reason);
    if (!(req.bytes instanceof Uint8Array)) throw new Error('conteúdo inválido');
    if (req.bytes.byteLength > MAX_EXPORT_BYTES) throw new Error('arquivo acima do limite de exportação');
    await writeFile(check.value, req.bytes);
    return { bytes: req.bytes.byteLength };
  });
}

/**
 * Separação de fontes: Demucs (MIT, fork mantido de adefossez/demucs) com o modelo htdemucs_6s.
 * Roda como processo filho sem shell; o Python vem de BF_STEMS_PYTHON ou do venv de desenvolvimento.
 */
const STEM_MODEL = 'htdemucs_6s';
const STEM_TIMEOUT_MS = 30 * 60 * 1000;
let separating = false;
let compacting = false;

/** Pastas com faixas de uma música: Demucs, faixas escolhidas (restante, voz dividida) e transpostas. */
function stemFolders(id: string, sourcePath: string): string[] {
  return [demucsDirOf(id, sourcePath), path.join(library.songDir(id), 'faixas')];
}

async function wavBytesOf(id: string, sourcePath: string): Promise<number> {
  let n = 0;
  for (const d of [...stemFolders(id, sourcePath), path.join(library.songDir(id), 'tom')]) {
    if (!existsSync(d)) continue;
    for (const f of await readdir(d)) if (f.toLowerCase().endsWith('.wav')) n += (await stat(path.join(d, f))).size;
  }
  return n;
}

/**
 * Troca os WAV das faixas por FLAC (bf_tools.py compress verifica cada arquivo antes de apagar o
 * WAV) e devolve o mapa de faixas com os caminhos novos. As transpostas antigas (WAV) são apagadas:
 * são cache e voltam em FLAC quando pedidas.
 */
async function compressSongStems(id: string, sourcePath: string, map: Record<string, string>): Promise<{ map: Record<string, string>; freed: number }> {
  const out = await runPython([bfToolsPath(), 'compress', ...stemFolders(id, sourcePath)], () => undefined, COMPRESS_TIMEOUT_MS);
  const parsed = JSON.parse(out.trim().split(/\r?\n/).pop() ?? '{}') as { files?: Record<string, string>; freed?: number };
  const moved = new Map(Object.entries(parsed.files ?? {}).map(([a, b]) => [path.resolve(a).toLowerCase(), path.resolve(b)]));
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) next[k] = moved.get(path.resolve(v).toLowerCase()) ?? v;
  let freed = parsed.freed ?? 0;
  const tom = path.join(library.songDir(id), 'tom');
  if (existsSync(tom)) {
    for (const f of await readdir(tom)) {
      if (!f.toLowerCase().endsWith('.wav')) continue;
      const p = path.join(tom, f);
      freed += (await stat(p)).size;
      await rm(p, { force: true });
    }
  }
  return { map: next, freed };
}
const COMPRESS_TIMEOUT_MS = 20 * 60 * 1000;
/** Separação em andamento: o processo atual (Demucs ou divisão da voz) e se foi cancelada. */
let sepJob: { id: string; cancelled: boolean; child: ChildProcess | null } | null = null;

/**
 * Procura o Python do separador: BF_STEMS_PYTHON; depois o venv do projeto, tanto em
 * desenvolvimento (pasta do app) quanto no executável empacotado (release/win-unpacked,
 * três níveis acima de resources/).
 */
/**
 * Python do separador, em ordem de preferência:
 * 1. BF_STEMS_PYTHON; 2. venv do projeto (torch CUDA, desenvolvimento ou esta máquina);
 * 3. runtime embutido no instalador (torch CPU, funciona em qualquer PC).
 */
function stemsPython(): { exe: string; bundled: boolean } {
  const fromEnv = process.env.BF_STEMS_PYTHON;
  if (fromEnv) return { exe: fromEnv, bundled: false };
  const rel = path.join('tooling', 'stems', '.venv', 'Scripts', 'python.exe');
  const dev = [path.join(app.getAppPath(), rel), path.resolve(process.resourcesPath, '..', '..', '..', rel)].find((c) => existsSync(c));
  if (dev) return { exe: dev, bundled: false };
  return { exe: path.join(process.resourcesPath, 'python', 'python.exe'), bundled: true };
}

const ANALYZE_TIMEOUT_MS = 15 * 60 * 1000;
const SEPARATE_EXTRA_TIMEOUT_MS = 60 * 60 * 1000;

function demucsDirOf(id: string, sourcePath: string): string {
  return path.join(library.songDir(id), 'demucs', STEM_MODEL, path.parse(sourcePath).name);
}

/** Modelos do audio-separator (karaokê): tooling/stems/models-sep (desenvolvimento) ou resources/models/separator. */
function separatorModelsDir(): string {
  const rel = path.join('tooling', 'stems', 'models-sep');
  const dev = [path.join(app.getAppPath(), rel), path.resolve(process.resourcesPath, '..', '..', '..', rel)].find((c) => existsSync(path.join(c, VOICE_MODEL.file)));
  return dev ?? userVoiceDir();
}

/** Onde o modelo baixado fica: na pasta de dados do usuário (sobrevive a reinstalar o app). */
function userVoiceDir(): string {
  return path.join(app.getPath('userData'), 'models', 'voice');
}

/** Configuração do modelo (2 KB), que vai no instalador; copiada para junto do modelo baixado. */
function bundledVoiceConfig(): string | null {
  const c = [path.join(process.resourcesPath, 'models', 'voice', VOICE_MODEL.config), path.join(app.getAppPath(), 'tooling', 'stems', 'models-sep', VOICE_MODEL.config)];
  return c.find((p) => existsSync(p)) ?? null;
}

function voiceModelReady(): boolean {
  const d = separatorModelsDir();
  return existsSync(path.join(d, VOICE_MODEL.file)) && existsSync(path.join(d, VOICE_MODEL.config));
}

let voiceDownload: AbortController | null = null;

/** ffmpeg embutido (exigido pelo audio-separator para gravar áudio). */
function ffmpegDir(): string | null {
  const rel = path.join('tooling', 'stems', 'ffmpeg');
  const candidates = [path.join(process.resourcesPath, 'ffmpeg'), path.join(app.getAppPath(), rel), path.resolve(process.resourcesPath, '..', '..', '..', rel)];
  return candidates.find((c) => existsSync(path.join(c, 'ffmpeg.exe'))) ?? null;
}

/** ffprobe vem junto do build "essentials" do ffmpeg; sem ele, a verificação fica só no decode. */
function ffprobeExe(): string | null {
  const dir = ffmpegDir();
  if (!dir) return null;
  const exe = path.join(dir, 'ffprobe.exe');
  return existsSync(exe) ? exe : null;
}

function grabSettingsPath(): string {
  return path.join(app.getPath('userData'), 'grab.json');
}

let savedGrabFolder: string | null | undefined;

/**
 * Pasta de destino do "Baixar MP3". Só é aceita se foi escolhida no diálogo nativo e continua
 * existindo; fica gravada porque baixar é uma ação repetida. O renderer nunca inventa caminho.
 */
async function grabFolder(): Promise<string | null> {
  if (savedGrabFolder !== undefined) return savedGrabFolder;
  try {
    const raw = JSON.parse(await readFile(grabSettingsPath(), 'utf8')) as { folder?: unknown };
    const folder = typeof raw.folder === 'string' ? path.resolve(raw.folder) : '';
    savedGrabFolder = folder && existsSync(folder) && (await stat(folder)).isDirectory() ? folder : null;
  } catch {
    savedGrabFolder = null;
  }
  return savedGrabFolder;
}

async function setGrabFolder(folder: string): Promise<void> {
  savedGrabFolder = folder;
  await writeFile(grabSettingsPath(), JSON.stringify({ folder }), 'utf8');
}
const MIDI_TIMEOUT_MS = 20 * 60 * 1000;
const PITCH_TIMEOUT_MS = 10 * 60 * 1000;
/** Faixas com altura definida (a bateria não vira MIDI de notas). */
const MIDI_STEMS = ['bass', 'guitar', 'piano', 'vocals', 'other', 'lead', 'backing'];
const KEY_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

function keyName(tonic: number, mode: string): string {
  return `${KEY_NAMES[((tonic % 12) + 12) % 12]} ${mode === 'minor' ? 'menor' : 'maior'}`;
}

/** Script de análise e MIDI: tooling/stems/bf_tools.py (desenvolvimento) ou resources/tools (instalador). */
function bfToolsPath(): string {
  const rel = path.join('tooling', 'stems', 'bf_tools.py');
  const candidates = [path.join(process.resourcesPath, 'tools', 'bf_tools.py'), path.join(app.getAppPath(), rel), path.resolve(process.resourcesPath, '..', '..', '..', rel)];
  return candidates.find((c) => existsSync(c)) ?? candidates[1]!;
}

function pythonEnv(bundled: boolean): NodeJS.ProcessEnv {
  const ff = ffmpegDir();
  const base = { ...process.env, PYTHONIOENCODING: 'utf-8', TF_CPP_MIN_LOG_LEVEL: '3', ...(ff ? { PATH: `${ff}${path.delimiter}${process.env.PATH ?? ''}` } : {}) };
  return bundled
    ? { ...base, HF_HOME: path.join(process.resourcesPath, 'models', 'huggingface'), HF_HUB_OFFLINE: '1', PYTHONNOUSERSITE: '1' }
    : base;
}

/** Roda um script no Python do separador; lê "PROGRESS n" do stderr. */
function runPython(args: string[], onProgress: (percent: number) => void, timeoutMs: number, onSpawn?: (child: ChildProcess) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const { exe, bundled } = stemsPython();
    if (!existsSync(exe)) {
      reject(new Error('ambiente Python não instalado (faltam tooling/stems/.venv ou BF_STEMS_PYTHON)'));
      return;
    }
    const child = track(spawn(exe, ['-I', ...args], { env: pythonEnv(bundled), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }));
    onSpawn?.(child);
    let tail = '';
    let stdout = '';
    child.stdout.on('data', (d: Buffer) => {
      stdout = (stdout + d.toString()).slice(-200000);
    });
    child.stderr.on('data', (d: Buffer) => {
      const chunk = d.toString();
      tail = (tail + chunk).slice(-4000);
      const m = [...chunk.matchAll(/PROGRESS (\d{1,3})/g)].pop();
      if (m) onProgress(Math.min(99, Number(m[1])));
    });
    const timer = setTimeout(() => {
      killTree(child);
      reject(new Error('tempo limite excedido'));
    }, timeoutMs);
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else {
        const last = tail.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('PROGRESS')).pop() ?? '';
        logLine('python falhou', args[1] ?? '', `código ${code}`, tail.slice(-1500));
        reject(new Error(`processo terminou com código ${code}${last ? `: ${last.slice(0, 300)}` : ''}`));
      }
    });
  });
}

/* --------------------------------- yt-dlp (Unlicense) --------------------------------- */

const DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000;
const INFO_TIMEOUT_MS = 90 * 1000;
const MAX_THUMB_BYTES = 1024 * 1024;
/**
 * Sempre: sem arquivos de configuração (que poderiam injetar --exec), sem plugins, sem cookies
 * (nem do navegador), sem playlist, sem cores e sem checar atualização sozinho.
 */
const YTDLP_BASE_ARGS = ['--ignore-config', '--no-plugin-dirs', '--no-cookies', '--no-cookies-from-browser', '--no-playlist', '--no-colors', '--no-update', '--no-warnings'];
let download: { child: ChildProcess | null; cancelled: boolean } | null = null;
const infoCache = new Map<string, VideoInfo>();
const thumbCache = new Map<string, { bytes: Uint8Array; mime: string }>();
const grabMetaCache = new Map<string, GrabMeta>();
let grab: { child: ChildProcess | null; cancelled: boolean } | null = null;

function maxVideoDuration(): number {
  const min = Number(process.env.BF_MAX_VIDEO_MIN);
  return Number.isFinite(min) && min > 0 ? min * 60 : DEFAULT_MAX_DURATION_SEC;
}

/** Cópia atualizável em userData (yt-dlp -U troca o próprio executável). */
function userYtdlp(): string {
  return path.join(app.getPath('userData'), 'tools', 'yt-dlp.exe');
}

/**
 * Executável do yt-dlp: BF_YTDLP (teste; um .mjs roda pelo próprio Electron como Node), a cópia
 * atualizada em userData, resources/ytdlp (instalador) ou tooling/ytdlp (desenvolvimento).
 */
function ytdlpExe(): string | null {
  if (process.env.BF_YTDLP) return process.env.BF_YTDLP;
  const rel = path.join('tooling', 'ytdlp', 'yt-dlp.exe');
  const candidates = [userYtdlp(), path.join(process.resourcesPath, 'ytdlp', 'yt-dlp.exe'), path.join(app.getAppPath(), rel), path.resolve(process.resourcesPath, '..', '..', '..', rel)];
  return candidates.find((c) => existsSync(c)) ?? null;
}

function runYtdlp(
  args: string[],
  timeoutMs: number,
  onLine?: (line: string) => void,
  onSpawn?: (child: ChildProcess) => void,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const exe = ytdlpExe();
    if (!exe) {
      reject(new Error('baixador (yt-dlp) não encontrado'));
      return;
    }
    const script = /\.m?js$/i.test(exe);
    const child = spawn(script ? process.execPath : exe, script ? [exe, ...args] : args, {
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', ...(script ? { ELECTRON_RUN_AS_NODE: '1' } : {}) },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    track(child);
    onSpawn?.(child);
    let stdout = '';
    let stderr = '';
    let pending = '';
    child.stdout.on('data', (d: Buffer) => {
      const text = d.toString();
      stdout = (stdout + text).slice(-20_000_000);
      if (!onLine) return;
      pending += text;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? '';
      for (const l of lines) onLine(l);
    });
    child.stderr.on('data', (d: Buffer) => {
      stderr = (stderr + d.toString()).slice(-8000);
    });
    const timer = setTimeout(() => {
      killTree(child);
      reject(new Error('o baixador não respondeu a tempo'));
    }, timeoutMs);
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

async function fetchVideoInfo(url: string): Promise<VideoInfo> {
  const res = await runYtdlp([...YTDLP_BASE_ARGS, '--dump-single-json', '--', url], INFO_TIMEOUT_MS);
  if (res.code !== 0) throw new Error(explainYtdlpError(res.stderr).reason);
  const parsed = parseVideoInfo(res.stdout, maxVideoDuration());
  if (!parsed.ok) throw new Error(parsed.reason);
  infoCache.set(url, parsed.info);
  infoCache.set(parsed.info.url, parsed.info);
  return parsed.info;
}

/** Metadados da ferramenta "Baixar MP3": mesmos do vídeo, mais id, data e formato da fonte. */
async function fetchGrabMeta(url: string): Promise<GrabMeta> {
  const res = await runYtdlp([...YTDLP_BASE_ARGS, '--dump-single-json', '--', url], INFO_TIMEOUT_MS);
  if (res.code !== 0) throw new Error(explainYtdlpError(res.stderr).reason);
  const parsed = parseGrabMeta(res.stdout, maxVideoDuration());
  if (!parsed.ok) throw new Error(parsed.reason);
  grabMetaCache.set(url, parsed.meta);
  grabMetaCache.set(parsed.meta.info.url, parsed.meta);
  infoCache.set(url, parsed.meta.info);
  infoCache.set(parsed.meta.info.url, parsed.meta.info);
  return parsed.meta;
}

async function probeFile(exe: string, file: string): Promise<ProbeInfo | null> {
  const res = await runTool(exe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], 60_000);
  return res.code === 0 ? parseProbe(res.stdout) : null;
}

/** Decodifica o MP3 inteiro (prova que não há quadro corrompido) e mede o pico de amostra. */
async function decodePeak(exe: string, file: string): Promise<{ decoded: boolean; peakDb: number | null }> {
  const res = await runTool(
    exe,
    ['-hide_banner', '-nostdin', '-i', file, '-af', 'astats=metadata=1:reset=0', '-f', 'null', '-'],
    10 * 60 * 1000,
  );
  const m = /Peak level dB:\s*(-?[\d.]+|-inf)/.exec(res.stderr);
  const peak = m ? (m[1] === '-inf' ? -Infinity : Number(m[1])) : null;
  return { decoded: res.code === 0, peakDb: peak !== null && (Number.isFinite(peak) || peak === -Infinity) ? peak : null };
}

function imageMime(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

/** Miniatura baixada pelo processo principal (o renderer não abre conexões): só imagem, até 1 MB. */
async function fetchThumbnail(url: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
  if (process.env.BF_YTDLP) return null; // testes: sem rede
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15_000) });
    if (!res.ok || !validateVideoUrl(res.url).ok) return null;
    const len = Number(res.headers.get('content-length') ?? 0);
    if (len > MAX_THUMB_BYTES) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const mime = imageMime(bytes);
    return mime && bytes.byteLength <= MAX_THUMB_BYTES ? { bytes, mime } : null;
  } catch {
    return null;
  }
}

/** Rubber Band (GPL v2, Particular Programs): executável oficial. Motor R2: ~6× mais rápido que o R3. */
function rubberbandExe(): string {
  const fromEnv = process.env.BF_RUBBERBAND;
  if (fromEnv) return fromEnv;
  const rel = path.join('tooling', 'rubberband', 'rubberband-4.0.0-gpl-executable-windows', 'rubberband.exe');
  const candidates = [
    path.join(process.resourcesPath, 'rubberband', 'rubberband.exe'),
    path.join(app.getAppPath(), rel),
    path.resolve(process.resourcesPath, '..', '..', '..', rel),
  ];
  return candidates.find((c) => existsSync(c)) ?? candidates[1]!;
}

/** Muda a altura em meios tons sem mudar o andamento. Voz: preserva formantes (timbre natural). */
function runRubberbandPitch(input: string, output: string, semitones: number, formant: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const exe = rubberbandExe();
    if (!existsSync(exe)) {
      reject(new Error('Rubber Band não instalado (faltam tooling/rubberband ou BF_RUBBERBAND)'));
      return;
    }
    const args = ['--pitch', String(semitones), ...(formant ? ['--formant'] : []), '--quiet', input, output];
    const child = track(spawn(exe, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] }));
    let tail = '';
    child.stderr.on('data', (d: Buffer) => {
      tail = (tail + d.toString()).slice(-2000);
    });
    const timer = setTimeout(() => {
      killTree(child);
      reject(new Error('tempo limite da transposição excedido'));
    }, PITCH_TIMEOUT_MS);
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && existsSync(output)) resolve();
      else reject(new Error(`Rubber Band terminou com código ${code}: ${tail.trim().slice(-300)}`));
    });
  });
}

/**
 * Qualidade da separação:
 * - fast: uma passada, sobreposição 0,25 (padrão do Demucs);
 * - best: --shifts 2 (média de duas passadas deslocadas) e --overlap 0,5. Cerca de 2× mais lenta.
 * Sem escolha explícita: best com o ambiente de GPU, fast no runtime de CPU do instalador.
 */
function runDemucs(
  input: string,
  outRoot: string,
  onProgress: (percent: number) => void,
  quality?: 'fast' | 'best',
  onSpawn?: (child: ChildProcess) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const { exe: py, bundled } = stemsPython();
    if (!existsSync(py)) {
      reject(new Error('separador não instalado (faltam tooling/stems/.venv ou BF_STEMS_PYTHON)'));
      return;
    }
    // No runtime embutido, os pesos do htdemucs_6s vêm junto do instalador: nada é baixado.
    const env = pythonEnv(bundled);
    const q = quality ?? (bundled ? 'fast' : 'best');
    const extra = q === 'best' ? ['--shifts', '2', '--overlap', '0.5'] : [];
    const child = spawn(py, ['-m', 'demucs', '-n', STEM_MODEL, ...extra, '-o', outRoot, input], {
      env,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    track(child);
    onSpawn?.(child);
    let tail = '';
    // Com --shifts, o tqdm mostra uma barra por passada (0→100 de novo): vira um progresso único.
    const passes = q === 'best' ? 2 : 1;
    let pass = 0;
    let lastPct = 0;
    child.stderr.on('data', (d: Buffer) => {
      const chunk = d.toString();
      tail = (tail + chunk).slice(-4000);
      // tqdm escreve "NN%|" a cada atualização; pegamos a última porcentagem do bloco.
      const matches = [...chunk.matchAll(/(\d{1,3})%\|/g)];
      const last = matches[matches.length - 1];
      if (!last) return;
      const pct = Math.min(100, Number(last[1]));
      if (pct + 30 < lastPct && pass < passes - 1) pass++;
      lastPct = pct;
      onProgress(Math.min(99, Math.round((pass * 100 + pct) / passes)));
    });
    const timer = setTimeout(() => {
      killTree(child);
      reject(new Error('tempo limite da separação excedido'));
    }, STEM_TIMEOUT_MS);
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else {
        const last = tail.split(/\r?\n/).filter((l) => l.trim().length > 0).pop() ?? '';
        logLine('demucs falhou', `código ${code}`, tail.slice(-1500));
        reject(new Error(`demucs terminou com código ${code}${last ? `: ${last.slice(0, 300)}` : ''}`));
      }
    });
  });
}

function configureSession(): void {
  const ses = session.defaultSession;
  ses.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [CONTENT_SECURITY_POLICY] },
    });
  });
  // Microfone/entrada de áudio: só para o próprio app e só áudio. Nada de câmera.
  ses.setPermissionRequestHandler((_wc, permission, callback, details) => {
    const url = (details as { requestingUrl?: string }).requestingUrl ?? '';
    const types = (details as { mediaTypes?: string[] }).mediaTypes ?? [];
    const ok = permission === 'media' && url.startsWith(APP_ORIGIN) && types.every((t) => t === 'audio');
    callback(ok);
  });
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) => {
    return permission === 'media' && requestingOrigin.startsWith(APP_ORIGIN);
  });
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#0d0f12',
    show: false,
    webPreferences: {
      ...SECURE_WEB_PREFERENCES,
      preload: path.join(app.getAppPath(), 'dist', 'preload', 'preload.cjs'),
    },
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url, APP_ORIGIN)) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('render-process-gone', (_e, d) => {
    logLine('tela caiu', d.reason, d.exitCode);
    // Recarrega em vez de deixar a janela em branco (a biblioteca e os arquivos estão no disco).
    if (d.reason !== 'clean-exit' && !win.isDestroyed()) win.webContents.reload();
  });

  const smoke = process.env.BF_SMOKE_SCREENSHOT;
  win.once('ready-to-show', () => win.show());
  if (smoke) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const image = await win.webContents.capturePage();
        await writeFile(smoke, image.toPNG());
        app.quit();
      }, 1200);
    });
  }
  // Variáveis só de teste: tela inicial e áudio sem dispositivo de saída (relógio determinístico).
  const query: Record<string, string> = {};
  if (process.env.BF_SMOKE_SCREEN) query.screen = process.env.BF_SMOKE_SCREEN;
  if (process.env.BF_AUDIO_SINK === 'none') query.audio = 'none';
  void win.loadFile(path.join(app.getAppPath(), 'dist', 'renderer', 'index.html'), Object.keys(query).length ? { query } : undefined);
}

// Testes automatizados usam uma pasta de dados própria: nunca tocam a biblioteca do usuário.
if (process.env.BF_USER_DATA) app.setPath('userData', path.resolve(process.env.BF_USER_DATA));
// A pasta de dados mantém o nome antigo (Baixaria Fina): renomear o produto não pode esconder a biblioteca existente.
else app.setPath('userData', path.join(app.getPath('appData'), 'baixaria-fina'));

// Duas janelas do app gravando o mesmo índice da biblioteca corromperiam os dados: uma instância só.
const primary = app.requestSingleInstanceLock();
if (!primary) app.quit();
app.on('second-instance', () => {
  const w = BrowserWindow.getAllWindows()[0];
  if (w) {
    if (w.isMinimized()) w.restore();
    w.focus();
  }
});
process.on('uncaughtException', (e) => logLine('erro não tratado', e));
process.on('unhandledRejection', (e) => logLine('promessa rejeitada', e instanceof Error ? e : String(e)));
// Fechar o app encerra separação, análise e downloads em andamento (e os processos que eles abriram).
app.on('will-quit', () => {
  voiceDownload?.abort();
  const n = killAll();
  if (n) logLine(`encerrados ${n} processos auxiliares ao sair`);
});

app.whenReady().then(() => {
  if (!primary) return;
  initLog(path.join(app.getPath('userData'), 'logs'));
  logLine(`início ${app.getVersion()} ${process.platform} ${process.arch}`);
  libraryRoot = path.join(app.getPath('userData'), 'library');
  library = new Library(libraryRoot);
  configureSession();
  registerIpc();
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});
