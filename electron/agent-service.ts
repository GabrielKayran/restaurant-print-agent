import { EventEmitter } from 'node:events';
import { ApiClient, AuthError } from '../src/api-client.js';
import { JobProcessor } from '../src/job-processor.js';
import { discoverPrinters } from '../src/printer-discovery.js';
import { PrinterHealthMonitor } from '../src/printer-health-monitor.js';
import { ConnectionManager } from '../src/socket-client.js';
import {
  readPersistedData,
  savePersistedData,
  generateAgentId,
  clearCredentials,
} from '../src/config.js';
import { log, logError } from '../src/logger.js';
import { CURRENT_VERSION } from '../src/version.js';
import type { AgentStatus, JobEvent, JobFailedEvent } from './ipc-types.js';
import type {
  DiscoveredPrinter,
  RegisteredPrinter,
  PrintJobCreatedEvent,
} from '../src/types.js';

type AgentPhase = AgentStatus['phase'];

/** Windows printers are scanned again this often, to notice renamed ones. */
const PRINTER_RESCAN_INTERVAL_MS = 5 * 60 * 1000;

export class AgentService extends EventEmitter {
  private phase: AgentPhase = 'setup';
  private errorMessage: string | null = null;
  private unitName: string | null = null;
  private agentId: string | null = null;
  private agentKey: string | null = null;
  private apiUrl: string = '';

  private registeredPrinters: RegisteredPrinter[] = [];
  private printerIds: string[] = [];
  private discovered: DiscoveredPrinter[] = [];
  private jobsProcessedToday = 0;
  private lastJobAt: string | null = null;
  private socketConnected = false;

  private apiClient: ApiClient | null = null;
  private jobProcessor: JobProcessor | null = null;
  private connectionManager: ConnectionManager | null = null;
  private healthMonitor: PrinterHealthMonitor | null = null;
  private rescanTimer: ReturnType<typeof setInterval> | null = null;
  private refreshing: Promise<void> | null = null;

  private processingQueue: Promise<void> = Promise.resolve();
  private jobsInFlight = 0;
  private lastActivityAt = Date.now();

  async start(): Promise<void> {
    const persisted = await readPersistedData();

    if (!persisted) {
      this.setPhase('setup');
      return;
    }

    this.agentKey = persisted.agentKey;
    this.agentId = persisted.agentId;
    this.apiUrl = (process.env.AGENT_API_URL || 'https://api.kayran.dev.br').replace(/\/+$/, '');

    this.discovered = discoverPrinters();
    this.setPhase('connecting');

    this.connectInBackground();
  }

  private connectInBackground(): void {
    this.doConnect().catch((err) => {
      logError('Failed to connect agent', err);
      if (err instanceof AuthError) {
        this.errorMessage = 'Chave de integração inválida';
        this.setPhase('error');
      } else {
        this.errorMessage = err instanceof Error ? err.message : String(err);
        this.setPhase('error');
      }
    });
  }

  private async doConnect(): Promise<void> {
    const config = {
      apiUrl: this.apiUrl,
      agentKey: this.agentKey!,
      agentId: this.agentId!,
    };

    this.apiClient = new ApiClient(config);
    this.jobProcessor = new JobProcessor(this.apiClient);

    try {
      await this.registerDiscovered();
    } catch (error) {
      if (error instanceof AuthError) throw error;
      logError('Failed to register printers, continuing without', error);
      this.registeredPrinters = [];
      this.printerIds = [];
    }

    this.connectionManager = new ConnectionManager(
      config,
      (event: PrintJobCreatedEvent) => {
        this.enqueueJob(event.jobId, event.type);
      },
      async () => {
        // onPollTick / onConnect
        this.socketConnected = true;
        this.setPhase('connected');
        await this.enqueuePendingJobs();
      },
      async () => {
        // onReconnect
        this.socketConnected = true;
        this.setPhase('connected');

        try {
          await this.registerDiscovered();
        } catch (error) {
          if (error instanceof AuthError) {
            this.errorMessage = 'Chave de integração inválida';
            this.setPhase('error');
          } else {
            logError('Failed to re-register printers on reconnect', error);
          }
        }
        await this.enqueuePendingJobs();
      },
    );

    this.connectionManager.start();

    this.healthMonitor = new PrinterHealthMonitor(this.apiClient, this.discovered);
    this.healthMonitor.start();

    this.rescanTimer = setInterval(() => {
      void this.refreshPrinters();
    }, PRINTER_RESCAN_INTERVAL_MS);
  }

  private async registerDiscovered(): Promise<void> {
    const registered = await this.apiClient!.registerPrinters(this.discovered);
    this.registeredPrinters = registered;
    this.printerIds = registered.map((p) => p.id);
    this.jobProcessor?.updatePrinters(registered);
  }

  private async enqueuePendingJobs(): Promise<void> {
    if (!this.apiClient || this.printerIds.length === 0) return;
    try {
      const pendingJobs = await this.apiClient.listPendingJobs(this.printerIds);
      for (const job of pendingJobs) {
        this.enqueueJob(job.id, job.type);
      }
    } catch (error) {
      if (error instanceof AuthError) {
        this.errorMessage = 'Chave de integração inválida';
        this.setPhase('error');
      } else {
        logError('Failed to fetch pending jobs', error);
      }
    }
  }

