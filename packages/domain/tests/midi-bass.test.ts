import { describe, expect, it } from 'vitest';
import { BASS_TUNINGS, fingerLine, fingerZones, positionsOf, readMidi } from '../src/index.js';

/** Monta um SMF tipo 1 (480 PPQ): faixa de andamento + faixa de notas. */
function smf(usPerQuarter: number, notes: Array<[number, number, number]>): Uint8Array {
  const vlq = (n: number) => {
    const out = [n & 0x7f];
    while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80);
    return out;
  };
  const chunk = (id: string, data: number[]) => [...id].map((c) => c.charCodeAt(0)).concat([(data.length >>> 24) & 255, (data.length >>> 16) & 255, (data.length >>> 8) & 255, data.length & 255], data);
  const tempo = [0, 0xff, 0x51, 3, (usPerQuarter >> 16) & 255, (usPerQuarter >> 8) & 255, usPerQuarter & 255, 0, 0xff, 0x2f, 0];
  // notas: [tick início, tick fim, altura]; eventos ordenados por tick
  const evs: Array<{ t: number; b: number[] }> = [];
  for (const [s, e, m] of notes) {
    evs.push({ t: s, b: [0x90, m, 100] });
    evs.push({ t: e, b: [0x90, m, 0] }); // note-on com velocidade 0 = note-off
  }
  evs.sort((a, b) => a.t - b.t);
  const track: number[] = [];
  let last = 0;
  for (const ev of evs) {
    track.push(...vlq(ev.t - last), ...ev.b);
    last = ev.t;
  }
  track.push(0, 0xff, 0x2f, 0);
  return new Uint8Array([...chunk('MThd', [0, 1, 0, 2, 0x01, 0xe0]), ...chunk('MTrk', tempo), ...chunk('MTrk', track)]);
}

describe('leitor de MIDI', () => {
  it('converte ticks em segundos pelo andamento (100 BPM)', () => {
    const notes = readMidi(smf(600000, [[0, 480, 40], [480, 1440, 43]]));
    expect(notes.length).toBe(2);
    expect(notes[0]).toMatchObject({ midi: 40, startSec: 0 });
    expect(notes[0]!.durSec).toBeCloseTo(0.6, 6);
    expect(notes[1]!.startSec).toBeCloseTo(0.6, 6);
    expect(notes[1]!.durSec).toBeCloseTo(1.2, 6);
    expect(notes[0]!.velocity).toBeCloseTo(100 / 127, 6);
  });
  it('recusa arquivo que não é MIDI', () => {
    expect(() => readMidi(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toThrow(/não é um arquivo MIDI/);
  });
});

describe('digitação do baixo', () => {
  const b4 = BASS_TUNINGS[0]!;
  it('posições de uma altura', () => {
    expect(positionsOf(33, b4)).toEqual([
      { string: 0, fret: 5 },
      { string: 1, fret: 0 },
    ]);
    expect(positionsOf(20, b4)).toEqual([]);
  });
  it('linha em Lá: fica numa região, sem saltos', () => {
    // A1 C2 D2 E2 G2 A2 (pentatônica de Lá)
    const pos = fingerLine([33, 36, 38, 40, 43, 45], b4);
    const frets = pos.map((p) => p!.fret).filter((f) => f > 0);
    expect(Math.max(...frets) - Math.min(...frets)).toBeLessThanOrEqual(4);
    expect(pos.every((p) => p !== null)).toBe(true);
  });
  it('nota fora do alcance vira null sem quebrar o resto', () => {
    const pos = fingerLine([28, 10, 31], b4);
    expect(pos[1]).toBeNull();
    expect(pos[0]).toEqual({ string: 0, fret: 0 });
    expect(pos[2]).toEqual({ string: 0, fret: 3 });
  });
  it('evita corda solta: Lá, Ré e Sol presos; Mi grave do 4 cordas continua solto', () => {
    // A1 D2 G2 em sequência: soltas seriam 0 0 0; presas, casa 5 das cordas de baixo.
    const z = fingerZones([33, 38, 43, 28], b4);
    expect(z.slice(0, 3).every((x) => x!.pos.fret > 0)).toBe(true);
    expect(z[3]!.pos).toEqual({ string: 0, fret: 0 }); // E1 só existe solto
    // Com cordas soltas permitidas, volta a usá-las.
    const open = fingerZones([33, 38, 43], b4, undefined, { openStrings: true });
    expect(open.some((x) => x!.pos.fret === 0)).toBe(true);
  });
  it('5 cordas alcança o Si grave', () => {
    expect(fingerLine([23], BASS_TUNINGS[1]!)[0]).toEqual({ string: 0, fret: 0 });
  });
  it('conforto por zona: uma escala inteira numa só posição, sem mudar a mão', () => {
    // Dó maior a partir da casa 8 da corda Mi (C2 D2 E2 F2 G2 A2 B2 C3)
    const z = fingerZones([36, 38, 40, 41, 43, 45, 47, 48], b4);
    expect(new Set(z.map((x) => x!.zone)).size).toBe(1);
    for (const x of z) if (x!.pos.fret > 0) expect(x!.pos.fret - x!.zone).toBeGreaterThanOrEqual(0), expect(x!.pos.fret - x!.zone).toBeLessThan(4);
  });
  it('conforto por zona: riff que cabe na zona não vai para outra corda/região à toa', () => {
    // G1 A#1 C2 C#2 D2 (blues em Sol, casas 3–6 na corda Mi e Lá)
    const z = fingerZones([31, 34, 36, 37, 38, 36, 34, 31], b4);
    expect(new Set(z.map((x) => x!.zone)).size).toBe(1);
    expect(z[0]!.pos).toEqual({ string: 0, fret: 3 });
  });
  it('troca de zona só quando precisa, e prefere fazê-la numa pausa', () => {
    // Frase grave (casas 1–3, Lá solto) e depois frase aguda (D3 E3 F3, longe): uma única troca, na pausa.
    const midis = [29, 31, 33, 50, 52, 53];
    const starts = [0, 0.25, 0.5, 1.5, 1.75, 2.0];
    const z = fingerZones(midis, b4, starts, { openStrings: true });
    const zones = z.map((x) => x!.zone);
    const changes = zones.filter((v, k) => k > 0 && v !== zones[k - 1]).length;
    expect(changes).toBeLessThanOrEqual(1);
    if (changes) expect(zones[3]).not.toBe(zones[2]);
  });
});
