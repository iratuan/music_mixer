#!/usr/bin/env node
/**
 * Andamento variável numa música real (cópia mínima da biblioteca; faixas do Demucs por junção,
 * só leitura): o aviso de análise nova aparece, "Atualizar análise" refaz (versão 3); se o
 * andamento sair variável, o cabeçalho mostra a faixa e "usar andamento fixo" refaz com um só
 * andamento (e "detectar variação" volta). O BPM do painel acompanha o trecho.
 * Uso: node tooling/screens/tempo-check.mjs <userData> <id> [captura.png]
 */
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const [src, id, shot] = process.argv.slice(2);
if (!src || !id) throw new Error('uso: tempo-check.mjs <userData> <id> [captura.png]');
const userData = mkdtempSync(join(tmpdir(), 'bf-tempo-'));
const index = JSON.parse(readFileSync(join(src, 'library', 'index.json'), 'utf8'));
index.songs = index.songs.filter((s) => s.id === id);
mkdirSync(join(userData, 'library', 'songs', id), { recursive: true });
writeFileSync(join(userData, 'library', 'index.json'), JSON.stringify(index, null, 2));
const anPath = join(userData, 'library', 'songs', id, 'analise.json');
copyFileSync(join(src, 'library', 'songs', id, 'analise.json'), anPath);
const demucs = join(userData, 'library', 'songs', id, 'demucs');
symlinkSync(join(src, 'library', 'songs', id, 'demucs'), demucs, 'junction');
const check = (cond, msg) => {
  if (!cond) throw new Error(`verificação falhou: ${msg}`);
  console.log(`ok: ${msg}`);
};
const readAn = () => JSON.parse(readFileSync(anPath, 'utf8'));
let win;
async function untilAnalysis(ok, what) {
  const t0 = Date.now();
  while (Date.now() - t0 < 600000) {
    try {
      if (ok(readAn())) return;
    } catch {
      /* gravando */
    }
    const err = await win.locator('.alert').first().innerText().catch(() => '');
    if (err) throw new Error(`erro na tela esperando ${what}: ${err}`);
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`tempo esgotado: ${what}`);
}
const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, NODE_ENV: 'production', BF_USER_DATA: userData, BF_AUDIO_SINK: 'none' } });
try {
  win = await app.firstWindow();
  await win.waitForLoadState('load');
  await win.setViewportSize({ width: 1280, height: 820 });
  await win.locator('.lib-card').first().click();
  await win.locator('.lane').first().waitFor({ timeout: 120000 });
  const note = win.getByText(/Análise nova disponível/);
  await note.waitFor();
  check(true, 'aviso de análise nova (versão anterior a 3)');
  await win.getByRole('button', { name: 'Atualizar análise' }).click();
  await untilAnalysis((x) => x.version === 3, 'análise versão 3');
  await win.locator('.tempo-fact').waitFor({ timeout: 120000 });
  await win.waitForTimeout(1000);
  let a = readAn();
  check(a.version === 3 && a.tempo, `análise versão 3 (andamento ${a.tempo.variable ? `variável ${a.tempo.range.join('–')}` : `fixo ${a.bpm}`})`);
  const fact = await win.locator('.tempo-fact').innerText();
  if (a.tempo.variable) {
    check(/variável/.test(fact), `cabeçalho: ${fact.replace(/\s+/g, ' ')}`);
    const m1 = JSON.parse(readFileSync(join(userData, 'library', 'index.json'), 'utf8')).songs[0].meta ?? {};
    check(Array.isArray(m1.bpmRange), `biblioteca guarda a faixa: ${(m1.bpmRange ?? []).join('–')} BPM`);
    // BPM do painel muda ao longo da música
    const seen = new Set();
    // Clique numa parte do mapa (faixa de seções da régua) leva ao início dela.
    const parts = await win.locator('.rsec').count();
    for (let k = 0; k < parts; k++) {
      await win.locator('.rsec').nth(k).evaluate((el) => el.click());
      await win.waitForTimeout(300);
      seen.add(await win.locator('.lcd-cell').filter({ hasText: 'BPM' }).locator('.lcd-value').innerText());
    }
    check(seen.size >= 2, `BPM do painel acompanha o trecho: ${[...seen].join(', ')}`);
    if (shot) await win.screenshot({ path: shot });
    await win.getByRole('button', { name: 'usar andamento fixo' }).click();
    await untilAnalysis((x) => x.tempo?.mode === 'fixed', 'análise com andamento fixo');
    await win.locator('.tempo-badge').filter({ hasText: 'fixo' }).waitFor({ timeout: 60000 });
    a = readAn();
    check(a.tempo.mode === 'fixed' && !a.tempo.variable, `andamento fixo: ${a.bpm} BPM em ${a.bars.length} compassos`);
    await new Promise((r) => setTimeout(r, 500));
    const m2 = JSON.parse(readFileSync(join(userData, 'library', 'index.json'), 'utf8')).songs[0].meta ?? {};
    check(!('bpmRange' in m2), 'faixa apagada da biblioteca ao fixar o andamento');
    await win.getByRole('button', { name: 'detectar variação' }).waitFor();
    check(true, 'opção de voltar para "detectar variação"');
  } else {
    check(!/variável/.test(fact), `cabeçalho: ${fact.replace(/\s+/g, ' ')}`);
    if (shot) await win.screenshot({ path: shot });
  }
} finally {
  await app.close();
  unlinkSync(demucs); // só o atalho; as faixas reais ficam intactas
}
