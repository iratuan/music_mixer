import { pc, transposeChord, transposeKey, type Chord, type Key } from './harmony.js';
import { analyzeChord, bassApproach, detectKey, resolution, scaleFor, targetNotes, type ParsedBar } from './harmonicAnalyzer.js';
import { chordSymbol } from './circleOfFifths.js';
import { sectionLetters, nameByForm } from './sections.js';

/**
 * Mapa harmônico (lead sheet): seções, compassos e acordes com tempo de início e duração, e a análise
 * de cada acorde (grau, escala, notas-alvo, condução para o próximo). Puro e serializável (JSON).
 */
export interface MapChord {
  readonly chord: Chord;
  /** Tempo de início dentro do compasso (0 = tempo 1). */
  readonly beat: number;
  readonly beats: number;
}
export interface Measure {
  readonly index: number;
  readonly beats: number;
  readonly chords: readonly MapChord[];
  /** Início e fim na música (s), quando o mapa veio do áudio. */
  readonly start?: number;
  readonly end?: number;
}
export interface MapSection {
  readonly name: string;
  readonly from: number;
  readonly to: number;
  readonly letter?: string;
  readonly repeatOf?: string;
}
export interface HarmonicMapData {
  readonly title: string;
  readonly key: Key;
  readonly bpm: number;
  readonly timeSig: readonly [number, number];
  readonly measures: readonly Measure[];
  readonly sections: readonly MapSection[];
}

export interface ChordInsight {
  readonly roman: string;
  readonly kind: string;
  readonly fn: string | null;
  readonly scale: string;
  readonly targets: ReturnType<typeof targetNotes>;
  /** Condução do baixo até o próximo acorde (null no último). */
  readonly approach: ReturnType<typeof bassApproach> | null;
  /** Resolução forte para o próximo acorde (seta no mapa). */
  readonly resolves: 'dominante' | 'ii-V' | null;
}

/** Análise de cada acorde do mapa, na ordem (compasso, acorde). */
export function analyzeMap(map: HarmonicMapData, flats = false): ChordInsight[][] {
  const flat = map.measures.flatMap((m) => m.chords.map((c) => c.chord));
  let k = 0;
  return map.measures.map((m) =>
    m.chords.map((c) => {
      const next = flat[k + 1] ?? null;
      k++;
      const a = analyzeChord(c.chord, map.key);
      return {
        roman: a.roman,
        kind: a.kind,
        fn: a.fn,
        scale: scaleFor(c.chord, map.key),
        targets: targetNotes(c.chord, flats),
        approach: next ? bassApproach(c.chord, next, map.key, flats) : null,
        resolves: next ? resolution(c.chord, next) : null,
      };
    }),
  );
}

/** Seções automáticas pela repetição de frases de 4 compassos, com nomes de músico. */
export function autoSections(measures: readonly Measure[]): MapSection[] {
  if (!measures.length) return [];
  const spans: Array<{ from: number; to: number }> = [];
  for (let i = 0; i < measures.length; i += 4) spans.push({ from: i, to: Math.min(measures.length - 1, i + 3) });
  const sig = spans.map((s) => measures.slice(s.from, s.to + 1).map((m) => m.chords.map((c) => chordSymbol(c.chord)).join(' ')));
  // Frases iguais seguidas viram uma seção só.
  const merged: Array<{ from: number; to: number; sig: string[] }> = [];
  spans.forEach((s, i) => {
    const prev = merged[merged.length - 1];
    if (prev && prev.sig.join('|') === sig[i]!.join('|') && prev.to - prev.from < 15) prev.to = s.to;
    else merged.push({ ...s, sig: sig[i]! });
  });
  const letters = sectionLetters(merged.map((m) => m.sig));
  const names = nameByForm(merged, letters);
  return merged.map((m, i) => ({
    name: names[i]!,
    from: m.from,
    to: m.to,
    letter: letters[i]!.letter,
    ...(letters[i]!.repeatOf !== null ? { repeatOf: names[letters[i]!.repeatOf!]! } : {}),
  }));
}

