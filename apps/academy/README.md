# apps/academy — ScaleMonster

Produto B — Formação & Prática Musical. Aplicação web pura (WebAudio, SQLite embarcado via `DatabaseAdapter`) empacotada para desktop, tablet e Android (APK/AAB). 100% offline.

**Fronteira negativa:** sem download de mídia externa, sem separação de stems, sem mixer multipista, sem FFmpeg/Python/IA nativa, sem imports de `electron` ou `node:*` no núcleo.

**Status (E5): roda no navegador.** `npm run academy:dev` (desenvolvimento, porta 5174) ou `npm run academy:build` + `npm run academy:preview` (porta 4174). Saída estática em `apps/academy/dist/`.

- `src/platform/database.ts`: `DatabaseAdapter` (assíncrono). `src/platform/sqljs.ts`: implementação sql.js/WebAssembly, que entrega o arquivo inteiro a cada transação confirmada.
- `src/platform/web.ts`: plataforma navegador (banco no IndexedDB, arquivos pelo seletor do navegador ou download). `src/platform/bridge.ts`: `PlatformBridge`, a única porta das telas para a plataforma.
- `src/data/schema.ts` (migrações v1–v3, iguais às do app antigo) e `src/data/services.ts` (regras de músicos, sessões, missões, conquistas, ear training e teoria, portadas sem mudar SQL). Operações em fila, cada escrita numa transação; leituras não regravam o banco.
- Testes: `apps/academy/tests/data.test.ts` (sql.js real em Node).
- Sem `electron`, `node:*` ou `window.baixaria` em `src/`.
- Pendências: PDF do mapa harmônico (a web não gera PDF; `exportMapPdf` é opcional na bridge), poda das folhas de estilo copiadas do Mixer, shells desktop (E6) e Android (E7), responsividade/toque (E8), importação do `mixercraft.sqlite` legado (E6).

**Status (E6): shell desktop.** `npm run academy:desktop:start` (desenvolvimento), `npm run academy:desktop:pack` / `academy:desktop:dist` (Windows). Código em [`shells/desktop/`](shells/desktop/): Electron mínimo que só embrulha o build web.

- Protocolo próprio `academy://app` (origem estável para IndexedDB, `fetch` do WebAssembly e CSP `'self'` + `'wasm-unsafe-eval'`); janela endurecida (sandbox, contextIsolation, navegação e popups bloqueados, só microfone de áudio e MIDI).
- IPC mínimo com origem conferida: banco (`academy.sqlite` na pasta de dados, gravação atômica, só aceita SQLite), salvar arquivo (diálogo do sistema, tipos fixos), importação do legado.
- Backups em `backups/` ao abrir e antes de importar (ficam os 3 últimos).
- Importação do `mixercraft.sqlite` do app antigo: oferta dentro do app até o aluno decidir; COPIA (o original fica intocado), confere por SHA-256 e registra a decisão em `legacy-import.json`.
- Identidade oficial (Decisão 1): ScaleMonster, `br.local.scalemonster`, pasta `%APPDATA%/scalemonster` (`shells/desktop/src/policy.ts`).
- Sem Python, FFmpeg, modelos ou yt-dlp no pacote (271 MB descompactado, quase tudo é o runtime do Electron).
- Pendências: ícone próprio, PDF do mapa harmônico (pode usar `printToPDF` do shell), histórico de prática legado guardado no localStorage do app antigo (não é alcançável a partir do arquivo SQLite).

**Status (E7): Android (Capacitor 8).** `npm run academy:android:apk` gera `android/app/build/outputs/apk/debug/app-debug.apk` (precisa de JDK 21 e Android SDK; `ANDROID_HOME`). `npm run academy:android:sync` só copia o build web para o projeto nativo.

- `capacitor.config.ts`: `br.local.scalemonster`, `webDir: dist`, `loggingBehavior: 'none'` (o logcat não recebe o banco do aluno).
- `src/platform/android.ts`: o mesmo build web no WebView; banco `scalemonster.sqlite` na área privada do app (Filesystem, gravação atômica com `.tmp` + rename, backups dos 3 últimos inícios); salvar arquivos pela folha de compartilhamento (Share).
- Manifesto: microfone (`RECORD_AUDIO`) para o juiz de notas e o afinador; `INTERNET` é o padrão do Capacitor (o app funciona offline).
- Projeto nativo em `android/` versionado (fontes Gradle); `assets/public`, `build/` e APKs ficam fora do Git.
- Banco no Android usa sql.js + arquivo (sem plugin nativo de terceiros); o `DatabaseAdapter` permite trocar por SQLite nativo depois sem mexer nas regras.
- Pendências: ícone/splash nativos do ScaleMonster (hoje os do Capacitor), assinatura de release (AAB), Web MIDI indisponível no WebView do Android, layout de celular e toque (E8).
