/**
 * Baixo: afinações e digitação de uma linha de notas.
 * Convenção: corda 0 = a mais grave (como no braço visto de frente, de baixo para cima).
 */
export interface BassTuning {
  readonly id: string;
  readonly label: string;
  /** Altura MIDI das cordas soltas, da mais grave para a mais aguda. */
  readonly strings: readonly number[];
  readonly frets: number;
}

export const BASS_TUNINGS: readonly BassTuning[] = [
  { id: 'b4', label: '4 cordas (E A D G)', strings: [28, 33, 38, 43], frets: 20 },
  { id: 'b5', label: '5 cordas (B E A D G)', strings: [23, 28, 33, 38, 43], frets: 24 },
  { id: 'b6', label: '6 cordas (B E A D G C)', strings: [23, 28, 33, 38, 43, 48], frets: 24 },
];

export interface FretPos {
  readonly string: number;
  readonly fret: number;
}

/** Todas as posições (corda, casa) que produzem a altura. */
export function positionsOf(midi: number, tuning: BassTuning): FretPos[] {
  const out: FretPos[] = [];
  tuning.strings.forEach((open, s) => {
    const f = midi - open;
    if (f >= 0 && f <= tuning.frets) out.push({ string: s, fret: f });
  });
  return out;
}

/**
 * Digitação por ZONA do braço (conforto em primeiro lugar). A mão esquerda fica numa posição:
 * o indicador na casa `zone` e os outros dedos nas três seguintes (um dedo por casa). Enquanto as
 * notas cabem na zona, a mão não se move; trocar de zona (shift) é caro, ainda mais no meio de uma
 * frase. Cordas soltas são evitadas (ver FingerOptions); quando usadas, cabem em qualquer zona. Zonas altas (acima da casa 9) custam um pouco mais.
 */
export interface FingeredNote {
  readonly pos: FretPos;
  /** Casa do indicador: a zona cobre `zone` … `zone + 3`. */
  readonly zone: number;
}

const ZONE_SPAN = 4;

function zonePlaceCost(zone: number): number {
  return zone * 0.03 + (zone > 9 ? (zone - 9) * 0.3 : 0);
}

/** Custo da troca de zona; uma pausa longa antes da nota (gap, em s) dá tempo de mudar a mão. */
function shiftCost(from: number, to: number, gap: number): number {
  if (from === to) return 0;
  const d = Math.abs(to - from);
  const relief = gap >= 0.6 ? 0.35 : gap >= 0.3 ? 0.65 : 1;
  return (3 + d * 0.6) * relief;
}

function stringCost(a: number, b: number): number {
  const d = Math.abs(b - a);
  return d * 0.2 + (d > 1 ? 0.3 : 0);
}

/**
 * Digitação de uma linha monofônica por programação dinâmica (Viterbi) sobre (posição, zona da
 * mão). `starts` (instante de cada nota, em s) é opcional: com ele, pausas facilitam a troca de zona.
 * Notas fora do alcance do instrumento ficam null e quebram a linha em trechos independentes.
 */
export interface FingerOptions {
  /**
   * Corda solta: por padrão é evitada (som menos controlado, difícil de abafar e sem vibrato).
   * Só aparece quando a nota não existe presa (Mi grave no 4 cordas). true: permitida e levemente preferida.
   */
  readonly openStrings?: boolean;
}

/** Custo da corda solta quando evitada: mais caro que qualquer troca de zona razoável. */
const OPEN_AVOID_COST = 25;

export function fingerZones(
  midis: readonly number[],
  tuning: BassTuning,
  starts?: readonly number[],
  opts: FingerOptions = {},
): Array<FingeredNote | null> {
  const openCost = opts.openStrings ? -0.05 : OPEN_AVOID_COST;
  const maxZone = Math.max(1, tuning.frets - ZONE_SPAN + 1);
  const out: Array<FingeredNote | null> = new Array(midis.length).fill(null);
  let i = 0;
  while (i < midis.length) {
    if (positionsOf(midis[i]!, tuning).length === 0) {
      i++;
      continue;
    }
    let j = i;
    while (j < midis.length && positionsOf(midis[j]!, tuning).length > 0) j++;
    type State = { pos: FretPos; zone: number; cost: number; back: number };
    const layers: State[][] = [];
    for (let k = i; k < j; k++) {
      const prev = layers[layers.length - 1];
      const gap = starts && k > 0 ? starts[k]! - starts[k - 1]! : 0;
      const layer: State[] = [];
      for (const pos of positionsOf(midis[k]!, tuning)) {
        let zones: number[];
        if (pos.fret === 0) zones = prev ? [...new Set(prev.map((p) => p.zone))] : [1];
        else {
          zones = [];
          for (let z = Math.max(1, pos.fret - ZONE_SPAN + 1); z <= Math.min(pos.fret, maxZone); z++) zones.push(z);
        }
        for (const zone of zones) {
          // Mindinho (4ª casa da zona) um pouco menos confortável; corda solta evitada (ou, se permitida, levemente preferida).
          const local = zonePlaceCost(zone) + (pos.fret === zone + 3 ? 0.08 : 0) + (pos.fret === 0 ? openCost : 0);
          if (!prev) {
            layer.push({ pos, zone, cost: local, back: -1 });
            continue;
          }
          let best = Infinity;
          let arg = 0;
          prev.forEach((p, pi) => {
            const v = p.cost + shiftCost(p.zone, zone, gap) + stringCost(p.pos.string, pos.string);
            if (v < best) {
              best = v;
              arg = pi;
            }
          });
          layer.push({ pos, zone, cost: best + local, back: arg });
        }
      }
      layers.push(layer);
    }
    const last = layers[layers.length - 1]!;
    let idx = 0;
    last.forEach((st, si) => {
      if (st.cost < last[idx]!.cost) idx = si;
    });
    for (let k = j - 1; k >= i; k--) {
      const st = layers[k - i]![idx]!;
      out[k] = { pos: st.pos, zone: st.zone };
      idx = st.back;
    }
    i = j;
  }
  return out;
}

/** Só as posições (compatível com o uso anterior). */
export function fingerLine(midis: readonly number[], tuning: BassTuning, starts?: readonly number[], opts?: FingerOptions): Array<FretPos | null> {
  return fingerZones(midis, tuning, starts, opts).map((x) => x?.pos ?? null);
}
