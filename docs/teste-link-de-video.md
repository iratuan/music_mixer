# Teste manual: importar pelo link de um vídeo

O roteiro automático (`node tooling/screens/url-import.mjs`) usa um yt-dlp falso e não depende da internet. Este é o passo com download real.

## Vídeo de teste

- **Big Buck Bunny**, Blender Foundation, licença Creative Commons Atribuição 3.0.
- Link: `https://www.youtube.com/watch?v=aqz-KE-bpKQ`
- Duração: 10:35, dentro do limite de 20 min.

## Passos

1. Importar → aba **Link de vídeo** → na primeira vez, ler o aviso e clicar em **Entendi**.
2. Colar o link (Ctrl+V já busca). A prévia mostra título, canal (Blender), site (youtube.com), duração e miniatura.
3. Formato FLAC, **Separar as faixas depois de baixar** marcado, só Baixo e Bateria, voz "Não separar".
4. Em **Começar tocando**, deixar o Baixo como "muda".
5. **Baixar e separar**. A barra mostra "Baixando · x MB/s", depois "Convertendo", depois a separação e a análise.
6. O player abre com Baixo, Bateria e Restante, e o Baixo desligado.
7. Na Biblioteca, o cartão mostra o selo "youtube.com". Clicar nele pede confirmação e abre o vídeo no navegador.

## Resultado em 08/11/2026

| Etapa | Resultado |
|---|---|
| Metadados (`yt-dlp -J`) | Título, canal, 635 s, `not_live`, miniatura em `i.ytimg.com` |
| Download do áudio (Opus 251) + conversão para FLAC | 6 s, 108 MB |
| Aviso do yt-dlp | "No supported JavaScript runtime": ver D-40. O áudio baixou mesmo assim. |

## Limites conhecidos

- Os sites mudam e o yt-dlp quebra de tempos em tempos: use **Atualizar baixador**.
- Vídeos privados, pagos, só para membros, com restrição de idade ou com DRM não são baixados: o app não usa conta nem cookies.
- Playlists são recusadas: um vídeo por vez.
