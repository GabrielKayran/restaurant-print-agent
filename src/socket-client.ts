import { io, Socket } from 'socket.io-client';
import { log, logError, logWarn } from './logger.js';
import type { AgentConfig, PrintJobCreatedEvent } from './types.js';

export interface SocketClientCallbacks {
  onJobCreated: (event: PrintJobCreatedEvent) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

export class SocketClient {
  private socket: Socket | null = null;
  private _connected = false;

  constructor(
    private readonly config: AgentConfig,
    private readonly callbacks: SocketClientCallbacks,
  ) {}

  get connected(): boolean {
    return this._connected;
  }

  connect(): void {
    const url = `${this.config.apiUrl}/printing`;

    log(`Conectando ao WebSocket em ${url}...`);

    this.socket = io(url, {
      auth: {
        agentKey: this.config.agentKey,
        agentId: this.config.agentId,
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
    });

    this.socket.on('connect', () => {
      log('WebSocket conectado');
      this._connected = true;
      this.callbacks.onConnect();
    });

    this.socket.on('disconnect', (reason) => {
      logWarn(`WebSocket desconectado: ${reason}`);
      this._connected = false;
      this.callbacks.onDisconnect();
    });

    this.socket.on('connect_error', (error) => {
      logError(`Erro de conexao WebSocket: ${error.message}`);
    });

    this.socket.on('print.job.created', (event: PrintJobCreatedEvent) => {
      log(`Job de impressao recebido: ${event.jobId} (${event.type})`);
      this.callbacks.onJobCreated(event);
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this._connected = false;
    }
  }
}

const POLLING_FALLBACK_DELAY_MS = 30_000;
const POLLING_INTERVAL_MS = 10_000;

export class ConnectionManager {
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private socketClient: SocketClient;

  constructor(
    config: AgentConfig,
    private readonly onJobCreated: (event: PrintJobCreatedEvent) => void,
    private readonly onPollTick: () => Promise<void>,
    private readonly onReconnect: () => Promise<void>,
  ) {
    this.socketClient = new SocketClient(config, {
      onJobCreated: (event) => this.onJobCreated(event),
      onConnect: () => this.handleConnect(),
      onDisconnect: () => this.handleDisconnect(),
    });
  }

  start(): void {
    this.socketClient.connect();
  }

  stop(): void {
    this.stopPolling();
    this.clearFallbackTimer();
    this.socketClient.disconnect();
  }

  private handleConnect(): void {
    this.stopPolling();
    this.clearFallbackTimer();

    // On reconnect, fetch any accumulated PENDING jobs
    this.onReconnect().catch((err) => {
      logError('Falha ao buscar jobs pendentes ao reconectar', err);
    });
  }

  private handleDisconnect(): void {
    this.clearFallbackTimer();

    // Start polling fallback after delay
    this.fallbackTimer = setTimeout(() => {
      if (!this.socketClient.connected) {
        log(
          `Socket ainda desconectado apos ${POLLING_FALLBACK_DELAY_MS / 1000}s, iniciando polling de fallback`,
        );
        this.startPolling();
      }
    }, POLLING_FALLBACK_DELAY_MS);
  }

  private startPolling(): void {
    if (this.pollingTimer) return;

    log(`Iniciando polling a cada ${POLLING_INTERVAL_MS / 1000}s`);
    this.pollingTimer = setInterval(() => {
      if (this.socketClient.connected) {
        this.stopPolling();
        return;
      }
      this.onPollTick().catch((err) => {
        logError('Falha no polling', err);
      });
    }, POLLING_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
      log('Polling parado');
    }
  }

  private clearFallbackTimer(): void {
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
  }
}
