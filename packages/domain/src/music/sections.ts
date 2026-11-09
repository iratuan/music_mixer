import type { Chord } from './harmony.js';

/**
 * Mapa da música: partes (Intro, Parte 1, Pré-refrão, Refrão, Ponte, Solo, Outro…) por compasso.
 *
 * Detecção automática, um ponto de partida que o usuário renomeia, divide e junta:
 * - A música é lida em frases de 4 compassos (testando os 4 alinhamentos possíveis, para intros
 *   de 1–3 compassos). Cada compasso vira um perfil harmônico: quanto tempo cada acorde (tônica +
 *   maior/menor) soa nele. Comparar perfis, e não a sequência exata, tolera antecipações e trocas
 *   em tempos diferentes, comuns na harmonia detectada.
 * - Com a energia por compasso (das faixas separadas), frases com e sem voz nunca se juntam.
 * - Nomes: sem voz no começo = Intro, no fim = Outro, no meio = Solo (forte) ou Interlúdio.
 *   Com voz: a parte que volta e tem mais energia é o Refrão; a que vem sempre logo antes dele é
 *   o Pré-refrão; as outras que voltam são Parte 1, Parte 2…; uma parte única depois do primeiro
 *   refrão é a Ponte.
 */
export interface BarHarmony {
  readonly chords: ReadonlyArray<{ readonly chord: Chord | null; readonly beats: number }>;
}

/** Energia do compasso, normalizada na música (0–1): voz e mix inteiro. */
export interface BarEnergy {
  readonly vocal: number;
  readonly total: number;
}

export interface Section {
  /** Primeiro compasso (índice 0). A seção vai até o compasso antes da próxima. */
  readonly startBar: number;
  readonly name: string;
}

export const SECTION_NAMES = ['Intro', 'Parte 1', 'Parte 2', 'Pré-refrão', 'Refrão', 'Ponte', 'Solo', 'Interlúdio', 'Outro'] as const;

const PHRASE = 4;
const SAME = 0.7;
const VOCAL_ON = 0.22;

function barVec(b: BarHarmony): Float64Array {
  const v = new Float64Array(24);
  for (const c of b.chords) {
    if (!c.chord) continue;
    const minor = c.chord.quality.startsWith('m') && !c.chord.quality.startsWith('maj');
    v[((((c.chord.root % 12) + 12) % 12) * 2) + (minor ? 1 : 0)]! += Math.max(0.25, c.beats);
  }
  return v;
}

function cos(a: Float64Array, b: Float64Array): number {
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < a.length; i++) {
    ab += a[i]! * b[i]!;
    aa += a[i]! * a[i]!;
    bb += b[i]! * b[i]!;
  }
  if (aa === 0 && bb === 0) return 1; // dois compassos sem acorde: iguais
  return aa && bb ? ab / Math.sqrt(aa * bb) : 0;
}

interface Phrase {
  start: number;
  len: number;
  vocal: boolean;
  level: number;
}

export function detectSections(bars: readonly BarHarmony[], energy?: readonly BarEnergy[]): Section[] {
  const n = bars.length;
  if (n === 0) return [];
  if (n <= PHRASE) return [{ startBar: 0, name: 'Parte 1' }];
  // Frases de 4; se a música sai picada demais (partes com menos de 8 compassos em média, numa
  // música longa), lê de novo em frases de 8: harmonia que se repete a música toda pede trechos maiores.
  const four = detectWith(bars, energy, PHRASE);
  if (n >= 48 && n / four.length < 8) {
    const eight = detectWith(bars, energy, PHRASE * 2);
    if (eight.length < four.length) return eight;
  }
  return four;
}