/** Mapa a partir de compassos lidos (cifra em texto, cadência do ciclo…), com o tom detectado se não vier. */
export function mapFromBars(title: string, bars: readonly ParsedBar[], opts: { key?: Key; bpm?: number; beatsPerBar?: number } = {}): HarmonicMapData {
  const bpb = opts.beatsPerBar ?? 4;
  const measures: Measure[] = bars.map((b, index) => ({ index, beats: bpb, chords: b.chords.map((c) => ({ chord: c.chord, beat: c.beat, beats: c.beats })) }));
  const key = opts.key ?? detectKey(measures.flatMap((m) => m.chords.map((c) => ({ chord: c.chord, beats: c.beats }))));
  return { title, key, bpm: opts.bpm ?? 90, timeSig: [bpb, 4], measures, sections: autoSections(measures) };
}

/** Mapa transposto: cifras, tom e baixos mudam; graus e forma continuam. */
export function transposeMap(map: HarmonicMapData, semis: number): HarmonicMapData {
  if (!semis) return map;
  return {
    ...map,
    key: transposeKey(map.key, semis),
    measures: map.measures.map((m) => ({ ...m, chords: m.chords.map((c) => ({ ...c, chord: transposeChord(c.chord, semis) })) })),
  };
}

/** Semitons (−6…+6) para ir do tom `from` ao tom `to` pelo caminho mais curto. */
export function semitonesBetween(from: Key, to: Key): number {
  const d = pc(to.tonic - from.tonic);
  return d > 6 ? d - 12 : d;
}

/** Troca um acorde de um compasso (edição manual). */
export function replaceChord(map: HarmonicMapData, measure: number, chordIdx: number, chord: Chord): HarmonicMapData {
  return {
    ...map,
    measures: map.measures.map((m) => (m.index !== measure ? m : { ...m, chords: m.chords.map((c, k) => (k === chordIdx ? { ...c, chord } : c)) })),
  };
}

/** Divide um compasso de um acorde em dois (metade cada); o segundo repete o primeiro até ser editado. */
export function splitMeasure(map: HarmonicMapData, measure: number): HarmonicMapData {
  return {
    ...map,
    measures: map.measures.map((m) => {
      if (m.index !== measure || m.chords.length !== 1) return m;
      const half = m.beats / 2;
      return { ...m, chords: [{ ...m.chords[0]!, beat: 0, beats: half }, { ...m.chords[0]!, beat: half, beats: half }] };
    }),
  };
}

/** Texto do mapa ("| Dm7 / G7 / | Cmaj7 / / / |"), com seções e graus opcionais. */
export function mapText(map: HarmonicMapData, opts: { degrees?: boolean; flats?: boolean } = {}): string {
  const insight = analyzeMap(map, opts.flats);
  const lines: string[] = [`${map.title}`, `Tom: ${chordSymbol({ root: map.key.tonic, quality: map.key.mode === 'minor' ? 'm' : '' }, opts.flats)}${map.key.mode === 'minor' ? ' menor' : ' maior'} · ${map.bpm} BPM · ${map.timeSig[0]}/${map.timeSig[1]}`, ''];
  for (const s of map.sections) {
    lines.push(`[${s.letter ? `${s.letter} · ` : ''}${s.name}]${s.repeatOf ? `  (= ${s.repeatOf})` : ''}`);
    const cells = map.measures.slice(s.from, s.to + 1).map((m) => {
      const parts: string[] = [];
      m.chords.forEach((c, k) => {
        const name = chordSymbol(c.chord, opts.flats) + (opts.degrees ? ` (${insight[m.index]![k]!.roman})` : '');
        parts.push(name, ...Array.from({ length: Math.max(0, Math.round(c.beats) - 1) }, () => '/'));
      });
      return ` ${parts.join(' ')} `;
    });
    for (let i = 0; i < cells.length; i += 4) lines.push(`|${cells.slice(i, i + 4).join('|')}|`);
    lines.push('');
  }
  return lines.join('\r\n');
}
