import { copyFile, mkdir, readFile, readdir, stat, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { cleanCollectionName, sanitizeMeta, type Library, type SongRecord } from './library.js';
import { sanitizeSections } from './songmap.js';

/**
 * Exportar e reimportar a biblioteca. Sem Electron: testável.
 *
 * Exportação: uma pasta "MixerMonster - biblioteca AAAA-MM-DD" com uma subpasta por música
 * ("001 - Nome da música") contendo as faixas separadas com nomes legíveis (Baixo.flac, Bateria.flac…),
 * a análise, a capa e, se pedido, o áudio original. O arquivo biblioteca.json descreve tudo (nomes,
 * coleções, mapa, estado inicial do mixer) e é o que a importação lê. Um LEIA-ME.txt explica a pasta.
 *
 * Importação: lê o biblioteca.json, valida cada caminho (só nomes de arquivo simples, dentro da
 * pasta exportada) e copia as músicas para a biblioteca. A mesma música (mesmo id) já presente é
 * pulada; nada da biblioteca atual é apagado nem sobrescrito.
 */
export const EXPORT_FORMAT = 'mixercraft-biblioteca';
export const EXPORT_VERSION = 1;
export const MANIFEST = 'biblioteca.json';

const STEM_LABELS: Record<string, string> = {
  vocals: 'Voz',
  lead: 'Voz principal',
  backing: 'Backing vocals',
  guitar: 'Guitarra',
  piano: 'Piano',
  bass: 'Baixo',
  drums: 'Bateria',
  other: 'Outros',
  rest: 'Restante',
};
const AUDIO_EXT = /^\.(flac|wav|mp3|m4a|ogg|opus|webm|aac)$/i;
const STEM_RE = /^[a-z]{3,12}$/;
const ID_RE = /^[0-9a-f]{16}$/;

/** Nome de arquivo/pasta seguro no Windows: sem caracteres proibidos, sem pontos no fim, curto. */
export function safeName(name: string, max = 80): string {
  const s = name
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, max)
    .trim();
  return /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s) || !s ? 'musica' : s;
}

/** Só um nome de arquivo simples (sem pastas, sem "..") vindo do manifesto. */
function plainFile(v: unknown): string | null {
  if (typeof v !== 'string' || !v || v.length > 120) return null;
  if (v !== path.basename(v) || v === '.' || v === '..' || /[\\/:]/.test(v)) return null;
  return v;
}

export interface ManifestSong {
  readonly id: string;
  readonly name: string;
  readonly addedAt: string;
  readonly folder: string;
  readonly origin: SongRecord['origin'];
  readonly meta?: SongRecord['meta'];
  readonly startMix?: Readonly<Record<string, boolean>>;
  readonly sections?: ReadonlyArray<{ readonly startBar: number; readonly name: string }>;
  readonly collections?: readonly string[];
  /** Faixa → nome do arquivo na pasta da música. */
  readonly stems: Readonly<Record<string, string>> | null;
  readonly analysis: string | null;
  readonly cover: string | null;
  readonly original: string | null;
}

export interface Manifest {
  readonly format: typeof EXPORT_FORMAT;
  readonly version: number;
  readonly exportedAt: string;
  readonly app?: string;
  readonly collections: readonly string[];
  readonly songs: readonly ManifestSong[];
}

export interface TransferProgress {
  readonly done: number;
  readonly total: number;
  readonly name?: string;
}

export interface ExportOptions {
  /** Inclui o áudio original de cada música (a pasta fica maior). */
  readonly includeOriginal: boolean;
  /** Só estas músicas (ex.: uma coleção); sem valor, todas. */
  readonly ids?: readonly string[];
  /** Nome da coleção exportada: vira o nome da pasta principal. */
  readonly collection?: string;
  readonly appVersion?: string;
  readonly now?: Date;
}

export interface ExportResult {
  readonly folder: string;
  readonly songs: number;
  readonly stems: number;
  readonly bytes: number;
  /** Músicas sem faixas e sem original disponível (não exportadas). */
  readonly skipped: readonly string[];
}

async function copyCounting(from: string, to: string): Promise<number> {
  await copyFile(from, to);
  return (await stat(to)).size;
}

