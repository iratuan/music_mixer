# Baixaria Fina 0.3.0 — notas da versão

## Instalação

`release-next/BaixariaFina-Setup-0.3.0.exe` (sem assinatura digital: o Windows pode pedir confirmação). Roda sem internet, pelo processador. Os componentes do separador agora são:
- separação: Python 3.11, torch 2.5.1 CPU, Demucs 4.1.0 e htdemucs_6s;
- análise: librosa;
- MIDI: Basic Pitch via ONNX;
- transposição: Rubber Band 4.0.0.

Num computador com o ambiente de GPU do projeto, o app usa a GPU e oferece também a divisão de voz.

## Removido (a pedido, para reescrever do zero)

- Análise do baixo, partitura, tablatura e fidelidade.
- Pista (tocar junto com o baixo da música).
- A biblioteca de exercícios antiga.

O código anterior está arquivado em `_arquivo/baixaria-fina-0.2.1-antes-da-limpeza.tgz`.

## Novo

**Escolha de faixas na separação**
- Baixo, bateria, guitarra, piano e outros, à escolha.
- Voz inteira ou voz principal e backing vocals. Esta última opção só existe no ambiente com GPU.
- O que não for escolhido vira uma faixa "Restante".

**Player da música** (abre ao clicar na música)
- **Faixas em tela cheia:** as faixas ocupam toda a área, com forma de onda, liga e desliga, solo, volume, e exportação em WAV e MIDI por faixa.
- **Régua de compassos:** mostra os acordes; clique para ir a um compasso e arraste para fazer loop de um trecho.
- **Análise da música inteira:**
  - andamento, compassos e acordes;
  - tom da música e tom de cada trecho, com aviso quando a gravação não está em Lá = 440 Hz.
- **Painel inferior ao tocar:**
  - compasso atual e tempos do compasso;
  - acorde com o grau no tom, e o próximo acorde;
  - notas do baixo do compasso no braço, com a nota atual e a próxima em destaque, para 4, 5 ou 6 cordas.
- **Transposição:** meio tom a meio tom (−6 a +6), sem mudar o andamento. Tom, acordes e notas acompanham.
- **Metrônomo:** é uma faixa a mais, alinhada aos tempos detectados da música.
- **Atalhos de teclado:**

  | Tecla | Ação |
  |---|---|
  | Espaço | Tocar ou pausar |
  | ← → | Compasso anterior ou seguinte |
  | `L` | Loop |
  | `M` | Metrônomo |
  | `+` / `−` | Tom |

**Exercícios** (motor do ScaleMonster)
- 6 famílias de escala: pentatônicas, blues, modos gregos, menor harmônica, menor melódica e simétricas.
- 15 padrões, de subir e descer a saltos de oitava, passando por 1-3-2-4.
- Região: 5 posições ou o braço inteiro. Grupos de cordas. Dedo, nota ou casa nas marcações.
- Andamento com aceleração automática, som das notas e metrônomo.
- Desafio pela UM2 ou pelo microfone: acerto, oitava errada e erro em cada nota, com porcentagem.

**Visual**
- Quatro temas: Escuro, Claro, Madeira e Papel.
- Cor própria por faixa.
- CSS consolidado num único conjunto de tokens.

## Verificado

| Verificação | Resultado |
|---|---|
| Testes de unidade | 45 passando |
| Roteiro completo no app (biblioteca isolada), 19 verificações | Passou. Inclui escolher faixas, separar, analisar, faixas ocupando a área (98%), painel acompanhando o compasso, notas do baixo no braço, solo, liga/desliga, metrônomo, transposição +1 com o tom exibido mudando, exportar WAV e MIDI, temas e exercício de oitavas tocando |
| Mesmo roteiro com voz principal e backing vocals | Passou (modelo de karaokê real, na GPU) |
| App empacotado, fora do projeto, só com o runtime de CPU | Separou baixo, bateria e "Restante"; analisou; transpôs +2; gerou MIDI |

Desempenho em Father To Son (6 min):
- runtime de CPU: análise em 30 s, MIDI do baixo em 7 s;
- GPU: divisão de voz em cerca de 3,5 min.

## Não verificado

- O desafio com o baixo real pela UM2. O juiz e o detector foram testados com sinais sintéticos (Mi1, Si0 e Sol2 detectados com erro menor que 5 cents).
- Instalação pelo instalador num computador limpo.
- A precisão dos acordes e do tom em vários estilos: só foi medida em poucas músicas.
- A correção de andamento pela metade em shuffle.

## Atenção

- Nesta máquina, durante os testes, o dispositivo de saída de som do Windows parou de processar áudio: o relógio ficou parado. O app agora avisa quando isso acontece.
- **Licenças a rever antes de distribuir:**
  - Rubber Band (GPL v2);
  - ffmpeg essentials (GPL v3, só no ambiente com GPU);
  - código do ScaleMonster (fork de Helton Gonçalves, licença ainda não definida).
