#!/usr/bin/env node
// Testa o app empacotado FORA da pasta do projeto: sem o venv de GPU, ele precisa usar o runtime embutido
// (CPU, offline): separar com escolha de faixas, analisar, transpor (Rubber Band) e gerar MIDI (Basic Pitch).
// Uso: node tooling/screens/portable-check.mjs <pasta win-unpacked copiada> <arquivo de áudio de teste>
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron } from 'playwright';

const [dir, audio] = process.argv.slice(2);
if (!dir || !audio) throw new Error('uso: portable-check.mjs <pasta do app> <áudio>');
const userData = mkdtempSync(join(tmpdir(), 'bf-portable-'));
const app = await electron.launch({ executablePath: join(dir, 'Baixaria Fina.exe'), env: { ...process.env, BF_STEMS_PYTHON: '', BF_USER_DATA: userData } });
try {
  const win = await app.firstWindow();
  await win.waitForTimeout(1500);
  console.log('resources:', await app.evaluate(() => process.resourcesPath));
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, audio);
  const r = await win.evaluate(async () => {
    const avail = await window.baixaria.stemsAvailable();
    const picked = await window.baixaria.pickAudioFile();
    if (picked.canceled) return { error: 'cancelado' };
    const song = await window.baixaria.libraryAdd(picked.path, 'teste');
    const t0 = performance.now();
    const sep = await window.baixaria.separateStems(song.id, { quality: 'fast', stems: ['bass', 'drums'] });
    const sepMs = Math.round(performance.now() - t0);
    const t1 = performance.now();
    const an = await window.baixaria.analyzeSong(song.id);
    const anMs = Math.round(performance.now() - t1);
    const t2 = performance.now();
    await window.baixaria.stemsTranspose(song.id, 2);
    const up = await window.baixaria.libraryReadStem(song.id, 'bass', 2);
    const trMs = Math.round(performance.now() - t2);
    const t3 = performance.now();
    const midi = await window.baixaria.stemsMidi(song.id, 'bass', 2);
    const midiMs = Math.round(performance.now() - t3);
    return { avail, stems: sep.stems, sepMs, bpm: an.bpm, key: an.key, bars: an.bars.length, anMs, transposedBytes: up.byteLength, trMs, midiHead: String.fromCharCode(...midi.slice(0, 4)), midiMs };
  });
  console.log(JSON.stringify(r));
  const ok =
    r.avail?.runtime === 'cpu' &&
    r.avail?.voiceSplit === false &&
    JSON.stringify(r.stems) === JSON.stringify(['bass', 'drums', 'rest']) &&
    r.bars > 0 &&
    r.transposedBytes > 1000 &&
    r.midiHead === 'MThd';
  console.log(ok ? 'ok: runtime embutido separou (baixo, bateria, restante), analisou, transpôs e gerou MIDI' : 'FALHOU');
  process.exitCode = ok ? 0 : 1;
} finally {
  await app.close();
}
