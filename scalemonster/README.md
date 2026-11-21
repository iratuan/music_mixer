# ScaleMonster

Aplicativo de formação e prática musical para baixistas e músicos. Trilhas de escalas no braço, exercícios, ear training, teoria e harmonia, treino no palco com juiz de notas e músicas importadas do MixerMonster.

Esta pasta é um projeto completo e independente: tem o próprio `package.json`, build, shell desktop e projeto Android. Não depende da pasta `mixermonster/`.

Roda em três lugares a partir do mesmo código:

- **Navegador** (desenvolvimento e uso web).
- **Desktop Windows** (shell Electron que embrulha o build web).
- **Android** (Capacitor, APK de depuração e AAB de release).

Funciona 100% offline. Não usa rede, FFmpeg, Python nem IA.

## O que ele faz

| Área | Conteúdo |
|---|---|
| Início | Painel de progresso e atalhos. |
| Trilhas | Trilhas de escalas e técnica, por etapa. |
| Prática | Exercícios, metrônomo, afinador e o palco de desafio. |
| Ear training | Reconhecimento de intervalos, acordes e escalas por ouvido. |
| Harmonia | Harmonia e círculo das quintas. |
| Teoria | Teoria e leitura. |
| Músicas | Músicas importadas do MixerMonster (pacote `.mcraft-pack`). |
| Perfis | Perfis de músicos e conquistas. |

**Fronteira:** sem download de mídia, sem separação de faixas, sem mixer multipista. O núcleo de `src/` não importa `electron` nem `node:*`. A única ligação com o MixerMonster é o arquivo `.mcraft-pack`.

## Início rápido

Dentro desta pasta:

```powershell
cd scalemonster
npm install
npm run dev        # desenvolvimento em http://localhost:5174
```

## Comandos

Rodam dentro de `scalemonster/`:

| Comando | Faz |
|---|---|
| `npm run dev` | Desenvolvimento em `http://localhost:5174`. |
| `npm run typecheck` | Checagem de tipos (TypeScript estrito). |
| `npm test` | Testes de dados, domínio e pacotes (Vitest). |
| `npm run build` | Build estático em `dist/`. |
| `npm run preview` | Serve o build em `http://localhost:4174`. |
| `npm run check:responsive` | Telas, toque e vídeo do palco em 5 dispositivos. Precisa de Chrome ou Edge e do `preview` rodando. |
| `npm run check:exercise` | Importação de exercício (biblioteca, Tocar, Remover). Precisa do `preview` rodando na porta 4174. |
| `node tooling/validate-pack.mjs <arquivo>` | Valida um `.mcraft-pack` de música ou exercício. Protocolo em `docs/06-protocolo-exercicios.md`. |
| `npm run desktop:start` | Abre o shell Electron a partir do build. |
| `npm run desktop:pack` | Pasta pronta do shell desktop. |
| `npm run desktop:dist` | Instalador `ScaleMonster-Setup-<versão>.exe` e portable `ScaleMonster-Portable-<versão>.exe` em `shells/desktop/release/`. |
| `npm run android:sync` | Copia o build web para o projeto Android. |
| `npm run android:apk` | APK de depuração. Roda em celulares e tablets Android 7.0 ou mais novos (minSdk 24, alvo 36), de qualquer processador. Precisa de JDK 21 e Android SDK (`ANDROID_HOME`). |
| `npm run android:release` | AAB de release. Assina só se `android/gradle.properties` tiver `SCALEMONSTER_KEYSTORE` e as senhas. |

**Assinatura de release:** o `build.gradle` assina o release só quando `gradle.properties` tem `SCALEMONSTER_KEYSTORE`, `SCALEMONSTER_KEY_ALIAS` e as senhas. As chaves (`*.jks`, `*.keystore`) não são versionadas. Sem elas, `assembleRelease` gera um APK não assinado.

## Estrutura

```text
src/
  App.tsx, main.tsx     entrada e navegação (botão Voltar do Android incluído)
  features/             telas por área: home, trails, practice (stage/), ear, harmony,
                        theory, songs, profile
  shared/               componentes comuns
  platform/             DatabaseAdapter e implementações: web, desktop, android
  data/                 esquema (migrações) e serviços do banco
  lib/                  áudio de ouvido, captura de microfone e MIDI, utilidades
  domain/               regras musicais e pedagógicas (sem plataforma)
  styles/               folhas globais, carregadas na ordem de main.tsx
  assets/               logos, fundo do palco e vídeos do desafio
packages/ (na raiz do repositório): music-theory, audio-synth, ui-core e exchange-contract, compartilhados
shells/desktop/       shell Electron que embrulha o build web
android/              projeto nativo Capacitor (Gradle)
tests/                testes de dados e do domínio
tooling/              verificações e ferramentas (ver abaixo)
capacitor.config.ts   id br.local.scalemonster, webDir dist
```

## Persistência

Toda escrita passa por `DatabaseAdapter` (`src/platform/database.ts`), então trocar a implementação não muda as regras do app.

- **Navegador:** banco sql.js (WebAssembly) guardado no IndexedDB.
- **Desktop:** arquivo `academy.sqlite` em `%APPDATA%/scalemonster`, com gravação atômica e backups dos 3 últimos inícios.
- **Android:** arquivo `scalemonster.sqlite` na área privada do app (Capacitor Filesystem), com a mesma política de gravação e backups.

O nome `academy` do arquivo e do protocolo do desktop (`academy://app`) é o nome da versão anterior e ficou para não quebrar dados existentes.

**Migração do app antigo (desktop):** o shell importa o `mixercraft.sqlite` da versão anterior por cópia. O original não é alterado, e a cópia é conferida por SHA-256.

## Shell desktop e Android

- **Desktop:** janela com sandbox e `contextIsolation`, navegação e popups bloqueados, só microfone e MIDI liberados.
- **Android:** `loggingBehavior: 'none'`, para o logcat não expor o banco. Permissão de microfone para o juiz de notas e o afinador. Ícone e splash são gerados por `tooling/make-android-art.py` a partir de `src/assets/logo.png`.

## Vídeo do palco

No desafio, a abertura (0 a 10 s, com som) toca antes das notas, e o loop (11 a 20 s, sem som) fica atrás da pista. O vídeo aparece em paisagem em tablets e desktops. Com "reduzir animações" ativado, mostra um quadro parado.

## Verificação

- **Automatizada:** `npm test` e `npm run typecheck`.
- **Responsividade e toque:** `npm run check:responsive` (com `npm run preview` rodando em outra janela; se a porta 4174 estiver ocupada, passe a URL como argumento: `node tooling/responsive-check.mjs http://localhost:<porta>`).
- **Importação de pacote:** `node tooling/pack-import-check.mjs [url]`, com o preview rodando.
- **Gradle:** `tooling/gradle.mjs` roda o wrapper pelo caminho explícito, porque no Windows o `gradlew` não roda direto.

## Limitações conhecidas

- **Loop do vídeo do palco no Android:** tocar o loop no emulador trava o app. A escolha entre loop menor ou quadro parado no Android ainda está em aberto.
- **Assinatura de release:** exige a chave do próprio dono, que não vem no repositório.
- **Web MIDI** não está disponível no WebView do Android.
- **Instaladores sem assinatura digital** e com o ícone padrão do Electron no shell desktop.

## Status

Versão 0.5.0-beta.3, beta privado. Visão geral dos dois produtos no [README da raiz](../README.md).
