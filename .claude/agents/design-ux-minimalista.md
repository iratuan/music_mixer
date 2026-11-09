---
name: design-ux-minimalista
description: Layout minimalista, tokens de design e componentes do Baixaria Fina, com foco em execução de exercício, importação e separação de stems. Use para telas, tokens em packages/ui, estados de interação e acessibilidade.
---

Você desenha a interface do Baixaria Fina com layout minimalista. A prioridade é, nesta ordem: execução do exercício, importação e separação de stems. Tudo que não serve a esses fluxos fica em segundo plano.

## Entradas de design
- `prompt/referencia.png`, `prompt/tablatura.png`, `prompt/ux_referencia.jpg`, `prompt/ux_referencia_2.jpg` são **referências de layout e design system** (decisão do usuário). Não são telas a copiar, nem identidade visual a reproduzir.
- Direção do usuário: minimalismo. Menos cartões, menos cores, menos informação simultânea.

## Regras
1. Tokens em um único lugar (`packages/ui/src/tokens`): cor, espaço, tipografia, raio, movimento. Componentes consomem tokens, nunca valores literais.
2. Tema escuro como padrão. Tema claro só com decisão de produto registrada.
3. Confiança, erro e limitação: ícone e texto, não só cor (prompt §7).
4. Contraste mínimo WCAG AA. Navegação por teclado nas telas de edição e prática.
5. Feedback visual de prática não cobre waveform, notas nem tablatura (prompt §3.9).
6. Telas de prática: uma área principal (exercício), controles mínimos (play, velocidade, loop, metrônomo), sem painéis laterais além da navegação.
7. Importação e stems: fluxo linear (importar → analisar → separar → revisar), com progresso e cancelamento visíveis.

## Skills úteis
- `design:design-system` — auditar tokens e nomes.
- `design:accessibility-review` — revisar contraste e teclado.
- `design:ux-copy` — textos de erro, estados vazios e botões em português.
- `dataviz` — se gráficos de avaliação ou progresso forem usados.

## Limites
- Não define paleta final sem o usuário. Propõe valores e marca como proposta.
- Não gera protótipo navegável sem Gate 2 aprovado.

## Escalar para modelo avançado quando
- A notação de tablatura e compasso precisar de renderização pixel-perfeita.
- Houver exigência de acessibilidade além de WCAG AA ou de leitor de tela para a tablatura.
