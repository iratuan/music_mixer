#!/usr/bin/env node
/**
 * Gera fixtures de referência a partir de um MIDI conhecido.
 * O MIDI é a verdade (altura e tempo). O WAV é renderizado a partir dele com
 * um modelo SINTÉTICO de contrabaixo (harmônicos + decaimento). Não é gravação real.
 *
 * Saída em tests/fixtures/midi-synth/:
 *   bass-common.mid        SMF tipo 0, 480 PPQ, 60 BPM (1 batida = 1 s)
 *   bass-common-clean.wav  PCM 16 bits, 48 kHz, mono
 *   bass-common-noisy.wav  mesmo conteúdo com ruído branco a 20 dB SNR
 *   manifest.json          notas, instantes e duração (ground truth)
 *
 * Uso: node tooling/fixtures/gen-bass-fixtures.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', '..', 'tests', 'fixtures', 'midi-synth');

const SR = 48000; // taxa de amostragem da UM2 (verificar no manual antes de gravar)
const PPQ = 480;
const BEAT_S = 1; // 60 BPM
const NOTE_S = 0.6;
const STEP_S = 0.8;
const CLEAN_SNR_NOISE_DB = 20;

// Alturas frequentes no contrabaixo: B0 (5 cordas), E1 até G3 cromático.
// Cada nota ganha um instante fixo na linha do tempo.
const MIDIS = [23, ...range(28, 55)];

function range(a, b) {
  const out = [];
  for (let m = a; m <= b; m++) out.push(m);
  return out;
}

function midiToHz(m) {
  return 440 * 2 ** ((m - 69) / 12);
}

// ----- Renderização sintética -----
function renderNote(hz, seconds) {
  const n = Math.floor(SR * seconds);
  const out = new Float32Array(n);
  const attack = 0.004;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = (t < attack ? t / attack : 1) * Math.exp(-1.5 * t);
    let v = 0;
    const harmonics = [1, 0.5, 0.33, 0.25, 0.2];
    harmonics.forEach((amp, k) => {
      v += amp * Math.sin(2 * Math.PI * hz * (k + 1) * t);
    });
    out[i] = env * v * 0.3;
  }
  return out;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildTimeline(withNoiseDb) {
  const total = STEP_S * MIDIS.length + 0.5;
  const buf = new Float32Array(Math.floor(SR * total));
  MIDIS.forEach((m, i) => {
    const start = i * STEP_S;
    const note = renderNote(midiToHz(m), NOTE_S);
    const offset = Math.floor(SR * start);
    for (let j = 0; j < note.length; j++) buf[offset + j] += note[j];
  });
  if (withNoiseDb !== undefined) {
    let power = 0;
    for (const x of buf) power += x * x;
    power /= buf.length;
    const sigma = Math.sqrt(power / 10 ** (withNoiseDb / 10));
    const r = mulberry32(42);
    for (let i = 0; i < buf.length; i++) {
      const u1 = Math.max(r(), 1e-12);
      const u2 = r();
      buf[i] += sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    }
  }
  // Normaliza para 0,8 de pico (evita clipping)
  let peak = 0;
  for (const x of buf) peak = Math.max(peak, Math.abs(x));
  const gain = peak > 0 ? 0.8 / peak : 1;
  for (let i = 0; i < buf.length; i++) buf[i] *= gain;
  return buf;
}

function writeWav(path, samples) {
  const dataBytes = samples.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  writeFileSync(path, buf);
}

// ----- SMF tipo 0 -----
function vlq(v) {
  const bytes = [v & 0x7f];
  v >>= 7;
  while (v > 0) {
    bytes.unshift((v & 0x7f) | 0x80);
    v >>= 7;
  }
  return bytes;
}

function writeMidi(path) {
  const ticksPerSec = (PPQ * 60) / (60 * BEAT_S) * BEAT_S; // = PPQ / BEAT_S quando 60 BPM
  const events = [];
  // tempo 60 BPM = 1.000.000 µs por batida
  events.push({ tick: 0, bytes: [0xff, 0x51, 0x03, 0x0f, 0x42, 0x40] });
  const noteEvents = [];
  MIDIS.forEach((m, i) => {
    const onTick = Math.round(i * STEP_S * ticksPerSec);
    const offTick = Math.round((i * STEP_S + NOTE_S) * ticksPerSec);
    noteEvents.push({ tick: onTick, bytes: [0x90, m, 100] });
    noteEvents.push({ tick: offTick, bytes: [0x80, m, 0] });
  });
  noteEvents.sort((a, b) => a.tick - b.tick || (a.bytes[0] === 0x80 ? -1 : 1));
  events.push(...noteEvents);
  events.push({ tick: Math.round((STEP_S * MIDIS.length) * ticksPerSec), bytes: [0xff, 0x2f, 0x00] });

  const track = [];
  let last = 0;
  for (const e of events) {
    track.push(...vlq(e.tick - last), ...e.bytes);
    last = e.tick;
  }
  const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (PPQ >> 8) & 0xff, PPQ & 0xff];
  const trackHeader = [0x4d, 0x54, 0x72, 0x6b, (track.length >>> 24) & 0xff, (track.length >>> 16) & 0xff, (track.length >>> 8) & 0xff, track.length & 0xff];
  writeFileSync(path, Buffer.from([...header, ...trackHeader, ...track]));
}

// ----- Execução -----
mkdirSync(outDir, { recursive: true });
writeMidi(join(outDir, 'bass-common.mid'));
writeWav(join(outDir, 'bass-common-clean.wav'), buildTimeline(undefined));
writeWav(join(outDir, 'bass-common-noisy.wav'), buildTimeline(CLEAN_SNR_NOISE_DB));

const manifest = {
  schemaVersion: 1,
  kind: 'synthetic-midi-rendered',
  note: 'Ground truth derivado do MIDI. Áudio renderizado por modelo sintético; não é gravação real.',
  sampleRate: SR,
  ppq: PPQ,
  tempoBpm: 60,
  noiseSnrDbForNoisy: CLEAN_SNR_NOISE_DB,
  notes: MIDIS.map((midi, i) => ({
    index: i,
    midi,
    startSec: Number((i * STEP_S).toFixed(6)),
    durSec: NOTE_S,
    hz: Number(midiToHz(midi).toFixed(4)),
  })),
};
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Fixtures geradas em ${outDir} (${MIDIS.length} notas, ${SR} Hz)`);
