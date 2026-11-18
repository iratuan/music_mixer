# @baixaria/exchange-contract

Contrato do pacote `.mcraft-pack` (versão 1): a linha do baixo de uma música, compasso a compasso com a harmonia, exportada pelo **MixerMonster** (Tablatura → "Enviar ao ScaleMonster") e importada pelo **ScaleMonster** (Prática → Música → "Importar música"). Os dois apps funcionam sem o outro instalado; o arquivo é o único ponto de contato.

- **Formato:** JSON UTF-8, sem áudio. Campos: `format: "mcraft-pack"`, `version: 1`, `createdAt`, `app {name, version}`, `song {title, source, key, bpm, bars[{chords, notes[{midi, beat, len}]}], sections[{name, from, to}]}`. Em `sections`, `from` e `to` são compassos, inclusive.
- **Importador:** `parsePack` trata o arquivo como não confiável: tamanho (2 MB), quantidades (2000 compassos, 64 notas por compasso), faixas numéricas, texto sem caracteres de controle. Nunca lança; devolve o erro em português.
- **Versões:** um pacote com `version` maior que a suportada é recusado com aviso para atualizar o ScaleMonster. Campos novos em versões compatíveis devem ser opcionais.
- **Testes:** `tests/pack.test.ts` (unidade) e `tooling/academy/pack-import-check.mjs` (importação no app).
