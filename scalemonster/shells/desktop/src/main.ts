import { app, BrowserWindow, dialog, ipcMain, protocol, session, type IpcMainInvokeEvent } from 'electron';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  APP_ORIGIN,
  APP_SCHEME,
  BACKUP_DIR,
  CONTENT_SECURITY_POLICY,
  DB_FILE,
  LEGACY_DB,
  LEGACY_DECISION_FILE,
  LEGACY_DIR,
  MAX_DB_BYTES,
  MAX_SAVE_BYTES,
  SAVE_KINDS,
  SECURE_WEB_PREFERENCES,
  USER_DATA_DIR,
  backupName,
  backupsToPrune,
  isAppUrl,
  isSaveKind,
  isSqliteFile,
  mimeOf,
  resolveAppAsset,
  saveFileName,
} from './policy.js';

/**
 * Shell desktop do ScaleMonster (.): só embrulha o build web (./dist) e oferece ao renderer o que o
 * navegador não tem: o banco num arquivo de verdade, o diálogo de salvar e a importação do banco do
 * mixerCraft antigo. Nada de Python, FFmpeg ou sidecars.
 *
 * Variáveis só de teste: ACADEMY_USER_DATA (pasta de dados isolada), ACADEMY_LEGACY_DB (banco antigo
 * de mentira), ACADEMY_SMOKE_SCREENSHOT=<png> e ACADEMY_SMOKE_SCREEN=<tela>.
 */

