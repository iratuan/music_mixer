/**
 * Mapa da música no processo principal: validação do que vem do renderer (seções e mapa) e o HTML
 * do PDF. Puro, sem Electron: testável.
 */
export interface StoredSection {
  readonly startBar: number;
  readonly name: string;
}

export interface MapInput {
  readonly title: string;
  readonly key: string;
  readonly bpm: number;
  readonly bpmRange?: readonly [number, number];
  readonly transpose: number;
  readonly sections: ReadonlyArray<{
    readonly name: string;
    readonly from: number;
    readonly to: number;
    readonly bars: ReadonlyArray<{ readonly n: number; readonly chords: readonly string[]; readonly bass: readonly string[] }>;
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
        return { n: int(y.n, 1, MAX_BARS + 1) ?? 0, chords: list(y.chords), bass: list(y.bass) };
      }),
    };
  });
  return { title: str(o.title, 200) || 'Música', key: str(o.key, 40), bpm, ...(bpmRange ? { bpmRange } : {}), transpose, sections };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** HTML A4 (sem scripts nem recursos externos) para virar PDF: seções e compassos em grade de 4. */
export function songMapHtml(map: MapInput): string {
  const sections = map.sections
    .map((s) => {
      const cells = s.bars
        .map(
          (b) => `<div class="bar"><span class="n">${b.n}</span><span class="ch">${b.chords.length ? esc(b.chords.join(' ')) : '<span class="rep">%</span>'}</span>${b.bass.length ? `<span class="bs">${esc(b.bass.join(' '))}</span>` : ''}</div>`,
        )
        .join('');
      return `<section><h2>${esc(s.name)} <small>compassos ${s.from + 1}–${s.to + 1} · ${s.bars.length}</small></h2><div class="grid">${cells}</div></section>`;
    })
    .join('');
  const facts = [map.key && `Tom ${esc(map.key)}`, map.bpmRange ? `${Math.round(map.bpmRange[0])}–${Math.round(map.bpmRange[1])} BPM (variável)` : map.bpm ? `${Math.round(map.bpm)} BPM` : '', map.transpose ? `transposto ${map.transpose > 0 ? '+' : ''}${map.transpose}` : '']
    .filter(Boolean)
    .join(' · ');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${esc(map.title)}</title><style>
@page { size: A4; margin: 14mm 12mm; }
* { box-sizing: border-box; }
body { font: 11px/1.35 "Segoe UI", system-ui, sans-serif; color: #16171a; margin: 0; }
h1 { font-size: 19px; margin: 0 0 2px; }
.facts { color: #5b5f66; margin-bottom: 12px; }
section { break-inside: avoid; margin: 0 0 12px; }
h2 { font-size: 12.5px; text-transform: uppercase; letter-spacing: .06em; margin: 0 0 5px; padding: 3px 7px; background: #16171a; color: #fff; border-radius: 3px; display: inline-block; }
h2 small { font-weight: 500; text-transform: none; letter-spacing: 0; opacity: .75; margin-left: 6px; }
.grid { display: grid; grid-template-columns: repeat(4, 1fr); border-left: 1.5px solid #16171a; }
.bar { position: relative; min-height: 40px; padding: 12px 6px 4px; border-right: 1.5px solid #16171a; border-top: 1px solid #c9ccd1; border-bottom: 1px solid #c9ccd1; }
.n { position: absolute; top: 2px; left: 4px; font-size: 8.5px; color: #8a8f97; }
.ch { display: block; font-size: 14px; font-weight: 700; }
.rep { color: #8a8f97; font-weight: 500; }
.bs { display: block; font-size: 9.5px; color: #4a4e55; margin-top: 2px; }
footer { color: #8a8f97; font-size: 9px; margin-top: 8px; }
</style></head><body><h1>${esc(map.title)}</h1><div class="facts">${facts}</div>${sections}<footer>Acordes por compasso (% = repete o anterior). Embaixo, as notas do baixo no compasso, estimadas. Baixaria Fina.</footer></body></html>`;
}
