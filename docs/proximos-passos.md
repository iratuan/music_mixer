# Próximos passos

Anotado em 08/11/2026, a pedido do usuário.

## 1. Compactar a biblioteca (FLAC)

- O recurso existe desde a beta 2: na Biblioteca, botão **Compactar agora** (D-53).
- Em 08/11/2026 às 21:09, antes de compactar, a biblioteca real estava vazia: índice sem músicas e pastas das músicas removidas, com o app aberto. A causa não foi confirmada. O único caminho no código que remove pastas de músicas é excluir pela Biblioteca. Os testes automáticos usam pastas temporárias próprias e terminaram antes das 18:57.
- Para fazer: compactar depois de reimportar as músicas. As músicas novas já saem em FLAC.
- Proteção sugerida: exclusão pela Lixeira do Windows (`shell.trashItem`) em vez de apagar de vez, e exclusão em massa pedindo confirmação com os nomes.

## 2. Qualidade da captura (download pelo link)

- **Fonte:** hoje o pedido é `bestaudio/best` e depois recodificado para FLAC. No YouTube o melhor áudio já é com perda (Opus ~130–160 kbps ou AAC 128 kbps), então o FLAC só aumenta o tamanho sem ganho de qualidade.
  - Preferir o fluxo original (Opus/M4A) sem recodificar. Decodificar só para a separação.
  - Mostrar na prévia o codec e o bitrate da fonte.
- **Escolha do formato:** preferir `bestaudio[acodec=opus]` (melhor que AAC na mesma taxa). Avisar quando a fonte for ruim (< 96 kbps, mono, ao vivo gravado de celular).
- **Nível:** detectar áudio clipado ou com volume muito baixo na fonte e avisar antes de separar.

## 3. Qualidade da separação das faixas

- **Medir antes de mudar:** montar uma avaliação com verdade conhecida, nos moldes de `eval-chords.py`, `eval-bass.py` e `eval-tempo.py`.
  - Mixes feitas a partir de faixas separadas de uso livre, com SDR por faixa (baixo, bateria, voz, outros, guitarra, piano).
  - Precisa de um conjunto de faixas com licença compatível; o MUSDB18 é só para pesquisa.
- **Candidatos:**
  - `htdemucs_ft` (4 faixas, ajustado por faixa: baixo, bateria e voz melhores que o `htdemucs_6s`). Guitarra e piano continuariam vindo do 6s.
  - Voz e instrumental por um RoFormer (BS-RoFormer viperx, SDR de voz ~12,9 contra ~8–9 do Demucs), e o Demucs aplicado sobre o instrumental para os instrumentos. Menos vazamento de voz no baixo e na guitarra.
  - Qualidade "Precisa" com mais passadas (`--shifts`) e sobreposição maior, só na GPU.
  - Ensemble (média ponderada de dois modelos) para baixo e bateria.
- **Custos a pesar:**
  - Tamanho do instalador: modelos baixados sob demanda, como o de voz (D-54).
  - Tempo na CPU, hoje ~3–5 min por música com o `htdemucs_6s` rápido.
- **Prioridade para o baixista:** baixo limpo, sem bumbo nem voz vazando. Isso também melhora a transcrição do baixo, cuja análise de ataques já sofre com o bumbo vazando (D-50).
