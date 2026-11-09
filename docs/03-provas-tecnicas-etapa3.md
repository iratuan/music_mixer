# Etapa 3 — Provas técnicas: resultados e bloqueios

**Data:** 7 de novembro de 2026
**Comandos:** `npx tsc -p tsconfig.json --noEmit` e `npx vitest run` em `baixaria-fina/`.
**Ambiente:** Windows 11, Node 24.16.0, npm 11.13.0, TypeScript 5.9.3, Vitest 2.1.9, Electron 33.4.11.

## 1. Resultado objetivo

| Verificação | Resultado |
|---|---|
| Typecheck (strict, exactOptionalPropertyTypes, noUncheckedIndexedAccess) | Passa (exit 0) |
| Testes de domínio (`packages/domain`) | 18 passam |
| Benchmark YIN sintético (`packages/audio`) | 4 passam |
| Testes de segurança do processo principal (`apps/desktop`) | 6 passam |
| **Total** | **28 testes passam** |

Os testes validam propriedades (convenção de oitava, consistência corda/traste, otimalidade do mapeamento contra força bruta, validação de caminhos e CSP). **Não validam áudio real, latência nem qualidade de transcrição.**

## 2. O que foi provado

### 2.1 Convenção de altura e afinação
- E1 = MIDI 28 = 41,2 Hz. Nomes das cordas padrão de 4, 5 e 6 cordas coincidem com `prompt/MESTRE.md` §5.4.
- Toda posição gerada para toda altura jogável em 4, 5 e 6 cordas passa em `isConsistent`.

### 2.2 Mapeamento corda/traste (Viterbi)
- O estado do algoritmo é (posição atual, traste de referência da mão).
- **Defeito encontrado e corrigido nesta etapa:** a primeira versão tratava cordas soltas como se não houvesse custo de deslocamento a partir delas. Resultado: E1 solta → A1 no traste 5 saía mais barato que tudo solto. O estado de referência da mão corrige isso.
- Verificação: em cinco sequências curtas, o custo do Viterbi é igual ao mínimo da força bruta (`fingering.test.ts`).
- **Limite:** os pesos (`moveWeight`, `stringChangeWeight`, `fretWeight`, `openBonus`) são propostas. Não foram calibrados com tablatura de referência de músicos. Calibração exige fixtures (ver §4).

### 2.3 Detecção de pitch (YIN) — benchmark sintético
Sinal sintético: nota com 5 harmônicos (1, ½, ⅓, ¼, ⅕) e envelope exponencial, 93 ms de janela, 44,1 kHz.

| Caso | Notas | Detectadas | Mediana \|erro\| | Pior \|erro\| | Erros de oitava |
|---|---|---|---|---|---|
| 4 cordas, limpo | 36 | 36 | 0,01 cents | 0,08 cents | 0 |
| 5 cordas, limpo | 41 | 41 | 0,01 cents | 0,05 cents | 0 |
| 6 cordas, limpo | 46 | 46 | 0,01 cents | 0,07 cents | 0 |
| 4 cordas, SNR 20 dB | 36 | 36 | 0,46 cents | 3,42 cents | 0 |

**Leitura correta:** o algoritmo funciona em sinal limpo e idealizado. **Não é prova de precisão com baixo real.** Um baixo real tem ataque de palheta/dedo, ruído de traste, ressonâncias do corpo, sobreposição com bateria e piano. O prompt §9 exige fixtures reais antes de qualquer alegação.

### 2.4 Validação de eventos
- Evento com posição inconsistente é detectado (`inconsistent-position`), não corrigido em silêncio.
- Confiança fora de 0–1 e tempo negativo são rejeitados.

### 2.5 Processo principal (Electron) — segurança declarada
- `SECURE_WEB_PREFERENCES`: `contextIsolation`, `sandbox`, `nodeIntegration: false`, `webSecurity`.
- CSP sem `unsafe-eval`, `unsafe-inline`, nem origem remota.
- Canais IPC em allowlist; caminhos de áudio só aceitos se concedidos por diálogo nativo na sessão.
- Navegação externa bloqueada; `window.open` negado.
- **Não verificado em runtime:** a janela não foi aberta. O empacotamento do preload e o build ainda não existem (D-16). Configuração declarada não é configuração efetiva até a execução.

### 2.6 Fixtures derivadas de MIDI (atualização)
Seguindo sua indicação, o MIDI passou a ser a referência de verdade: `tooling/fixtures/gen-bass-fixtures.mjs` gera `tests/fixtures/midi-synth/` com 29 notas (B0 e E1–G3 cromático), 0,6 s cada, 0,8 s de passo, 48 kHz (taxa a confirmar no manual da UM2).

- O `.mid` é lido de volta no teste e bate com o `manifest.json` em altura e instante (±1 µs).
- YIN sobre o áudio renderizado, janela de 85 ms após o ataque, banda derivada do preset de 6 cordas:

| Arquivo | Detectadas | Mediana \|erro\| | Pior | Erros de oitava |
|---|---|---|---|---|
| `bass-common-clean.wav` | 29/29 | 0,01 cents | B0, +0,95 cents | nenhum |
| `bass-common-noisy.wav` (SNR 20 dB) | 29/29 | 0,40 cents | B0, +3,53 cents | nenhum |

- **Fundamental ausente** (só harmônicos 2–5), relatório sem critério de aceite: B0, E1, A1, D2 e G2 saíram todos com erro zero. Isso é resultado de um modelo sintético com espaçamento harmônico perfeito. Não prova o comportamento com baixo real, onde a fundamental fraca é o caso difícil (B-06).

**Limites desta medição:** o áudio é gerado por modelo com harmônicos decaindo exponencialmente, sem inarmonicidade de cordas, sem ruído de traste, sem ressonância de corpo, sem ataques de palheta ou dedo. As fixtures provam que o pipeline lê corretamente o que foi gerado; não provam como um baixo real soará.

