import { Tray, Menu, app, nativeImage } from 'electron';
import * as path from 'node:path';
import { showWindow } from './window.js';

let tray: Tray | null = null;
let pendingUpdate: { version: string; install: () => void } | null = null;

function createTrayIcon(): Electron.NativeImage {
  const iconPath = path.join(app.getAppPath(), 'assets', 'icon.png');
  const fromFile = nativeImage.createFromPath(iconPath);
  if (!fromFile.isEmpty()) {
    return fromFile.resize({ width: 16, height: 16 });
  }

  // Fallback: generate a 16x16 teal square programmatically
  const size = 16;
  const canvas = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    canvas[i * 4] = 0x14;
    canvas[i * 4 + 1] = 0xb8;
    canvas[i * 4 + 2] = 0xa6;
    canvas[i * 4 + 3] = 0xff;
  }

  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

export function createTray(): Tray {
  const icon = createTrayIcon();

  tray = new Tray(icon);
  tray.setToolTip('GKFood Print Agent');
  tray.setContextMenu(buildMenu());

  tray.on('click', () => {
    showWindow();
  });

  return tray;
}

function buildMenu(): Menu {
  const updateItems: Electron.MenuItemConstructorOptions[] = pendingUpdate
    ? [
        {
          label: `Atualizar agora (v${pendingUpdate.version})`,
          click: () => pendingUpdate?.install(),
        },
        { type: 'separator' },
      ]
    : [];

  return Menu.buildFromTemplate([
    { label: 'GKFood Print Agent', enabled: false },
    { type: 'separator' },
    {
      label: 'Abrir',
      click: () => showWindow(),
    },
    { type: 'separator' },
    ...updateItems,
    {
      label: 'Sair',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);
}

export function setTrayUpdateReady(version: string, install: () => void): void {
  pendingUpdate = { version, install };
  tray?.setContextMenu(buildMenu());
}

export function updateTrayTooltip(status: string): void {
  if (tray) {
    tray.setToolTip(`GKFood Print Agent — ${status}`);
  }
}
