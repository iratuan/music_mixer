import { useSyncExternalStore } from 'react';
import type { Chord, Key } from '@domain';

/**
 * Estado musical compartilhado (sessão): o tom escolhido no Ciclo das Quintas, o acorde soando
 * agora (player ou cadência) e o compasso selecionado no mapa (com notas-alvo e escala).
 * Player, Mapa Harmônico, Ciclo das Quintas e o braço leem daqui; sem re-render quando nada muda.
 */
export interface SelectedChord {
  readonly chord: Chord;
  readonly degree: string;
  readonly scale: string;
  readonly targets: readonly number[];
}

export interface HarmonicState {
  /** Tom escolhido no ciclo (ou o da música aberta). */
  readonly key: Key | null;
  /** Acorde soando agora (realce ao vivo no ciclo). */
  readonly active: Chord | null;
  /** Compasso/acorde selecionado no mapa. */
  readonly selected: SelectedChord | null;
}

let state: HarmonicState = { key: null, active: null, selected: null };
const listeners = new Set<() => void>();
type KeyListener = (key: Key, chords: readonly Chord[]) => void;
const keyListeners = new Set<KeyListener>();

const same = (a: Chord | null, b: Chord | null) => a === b || (!!a && !!b && a.root === b.root && a.quality === b.quality && a.bass === b.bass);

export const harmonicStore = {
  get: () => state,
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  set(patch: Partial<HarmonicState>): void {
    const next = { ...state, ...patch };
    if (next.key === state.key && same(next.active, state.active) && next.selected === state.selected) return;
    state = next;
    for (const l of listeners) l();
  },
  /** Tom mudou no ciclo: avisa quem quiser reagir (exercícios, braço, mapa). */
  changeKey(key: Key, chords: readonly Chord[]): void {
    if (state.key && state.key.tonic === key.tonic && state.key.mode === key.mode) return;
    harmonicStore.set({ key });
    for (const l of keyListeners) l(key, chords);
  },
  /** onKeyChange(key, mode, chords): para outras ferramentas reagirem ao tom do ciclo. */
  onKeyChange(fn: KeyListener): () => void {
    keyListeners.add(fn);
    return () => keyListeners.delete(fn);
  },
};

/** Lê uma parte do estado; só re-renderiza quando ela muda. */
export function useHarmonic<T>(pick: (s: HarmonicState) => T): T {
  return useSyncExternalStore(harmonicStore.subscribe, () => pick(harmonicStore.get()));
}
