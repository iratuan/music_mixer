# MixerMonster

Estúdio de mixagem para Windows. Você importa uma música (arquivo ou link), o app separa as faixas, analisa andamento, compassos, acordes e seções, mostra a linha do baixo no braço e exporta a mixagem.

Esta pasta é um projeto completo e independente: tem o próprio `package.json`, `node_modules`, build e instalador. Não depende da pasta `scalemonster/`.

## O que ele faz

- **Biblioteca:** músicas, coleções, busca e ordenação. Exporta e importa a biblioteca inteira.
- **Importar:** arquivo de áudio ou link do YouTube (via yt-dlp).
- **Baixar MP3:** salva o áudio de um link em V0 ou 320 kbps.
- **Separação de faixas:** Demucs `htdemucs_6s` (voz, baixo, bateria, guitarra, piano, outros). Roda offline.
- **Análise:** andamento, compassos, acordes, tom e seções.
- **Transcrição:** baixo e piano com Basic Pitch, com digitação no braço e nas mãos.
- **Mixer multipista:** volume e silêncio por faixa, com player em Web Audio.
- **Transposição:** Rubber Band gera as faixas no tom escolhido.
- **Exportação:** WAV da mixagem, MIDI com mapa de andamento, mapa da música e o pacote `.mcraft-pack` para o ScaleMonster.
- **Modelo de voz (opcional):** Mel-Band RoFormer karaokê, para separar voz principal e backings. Baixado sob demanda.

**Fronteira:** o MixerMonster não tem trilhas, XP, conquistas, cadastro de músicos nem julgamento de execução. O braço e o teclado são só visualizadores. A única ligação com o ScaleMonster é o arquivo `.mcraft-pack`.

## Início rápido

Para desenvolver, dentro desta pasta:

```powershell
cd mixermonster
npm install
npm run build      # renderer (Vite) + processo principal e preload (esbuild)
npm start          # abre o app a partir do build
```

Para separar, analisar e transpor de verdade, antes prepare as ferramentas externas (seção abaixo). Sem elas o app abre, mas as etapas de processamento falham.

## Comandos

Rodam dentro de `mixermonster/`:

| Comando | Faz |
|---|---|
| `npm run typecheck` | Checagem de tipos (TypeScript estrito). |
| `npm test` | Testes unitários e de integração (Vitest), do app e dos pacotes. |
| `npm run build` | Gera `dist/`. |
| `npm start` | Abre o app a partir do build. |
| `npm run pack:win` | Pasta pronta para testar, em `release/`. |
| `npm run dist:win` | Instalador `release/MixerMonster-Setup-<versão>.exe` (NSIS, por usuário, com atalho). |
| `node tooling/make-exercise.mjs <música> --de N --ate M --titulo "..." --nivel K` | Gera um exercício de um trecho de música exportada. Protocolo em `docs/06-protocolo-exercicios.md`. |
| `node tooling/validate-pack.mjs <arquivo>` | Valida um `.mcraft-pack` de música ou exercício. |

O instalador leva o runtime Python, o Demucs e os pesos do `htdemucs_6s`, então a separação funciona sem internet. O modelo de voz não entra no instalador.

**Instalador sem assinatura digital:** o Windows pode pedir confirmação ao instalar.

## Estrutura

```text
src/
  main/              processo principal: IPC, biblioteca, processos Python, downloads, segurança
  preload/           API tipada e mínima exposta ao renderer
  renderer/
    features/        uma pasta por tela: library/, import/, grab/, song/
    shared/          componentes comuns: Splash, StemPicker, Waveform
    lib/             áudio (Web Audio) e utilitários de faixas
    styles/          folhas globais, carregadas na ordem de main.tsx
packages/            cópias de music-theory, audio-synth, ui-core e exchange-contract
tests/               testes do processo principal, da biblioteca e fixtures
tooling/             ferramentas nativas, roteiros de verificação e licenças
build/               ícone do instalador
electron-builder.json, vite.config.ts, vitest.config.ts, tsconfig.json
```

**Segurança (Electron):** `contextIsolation`, `sandbox`, CSP, protocolo próprio e canais IPC com lista de permissões. O renderer recebe só o que a interface precisa. Arquivos e links são tratados como não confiáveis.

**Identidade:** produto MixerMonster, `appId br.local.mixercraft`, dados em `%APPDATA%/baixaria-fina`. Bibliotecas exportadas usam o formato `mixercraft-biblioteca`, então as antigas continuam importando.

## Ferramentas externas

