/**
 * Mapa da música no processo principal: validação do que vem do renderer (seções e mapa) e o HTML
 * do PDF. Puro, sem Electron: testável.
 */
export interface StoredSection {
  readonly startBar: number;
  readonly name: string;
}

/** Nota da tablatura do baixo: corda (0 = a mais grave), casa e posição no compasso (0–1). */
export interface TabNote {
  readonly s: number;
  readonly f: number;
  readonly x: number;
}

/** Forma de acorde do violão: casa por corda (6ª → 1ª; null = muda) e a primeira casa do desenho. */
export interface ChordShape {
  readonly name: string;
  readonly frets: ReadonlyArray<number | null>;
  readonly base: number;
}

export interface MapInput {
  readonly title: string;
  readonly key: string;
  readonly bpm: number;
  readonly bpmRange?: readonly [number, number];
  readonly transpose: number;
  /** Cordas do baixo da tablatura, da mais grave para a mais aguda (E A D G). */
  readonly strings?: readonly string[];
  /** Levada do baixo usada na tablatura (texto para o cabeçalho). */
  readonly bassStyle?: string;
  readonly shapes?: readonly ChordShape[];
  readonly sections: ReadonlyArray<{
    readonly name: string;
    readonly from: number;
    readonly to: number;
    /** Letra da forma (A, B, C…): partes com os mesmos acordes têm a mesma letra. */
    readonly letter?: string;
    /** Nome da parte que esta repete. */
    readonly repeatOf?: string;
    readonly bars: ReadonlyArray<{ readonly n: number; readonly chords: readonly string[]; readonly bass: readonly string[]; readonly tab?: readonly TabNote[] }>;
  }>;
}

const MAX_SECTIONS = 300;
const MAX_BARS = 4000;

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');
const int = (v: unknown, lo: number, hi: number): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : null);

export function sanitizeSections(input: unknown): StoredSection[] {
  if (!Array.isArray(input)) throw new Error('seções inválidas');
  if (input.length > MAX_SECTIONS) throw new Error('seções demais');
  const out: StoredSection[] = [];
  for (const x of input) {
    const o = (x ?? {}) as { startBar?: unknown; name?: unknown };
    const startBar = int(o.startBar, 0, MAX_BARS);
    const name = str(o.name, 40);
    if (startBar === null || !name) throw new Error('seção inválida');
    out.push({ startBar, name });
  }
  return out;
}

/** Faixa de andamento [mín, máx] em BPM, ou nada. */
export function validRange(v: unknown): [number, number] | undefined {
  if (!Array.isArray(v) || v.length !== 2) return undefined;
  const [a, b] = v as unknown[];
  if (typeof a !== 'number' || typeof b !== 'number' || !Number.isFinite(a) || !Number.isFinite(b)) return undefined;
  if (a < 20 || b > 400 || a > b) return undefined;
  return [Math.round(a * 10) / 10, Math.round(b * 10) / 10];
}

export function sanitizeMap(input: unknown): MapInput {
  const o = (input ?? {}) as Record<string, unknown>;
  const bpm = typeof o.bpm === 'number' && Number.isFinite(o.bpm) && o.bpm > 0 && o.bpm < 1000 ? o.bpm : 0;
  const transpose = int(o.transpose, -12, 12) ?? 0;
  const bpmRange = validRange(o.bpmRange);
  if (!Array.isArray(o.sections) || o.sections.length > MAX_SECTIONS) throw new Error('mapa inválido');
  let total = 0;
  const sections = o.sections.map((s) => {
    const x = (s ?? {}) as Record<string, unknown>;
    if (!Array.isArray(x.bars)) throw new Error('mapa inválido');
    total += x.bars.length;
    if (total > MAX_BARS) throw new Error('mapa grande demais');
    return {
      name: str(x.name, 40) || 'Parte',
      from: int(x.from, 0, MAX_BARS) ?? 0,
      to: int(x.to, 0, MAX_BARS) ?? 0,
      bars: x.bars.map((b) => {
        const y = (b ?? {}) as Record<string, unknown>;
        const list = (v: unknown) => (Array.isArray(v) ? v.slice(0, 16).map((c) => str(c, 16)).filter(Boolean) : []);
        const tab = sanitizeTab(y.tab);
        return { n: int(y.n, 1, MAX_BARS + 1) ?? 0, chords: list(y.chords), bass: list(y.bass), ...(tab.length ? { tab } : {}) };
      }),
      ...(str(x.letter, 2) ? { letter: str(x.letter, 2) } : {}),
      ...(str(x.repeatOf, 40) ? { repeatOf: str(x.repeatOf, 40) } : {}),
    };
  });
  const strings = Array.isArray(o.strings) ? o.strings.slice(0, 6).map((v) => str(v, 3)).filter(Boolean) : [];
  const shapes = sanitizeShapes(o.shapes);
  const bassStyle = str(o.bassStyle, 80);
  return {
    title: str(o.title, 200) || 'Música',
    key: str(o.key, 40),
    bpm,
    ...(bpmRange ? { bpmRange } : {}),
    transpose,
    ...(strings.length >= 4 ? { strings } : {}),
    ...(bassStyle ? { bassStyle } : {}),
    ...(shapes.length ? { shapes } : {}),
    sections,
  };
}

