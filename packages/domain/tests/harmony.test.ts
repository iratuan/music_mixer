import { describe, expect, it } from 'vitest';
import {
  barAt,
  beatInBar,
  chordAt,
  chordDegree,
  chordName,
  clicksBetween,
  encodeWav,
  keyName,
  keyNameSolfege,
  keyUsesFlats,
  transposeChord,
  transposeKey,
} from '../src/index.js';

describe('nomes e transposição', () => {
  it('tom em cifra e em solfejo, com bemóis quando o tom pede', () => {
    expect(keyName({ tonic: 2, mode: 'major' })).toBe('D maior');
    expect(keyName({ tonic: 10, mode: 'major' })).toBe('Bb maior');
    expect(keyName({ tonic: 5, mode: 'minor' })).toBe('F menor'); // Fá menor: 4 bemóis
    expect(keyNameSolfege({ tonic: 3, mode: 'major' })).toBe('Mi♭ maior');
    expect(keyNameSolfege({ tonic: 4, mode: 'minor' })).toBe('Mi menor');
    expect(keyUsesFlats({ tonic: 9, mode: 'minor' })).toBe(false);
    expect(keyUsesFlats({ tonic: 7, mode: 'minor' })).toBe(true); // Sol menor: 2 bemóis
  });

  it('transpõe tom e acorde em meios tons, dando a volta na oitava', () => {
    expect(transposeKey({ tonic: 11, mode: 'major' }, 2)).toEqual({ tonic: 1, mode: 'major' });
    expect(transposeKey({ tonic: 0, mode: 'minor' }, -1)).toEqual({ tonic: 11, mode: 'minor' });
    expect(transposeChord({ root: 7, quality: '7' }, 5)).toEqual({ root: 0, quality: '7' });
  });

  it('cifra do acorde segue a grafia do tom', () => {
    const fMajor = { tonic: 5, mode: 'major' as const };
    const bMajor = { tonic: 11, mode: 'major' as const };
    expect(chordName({ root: 10, quality: '7' }, fMajor)).toBe('Bb7');
    expect(chordName({ root: 10, quality: '7' }, bMajor)).toBe('A#7');
    expect(chordName(null)).toBe('—');
  });

  it('grau do acorde no tom', () => {
    const c = { tonic: 0, mode: 'major' as const };
    expect(chordDegree({ root: 7, quality: '7' }, c)).toBe('V7');
    expect(chordDegree({ root: 9, quality: 'm' }, c)).toBe('vi');
    expect(chordDegree({ root: 2, quality: 'm7' }, c)).toBe('ii7');
    expect(chordDegree({ root: 10, quality: '' }, c)).toBe('♭VII');
    expect(chordDegree({ root: 0, quality: '' }, null)).toBe('');
  });
});

describe('posição na música', () => {
  const bars = [
    { start: 0, end: 2, chords: [{ start: 0, name: 'A' }, { start: 1, name: 'B' }] },
    { start: 2, end: 4, chords: [{ start: 2, name: 'C' }] },
  ];
  it('compasso atual', () => {
    expect(barAt(bars, -0.1)).toBe(-1);
    expect(barAt(bars, 0)).toBe(0);
    expect(barAt(bars, 1.99)).toBe(0);
    expect(barAt(bars, 2)).toBe(1);
    expect(barAt(bars, 99)).toBe(1);
  });

  it('acorde atual dentro do compasso', () => {
    expect(chordAt(bars[0]!.chords, 0.5)!.name).toBe('A');
    expect(chordAt(bars[0]!.chords, 1.5)!.name).toBe('B');
    expect(chordAt([], 1)).toBeNull();
  });

  it('tempo do compasso com anacruse (primeiro tempo 1 no índice 2)', () => {
    const beats = [0, 0.5, 1, 1.5, 2, 2.5, 3];
    expect(beatInBar(beats, 2, 0.1)).toEqual({ beat: 2, index: 0 });
    expect(beatInBar(beats, 2, 1.2)).toEqual({ beat: 0, index: 2 });
    expect(beatInBar(beats, 2, 2.6)).toEqual({ beat: 3, index: 5 });
    expect(beatInBar(beats, 2, -1)).toEqual({ beat: -1, index: -1 });
  });

  it('cliques do metrônomo na janela, acento no tempo 1', () => {
    const beats = [0, 0.5, 1, 1.5, 2, 2.5, 3];
    expect(clicksBetween(beats, 2, 0.9, 2.1)).toEqual([
      { t: 1, accent: true },
      { t: 1.5, accent: false },
      { t: 2, accent: false },
    ]);
    expect(clicksBetween(beats, 2, 3.01, 9)).toEqual([]);
    // janela que começa exatamente num tempo o inclui
    expect(clicksBetween(beats, 0, 0, 0.6).map((c) => c.t)).toEqual([0, 0.5]);
  });
});

describe('WAV', () => {
  it('cabeçalho PCM 16 bits estéreo', () => {
    const bytes = encodeWav([new Float32Array([0, 1]), new Float32Array([0, -1])], 44100);
    const v = new DataView(bytes.buffer);
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF');
    expect(v.getUint16(22, true)).toBe(2);
    expect(v.getUint32(24, true)).toBe(44100);
    expect(bytes.byteLength).toBe(44 + 2 * 2 * 2);
  });
});

describe('acordes estendidos e inversões', () => {
  it('nome com baixo invertido, transposto junto', () => {
    expect(chordName({ root: 0, quality: '', bass: 4 })).toBe('C/E');
    expect(chordName(transposeChord({ root: 0, quality: 'maj7', bass: 4 }, 3))).toBe('D#maj7/G');
    expect(chordName(transposeChord({ root: 0, quality: 'maj7', bass: 4 }, 3), { tonic: 3, mode: 'major' })).toBe('Ebmaj7/G');
    expect(chordName({ root: 0, quality: '', bass: 0 })).toBe('C');
  });
  it('graus de diminuto e meio-diminuto', () => {
    const C = { tonic: 0, mode: 'major' as const };
    expect(chordDegree({ root: 11, quality: 'dim' }, C)).toBe('vii°');
    expect(chordDegree({ root: 11, quality: 'm7b5' }, C)).toBe('viiø7');
    expect(chordDegree({ root: 5, quality: 'maj7' }, C)).toBe('IVmaj7');
    expect(chordDegree({ root: 7, quality: 'sus4' }, C)).toBe('Vsus4');
  });
});
