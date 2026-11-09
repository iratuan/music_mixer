# Baixaria Fina 0.2.0 — notas da versão

## Instalação

`release-next/BaixariaFina-Setup-0.2.0.exe` (cerca de 355 MB, sem assinatura digital: o Windows pode pedir confirmação).
Inclui o separador (Python 3.11, torch 2.5.1 CPU, Demucs 4.1.0, modelo htdemucs_6s) e o Rubber Band 4.0.0.
Funciona sem internet. Num computador com o ambiente de GPU do projeto, o app usa a GPU.

## O que há de novo

**Músicas**
- Importar já separa a música nas 6 faixas e guarda na biblioteca.
- Mixer na biblioteca: tocar todas, tocar só uma faixa, ligar e desligar faixas durante a música, volume por faixa.
- Separação rápida ou precisa (duas passadas deslocadas).

**Análise do baixo**
- Usa a faixa de baixo separada por padrão.
- Fidelidade: cada nota da tablatura é comparada com o que a faixa toca (cobertura, altura certa, oitava), com piano roll e escuta comparada (faixa, notas, as duas juntas). Notas suspeitas podem ser corrigidas com um clique.
- Notas ligadas (legato, slide) viram notas separadas; afinação da gravação compensada (e informada).
- Andamento e início do compasso detectados.
- Partitura: pausas, figuras pontuadas, ligaduras, barras de colcheia, bemóis conforme a tonalidade, baixo escrito uma oitava acima (convenção), acordes só quando o baixo os sustenta.

**Prática**
- Biblioteca de 133 exercícios em 10 categorias, com variações (1×, 2× ou 4× por nota, grupos de cordas, velocidade crescente).
- Estudo da música: trecho, velocidade de 50% a 100% com a música real desacelerada sem mudar o tom.
- Avaliação de altura e de ritmo (no tempo, adiantado, atrasado, tendência), pontuação 70% altura e 30% ritmo.
- Calibração de latência por cliques, usada em Exercícios e na Pista.

## 0.2.1 (correções e partitura)

`release-next/BaixariaFina-Setup-0.2.1.exe`

- **Correção: silenciar faixa (tela Faixas).** A faixa "Original" (a música inteira) tocava junto com as faixas separadas, então silenciar uma faixa não mudava o som. Agora a Original começa silenciada quando há faixas separadas.
- **Correção: indicador de carregamento da Análise.** "Carregando a faixa de baixo separada…" podia ficar preso na tela ao trocar de música durante o carregamento; a tela também mostrava por um instante a música inteira antes do baixo. A transcrição e a medição de fidelidade agora mostram o progresso real (%).
- **Partitura com armadura de clave**, conforme a tonalidade detectada. Acidentes só onde a armadura não os dá, valendo até o fim do compasso, com bequadro quando necessário.
- **Acidentes desenhados em vetor:** antes, ♯ ♭ ♮ podiam sair coloridos, na fonte de emoji.
- **Linhas densas** (muitas semicolcheias): 2 compassos por linha, com o dobro de espaço.
- **Exportação MusicXML** (MuseScore, Guitar Pro, Sibelius, Finale): partitura com armadura, ligaduras, pausas e acordes, mais corda e casa de cada nota para o programa montar a tablatura. O baixo vai escrito uma oitava acima, com a transposição declarada.

## Medições

| Faixa de baixo separada | Fidelidade antes | Fidelidade agora | Andamento detectado |
|---|---|---|---|
| Another One Bites The Dust | 89 | 96 | 109,8 BPM (referência: 110) |
| The Fairy Feller's Master-Stroke | 81 | 95 | 105,4 BPM (sem referência) |
| Arquivo sintético de teste | 100 | 100 | 75 BPM (exato) |

A fidelidade mede a coerência entre as notas e o que o detector ouve na faixa separada; não é comparação com uma partitura de referência.

## Verificado

- 171 testes de unidade e 26 verificações do fluxo completo (importação, separação real, mixer, exportações, análise, fidelidade, exercícios, estudo a 75% com Rubber Band, teste de entrada).
- Caminho do instrumento com microfone falso do Chromium: Lá1 detectado; Lá1 contra Lá2 esperado marcado como oitava errada.
- Runtime embutido separando sem internet pela CPU (24 s de áudio em cerca de 14 s).

## Não verificado

- Tocar com o baixo real pela UM2: avaliação, ritmo e calibração de latência dependem disso.
- Instalação pelo instalador num computador limpo.
- Músicas com afinação diferente de A = 440 Hz em que o tom conhecido difere do mais próximo: a tela oferece transpor meio tom.
