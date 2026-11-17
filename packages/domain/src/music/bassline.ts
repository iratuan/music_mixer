import { pc, type Chord } from './harmony.js';
import { positionsOf, type BassTuning, type FretPos } from '../practice/bass.js';

/**
 * Linha de baixo do acompanhamento: onde tocar cada nota do acorde no braço.
 *
 * Regras (obrigatórias):
 * - REGIÃO CONFORTÁVEL: para cada acorde a mão fica numa zona (indicador na casa `zone`, um dedo
 *   por casa até `zone + 3`; no máximo uma casa de abertura para cada lado). Todas as notas do
 *   acorde — fundamental, terça, quinta, sétima, oitava e aproximação — são tocadas ali.
 * - SEM CORDA SOLTA: nenhuma nota usa a casa 0. A nota que seria solta é tocada na 5ª casa da
 *   corda de cima (Lá solto → corda Mi, casa 5). Só o Mi grave do 4 cordas não tem corda de cima:
 *   ele sobe uma oitava (corda Ré, casa 2).
 * - FORMAS CLÁSSICAS: a fundamental fica nas cordas graves (Mi, Lá; Si no 5 cordas) e o resto do
 *   acorde sai das formas de sempre (terça na corda de cima, quinta duas casas à frente na corda de
 *   cima, oitava duas cordas acima), escolhidas pelo menor esforço da mão.
 * - A mão anda pouco: entre acordes, a zona muda o mínimo possível.
 */
export type BassTone = 'R' | '3' | '5' | '7' | '8' | '5b' | '6';

export interface PlacedNote {
  readonly midi: number;
  readonly pos: FretPos;
}

export interface BassShape {
  /** Casa do indicador. */
  readonly zone: number;
  readonly root: PlacedNote;
  readonly tones: Readonly<Record<BassTone, PlacedNote>>;
}

/** Região do braço: automática (casas 1–7, perto da anterior) ou a casa do indicador escolhida. */
export type BassRegion = 'auto' | number;

export const BASS_REGIONS: ReadonlyArray<{ readonly id: BassRegion; readonly label: string }> = [
  { id: 'auto', label: 'Automática (casas 1–7)' },
  { id: 1, label: 'Casas 1–4' },
  { id: 3, label: 'Casas 3–6' },
  { id: 5, label: 'Casas 5–8' },
  { id: 7, label: 'Casas 7–10' },
  { id: 9, label: 'Casas 9–12' },
];

/** Intervalo (semitons) de cada nota do acorde a partir da fundamental. */
export function toneIntervals(quality: string): Record<Exclude<BassTone, 'R' | '8' | '5b'>, number> & { has7: boolean } {
  const q = quality;
  const third = q === 'sus2' ? 2 : q === 'sus4' ? 5 : q.startsWith('m') && !q.startsWith('maj') ? 3 : q === 'dim' ? 3 : 4;
  const fifth = q === 'dim' || q === 'm7b5' ? 6 : q === 'aug' ? 8 : 7;
  const seventh = q === 'maj7' ? 11 : q === '7' || q === 'm7' || q === 'm7b5' ? 10 : q === 'dim' ? 9 : -1;
  const sixth = 9;
  return { '3': third, '5': fifth, '7': seventh >= 0 ? seventh : 12, '6': sixth, has7: seventh >= 0 };
}

const inWindow = (fret: number, zone: number) => fret >= Math.max(1, zone - 1) && fret <= zone + 4;

/** Custo de uma posição na zona: fora dos 4 dedos custa (abertura), corda longe da referência custa. */
function posCost(p: FretPos, zone: number, refString: number): number {
  const stretch = p.fret < zone ? zone - p.fret : p.fret > zone + 3 ? p.fret - zone - 3 : 0;
  return stretch * 0.7 + Math.abs(p.string - refString) * 0.15 + (p.fret === zone + 3 ? 0.05 : 0);
}

/**
 * Melhor posição (sem corda solta) para a altura dentro da zona. Tenta a altura pedida e, se ela
 * não cabe, as oitavas vizinhas na ordem dada. null se nada cabe na janela da mão.
 */
export function placeInZone(midi: number, tuning: BassTuning, zone: number, refString: number, octaves: readonly number[] = [0, -12, 12]): PlacedNote | null {
  for (const o of octaves) {
    const m = midi + o;
    let best: FretPos | null = null;
    let bestCost = Infinity;
    for (const p of positionsOf(m, tuning)) {
      if (p.fret === 0 || !inWindow(p.fret, zone)) continue;
      const c = posCost(p, zone, refString);
      if (c < bestCost) {
        bestCost = c;
        best = p;
      }
    }
    if (best) return { midi: m, pos: best };
  }
  return null;
}

/**
 * Posição de uma nota sem corda solta, fora de qualquer zona: a casa 0 vira a 5ª casa da corda de
 * cima; sem corda de cima (Mi grave do 4 cordas), a nota sobe uma oitava.
 */
