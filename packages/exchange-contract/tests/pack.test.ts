import { describe, expect, it } from 'vitest';
import { PACK_LIMITS, createPack, encodePack, parsePack, type PackSong } from '../src/index.js';

const SONG: PackSong = {
  title: 'Minha música',
  source: 'Gravação',
  key: 'A menor',
  bpm: 96,
  bars: [
    { chords: ['Am'], notes: [{ midi: 45, beat: 0, len: 1 }, { midi: 48, beat: 2, len: 1 }] },
    { chords: ['F', 'G'], notes: [{ midi: 41, beat: 0, len: 2 }] },
  ],
  sections: [{ name: 'Intro', from: 0, to: 1 }],
};
const raw = (patch: Record<string, unknown>) => JSON.stringify({ ...createPack(SONG, { name: 'MixerMonster', version: '1.0.0' }), ...patch });
const withNotes = (notes: unknown[]) => ({ ...SONG, bars: [{ chords: [], notes }], sections: [] });

describe('.mcraft-pack', () => {
  it('ida e volta preserva a música', () => {
    const pack = createPack(SONG, { name: 'MixerMonster', version: '1.0.0' }, new Date('2026-11-18T12:00:00Z'));
    const r = parsePack(encodePack(pack));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.pack.song).toEqual(SONG);
      expect(r.pack.createdAt).toBe('2026-11-18T12:00:00.000Z');
      expect(r.pack.app.name).toBe('MixerMonster');
    }
  });
  it('aceita BOM no começo', () => {
    expect(parsePack('﻿' + raw({})).ok).toBe(true);
  });
  it('recusa o que não é pacote', () => {
    expect(parsePack('não é json')).toEqual({ ok: false, error: expect.stringContaining('JSON inválido') });
    expect(parsePack(JSON.stringify({ format: 'outra-coisa' })).ok).toBe(false);
    expect(parsePack(new Uint8Array([0xff, 0xfe, 0x00]))).toEqual({ ok: false, error: expect.stringContaining('UTF-8') });
  });
  it('versão mais nova pede atualização', () => {
    const r = parsePack(raw({ version: 2 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/atualize o ScaleMonster/);
  });
  it('confere faixas numéricas e partes', () => {
    expect(parsePack(raw({ song: withNotes([{ midi: 200, beat: 0, len: 1 }]) })).ok).toBe(false);
    expect(parsePack(raw({ song: withNotes([{ midi: 40, beat: 0, len: 0 }]) })).ok).toBe(false);
    expect(parsePack(raw({ song: withNotes([{ midi: 40, beat: 'x', len: 1 }]) })).ok).toBe(false);
    expect(parsePack(raw({ song: { ...SONG, sections: [{ name: 'x', from: 1, to: 2 }] } })).ok).toBe(false);
    expect(parsePack(raw({ song: { ...SONG, bpm: 5 } })).ok).toBe(false);
    expect(parsePack(raw({ song: { ...SONG, bars: [] } })).ok).toBe(false);
    expect(parsePack(raw({ song: { ...SONG, title: '   ' } })).ok).toBe(false);
  });
  it('limita tamanho e quantidades', () => {
    const many = Array.from({ length: PACK_LIMITS.notesPerBar + 1 }, () => ({ midi: 40, beat: 0, len: 1 }));
    expect(parsePack(raw({ song: withNotes(many) })).ok).toBe(false);
    expect(parsePack('x'.repeat(PACK_LIMITS.bytes + 1)).ok).toBe(false);
  });
  it('limpa caracteres de controle e corta textos longos', () => {
    const r = parsePack(raw({ song: { ...SONG, title: 'a\u0000b' + 'c'.repeat(500) } }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.pack.song.title.startsWith('a b')).toBe(true);
      expect(r.pack.song.title.length).toBe(PACK_LIMITS.text);
    }
  });
});
