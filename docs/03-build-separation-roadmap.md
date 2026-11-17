# Build Separation Roadmap: Etapas 3-5

**Estado:** Etapas 0-2 completas. Etapas 3-5 pendentes.  
**Branch:** `feat/profiles-build-separation`  
**Commits:** 5 (profiles + preload + handlers-prep + roteamento)

---

## Sumário do Concluído

### Etapa 0: Profiles Base
✅ `src/config/profiles.ts` — PROFILE type, FEATURES flags (Mixer vs Academy)  
✅ `vite.config.ts` — Process.env.PROFILE + define + alias  
✅ `package.json` — cross-env scripts para build:mixer/academy:{desktop,web}

### Etapa 1: Preload Condicional
✅ `apps/desktop/src/preload/preload.ts` — 3 shared + 40 Mixer IPC channels  
✅ Academy recebe apenas db(), getAppInfo(), openAppFolder()  
✅ Mixer recebe full API (separateStems, analyzeSong, grabFetch, etc.)  
⏳ **Etapa 1-Final (Handlers):** Extrair 45 handlers para handlers-mixer.ts (1028 linhas, pendente)

### Etapa 2: Roteamento Condicional
✅ `apps/desktop/src/renderer/lib/features.ts` — FEATURES const + helpers  
✅ `App.tsx` — Conditional nav sections via `{FEATURES.GRAB_MP3 && ...}`  
✅ Mixer: 7 nav sections | Academy: 5 nav sections  
✅ Tree-shaking ready

---

## Etapa 3: Heavy Dependencies (Python/FFmpeg/yt-dlp) — PRÓXIMO

**Objetivo:** Carregar dependencies pesadas apenas para Mixer profile.

### Arquivos-chave
- `apps/desktop/src/main/main.ts` (1760 linhas)
  - Funções: `stemsPython()`, `ffmpegDir()`, `runPython()`, `runRubberbandPitch()`
  - Imports: Demucs, voice model, tools
  - Handlers: Separação, análise, MIDI, transposição, yt-dlp

- `apps/desktop/src/main/procs.ts` — `runTool()`, `runPython()` base

### Estratégia Recomendada

**Opção A: Lazy Loading (Baixo Risco)**
1. Mover `stemsPython()`, `ffmpegDir()` para `src/main/loaders.ts`
2. Adicionar `function lazyLoadMixerDeps(): void` que valida paths
3. Chamar em `app.on('ready', ...)` apenas se `PROFILE === 'mixer'`
4. Se Academy tenta usar, erro claro: "Feature not available"

**Opção B: Module Splitting (Médio Risco)**
1. Criar `handlers-mixer-stems.ts` para todos os handlers que usam Python/FFmpeg
2. Criar `handlers-mixer-grab.ts` para yt-dlp handlers
3. Importar em `handlers-mixer.ts` só se `PROFILE === 'mixer'`

**Recomendado:** Opção A. Mantém main.ts simples, elimina imports condicionais complexos.

### Checklist
- [ ] `src/main/loaders.ts` — Função `lazyLoadMixerDeps()`
- [ ] `main.ts` — Chamar `lazyLoadMixerDeps()` em `app.ready` se Mixer
- [ ] `preload.ts` — Verificar se handlers Mixer já guardam erros de dependência
- [ ] Teste: Academy tenta separar → erro "Feature not available"
- [ ] TypeScript: Sem erros

---

## Etapa 4: Storage Isolation (Databases Separadas)

**Objetivo:** Mixer e Academy usam SQLite databases diferentes.

### Arquivos-chave
- `apps/desktop/src/main/db.ts` — `openDatabase()`, path de userData
- `package.json` — `appId` Electron

### Mudanças
1. Condicionar `appData` path:
   - Mixer: `${userData}/mixercraft.sqlite` (ou manter atual)
   - Academy: `${userData}/academy.sqlite`

2. App ID diverge (opcional, se produção):
   - Mixer: `com.baixaria.mixer`
   - Academy: `com.baixaria.academy`

3. Atualizar `electron-builder.json5` com múltiplos configs

### Checklist
- [ ] `db.ts` — Condicionar path por PROFILE
- [ ] Testar: Cada build usa seu banco
- [ ] Migrations: Ambos começam com schema v0

---

## Etapa 5: Packaging & Distribution

**Objetivo:** electron-builder cria .exe Mixer vs Academy separados.

### Arquivos-chave
- `electron-builder.json5` — Único arquivo, múltiplos profiles
- `package.json` — dist:mixer vs dist:academy scripts

### Mudanças
1. Criar `electron-builder.mixer.json5` e `electron-builder.academy.json5`
   - Diferentes `productName`, `appId`, `artifactName`
   - Mixer: "Baixaria Mixer", "mixercraft-setup.exe"
   - Academy: "Baixaria Academy", "academy-setup.exe"

2. Atualizar npm scripts:
   - `dist:mixer` → `PROFILE=mixer electron-builder -c electron-builder.mixer.json5`
   - `dist:academy` → `PROFILE=academy electron-builder -c electron-builder.academy.json5`

3. CI/CD (futuro):
   - Build ambos em paralelo
   - Uploads para releases diferentes

### Checklist
- [ ] `electron-builder.mixer.json5` — Config Mixer
- [ ] `electron-builder.academy.json5` — Config Academy
- [ ] `package.json` — dist:mixer, dist:academy scripts
- [ ] Teste: Ambos geram .exe com nomes/ícones corretos

---

## Prioridade & Risco

| Etapa | Prioridade | Risco | Tempo Est. |
|-------|-----------|-------|-----------|
| 1-Final | BLOQUEADOR | Alto | 2h (com E2E testes) |
| 3 | Alta | Médio | 1-2h |
| 4 | Média | Baixo | 30min |
| 5 | Média | Baixo | 1h |

### Critical Path
1. ✅ Etapa 1-Final: Extract handlers → Desbloqueador
2. ✅ Etapa 3: Lazy load deps → Reduz binário Academy
3. ⏳ Etapas 4-5: Packaging → Delivery

---

## Notas de Implementação

### Tree-Shaking
- Vite + define `'process.env.PROFILE'` → remove código dead
- Academy builds devem ser ~30-40% menor (sem stems, yt-dlp, voice model)
- Testar com `npm run build:academy:desktop && du -h dist/`

### Testing
- E2E: Academy user não vê "Baixar MP3" button ✅
- E2E: Academy não consegue chamar separateStems() ✅
- E2E: Mixer vê todas as features ✅

### Git
- Manter branch separado até ambos produtos compilarem
- Merge para main quando: Etapa 3 completa + CI passa

---

## Decisões Registradas

| ID | Estado | Descrição | Próximos |
|------|---------|-----------|----------|
| D-01 | Aceita | Use PROFILE env var, não flags ou modes | Implementado |
| D-02 | Aceita | Vite tree-shaking para Academy | Implementado |
| D-03 | Aceita | 3 shared IPC channels (db, appInfo, openFolder) | Implementado |
| D-04 | Pendente | Lazy load heavy deps ou module split? | Opção A recomendada |
| D-05 | Pendente | Separate SQLite paths ou app IDs? | Ambos sim, se produção |
| D-06 | Pendente | Publish ambos no GitHub Releases? | Futuro |

---

**Atualizado:** 2026-11-17  
**Responsável:** Arquiteto Baixaria Fina
