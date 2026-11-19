# ✅ STRATEGY: Dois Codebases Independentes

**Data:** 2026-11-18  
**Status:** 🟡 Em Progresso (WIP)  
**Branches:**
- `apps/mixer-standalone` — Mixer Desktop (40% limpo)
- `apps/scalemonster-standalone` — ScaleMonster Desktop (0% começado)
- `feat/profiles-build-separation` — Original monorepo com PROFILE (referência)

---

## 📋 Objective

Manter **duas bases de código completamente separadas** em vez de um monorepo com PROFILE:

```
repository/
├─ mixer-app/                    # Standalone: Mixer Desktop
│  ├─ package.json (name: "mixer-app")
│  ├─ apps/desktop/              # Electron Windows
│  ├─ packages/domain/           # Shared: music theory only
│  └─ README.md (Mixer specific)
│
└─ scalemonster-app/             # Standalone: Academy Desktop
   ├─ package.json (name: "scalemonster-app")
   ├─ apps/desktop/              # Electron Windows
   ├─ apps/mobile/               # Capacitor: Android/iOS
   ├─ packages/domain/           # Shared: music theory + gamification
   └─ README.md (ScaleMonster specific)
```

---

## 🎯 Separation Strategy

### MIXER-APP (Professional Audio)
**What to Keep:**
- Stem separation (Demucs)
- Library management (songs, metadata)
- File import (MP3, WAV, etc)
- YouTube import (yt-dlp)
- Grab MP3 tool
- MIDI generation
- Voice synthesis
- Transposition (Rubber Band)
- Song analysis
- Studio tools (tuner, metronome)

**What to Remove:**
- All Academy screens (Exercises, Harmony, EarTraining, Trails, Achievements, Academy)
- All gamification (XP, badges, quests, streaks)
- All exercise tracking
- Harmonic analysis tools
- Theory curriculum
- Ear training

**Progress:**
- ✅ Screens removed
- ✅ Components removed
- ✅ Domain modules removed
- ✅ Tests removed
- ✅ App.tsx simplified
- ✅ package.json updated
- ⏳ db.ts cleaned (services removed)
- ⏳ Home.tsx/Song.tsx imports cleaned
- ⏳ TypeScript: 18 errors → 0 errors (WIP)
- ⏳ Build & test

### SCALEMONSTER-APP (Educational)
**What to Keep:**
- Exercises & practice routines
- Ear training
- Harmonic analysis (Circle of Fifths, voice leading, etc)
- Trail-based learning (curriculum)
- Gamification (XP, badges, quests, achievements)
- Theory lessons
- Learning history & progress
- Musician profiles

**What to Remove:**
- Stem separation
- File import (keep simple import for reference tracks)
- YouTube import (yt-dlp)
- Grab MP3 tool
- MIDI generation (or simplify)
- Voice synthesis (expensive)
- Transposition tools
- Studio tools (tuner, metronome optional)

**Progress:**
- ⏳ Screens removal (not started)
- ⏳ Components removal (not started)
- ⏳ Domain modules (keep Academy, remove Mixer-specific)
- ⏳ App.tsx updates (hide Mixer features)
- ⏳ package.json (name, description)
- ⏳ TypeScript verification
- ⏳ Build & test

---

## 📊 Shared Packages (Both Apps)

```
packages/domain/src/
├─ music/
│  ├─ guitar.ts              ✅ Both
│  ├─ sections.ts            ✅ Both
│  ├─ bassline.ts            ✅ Both
│  ├─ harmonicAnalyzer.ts    ✅ Both
│  ├─ circleOfFifths.ts      ✅ Both
│  ├─ harmonicMap.ts         ✅ Academy only
│  ├─ earTrainingEngine.ts   ✅ Academy only
│  └─ ... (others)
├─ practice/
│  ├─ scales.ts              ✅ Both
│  ├─ judge.ts               ✅ Both
│  ├─ history.ts             ✅ Both
│  ├─ gamification.ts        ⏳ Academy only
│  ├─ curriculum.ts          ⏳ Academy only
│  └─ routines.ts            ⏳ Academy only
└─ ... (others)

packages/ui/
├─ components/ (shared UI)   ✅ Both
└─ ... (tokens, theme)
```

