# apps/academy

Produto B — Formação & Prática Musical. Aplicação web pura (WebAudio, SQLite embarcado via `DatabaseAdapter`) empacotada para desktop, tablet e Android (APK/AAB). 100% offline.

**Fronteira negativa:** sem download de mídia externa, sem separação de stems, sem mixer multipista, sem FFmpeg/Python/IA nativa, sem imports de `electron` ou `node:*` no núcleo.

**Status (E5): roda no navegador.** `npm run academy:dev` (desenvolvimento, porta 5174) ou `npm run academy:build` + `npm run academy:preview` (porta 4174). Saída estática em `apps/academy/dist/`.

- `src/platform/database.ts`: `DatabaseAdapter` (assíncrono). `src/platform/sqljs.ts`: implementação sql.js/WebAssembly, que entrega o arquivo inteiro a cada transação confirmada.
- `src/platform/web.ts`: plataforma navegador (banco no IndexedDB, arquivos pelo seletor do navegador ou download). `src/platform/bridge.ts`: `PlatformBridge`, a única porta das telas para a plataforma.
- `src/data/schema.ts` (migrações v1–v3, iguais às do app antigo) e `src/data/services.ts` (regras de músicos, sessões, missões, conquistas, ear training e teoria, portadas sem mudar SQL). Operações em fila, cada escrita numa transação; leituras não regravam o banco.
- Testes: `apps/academy/tests/data.test.ts` (sql.js real em Node).
- Sem `electron`, `node:*` ou `window.baixaria` em `src/`.
- Pendências: PDF do mapa harmônico (a web não gera PDF; `exportMapPdf` é opcional na bridge), poda das folhas de estilo copiadas do Mixer, shells desktop (E6) e Android (E7), responsividade/toque (E8), importação do `mixercraft.sqlite` legado (E6).
