// Monta o shell desktop do Academy: processo principal e preload (esbuild) + o build web já gerado
// em apps/academy/dist, copiado para dist/renderer. Uso: npm run academy:desktop:build (na raiz).
import { build } from 'esbuild';
import { cp, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const web = here('../../dist');
await stat(here('../../dist/index.html')).catch(() => {
  throw new Error('build web ausente: rode "npm run academy:build" antes');
});
await rm(here('dist'), { recursive: true, force: true });
const common = { bundle: true, platform: 'node', format: 'cjs', external: ['electron'], target: 'node20', logLevel: 'info' };
await build({ ...common, entryPoints: [here('src/main.ts')], outfile: here('dist/main.cjs') });
await build({ ...common, entryPoints: [here('src/preload.ts')], outfile: here('dist/preload.cjs') });
await cp(web, here('dist/renderer'), { recursive: true });
console.log('shell desktop do Academy pronto em', here('dist'));
