import { pc, type Chord } from './harmony.js';
import { chordTones } from './piano.js';

/**
 * Violão: escolhe a posição de cada acorde no braço, priorizando a EXECUÇÃO pelo aluno.
 *
 * Critério (menor custo = mais fácil de tocar):
 * - menos dedos, e pestana custa caro (é o que mais trava iniciante);
 * - cordas soltas são de graça; casas altas custam mais;
 * - intervalo entre casas: até 3 casas é natural, 4 pesa, acima de 4 é impossível;
 * - corda muda no meio das tocadas atrapalha a palhetada;
 * - baixo na fundamental (inversão só quando o acorde pede).
 *
 * Modos:
 * - normal: formas nas primeiras casas (aberto ou com pestana perto do 0), o que existe em qualquer livro.
 * - CAGED: formas móveis com a fundamental na 6ª, 5ª ou 4ª corda, perto da zona da mão. Aproximação
 *   do princípio CAGED (a forma é escolhida pela corda da fundamental), não tabela fixa de formas.
 */

/** Afinação padrão em alturas MIDI: índice 0 = 6ª corda (Mi 2), índice 5 = 1ª (Mi 4). */
export const GUITAR_TUNING: readonly number[] = [40, 45, 50, 55, 59, 64];

export type ChordLevel = 'simple' | 'full';
export type GuitarMode = 'normal' | 'caged';

export interface Barre {
  readonly fret: number;
  /** Índices de corda cobertos pela pestana (0 = 6ª). */
  readonly from: number;
  readonly to: number;
}

export interface GuitarVoicing {
  /** Casa por corda (índice 0 = 6ª): null = corda muda, 0 = solta. */
  readonly frets: ReadonlyArray<number | null>;
  /** Dedo por corda: 1 indicador … 4 mínimo; 0 = solta ou muda. */
  readonly fingers: ReadonlyArray<number>;
  readonly barre: Barre | null;
  /** Primeira casa do diagrama: 1 quando cabe no braço de cima (com a pestana do capo); senão, a mais grave tocada. */
  readonly baseFret: number;
  /** Rótulo para o aluno: "aberto", "pestana na 5", "casas 3–6", "raiz na 6ª corda · casa 3". */
  readonly form: string;
  /** Qualidade desenhada (no modo simples pode diferir do acorde da análise). */
  readonly quality: string;
  /** Custo de execução (menor é mais fácil). */
  readonly score: number;
}

/** Modo simples: só tríades e sétima de dominante, o que o iniciante toca sem formas difíceis. */
const SIMPLE: Record<string, string> = { maj7: '', m7: 'm', m7b5: 'm', dim: 'm', sus2: '', sus4: '' };

/** Acorde no nível escolhido. Simples mantém a fundamental e troca a qualidade pela mais próxima tocável. */
export function simplifyChord(chord: Chord, level: ChordLevel): Chord {
  if (level === 'full') return chord;
  const q = SIMPLE[chord.quality];
  return q === undefined ? chord : { ...chord, quality: q };
}

interface Raw {
  readonly frets: ReadonlyArray<number | null>;
  readonly fingers: ReadonlyArray<number>;
  readonly barre: Barre | null;
  /** Índice da corda mais grave que soa. */
  readonly low: number;
  readonly score: number;
}

/** Casas possíveis numa corda: muda, solta (se for nota do acorde) e as casas na janela que tocam uma nota do acorde. */
function options(s: number, tones: ReadonlySet<number>, lo: number, hi: number): Array<number | null> {
  const out: Array<number | null> = [null];
  for (let f = 0; f <= hi; f++) {
    if (f > 0 && f < lo) continue;
    if (tones.has((GUITAR_TUNING[s]! + f) % 12)) out.push(f);
  }
  return out;
}

/** Avalia uma combinação de casas. Devolve null quando não é um acorde tocável. */
function evaluate(frets: ReadonlyArray<number | null>, chord: Chord, tones: readonly number[]): Raw | null {
  const sounded: number[] = [];
  for (let s = 0; s < GUITAR_TUNING.length; s++) if (frets[s] != null) sounded.push(s);
  if (sounded.length < 4) return null;

  const pcs = new Set(sounded.map((s) => (GUITAR_TUNING[s]! + frets[s]!) % 12));
  for (const p of pcs) if (!tones.includes(p)) return null; // nota estranha ao acorde

  // Obrigatórias: fundamental e terça (ou a 2ª/4ª nos sus). Quinta e sétima podem faltar com custo.
  if (!pcs.has(tones[0]!) || !pcs.has(tones[1]!)) return null;
  let score = 0;
  for (const p of tones.slice(2)) if (!pcs.has(p)) score += 3;

  const low = sounded[0]!;
  const bassPc = (GUITAR_TUNING[low]! + frets[low]!) % 12;
  if (chord.bass !== undefined) {
    if (bassPc !== pc(chord.bass)) return null;
  } else if (bassPc !== tones[0]) {
    score += 4;
  }

  const fretted = sounded.map((s) => frets[s]!).filter((f) => f > 0);
  const minF = fretted.length ? Math.min(...fretted) : 0;
  const maxF = fretted.length ? Math.max(...fretted) : 0;
  const span = maxF - minF;
  if (span > 4) return null; // a mão não alcança
  if (span > 3) score += (span - 3) * 4;

  // Pestana: duas ou mais cordas na casa mais grave tocada (um dedo cobre as cordas).
  const atMin = sounded.filter((s) => frets[s] === minF && minF > 0);
  let barre: Barre | null = null;
  if (atMin.length >= 2) {
    barre = { fret: minF, from: atMin[0]!, to: atMin[atMin.length - 1]! };
    score += 4;
    for (let s = barre.from; s <= barre.to; s++) if (frets[s] !== minF) score += 3;
  }

  // Dedos: a pestana é um dedo só (indicador); cada outra nota pressionada é um dedo, da casa mais grave à mais aguda.
  const barreStrings = barre ? atMin : [];
  const others = sounded.filter((s) => frets[s]! > 0 && !barreStrings.includes(s)).sort((a, b) => frets[a]! - frets[b]! || a - b);
  const need = (barre ? 1 : 0) + others.length;
  if (need > 4) return null;
  const fingers: number[] = GUITAR_TUNING.map(() => 0);
  for (const s of barreStrings) fingers[s] = 1;
  others.forEach((s, i) => (fingers[s] = (barre ? 2 : 1) + i));

  const open = sounded.filter((s) => frets[s] === 0).length;
  score += need * 2 + maxF * 0.5 - open;
  // Corda muda no meio das tocadas.
  const last = sounded[sounded.length - 1]!;
  for (let s = low; s <= last; s++) if (frets[s] == null) score += 3;
  score += GUITAR_TUNING.length - sounded.length;

  return { frets: [...frets], fingers, barre, low, score };
}

