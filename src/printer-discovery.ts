import { execSync } from 'node:child_process';
import { platform } from 'node:os';
import { log, logWarn } from './logger.js';
import type { DiscoveredPrinter } from './types.js';

const DEFAULT_PAPER_WIDTH = 80;

function discoverWindows(): DiscoveredPrinter[] {
  try {
    const output = execSync(
      'powershell -Command "Get-Printer | Select-Object -Property Name | ConvertTo-Csv -NoTypeInformation"',
      { encoding: 'utf-8', timeout: 10_000 },
    );

    const lines = output.trim().split('\n');
    // First line is the CSV header ("Name"), skip it
    const printers: DiscoveredPrinter[] = [];

    for (let i = 1; i < lines.length; i++) {
      const name = lines[i].trim().replace(/^"|"$/g, '');
      if (!name) continue;

      printers.push({
        deviceName: name,
        paperWidth: DEFAULT_PAPER_WIDTH,
      });
    }

    return printers;
  } catch (error) {
    logWarn('PowerShell printer discovery failed, trying wmic fallback...');
    return discoverWindowsWmic();
  }
}

function discoverWindowsWmic(): DiscoveredPrinter[] {
  try {
    const output = execSync('wmic printer get Name /format:csv', {
      encoding: 'utf-8',
      timeout: 10_000,
    });

    const lines = output.trim().split('\n');
    const printers: DiscoveredPrinter[] = [];

    for (const line of lines) {
      const parts = line.trim().split(',');
      // CSV format: Node,Name — skip header and empty lines
      const name = parts[parts.length - 1]?.trim();
      if (!name || name === 'Name') continue;

      printers.push({
        deviceName: name,
        paperWidth: DEFAULT_PAPER_WIDTH,
      });
    }

    return printers;
  } catch {
    logWarn('WMIC printer discovery also failed');
    return [];
  }
}

function discoverLinux(): DiscoveredPrinter[] {
  try {
    const output = execSync('lpstat -p 2>/dev/null || true', {
      encoding: 'utf-8',
      timeout: 10_000,
    });

    const printers: DiscoveredPrinter[] = [];
    const lines = output.trim().split('\n');

    for (const line of lines) {
      const match = line.match(/^printer\s+(\S+)/);
      if (match?.[1]) {
        printers.push({
          deviceName: match[1],
          paperWidth: DEFAULT_PAPER_WIDTH,
        });
      }
    }

    return printers;
  } catch {
    logWarn('Linux printer discovery failed');
    return [];
  }
}

export function discoverPrinters(): DiscoveredPrinter[] {
  const os = platform();
  log(`Discovering printers on ${os}...`);

  let printers: DiscoveredPrinter[];

  if (os === 'win32') {
    printers = discoverWindows();
  } else if (os === 'linux') {
    printers = discoverLinux();
  } else {
    logWarn(`Unsupported platform: ${os}. No printers discovered.`);
    printers = [];
  }

  log(`Discovered ${printers.length} printer(s): ${printers.map((p) => p.deviceName).join(', ') || 'none'}`);
  return printers;
}
