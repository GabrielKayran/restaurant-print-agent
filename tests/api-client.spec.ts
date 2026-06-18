import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiClient } from '../src/api-client.js';
import type { AgentConfig } from '../src/types.js';

const config: AgentConfig = {
  apiUrl: 'https://api.test.com',
  agentKey: 'pk_test-key',
  agentId: 'agent-test',
};

describe('ApiClient', () => {
  let client: ApiClient;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new ApiClient(config);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends X-Agent-Key header on all requests', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });

    await client.registerPrinters([]);

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Agent-Key': 'pk_test-key',
        }),
      }),
    );
  });

  it('registerPrinters calls POST /agent/printers/register', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ id: 'p1', name: 'Printer 1' }]),
    });

    const result = await client.registerPrinters([
      { deviceName: 'EPSON', paperWidth: 80 },
    ]);

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.test.com/agent/printers/register',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          agentId: 'agent-test',
          printers: [{ deviceName: 'EPSON', paperWidth: 80 }],
        }),
      }),
    );
    expect(result).toEqual([{ id: 'p1', name: 'Printer 1' }]);
  });

  it('getJob calls GET /agent/print-jobs/:id', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'job-1', status: 'PENDING' }),
    });

    const result = await client.getJob('job-1');

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.test.com/agent/print-jobs/job-1',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result.id).toBe('job-1');
  });

  it('listPendingJobs calls GET with query params', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    });

    await client.listPendingJobs(['p1', 'p2']);

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/agent/print-jobs?status=PENDING&printerId='),
      expect.anything(),
    );
  });

  it('updateJobStatus calls PATCH with body', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'job-1', status: 'COMPLETED' }),
    });

    await client.updateJobStatus('job-1', 'COMPLETED');

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.test.com/agent/print-jobs/job-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ status: 'COMPLETED' }),
      }),
    );
  });

  it('updateJobStatus includes lastError when provided', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'job-1', status: 'FAILED' }),
    });

    await client.updateJobStatus('job-1', 'FAILED', 'Printer offline');

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ status: 'FAILED', lastError: 'Printer offline' }),
      }),
    );
  });

  it('throws on non-ok response', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    });

    await expect(client.getJob('job-1')).rejects.toThrow('Unauthorized');
  });

  it('throws on network error', async () => {
    fetchSpy.mockRejectedValue(new TypeError('fetch failed'));

    await expect(client.getJob('job-1')).rejects.toThrow('fetch failed');
  });
});
