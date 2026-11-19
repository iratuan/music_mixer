<p align="center">
  <img src="docs/assets/logo.png" alt="MixerMonster e ScaleMonster" width="220">
</p>

<h1 align="center">Baixaria Fina</h1>

<p align="center">
  Monorepo com dois produtos para baixistas e músicos: <b>MixerMonster</b> (estúdio de mixagem) e <b>ScaleMonster</b> (formação e prática).
</p>

<p align="center">
  <img src="https://img.shields.io/badge/vers%C3%A3o-0.5.0--beta.3-2979ff" alt="Versão 0.5.0-beta.3">
  <img src="https://img.shields.io/badge/Electron-33-1f2430" alt="Electron 33">
  <img src="https://img.shields.io/badge/Capacitor-8-1f2430" alt="Capacitor 8">
  <img src="https://img.shields.io/badge/TypeScript-5-1f2430" alt="TypeScript 5">
  <img src="https://img.shields.io/badge/status-beta%20privado-orange" alt="Beta privado">
</p>

---

## Sumário

- [Os dois produtos](#os-dois-produtos)
- [Estrutura do repositório](#estrutura-do-repositório)
- [Início rápido](#início-rápido)
- [Comandos](#comandos)
- [Testes e verificação](#testes-e-verificação)
- [Arquitetura](#arquitetura)
- [Documentação](#documentação)
- [Limitações conhecidas](#limitações-conhecidas)
- [Licença e créditos](#licença-e-créditos)

---

## Os dois produtos

| | **MixerMonster** (`apps/mixer`) | **ScaleMonster** (`apps/academy`) |
|---|---|---|
| Para | Separar, analisar e estudar as faixas de uma música | Estudar escalas, harmonia, percepção auditiva e tocar no palco |
| Plataforma | Windows 10/11 x64 (Electron) | Navegador, desktop (Electron) e Android (Capacitor) |
| Identificador | `br.local.mixercraft` | `br.local.scalemonster` |
| Dados | `%APPDATA%/baixaria-fina` | `%APPDATA%/scalemonster` (desktop); banco próprio no Android |
| Precisa de internet | Não, exceto para baixar por link ou o modelo de voz | Não (100% offline) |

Os dois produtos **não dependem um do outro para funcionar**. O único ponto de contato é o arquivo `.mcraft-pack`: o MixerMonster exporta a linha do baixo de uma música e o ScaleMonster a importa (contrato em [`packages/exchange-contract`](packages/exchange-contract/README.md)).

Resumo do que cada um faz:

- **MixerMonster:** importa um arquivo ou link, separa as faixas (Demucs), detecta andamento, compassos, acordes e seções, mostra a linha do baixo no braço, transpõe (Rubber Band) e exporta mixagem WAV, MIDI e mapa da música.
- **ScaleMonster:** trilhas de escalas e exercícios no braço, ear training, teoria e harmonia, treino com palco e juiz de notas, e músicas importadas do MixerMonster.

---

## Estrutura do repositório

```text
apps/
  mixer/           MixerMonster (Electron + React). Ferramentas nativas em apps/mixer/tooling/
    src/main/        processo principal: IPC, biblioteca, processos Python, downloads
    src/preload/     API mínima e tipada exposta ao renderer
    src/renderer/    interface: features/ (telas), shared/ (componentes comuns), lib/, styles/
    tests/           testes do processo principal e da biblioteca
    tooling/         Python, ffmpeg, Rubber Band, yt-dlp, modelos e roteiros de verificação
  academy/         ScaleMonster (web, shell Electron e Android com Capacitor)
    src/             features/ (telas por área), shared/, platform/, data/, lib/, domain/, styles/
    shells/desktop/  Electron mínimo que embrulha o build web
    android/         projeto nativo Capacitor (Gradle)
    tests/           testes de dados e do domínio pedagógico
    tooling/         responsive-check, pack-import-check, gradle, geração de ícones
packages/
  music-theory/    notas, escalas, acordes, harmonia, baixo, MIDI (puro, sem plataforma)
  audio-synth/     síntese WebAudio, WAV, metrônomo, relógio master
  ui-core/         tokens de design, tema e componentes visuais base
  exchange-contract/  formato .mcraft-pack (exportação e importação entre os produtos)
build/             ícone do MixerMonster (instalador e atalho)
tests/fixtures/    áudio de teste controlado
docs/              decisões, notas de versão, próximos passos e capturas
```

**Regra de dependência:** os pacotes em `packages/` não conhecem Electron, Capacitor, React nem o banco. Os apps dependem dos pacotes, nunca o contrário. Um app não importa código do outro: a troca é feita pelo arquivo `.mcraft-pack`.

---

## Início rápido

```powershell
git clone https://github.com/iratuan/music_mixer.git
cd music_mixer
npm install
```

Para rodar o MixerMonster no desktop:

```powershell
npm run build     # renderer (Vite) + processo principal e preload (esbuild)
npm start         # abre o MixerMonster a partir do build
```

Para rodar o ScaleMonster no navegador:

```powershell
npm run academy:dev       # desenvolvimento, em http://localhost:5174
```

Para separar, analisar e transpor de verdade, antes é preciso preparar as ferramentas em [`apps/mixer/README.md`](apps/mixer/README.md#ferramentas-externas).

---

## Comandos

**Raiz (vale para o monorepo)**

| Comando | Faz |
|---|---|
| `npm install` | Instala as dependências de todos os workspaces. |
| `npm run typecheck` | Checagem de tipos (MixerMonster e ScaleMonster). |
| `npm test` | Testes automatizados (Vitest). |

**MixerMonster**

| Comando | Faz |
|---|---|
| `npm run build` | Gera o renderer e o processo principal. |
| `npm start` | Abre o app a partir do build. |
| `npm run pack:win` | Pasta pronta para testar (`release/`). |
| `npm run dist:win` | Instalador NSIS (`release/MixerMonster-Setup-<versão>.exe`). |

**ScaleMonster**

| Comando | Faz |
|---|---|
| `npm run academy:dev` | Servidor de desenvolvimento (porta 5174). |
| `npm run academy:build` | Build web em `apps/academy/dist/`. |
| `npm run academy:preview` | Serve o build (porta 4174). |
| `npm run academy:desktop:start` | Abre o shell Electron. |
| `npm run academy:desktop:dist` | Instalador do shell desktop (Windows). |
| `npm run academy:android:apk` | APK de depuração (precisa de JDK 21 e Android SDK). |
| `npm run academy:android:release` | AAB de release (assinatura via `gradle.properties`, veja abaixo). |
| `npm run academy:check:responsive` | Confere layout e toque em 5 dispositivos × 8 telas. |

**Assinatura de release do ScaleMonster:** o `build.gradle` só assina o release se `gradle.properties` tiver `SCALEMONSTER_KEYSTORE`, `SCALEMONSTER_KEY_ALIAS` e as senhas. As chaves (`*.jks`, `*.keystore`) não são versionadas.

---

## Testes e verificação

- **Automatizados:** `npm test` roda os 275 testes de `packages/`, `apps/mixer/tests`, `apps/academy/tests` e `tests/`.
- **Mixer, ponta a ponta:** os roteiros em `apps/mixer/tooling/screens/` abrem o app real (Electron + Playwright) com uma biblioteca isolada. Ex.: `node apps/mixer/tooling/screens/compact-check.mjs <userData> <id>`.
- **ScaleMonster, interface:** `npm run academy:check:responsive` (Chrome ou Edge) confere telas, vídeo do palco e toque nos dispositivos de [`apps/academy/tooling/responsive-check.mjs`](apps/academy/tooling/responsive-check.mjs).
- **Pacote `.mcraft-pack`:** `apps/academy/tooling/pack-import-check.mjs`.

---

## Arquitetura

- **Fronteiras de segurança (Electron):** `contextIsolation`, `sandbox`, CSP, protocolo próprio e canais IPC com lista de permissões. O renderer recebe só o que a interface precisa.
- **Persistência do ScaleMonster:** um `DatabaseAdapter` com sql.js. No navegador o banco fica no IndexedDB; no desktop e no Android, em arquivo, com gravação atômica e backups.
- **Telas do ScaleMonster:** organizadas por área em `src/features/`. Estilos globais ficam em `src/styles/`, na ordem definida em `main.tsx`.
- **Áudio:** síntese e metrônomo em `packages/audio-synth`; captura de microfone e juiz de notas no ScaleMonster; player multipista no MixerMonster.

Decisões técnicas estão em [`docs/decisoes.md`](docs/decisoes.md).

---

## Documentação

| Arquivo | Conteúdo |
|---|---|
| [`docs/README.md`](docs/README.md) | Índice da documentação, com o que é atual e o que é histórico. |
| [`docs/decisoes.md`](docs/decisoes.md) | Decisões técnicas e de produto. |
| [`docs/05-two-separate-codebases.md`](docs/05-two-separate-codebases.md) | Separação em dois produtos (monorepo). |
| [`apps/mixer/README.md`](apps/mixer/README.md) | MixerMonster: status, instalador, ferramentas. |
| [`apps/academy/README.md`](apps/academy/README.md) | ScaleMonster: status, plataformas, comandos. |
| [`packages/*/README.md`](packages/) | Regras e status de cada pacote compartilhado. |

---

## Limitações conhecidas

**MixerMonster**
- **Só Windows** por enquanto. O código é multiplataforma, mas o empacotamento e as ferramentas estão preparados apenas para Windows x64.
- **Instalador sem assinatura digital.**
- **Acordes com extensões** (9, 11, 13) ainda não são detectados; o modo Completo usa as 9 qualidades atuais.
- **CAGED** é uma aproximação: a forma é escolhida pela corda da raiz e pela facilidade de execução, não por uma tabela fixa das cinco formas.
- **Transposição leva alguns segundos:** cada tom novo gera de novo as faixas com o Rubber Band. O player segue tocando, e vale o último tom pedido.
- **A voz também muda de tom** junto com as demais faixas, inclusive na mixagem exportada.
- **Download por link** depende do `yt-dlp` e das regras do YouTube no momento.

**ScaleMonster**
- **Loop do vídeo do palco no Android:** tocar o loop em emulador trava o app. Problema ainda não resolvido: a escolha entre loop menor ou quadro parado no Android está em aberto.
- **Assinatura de release (AAB):** exige a chave do próprio dono, que não vem no repositório.
- **Web MIDI** não está disponível no WebView do Android.

---

## Licença e créditos

- Código do projeto: **licença ainda não definida** (uso privado).
- Componentes de terceiros têm licenças próprias, inclusive o **Rubber Band** (GPL). Os avisos estão em [`apps/mixer/tooling/licenses/`](apps/mixer/tooling/licenses/).
- Ferramentas usadas pelo MixerMonster: **Demucs** (separação), **Basic Pitch** (transcrição), **librosa** (análise), **Rubber Band** (transposição), **yt-dlp** (download), **mido** e **pretty_midi** (MIDI). Modelo de voz: Mel-Band RoFormer karaokê (aufr33/viperx).
- O projeto não distribui músicas. Use apenas arquivos e vídeos sobre os quais você tem direito de uso.
