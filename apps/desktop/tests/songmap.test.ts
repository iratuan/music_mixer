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
    expect(html).toContain('Tom G menor · 118 BPM · transposto +2');
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
