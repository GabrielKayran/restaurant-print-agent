import { Tray, Menu, app, nativeImage } from 'electron';
import * as path from 'node:path';
import { showWindow } from './window.js';

let tray: Tray | null = null;

function createTrayIcon(): Electron.NativeImage {
  // Try loading from assets first
  const iconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png');
  const fromFile = nativeImage.createFromPath(iconPath);
  if (!fromFile.isEmpty()) {
    return fromFile;
  }

  // Fallback: generate a 16x16 teal square programmatically
  const size = 16;
  const canvas = Buffer.alloc(size * size * 4);
  // RGBA: teal #14b8a6
  for (let i = 0; i < size * size; i++) {
    canvas[i * 4] = 0x14;     // R
    canvas[i * 4 + 1] = 0xb8; // G
    canvas[i * 4 + 2] = 0xa6; // B
    canvas[i * 4 + 3] = 0xff; // A
  }

  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

export function createTray(): Tray {
  const icon = createTrayIcon();

  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    { label: 'RestaurantOS Print Agent', enabled: false },
    { type: 'separator' },
    {
      label: 'Abrir',
      click: () => showWindow(),
    },
    { type: 'separator' },
    {
      label: 'Sair',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('RestaurantOS Print Agent');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    showWindow();
  });

  return tray;
}

export function updateTrayTooltip(status: string): void {
  if (tray) {
    tray.setToolTip(`RestaurantOS Print Agent — ${status}`);
  }
}
