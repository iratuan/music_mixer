# Baixaria Fina 0.5.0 beta — notas da versão

## Beta 3

`release-next/BaixariaFina-Setup-0.5.0-beta.3.exe` (494 MB). Ajustes finos:

- **MIDI exportado com os compassos da música:** o arquivo traz o mapa de andamento da análise; num editor de partitura ou DAW, as barras de compasso caem nas da gravação (inclusive ao vivo) e o começo vira um compasso de entrada.
- **Andamento variável** aparece também no mapa (texto e PDF) e na Biblioteca ("86–123 BPM"); cabeçalho da música mais compacto.
- **Download do modelo de voz:** desiste de uma conexão travada depois de 60 s e explica falhas de rede em português; tentar de novo continua de onde parou.
- Mensagens de erro do processamento com acentos corretos.

Verificação: 135 testes unitários; player (25), música real (18), andamento ao vivo (8), compactação (8), ciclo de vida (7).

## Beta 2

`release-next/BaixariaFina-Setup-0.5.0-beta.2.exe` (494 MB).

- **Andamento variável:** gravações ao vivo e músicas que aceleram têm os compassos acompanhando o andamento. O cabeçalho mostra, por exemplo, "86–123 BPM · variável"; se a grade não bater com a música, "usar andamento fixo" refaz com um andamento só. O BPM do painel mostra o do trecho atual. Músicas já analisadas mostram "Atualizar análise".
- **Faixas em FLAC:** cada música separada ocupa cerca de um quarto do espaço anterior, sem perda. Na Biblioteca, "Compactar agora" converte as músicas que você já tem.
- **Voz principal e backing vocals no instalador:** ao escolher "Principal e backing", o app oferece baixar o modelo (913 MB, uma vez). Pelo processador leva ~10–14 min numa música de 4 min.

Verificação da beta 2: 129 testes unitários; andamento (`eval-tempo.py`), compactação (`compact-check.mjs`, 8), andamento numa música ao vivo (`tempo-check.mjs`, 6), ciclo de vida (7), player (25 e 18); no app empacotado fora do projeto, download real do modelo (21 s nesta conexão, SHA-256 conferido) e separação com voz principal e backing pelo processador (`voice-download-check.mjs`, 8).

## Beta 1

### Instalação

`release-next/BaixariaFina-Setup-0.5.0-beta.1.exe` (494 MB; instalado ocupa ~2,2 GB). Sem assinatura digital: o Windows mostra "O Windows protegeu o computador" → "Mais informações" → "Executar assim mesmo".

Na beta 1, cada música separada ocupava de 60 a 150 MB por minuto (WAV); a partir da beta 2, cerca de um quarto disso (FLAC).

### Para quem testa o beta

- **Registros:** no rodapé da barra lateral, "Registros" abre a pasta com `main.log`. Ao relatar um problema, anexe esse arquivo e diga a música (ou o link) e o que fez.
- **Licenças:** "Licenças" abre os avisos dos componentes de terceiros (FFmpeg GPLv3, Rubber Band GPLv2 e as demais).
- A versão aparece no mesmo rodapé (v0.5.0 beta 1).

### Novo desde a 0.4.1

**Player**
- Mixagem: marque as faixas e exporte a mistura em WAV.
- Faixas ocupam toda a altura; braço do baixo em toda a largura.
- Piano: teclado guiado pela harmonia (acorde base na mão esquerda, arpejo na direita) ou pela gravação.
- Baixo: digitação por zona da mão, rótulo "Dedo", aviso de troca de zona e **sem corda solta** (só quando a nota não existe presa).
- Mapa da música: partes detectadas (Intro, Refrão, Ponte…), renomear, juntar, dividir, loop por parte; exporta PDF e texto.
- Acordes mais detalhados (maj7, sus, dim, m7b5) e inversões (C/E). Músicas antigas mostram "Atualizar análise".

**Biblioteca**
- Excluir músicas (uma ou várias) e coleções livres (arrastar para a coleção, filtrar, renomear).

**Precisão**
- Transcrição do baixo com os ataques do próprio áudio: 91% → 98% das notas certas no teste de referência; notas fantasmas quase zeradas. Músicas já importadas refazem o MIDI do baixo ao abrir.

**Estabilidade**
- Separação com **Cancelar**.
- Fechar o app encerra separação, análise e downloads em andamento (antes o Python continuava rodando escondido).
- Uma janela só: abrir o app de novo traz a janela existente para a frente (duas cópias corromperiam a biblioteca).
- Progresso real na divisão de voz (antes parecia travar em 86%).
- Aviso de pouco espaço em disco antes de separar (1,5 GB) ou baixar (600 MB).
- Pedidos repetidos (mesma análise, mesmo MIDI) não abrem processos duplicados.
- Se a tela do app cair, ela recarrega sozinha e o caso fica no registro.

### Limitações conhecidas do beta

- Separação no instalador usa só a CPU: uma música de 4 min leva alguns minutos.
- Andamento: mudanças bruscas de mais de ~15% entre seções não são seguidas (use "usar andamento fixo" se a grade ficar estranha).
- Sem atualização automática: cada beta é um instalador novo (a biblioteca é mantida).

### Verificação

- 122 testes unitários.
- Player completo (25 verificações), música real com piano/mapa (18), ciclo de vida dos processos (7).
- App empacotado copiado para fora do projeto, só com o runtime embutido: separou, analisou, transpôs e gerou MIDI.
