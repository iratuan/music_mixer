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
    if (data.kind === EXERCISE_KIND) return bad('este arquivo é um exercício, não uma música');
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

/* ===========================================================================
 * Pacote de exercício (kind: "exercise"), no mesmo envelope `.mcraft-pack`.
 * Um pacote sem `kind` (ou com "song") é uma música, como antes.
 * Protocolo de geração e validação: docs/06-protocolo-exercicios.md.
 * =========================================================================== */

export const EXERCISE_KIND = 'exercise';
export const EXERCISE_LIMITS = { steps: 512, beats: 512, len: 16, fret: 24, text: 200, description: 1000, bpm: [20, 400], levels: [1, 5], midi: [23, 80] } as const;
/** Resolução do tempo: múltiplos de 0,25 de tempo (semicolcheia). */
const GRID = 4;

export interface ExerciseStep {
  /** Altura MIDI (0 a 127 pelo contrato; no baixo, a partir de 23). */
  readonly midi: number;
  /** Início, em tempos, contados do começo do exercício (0 a 512, múltiplos de 0,25). */
  readonly start: number;
  /** Duração, em tempos (0,25 a 16, múltiplos de 0,25). */
  readonly len: number;
  /** Corda (0 = mais grave). Opcional: se houver, a casa é derivada ou conferida. */
  readonly string?: number;
  /** Casa (0 a 24). Só com corda. */
  readonly fret?: number;
}
export interface Exercise {
  readonly title: string;
  readonly description: string;
  /** Nível de 1 (iniciante) a 5. */
  readonly level: number;
  readonly instrument: 'bass';
  /** Notas MIDI das cordas soltas, da mais grave para a mais aguda, sem repetir. */
  readonly tuning: readonly number[];
  /** Tom de referência (texto livre, ex.: "Lá menor"). */
  readonly key: string;
  readonly bpm: number;
  readonly origin: { readonly type: 'mixer' | 'authored'; readonly source: string };
  /** Notas em ordem de início. */
  readonly steps: readonly ExerciseStep[];
}
export interface ExercisePack {
  readonly format: typeof PACK_FORMAT;
  readonly version: typeof PACK_VERSION;
  readonly kind: typeof EXERCISE_KIND;
  readonly createdAt: string;
  readonly app: { readonly name: string; readonly version: string };
  readonly exercise: Exercise;
}
export interface ExerciseIssue {
  /** Caminho do campo com problema, ex.: "steps[3].start". */
  readonly path: string;
  readonly message: string;
}
export type ExerciseValidation = { readonly ok: true; readonly exercise: Exercise } | { readonly ok: false; readonly issues: readonly ExerciseIssue[] };

const onGrid = (v: number) => Number.isInteger(v * GRID);
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInteger = (v: unknown): v is number => isNumber(v) && Number.isInteger(v);

/**
 * Valida um exercício (objeto já lido do JSON) e devolve TODOS os problemas, não só o primeiro.
 * Trata o objeto como não confiável: tipos, faixas, ordem, texto sem controle e corda/casa coerentes.
 */
