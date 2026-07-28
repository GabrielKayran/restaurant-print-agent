import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('agent', {
  // Renderer -> Main (invoke)
  getStatus: () => ipcRenderer.invoke('status:get'),
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (key: string) => ipcRenderer.invoke('config:save', key),
  setupAgent: (key: string) => ipcRenderer.invoke('agent:setup', key),
  clearCredentials: () => ipcRenderer.invoke('agent:clear'),
  getPrinters: () => ipcRenderer.invoke('printers:list'),
  printTest: (deviceName: string) => ipcRenderer.invoke('print:test', deviceName),
  setAutostart: (enabled: boolean) => ipcRenderer.invoke('autostart:set', enabled),
  getAutostartEnabled: () => ipcRenderer.invoke('autostart:get'),

  // Main -> Renderer (on)
  onStatusUpdate: (cb: (data: unknown) => void) =>
    ipcRenderer.on('status:update', (_event, data) => cb(data)),
  onJobPrinted: (cb: (data: unknown) => void) =>
    ipcRenderer.on('job:printed', (_event, data) => cb(data)),
  onJobFailed: (cb: (data: unknown) => void) =>
    ipcRenderer.on('job:failed', (_event, data) => cb(data)),
});