Binários, modelos e ambientes Python não são versionados (veja o `.gitignore`). Prepare estes itens em `tooling/`:

| Item | Onde fica | Como obter |
|---|---|---|
| Runtime Python (torch CPU, Demucs, librosa, Basic Pitch) | `tooling/runtime/python` e `tooling/runtime/models` | `tooling/runtime/build-runtime.sh`. O script tem caminhos da máquina de origem (`BASE` e o cache do Hugging Face); ajuste antes de rodar. |
| ffmpeg | `tooling/stems/ffmpeg/ffmpeg.exe` | Build oficial do ffmpeg para Windows. |
| Rubber Band 4.0.0 (transposição) | `tooling/rubberband/rubberband-4.0.0-gpl-executable-windows/` | Executável oficial. Alternativa: variável `BF_RUBBERBAND`. |
| yt-dlp (download por link) | `tooling/ytdlp/yt-dlp.exe` | Release oficial. `tooling/ytdlp/SHA2-256SUMS` traz as somas para conferir. Alternativa: `BF_YTDLP`. |
| Ambiente com GPU (opcional) | `tooling/stems/.venv` | Venv com `torch` CUDA. Se existir, o app usa a GPU. |
| Modelo de voz (opcional) | Pasta de dados do app | Baixado pelo próprio app, quando você pedir. |

As licenças de cada ferramenta estão em [`tooling/licenses/`](tooling/licenses/). O Rubber Band é GPL.

## Como o áudio é processado

```text
arquivo ou link ──► yt-dlp (se for link)
        │
        ▼
  Demucs htdemucs_6s ──► voz · baixo · bateria · guitarra · piano · outros   (FLAC)
        │                    └─ opcional: RoFormer karaokê ──► voz principal · backings
        ▼
  análise (tooling/stems/bf_tools.py)
     andamento · compassos · acordes · tom · seções
        │
        ├─► transcrição do baixo e do piano (Basic Pitch) ──► digitação no braço e nas mãos
        ├─► transposição (Rubber Band) ──► faixas no tom escolhido
        └─► exportação: WAV da mixagem · MIDI com mapa de andamento · mapa da música · .mcraft-pack
```

O processo principal coordena os processos Python, com cancelamento e encerramento da árvore de processos.

## Verificação

- **Automatizada:** `npm test` (Vitest).
- **Ponta a ponta** (Electron real com Playwright, biblioteca isolada): roteiros em `tooling/screens/`. Eles recebem a pasta de dados e o id da música como argumentos:

  ```powershell
  npm run build
  node tooling/screens/compact-check.mjs <pasta-de-dados> <id-da-música>
  ```

  | Roteiro | Confere |
  |---|---|
  | `library-collections.mjs`, `library-delete.mjs` | coleções, lixeira e exclusão na biblioteca |
  | `compact-check.mjs` | compactação da biblioteca em FLAC |
  | `chords-upgrade.mjs` | atualização da análise para a versão 2 |
  | `piano-check.mjs` | teclado do painel inferior |
  | `tempo-check.mjs`, `perf-check.mjs` | andamento e desempenho |
  | `ipc-check.mjs`, `lifecycle-check.mjs` | canais IPC e encerramento dos processos Python |
  | `portable-check.mjs`, `portable-url-check.mjs`, `url-import.mjs` | versão portátil e importação por link (com `fake-ytdlp.mjs`) |
  | `voice-download-check.mjs` | download do modelo de voz |
  | `capture.mjs` | capturas de tela |

- **Avaliações com resposta conhecida:** `tooling/fixtures/eval-*.py` (acordes, baixo e andamento), gerados por `gen-bass-fixtures.mjs`.

## Limitações conhecidas

- **Só Windows x64** por enquanto. O código é multiplataforma, mas o empacotamento e as ferramentas estão preparados só para Windows.
- **Instalador sem assinatura digital.**
- **Acordes com extensões** (9, 11, 13) ainda não são detectados.
- **CAGED** é uma aproximação: a forma é escolhida pela corda da raiz e pela facilidade de execução.
- **Transposição leva alguns segundos:** cada tom novo gera de novo as faixas. Vale o último tom pedido.
- **A voz também muda de tom** junto com as demais faixas, inclusive na mixagem exportada.
- **Download por link** depende do yt-dlp e das regras do YouTube no momento.

## Status

Versão 0.5.0-beta.3, beta privado. Notas de versão e decisões em [`docs/`](../docs/README.md). Visão geral dos dois produtos no [README da raiz](../README.md).
