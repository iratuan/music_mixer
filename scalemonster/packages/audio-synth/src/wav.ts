/**
 * Codifica canais Float32 em WAV PCM 16 bits. Amostras fora de [-1, 1] são recortadas.
 */
export function encodeWav(channels: readonly Float32Array[], sampleRate: number): Uint8Array {
  if (channels.length < 1 || channels.length > 2) throw new RangeError('WAV aceito aqui: mono ou estéreo');
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw new RangeError('taxa de amostragem inválida');
  const nCh = channels.length;
  const frames = channels[0]!.length;
  for (const c of channels) if (c.length !== frames) throw new RangeError('canais com tamanhos diferentes');

  const dataSize = frames * nCh * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const str = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + dataSize, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, nCh, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * nCh * 2, true);
  v.setUint16(32, nCh * 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, dataSize, true);

  let off = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < nCh; c++) {
      const x = Math.max(-1, Math.min(1, channels[c]![i]!));
      v.setInt16(off, Math.round(x < 0 ? x * 0x8000 : x * 0x7fff), true);
      off += 2;
    }
  }
  return new Uint8Array(buf);
}

/** Lê de volta um WAV PCM 16 bits gerado por encodeWav (para testes). */
export function decodeWavPcm16(bytes: Uint8Array): { sampleRate: number; channels: Float32Array[] } {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (off: number) => String.fromCharCode(...bytes.subarray(off, off + 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE' || tag(36) !== 'data') throw new Error('não é WAV PCM simples');
  const nCh = v.getUint16(22, true);
  const sampleRate = v.getUint32(24, true);
  const dataSize = v.getUint32(40, true);
  const frames = dataSize / (nCh * 2);
  const channels = Array.from({ length: nCh }, () => new Float32Array(frames));
  let off = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < nCh; c++) {
      const s = v.getInt16(off, true);
      channels[c]![i] = s < 0 ? s / 0x8000 : s / 0x7fff;
      off += 2;
    }
  }
  return { sampleRate, channels };
}
