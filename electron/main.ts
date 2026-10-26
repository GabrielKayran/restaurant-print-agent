import { app, ipcMain, Notification } from 'electron';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { autoUpdater } from 'electron-updater';
import { logError, log } from '../src/logger.js';
import { AgentService } from './agent-service.js';
import { registerIpcHandlers, setupStatusForwarding } from './ipc-handlers.js';
import { createTray, setTrayUpdateReady, updateTrayTooltip } from './tray.js';
import { createWindow, getWindow } from './window.js';

// Extend app with custom property for quit handling
declare module 'electron' {
  interface App {
    isQuitting: boolean;
  }
}
app.isQuitting = false;

// Jobs left pending during the restart are fetched again on reconnect, so a short idle window is enough.
const AUTO_INSTALL_IDLE_MS = 3 * 60 * 1000;
const AUTO_INSTALL_CHECK_MS = 30 * 1000;
const UPDATE_RECHECK_MS = 4 * 60 * 60 * 1000;

function installUpdate(): void {
  log('Installing downloaded update and restarting');
  app.isQuitting = true;
  autoUpdater.quitAndInstall(true, true);
}
// Nome antigo mantido de propósito: define a pasta userData (config do agente).
// Trocar faria agentes já instalados perderem a configuração após o auto-update.
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

    let autoInstallTimer: NodeJS.Timeout | null = null;

    autoUpdater.on('update-downloaded', (info) => {
      log(`Update v${info.version} downloaded — installing when idle`);
      updateTrayTooltip(`Atualização v${info.version} pronta — instala sozinha quando ocioso`);
      setTrayUpdateReady(info.version, installUpdate);
      getWindow()?.webContents.send('update:downloaded', info.version);
      if (Notification.isSupported()) {
        new Notification({
          title: 'GKFood Print Agent — Atualização pronta',
          body: `Versão ${info.version} será instalada automaticamente quando não houver impressões.`,
        }).show();
      }

      if (autoInstallTimer) clearInterval(autoInstallTimer);
      autoInstallTimer = setInterval(() => {
        if (agentService.isIdleFor(AUTO_INSTALL_IDLE_MS)) {
          if (autoInstallTimer) clearInterval(autoInstallTimer);
          installUpdate();
        }
      }, AUTO_INSTALL_CHECK_MS);
    });

    autoUpdater.on('error', (err) => {
      logError('Auto-update error', err);
    });

    ipcMain.handle('update:install', () => installUpdate());

    const checkForUpdates = () =>
      autoUpdater.checkForUpdates().catch((err) => {
        logError('Failed to check for updates', err);
      });
    checkForUpdates();
    setInterval(checkForUpdates, UPDATE_RECHECK_MS);
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