### 2.7 Interface de áudio informada: UM2
- Windows enumera a UM2 como **"USB Audio CODEC"** (entrada e saída). "Codec" aqui é o nome do dispositivo USB, não um codec de áudio.
- Drivers ASIO encontrados no registro: **ASIO4ALL v2** e **ReaRoute ASIO (x64)**. Não há driver ASIO específico da Behringer no registro. Confirme no fabricante se a UM2 tem driver próprio.
- Taxa de amostragem, resolução e latência mínima da UM2 **não verificados aqui**. Use o manual ou o painel do driver. A latência real só sai do Gate B (medição com o aparelho).

## 3. Bloqueios — precisam de você ou de modelo mais avançado

| # | Item | Motivo do bloqueio | Quem resolve |
|---|---|---|---|
| B-01 | Latência de entrada e saída (Gate B) | Exige a UM2 conectada e medições reais. Dispositivo informado; medição ainda não feita. | Você executa; eu preparo o protocolo |
| B-02 | Escolha Web Audio ou módulo nativo (D-13) | Depende de B-01 | Você + medição |
| B-03 | Separação de fontes: modelo, licença, qualidade em CPU (D-14) | Exige avaliar modelos com dataset e revisar licenças; não há dataset | Modelo avançado + você (licença) |
| B-04 | Fixtures reais com notas e tempos conhecidos | Parcial: fixtures MIDI-sintéticas feitas (§2.6). Faltam gravações reais de baixo anotadas. | Você (gravações) |
| B-05 | Calibração dos pesos do mapeamento | Depende de tablatura de referência de músicos | Você + fixtures |
| B-06 | Fundamental fraca e harmônicos sem fundamental | Não implementado no benchmark | Modelo avançado (teoria de detecção) |
| B-07 | Polifonia (baixo com teclado ou guitarra no mesmo stem) | Fora do escopo do YIN monofônico | Modelo avançado |
| B-08 | Encoder MP3 e licença (D-15) | Decisão de distribuição | Você |
| B-09 | Empacotamento Electron e assinatura (Gate D) | Build e pipeline não definidos (D-16) | Você (escolha de ferramenta) |
| B-10 | Execução da janela Electron | Precisa de tela; não foi feita para não abrir janela na sua máquina | Você, com `npm run` após build |
| B-11 | Duplicata em `prompt/MESTRE.md` (linha 228) | Edição bloqueada pelo classificador de permissões | Você (remover a linha ou liberar a edição) |

## 4. Próximo passo se B-04 for liberado
Criar `tests/fixtures/` com pelo menos um arquivo de referência por instrumento (4, 5, 6 cordas), com notas em MIDI e tempos em segundos, e rodar o benchmark sobre áudio real. Medir erro de altura, oitava, onset e duração. Só então calibrar os pesos do mapeamento.

## 4. Interface desktop (Electron + React) — estado

**Como rodar:** `npm start` (build do renderer e do processo principal, depois `electron .`).

| Tela | O que faz | Verificação |
|---|---|---|
| Importar | Diálogo nativo → leitura controlada pelo processo principal → decodificação no navegador | Renderiza; importação com arquivo real **não testada** |
| Stems | Toca o original com volume e mudo. Separação **indisponível** (sem modelo, B-03) | Renderiza |
| Praticar | Instrumento, exercício, entrada (USB Audio CODEC), contagem de 4 tempos, metrônomo, referência em MIDI, detecção ao vivo com YIN, avaliação por nota | Renderiza; **execução com a UM2 não testada** |

**Verificação feita:** `npm test` (42 testes), `npx tsc` sem erros, build do Vite, build do esbuild e duas capturas de tela do Electron (telas Importar e Praticar). O Electron foi instalado a partir do zip oficial 33.4.11, com SHA-256 conferido contra `checksums.json`.

**Segurança aplicada:**
- Permissão de mídia só para áudio e só para o próprio app. Câmera é negada.
- Leitura de arquivo só para caminhos escolhidos no diálogo nesta sessão; limite de 500 MB.
- Entrada sem eco, supressão de ruído nem AGC (`echoCancellation`, `noiseSuppression`, `autoGainControl` desligados).
- Ao captar, a entrada não é ligada à saída (sem realimentação).

**Limites conhecidos (não resolvidos):**
- Latência: o campo de latência começa em 0 ms. Sem calibração no Gate B, a classificação de tempo não é confiável. Os instantes dos quadros usam o relógio do `AudioContext` menos o meio bloco da análise; a latência de hardware não foi medida.
- Caixas de som: o metrônomo e a nota de referência saem pela saída padrão do Windows. Se o microfone captar esse som, a detecção fica contaminada. Use a saída da UM2 ou fones; a saída da UM2 não foi verificada.
- Separação de stems: nenhum stem é gerado. A tela diz isso.
- Exercícios: 3 modelos fixos. Não há editor de exercício nem gravação de tentativa.

### 4.1 Capturas de tela (Playwright + Electron real)
- Geração: `npm run build` e depois `npm run screens` (`tooling/screens/capture.mjs`). Saída em `docs/screens/`.
- O script abre o app pelo mesmo processo principal e preload. Só o diálogo de arquivo é substituído por `tests/fixtures/midi-synth/bass-common-clean.wav`, para o fluxo rodar sem interação.
- Capturas: `01-importar.png`, `02-stems.png` (com o arquivo importado pelo IPC real), `03-praticar.png` (com a tablatura do exercício e a UM2 selecionada).
- **Não capturado:** a tela de execução e de resultado. Iniciar o exercício toca som nas caixas e usa o microfone. Fica para uma sessão com você presente.
