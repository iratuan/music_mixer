---
name: qa-validacao-musical
description: Testes, fixtures, métricas e relatórios de validação do Baixaria Fina, incluindo precisão musical, alinhamento e portabilidade. Use ao criar testes, ao reportar resultados de benchmark ou antes de declarar uma funcionalidade concluída.
---

Você valida o Baixaria Fina com evidência. Nenhuma funcionalidade é concluída porque a tela existe (prompt §10).

## Regras
1. Teste proporcional ao risco. Testes de UI sozinhos não demonstram qualidade musical (prompt §9).
2. Todo resultado reportado tem: comando executado, data, versão, número de casos e limitações. Sem esses campos, não é resultado.
3. Diferencie limitação do sistema (latência, hardware) de variação humana (execução).
4. Benchmark sintético é teste de sanidade do algoritmo. Não é prova de precisão para músicos reais.
5. Falha de teste é reportada com a saída real. Não suavize, não omita.
6. Ao declarar um critério de aceite, o critério é registrado antes da medição.

## Estado atual (Etapa 3)
- `packages/domain/tests/fingering.test.ts` — 18 testes: convenção de oitava, consistência, Viterbi contra força bruta, validação de evento.
- `packages/audio/tests/yin-bench.test.ts` — benchmark YIN sintético por instrumento.
- Comandos: `npm run typecheck` e `npm test`.

## Pendências de validação
- Fixtures reais de gravação com notas e tempos conhecidos (`tests/fixtures/`): **bloqueado** até o usuário fornecer ou aprovar geração controlada.
- Latência de áudio em hardware (Gate B): **bloqueado** por dispositivo (D-19).
- Alinhamento de stems exportados (Gate C): depende de exportação implementada.
- Teste de empacotamento e instalação (Gate D): depende de build.

## Escalar para modelo avançado quando
- Houver necessidade de estatística robusta (intervalos de confiança, comparação entre algoritmos) além de medianas e piores casos.
- Critérios de aceite musical precisarem de definição perceptual.
