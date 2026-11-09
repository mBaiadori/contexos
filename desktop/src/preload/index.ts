import { contextBridge, ipcRenderer } from 'electron';

// Exposição segura de utilitários nativos para o frontend sem habilitar nodeIntegration
contextBridge.exposeInMainWorld('desktopBridge', {
  isDesktop: true,
  platform: process.platform,
  getVersion: () => ipcRenderer.invoke('desktop:get-version'),
  getSessionToken: () => ipcRenderer.invoke('desktop:get-session-token'),
  encrypt: (plainText: string) => ipcRenderer.invoke('secure-store:encrypt', plainText),
  decrypt: (encryptedBase64: string) => ipcRenderer.invoke('secure-store:decrypt', encryptedBase64),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  quitAndInstallUpdate: () => ipcRenderer.invoke('updater:quit-and-install'),
  openExternal: (url: string) => ipcRenderer.invoke('desktop:open-external', url),
  onUpdaterStatus: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('updater:status', handler);
    return () => ipcRenderer.removeListener('updater:status', handler);
  },
  onUpdaterProgress: (callback: (progress: any) => void) => {
    const handler = (_event: any, progress: any) => callback(progress);
    ipcRenderer.on('updater:progress', handler);
    return () => ipcRenderer.removeListener('updater:progress', handler);
  },
});
