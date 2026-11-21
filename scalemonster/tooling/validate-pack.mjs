#!/usr/bin/env node
/**
 * Valida um .mcraft-pack (música ou exercício) com o mesmo contrato usado pelos dois produtos.
 * Uso: node tooling/validate-pack.mjs <arquivo.mcraft-pack>
 * Saída: 0 se válido, 1 se inválido (lista todos os problemas), 2 se faltou o arquivo.
 * Protocolo: docs/06-protocolo-exercicios.md
 */
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const file = process.argv[2];
if (!file) {
  console.error('uso: node tooling/validate-pack.mjs <arquivo.mcraft-pack>');
  process.exit(2);
}

// Empacota o contrato (TypeScript) e carrega o resultado como módulo, sem dependências extras.
const contract = fileURLToPath(new URL('../../packages/exchange-contract/src/index.ts', import.meta.url));
const out = await build({ entryPoints: [contract], bundle: true, format: 'esm', platform: 'neutral', write: false, logLevel: 'silent' });
const lib = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);

const r = lib.parseExchange(readFileSync(file));
if (!r.ok) {
  console.log(`INVÁLIDO: ${r.error}`);
  for (const i of r.issues ?? []) console.log(`  - ${i.path || '(raiz)'}: ${i.message}`);
  process.exit(1);
}
if (r.kind === 'exercise') {
  const e = r.pack.exercise;
  console.log(`OK exercício "${e.title}": nível ${e.level}, ${e.steps.length} notas, ${e.tuning.length} cordas, ${e.bpm} BPM, origem ${e.origin.type}`);
} else {
  console.log(`OK música "${r.pack.song.title}": ${r.pack.song.bars.length} compassos, ${r.pack.song.bpm} BPM`);
}
