import { execSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { log, logWarn } from './logger.js';

const SHORTCUT_NAME = 'PrintAgent.lnk';

function getStartupFolder(): string {
  return join(
    homedir(),
    'AppData',
    'Roaming',
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs',
    'Startup',
  );
}

function getShortcutPath(): string {
  return join(getStartupFolder(), SHORTCUT_NAME);
}

export function isAutostartEnabled(): boolean {
  return existsSync(getShortcutPath());
}

export function enableAutostart(): boolean {
  const exePath = process.execPath;
  const shortcutPath = getShortcutPath();

  try {
    // PowerShell script to create a .lnk shortcut
    const ps = `
$ws = New-Object -ComObject WScript.Shell;
$s = $ws.CreateShortcut('${shortcutPath.replace(/'/g, "''")}');
$s.TargetPath = '${exePath.replace(/'/g, "''")}';
$s.WorkingDirectory = '${exePath.replace(/[/\\][^/\\]+$/, '').replace(/'/g, "''")}';
$s.Description = 'Restaurant Print Agent';
$s.WindowStyle = 0;
$s.Save();
`.trim();

    execSync(`powershell -Command "${ps.replace(/"/g, '\\"')}"`, {
      timeout: 10_000,
      windowsHide: true,
    });

    log('Atalho de inicio automatico criado na pasta Startup do Windows');
    return true;
  } catch (error) {
    logWarn(`Falha ao criar atalho de inicio automatico: ${error}`);
    return false;
  }
}

export function disableAutostart(): boolean {
  const shortcutPath = getShortcutPath();

  if (!existsSync(shortcutPath)) {
    return true;
  }

  try {
    unlinkSync(shortcutPath);
    log('Atalho de inicio automatico removido');
    return true;
  } catch (error) {
    logWarn(`Falha ao remover atalho de inicio automatico: ${error}`);
    return false;
  }
}
