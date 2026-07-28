import { app, Notification } from 'electron';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { autoUpdater } from 'electron-updater';
import { logError, log } from '../src/logger.js';
import { AgentService } from './agent-service.js';
import { registerIpcHandlers, setupStatusForwarding } from './ipc-handlers.js';
import { createTray, updateTrayTooltip } from './tray.js';
import { createWindow, getWindow } from './window.js';

// Extend app with custom property for quit handling
declare module 'electron' {
  interface App {
    isQuitting: boolean;
  }
}
app.isQuitting = false;
app.setName('RestaurantOS Print Agent');

// Point config.ts to the writable userData directory (never inside the ASAR)
process.env.AGENT_DATA_DIR = app.getPath('userData');

// Single instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on('second-instance', () => {
  const win = getWindow();
  if (win) {
    win.show();
    win.focus();
  }
});

app.whenReady().then(() => {
  const agentService = new AgentService();

  const win = createWindow();
  createTray();
  registerIpcHandlers(agentService);
  setupStatusForwarding(agentService, getWindow);

  // Show window once content is ready
  win.once('ready-to-show', () => {
    win.show();
  });

  // Update tray tooltip based on status
  agentService.on('status', (status) => {
    const tooltipMap: Record<string, string> = {
      setup: 'Configuração pendente',
      connecting: 'Conectando...',
      connected: 'Conectado',
      disconnected: 'Desconectado',
      reconnecting: 'Reconectando...',
      error: 'Erro',
    };
    updateTrayTooltip(tooltipMap[status.phase] || status.phase);
  });

  // Enable autostart by default on first launch
  const autostartSentinel = join(app.getPath('userData'), '.autostart-initialized');
  if (!existsSync(autostartSentinel)) {
    app.setLoginItemSettings({ openAtLogin: true });
    try {
      writeFileSync(autostartSentinel, '1');
    } catch {
      // non-critical
    }
    log('Autostart enabled by default on first launch');
  }

  // Start agent in background — non-blocking
  agentService.start().catch((err) => {
    logError('Failed to start agent service', err);
  });

  // Auto-update: check silently, notify in tray + renderer when ready
  if (app.isPackaged) {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-available', (info) => {
      log(`Update available: v${info.version} — downloading in background`);
      updateTrayTooltip(`Baixando atualização v${info.version}...`);
      getWindow()?.webContents.send('update:available', info.version);
    });

    autoUpdater.on('update-downloaded', (info) => {
      log(`Update v${info.version} downloaded — will install on next quit`);
      updateTrayTooltip('Atualização pronta — reinicie para instalar');
      getWindow()?.webContents.send('update:downloaded', info.version);
      if (Notification.isSupported()) {
        new Notification({
          title: 'RestaurantOS Print Agent — Atualização pronta',
          body: `Versão ${info.version} baixada. Feche o agente para instalar.`,
        }).show();
      }
    });

    autoUpdater.on('error', (err) => {
      logError('Auto-update error', err);
    });

    autoUpdater.checkForUpdates().catch((err) => {
      logError('Failed to check for updates', err);
    });
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

app.on('window-all-closed', () => {
  // Do not quit — tray keeps the app alive
});

process.on('uncaughtException', (error) => {
  logError('Uncaught exception in main process', error);
});

process.on('unhandledRejection', (reason) => {
  logError('Unhandled rejection in main process', reason);
});