export function noOpenString(midi: number, tuning: BassTuning): PlacedNote | null {
  const fretted = positionsOf(midi, tuning).filter((p) => p.fret > 0);
  if (fretted.length) {
    // A mais baixa no braço (a "5ª casa da corda de cima" quando a nota seria solta).
    const p = fretted.reduce((a, b) => (b.fret < a.fret ? b : a));
    return { midi, pos: p };
  }
  const up = positionsOf(midi + 12, tuning).filter((p) => p.fret > 0);
  return up.length ? { midi: midi + 12, pos: up.reduce((a, b) => (b.fret < a.fret ? b : a)) } : null;
}

function regionCost(zone: number, region: BassRegion): number {
  if (region === 'auto') return (zone > 7 ? (zone - 7) * 0.6 : 0) + zone * 0.04;
  const d = Math.abs(zone - region);
  return d * 0.8 + (d > 1 ? 3 : 0);
}

/** Notas do acorde que a forma precisa ter (a sétima só nos acordes com sétima). */
const SHAPE_TONES: readonly BassTone[] = ['3', '5', '8'];

/**
 * Forma do acorde no baixo: escolhe a fundamental (ou a nota do baixo, em C/E) e a zona da mão,
 * e coloca o resto das notas nessa zona. `prevZone` mantém a mão perto do acorde anterior.
 */
export function bassShape(chord: Chord, tuning: BassTuning, prevZone: number | null, region: BassRegion = 'auto'): BassShape {
  const bassPc = pc(chord.bass ?? chord.root);
  const rootPc = pc(chord.root);
  const iv = toneIntervals(chord.quality);
  // Fundamental em qualquer corda menos a mais aguda (as graves custam menos: ver o custo por corda).
  const lowStrings = Math.max(1, tuning.strings.length - 1);
  let best: { cost: number; shape: BassShape } | null = null;
  for (let s = 0; s < lowStrings; s++) {
    for (let f = 1; f <= Math.min(12, tuning.frets - 4); f++) {
      if (pc(tuning.strings[s]! + f) !== bassPc) continue;
      const rootMidi = tuning.strings[s]! + f;
      for (let zone = Math.max(1, f - 3); zone <= f; zone++) {
        const at = (interval: number, octaves?: readonly number[]) => placeInZone(rootMidi + interval, tuning, zone, s + 1, octaves);
        // Notas do acorde a partir da fundamental do ACORDE (na inversão, a nota do baixo é outra).
        const rel = (x: number) => (((rootPc + x - bassPc) % 12) + 12) % 12;
        const third = at(rel(iv['3']) || 12);
        const fifth = at(rel(iv['5']) || 12, [0, -12, 12]);
        const seventh = at(rel(iv['7']) || 12);
        const octave = at(12, [12, 0]);
        const sixth = at(rel(iv['6']) || 12);
        const fifthBelow = placeInZone(rootMidi + rel(iv['5']) - 12, tuning, zone, s - 1, [0, 12]);
        let cost = regionCost(zone, region) + s * 0.5 + (prevZone === null ? 0 : Math.abs(zone - prevZone) * 0.4 + (zone !== prevZone ? 0.6 : 0));
        // Dedo da fundamental: indicador ou médio são as formas clássicas.
        cost += f - zone >= 2 ? 0.3 : 0;
        const placed: Record<string, PlacedNote | null> = { '3': third, '5': fifth, '8': octave };
        for (const t of SHAPE_TONES) {
          const p = placed[t];
          cost += p ? posCost(p.pos, zone, s + 1) : 3;
        }
        if (iv.has7) cost += seventh ? posCost(seventh.pos, zone, s + 1) : 2;
        if (best && cost >= best.cost) continue;
        const root: PlacedNote = { midi: rootMidi, pos: { string: s, fret: f } };
        const fill = (p: PlacedNote | null) => p ?? root;
        best = {
          cost,
          shape: {
            zone,
            root,
            tones: { R: root, '3': fill(third), '5': fill(fifth), '7': fill(iv.has7 ? seventh : octave), '8': fill(octave), '5b': fill(fifthBelow ?? fifth), '6': fill(sixth) },
          },
        };
      }
    }
  }
  if (best) return best.shape;
  // Sem posição nas cordas graves (afinação estranha): a nota mais baixa sem corda solta.
  const any = noOpenString(28 + ((bassPc - 4 + 12) % 12), tuning)!;
  const zone = Math.max(1, any.pos.fret - 1);
  return { zone, root: any, tones: { R: any, '3': any, '5': any, '7': any, '8': any, '5b': any, '6': any } };
}

/** Nota de aproximação cromática (meio tom abaixo, ou acima) do alvo, tocada na zona atual. */
export function approachNote(targetMidi: number, tuning: BassTuning, zone: number, refString: number): PlacedNote | null {
  // Primeiro na mesma oitava do alvo (meio tom abaixo, depois acima); só então em outra oitava.
  for (const o of [0, 12, -12]) {
    const p = placeInZone(targetMidi - 1 + o, tuning, zone, refString, [0]) ?? placeInZone(targetMidi + 1 + o, tuning, zone, refString, [0]);
    if (p) return p;
  }
  return null;
}

/** Dedo da mão esquerda (1 indicador … 4 mínimo) na zona; abertura para trás = 1, para frente = 4. */
export function fingerInZone(fret: number, zone: number): number {
  return Math.max(1, Math.min(4, fret - zone + 1));
}
