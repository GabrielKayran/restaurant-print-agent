import { log, logError } from './logger.js';
import type {
  AgentConfig,
  DiscoveredPrinter,
  PrintJob,
  PrintJobStatus,
  RegisteredPrinter,
} from './types.js';

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export class ApiClient {
  private readonly baseUrl: string;
  private headers: Record<string, string>;

  constructor(private readonly config: AgentConfig) {
    this.baseUrl = config.apiUrl;
    this.headers = {
      'Content-Type': 'application/json',
      'X-Agent-Key': config.agentKey,
    };
  }

  updateKey(newKey: string): void {
    this.headers['X-Agent-Key'] = newKey;
  }

  async registerPrinters(printers: DiscoveredPrinter[]): Promise<RegisteredPrinter[]> {
    log(`Registrando ${printers.length} impressora(s)...`);

    const response = await this.request<RegisteredPrinter[]>('POST', '/agent/printers/register', {
      agentId: this.config.agentId,
      printers,
    });

    log(`${response.length} impressora(s) registrada(s) com sucesso`);
    return response;
  }

  async getJob(jobId: string): Promise<PrintJob> {
    return this.request<PrintJob>('GET', `/agent/print-jobs/${jobId}`);
  }

  async listPendingJobs(printerIds: string[]): Promise<PrintJob[]> {
    const ids = printerIds.join(',');
    const response = await this.request<{ data: PrintJob[] }>(
      'GET',
      `/agent/print-jobs?status=PENDING&printerId=${encodeURIComponent(ids)}`,
    );
    return response.data;
  }

  async updateJobStatus(
    jobId: string,
    status: PrintJobStatus,
    lastError?: string,
  ): Promise<PrintJob> {
    const body: Record<string, unknown> = { status };
    if (lastError) {
      body.lastError = lastError;
    }
    return this.request<PrintJob>('PATCH', `/agent/print-jobs/${jobId}`, body);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    try {
      const response = await fetch(url, {
        method,
        headers: this.headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => 'No response body');
        if (response.status === 401) {
          throw new AuthError(text);
        }
        throw new Error(`HTTP ${response.status}: ${text}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('HTTP ')) {
        throw error;
      }
      logError(`Falha na requisicao API: ${method} ${path}`, error);
      throw error;
    }
  }
}
