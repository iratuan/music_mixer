# apps/academy

Produto B — Formação & Prática Musical. Aplicação web pura (WebAudio, SQLite embarcado via `DatabaseAdapter`) empacotada para desktop, tablet e Android (APK/AAB). 100% offline.

**Fronteira negativa:** sem download de mídia externa, sem separação de stems, sem mixer multipista, sem FFmpeg/Python/IA nativa, sem imports de `electron` ou `node:*` no núcleo.

**Status (E4): estacionado, ainda não executável.** As telas (Início, Trilhas, Exercícios, Prática sobre música, Harmonia, Teoria, Ear training, Músicos, Conquistas), seus componentes e libs saíram do Mixer para `src/` via `git mv`. O banco que rodava no processo principal está em [`src/legacy/db.main.ts`](src/legacy/db.main.ts).

- Typecheck próprio: `tsc -p apps/academy/tsconfig.json` (incluso em `npm run typecheck`).
- `src/env.d.ts` declara o bridge legado (`db`, exportações) que as telas ainda chamam.
- Próximo: Etapa E5 (build web com Vite, `DatabaseAdapter` e `PlatformBridge`), depois os shells desktop (E6) e Android (E7), conforme a Decisão 2 (Capacitor vs. Tauri).
- As folhas de estilo continuam em `apps/mixer/src/renderer/styles/`; o Academy copia as suas na E5.
