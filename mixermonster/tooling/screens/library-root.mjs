// Pasta da biblioteca de um userData: a escolhida pelo usuário (library-location.json) ou a padrão.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function libraryRoot(userData) {
  const loc = join(userData, 'library-location.json');
  if (existsSync(loc)) {
    try {
      const root = JSON.parse(readFileSync(loc, 'utf8')).root;
      if (root && existsSync(root)) return root;
    } catch {
      // arquivo inválido: usa a pasta padrão
    }
  }
  return join(userData, 'library');
}
