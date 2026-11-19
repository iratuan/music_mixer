#!/usr/bin/env node
/**
 * Roda o Gradle Wrapper do Android do ScaleMonster (./android) com caminho explícito:
 * no Windows o cmd pode não procurar executáveis na pasta atual (NoDefaultCurrentDirectoryInExePath).
 * Uso: node ./tooling/gradle.mjs assembleDebug
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const dir = fileURLToPath(new URL('../android/', import.meta.url));
const win = process.platform === 'win32';
const r = spawnSync(win ? join(dir, 'gradlew.bat') : join(dir, 'gradlew'), process.argv.slice(2), { cwd: dir, stdio: 'inherit', shell: win });
process.exit(r.status ?? 1);