/** Todas as formas tocáveis com casas entre lo e hi (soltas sempre permitidas). */
function all(chord: Chord, lo: number, hi: number): Raw[] {
  const tones = chordTones(chord);
  const set = new Set(tones);
  const out: Raw[] = [];
  const cur: Array<number | null> = Array<number | null>(GUITAR_TUNING.length).fill(null);
  const rec = (s: number): void => {
    if (s === GUITAR_TUNING.length) {
      const r = evaluate(cur, chord, tones);
      if (r) out.push(r);
      return;
    }
    for (const f of options(s, set, lo, hi)) {
      cur[s] = f;
      rec(s + 1);
    }
  };
  rec(0);
  return out;
}

function best(pool: readonly Raw[], cost: (r: Raw) => number): Raw | null {
  let b: Raw | null = null;
  let bc = Infinity;
  for (const r of pool) {
    const c = cost(r);
    if (c < bc) {
      bc = c;
      b = r;
    }
  }
  return b;
}

function pickNormal(chord: Chord): Raw | null {
  const first = best(all(chord, 1, 5), (r) => r.score);
  return first ?? best(all(chord, 1, 12), (r) => r.score);
}

function pickCaged(chord: Chord, near: number): Raw | null {
  const root = pc(chord.root);
  // Fundamental no baixo, na 6ª, 5ª ou 4ª corda: são as formas CAGED que se tocam a partir do grave.
  const rootLow = (r: Raw): boolean => r.low <= 2 && (GUITAR_TUNING[r.low]! + r.frets[r.low]!) % 12 === root;
  // Prefere a forma com a raiz dentro da zona da mão (de near-1 a near+3); o resto da forma sobe até near+6.
  const lo = Math.max(0, near - 1);
  const hi = near + 3;
  const inZone = (r: Raw): boolean => rootLow(r) && r.frets[r.low]! >= lo && r.frets[r.low]! <= hi;
  const zone = all(chord, 1, near + 6).filter(inZone);
  if (zone.length) return best(zone, (r) => r.score);
  const any = all(chord, 1, 12).filter(rootLow);
  if (any.length) return best(any, (r) => r.score + 0.6 * Math.abs(r.frets[r.low]! - near));
  return pickNormal(chord);
}

function toVoicing(r: Raw, chord: Chord, caged: boolean): GuitarVoicing {
  const fretted = r.frets.filter((f): f is number => f != null && f > 0);
  const minF = fretted.length ? Math.min(...fretted) : 0;
  const maxF = fretted.length ? Math.max(...fretted) : 0;
  const hasOpen = r.frets.some((f) => f === 0);
  let form: string;
  if (caged) {
    form = `raiz na ${6 - r.low}ª corda · casa ${r.frets[r.low]}`;
    if (r.barre) form += ' · pestana';
  } else if (r.barre) {
    form = `pestana na ${r.barre.fret}`;
  } else if (fretted.length === 0 || hasOpen) {
    form = 'aberto';
  } else {
    form = `casas ${minF}–${maxF}`;
  }
  return {
    frets: r.frets,
    fingers: r.fingers,
    barre: r.barre,
    baseFret: maxF <= 4 ? 1 : minF,
    form,
    quality: chord.quality,
    score: Math.round(r.score * 10) / 10,
  };
}

/**
 * Forma do acorde no violão. `null` quando não há forma tocável (raro: acordes com 4 dedos e intervalo impossível).
 * - mode: 'normal' (primeiras casas) ou 'caged' (formas móveis perto de `near`, a casa da zona da mão).
 * - level: 'simple' (tríades e 7) ou 'full' (as qualidades da análise).
 */
export function guitarVoicing(chord: Chord, opts: { mode?: GuitarMode; level?: ChordLevel; near?: number } = {}): GuitarVoicing | null {
  const shown = simplifyChord(chord, opts.level ?? 'full');
  const caged = opts.mode === 'caged';
  const raw = caged ? pickCaged(shown, opts.near ?? 3) : pickNormal(shown);
  return raw ? toVoicing(raw, shown, caged) : null;
}