/** Pasta nova dentro de `dest`, sem sobrescrever uma exportação anterior. */
async function freshFolder(dest: string, base: string): Promise<string> {
  let p = path.join(dest, base);
  for (let k = 2; existsSync(p); k++) p = path.join(dest, `${base} (${k})`);
  await mkdir(p, { recursive: true });
  return p;
}

export async function exportLibrary(library: Library, dest: string, opts: ExportOptions, onProgress: (p: TransferProgress) => void = () => undefined): Promise<ExportResult> {
  const now = opts.now ?? new Date();
  const all = await library.list();
  const chosen = opts.ids ? all.filter((s) => opts.ids!.includes(s.id)) : all;
  const day = now.toISOString().slice(0, 10);
  const root = await freshFolder(dest, opts.collection ? safeName(`MixerMonster - ${opts.collection} ${day}`) : `MixerMonster - biblioteca ${day}`);
  const songs: ManifestSong[] = [];
  const skipped: string[] = [];
  let bytes = 0;
  let stemCount = 0;
  const usedFolders = new Set<string>();
  for (let i = 0; i < chosen.length; i++) {
    const s = chosen[i]!;
    onProgress({ done: i, total: chosen.length, name: s.name });
    const stems = Object.entries(s.stems ?? {}).filter(([, p]) => existsSync(p));
    const hasOriginal = opts.includeOriginal && existsSync(s.sourcePath);
    if (!stems.length && !hasOriginal) {
      skipped.push(s.name);
      continue;
    }
    // Uma subpasta por música, com o nome dela (nomes repetidos ganham " (2)", " (3)"…).
    const base = safeName(s.name.replace(/\.[a-z0-9]{2,5}$/i, '')) || 'Música';
    let folder = base;
    for (let k = 2; usedFolders.has(folder.toLowerCase()); k++) folder = `${base} (${k})`;
    usedFolders.add(folder.toLowerCase());
    const dir = path.join(root, folder);
    await mkdir(dir, { recursive: true });
    const stemFiles: Record<string, string> = {};
    const usedNames = new Set<string>();
    for (const [key, p] of stems) {
      let file = `${safeName(STEM_LABELS[key] ?? key, 40)}${path.extname(p).toLowerCase() || '.flac'}`;
      if (usedNames.has(file.toLowerCase())) file = `${key}${path.extname(p).toLowerCase()}`;
      usedNames.add(file.toLowerCase());
      bytes += await copyCounting(p, path.join(dir, file));
      stemFiles[key] = file;
      stemCount++;
    }
    const an = library.analysisPath(s.id);
    const analysis = existsSync(an) ? 'analise.json' : null;
    if (analysis) bytes += await copyCounting(an, path.join(dir, analysis));
    const cv = library.coverPath(s.id);
    const cover = existsSync(cv) ? 'capa.img' : null;
    if (cover) bytes += await copyCounting(cv, path.join(dir, cover));
    let original: string | null = null;
    if (hasOriginal) {
      const ext = path.extname(s.sourcePath).toLowerCase();
      original = `Original${AUDIO_EXT.test(ext) ? ext : '.audio'}`;
      bytes += await copyCounting(s.sourcePath, path.join(dir, original));
    }
    songs.push({
      id: s.id,
      name: s.name,
      addedAt: s.addedAt,
      folder,
      origin: s.origin,
      ...(s.meta ? { meta: s.meta } : {}),
      ...(s.startMix ? { startMix: s.startMix } : {}),
      ...(s.sections ? { sections: s.sections } : {}),
      ...(s.collections?.length ? { collections: s.collections } : {}),
      stems: stems.length ? stemFiles : null,
      analysis,
      cover,
      original,
    });
  }
  const used = new Set(songs.flatMap((s) => s.collections ?? []));
  const collections = opts.ids ? (await library.collections()).filter((c) => used.has(c)) : await library.collections();
  const manifest: Manifest = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    ...(opts.appVersion ? { app: opts.appVersion } : {}),
    collections,
    songs,
  };
  await writeFile(path.join(root, MANIFEST), JSON.stringify(manifest, null, 2), 'utf8');
  await writeFile(
    path.join(root, 'LEIA-ME.txt'),
    [
      'Biblioteca exportada pelo MixerMonster',
      `Data: ${now.toLocaleString('pt-BR')}`,
      `Músicas: ${songs.length} · faixas: ${stemCount}`,
      '',
      'Cada pasta é uma música, com as faixas separadas (Baixo, Bateria, Voz…) em arquivos de áudio',
      'que abrem em qualquer programa de música. "analise.json" guarda andamento, compassos e acordes.',
      '',
      'Para trazer de volta ao MixerMonster: Biblioteca > Importar biblioteca, e escolha esta pasta.',
      'Não renomeie as pastas nem o arquivo biblioteca.json.',
    ].join('\r\n'),
    'utf8',
  );
  onProgress({ done: chosen.length, total: chosen.length });
  return { folder: root, songs: songs.length, stems: stemCount, bytes, skipped };
}