protocol.registerSchemesAsPrivileged([{ scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

if (process.env.ACADEMY_USER_DATA) app.setPath('userData', path.resolve(process.env.ACADEMY_USER_DATA));
else app.setPath('userData', path.join(app.getPath('appData'), USER_DATA_DIR));

const rendererRoot = () => path.join(app.getAppPath(), 'dist', 'renderer');
const dataFile = (name: string) => path.join(app.getPath('userData'), name);
const legacyDbPath = () => (process.env.ACADEMY_LEGACY_DB ? path.resolve(process.env.ACADEMY_LEGACY_DB) : path.join(app.getPath('appData'), LEGACY_DIR, LEGACY_DB));

/** Depois de importar, o renderer recarrega; até lá, gravações da sessão antiga não podem sobrescrever. */
let blockWritesUntilReload = false;

function guard(event: IpcMainInvokeEvent): void {
  if (!isAppUrl(event.senderFrame?.url ?? '')) throw new Error('acesso negado');
}

async function writeAtomic(file: string, bytes: Uint8Array): Promise<void> {
  const tmp = `${file}.tmp`;
  await writeFile(tmp, bytes);
  await rename(tmp, file);
}

/** Copia o banco atual para backups/ (antes de abrir e antes de importar) e mantém só os 3 últimos. */
async function backupDb(tag: string): Promise<void> {
  const db = dataFile(DB_FILE);
  if (!existsSync(db)) return;
  const dir = dataFile(BACKUP_DIR);
  await mkdir(dir, { recursive: true });
  await copyFile(db, path.join(dir, backupName(new Date(), tag)));
  for (const old of backupsToPrune(await readdir(dir))) await rm(path.join(dir, old), { force: true });
}

const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

async function legacyDecision(): Promise<string | null> {
  try {
    return (JSON.parse(await readFile(dataFile(LEGACY_DECISION_FILE), 'utf8')) as { decision?: string }).decision ?? null;
  } catch {
    return null;
  }
}
async function recordLegacyDecision(decision: 'imported' | 'declined', extra: Record<string, unknown> = {}): Promise<void> {
  await writeFile(dataFile(LEGACY_DECISION_FILE), JSON.stringify({ decision, at: new Date().toISOString(), ...extra }, null, 2));
}

function registerIpc(): void {
  ipcMain.handle('academy:info', (event) => {
    guard(event);
    return { version: app.getVersion(), platform: process.platform };
  });

  ipcMain.handle('academy:db-read', async (event) => {
    guard(event);
    blockWritesUntilReload = false;
    const file = dataFile(DB_FILE);
    if (!existsSync(file)) return null;
    return new Uint8Array(await readFile(file));
  });

  ipcMain.handle('academy:db-write', async (event, bytes: unknown) => {
    guard(event);
    if (blockWritesUntilReload) throw new Error('banco substituído: recarregue o app');
    if (!(bytes instanceof Uint8Array)) throw new Error('conteúdo inválido');
    if (bytes.byteLength > MAX_DB_BYTES) throw new Error('banco acima do limite');
    if (!isSqliteFile(bytes)) throw new Error('não é um banco SQLite');
    await writeAtomic(dataFile(DB_FILE), bytes);
    return { bytes: bytes.byteLength };
  });

  ipcMain.handle('academy:save-file', async (event, input: unknown) => {
    guard(event);
    const req = (input ?? {}) as { name?: unknown; kind?: unknown; bytes?: unknown };
    if (!isSaveKind(req.kind)) throw new Error('tipo de arquivo não permitido');
    if (!(req.bytes instanceof Uint8Array)) throw new Error('conteúdo inválido');
    if (req.bytes.byteLength > MAX_SAVE_BYTES) throw new Error('arquivo acima do limite');
    const kind = req.kind;
    const owner = BrowserWindow.fromWebContents(event.sender);
    const opts = {
      defaultPath: path.join(app.getPath('documents'), saveFileName(req.name, kind)),
      filters: [{ name: kind.toUpperCase(), extensions: [SAVE_KINDS[kind].slice(1)] }],
    };
    const picked = owner ? await dialog.showSaveDialog(owner, opts) : await dialog.showSaveDialog(opts);
    if (picked.canceled || !picked.filePath) return 'canceled';
    const target = picked.filePath.toLowerCase().endsWith(SAVE_KINDS[kind]) ? picked.filePath : picked.filePath + SAVE_KINDS[kind];
    await writeFile(target, req.bytes);
    return 'saved';
  });

  /** Há banco do mixerCraft antigo e o aluno ainda não decidiu? */
  ipcMain.handle('academy:legacy-status', async (event) => {
    guard(event);
    return { available: existsSync(legacyDbPath()) && (await legacyDecision()) === null };
  });

  /** Copia (nunca move) o banco antigo para o do Academy, com backup do atual e conferência por hash. */
  ipcMain.handle('academy:legacy-import', async (event) => {
    guard(event);
    if ((await legacyDecision()) !== null) throw new Error('importação já decidida');
    const source = legacyDbPath();
    const bytes = new Uint8Array(await readFile(source));
    if (!isSqliteFile(bytes)) throw new Error('o arquivo antigo não é um banco SQLite');
    await backupDb('antes-importar');
    blockWritesUntilReload = true;
    await writeAtomic(dataFile(DB_FILE), bytes);
    const copied = new Uint8Array(await readFile(dataFile(DB_FILE)));
    if (sha256(copied) !== sha256(bytes)) throw new Error('cópia não confere com o original');
    await recordLegacyDecision('imported', { bytes: bytes.byteLength, sha256: sha256(bytes) });
    return { imported: true };
  });

  ipcMain.handle('academy:legacy-dismiss', async (event) => {
    guard(event);
    if ((await legacyDecision()) === null) await recordLegacyDecision('declined');
    return { dismissed: true };
  });
}

function configureSession(): void {
  const ses = session.defaultSession;
  protocol.handle(APP_SCHEME, async (request) => {
    const file = resolveAppAsset(rendererRoot(), request.url);
    if (!file || !existsSync(file)) return new Response('não encontrado', { status: 404 });
    return new Response(await readFile(file), {
      headers: { 'Content-Type': mimeOf(file), 'Content-Security-Policy': CONTENT_SECURITY_POLICY },
    });
  });
  // Microfone (só áudio) e MIDI (sem SysEx) para o próprio app; nada de câmera.
  ses.setPermissionRequestHandler((_wc, permission, callback, details) => {
    const url = (details as { requestingUrl?: string }).requestingUrl ?? '';
    const types = (details as { mediaTypes?: string[] }).mediaTypes ?? [];
    callback(isAppUrl(url) && ((permission === 'media' && types.every((t) => t === 'audio')) || permission === 'midi'));
  });
  ses.setPermissionCheckHandler((_wc, permission, origin) => (permission === 'media' || permission === 'midi') && origin === APP_ORIGIN);
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 360,
    minHeight: 560,
    backgroundColor: '#0d0f12',
    show: false,
    webPreferences: { ...SECURE_WEB_PREFERENCES, preload: path.join(app.getAppPath(), 'dist', 'preload.cjs') },
  });
  win.setMenuBarVisibility(false);
  win.webContents.on('will-navigate', (e, url) => {
    if (!isAppUrl(url)) e.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('render-process-gone', (_e, d) => {
    if (d.reason !== 'clean-exit' && !win.isDestroyed()) win.webContents.reload();
  });
  win.once('ready-to-show', () => win.show());

  const shot = process.env.ACADEMY_SMOKE_SCREENSHOT;
  if (shot) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        await writeFile(shot, (await win.webContents.capturePage()).toPNG());
        app.quit();
      }, 2500);
    });
  }
  const screen = process.env.ACADEMY_SMOKE_SCREEN;
  void win.loadURL(`${APP_ORIGIN}/index.html${screen ? `?screen=${encodeURIComponent(screen)}` : ''}`);
}

// Uma instância só: duas janelas gravando o mesmo banco perderiam progresso.
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => {
  const w = BrowserWindow.getAllWindows()[0];
  if (w) {
    if (w.isMinimized()) w.restore();
    w.focus();
  }
});

app.whenReady().then(async () => {
  await mkdir(app.getPath('userData'), { recursive: true });
  await backupDb('inicio').catch(() => undefined);
  configureSession();
  registerIpc();
  createWindow();
});

app.on('window-all-closed', () => app.quit());