**Future:** Extrair `baixaria-fina-shared/` repo separado:
- Versão 0.1: shared domain + UI
- Versionado (semver)
- Ambas as apps importam via npm (ou git submodule)

---

## 🛠️ Separation Tasks

### Mixer-App (Priority 1)
- [ ] Remove Home.tsx Academy imports (CURRICULUM, THEORY_TOPICS)
- [ ] Remove Song.tsx harmonic imports
- [ ] Remove XpBar.tsx
- [ ] Remove lib/features.ts (PROFILE specific)
- [ ] Update vite.config.ts (remove PROFILE define)
- [ ] `npm run typecheck` → 0 errors
- [ ] `npm run build` → success
- [ ] `npm run start` → app opens with Mixer UI
- [ ] Commit: "✅ Mixer-standalone ready"

### ScaleMonster-App (Priority 2)
- [ ] Remove stem separation screens/handlers
- [ ] Remove File/YouTube import handlers
- [ ] Remove studio tools (tuner, metronome)
- [ ] Keep all Academy features
- [ ] Update package.json (name: "scalemonster-app")
- [ ] Update README.md
- [ ] `npm run typecheck` → 0 errors
- [ ] `npm run build` → success
- [ ] `npm run start` → app opens with Academy UI
- [ ] Commit: "✅ ScaleMonster-standalone ready"

### Post-Separation
- [ ] Create separate GitHub repos (or same org)
- [ ] Extract shared packages
- [ ] Set up CI/CD per app
- [ ] Different electron-builder configs
- [ ] Different app icons / branding
- [ ] Different update channels

---

## 📈 Why This Approach?

**Monorepo with PROFILE (old):**
- ✅ Single codebase, easy sync
- ✅ Shared domain code
- ❌ Complex conditional compilation
- ❌ Feature flags scattered
- ❌ Harder for team collaboration (Mixer team vs Academy team)
- ❌ Bundle size not fully optimized

**Two Separate Codebases (new):**
- ✅ Clear separation of concerns
- ✅ Each app has independent release cycle
- ✅ Team A: Mixer (audio focus)
- ✅ Team B: ScaleMonster (education focus)
- ✅ No feature flags needed
- ✅ Easier to understand (no PROFILE logic)
- ✅ Bundle size optimized automatically
- ❌ Code duplication in some areas
- ❌ Shared domain must be synchronized (or via npm package)

---

## 🎓 Learning Path

For a fresh developer:
- Mixer-App: "Audio processing with stems"
- ScaleMonster-App: "Music education & gamification"

vs.

- Monorepo: "Learn PROFILE system, conditional routing, feature flags"

---

## 📝 Git Structure

```
Current branch: feat/profiles-build-separation
  ├─ Commits 0-2: Profiles base + preload + roteamento
  ├─ Commit 3: Roadmap (Etapas 3-5)
  ├─ Commit 4: Milestone (both apps running with PROFILE)
  └─ Commit 5: Docs (this file)

New branches:
  ├─ apps/mixer-standalone (WIP: 40% cleaned)
  │  └─ 37 files removed (Academy code)
  │  └─ 18 TS errors (need cleanup)
  │
  └─ apps/scalemonster-standalone (TODO)
     └─ Not started yet
     └─ Remove Mixer code, keep Academy
```

---

## ⏰ Timeline

**This Session:**
- ✅ Decided on two-codebase strategy
- ✅ Created `apps/mixer-standalone` branch
- ✅ Removed 37 files (Academy code)
- ⏳ Finish Mixer cleanup (next session: 2h)

**Next Sessions:**
- ScaleMonster cleanup (2h)
- Shared packages extraction (1h)
- Testing & verification (2h)
- CI/CD setup (2h)
- Release & packaging (2h)

---

## 🚀 Final Deliverables

1. **mixer-app** (desktop Windows)
   - Solo executable: `mixer-setup.exe`
   - Focus: Audio professionals
   - Features: Stems, library, studio tools

2. **scalemonster-app** (desktop Windows + mobile)
   - Executables: `scalemonster-setup.exe`, `scalemonster.apk`, `scalemonster.ipa`
   - Focus: Musicians learning
   - Features: Exercises, ear training, gamification

3. **Shared packages**
   - `@baixaria/domain` (npm package)
   - Versioned, independent updates

---

**Responsible:** Arquiteto Baixaria Fina  
**Last Updated:** 2026-11-18