/** Lê e valida o manifesto de uma pasta exportada (ou da pasta logo dentro dela). */
export async function readManifest(folder: string): Promise<{ root: string; manifest: Manifest }> {
  let root = folder;
  if (!existsSync(path.join(root, MANIFEST))) {
    // O usuário pode ter escolhido a pasta onde a exportação foi salva: procura uma exportação dentro dela.
    const inside = existsSync(folder) ? (await readdir(folder, { withFileTypes: true })).filter((d) => d.isDirectory() && existsSync(path.join(folder, d.name, MANIFEST))) : [];
    if (inside.length !== 1) throw new Error('esta pasta não é uma biblioteca exportada pelo MixerMonster (falta o biblioteca.json)');
    root = path.join(folder, inside[0]!.name);
  }
  const raw = await readFile(path.join(root, MANIFEST), 'utf8');
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw.replace(/^﻿/, '')) as Record<string, unknown>;
  } catch {
    throw new Error('biblioteca.json ilegível');
  }
  if (data.format !== EXPORT_FORMAT || typeof data.version !== 'number' || data.version > EXPORT_VERSION) throw new Error('biblioteca exportada por uma versão diferente do MixerMonster');
  if (!Array.isArray(data.songs) || data.songs.length > 500) throw new Error('biblioteca.json inválido');
  const collections = Array.isArray(data.collections)
    ? data.collections.flatMap((c) => {
        try {
          return [cleanCollectionName(c)];
        } catch {
          return [];
        }
      })
    : [];
  const songs: ManifestSong[] = [];
  for (const x of data.songs as unknown[]) {
    const o = (x ?? {}) as Record<string, unknown>;
    const folderName = plainFile(o.folder);
    const name = typeof o.name === 'string' ? o.name.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200) : '';
    if (!folderName || !name) continue;
    const stemsIn = o.stems && typeof o.stems === 'object' ? (o.stems as Record<string, unknown>) : null;
    const stems: Record<string, string> = {};
    for (const [k, v] of Object.entries(stemsIn ?? {})) {
      const f = plainFile(v);
      if (STEM_RE.test(k) && f && AUDIO_EXT.test(path.extname(f))) stems[k] = f;
    }
    const origin = o.origin as SongRecord['origin'] | undefined;
    const goodOrigin: SongRecord['origin'] =
      origin && origin.kind === 'url' && typeof origin.url === 'string' && /^https:\/\//.test(origin.url)
        ? {
            kind: 'url',
            url: origin.url.slice(0, 500),
            site: String(origin.site ?? '').slice(0, 60),
            title: String(origin.title ?? name).slice(0, 200),
            channel: String(origin.channel ?? '').slice(0, 200),
            downloadedAt: String(origin.downloadedAt ?? ''),
          }
        : { kind: 'file' };
    let sections: StoredSections | undefined;
    try {
      sections = o.sections === undefined ? undefined : sanitizeSections(o.sections);
    } catch {
      sections = undefined;
    }
    const startMix: Record<string, boolean> = {};
    if (o.startMix && typeof o.startMix === 'object') for (const [k, v] of Object.entries(o.startMix)) if (STEM_RE.test(k) && typeof v === 'boolean') startMix[k] = v;
    const cols = Array.isArray(o.collections)
      ? o.collections.flatMap((c) => {
          try {
            return [cleanCollectionName(c)];
          } catch {
            return [];
          }
        })
      : [];
    const original = plainFile(o.original);
    songs.push({
      id: typeof o.id === 'string' && ID_RE.test(o.id) ? o.id : randomBytes(8).toString('hex'),
      name,
      addedAt: typeof o.addedAt === 'string' && !Number.isNaN(Date.parse(o.addedAt)) ? o.addedAt : new Date().toISOString(),
      folder: folderName,
      origin: goodOrigin,
      ...(o.meta ? { meta: sanitizeMeta(o.meta) } : {}),
      ...(Object.keys(startMix).length ? { startMix } : {}),
      ...(sections?.length ? { sections } : {}),
      ...(cols.length ? { collections: cols } : {}),
      stems: Object.keys(stems).length ? stems : null,
      analysis: plainFile(o.analysis) === 'analise.json' ? 'analise.json' : null,
      cover: plainFile(o.cover) === 'capa.img' ? 'capa.img' : null,
      original: original && AUDIO_EXT.test(path.extname(original)) ? original : null,
    });
  }
  return {
    root,
    manifest: { format: EXPORT_FORMAT, version: data.version as number, exportedAt: String(data.exportedAt ?? ''), collections, songs },
  };
}
type StoredSections = ReturnType<typeof sanitizeSections>;

