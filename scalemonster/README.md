# ScaleMonster

Produto B: formação e prática musical. Uma aplicação web única, com banco embarcado e 100% offline, empacotada para navegador, desktop (Electron) e Android (Capacitor, APK e AAB). Tela pensada para celular, tablet e desktop.

**Fronteira:** sem download de mídia externa, sem separação de faixas, sem mixer multipista, sem FFmpeg, Python ou IA nativa. O núcleo de `src/` não importa `electron` nem `node:*`. A única ligação com o MixerMonster é o arquivo `.mcraft-pack`.

## Áreas

Cada área do app fica em `src/features/`:

| Pasta | Conteúdo |
|---|---|
| `features/home/` | Início, painel de progresso |
| `features/trails/` | Trilhas de escalas e técnica |
| `features/practice/` | Exercícios, metrônomo, afinador, palco de desafio (`stage/`) |
| `features/ear/` | Ear training |
| `features/harmony/` | Harmonia e círculo das quintas |
| `features/theory/` | Teoria e leitura |
| `features/songs/` | Músicas importadas do MixerMonster |
| `features/profile/` | Perfis de músicos e conquistas |

Componentes comuns ficam em `src/shared/`. Regras puras (currículo, gamificação, juiz de notas, engine de ear training, cifras) ficam em `src/domain/`, sem React nem plataforma.

## Estrutura

```text
src/
  App.tsx, main.tsx     entrada e navegação (botão Voltar do Android incluído)
  features/             telas por área (acima)
  shared/               componentes comuns
  platform/             DatabaseAdapter, bridge, implementações: web, desktop, android
  data/                 esquema (migrações) e serviços do banco
  lib/                  áudio de ouvido, captura de microfone e MIDI, utilidades
  domain/               regras musicais e pedagógicas (sem plataforma)
  styles/               folhas globais, carregadas na ordem de main.tsx
  assets/               logos, fundo do palco e vídeos do desafio
shells/desktop/         shell Electron que embrulha o build web
android/                projeto nativo Capacitor (Gradle)
tests/                  testes de dados e do domínio
tooling/                verificações e ferramentas (ver abaixo)
```

## Persistência por plataforma

- **Navegador:** banco sql.js (WebAssembly) guardado no IndexedDB.
- **Desktop:** arquivo `academy.sqlite` na pasta de dados (`%APPDATA%/scalemonster`), gravação atômica e backups dos 3 últimos inícios.
- **Android:** arquivo `scalemonster.sqlite` na área privada do app (Capacitor Filesystem), mesma política de gravação e backups.

Toda a escrita passa por `DatabaseAdapter` (`src/platform/database.ts`), então trocar a implementação não muda as regras.

## Comandos

Rodam na raiz do repositório:

| Comando | Faz |
|---|---|
| `npm run dev` | Desenvolvimento em `http://localhost:5174`. |
| `npm run build` | Build estático em `dist/`. |
| `npm run preview` | Serve o build em `http://localhost:4174`. |
| `npm run desktop:start` | Abre o shell Electron. |
| `npm run desktop:pack` / `:dist` | Pasta pronta ou instalador do shell (Windows). |
| `npm run android:sync` | Copia o build web para o projeto Android. |
| `npm run android:apk` | APK de depuração. Precisa de JDK 21 e Android SDK (`ANDROID_HOME`). |
| `npm run android:release` | AAB de release. Assina só se `gradle.properties` tiver `SCALEMONSTER_KEYSTORE` e as senhas. |
| `npm run check:responsive` | Telas, toque e vídeo do palco em 5 dispositivos. |

**Shell desktop:** protocolo próprio `academy://app`, janela com sandbox e `contextIsolation`, navegação e popups bloqueados, só microfone e MIDI. Importa o `mixercraft.sqlite` do app antigo por cópia (o original não é alterado), conferido por SHA-256.

**Android:** `capacitor.config.ts` usa `br.local.scalemonster`, `webDir: dist` e `loggingBehavior: 'none'`, para o logcat não expor o banco. Permissão de microfone para o juiz de notas e o afinador. Ícone e splash são gerados por `tooling/make-android-art.py` a partir de `src/assets/logo.png`.

**Vídeo do palco (desafio):** a abertura (0–10 s, com som) toca antes das notas, e o loop (11–20 s, sem som) fica atrás da pista. Em paisagem nos tablets e desktops; com "reduzir animações", mostra um quadro parado. Tocar o loop no emulador Android trava o app; a solução (loop menor ou quadro parado no Android) ainda não foi escolhida.

## Verificação

- **Automatizada:** `npm test` (Vitest) inclui `tests`.
- **Tipos:** `npm run typecheck` checa também este app.
- **Responsividade e toque:** `npm run check:responsive` (precisa de Chrome ou Edge).
- **Importação de pacote:** `tooling/pack-import-check.mjs`.
- **Gradle:** `tooling/gradle.mjs` roda o wrapper pelo caminho explícito (o `gradlew` não funciona direto no Windows).

## Status

Versão 0.5.0-beta.3. Em aberto: loop do vídeo no Android (travada no emulador), assinatura de release com a chave do próprio dono e Web MIDI indisponível no WebView do Android.
