import { describe, expect, it } from 'vitest';
import { sanitizeMap, sanitizeSections, songMapHtml } from '../src/main/songmap.js';

describe('mapa no processo principal', () => {
  it('valida seções', () => {
    expect(sanitizeSections([{ startBar: 0, name: ' Intro ' }])).toEqual([{ startBar: 0, name: 'Intro' }]);
    expect(() => sanitizeSections('x')).toThrow();
    expect(() => sanitizeSections([{ startBar: -1, name: 'a' }])).toThrow();
    expect(() => sanitizeSections([{ startBar: 1.5, name: 'a' }])).toThrow();
    expect(() => sanitizeSections([{ startBar: 1, name: '' }])).toThrow();
  });

  it('HTML do PDF escapa tudo o que vem do renderer e não tem script', () => {
    const map = sanitizeMap({
      title: '<script>alert(1)</script>',
      key: 'G menor',
      bpm: 117.5,
      transpose: 2,
      sections: [{ name: 'Refrão"><img src=x>', from: 0, to: 0, bars: [{ n: 1, chords: ['Gm', '<b>'], bass: ['G'] }] }],
    });
    const html = songMapHtml(map);
    expect(html).not.toMatch(/<script>|<img|<b>/);
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Tom G menor · 118 BPM · 4/4 · transposto +2');
    expect(html).toContain("default-src 'none'");
  });

  it('recusa mapa malformado ou grande demais', () => {
    expect(() => sanitizeMap({ sections: 'x' })).toThrow();
    const bars = Array.from({ length: 5000 }, (_, i) => ({ n: i + 1, chords: [], bass: [] }));
    expect(() => sanitizeMap({ sections: [{ name: 'a', from: 0, to: 1, bars }] })).toThrow(/grande/);
  });
});

describe('mapa: andamento variável', () => {
  const base = { title: 'Ao vivo', key: 'F maior', bpm: 112, transpose: 0, sections: [{ name: 'Intro', from: 0, to: 0, bars: [{ n: 1, chords: ['F'], bass: [] }] }] };
  it('faixa válida entra no mapa e no PDF', () => {
    const m = sanitizeMap({ ...base, bpmRange: [86.1, 123] });
    expect(m.bpmRange).toEqual([86.1, 123]);
    expect(songMapHtml(m)).toContain('86–123 BPM (variável)');
  });
  it('faixa inválida é ignorada', () => {
    expect(sanitizeMap({ ...base, bpmRange: [130, 90] }).bpmRange).toBeUndefined();
    expect(sanitizeMap({ ...base, bpmRange: ['x', 1] }).bpmRange).toBeUndefined();
    expect(songMapHtml(sanitizeMap(base))).toContain('112 BPM');
  });
});

describe('mapa: tablatura do baixo, formas e repetições', () => {
  const base = {
    title: 'Groove',
    key: 'C maior',
    bpm: 100,
    transpose: 0,
    strings: ['E', 'A', 'D', 'G'],
    bassStyle: 'Fundamental e quinta',
    shapes: [{ name: 'C', frets: [null, 3, 5, 5, 5, 3], base: 3 }, { name: '<x>', frets: [1, 2], base: 1 }],
    sections: [
      { name: 'Verso', letter: 'A', from: 0, to: 0, bars: [{ n: 1, chords: ['C'], bass: [], tab: [{ s: 1, f: 3, x: 0 }, { s: 9, f: 2, x: 0.5 }, { s: 0, f: 5, x: 3 }] }] },
      { name: 'Verso 2', letter: 'A', repeatOf: 'Verso', from: 1, to: 1, bars: [{ n: 2, chords: ['C'], bass: [] }] },
    ],
  };
  it('valida a tablatura (corda, casa, posição) e as formas', () => {
    const m = sanitizeMap(base);
    expect(m.sections[0]!.bars[0]!.tab).toEqual([{ s: 1, f: 3, x: 0 }, { s: 0, f: 5, x: 1 }]);
    expect(m.shapes).toHaveLength(1);
    expect(m.strings).toEqual(['E', 'A', 'D', 'G']);
  });
  it('PDF traz a tablatura, a forma da música, as repetições e os diagramas', () => {
    const html = songMapHtml(sanitizeMap(base));
    expect(html).toContain('class="tab"');
    expect(html).toContain('Forma: <span>A</span> <span>A</span>');
    expect(html).toContain('repete Verso');
    expect(html).toContain('Acordes no violão');
    expect(html).toContain('sem corda solta');
    expect(html).not.toMatch(/<script/);
  });
});
