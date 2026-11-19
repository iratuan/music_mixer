# apps/mixer — MixerMonster

Produto A: estúdio de mixagem para o desktop. Biblioteca local, importação de arquivos e links, separação de faixas, análise musical, mixer multipista, transposição e exportação. Windows 10/11 x64 primeiro.

**Fronteira:** sem trilhas, XP, sequências, conquistas, cadastro de músicos nem julgamento de execução. O braço e o teclado são só visualizadores. A única ligação com o ScaleMonster é o pacote `.mcraft-pack` (botão "Enviar ao ScaleMonster").

## Telas

- **Biblioteca** (inicial): músicas, coleções, ordenação e filtros; exportar e importar a biblioteca.
- **Importar**: arquivo de áudio ou link do YouTube.
- **Baixar MP3**: salva o áudio de um link em V0 ou 320 kbps.
- **Música**: player com faixas, mixer, guias harmônicos, painel de acordes, transposição, metrônomo e exportações.

## Estrutura

```text
src/
  main/        processo principal: IPC, biblioteca, processos Python, downloads, segurança
  preload/     API tipada e mínima exposta ao renderer
  renderer/
    features/  uma pasta por tela: library/, import/, grab/, song/
    shared/    componentes comuns: Splash, StemPicker, Waveform
    lib/       áudio (Web Audio) e utilitários de faixas
    styles/    folhas globais, carregadas na ordem de main.tsx
tests/         testes do processo principal e da biblioteca
tooling/       ferramentas nativas e roteiros de verificação (ver abaixo)
electron-builder.json   configuração do instalador
```

## Comandos

Rodam na raiz do repositório:

- `npm run build`: renderer (Vite) e processo principal + preload (esbuild).
- `npm start`: abre o app a partir do build.
- `npm run pack:win`: pasta pronta para testar, em `release/`.
- `npm run dist:win`: instalador `release/MixerMonster-Setup-<versão>.exe` (NSIS, por usuário, com atalho).

O instalador leva o runtime Python, o Demucs e os pesos do `htdemucs_6s`, então a separação funciona sem internet. O modelo de voz não entra no instalador: é baixado quando você pedir.

**Identidade:** produto MixerMonster, `appId br.local.mixercraft`, pasta de dados `%APPDATA%/baixaria-fina`. Bibliotecas exportadas usam o formato `mixercraft-biblioteca`, então as antigas continuam importando.

**Ainda sem assinatura digital:** o Windows pode pedir confirmação ao instalar.

## Ferramentas externas

Binários, modelos e ambientes Python **não são versionados** (veja o `.gitignore`). Prepare estes itens em `apps/mixer/tooling/`:

| Item | Onde fica | Como obter |
|---|---|---|
| Runtime Python (torch CPU, Demucs, librosa, Basic Pitch) | `tooling/runtime/python` e `tooling/runtime/models` | `tooling/runtime/build-runtime.sh`. O script tem caminhos da máquina de origem (`BASE` e o cache do Hugging Face); ajuste antes de rodar. |
| ffmpeg | `tooling/stems/ffmpeg/ffmpeg.exe` | Build oficial do ffmpeg para Windows. |
| Rubber Band 4.0.0 (transposição) | `tooling/rubberband/rubberband-4.0.0-gpl-executable-windows/` | Executável oficial. Alternativa: variável `BF_RUBBERBAND`. |
| yt-dlp (download por link) | `tooling/ytdlp/yt-dlp.exe` | Release oficial. `tooling/ytdlp/SHA2-256SUMS` traz as somas para conferir. Alternativa: `BF_YTDLP`. |
| Ambiente com GPU (opcional) | `tooling/stems/.venv` | Venv com `torch` CUDA. Se existir, o app usa a GPU. |
| Modelo de divisão de voz (opcional) | Pasta de dados do app | Baixado pelo próprio app, quando você pedir. |

As licenças de cada ferramenta estão em [`tooling/licenses/`](tooling/licenses/).

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
        └─► exportação: WAV da mixagem · MIDI com mapa de andamento · mapa da música
```

O processo principal coordena os processos Python, com cancelamento e encerramento da árvore de processos. O renderer recebe só o que a interface precisa, por canais IPC com lista de permissões.

## Verificação

- **Automatizada:** `npm test` (Vitest) inclui `apps/mixer/tests`.
- **Ponta a ponta** (Electron real com Playwright, biblioteca isolada): roteiros em `tooling/screens/`. Eles precisam de uma biblioteca de exemplo e recebem o caminho como argumento, por exemplo:

  ```powershell
  npm run build
  node apps/mixer/tooling/screens/compact-check.mjs <pasta-de-dados> <id-da-musica>
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

- **Avaliações** com resposta conhecida: `tooling/fixtures/eval-*.py` (acordes, baixo e andamento), gerados por `gen-bass-fixtures.mjs`.

## Status

Versão 0.5.0-beta.3, em beta privado. Limitações conhecidas estão no [README da raiz](../../README.md#limitações-conhecidas) e nas notas de versão em [`docs/`](../../docs/README.md).
