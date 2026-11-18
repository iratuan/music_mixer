# legacy/

`db.main.ts` é o banco do Academy como rodava no processo principal do Electron (sql.js asm,
gravado em `userData/mixercraft.sqlite`, schema v3: usuários, trilhas, XP, ear training,
missões e conquistas). Estacionado aqui na Etapa E4, quando saiu do Mixer.

Na Etapa E5 as migrações e os serviços daqui passam para `DatabaseAdapter` (desktop, Android e
web), e este arquivo é removido. Ele depende de `electron` e `node:*`, que são proibidos no núcleo
do Academy: nada fora de `legacy/` deve importá-lo.
