import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Biblioteca de músicas importadas. Fica em userData/library/. Música importada de arquivo:
 * guarda só o caminho do original. Música baixada de um link: o áudio fica na pasta da música
 * (o app é dono dele). Guarda também as faixas separadas, a análise e os caches (tom, MIDI).
 * Todo caminho de faixa é montado aqui; o renderer só envia ids e nomes de faixa validados.
 */

export const LIBRARY_VERSION = 1;
/** Transposição oferecida: meio tom a meio tom, até uma quarta aumentada para cada lado. */
export const MAX_SEMITONES = 6;
export function isSemitones(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && Math.abs(v) <= MAX_SEMITONES;
}
const ID_RE = /^[0-9a-f]{16}$/;
const STEM_RE = /^[a-z]{3,12}$/;
const MAX_SONGS = 500;

export interface SongRecord {
  readonly id: string;
  readonly name: string;
  readonly addedAt: string;
  readonly sourcePath: string;
  /** Nome da faixa (bass, drums, …) → arquivo WAV separado. null = ainda não separada. */
  readonly stems: Readonly<Record<string, string>> | null;
  /** Resumo da análise (para o card da biblioteca). */
  readonly meta?: SongMeta;
  /** De onde veio a música. Registros antigos (sem o campo) são de arquivo. */
  readonly origin: SongOrigin;
  /** Estado inicial do mixer: faixa → começa tocando (true) ou muda (false). */
  readonly startMix?: Readonly<Record<string, boolean>>;
  /** Mapa da música: partes por compasso (editadas pelo usuário). */
  readonly sections?: ReadonlyArray<{ readonly startBar: number; readonly name: string }>;
  /** Coleções (etiquetas livres) em que a música está. */
  readonly collections?: readonly string[];
}

const MAX_COLLECTIONS = 100;
/** Nome de coleção: 1–40 caracteres visíveis, sem controle. */
export function cleanCollectionName(v: unknown): string {
  const s = typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() : '';
  if (!s || s.length > 40) throw new Error('nome de coleção inválido (1 a 40 caracteres)');
  return s;
}
const sameName = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }) === 0;


export type SongOrigin =
  | { readonly kind: 'file' }
  | { readonly kind: 'url'; readonly url: string; readonly site: string; readonly title: string; readonly channel: string; readonly downloadedAt: string };

/** Registro gravado por versões anteriores: ganha `origin: file`. */
export function migrateRecord(raw: unknown): SongRecord {
  const r = raw as SongRecord & { origin?: SongOrigin };
  return r.origin ? r : { ...r, origin: { kind: 'file' } };
}

export interface SongMeta {
  readonly bpm?: number;
  readonly key?: string;
  /** Andamento variável: faixa p5–p95 (ausente quando constante ou fixado). */
  readonly bpmRange?: readonly [number, number] | undefined;
}

/** Valida e normaliza o resumo vindo do renderer: só números em faixa e texto curto. */
export function sanitizeMeta(input: unknown): SongMeta {
  const m = (input ?? {}) as Record<string, unknown>;
  const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v * 10) / 10 : undefined);
  const key = typeof m.key === 'string' && /^[A-G][#b]? (maior|menor)$/.test(m.key) ? m.key : undefined;
  const out: { bpm?: number; key?: string; bpmRange?: [number, number] | undefined } = {};
  const bpm = num(m.bpm, 30, 300);
  if (bpm !== undefined) out.bpm = bpm;
  if (key !== undefined) out.key = key;
  if ('bpmRange' in m) {
    // null apaga (análise refeita com andamento fixo); faixa válida grava.
    const r = Array.isArray(m.bpmRange) && m.bpmRange.length === 2 ? m.bpmRange.map((x) => num(x, 20, 400)) : null;
    out.bpmRange = r && r[0] !== undefined && r[1] !== undefined && r[0] <= r[1] ? [r[0], r[1]] : undefined;
  }
  return out;
}

interface IndexFile {
  readonly version: number;
  readonly songs: SongRecord[];
}

/**
 * Versão da transcrição por faixa: muda quando o algoritmo melhora, e o cache antigo é refeito.
 * Baixo v2: ataques corrigidos pelo áudio, notas repetidas divididas, notas fantasmas removidas; v3: + mapa de andamento.
 */