function detectWith(bars: readonly BarHarmony[], energy: readonly BarEnergy[] | undefined, PHRASE: number): Section[] {
  const n = bars.length;
  const vec = bars.map(barVec);
  const useEnergy = !!energy && energy.length === n;
  const mean = (from: number, len: number, f: (e: BarEnergy) => number) => {
    let s = 0;
    for (let i = from; i < from + len; i++) s += f(energy![i]!);
    return s / len;
  };
  const phraseSim = (a: Phrase, b: Phrase) => {
    if (a.len !== b.len) return 0;
    if (useEnergy && a.vocal !== b.vocal) return 0;
    let s = 0;
    const ha = new Float64Array(24);
    const hb = new Float64Array(24);
    for (let k = 0; k < a.len; k++) {
      s += cos(vec[a.start + k]!, vec[b.start + k]!);
      for (let d = 0; d < 24; d++) {
        ha[d]! += vec[a.start + k]![d]!;
        hb[d]! += vec[b.start + k]![d]!;
      }
    }
    // Compasso a compasso, ou só a mistura de acordes da frase (tolera deslocamentos de meio compasso).
    return Math.max(s / a.len, cos(ha, hb) * 0.8);
  };

  let pick: { phrases: Phrase[]; cluster: number[]; score: number } | null = null;
  for (let off = 0; off < PHRASE; off++) {
    const phrases: Phrase[] = [];
    const add = (start: number, len: number) =>
      phrases.push({ start, len, vocal: useEnergy ? mean(start, len, (e) => e.vocal) >= VOCAL_ON : true, level: useEnergy ? mean(start, len, (e) => e.total) : 0 });
    if (off > 0) add(0, off);
    for (let s = off; s < n; s += PHRASE) add(s, Math.min(PHRASE, n - s));
    const reps: Phrase[] = [];
    let miss = 0;
    const cluster = phrases.map((p) => {
      let best = -1;
      let bestSim = SAME;
      reps.forEach((r, i) => {
        const sim = phraseSim(r, p);
        if (sim >= bestSim) {
          bestSim = sim;
          best = i;
        }
      });
      if (best < 0) {
        reps.push(p);
        return reps.length - 1;
      }
      miss += 1 - bestSim;
      return best;
    });
    const score = reps.length / phrases.length + (miss / phrases.length) * 0.5 + off * 0.01;
    if (!pick || score < pick.score) pick = { phrases, cluster, score };
  }
  const { phrases, cluster } = pick!;

  // Frases seguidas do mesmo grupo viram uma seção.
  type Run = { start: number; c: number; vocal: boolean; level: number; bars: number };
  const runs: Run[] = [];
  phrases.forEach((p, i) => {
    const last = runs[runs.length - 1];
    if (last && last.c === cluster[i]) {
      last.level = (last.level * last.bars + p.level * p.len) / (last.bars + p.len);
      last.bars += p.len;
    } else runs.push({ start: p.start, c: cluster[i]!, vocal: p.vocal, level: p.level, bars: p.len });
  });

  // Fragmentos: uma frase de 4 compassos que não se repete, entre partes do mesmo tipo (com ou sem
  // voz), junta-se à parte anterior; partes curtas demais não ajudam a ler a música.
  const occurrences = (c: number) => runs.filter((r) => r.c === c).length;
  const hist = (from: number, len: number) => {
    const h = new Float64Array(24);
    for (let i = from; i < from + len; i++) for (let d = 0; d < 24; d++) h[d]! += vec[i]![d]!;
    return h;
  };
  for (let i = 1; i < runs.length - 1; ) {
    const r = runs[i]!;
    const prev = runs[i - 1]!;
    if (r.bars <= PHRASE && occurrences(r.c) === 1 && r.vocal === prev.vocal && cos(hist(r.start, r.bars), hist(prev.start, prev.bars)) >= 0.5) {
      prev.level = (prev.level * prev.bars + r.level * r.bars) / (prev.bars + r.bars);
      prev.bars += r.bars;
      runs.splice(i, 1);
      // Se a seguinte é do mesmo grupo da anterior, une as duas.
      const next = runs[i];
      if (next && next.c === prev.c) {
        prev.bars += next.bars;
        runs.splice(i, 1);
      }
    } else i++;
  }

  const count = new Map<number, number>();
  const level = new Map<number, number>();
  for (const r of runs) {
    count.set(r.c, (count.get(r.c) ?? 0) + 1);
    level.set(r.c, Math.max(level.get(r.c) ?? 0, r.level));
  }
  const repeated = [...new Set(runs.filter((r) => r.vocal && count.get(r.c)! >= 2).map((r) => r.c))];
  // Refrão: com energia, a parte cantada que volta e tem mais energia; sem energia, a que mais volta
  // (empate: a que aparece depois), desde que não abra a música.
  let chorus = -1;
  if (useEnergy) {
    for (const c of repeated) if (chorus < 0 || level.get(c)! > level.get(chorus)! + 0.02) chorus = c;
  } else {
    let best = 1;
    for (const c of repeated) {
      if (c === runs[0]!.c) continue;
      if (count.get(c)! >= best) {
        chorus = c;
        best = count.get(c)!;
      }
    }
    if (chorus < 0 && repeated.length === 1) chorus = repeated[0]!;
  }
  // Pré-refrão: grupo (diferente do refrão) que aparece logo antes do refrão em todas as vezes, ≥ 2.
  let pre = -1;
  if (chorus >= 0) {
    const before = new Map<number, number>();
    runs.forEach((r, i) => {
      if (r.c === chorus && i > 0 && runs[i - 1]!.c !== chorus && runs[i - 1]!.vocal) before.set(runs[i - 1]!.c, (before.get(runs[i - 1]!.c) ?? 0) + 1);
    });
    for (const [c, k] of before) if (k >= 2 && k === count.get(c) && repeated.length > 2) pre = c;
  }
  const levels = runs.map((r) => r.level).sort((a, b) => a - b);
  const medLevel = levels[Math.floor(levels.length / 2)] ?? 0;
  const firstChorus = runs.findIndex((r) => r.c === chorus);
  const names = new Map<number, string>();
  let part = 0;
  const named = runs.map((r, i) => {
    let name: string;
    const once = count.get(r.c) === 1;
    if (useEnergy && !r.vocal) name = i === 0 ? 'Intro' : i === runs.length - 1 ? 'Outro' : r.level >= medLevel ? 'Solo' : 'Interlúdio';
    else if (r.c === chorus) name = 'Refrão';
    else if (r.c === pre) name = 'Pré-refrão';
    else if (once && i === 0) name = 'Intro';
    else if (once && i === runs.length - 1 && runs.length > 2) name = 'Outro';
    else if (once && firstChorus >= 0 && i > firstChorus) name = 'Ponte';
    else {
      if (!names.has(r.c)) names.set(r.c, `Parte ${++part}`);
      name = names.get(r.c)!;
    }
    return { startBar: r.start, name };
  });
  // Partes vizinhas com o mesmo nome viram uma só.
  return named.filter((x, i) => i === 0 || x.name !== named[i - 1]!.name);
}

