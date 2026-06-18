import ThermalPrinter, { PrinterTypes } from 'node-thermal-printer';
import { ApiClient } from './api-client.js';
import { log, logError, logWarn } from './logger.js';
import type { DiscoveredPrinter, PrinterStatusReport } from './types.js';

const HEALTH_CHECK_INTERVAL_MS = 30_000;

export class PrinterHealthMonitor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly lastKnownStatus = new Map<string, boolean>();

  constructor(
    private readonly apiClient: ApiClient,
    private readonly printers: DiscoveredPrinter[],
  ) {}

  start(): void {
    if (this.timer || this.printers.length === 0) return;

    log(
      `Monitor de saude iniciado — verificando ${this.printers.length} impressora(s) a cada ${HEALTH_CHECK_INTERVAL_MS / 1000}s`,
    );

    // Initial check
    this.runCheck();

    this.timer = setInterval(() => {
      this.runCheck();
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private runCheck(): void {
    this.checkAll().catch((err) => {
      logError('Falha no health check de impressoras', err);
    });
  }

  private async checkAll(): Promise<void> {
    const statuses: PrinterStatusReport[] = [];
    let hasChanges = false;

    for (const printer of this.printers) {
      const isOnline = await this.checkPrinter(printer.deviceName);
      const previousStatus = this.lastKnownStatus.get(printer.deviceName);

      statuses.push({ deviceName: printer.deviceName, isOnline });

      if (previousStatus !== undefined && previousStatus !== isOnline) {
        hasChanges = true;
        if (isOnline) {
          log(`Impressora "${printer.deviceName}" reconectada`);
        } else {
          logWarn(`Impressora "${printer.deviceName}" desconectada`);
        }
      }

      this.lastKnownStatus.set(printer.deviceName, isOnline);
    }

    if (hasChanges) {
      try {
        await this.apiClient.updatePrinterStatuses(statuses);
        log('Status das impressoras atualizado no servidor');
      } catch (error) {
        logError('Falha ao enviar status das impressoras', error);
      }
    }
  }

  private async checkPrinter(deviceName: string): Promise<boolean> {
    try {
      const printer = new ThermalPrinter.printer({
        type: PrinterTypes.EPSON,
        interface: deviceName,
        removeSpecialCharacters: false,
        options: { timeout: 5_000 },
      });

      return await printer.isPrinterConnected();
    } catch {
      return false;
    }
  }
}
