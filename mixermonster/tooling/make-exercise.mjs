#!/usr/bin/env node
/**
 * Gera um pacote de exercício a partir de um trecho da linha do baixo de uma música exportada
 * pelo MixerMonster (Tablatura → Enviar ao ScaleMonster). Protocolo: docs/06-protocolo-exercicios.md
 *
 * Uso:
 *   node tooling/make-exercise.mjs <musica.mcraft-pack> --de 1 --ate 4 --titulo "Lá menor, 4 compassos" --nivel 2 [--descricao "..."] [--saida arquivo.mcraft-pack]
 *
 * --de / --ate são compassos (começando em 1). Sem --saida, grava ao lado da música, com "-exercicio" no nome.
 * Termina com erro (código 1) se o trecho for inválido ou o exercício não passar na validação.
 */
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const input = args.find((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--')));
const de = Number(opt('de'));
const ate = Number(opt('ate'));
const titulo = opt('titulo');
const nivel = Number(opt('nivel'));
const descricao = opt('descricao') ?? '';
if (!input || !titulo || !Number.isInteger(de) || !Number.isInteger(ate) || !Number.isInteger(nivel)) {
  console.error('uso: node tooling/make-exercise.mjs <musica.mcraft-pack> --de N --ate M --titulo "..." --nivel 1-5 [--descricao "..."] [--saida arquivo]');
  process.exit(2);
}

const contract = fileURLToPath(new URL('../packages/exchange-contract/src/index.ts', import.meta.url));
const out = await build({ entryPoints: [contract], bundle: true, format: 'esm', platform: 'neutral', write: false, logLevel: 'silent' });
const lib = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);

const r = lib.parseExchange(readFileSync(input));
if (!r.ok || r.kind !== 'song') {
  console.error(`o arquivo precisa ser uma música do MixerMonster: ${r.ok ? 'é um exercício' : r.error}`);
  process.exit(1);
}
try {
  const exercise = lib.songToExercise(r.pack.song, { title: titulo, level: nivel, fromBar: de - 1, toBar: ate - 1, description: descricao });
  const pack = lib.createExercisePack(exercise, { name: 'MixerMonster', version: '0.5.0-beta.3' });
  const saida = opt('saida') ?? join(dirname(input), `${basename(input, '.mcraft-pack')}-exercicio.mcraft-pack`);
  writeFileSync(saida, lib.encodeExercisePack(pack));
  console.log(`exercício gravado em ${saida} (${exercise.steps.length} notas, compassos ${de} a ${ate})`);
} catch (e) {
  console.error(`não foi possível gerar: ${e.message}`);
  process.exit(1);
}