  /**
   * Scans the Windows printers again and registers them, so a printer that
   * was renamed or reinstalled shows up (and the old name shows as missing).
   */
  refreshPrinters(): Promise<void> {
    if (!this.apiClient) return Promise.resolve();
    if (this.refreshing) return this.refreshing;

    this.refreshing = (async () => {
      this.discovered = discoverPrinters();
      this.healthMonitor?.setPrinters(this.discovered);
      try {
        await this.registerDiscovered();
      } catch (error) {
        logError('Failed to register printers after a rescan', error);
      }
      this.emitStatus();
    })().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  /**
   * Makes a registered printer print on another Windows printer, keeping its
   * name and routing on the panel. Returns how many failed jobs went back to
   * the queue.
   */
  async replacePrinter(printerId: string, deviceName: string): Promise<number> {
    if (!this.apiClient) throw new Error('Agente ainda não conectado');
    const result = await this.apiClient.replacePrinterDevice(printerId, deviceName);
    log(`Printer ${printerId} now prints on "${deviceName}" (${result.requeuedJobs} job(s) requeued)`);
    await this.refreshPrinters();
    await this.enqueuePendingJobs();
    return result.requeuedJobs;
  }

  private missingDeviceNames(): Set<string> {
    const inWindows = new Set(this.discovered.map((p) => p.deviceName));
    return new Set(
      this.registeredPrinters
        .map((p) => p.deviceName)
        .filter((deviceName) => !inWindows.has(deviceName)),
    );
  }

  private enqueueJob(jobId: string, type: string): void {
    this.jobsInFlight++;
    this.lastActivityAt = Date.now();
    this.processingQueue = this.processingQueue
      .then(async () => {
        const outcome = await this.jobProcessor!.processJob(jobId);

        if (outcome.status === 'printed') {
          this.jobsProcessedToday++;
          this.lastJobAt = new Date().toISOString();
          const event: JobEvent = {
            jobId,
            deviceName: outcome.deviceName,
            type: outcome.type,
            printedAt: this.lastJobAt,
          };
          this.emit('job:printed', event);
          this.emitStatus();
        } else if (outcome.status === 'failed') {
          const failedEvent: JobFailedEvent = {
            jobId,
            error: outcome.error,
            deviceName: outcome.deviceName,
            type: outcome.type ?? type,
          };
          this.emit('job:failed', failedEvent);
          if (outcome.printerNotFound && outcome.deviceName) {
            this.emit('printer:missing', outcome.deviceName);
            void this.refreshPrinters();
          }
        }
      })
      .catch((error) => {
        logError(`Unexpected error processing job ${jobId}`, error);
        const failedEvent: JobFailedEvent = {
          jobId,
          error: error instanceof Error ? error.message : String(error),
          deviceName: null,
          type,
        };
        this.emit('job:failed', failedEvent);
      })
      .finally(() => {
        this.jobsInFlight--;
        this.lastActivityAt = Date.now();
      });
  }

  isIdleFor(ms: number): boolean {
    return this.jobsInFlight === 0 && Date.now() - this.lastActivityAt >= ms;
  }

  private stopTimers(): void {
    this.healthMonitor?.stop();
    if (this.rescanTimer) {
      clearInterval(this.rescanTimer);
      this.rescanTimer = null;
    }
  }

  async stop(): Promise<void> {
    this.stopTimers();
    this.connectionManager?.stop();

    try {
      await this.apiClient?.reportDisconnect();
      log('Server notified of shutdown');
    } catch (error) {
      logError('Failed to notify server of shutdown', error);
    }
  }

  async setupWithKey(agentKey: string): Promise<void> {
    const agentId = this.agentId || generateAgentId();
    await savePersistedData({ agentKey, agentId });

    this.agentKey = agentKey;
    this.agentId = agentId;
    this.apiUrl = (process.env.AGENT_API_URL || 'https://api.kayran.dev.br').replace(/\/+$/, '');
    this.errorMessage = null;

    this.discovered = discoverPrinters();
    this.setPhase('connecting');
    this.connectInBackground();
  }

  async updateKey(agentKey: string): Promise<void> {
    if (this.apiClient) {
      this.apiClient.updateKey(agentKey);
    }
    this.agentKey = agentKey;
    const agentId = this.agentId || generateAgentId();
    await savePersistedData({ agentKey, agentId });
  }

  async clearAndReset(): Promise<void> {
    await this.stop();
    await clearCredentials();

    this.apiClient = null;
    this.jobProcessor = null;
    this.connectionManager = null;
    this.healthMonitor = null;
    this.registeredPrinters = [];
    this.printerIds = [];
    this.discovered = [];
    this.agentKey = null;
    this.agentId = null;
    this.unitName = null;
    this.jobsProcessedToday = 0;
    this.lastJobAt = null;
    this.socketConnected = false;
    this.errorMessage = null;

    this.setPhase('setup');
  }

  getStatus(): AgentStatus {
    const missing = this.missingDeviceNames();
    return {
      phase: this.phase,
      errorMessage: this.errorMessage,
      unitName: this.unitName,
      agentId: this.agentId,
      printers: this.registeredPrinters.map((p) => ({
        id: p.id,
        name: p.name,
        deviceName: p.deviceName,
        isOnline: p.isOnline && !missing.has(p.deviceName),
        missing: missing.has(p.deviceName),
      })),
      discoveredPrinters: this.discovered.map((p) => ({
        deviceName: p.deviceName,
        printerType: p.printerType,
      })),
      jobsProcessedToday: this.jobsProcessedToday,
      lastJobAt: this.lastJobAt,
      serverLatencyMs: null,
      socketConnected: this.socketConnected,
      version: CURRENT_VERSION,
      updateAvailable: null,
    };
  }

  getDiscoveredPrinters(): DiscoveredPrinter[] {
    return this.discovered;
  }

  setUnitName(name: string): void {
    this.unitName = name;
    this.emitStatus();
  }

  private setPhase(phase: AgentPhase): void {
    this.phase = phase;
    if (phase === 'disconnected' || phase === 'reconnecting') {
      this.socketConnected = false;
    }
    this.emitStatus();
  }

  private emitStatus(): void {
    this.emit('status', this.getStatus());
  }
}
