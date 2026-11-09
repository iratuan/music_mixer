#!/usr/bin/env node
// yt-dlp FALSO para o teste de ponta a ponta (sem internet). Imita a saída do verdadeiro:
//   --version            → versão
//   --dump-single-json   → metadados (link com "login" → erro de login; "longo" → 45 min)
//   download             → linhas BFP de progresso, "[ExtractAudio]" e cópia de BF_FAKE_AUDIO para o -o
// Links com "lento" demoram ~20 s (para testar o cancelamento).
// Registra os argumentos recebidos em BF_FAKE_LOG (uma linha JSON por chamada).
import { appendFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const args = process.argv.slice(2);
if (process.env.BF_FAKE_LOG) appendFileSync(process.env.BF_FAKE_LOG, `${JSON.stringify(args)}\n`);
const url = args[args.indexOf('--') + 1] ?? '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (args.includes('--version')) {
  console.log('2026.10.26-teste');
  process.exit(0);
}
if (args.includes('--update')) {
  console.error('ERROR: atualização desativada no teste');
  process.exit(1);
}
if (url.includes('login')) {
  console.error('ERROR: [youtube] abc: Sign in to confirm you’re not a bot. Use --cookies-from-browser or --cookies for the authentication.');
  process.exit(1);
}
if (url.includes('sumiu')) {
  console.error('ERROR: [youtube] abc: Video unavailable. This video has been removed by the uploader');
  process.exit(1);
}
if (args.includes('--dump-single-json')) {
  console.log(
    JSON.stringify({
      id: 'livre1',
      title: url.includes('lento') ? 'Vídeo lento (teste)' : 'Linha de baixo livre (teste)',
      channel: 'Canal de Teste',
      duration: url.includes('longo') ? 45 * 60 : 12,
      live_status: 'not_live',
      webpage_url: url,
      webpage_url_domain: 'videos.exemplo.org',
      thumbnail: 'https://videos.exemplo.org/capa.jpg',
    }),
  );
  process.exit(0);
}

const out = args[args.indexOf('-o') + 1];
const fmt = args[args.indexOf('--audio-format') + 1];
const total = 1_000_000;
const steps = url.includes('lento') ? 200 : 10;
for (let i = 1; i <= steps; i++) {
  console.log(`BFP ${Math.round((total * i) / steps)} ${total} NA ${2_500_000 + i} ${steps - i}`);
  await sleep(100);
}
const file = out.replace('%(ext)s', fmt);
console.log(`[ExtractAudio] Destination: ${file}`);
await sleep(300);
mkdirSync(dirname(file), { recursive: true });
copyFileSync(process.env.BF_FAKE_AUDIO, file);
process.exit(0);
