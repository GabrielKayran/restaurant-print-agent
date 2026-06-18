import ThermalPrinter, { PrinterTypes } from 'node-thermal-printer';
import { ApiClient } from './api-client.js';
import { log, logError, logWarn } from './logger.js';
import { buildExpeditionTicket } from './templates/expedition-ticket.js';
import { buildKitchenTicket } from './templates/kitchen-ticket.js';
import { buildReceipt } from './templates/receipt.js';
import type { PrintJob, PrintJobType, RegisteredPrinter } from './types.js';

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
      logError(`Failed to fetch job ${jobId}`, error);
      return;
    }

    if (job.status !== 'PENDING') {
      log(`Job ${jobId} is already ${job.status}, skipping`);
      return;
    }

    const printer = this.printerMap.get(job.printerId);
    if (!printer) {
      logError(`No printer found for job ${jobId} (printerId: ${job.printerId})`);
      await this.apiClient
        .updateJobStatus(jobId, 'FAILED', 'Printer not registered on this agent')
        .catch((e) => logError('Failed to update job status', e));
      return;
    }

    // Mark as PRINTING
    try {
      await this.apiClient.updateJobStatus(jobId, 'PRINTING');
    } catch (error) {
      logError(`Failed to mark job ${jobId} as PRINTING`, error);
      return;
    }

    // Generate ESC/POS buffer
    let buffer: Buffer;
    try {
      buffer = this.generateBuffer(job.type, job.payload, printer.paperWidth);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logError(`Failed to generate ticket for job ${jobId}`, error);
      await this.apiClient
        .updateJobStatus(jobId, 'FAILED', `Template error: ${msg}`)
        .catch((e) => logError('Failed to update job status', e));
      return;
    }

    // Print with retries
    const copies = job.copies || 1;
    for (let attempt = 1; attempt <= MAX_LOCAL_RETRIES; attempt++) {
      try {
        for (let copy = 0; copy < copies; copy++) {
          await this.sendToPrinter(printer.deviceName, buffer);
        }

        log(`Job ${jobId} printed successfully on ${printer.deviceName}`);
        await this.apiClient.updateJobStatus(jobId, 'COMPLETED');
        return;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logWarn(
          `Print attempt ${attempt}/${MAX_LOCAL_RETRIES} failed for job ${jobId}: ${msg}`,
        );

        if (attempt < MAX_LOCAL_RETRIES) {
          await sleep(RETRY_DELAY_MS);
        } else {
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
      default:
        throw new Error(`Unknown job type: ${type}`);
    }
  }

  private async sendToPrinter(
    deviceName: string,
    buffer: Buffer,
  ): Promise<void> {
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
      throw new Error(`Printer "${deviceName}" is not connected`);
    }

    printer.raw(buffer);
    await printer.execute();
  }
}