const MIDI_VERSION: Record<string, number> = { bass: 3 };
/** v2 (todas as faixas): mapa de andamento e compassos da análise dentro do MIDI. */
const MIDI_DEFAULT_VERSION = 2;

export class Library {
  constructor(private readonly root: string) {}

  private get indexPath(): string {
    return path.join(this.root, 'index.json');
  }

  songDir(id: string): string {
    if (!ID_RE.test(id)) throw new Error('id de música inválido');
    return path.join(this.root, 'songs', id);
  }

  private async load(): Promise<IndexFile> {
    let raw: string;
    try {
      raw = await readFile(this.indexPath, 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { version: LIBRARY_VERSION, songs: [] };
      throw e;
    }
    const data = JSON.parse(raw) as Partial<IndexFile>;
    if (data.version !== LIBRARY_VERSION || !Array.isArray(data.songs)) throw new Error('índice da biblioteca inválido');
    return { version: LIBRARY_VERSION, songs: data.songs.map(migrateRecord) };
  }

  private async save(index: IndexFile): Promise<void> {
    await mkdir(this.root, { recursive: true });
    const tmp = `${this.indexPath}.tmp`;
    await writeFile(tmp, JSON.stringify(index, null, 2), 'utf8');
    await rename(tmp, this.indexPath); // troca atômica: o índice nunca fica pela metade
  }

  private get collectionsPath(): string {
    return path.join(this.root, 'collections.json');
  }

  /** Coleções: as criadas (arquivo próprio, guarda as vazias) mais as que estão nas músicas. */
  async collections(): Promise<string[]> {
    let names: string[] = [];
    try {
      const data = JSON.parse(await readFile(this.collectionsPath, 'utf8')) as { names?: unknown };
      if (Array.isArray(data.names)) names = data.names.filter((x): x is string => typeof x === 'string');
    } catch {
      /* sem arquivo ainda */
    }
    for (const s of (await this.load()).songs) for (const c of s.collections ?? []) if (!names.some((n) => sameName(n, c))) names.push(c);
    return names.sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  private async saveCollections(names: readonly string[]): Promise<void> {
    await mkdir(this.root, { recursive: true });
    const tmp = `${this.collectionsPath}.tmp`;
    await writeFile(tmp, JSON.stringify({ names }, null, 2), 'utf8');
    await rename(tmp, this.collectionsPath);
  }

  /**
   * Operações de coleção: criar, renomear, excluir (as músicas ficam), pôr e tirar músicas.
   * Devolve a lista atualizada.
   */
  async collectionOp(op: 'create' | 'rename' | 'delete' | 'add' | 'remove', nameRaw: unknown, extra: { to?: unknown; ids?: unknown } = {}): Promise<string[]> {
    const name = cleanCollectionName(nameRaw);
    let names = await this.collections();
    const index = await this.load();
    const ids = Array.isArray(extra.ids) ? extra.ids.filter((x): x is string => typeof x === 'string' && ID_RE.test(x)) : [];
    const mapSongs = (f: (cols: string[], s: SongRecord) => string[]) =>
      index.songs.map((s) => {
        const next = f([...(s.collections ?? [])], s);
        return next.length ? { ...s, collections: next } : (({ collections: _c, ...rest }) => rest)(s as SongRecord & { collections?: readonly string[] });
      });
    if (op === 'create' || op === 'add') {
      if (!names.some((n) => sameName(n, name))) {
        if (names.length >= MAX_COLLECTIONS) throw new Error('coleções demais');
        names.push(name);
      }
    }
    const canonical = names.find((n) => sameName(n, name)) ?? name;
    if (op === 'add' || op === 'remove') {
      if (!ids.length) throw new Error('nenhuma música escolhida');
      const songs = mapSongs((cols, s) => {
        if (!ids.includes(s.id)) return cols;
        const rest = cols.filter((c) => !sameName(c, canonical));
        return op === 'add' ? [...rest, canonical] : rest;
      });
      await this.save({ version: LIBRARY_VERSION, songs });
    } else if (op === 'rename') {
      const to = cleanCollectionName(extra.to);
      if (!names.some((n) => sameName(n, name))) throw new Error('coleção não encontrada');
      if (names.some((n) => sameName(n, to) && !sameName(n, name))) throw new Error('já existe uma coleção com esse nome');
      names = names.map((n) => (sameName(n, name) ? to : n));
      await this.save({ version: LIBRARY_VERSION, songs: mapSongs((cols) => cols.map((c) => (sameName(c, name) ? to : c))) });
    } else if (op === 'delete') {
      names = names.filter((n) => !sameName(n, name));
      await this.save({ version: LIBRARY_VERSION, songs: mapSongs((cols) => cols.filter((c) => !sameName(c, name))) });
    }
    await this.saveCollections(names);
    return this.collections();
  }

  async list(): Promise<SongRecord[]> {
    return (await this.load()).songs;
  }

  async get(id: string): Promise<SongRecord | undefined> {
    if (!ID_RE.test(id)) throw new Error('id de música inválido');
    return (await this.load()).songs.find((s) => s.id === id);
  }

  /** Id novo para uma música ainda por baixar (a pasta songs/<id> recebe o download). */
  newId(): string {
    return randomBytes(8).toString('hex');
  }

  async findByUrl(url: string): Promise<SongRecord | undefined> {
    return (await this.load()).songs.find((s) => s.origin.kind === 'url' && s.origin.url === url);
  }

  /** Registra uma música baixada; o áudio já está em songs/<id>/. */
  async addDownloaded(id: string, name: string, sourcePath: string, origin: Extract<SongOrigin, { kind: 'url' }>, startMix?: Record<string, boolean>): Promise<SongRecord> {
    const dir = this.songDir(id);
    const clean = name.trim().slice(0, 200) || 'vídeo';
    if (path.dirname(sourcePath) !== dir) throw new Error('áudio baixado fora da pasta da música');
    const index = await this.load();
    if (index.songs.length >= MAX_SONGS) throw new Error('biblioteca cheia');
    if (index.songs.some((s) => s.id === id)) throw new Error('id repetido');
    const record: SongRecord = { id, name: clean, addedAt: origin.downloadedAt, sourcePath, stems: null, origin, ...(startMix ? { startMix } : {}) };
    await this.save({ version: LIBRARY_VERSION, songs: [record, ...index.songs] });
    return record;
  }

  async setStartMix(id: string, startMix: Record<string, boolean>): Promise<void> {
    if (!ID_RE.test(id)) throw new Error('id de música inválido');
    const index = await this.load();
    if (!index.songs.some((s) => s.id === id)) throw new Error('música não encontrada');
    await this.save({ version: LIBRARY_VERSION, songs: index.songs.map((s) => (s.id === id ? { ...s, startMix } : s)) });
  }

  async setSections(id: string, sections: ReadonlyArray<{ startBar: number; name: string }>): Promise<void> {
    if (!ID_RE.test(id)) throw new Error('id de música inválido');
    const index = await this.load();
    if (!index.songs.some((s) => s.id === id)) throw new Error('música não encontrada');
    await this.save({ version: LIBRARY_VERSION, songs: index.songs.map((s) => (s.id === id ? { ...s, sections } : s)) });
  }

  /** Miniatura do vídeo (JPEG, PNG ou WebP), gravada no download: songs/<id>/capa.img */
  coverPath(id: string): string {
    return path.join(this.songDir(id), 'capa.img');
  }

  async add(name: string, sourcePath: string, now: Date = new Date()): Promise<SongRecord> {
    const clean = name.trim().slice(0, 200);
    if (clean.length === 0) throw new Error('nome inválido');
    if (!path.isAbsolute(sourcePath)) throw new Error('caminho de origem deve ser absoluto');
    const index = await this.load();
    if (index.songs.length >= MAX_SONGS) throw new Error('biblioteca cheia');
    const existing = index.songs.find((s) => s.sourcePath === sourcePath);
    if (existing) return existing; // mesma origem: não duplica
    const record: SongRecord = {
      id: randomBytes(8).toString('hex'),
      name: clean,
      addedAt: now.toISOString(),
      sourcePath,
      stems: null,
      origin: { kind: 'file' },
    };
    await this.save({ version: LIBRARY_VERSION, songs: [record, ...index.songs] });
    return record;
  }

  async setStems(id: string, stems: Record<string, string>): Promise<void> {
    for (const [name, p] of Object.entries(stems)) {
      if (!STEM_RE.test(name)) throw new Error(`nome de faixa inválido: ${name}`);
      if (!path.isAbsolute(p)) throw new Error('caminho de faixa deve ser absoluto');
    }
    const index = await this.load();
    const songs = index.songs.map((s) => (s.id === id ? { ...s, stems } : s));
    if (!songs.some((s) => s.id === id)) throw new Error('música não encontrada');
    await this.save({ version: LIBRARY_VERSION, songs });
  }

  async setMeta(id: string, meta: unknown): Promise<SongMeta> {
    if (!ID_RE.test(id)) throw new Error('id de música inválido');
    const clean = sanitizeMeta(meta);
    const index = await this.load();
    if (!index.songs.some((s) => s.id === id)) throw new Error('música não encontrada');
    const songs = index.songs.map((s) => (s.id === id ? { ...s, meta: { ...(s.meta ?? {}), ...clean } } : s));
    await this.save({ version: LIBRARY_VERSION, songs });
    return clean;
  }

  async remove(id: string): Promise<void> {
    if (!ID_RE.test(id)) throw new Error('id de música inválido');
    const index = await this.load();
    const songs = index.songs.filter((s) => s.id !== id);
    if (songs.length === index.songs.length) throw new Error('música não encontrada');
    await this.save({ version: LIBRARY_VERSION, songs });
    // Apaga a pasta de dados do app (faixas, análise, caches e, se a música veio de um link, o áudio
    // baixado). Um arquivo importado do computador fica fora dela e não é tocado.
    await rm(this.songDir(id), { recursive: true, force: true });
  }

  /** Análise da música (andamento, compassos, acordes, tom), gerada pelo bf_tools.py. */
  analysisPath(id: string): string {
    return path.join(this.songDir(id), 'analise.json');
  }

  async readAnalysis(id: string): Promise<unknown | null> {
    try {
      return JSON.parse(await readFile(this.analysisPath(id), 'utf8')) as unknown;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }

  /** Faixa transposta (cache): songs/<id>/tom/<faixa>_<+N|-N>.flac (o Rubber Band grava pela extensão). */
  transposedPath(id: string, stem: string, semitones: number): string {
    if (!STEM_RE.test(stem)) throw new Error('nome de faixa inválido');
    if (!isSemitones(semitones) || semitones === 0) throw new Error('transposição inválida');
    return path.join(this.songDir(id), 'tom', `${stem}_${semitones > 0 ? '+' : ''}${semitones}.flac`);
  }

  /** MIDI de uma faixa (cache): songs/<id>/midi/<faixa>_<N>.mid */
  midiPath(id: string, stem: string, semitones: number): string {
    if (!STEM_RE.test(stem)) throw new Error('nome de faixa inválido');
    if (!isSemitones(semitones)) throw new Error('transposição inválida');
    const v = MIDI_VERSION[stem] ?? MIDI_DEFAULT_VERSION;
    return path.join(this.songDir(id), 'midi', `${stem}_${semitones}${v ? `.v${v}` : ''}.mid`);
  }

  /** MIDI de uma versão anterior da transcrição (para apagar quando a nova for gerada). */
  oldMidiPaths(id: string, stem: string, semitones: number): string[] {
    const cur = this.midiPath(id, stem, semitones);
    const v = MIDI_VERSION[stem] ?? MIDI_DEFAULT_VERSION;
    const out: string[] = [];
    for (let k = 0; k < v; k++) out.push(path.join(this.songDir(id), 'midi', `${stem}_${semitones}${k ? `.v${k}` : ''}.mid`));
    return out.filter((p) => p !== cur);
  }

  /** Caminho de uma faixa separada, só se ela pertencer à música informada. */
  async stemPath(id: string, stem: string): Promise<string | null> {
    if (!STEM_RE.test(stem)) throw new Error('nome de faixa inválido');
    const rec = await this.get(id);
    return rec?.stems?.[stem] ?? null;
  }
}
