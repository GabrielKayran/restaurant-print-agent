import { BrowserWindow, Notification, app } from 'electron';
import * as path from 'node:path';

let mainWindow: BrowserWindow | null = null;
let hiddenOnceNotified = false;

export function createWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 640,
    resizable: false,
    title: 'RestaurantOS Print Agent',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    backgroundColor: '#0a0d14',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Hide instead of close
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow?.hide();

      if (!hiddenOnceNotified) {
        hiddenOnceNotified = true;
        if (Notification.isSupported()) {
          new Notification({
            title: 'RestaurantOS Print Agent',
            body: 'O agente continua rodando na bandeja do sistema.',
          }).show();
        }
      }
    }
  });

  return mainWindow;
}

export function getWindow(): BrowserWindow | null {
  return mainWindow;
}

export function showWindow(): void {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
}
