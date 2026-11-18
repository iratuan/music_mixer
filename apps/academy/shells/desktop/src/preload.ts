import { contextBridge, ipcRenderer } from 'electron';

/**
 * API mínima do shell desktop para o Academy (window.academyDesktop). Cada função é um canal com
 * origem conferida no processo principal; nada de ipcRenderer, fs ou shell genéricos.
 * O tipo espelhado no renderer está em apps/academy/src/platform/desktop.ts.
 */
contextBridge.exposeInMainWorld('academyDesktop', {
  info: () => ipcRenderer.invoke('academy:info'),
  dbRead: () => ipcRenderer.invoke('academy:db-read'),
  dbWrite: (bytes: Uint8Array) => ipcRenderer.invoke('academy:db-write', bytes),
  saveFile: (name: string, bytes: Uint8Array, kind: string) => ipcRenderer.invoke('academy:save-file', { name, bytes, kind }),
  legacyStatus: () => ipcRenderer.invoke('academy:legacy-status'),
  legacyImport: () => ipcRenderer.invoke('academy:legacy-import'),
  legacyDismiss: () => ipcRenderer.invoke('academy:legacy-dismiss'),
});