export interface ImportResult {
  readonly added: number;
  /** Já estavam na biblioteca (mesma música). */
  readonly existing: readonly string[];
  /** Faltaram arquivos ou deu erro ao copiar. */
  readonly failed: readonly string[];
}

export async function importLibrary(library: Library, folder: string, onProgress: (p: TransferProgress) => void = () => undefined): Promise<ImportResult> {
  const { root, manifest } = await readManifest(folder);
  const current = await library.list();
  const have = new Set(current.map((s) => s.id));
  const records: SongRecord[] = [];
  const existing: string[] = [];
  const failed: string[] = [];
  const total = manifest.songs.length;
  for (let i = 0; i < total; i++) {
    const m = manifest.songs[i]!;
    onProgress({ done: i, total, name: m.name });
    if (have.has(m.id)) {
      existing.push(m.name);
      continue;
    }
    const src = path.join(root, m.folder);
    const dest = library.songDir(m.id);
    try {
      if (existsSync(dest)) throw new Error('pasta da música já existe');
      const stems: Record<string, string> = {};
      await mkdir(path.join(dest, 'faixas'), { recursive: true });
      for (const [key, file] of Object.entries(m.stems ?? {})) {
        const from = path.join(src, file);
        if (!existsSync(from)) throw new Error(`falta a faixa ${file}`);
        const to = path.join(dest, 'faixas', `${key}${path.extname(file).toLowerCase()}`);
        await copyFile(from, to);
        stems[key] = to;
      }
      if (m.analysis && existsSync(path.join(src, m.analysis))) await copyFile(path.join(src, m.analysis), library.analysisPath(m.id));
      if (m.cover && existsSync(path.join(src, m.cover))) await copyFile(path.join(src, m.cover), library.coverPath(m.id));
      // O áudio original (se veio) fica na pasta da música; sem ele, a música toca pelas faixas.
      const originalTo = path.join(dest, m.original ? `original${path.extname(m.original).toLowerCase()}` : 'original.flac');
      if (m.original && existsSync(path.join(src, m.original))) await copyFile(path.join(src, m.original), originalTo);
      if (!Object.keys(stems).length && !existsSync(originalTo)) throw new Error('sem faixas nem áudio original');
      records.push({
        id: m.id,
        name: m.name,
        addedAt: m.addedAt,
        sourcePath: originalTo,
        stems: Object.keys(stems).length ? stems : null,
        origin: m.origin,
        ...(m.meta ? { meta: m.meta } : {}),
        ...(m.startMix ? { startMix: m.startMix } : {}),
        ...(m.sections ? { sections: m.sections } : {}),
        ...(m.collections ? { collections: m.collections } : {}),
      });
      have.add(m.id);
    } catch {
      failed.push(m.name);
      await rm(dest, { recursive: true, force: true }).catch(() => undefined);
    }
  }
  if (records.length) await library.addRecords(records);
  // Coleções vazias da exportação também voltam.
  const names = await library.collections();
  for (const c of manifest.collections) if (!names.some((n) => n.localeCompare(c, 'pt-BR', { sensitivity: 'base' }) === 0)) await library.collectionOp('create', c).catch(() => undefined);
  onProgress({ done: total, total });
  return { added: records.length, existing, failed };
}
