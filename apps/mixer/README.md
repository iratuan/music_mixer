# apps/mixer

Produto A — Estúdio & Mixer. Desktop autocontido (Windows primeiro): biblioteca local, importação, separação de stems, mixer multipista, transposição e exportação. Todos os binários nativos (Python embutido, FFmpeg, Rubber Band, yt-dlp, modelos) vão dentro do instalador.

**Fronteira negativa:** sem trilhas, XP, streaks, conquistas, cadastro de músicos ou julgamento de execução. O braço do instrumento é só um inspetor passivo.

**Status (E4):** código movido de `apps/desktop` (`git mv`, histórico preservado). Telas: Biblioteca (inicial), Importar, Baixar MP3 e Música. Sem banco SQLite, sem IPC `db:call`, sem `PROFILE`; o renderer só importa `@baixaria/{music-theory,audio-synth,ui-core}`.

- Build: `npm run build` / `npm start` na raiz (o pacote Electron ainda é a raiz, porque `tooling/` com Python, FFmpeg e modelos é resolvido a partir dela).
- Instalador: `npm run dist:win` usa [`electron-builder.json`](electron-builder.json) (`appId br.local.mixercraft`, mesma pasta de dados `%APPDATA%/baixaria-fina`, sem migração).
