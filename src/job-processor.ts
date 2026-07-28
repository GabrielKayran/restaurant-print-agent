import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';
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
        log(`Job ${jobId} impresso em ${printer.deviceName}`);
        await this.apiClient.updateJobStatus(jobId, 'COMPLETED');
        return;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logWarn(`Tentativa ${attempt}/${MAX_LOCAL_RETRIES} falhou para job ${jobId}: ${msg}`);

        if (attempt < MAX_LOCAL_RETRIES) {
          await sleep(RETRY_DELAY_MS);
        } else {
          showJobFailed(jobId, msg);
          logError(`Job ${jobId} falhou apos ${MAX_LOCAL_RETRIES} tentativas`);
          await this.apiClient
            .updateJobStatus(jobId, 'FAILED', `Falha na impressao: ${msg}`)
            .catch((e) => logError('Falha ao atualizar status do job', e));
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
        throw new Error(`Tipo de job desconhecido: ${type}`);
    }
  }

  private async sendToPrinter(deviceName: string, buffer: Buffer): Promise<void> {
    if (platform() === 'win32') {
      await this.sendToPrinterWindows(deviceName, buffer);
    } else {
      await this.sendToPrinterLinux(deviceName, buffer);
    }
  }

  // Uses winspool.drv via PowerShell — the correct way to send raw bytes to a
  // Windows printer by name without requiring printer sharing or port access.
  private async sendToPrinterWindows(deviceName: string, buffer: Buffer): Promise<void> {
    const tmpFile = join(tmpdir(), `print-${randomUUID()}.bin`);
    try {
      writeFileSync(tmpFile, buffer);

      const escapedFile = tmpFile.replace(/\\/g, '\\\\');
      const escapedPrinter = deviceName.replace(/'/g, "''");

      const script = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class RawPrint {
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
    public struct DOCINFOA { public string pDocName; public string pOutputFile; public string pDataType; }
    [DllImport("winspool.Drv", SetLastError=true, CharSet=CharSet.Ansi)]
    public static extern bool OpenPrinter(string name, out IntPtr hPrinter, IntPtr defaults);
    [DllImport("winspool.Drv", SetLastError=true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", SetLastError=true)]
    public static extern int StartDocPrinter(IntPtr hPrinter, int level, ref DOCINFOA info);
    [DllImport("winspool.Drv", SetLastError=true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", SetLastError=true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", SetLastError=true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", SetLastError=true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int count, out int written);
    public static void Send(string printerName, byte[] bytes) {
        IntPtr hPrinter;
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero))
            throw new Exception("OpenPrinter falhou: " + Marshal.GetLastWin32Error());
        try {
            var di = new DOCINFOA { pDocName = "ESC/POS", pOutputFile = null, pDataType = "RAW" };
            if (StartDocPrinter(hPrinter, 1, ref di) == 0)
                throw new Exception("StartDocPrinter falhou: " + Marshal.GetLastWin32Error());
            if (!StartPagePrinter(hPrinter))
                throw new Exception("StartPagePrinter falhou: " + Marshal.GetLastWin32Error());
            IntPtr ptr = Marshal.AllocCoTaskMem(bytes.Length);
            try {
                Marshal.Copy(bytes, 0, ptr, bytes.Length);
                int written;
                if (!WritePrinter(hPrinter, ptr, bytes.Length, out written))
                    throw new Exception("WritePrinter falhou: " + Marshal.GetLastWin32Error());
            } finally { Marshal.FreeCoTaskMem(ptr); }
            EndPagePrinter(hPrinter);
            EndDocPrinter(hPrinter);
        } finally { ClosePrinter(hPrinter); }
    }
}
'@
$bytes = [System.IO.File]::ReadAllBytes('${escapedFile}')
[RawPrint]::Send('${escapedPrinter}', $bytes)
`.trim();

      const encoded = Buffer.from(script, 'utf16le').toString('base64');
      execSync(`powershell -NoProfile -EncodedCommand ${encoded}`, { timeout: 15_000 });
    } finally {
      try {
        unlinkSync(tmpFile);
      } catch {
        /* best-effort cleanup */
      }
    }
  }

  private async sendToPrinterLinux(deviceName: string, buffer: Buffer): Promise<void> {
    const tmpFile = join(tmpdir(), `print-${randomUUID()}.bin`);
    try {
      writeFileSync(tmpFile, buffer);
      execSync(`lp -d "${deviceName}" -o raw "${tmpFile}"`, { timeout: 15_000 });
    } finally {
      try {
        unlinkSync(tmpFile);
      } catch {
        /* best-effort cleanup */
      }
    }
  }
}
