import { execSync } from 'node:child_process';
import { platform } from 'node:os';
import { log, logWarn } from './logger.js';
import type { DiscoveredPrinter, PrinterType } from './types.js';

const THERMAL_58_MAX = 620; // tenths of mm
const THERMAL_80_MAX = 840;
const DEFAULT_PAPER_WIDTH = 80;

interface WmiPrinterInfo {
  name: string;
  paperWidthTenths: number | null;
  driverName: string;
  portName: string;
}

interface PrinterClassification {
  printerType: PrinterType;
  paperWidth: number;
}

function classifyPrinter(info: WmiPrinterInfo): PrinterClassification {
  // 1) Use WMI PaperWidth if available (value in tenths of mm)
  if (info.paperWidthTenths && info.paperWidthTenths > 0) {
    if (info.paperWidthTenths <= THERMAL_58_MAX) return { printerType: 'THERMAL', paperWidth: 58 };
    if (info.paperWidthTenths <= THERMAL_80_MAX) return { printerType: 'THERMAL', paperWidth: 80 };
    // Standard printer (A4 = ~2100, Letter = ~2159)
    const widthMm = Math.round(info.paperWidthTenths / 10);
    return { printerType: 'STANDARD', paperWidth: widthMm };
  }

  // 2) Heuristic: check port name for POS pattern
  if (/USBPOS\d*/i.test(info.portName)) {
    return { printerType: 'THERMAL', paperWidth: DEFAULT_PAPER_WIDTH };
  }

  // 3) Heuristic: check driver name for thermal/POS keywords
  const thermalKeywords =
    /thermal|receipt|pos[\s-]|esc\/?pos|epson\s*tm|star\s*tsp|bixolon|elgin\s*i/i;
  if (thermalKeywords.test(info.driverName)) {
    return { printerType: 'THERMAL', paperWidth: DEFAULT_PAPER_WIDTH };
  }

  // No thermal indicators found — standard printer
  return { printerType: 'STANDARD', paperWidth: 0 };
}

function queryWindowsPrinterInfo(): WmiPrinterInfo[] {
  try {
    const script = [
      '$printers = Get-CimInstance -ClassName Win32_Printer | Select-Object Name, DriverName, PortName;',
      '$configs = @{};',
      'Get-CimInstance -ClassName Win32_PrinterConfiguration | ForEach-Object { $configs[$_.Name] = $_.PaperWidth };',
      '$printers | ForEach-Object {',
      '  $pw = if ($configs.ContainsKey($_.Name)) { $configs[$_.Name] } else { 0 };',
      '  "$($_.Name)|$($_.DriverName)|$($_.PortName)|$pw"',
      '}',
    ].join(' ');

    // Use -EncodedCommand to avoid shell escaping issues with $_ and quotes
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    const output = execSync(`powershell -NoProfile -EncodedCommand ${encoded}`, {
      encoding: 'utf-8',
      timeout: 15_000,
    });

    const results: WmiPrinterInfo[] = [];
    for (const line of output.trim().split('\n')) {
      const parts = line.trim().split('|');
      if (parts.length < 4) continue;
      const name = parts[0].trim();
      if (!name) continue;
      results.push({
        name,
        driverName: parts[1]?.trim() ?? '',
        portName: parts[2]?.trim() ?? '',
        paperWidthTenths: parseInt(parts[3]?.trim() ?? '0', 10) || null,
      });
    }
    return results;
  } catch {
    logWarn('Consulta WMI de impressoras falhou');
    return [];
  }
}

function discoverWindows(): DiscoveredPrinter[] {
  const printerInfos = queryWindowsPrinterInfo();

  if (printerInfos.length > 0) {
    return printerInfos.map((info) => {
      const { printerType, paperWidth } = classifyPrinter(info);
      log(`Impressora "${info.name}" detectada como ${printerType} (${paperWidth}mm)`);
      return { deviceName: info.name, printerType, paperWidth };
    });
  }

  // Fallback: basic name-only discovery
  logWarn('Deteccao avancada falhou, usando descoberta basica...');
  return discoverWindowsBasic();
}

function discoverWindowsBasic(): DiscoveredPrinter[] {
  try {
    const output = execSync(
      'powershell -Command "Get-Printer | Select-Object -Property Name | ConvertTo-Csv -NoTypeInformation"',
      { encoding: 'utf-8', timeout: 10_000 },
    );

    const lines = output.trim().split('\n');
    const printers: DiscoveredPrinter[] = [];

    for (let i = 1; i < lines.length; i++) {
      const name = lines[i].trim().replace(/^"|"$/g, '');
      if (!name) continue;
      printers.push({ deviceName: name, printerType: 'THERMAL', paperWidth: DEFAULT_PAPER_WIDTH });
    }

    return printers;
  } catch {
    logWarn('Descoberta basica de impressoras falhou');
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
      if (!match?.[1]) continue;

      const deviceName = match[1];
      const { printerType, paperWidth } = detectLinuxPrinter(deviceName);
      log(`Impressora "${deviceName}" detectada como ${printerType} (${paperWidth}mm)`);
      printers.push({ deviceName, printerType, paperWidth });
    }

    return printers;
  } catch {
    logWarn('Descoberta de impressoras no Linux falhou');
    return [];
  }
}

function detectLinuxPrinter(deviceName: string): PrinterClassification {
  try {
    const output = execSync(`lpoptions -p "${deviceName}" -l 2>/dev/null || true`, {
      encoding: 'utf-8',
      timeout: 5_000,
    });

    // Look for PageSize option with thermal paper sizes
    const pageSizeMatch = output.match(/PageSize.*?:\s*(.+)/i);
    if (pageSizeMatch) {
      const sizes = pageSizeMatch[1];
      if (/w\d*1[56]\d\.?\d*h|X?5[68]MM|58/i.test(sizes))
        return { printerType: 'THERMAL', paperWidth: 58 };
      if (/w\d*2[23]\d\.?\d*h|X?80MM|80/i.test(sizes))
        return { printerType: 'THERMAL', paperWidth: 80 };
    }

    // Heuristic: check for thermal-sounding driver keywords
    if (/thermal|receipt|pos|esc/i.test(output))
      return { printerType: 'THERMAL', paperWidth: DEFAULT_PAPER_WIDTH };
  } catch {
    // Fall through — no thermal indicators
  }

  return { printerType: 'STANDARD', paperWidth: 0 };
}

export function discoverPrinters(): DiscoveredPrinter[] {
  const os = platform();
  log(`Descobrindo impressoras em ${os}...`);

  let printers: DiscoveredPrinter[];

  if (os === 'win32') {
    printers = discoverWindows();
  } else if (os === 'linux') {
    printers = discoverLinux();
  } else {
    logWarn(`Plataforma nao suportada: ${os}. Nenhuma impressora encontrada.`);
    printers = [];
  }

  const thermal = printers.filter((p) => p.printerType === 'THERMAL').length;
  const standard = printers.filter((p) => p.printerType === 'STANDARD').length;
  log(`${printers.length} impressora(s) encontrada(s): ${thermal} termica(s), ${standard} comum(ns)`);
  return printers;
}
