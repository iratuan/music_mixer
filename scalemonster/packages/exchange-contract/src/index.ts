/**
 * Pacote .mcraft-pack (versão 1): a linha do baixo de uma música, compasso a compasso com a harmonia,
 * exportada pelo MixerMonster e importada pelo ScaleMonster como exercício. Os dois apps funcionam
 * sem o outro; este pacote é a única coisa que eles combinam.
 *
 * Formato: um arquivo JSON UTF-8 (sem áudio). O importador trata o arquivo como não confiável:
 * `parsePack` confere tamanho, tipos, faixas numéricas e quantidades antes de devolver os dados.
 */

export const PACK_FORMAT = 'mcraft-pack';
export const PACK_VERSION = 1;
export const PACK_EXTENSION = '.mcraft-pack';

/** Limites do importador (arquivos maiores ou com mais itens são recusados). */
export const PACK_LIMITS = {
  bytes: 2 * 1024 * 1024,
  bars: 2000,
  notesPerBar: 64,
  chordsPerBar: 16,
  sections: 200,
  text: 200,
} as const;

export interface PackNote {
  /** Altura MIDI (0–127). */
  readonly midi: number;
  /** Início no compasso, em tempos (0 a 4). */
  readonly beat: number;
  /** Duração em tempos (maior que 0, até 4). */
  readonly len: number;
}
export interface PackBar {
  readonly chords: readonly string[];
  readonly notes: readonly PackNote[];
}
export interface PackSection {
  readonly name: string;
  /** Compassos de `from` a `to`, inclusive (0 ≤ from ≤ to < número de compassos). */
  readonly from: number;
  readonly to: number;
}
/** A música como exercício (o mesmo formato que o ScaleMonster usa por dentro). */
export interface PackSong {
  readonly title: string;
  readonly source: string;
  readonly key: string;
  readonly bpm: number;
  readonly bars: readonly PackBar[];
  readonly sections: readonly PackSection[];
}
export interface McraftPack {
  readonly format: typeof PACK_FORMAT;
  readonly version: typeof PACK_VERSION;
  readonly createdAt: string;
  readonly app: { readonly name: string; readonly version: string };
  readonly song: PackSong;
}

export function createPack(song: PackSong, app: { name: string; version: string }, now = new Date()): McraftPack {
  return { format: PACK_FORMAT, version: PACK_VERSION, createdAt: now.toISOString(), app: { name: app.name, version: app.version }, song };
}

/** Bytes do arquivo (JSON UTF-8). */
export function encodePack(pack: McraftPack): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(pack));
}

export type ParseResult = { readonly ok: true; readonly pack: McraftPack } | { readonly ok: false; readonly error: string };

class PackError extends Error {}
const bad = (msg: string): never => {
  throw new PackError(msg);
};
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, what: string, min: number, max: number): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : bad(`${what} fora da faixa (${min} a ${max})`);
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/g;
const text = (v: unknown, what: string, required = false): string => {
  if (typeof v !== 'string') return bad(`${what} deve ser texto`);
  const clean = v.replace(CONTROL, ' ').trim();
  if (required && !clean) return bad(`${what} vazio`);
  return clean.length > PACK_LIMITS.text ? clean.slice(0, PACK_LIMITS.text) : clean;
};
const list = (v: unknown, what: string, max: number): unknown[] => {
  if (!Array.isArray(v)) return bad(`${what} deve ser uma lista`);
  if (v.length > max) return bad(`${what}: mais de ${max} itens`);
  return v;
};

function song(v: unknown): PackSong {
  if (!isObj(v)) return bad('música ausente');
  const bars = list(v.bars, 'compassos', PACK_LIMITS.bars).map((b, i): PackBar => {
    if (!isObj(b)) return bad(`compasso ${i + 1} inválido`);
    return {
      chords: list(b.chords, `acordes do compasso ${i + 1}`, PACK_LIMITS.chordsPerBar).map((c) => text(c, 'acorde')),
      notes: list(b.notes, `notas do compasso ${i + 1}`, PACK_LIMITS.notesPerBar).map((n): PackNote => {
        if (!isObj(n)) return bad(`nota do compasso ${i + 1} inválida`);
        const len = num(n.len, 'duração da nota', 0, 4);
        if (len === 0) bad('duração da nota fora da faixa (0 a 4)');
        return { midi: Math.round(num(n.midi, 'nota MIDI', 0, 127)), beat: num(n.beat, 'tempo da nota', 0, 4), len };
      }),
    };
  });
  if (!bars.length) bad('a música não tem compassos');
  const sections = list(v.sections, 'partes', PACK_LIMITS.sections).map((s): PackSection => {
    if (!isObj(s)) return bad('parte inválida');
    const from = Math.round(num(s.from, 'início da parte', 0, bars.length - 1));
    const to = Math.round(num(s.to, 'fim da parte', from, bars.length - 1));
    return { name: text(s.name, 'nome da parte'), from, to };
  });
  return { title: text(v.title, 'título', true), source: text(v.source, 'origem'), key: text(v.key, 'tom'), bpm: num(v.bpm, 'andamento', 20, 400), bars, sections };
}

/** Lê e valida um .mcraft-pack (texto ou bytes). Nunca lança: devolve o erro em português. */
export function parsePack(input: string | Uint8Array): ParseResult {
  try {
    const size = typeof input === 'string' ? new TextEncoder().encode(input).byteLength : input.byteLength;
    if (size > PACK_LIMITS.bytes) bad('arquivo grande demais para um pacote');
    const raw = typeof input === 'string' ? input : new TextDecoder('utf-8', { fatal: true }).decode(input);
    let data: unknown;
    try {
      data = JSON.parse(raw.replace(/^﻿/, ''));
    } catch {
      return bad('o arquivo não é um pacote do MixerMonster (JSON inválido)');
    }
    if (!isObj(data) || data.format !== PACK_FORMAT) return bad('o arquivo não é um pacote do MixerMonster');
    if (typeof data.version !== 'number' || data.version > PACK_VERSION) bad('pacote de uma versão mais nova do MixerMonster: atualize o ScaleMonster');
    if (data.version !== PACK_VERSION) bad('versão do pacote não suportada');
    const app = isObj(data.app) ? { name: text(data.app.name, 'app'), version: text(data.app.version, 'versão do app') } : { name: '', version: '' };
    const createdAt = typeof data.createdAt === 'string' && !Number.isNaN(Date.parse(data.createdAt)) ? data.createdAt : '';
    return { ok: true, pack: { format: PACK_FORMAT, version: PACK_VERSION, createdAt, app, song: song(data.song) } };
  } catch (e) {
    if (e instanceof PackError) return { ok: false, error: e.message };
    return { ok: false, error: 'o arquivo não é UTF-8 válido' };
  }
}