export function validateExercise(raw: unknown): ExerciseValidation {
  const issues: ExerciseIssue[] = [];
  const err = (path: string, message: string) => issues.push({ path, message });
  if (!isObj(raw)) return { ok: false, issues: [{ path: '', message: 'o exercício deve ser um objeto' }] };

  const str = (v: unknown, path: string, max: number, required = false): string => {
    if (typeof v !== 'string') {
      err(path, 'deve ser texto');
      return '';
    }
    const s = v.replace(CONTROL, ' ').trim();
    if (required && !s) err(path, 'não pode ficar vazio');
    if (s.length > max) err(path, `passa de ${max} caracteres`);
    return s.slice(0, max);
  };

  const title = str(raw.title, 'title', EXERCISE_LIMITS.text, true);
  const description = raw.description === undefined ? '' : str(raw.description, 'description', EXERCISE_LIMITS.description);
  if (!isInteger(raw.level) || raw.level < EXERCISE_LIMITS.levels[0] || raw.level > EXERCISE_LIMITS.levels[1]) err('level', 'inteiro de 1 a 5');
  if (raw.instrument !== 'bass') err('instrument', 'por enquanto só "bass"');
  const key = str(raw.key, 'key', 40);
  if (!isInteger(raw.bpm) || raw.bpm < EXERCISE_LIMITS.bpm[0] || raw.bpm > EXERCISE_LIMITS.bpm[1]) err('bpm', 'inteiro de 20 a 400');

  let tuning: number[] = [];
  if (!Array.isArray(raw.tuning) || raw.tuning.length < 4 || raw.tuning.length > 6) {
    err('tuning', 'precisa de 4 a 6 cordas');
  } else {
    tuning = raw.tuning.map((m, i) => {
      if (isInteger(m) && m >= EXERCISE_LIMITS.midi[0] && m <= EXERCISE_LIMITS.midi[1]) return m;
      err(`tuning[${i}]`, 'nota MIDI de corda solta: inteiro de 23 a 80');
      return 0;
    });
    for (let i = 1; i < tuning.length; i++) {
      if (tuning[i]! <= tuning[i - 1]!) {
        err('tuning', 'cordas da mais grave para a mais aguda, sem repetir');
        break;
      }
    }
  }

  const origin = isObj(raw.origin) ? raw.origin : null;
  if (!origin) err('origin', 'objeto ausente');
  const originType = origin?.type;
  if (originType !== 'mixer' && originType !== 'authored') err('origin.type', 'use "mixer" ou "authored"');
  const originSource = origin ? str(origin.source, 'origin.source', EXERCISE_LIMITS.text, true) : '';

  const steps: ExerciseStep[] = [];
  if (!Array.isArray(raw.steps) || raw.steps.length < 1 || raw.steps.length > EXERCISE_LIMITS.steps) {
    err('steps', `precisa de 1 a ${EXERCISE_LIMITS.steps} notas`);
  } else {
    raw.steps.forEach((s, i) => {
      const p = `steps[${i}]`;
      if (!isObj(s)) return err(p, 'nota inválida');
      let ok = true;
      const { midi, start, len } = s;
      if (!isInteger(midi) || midi < 0 || midi > 127) {
        err(`${p}.midi`, 'inteiro de 0 a 127');
        ok = false;
      }
      if (!isNumber(start) || start < 0 || start > EXERCISE_LIMITS.beats || !onGrid(start)) {
        err(`${p}.start`, 'de 0 a 512, em passos de 0,25');
        ok = false;
      }
      if (!isNumber(len) || len < 1 / GRID || len > EXERCISE_LIMITS.len || !onGrid(len)) {
        err(`${p}.len`, 'de 0,25 a 16, em passos de 0,25');
        ok = false;
      }
      if (ok && (start as number) + (len as number) > EXERCISE_LIMITS.beats) {
        err(p, 'a nota passa do fim do exercício (512 tempos)');
        ok = false;
      }
      let string: number | undefined;
      let fret: number | undefined;
      if (s.string !== undefined) {
        if (!isInteger(s.string) || s.string < 0 || s.string >= tuning.length) err(`${p}.string`, `inteiro de 0 a ${tuning.length - 1}`);
        else string = s.string;
      }
      if (s.fret !== undefined) {
        if (!isInteger(s.fret) || s.fret < 0 || s.fret > EXERCISE_LIMITS.fret) err(`${p}.fret`, 'inteiro de 0 a 24');
        else fret = s.fret;
        if (string === undefined) err(`${p}.fret`, 'informe a corda junto com a casa');
      }
      if (ok && string !== undefined && tuning.length && isInteger(midi)) {
        const open = tuning[string]!;
        const f = fret ?? midi - open;
        if (open + f !== midi) err(p, `nota ${midi} não bate com a corda ${string} na casa ${f}`);
        else if (f < 0 || f > EXERCISE_LIMITS.fret) err(p, `casa ${f} fora de 0 a 24`);
        else fret = f;
      }
      if (ok) {
        steps.push({
          midi: midi as number,
          start: start as number,
          len: len as number,
          ...(string !== undefined ? { string } : {}),
          ...(fret !== undefined ? { fret } : {}),
        });
      }
    });
    for (let i = 1; i < steps.length; i++) {
      if (steps[i]!.start < steps[i - 1]!.start) {
        err('steps', 'notas fora de ordem: ordene por "start"');
        break;
      }
    }
  }

  if (issues.length) return { ok: false, issues };
  return {
    ok: true,
    exercise: {
      title,
      description,
      level: raw.level as number,
      instrument: 'bass',
      tuning,
      key,
      bpm: raw.bpm as number,
      origin: { type: originType as 'mixer' | 'authored', source: originSource },
      steps,
    },
  };
}