function sanitizeTab(v: unknown): TabNote[] {
  if (!Array.isArray(v)) return [];
  const out: TabNote[] = [];
  for (const t of v.slice(0, 24)) {
    const o = (t ?? {}) as Record<string, unknown>;
    const st = int(o.s, 0, 5);
    const f = int(o.f, 0, 24);
    const x = typeof o.x === 'number' && Number.isFinite(o.x) ? Math.min(1, Math.max(0, o.x)) : null;
    if (st !== null && f !== null && x !== null) out.push({ s: st, f, x });
  }
  return out;
}

function sanitizeShapes(v: unknown): ChordShape[] {
  if (!Array.isArray(v)) return [];
  const out: ChordShape[] = [];
  for (const x of v.slice(0, 48)) {
    const o = (x ?? {}) as Record<string, unknown>;
    const name = str(o.name, 16);
    if (!name || !Array.isArray(o.frets) || o.frets.length !== 6) continue;
    const frets = o.frets.map((f) => (f === null ? null : int(f, 0, 24)));
    if (frets.some((f, i) => f === null && (o.frets as unknown[])[i] !== null)) continue;
    out.push({ name, frets, base: int(o.base, 1, 24) ?? 1 });
  }
  return out;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Tablatura de um compasso em SVG: linhas das cordas (aguda em cima) e as casas na posição do tempo. */
function tabSvg(tab: readonly TabNote[], strings: readonly string[]): string {
  const n = strings.length;
  const gap = 7;
  const top = 5;
  const W = 160;
  const H = top * 2 + (n - 1) * gap;
  const y = (st: number) => top + (n - 1 - st) * gap;
  const lines = strings.map((_, st) => `<line x1="0" x2="${W}" y1="${y(st)}" y2="${y(st)}"/>`).join('');
  const notes = tab
    .map((t) => {
      const x = 11 + t.x * (W - 20);
      return `<rect x="${(x - 4.5).toFixed(1)}" y="${y(t.s) - 3.6}" width="9" height="7.2" rx="1.5"/><text x="${x.toFixed(1)}" y="${y(t.s) + 2.5}">${t.f}</text>`;
    })
    .join('');
  return `<svg class="tab" viewBox="0 0 ${W} ${H}" aria-hidden="true"><g class="tl">${lines}</g><g class="tn">${notes}</g></svg>`;
}

/** Diagrama de acorde do violão (6 cordas × 4 casas). */
function shapeSvg(sh: ChordShape): string {
  const W = 62;
  const left = 8;
  const top = 16;
  const sw = 9;
  const fh = 11;
  const strings = sh.frets
    .map((_, i) => `<line x1="${left + i * sw}" x2="${left + i * sw}" y1="${top}" y2="${top + 4 * fh}"/>`)
    .join('');
  const frets = [0, 1, 2, 3, 4].map((k) => `<line x1="${left}" x2="${left + 5 * sw}" y1="${top + k * fh}" y2="${top + k * fh}"${k === 0 && sh.base === 1 ? ' class="nut"' : ''}/>`).join('');
  const marks = sh.frets
    .map((f, i) => {
      const x = left + i * sw;
      if (f === null) return `<text x="${x}" y="${top - 4}" class="mk">×</text>`;
      if (f === 0) return `<circle cx="${x}" cy="${top - 6}" r="2.6" class="open"/>`;
      const row = f - sh.base;
      return row >= 0 && row < 4 ? `<circle cx="${x}" cy="${top + row * fh + fh / 2}" r="3.4"/>` : '';
    })
    .join('');
  const base = sh.base > 1 ? `<text x="${left + 5 * sw + 3}" y="${top + fh / 2 + 3}" class="bf">${sh.base}</text>` : '';
  return `<figure class="shape"><svg viewBox="0 0 ${W} ${top + 4 * fh + 4}" aria-hidden="true">${strings}${frets}${marks}${base}</svg><figcaption>${esc(sh.name)}</figcaption></figure>`;
}

/**
 * HTML A4 (sem scripts nem recursos externos) para virar PDF: cabeçalho com tom, andamento e levada;
 * partes com letra (A, B…) e repetições; compassos em grade de 4 com os acordes, a tablatura do
 * baixo e as notas da gravação; no fim, as formas dos acordes no violão.
 */
export function songMapHtml(map: MapInput): string {
  const strings = map.strings ?? [];
  const hasTab = strings.length >= 4 && map.sections.some((s) => s.bars.some((b) => b.tab?.length));
  const sections = map.sections
    .map((s) => {
      const cells = s.bars
        .map(
          (b) =>
            `<div class="bar"><span class="n">${b.n}</span><span class="ch">${b.chords.length ? esc(b.chords.join(' ')) : '<span class="rep">%</span>'}</span>${
              hasTab ? tabSvg(b.tab ?? [], strings) : ''
            }${b.bass.length ? `<span class="bs">${esc(b.bass.join(' '))}</span>` : ''}</div>`,
        )
        .join('');
      const letter = s.letter ? `<b class="letter">${esc(s.letter)}</b>` : '';
      const rep = s.repeatOf ? ` · repete ${esc(s.repeatOf)}` : '';
      return `<section class="part"><h2>${letter}${esc(s.name)} <small>compassos ${s.from + 1}–${s.to + 1} · ${s.bars.length}${rep}</small></h2><div class="grid">${cells}</div></section>`;
    })
    .join('');
  const facts = [map.key && `Tom ${esc(map.key)}`, map.bpmRange ? `${Math.round(map.bpmRange[0])}–${Math.round(map.bpmRange[1])} BPM (variável)` : map.bpm ? `${Math.round(map.bpm)} BPM` : '', '4/4', map.transpose ? `transposto ${map.transpose > 0 ? '+' : ''}${map.transpose}` : '']
    .filter(Boolean)
    .join(' · ');
  const form = map.sections.some((s) => s.letter) ? `<div class="form">Forma: ${map.sections.map((s) => `<span>${esc(s.letter ?? '?')}</span>`).join(' ')}</div>` : '';
  const style = hasTab ? `<div class="facts">Baixo${map.bassStyle ? `: ${esc(map.bassStyle)}` : ''} · tablatura com as cordas ${esc(strings.join(' '))} (a mais aguda em cima), sem corda solta.</div>` : '';
  const shapes = map.shapes?.length ? `<section class="shapes-sec"><h2>Acordes no violão</h2><div class="shapes">${map.shapes.map(shapeSvg).join('')}</div></section>` : '';
  const legend = [
    'Acordes por compasso (% = repete o anterior).',
    hasTab ? 'Tablatura: o número é a casa; a posição na linha é o tempo dentro do compasso.' : '',
    map.sections.some((s) => s.bars.some((b) => b.bass.length)) ? 'Embaixo, as notas do baixo da gravação, estimadas.' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${esc(map.title)}</title><style>
@page { size: A4; margin: 14mm 12mm; }
* { box-sizing: border-box; }
body { font: 11px/1.35 "Segoe UI", system-ui, sans-serif; color: #16171a; margin: 0; }
h1 { font-size: 20px; margin: 0 0 2px; }
.facts { color: #5b5f66; margin-bottom: 4px; }
.form { margin: 6px 0 12px; color: #5b5f66; }
.form span { display: inline-block; min-width: 16px; padding: 1px 4px; margin-right: 2px; border: 1px solid #16171a; border-radius: 3px; text-align: center; font-weight: 700; color: #16171a; }
section.part { break-inside: avoid; margin: 0 0 12px; }
h2 { font-size: 12.5px; text-transform: uppercase; letter-spacing: .06em; margin: 0 0 5px; padding: 3px 7px; background: #16171a; color: #fff; border-radius: 3px; display: inline-block; }
h2 small { font-weight: 500; text-transform: none; letter-spacing: 0; opacity: .75; margin-left: 6px; }
.letter { display: inline-block; background: #fff; color: #16171a; border-radius: 2px; padding: 0 4px; margin-right: 6px; }
.grid { display: grid; grid-template-columns: repeat(4, 1fr); border-left: 1.5px solid #16171a; }
.bar { position: relative; min-height: 40px; padding: 12px 6px 4px; border-right: 1.5px solid #16171a; border-top: 1px solid #c9ccd1; border-bottom: 1px solid #c9ccd1; }
.n { position: absolute; top: 2px; left: 4px; font-size: 8.5px; color: #8a8f97; }
.ch { display: block; font-size: 14px; font-weight: 700; }
.rep { color: #8a8f97; font-weight: 500; }
.bs { display: block; font-size: 9.5px; color: #4a4e55; margin-top: 2px; }
svg.tab { display: block; width: 100%; height: auto; margin-top: 3px; }
.tl line { stroke: #9aa0a8; stroke-width: .6; }
.tn rect { fill: #fff; }
.tn text { font: 700 7px "Segoe UI", sans-serif; fill: #16171a; text-anchor: middle; }
.shapes-sec { break-inside: avoid; margin-top: 6px; }
.shapes { display: flex; flex-wrap: wrap; gap: 6px 10px; }
.shape { margin: 0; width: 62px; text-align: center; }
.shape svg { width: 62px; height: auto; }
.shape line { stroke: #16171a; stroke-width: .7; }
.shape line.nut { stroke-width: 2.4; }
.shape circle { fill: #16171a; }
.shape circle.open { fill: none; stroke: #16171a; stroke-width: .8; }
.shape .mk { font: 8px sans-serif; text-anchor: middle; fill: #16171a; }
.shape .bf { font: 7px sans-serif; fill: #5b5f66; }
.shape figcaption { font-weight: 700; font-size: 11px; }
footer { color: #8a8f97; font-size: 9px; margin-top: 8px; }
</style></head><body><h1>${esc(map.title)}</h1><div class="facts">${facts}</div>${style}${form}${sections}${shapes}<footer>${legend} mixerCraft.</footer></body></html>`;
}
