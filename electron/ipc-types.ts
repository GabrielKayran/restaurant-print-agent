export interface AgentStatus {
  phase: 'setup' | 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'error';
  errorMessage: string | null;
  unitName: string | null;
  agentId: string | null;
  printers: Array<{
    id: string;
    name: string;
    deviceName: string;
    isOnline: boolean;
  }>;
  discoveredPrinters: Array<{ deviceName: string; printerType: string }>;
  jobsProcessedToday: number;
  lastJobAt: string | null;
  serverLatencyMs: number | null;
  socketConnected: boolean;
  version: string;
  updateAvailable: { version: string; url: string } | null;
}

export interface ConfigView {
  agentKeyMasked: string;
  agentId: string | null;
  autostartEnabled: boolean;
  version: string;
  apiUrl: string;
}

export interface JobEvent {
  jobId: string;
  deviceName: string;
  type: string;
  printedAt: string;
}

export interface JobFailedEvent {
  jobId: string;
  error: string;
}