export function createExercisePack(exercise: Exercise, app: { name: string; version: string }, now = new Date()): ExercisePack {
  return { format: PACK_FORMAT, version: PACK_VERSION, kind: EXERCISE_KIND, createdAt: now.toISOString(), app: { name: app.name, version: app.version }, exercise };
}

/** Gera um exercício validado a partir de um trecho da linha do baixo de uma música. */
export function songToExercise(
  song: PackSong,
  opts: { title: string; level: number; fromBar: number; toBar: number; description?: string; tuning?: readonly number[] },
): Exercise {
  const { fromBar, toBar } = opts;
  if (!Number.isInteger(fromBar) || !Number.isInteger(toBar) || fromBar < 0 || toBar < fromBar || toBar >= song.bars.length) {
    throw new Error(`trecho de compassos inválido: ${fromBar + 1} a ${toBar + 1} (a música tem ${song.bars.length})`);
  }
  const q = (v: number) => Math.round(v * GRID) / GRID;
  const steps: ExerciseStep[] = [];
  for (let b = fromBar; b <= toBar; b++) {
    for (const n of song.bars[b]!.notes) {
      steps.push({ midi: n.midi, start: q((b - fromBar) * 4 + n.beat), len: Math.max(1 / GRID, q(n.len)) });
    }
  }
  steps.sort((a, c) => a.start - c.start || a.midi - c.midi);
  const candidate = {
    title: opts.title,
    description: opts.description ?? '',
    level: opts.level,
    instrument: 'bass',
    tuning: opts.tuning ?? [28, 33, 38, 43],
    key: song.key,
    bpm: song.bpm,
    origin: { type: 'mixer', source: song.title },
    steps,
  };
  const v = validateExercise(candidate);
  if (!v.ok) throw new Error(`exercício gerado é inválido: ${v.issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`);
  return v.exercise;
}

/** Bytes do pacote de exercício (JSON UTF-8). */
export function encodeExercisePack(pack: ExercisePack): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(pack));
}

export type ExchangeResult =
  | { readonly ok: true; readonly kind: 'song'; readonly pack: McraftPack }
  | { readonly ok: true; readonly kind: 'exercise'; readonly pack: ExercisePack }
  | { readonly ok: false; readonly error: string; readonly issues?: readonly ExerciseIssue[] };

/** Lê qualquer .mcraft-pack (música ou exercício). Nunca lança. */
export function parseExchange(input: string | Uint8Array): ExchangeResult {
  try {
    const size = typeof input === 'string' ? new TextEncoder().encode(input).byteLength : input.byteLength;
    if (size > PACK_LIMITS.bytes) return { ok: false, error: 'arquivo grande demais para um pacote' };
    const raw = typeof input === 'string' ? input : new TextDecoder('utf-8', { fatal: true }).decode(input);
    let data: unknown;
    try {
      data = JSON.parse(raw.replace(/^﻿/, ''));
    } catch {
      return { ok: false, error: 'o arquivo não é um pacote do MixerMonster (JSON inválido)' };
    }
    if (!isObj(data) || data.format !== PACK_FORMAT) return { ok: false, error: 'o arquivo não é um pacote do MixerMonster' };
    if (typeof data.version !== 'number' || data.version > PACK_VERSION) return { ok: false, error: 'pacote de uma versão mais nova: atualize o ScaleMonster' };
    if (data.version !== PACK_VERSION) return { ok: false, error: 'versão do pacote não suportada' };
    if (data.kind === undefined || data.kind === 'song') {
      const r = parsePack(raw);
      return r.ok ? { ok: true, kind: 'song', pack: r.pack } : { ok: false, error: r.error };
    }
    if (data.kind !== EXERCISE_KIND) return { ok: false, error: 'tipo de pacote desconhecido' };
    const v = validateExercise(data.exercise);
    if (!v.ok) return { ok: false, error: 'exercício inválido', issues: v.issues };
    const app = isObj(data.app) ? { name: String(data.app.name ?? '').slice(0, 200), version: String(data.app.version ?? '').slice(0, 200) } : { name: '', version: '' };
    const createdAt = typeof data.createdAt === 'string' && !Number.isNaN(Date.parse(data.createdAt)) ? data.createdAt : '';
    return { ok: true, kind: 'exercise', pack: { format: PACK_FORMAT, version: PACK_VERSION, kind: EXERCISE_KIND, createdAt, app, exercise: v.exercise } };
  } catch {
    return { ok: false, error: 'o arquivo não é UTF-8 válido' };
  }
}
