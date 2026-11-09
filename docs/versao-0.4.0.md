# Baixaria Fina 0.4.0 — notas da versão

## Instalação

`release-next/BaixariaFina-Setup-0.4.0.exe` (494 MB, sem assinatura digital: o Windows pode pedir confirmação). Em relação à 0.3.0, entram:
- o baixador yt-dlp 2026.10.26;
- o ffmpeg 9.0.2.

## Novo: importar pelo link de um vídeo

**Na tela Importar**, há duas abas: "Arquivo" (como antes) e "Link de vídeo".

1. **Aviso de uso responsável:** aparece só na primeira vez, com o botão "Entendi".
2. **Prévia:** cole o link; o Ctrl+V já busca. Aparecem miniatura, título, canal, site e duração.
3. **Formato:** FLAC (recomendado), MP3 320 ou WAV.
4. **Separar as faixas depois de baixar**, opcional:
   - o mesmo seletor de faixas da separação, com voz inteira ou voz principal e backing vocals, e qualidade rápida ou precisa;
   - **Começar tocando:** cada faixa escolhida, e a "Restante", começa ativa ou muda. Por exemplo, baixo mudo para tocar junto.
5. **Progresso em etapas:** "Baixando · x MB/s", "Convertendo", depois separação e análise na fila de segundo plano.
   - Dá para trocar de tela durante o download; o menu mostra um ponto em "Importar".
   - "Cancelar" encerra o download e apaga os arquivos parciais.
6. **Erros com o motivo:**
   - vídeo indisponível;
   - exige login;
   - privado ou pago;
   - restrição de idade;
   - site não suportado;
   - acima de 20 min;
   - ao vivo;
   - playlist;
   - sem internet;
   - baixador desatualizado, com "Atualizar baixador".
7. **Mesmo vídeo de novo:** a prévia avisa que ele já está na biblioteca e oferece abri-lo.
8. **Atualizar baixador:** pede confirmação e nunca atualiza sozinho. A versão em uso aparece no rodapé.

**No player:**
- abre com o estado ativo ou mudo escolhido;
- liga, solo e volume continuam ao vivo;
- **"Salvar como padrão"** grava o estado atual na música, inclusive para músicas importadas de arquivo.

**Na biblioteca:**
- **Miniatura do vídeo** no cartão.
- **Selo com o site de origem:** clicar pede confirmação e abre o vídeo no navegador do sistema.
- **Remover:** a música baixada é apagada junto, porque o app é dono do arquivo. Um arquivo importado do computador continua intocado.

## Segurança

- **Link:** só `https://`. São recusados usuário e senha no link, IP local ou de rede privada, nomes de rede local e links com mais de 2 KB.
- **yt-dlp:** roda sem shell, sem arquivos de configuração, sem plugins e sem cookies (nem os do navegador), com o link depois de `--`.
- **Miniatura:** baixada pelo processo principal, só imagem e até 1 MB. A tela do app continua sem acesso à rede.
- **Identificação das músicas:** o renderer só envia ids. Os caminhos são montados no processo principal.

## Verificado

| Verificação | Resultado |
|---|---|
| Testes de unidade | 91 passando, 46 deles novos: validação do link, metadados, progresso, mensagens de erro, migração do registro antigo, estado inicial |
| Roteiro do link de vídeo com yt-dlp falso, separação e análise reais (`url-import.mjs`) | 23 verificações passaram |
| Roteiro anterior (`capture.mjs`) | 19 verificações passaram, sem regressão |
| Download real com o yt-dlp do projeto (Big Buck Bunny, CC-BY) | Metadados e áudio: 10 min em 6 s, FLAC de 108 MB |
| App empacotado, fora do projeto, download real (`portable-url-check.mjs`) | yt-dlp e ffmpeg embutidos: prévia com miniatura em 5,7 s, download em 5,5 s. Separou baixo, bateria e "Restante" pela CPU em 3,3 min (10 min de música). O baixo ficou gravado para começar mudo. |
| App empacotado, fora do projeto, fluxo da 0.3.0 (`portable-check.mjs`) | Passou |

## Não verificado

- A instalação pelo instalador num computador limpo.
- Sites além do YouTube.

## Atenção

- **YouTube e runtime JavaScript:** o yt-dlp atual pede um runtime JavaScript (Deno, ou Node 22 ou mais recente) para o YouTube. O do Electron é antigo demais. O áudio baixa mesmo assim, por enquanto. Se parar, ver D-40.
- **Licenças:**
  - O ffmpeg embutido é GPL v3; antes de distribuir publicamente, trocar por uma build LGPL ou cumprir a GPL (D-41).
  - O yt-dlp é Unlicense, de domínio público.
  - Continuam válidas as observações da 0.3.0 sobre o Rubber Band (GPL v2) e o código do ScaleMonster.
- **Uso:** o recurso é para conteúdo que você tem direito de baixar.
