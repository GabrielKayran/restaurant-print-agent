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

export class AgentService extends EventEmitter {
  private phase: AgentPhase = 'setup';
  private errorMessage: string | null = null;
  private unitName: string | null = null;
  private agentId: string | null = null;
  private agentKey: string | null = null;
  private apiUrl: string = '';

  private registeredPrinters: RegisteredPrinter[] = [];
  private discovered: DiscoveredPrinter[] = [];
  private jobsProcessedToday = 0;
  private lastJobAt: string | null = null;
  private socketConnected = false;

  private apiClient: ApiClient | null = null;
  private jobProcessor: JobProcessor | null = null;
  private connectionManager: ConnectionManager | null = null;
  private healthMonitor: PrinterHealthMonitor | null = null;

  private processingQueue: Promise<void> = Promise.resolve();

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

    // Register printers
    try {
      this.registeredPrinters = await this.apiClient.registerPrinters(this.discovered);

      // Extract unit name from first registered printer
      if (this.registeredPrinters.length > 0) {
        // Fetch unit name from job payload will happen on first job
        // For now we leave it null
      }
    } catch (error) {
      if (error instanceof AuthError) throw error;
      logError('Failed to register printers, continuing without', error);
      this.registeredPrinters = [];
    }

    this.jobProcessor = new JobProcessor(this.apiClient);
    this.jobProcessor.updatePrinters(this.registeredPrinters);

    const printerIds = this.registeredPrinters.map((p) => p.id);

    // Connection manager
    this.connectionManager = new ConnectionManager(
      config,
      (event: PrintJobCreatedEvent) => {
        this.enqueueJob(event.jobId, event.type);
      },
      async () => {
        // onPollTick / onConnect
        this.socketConnected = true;
        this.setPhase('connected');

        if (printerIds.length === 0) return;
        try {
          const pendingJobs = await this.apiClient!.listPendingJobs(printerIds);
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
      },
      async () => {
        // onReconnect
        this.socketConnected = true;
        this.setPhase('connected');

        try {
          const freshPrinters = await this.apiClient!.registerPrinters(this.discovered);
          this.registeredPrinters = freshPrinters;
          this.jobProcessor!.updatePrinters(freshPrinters);

          const freshIds = freshPrinters.map((p) => p.id);
          printerIds.length = 0;
          printerIds.push(...freshIds);
        } catch (error) {
          if (error instanceof AuthError) {
            this.errorMessage = 'Chave de integração inválida';
            this.setPhase('error');
          } else {
            logError('Failed to re-register printers on reconnect', error);
          }
        }

        if (printerIds.length > 0) {
          try {
            const pendingJobs = await this.apiClient!.listPendingJobs(printerIds);
            log(`${pendingJobs.length} pending job(s) found after reconnect`);
            for (const job of pendingJobs) {
              this.enqueueJob(job.id, job.type);
            }
          } catch (error) {
            logError('Failed to fetch pending jobs after reconnect', error);
          }
        }
      },
    );

    this.connectionManager.start();

    // Health monitor
    this.healthMonitor = new PrinterHealthMonitor(this.apiClient, this.discovered);
    this.healthMonitor.start();
  }

  private enqueueJob(jobId: string, type: string): void {
    this.processingQueue = this.processingQueue
      .then(async () => {
        await this.jobProcessor!.processJob(jobId);
        this.jobsProcessedToday++;
        this.lastJobAt = new Date().toISOString();

        const printer = this.registeredPrinters[0]; // best-effort
        const event: JobEvent = {
          jobId,
          deviceName: printer?.deviceName ?? 'unknown',
          type,
          printedAt: this.lastJobAt,
        };
        this.emit('job:printed', event);
        this.emitStatus();
      })
      .catch((error) => {
        logError(`Unexpected error processing job ${jobId}`, error);
        const failedEvent: JobFailedEvent = {
          jobId,
          error: error instanceof Error ? error.message : String(error),
        };
        this.emit('job:failed', failedEvent);
      });
  }

  async stop(): Promise<void> {
    this.healthMonitor?.stop();
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
    return {
      phase: this.phase,
      errorMessage: this.errorMessage,
      unitName: this.unitName,
      agentId: this.agentId,
      printers: this.registeredPrinters.map((p) => ({
        id: p.id,
        name: p.name,
        deviceName: p.deviceName,
        isOnline: p.isOnline,
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