/**
 * Energia por compasso a partir das amostras (mono) das faixas: RMS de cada compasso,
 * normalizado pelo percentil 95 da música (0–1).
 */
export function barEnergy(bars: ReadonlyArray<{ readonly start: number; readonly end: number }>, samples: Float32Array | null, rate: number): number[] {
  if (!samples) return bars.map(() => 0);
  const rms = bars.map((b) => {
    const a = Math.max(0, Math.floor(b.start * rate));
    const z = Math.min(samples.length, Math.floor(b.end * rate));
    let s = 0;
    let k = 0;
    for (let i = a; i < z; i += 8) {
      s += samples[i]! * samples[i]!;
      k++;
    }
    return k ? Math.sqrt(s / k) : 0;
  });
  const sorted = [...rms].sort((x, y) => x - y);
  const ref = sorted[Math.floor(sorted.length * 0.95)] || 1;
  return rms.map((x) => Math.min(1, x / ref));
}

/** Seções com o intervalo de compassos (inclusivo), em ordem, válidas para `nBars`. */
export function sectionSpans(sections: readonly Section[], nBars: number): Array<{ name: string; from: number; to: number }> {
  const s = normalizeSections(sections, nBars);
  return s.map((x, i) => ({ name: x.name, from: x.startBar, to: (s[i + 1]?.startBar ?? nBars) - 1 }));
}

/** Ordena, tira repetidos e fora do intervalo, e garante que a primeira começa no compasso 0. */
export function normalizeSections(sections: readonly Section[], nBars: number): Section[] {
  const seen = new Set<number>();
  const out = [...sections]
    .filter((x) => Number.isInteger(x.startBar) && x.startBar >= 0 && x.startBar < nBars)
    .sort((a, b) => a.startBar - b.startBar)
    .filter((x) => (seen.has(x.startBar) ? false : (seen.add(x.startBar), true)))
    .map((x) => ({ startBar: x.startBar, name: x.name.trim().slice(0, 40) || 'Parte' }));
  if (nBars > 0 && (out.length === 0 || out[0]!.startBar !== 0)) out.unshift({ startBar: 0, name: out.length ? 'Intro' : 'Parte 1' });
  return out;
}

/** Mapa pronto para exportar: nomes já escritos (acordes no tom escolhido, notas do baixo). */
export interface SongMap {
  readonly title: string;
  readonly key: string;
  readonly bpm: number;
  /** Andamento variável (gravação ao vivo): faixa p5–p95. */
  readonly bpmRange?: readonly [number, number];
  readonly transpose: number;
  readonly sections: ReadonlyArray<{
    readonly name: string;
    readonly from: number;
    readonly to: number;
    readonly bars: ReadonlyArray<{ readonly n: number; readonly chords: readonly string[]; readonly bass: readonly string[] }>;
  }>;
}

/** "112 BPM" ou, com andamento variável, "86–123 BPM (variável)". */
export function bpmLabel(map: Pick<SongMap, 'bpm' | 'bpmRange'>): string {
  if (map.bpmRange) return `${Math.round(map.bpmRange[0])}–${Math.round(map.bpmRange[1])} BPM (variável)`;
  return `${Math.round(map.bpm)} BPM`;
}

/** Texto simples (abre em qualquer lugar): uma linha por seção com os compassos em grade. */
export function songMapText(map: SongMap): string {
  const lines: string[] = [];
  lines.push(map.title);
  lines.push(`Tom: ${map.key} · ${bpmLabel(map)}${map.transpose ? ` · transposto ${map.transpose > 0 ? '+' : ''}${map.transpose}` : ''}`);
  lines.push('');
  for (const s of map.sections) {
    lines.push(`${s.name.toUpperCase()}  (compassos ${s.from + 1}–${s.to + 1})`);
    const cells = s.bars.map((b) => {
      const ch = b.chords.length ? b.chords.join(' ') : '%';
      return `${b.n}: ${ch}${b.bass.length ? ` [${b.bass.join(' ')}]` : ''}`;
    });
    for (let i = 0; i < cells.length; i += 4) lines.push('| ' + cells.slice(i, i + 4).join(' | ') + ' |');
    lines.push('');
  }
  lines.push('Acordes por compasso; entre colchetes, as notas do baixo (estimadas).');
  return lines.join('\r\n');
}
