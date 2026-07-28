import { ipcMain, BrowserWindow, app } from 'electron';
import * as path from 'node:path';
import { AgentService } from './agent-service.js';
import { CURRENT_VERSION } from '../src/version.js';
import type { ConfigView } from './ipc-types.js';

export function registerIpcHandlers(agentService: AgentService): void {
  ipcMain.handle('status:get', () => {
    return agentService.getStatus();
  });

  ipcMain.handle('config:get', (): ConfigView => {
    const status = agentService.getStatus();
    return {
      agentKeyMasked: '••••••••••••••••',
      agentId: status.agentId,
      autostartEnabled: app.getLoginItemSettings().openAtLogin,
      version: CURRENT_VERSION,
      apiUrl: process.env.AGENT_API_URL || 'https://api.kayran.dev.br',
    };
  });

  ipcMain.handle('config:save', async (_event, key: string) => {
    try {
      await agentService.updateKey(key);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('agent:setup', async (_event, key: string) => {
    try {
      await agentService.setupWithKey(key);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('agent:clear', async () => {
    try {
      await agentService.clearAndReset();
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('printers:list', () => {
    return agentService.getDiscoveredPrinters();
  });

  ipcMain.handle('print:test', async (_event, _deviceName: string) => {
    try {
      // Test print is handled by creating a test job on the server side
      // For now, return success
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('autostart:set', (_event, enabled: boolean) => {
    if (app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: enabled });
    } else {
      // In dev, pass the entry point so Windows doesn't open a blank Electron window
      app.setLoginItemSettings({
        openAtLogin: enabled,
        path: process.execPath,
        args: [path.resolve(process.argv[1] || '.')],
      });
    }
    return { success: true };
  });

  ipcMain.handle('autostart:get', () => {
    if (app.isPackaged) {
      return app.getLoginItemSettings().openAtLogin;
    }
    return app.getLoginItemSettings({
      path: process.execPath,
      args: [path.resolve(process.argv[1] || '.')],
    }).openAtLogin;
  });
}

export function setupStatusForwarding(
  agentService: AgentService,
  getWindow: () => BrowserWindow | null,
): void {
  agentService.on('status', (status) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('status:update', status);
    }
  });

  agentService.on('job:printed', (event) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('job:printed', event);
    }
  });

  agentService.on('job:failed', (event) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('job:failed', event);
    }
  });
}
