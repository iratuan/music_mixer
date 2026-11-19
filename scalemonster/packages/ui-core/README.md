# packages/ui-core

Tokens de design, tema e componentes visuais compartilhados entre os dois produtos: Knob, Icons, Progress, braço, teclado, acordes, pauta, círculo das quintas, mapa harmônico e inspetor de condução de vozes.

**Regras:** componentes controlados por props, sem acesso a IPC, banco ou bridge. Alvos de toque com pelo menos 44 px.

**Conteúdo:**
- `tokens.css`: importado como `@baixaria/ui-core/tokens.css`.
- `lib/`: store, tema, erros e store de sincronia harmônica.
- `components/`: 12 componentes visuais.

As classes de estilo desses componentes ainda estão nas folhas globais de cada app (`styles/`). Mover essas classes para o pacote é um passo futuro.
