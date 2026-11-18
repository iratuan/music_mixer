/**
 * Modo Palco (pista de notas): modelo de dados das notas, ligados (HOPO), sustentações, janelas de
 * acerto e metadados no formato de um `song.ini`. O formato é compatível com as pistas de notas
 * MIDI comunitárias de jogos de ritmo (notas 60–64, 72–76, 84–88 e 96–100 = 5 trilhas por nível),
 * para poder carregar músicas assim no futuro; os exercícios do app geram as notas sozinhos.
 */
import { readMidi } from '@baixaria/music-theory';

export type FofDifficulty = 'easy' | 'medium' | 'hard' | 'expert';

export interface FofNoteEvent {
  /** Identificador único (no exercício: índice da nota + ciclo × tamanho da sequência). */
  readonly id: number;
  /** Instante em que a nota deve soar (segundos, relógio do motor de áudio ou desde o início). */
  readonly time: number;
  /** Trilha: no baixo, a corda (0 = mais grave). */
  readonly lane: number;
  /** Casa mostrada na gema (−1 quando a pista não sabe a casa). */
  readonly fret: number;
  /** Altura MIDI esperada (−1 quando a pista não sabe a altura). */
  readonly midi: number;
  /** Ligado (hammer-on / pull-off): pode soar sem novo ataque. */
  readonly hopo: boolean;
  /** Duração da cauda (s); 0 = nota curta. */
  readonly sustain: number;
  /** Andamento quando a nota foi gerada (para a janela de acerto). */
  readonly bpm: number;
}

export interface FofSongIni {
  readonly name?: string;
  readonly artist?: string;
  readonly delay?: number;
  readonly diffBass?: number;
  readonly diffGuitar?: number;
  readonly [key: string]: string | number | undefined;
}

export interface FofChart {
  readonly meta: FofSongIni;
  readonly lanes: number;
  readonly notes: readonly FofNoteEvent[];
}

/** Janela de acerto (±s): proporcional ao andamento, entre 70 e 120 ms. */
export function fofHitWindow(bpm: number): number {
  return Math.max(0.07, Math.min(0.12, (60 / Math.max(30, bpm)) * 0.2));
}

/** Dentro deste trecho da janela o acerto é "perfeito". */
export const PERFECT_RATIO = 0.4;

/** Lê um song.ini ("chave = valor"; números viram número). */
export function parseSongIni(text: string): FofSongIni {
  const out: Record<string, string | number> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('[') || line.startsWith(';') || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim().toLowerCase();
    const val = line.slice(eq + 1).trim();
    const n = Number(val);
    const camel = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    out[camel] = val !== '' && Number.isFinite(n) ? n : val;
  }
  return out as FofSongIni;
}

const DIFF_BASE: Record<FofDifficulty, number> = { easy: 60, medium: 72, hard: 84, expert: 96 };

/**
 * Notas de um notes.mid (uma dificuldade, 5 trilhas). HOPOs automáticos: nota curta logo depois
 * de outra, em trilha diferente (menos de 1/3 de tempo). Sustentação: nota com mais de meio tempo.
 */
export function chartFromMidi(bytes: Uint8Array, difficulty: FofDifficulty = 'expert', bpm = 120, meta: FofSongIni = {}): FofChart {
  const base = DIFF_BASE[difficulty];
  const beat = 60 / bpm;
  const delay = typeof meta.delay === 'number' ? meta.delay / 1000 : 0;
  const raw = readMidi(bytes)
    .filter((n) => n.midi >= base && n.midi < base + 5)
    .sort((a, b) => a.startSec - b.startSec);
  const notes: FofNoteEvent[] = [];
  let prev: { time: number; lane: number } | null = null;
  raw.forEach((n, i) => {
    const lane = n.midi - base;
    const time = n.startSec + delay;
    // Acordes (duas trilhas no mesmo instante) ficam como notas separadas, nunca HOPO.
    const hopo = !!prev && time - prev.time > 0.005 && time - prev.time < beat / 3 && prev.lane !== lane;
    notes.push({ id: i, time, lane, fret: -1, midi: -1, hopo, sustain: n.durSec > beat / 2 ? n.durSec : 0, bpm });
    prev = { time, lane };
  });
  return { meta, lanes: 5, notes };
}
