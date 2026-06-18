import ThermalPrinter, { PrinterTypes } from 'node-thermal-printer';
import { ApiClient } from './api-client.js';
import { log, logError, logWarn } from './logger.js';
import { showJobFailed, showJobPrinted } from './ui.js';
import { buildExpeditionTicket } from './templates/expedition-ticket.js';
import { buildKitchenTicket } from './templates/kitchen-ticket.js';
import { buildReceipt } from './templates/receipt.js';
import { buildTestPage } from './templates/test-page.js';
import type { PrintJob, PrintJobType, RegisteredPrinter, TestPagePayload } from './types.js';

const MAX_LOCAL_RETRIES = 3;
const RETRY_DELAY_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class JobProcessor {
  private readonly processing = new Set<string>();
  private readonly printerMap = new Map<string, RegisteredPrinter>();

  constructor(private readonly apiClient: ApiClient) {}

  updatePrinters(printers: RegisteredPrinter[]): void {
    this.printerMap.clear();
    for (const printer of printers) {
      this.printerMap.set(printer.id, printer);
    }
  }

  async processJob(jobId: string): Promise<void> {
    if (this.processing.has(jobId)) {
      return;
    }

    this.processing.add(jobId);
    try {
      await this.executeJob(jobId);
    } finally {
      this.processing.delete(jobId);
    }
  }

  private async executeJob(jobId: string): Promise<void> {
    let job: PrintJob;
    try {
      job = await this.apiClient.getJob(jobId);
    } catch (error) {
      logError(`Falha ao buscar job ${jobId}`, error);
      return;
    }

    if (job.status !== 'PENDING') {
      log(`Job ${jobId} ja esta ${job.status}, pulando`);
      return;
    }

    const printer = this.printerMap.get(job.printerId);
    if (!printer) {
      logError(`Impressora nao encontrada para job ${jobId} (printerId: ${job.printerId})`);
      await this.apiClient
        .updateJobStatus(jobId, 'FAILED', 'Impressora nao registrada neste agente')
        .catch((e) => logError('Falha ao atualizar status do job', e));
      return;
    }

    try {
      await this.apiClient.updateJobStatus(jobId, 'PRINTING');
    } catch (error) {
      logError(`Falha ao marcar job ${jobId} como PRINTING`, error);
      return;
    }

    // Generate ESC/POS buffer
    let buffer: Buffer;
    try {
      buffer = this.generateBuffer(job.type, job.payload, printer.paperWidth);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logError(`Falha ao gerar ticket para job ${jobId}`, error);
      await this.apiClient
        .updateJobStatus(jobId, 'FAILED', `Erro no template: ${msg}`)
        .catch((e) => logError('Falha ao atualizar status do job', e));
      return;
    }

    // Print with retries
    const copies = job.copies || 1;
    for (let attempt = 1; attempt <= MAX_LOCAL_RETRIES; attempt++) {
      try {
        for (let copy = 0; copy < copies; copy++) {
          await this.sendToPrinter(printer.deviceName, buffer);
        }

        showJobPrinted(jobId, printer.deviceName);
        log(`Job ${jobId} printed on ${printer.deviceName}`);
        await this.apiClient.updateJobStatus(jobId, 'COMPLETED');
        return;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logWarn(`Tentativa ${attempt}/${MAX_LOCAL_RETRIES} falhou para job ${jobId}: ${msg}`);

        if (attempt < MAX_LOCAL_RETRIES) {
          await sleep(RETRY_DELAY_MS);
        } else {
          showJobFailed(jobId, msg);
          logError(`Job ${jobId} failed after ${MAX_LOCAL_RETRIES} attempts`);
          await this.apiClient
            .updateJobStatus(jobId, 'FAILED', `Print failed: ${msg}`)
            .catch((e) => logError('Failed to update job status', e));
        }
      }
    }
  }

  private generateBuffer(
    type: PrintJobType,
    payload: PrintJob['payload'],
    paperWidth: number,
  ): Buffer {
    switch (type) {
      case 'KITCHEN_TICKET':
        return buildKitchenTicket(payload, paperWidth);
      case 'EXPEDITION_TICKET':
        return buildExpeditionTicket(payload, paperWidth);
      case 'RECEIPT':
        return buildReceipt(payload, paperWidth);
      case 'TEST_PAGE':
        return buildTestPage(payload as unknown as TestPagePayload, paperWidth);
      default:
        throw new Error(`Unknown job type: ${type}`);
    }
  }

  private async sendToPrinter(deviceName: string, buffer: Buffer): Promise<void> {
    const printer = new ThermalPrinter.printer({
      type: PrinterTypes.EPSON,
      interface: deviceName,
      removeSpecialCharacters: false,
      options: {
        timeout: 10_000,
      },
    });

    const isConnected = await printer.isPrinterConnected();
    if (!isConnected) {
      throw new Error(`Impressora "${deviceName}" nao esta conectada`);
    }

    printer.raw(buffer);
    await printer.execute();
  }
}
