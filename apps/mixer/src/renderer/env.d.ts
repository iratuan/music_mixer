/// <reference types="vite/client" />
import type { BaixariaApi } from '../preload/preload.js';

declare global {
  interface Window {
    baixaria: BaixariaApi;
  }
}

export {};
