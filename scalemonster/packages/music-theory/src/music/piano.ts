import type { Chord } from './harmony.js';

/**
 * Piano: divide as notas de um compasso entre as mãos, priorizando o ACORDE BASE na mão esquerda
 * e o ARPEJO na mão direita.
 *
 * - Ponto de divisão: o maior intervalo vazio entre as alturas do compasso, entre Sol 2 e Sol 4;
 *   sem intervalo claro, Dó central.
 * - Mão esquerda: as notas do acorde (fundamental, terça, quinta, sétima) contam como "base"; as
 *   outras ficam como "extra" (muitas vezes vazamento da separação ou harmônicos).
 * - Sem nada na mão esquerda e com acorde conhecido: sugere o acorde em posição fundamental, perto
 *   de Dó 3 ("sugestão", não foi tocado).
 * - Mão direita: as notas na ordem em que aparecem no compasso (o arpejo), numeradas.
 */
export interface PianoNoteIn {
  readonly midi: number;
  readonly startSec: number;
  readonly durSec: number;
}

export type HandRole = 'base' | 'extra' | 'suggest' | 'arp';

export interface HandNote {
  readonly midi: number;
  readonly hand: 'L' | 'R';
  readonly role: HandRole;
  /** Mão direita: ordem da nota no arpejo (1, 2, 3…), pela primeira vez que soa no compasso. */
  readonly order?: number;
  /** Índice na lista de entrada (ausente nas sugestões). */
  readonly src?: number;
}

const SHAPES: Record<string, readonly number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '7': [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  m7b5: [0, 3, 6, 10],
};

/** Classes de altura (0–11) do acorde. */
export function chordTones(chord: Chord): number[] {
  const shape = SHAPES[chord.quality] ?? (chord.quality.startsWith('m') && !chord.quality.startsWith('maj') ? SHAPES.m! : SHAPES['']!);
  return shape.map((i) => (((chord.root + i) % 12) + 12) % 12);
}

const SPLIT_MIN = 43; // Sol 2
const SPLIT_MAX = 67; // Sol 4
const MIDDLE_C = 60;

/** Altura que separa as mãos (notas abaixo dela vão para a esquerda). */
export function handSplit(midis: readonly number[]): number {
  const u = [...new Set(midis)].sort((a, b) => a - b);
  let best = 0;
  let split = MIDDLE_C;
  for (let i = 1; i < u.length; i++) {
    const lo = u[i - 1]!;
    const hi = u[i]!;
    const gap = hi - lo;
    const mid = Math.ceil((lo + hi) / 2);
    if (gap >= 3 && gap > best && mid >= SPLIT_MIN && mid <= SPLIT_MAX) {
      best = gap;
      split = hi;
    }
  }
  return split;
}

export function splitHands(notes: readonly PianoNoteIn[], chord: Chord | null): HandNote[] {
  const split = handSplit(notes.map((n) => n.midi));
  const tones = chord ? new Set(chordTones(chord)) : null;
  const out: HandNote[] = [];
  let leftBase = 0;
  notes.forEach((n, i) => {
    if (n.midi < split) {
      const base = !tones || tones.has(((n.midi % 12) + 12) % 12);
      if (base) leftBase++;
      out.push({ midi: n.midi, hand: 'L', role: base ? 'base' : 'extra', src: i });
    }
  });
  // Arpejo: ordem pela primeira vez que cada altura soa.
  const right = notes.map((n, i) => ({ n, i })).filter(({ n }) => n.midi >= split);
  const firstAt = new Map<number, number>();
  for (const { n } of right) firstAt.set(n.midi, Math.min(firstAt.get(n.midi) ?? Infinity, n.startSec));
  const order = new Map([...firstAt.entries()].sort((a, b) => a[1] - b[1] || a[0] - b[0]).map(([m], k) => [m, k + 1]));
  for (const { n, i } of right) out.push({ midi: n.midi, hand: 'R', role: 'arp', order: order.get(n.midi)!, src: i });
  if (leftBase === 0 && chord) {
    // Acorde base sugerido: posição fundamental com a tônica entre Dó 3 e Si 3, abaixo do ponto de divisão.
    let root = 48 + ((((chord.root % 12) + 12) % 12));
    const shape = SHAPES[chord.quality] ?? SHAPES['']!;
    while (root + shape[Math.min(2, shape.length - 1)]! >= split && root - 12 >= 36) root -= 12;
    for (const iv of shape.slice(0, 3)) out.push({ midi: root + iv, hand: 'L', role: 'suggest' });
  }
  return out;
}

