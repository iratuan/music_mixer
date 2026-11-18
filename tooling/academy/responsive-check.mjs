#!/usr/bin/env node
/**
 * Matriz de telas do ScaleMonster (Etapa E8): celular e tablet (toque, retrato/paisagem) e desktop.
 * Para cada aparelho e cada tela verifica:
 *   - nada de rolagem horizontal da página (documento e área de conteúdo);
 *   - a navegação certa (barra inferior até 820 px, lateral acima), com "Mais" levando ao resto;
 *   - alvos de toque ≥ 44 px na navegação e no conteúdo (checkbox vale pelo rótulo);
 *   - no celular: desafio por toque (pistas no palco em tela cheia, dois dedos, palhetar);
 *   - nenhum erro no console.
 * Uso: npm run academy:build && npm run academy:preview  (em outro terminal)
 *      node tooling/academy/responsive-check.mjs [url] [pasta-de-capturas]
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:4174';
const out = process.argv[3] ?? null;
if (out) mkdirSync(out, { recursive: true });

const DEVICES = [
  { id: 'celular-retrato', width: 375, height: 812, touch: true, compact: true, video: false },
  { id: 'celular-paisagem', width: 812, height: 375, touch: true, compact: true, video: false },
  { id: 'tablet-retrato', width: 768, height: 1024, touch: true, compact: true, video: false },
  { id: 'tablet-paisagem', width: 1024, height: 768, touch: true, compact: false, video: true },
  { id: 'desktop', width: 1280, height: 800, touch: false, compact: false, video: true },
];
const SCREENS = ['home', 'trails', 'exercises', 'harmony', 'theory', 'ear', 'profiles', 'achievements'];

const failures = [];
const fail = (msg) => {
  failures.push(msg);
  console.log(`  FALHOU ${msg}`);
};

// Chrome/Edge instalados tocam H.264 (o Chromium do Playwright não); sem eles, usa o Chromium.
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch({ channel: 'msedge' })).catch(() => chromium.launch());
for (const dev of DEVICES) {
  console.log(`\n== ${dev.id} (${dev.width}x${dev.height}${dev.touch ? ', toque' : ''})`);
  const ctx = await browser.newContext({ viewport: { width: dev.width, height: dev.height }, hasTouch: dev.touch, isMobile: dev.touch, deviceScaleFactor: dev.touch ? 2 : 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && errors.push(m.text()));
  page.on('response', (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`));

  for (const screen of SCREENS) {
    await page.goto(`${base}/?screen=${screen}`);
    const nav = page.getByRole('navigation', { name: 'Navegação principal' });
    await nav.waitFor({ timeout: 15000 });
    await page.waitForTimeout(700); // animação de entrada
    const m = await page.evaluate(() => {
      const content = document.querySelector('.content');
      const vw = document.documentElement.clientWidth;
      const navEl = document.querySelector('nav[aria-label="Navegação principal"]');
      const small = (root) =>
        [...(root?.querySelectorAll('button, select, input, a[href]') ?? [])]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            const st = getComputedStyle(el);
            return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
          })
          .filter((el) => {
            // Caixa de seleção vale pelo rótulo que a envolve (o toque no texto marca).
            const target = el.matches('input[type=checkbox], input[type=radio]') ? (el.closest('label') ?? el) : el;
            const r = target.getBoundingClientRect();
            return r.height < 43.5 || r.width < 43.5;
          })
          .map((el) => `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''}「${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 24)}」`);
      return {
        docOverflow: document.documentElement.scrollWidth - vw,
        contentOverflow: content ? content.scrollWidth - content.clientWidth : 0,
        tabbar: !!document.querySelector('.tabbar'),
        side: !!document.querySelector('.side'),
        navSmall: small(navEl),
        contentSmall: small(content),
      };
    });
    const tag = `${dev.id}/${screen}`;
    if (m.docOverflow > 1) fail(`${tag}: página rola na horizontal (+${m.docOverflow}px)`);
    if (m.contentOverflow > 1) fail(`${tag}: conteúdo rola na horizontal (+${m.contentOverflow}px)`);
    if (dev.compact !== m.tabbar || dev.compact === m.side) fail(`${tag}: navegação errada (barra inferior=${m.tabbar}, lateral=${m.side})`);
    if (dev.touch && m.navSmall.length) fail(`${tag}: alvos < 44px na navegação: ${m.navSmall.join(', ')}`);
    if (dev.touch && m.contentSmall.length) fail(`${tag}: alvos < 44px no conteúdo: ${m.contentSmall.slice(0, 6).join(', ')}`);
    console.log(`  ok ${screen}`);
    if (out) await page.screenshot({ path: join(out, `${dev.id}-${screen}.png`) });
  }

  // "Mais" leva às telas fora das abas (só no compacto).
  if (dev.compact) {
    await page.goto(`${base}/?screen=home`);
    await page.getByRole('button', { name: 'Mais' }).click();
    const sheet = page.getByRole('dialog', { name: 'Mais opções' });
    await sheet.waitFor();
    if (out) await page.screenshot({ path: join(out, `${dev.id}-mais.png`) });
    await sheet.getByRole('button', { name: 'Harmonia' }).click();
    await page.getByRole('heading', { name: 'Harmonia' }).first().waitFor();
    if ((await sheet.count()) !== 0) fail(`${dev.id}: folha "Mais" não fecha ao navegar`);
    else console.log('  ok "Mais" → Harmonia');
  }
  // Desafio por toque (celular em retrato): pistas no palco em tela cheia, multitoque e "Palhetar".
  if (dev.id === 'celular-retrato') {
    await page.goto(`${base}/?screen=exercises`);
    await page.getByRole('button', { name: 'Praticar', exact: true }).first().click();
    await page.getByLabel('Desafio').check();
    await page.getByLabel('Como tocar no desafio').selectOption('keys');
    const lanes = page.locator('.touch-lane');
    await lanes.first().waitFor();
    if (!(await lanes.first().isDisabled())) fail('pistas de toque deveriam ficar desabilitadas antes de começar');
    await page.getByRole('button', { name: 'Começar', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.touch-lane')?.hasAttribute('disabled'), null, { timeout: 15000 });
    const geo = await page.evaluate(() => ({ vh: innerHeight, strike: document.querySelector('.touch-strike')?.getBoundingClientRect().bottom ?? 1e9, lane: document.querySelector('.touch-lane')?.getBoundingClientRect().height ?? 0 }));
    if (geo.strike > geo.vh) fail(`"Palhetar" fora da tela no palco (${Math.round(geo.strike)} > ${geo.vh})`);
    if (geo.lane < 56) fail(`pista de toque baixa demais (${Math.round(geo.lane)} px)`);
    const down = (el, id) => el.dispatchEvent('pointerdown', { pointerId: id, pointerType: 'touch', bubbles: true });
    const up = (el, id, type = 'pointerup') => el.dispatchEvent(type, { pointerId: id, pointerType: 'touch', bubbles: true });
    await down(lanes.nth(0), 11);
    await down(lanes.nth(1), 12);
    const both = (await lanes.nth(0).getAttribute('data-down')) === 'true' && (await lanes.nth(1).getAttribute('data-down')) === 'true';
    // O retorno visual precisa aparecer (o estado "apertado" muda a cor da pista).
    await page.waitForTimeout(400); // transição de cor do botão
    const colors = await lanes.evaluateAll((els) => els.slice(0, 3).map((el) => getComputedStyle(el).backgroundColor));
    if (colors[0] === colors[2]) fail(`pista apertada sem destaque visual (${colors.join(' / ')})`);
    await down(page.locator('.touch-strike'), 13);
    const strike = (await page.locator('.touch-strike').getAttribute('data-down')) === 'true';
    if (out) await page.screenshot({ path: join(out, 'celular-retrato-desafio-toque.png') });
    await up(page.locator('.touch-strike'), 13);
    await up(lanes.nth(0), 11);
    const released = (await lanes.nth(0).getAttribute('data-down')) === 'false' && (await lanes.nth(1).getAttribute('data-down')) === 'true';
    await up(lanes.nth(1), 12, 'pointercancel');
    const cancelled = (await lanes.nth(1).getAttribute('data-down')) === 'false';
    if (!both || !strike || !released || !cancelled) fail(`pistas de toque: dois dedos=${both}, palhetar=${strike}, soltar=${released}, cancelar=${cancelled}`);
    else console.log('  ok desafio por toque (pistas, multitoque, palhetar, palco em tela cheia)');
    await page.getByRole('button', { name: 'Parar o desafio' }).click(); // em tela cheia, o botão do próprio palco
  }
  // Vídeo de fundo do palco: só desktop e tablet na horizontal; abertura antes das notas, depois loop mudo.
  {
    await page.goto(`${base}/?screen=exercises`);
    const praticar = page.getByRole('button', { name: 'Praticar', exact: true }).first();
    await Promise.race([praticar.waitFor({ timeout: 8000 }), page.getByLabel('Desafio').waitFor({ timeout: 8000 })]).catch(() => undefined);
    if (await praticar.isVisible()) await praticar.click();
    await page.getByLabel('Desafio').check();
    await page.getByLabel('Como tocar no desafio').selectOption('keys');
    await page.locator('.arcade-panel').waitFor();
    const has = (await page.locator('.stage-video').count()) > 0;
    if (has !== dev.video) fail(`${dev.id}: vídeo do palco ${has ? 'aparece' : 'não aparece'} (esperado ${dev.video})`);
    if (dev.video) {
      await page.getByRole('button', { name: 'Começar', exact: true }).first().click();
      const intro = page.locator('.stage-video-intro');
      await intro.waitFor({ timeout: 5000 });
      await page.waitForTimeout(1500);
      const iv = await intro.evaluate((v) => ({ t: v.currentTime, paused: v.paused, err: v.error?.code ?? 0, w: v.getBoundingClientRect().width }));
      const lanesOff = await page.locator('.touch-lane').first().isDisabled();
      if (iv.err || iv.paused || iv.t < 0.5) fail(`${dev.id}: abertura não toca (${JSON.stringify(iv)})`);
      if (!lanesOff) fail(`${dev.id}: notas começaram durante a abertura`);
      if (out) await page.screenshot({ path: join(out, `${dev.id}-abertura.png`) });
      await page.getByRole('button', { name: 'Pular a abertura' }).click();
      await page.waitForFunction(() => !document.querySelector('.touch-lane')?.hasAttribute('disabled'), null, { timeout: 15000 });
      await page.waitForTimeout(1500);
      const lv = await page.locator('.stage-video video').first().evaluate((v) => ({ t: v.currentTime, paused: v.paused, muted: v.muted, loop: v.loop, err: v.error?.code ?? 0 }));
      if (lv.err || lv.paused || !lv.muted || !lv.loop || lv.t < 0.5) fail(`${dev.id}: loop de fundo errado (${JSON.stringify(lv)})`);
      if ((await page.locator('.stage-video-intro').count()) !== 0) fail(`${dev.id}: abertura não saiu`);
      if (out) await page.screenshot({ path: join(out, `${dev.id}-palco-video.png`) });
      await page.getByRole('button', { name: 'Parar o desafio' }).click();
      console.log('  ok vídeo do palco (abertura, pular, loop mudo)');
    } else console.log('  ok sem vídeo do palco');
  }
  if (errors.length) fail(`${dev.id}: erros no console: ${[...new Set(errors)].slice(0, 3).join(' | ')}`);
  await ctx.close();
}
await browser.close();

console.log(failures.length ? `\n${failures.length} falha(s).` : '\nMatriz de telas OK.');
process.exit(failures.length ? 1 : 0);