/**
 * Piano guiado pela HARMONIA: a partir do acorde (análise), monta as duas mãos.
 * - Esquerda (acorde base): fundamental entre Mi 2 e Ré# 3, quinta e oitava.
 * - Direita (arpejo): as notas do acorde em posição fechada entre Dó 4 e Mi 5, na inversão mais
 *   próxima da mão direita anterior (condução de vozes: a mão anda o mínimo).
 */
export interface PianoVoicing {
  readonly left: readonly number[];
  readonly right: readonly number[];
}

const RH_LOW = 60;
const RH_HIGH = 76;

/** Todas as inversões em posição fechada com a nota mais grave dentro da região da mão direita. */
function closedVoicings(tones: readonly number[]): number[][] {
  const out: number[][] = [];
  for (let bottom = RH_LOW - 3; bottom <= RH_LOW + 9; bottom++) {
    if (!tones.includes(bottom % 12)) continue;
    const v = [bottom];
    let cur = bottom;
    for (let k = 1; k < tones.length; k++) {
      cur++;
      while (!tones.includes(cur % 12) || v.some((x) => x % 12 === cur % 12)) cur++;
      v.push(cur);
    }
    if (v[v.length - 1]! <= RH_HIGH + 2) out.push(v);
  }
  return out;
}

function distance(a: readonly number[], b: readonly number[]): number {
  // Soma do deslocamento entre as vozes pareadas pela ordem (mesmo número de notas) ou pelo centro.
  if (a.length === b.length) return a.reduce((s, x, i) => s + Math.abs(x - b[i]!), 0);
  const ca = a.reduce((s, x) => s + x, 0) / a.length;
  const cb = b.reduce((s, x) => s + x, 0) / b.length;
  return Math.abs(ca - cb) * Math.max(a.length, b.length);
}

export function pianoVoicing(chord: Chord, prevRight: readonly number[] | null = null): PianoVoicing {
  const tones = chordTones(chord);
  const r = (((chord.root % 12) + 12) % 12);
  const root = r >= 4 ? 36 + r : 48 + r; // Mi 2 … Ré# 3
  // Inversão (C/E): a esquerda toca a nota do baixo e a oitava; senão fundamental, quinta e oitava.
  const b = chord.bass !== undefined ? (((chord.bass % 12) + 12) % 12) : r;
  const bassNote = b >= 4 ? 36 + b : 48 + b;
  const left = b !== r ? [bassNote, bassNote + 12] : [root, root + 7, root + 12];
  const options = closedVoicings(tones);
  let right = options[0] ?? tones.map((t) => RH_LOW + t);
  if (prevRight && prevRight.length) {
    let best = Infinity;
    for (const v of options) {
      const d = distance(v, prevRight);
      if (d < best) {
        best = d;
        right = v;
      }
    }
  } else {
    // Sem anterior: a inversão mais perto do centro da região (Sol 4).
    right = options.reduce((a, v) => (Math.abs(v[0]! - 64) < Math.abs(a[0]! - 64) ? v : a), right);
  }
  return { left, right };
}

/** Voicings da música inteira, encadeados (cada um conduzido a partir do anterior). */
export function voiceChords(chords: ReadonlyArray<Chord | null>): Array<PianoVoicing | null> {
  let prev: readonly number[] | null = null;
  return chords.map((c) => {
    if (!c) return null;
    const v = pianoVoicing(c, prev);
    prev = v.right;
    return v;
  });
}
