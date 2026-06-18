import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JobProcessor } from '../src/job-processor.js';
import type { ApiClient } from '../src/api-client.js';
import type { PrintJob, RegisteredPrinter } from '../src/types.js';

function makePrinter(overrides: Partial<RegisteredPrinter> = {}): RegisteredPrinter {
  return {
    id: 'printer-1',
    unitId: 'unit-1',
    name: 'Cozinha',
    deviceName: 'EPSON_TM20',
    agentId: 'agent-1',
    paperWidth: 80,
    isOnline: true,
    lastSeenAt: null,
    ...overrides,
  };
}

function makeJob(overrides: Partial<PrintJob> = {}): PrintJob {
  return {
    id: 'job-1',
    unitId: 'unit-1',
    orderId: 'order-1',
    printerId: 'printer-1',
    type: 'KITCHEN_TICKET',
    status: 'PENDING',
    payload: {
      orderCode: 42,
      orderType: 'DINE_IN',
      orderChannel: 'POS',
      tableName: 'Mesa 1',
      customerName: null,
      customerPhone: null,
      deliveryAddress: null,
      courierName: null,
      createdAt: '2026-03-15T18:00:00Z',
      items: [
        {
          name: 'X-Burger',
          variantName: null,
          quantity: 1,
          unitPrice: 25,
          totalPrice: 25,
          notes: null,
          options: [],
          categoryName: 'Lanches',
        },
      ],
      generalNotes: null,
      subtotal: 25,
      deliveryFee: 0,
      discount: 0,
      total: 25,
      payments: [{ method: 'PIX', amount: 25 }],
      changeFor: null,
      sourceReference: null,
      unitName: 'Test Unit',
      unitAddress: null,
      unitCnpj: null,
    },
    copies: 1,
    attempts: 0,
    lastError: null,
    printedAt: null,
    createdAt: '2026-03-15T18:00:00Z',
    updatedAt: '2026-03-15T18:00:00Z',
    ...overrides,
  };
}

function createMockApiClient(): {
  getJob: ReturnType<typeof vi.fn>;
  updateJobStatus: ReturnType<typeof vi.fn>;
  registerPrinters: ReturnType<typeof vi.fn>;
  listPendingJobs: ReturnType<typeof vi.fn>;
} {
  return {
    getJob: vi.fn(),
    updateJobStatus: vi.fn().mockResolvedValue({}),
    registerPrinters: vi.fn(),
    listPendingJobs: vi.fn(),
  };
}

describe('JobProcessor', () => {
  let processor: JobProcessor;
  let apiClient: ReturnType<typeof createMockApiClient>;

  beforeEach(() => {
    apiClient = createMockApiClient();
    processor = new JobProcessor(apiClient as unknown as ApiClient);
    processor.updatePrinters([makePrinter()]);
  });

  it('processes a PENDING job successfully', async () => {
    apiClient.getJob.mockResolvedValue(makeJob());

    await processor.processJob('job-1');

    expect(apiClient.getJob).toHaveBeenCalledWith('job-1');
    expect(apiClient.updateJobStatus).toHaveBeenCalledWith('job-1', 'PRINTING');
    expect(apiClient.updateJobStatus).toHaveBeenCalledWith('job-1', 'COMPLETED');
  });

  it('skips duplicate job processing (idempotency lock)', async () => {
    // Make getJob slow so we can trigger concurrent calls
    apiClient.getJob.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(makeJob()), 50)),
    );

    const p1 = processor.processJob('job-1');
    const p2 = processor.processJob('job-1');

    await Promise.all([p1, p2]);

    // getJob should only be called once
    expect(apiClient.getJob).toHaveBeenCalledTimes(1);
  });

  it('skips already non-PENDING jobs', async () => {
    apiClient.getJob.mockResolvedValue(makeJob({ status: 'COMPLETED' }));

    await processor.processJob('job-1');

    expect(apiClient.updateJobStatus).not.toHaveBeenCalled();
  });

  it('marks job FAILED when printer is not registered', async () => {
    apiClient.getJob.mockResolvedValue(makeJob({ printerId: 'unknown-printer' }));

    await processor.processJob('job-1');

    expect(apiClient.updateJobStatus).toHaveBeenCalledWith(
      'job-1',
      'FAILED',
      'Impressora nao registrada neste agente',
    );
  });

  it('handles API error when fetching job', async () => {
    apiClient.getJob.mockRejectedValue(new Error('Network error'));

    // Should not throw
    await processor.processJob('job-1');

    expect(apiClient.updateJobStatus).not.toHaveBeenCalled();
  });

  it('releases lock after processing (allows reprocessing)', async () => {
    apiClient.getJob.mockResolvedValue(makeJob());

    await processor.processJob('job-1');

    // Reset mocks
    apiClient.getJob.mockResolvedValue(makeJob({ id: 'job-1', status: 'PENDING' }));
    apiClient.updateJobStatus.mockClear();

    await processor.processJob('job-1');

    // Should process again since lock was released
    expect(apiClient.getJob).toHaveBeenCalledTimes(2);
  });

  it('processes EXPEDITION_TICKET type', async () => {
    apiClient.getJob.mockResolvedValue(
      makeJob({
        type: 'EXPEDITION_TICKET',
        payload: {
          ...makeJob().payload,
          orderType: 'DELIVERY',
          customerName: 'Maria',
          deliveryAddress: {
            street: 'Rua A',
            number: '100',
            complement: null,
            neighborhood: 'Centro',
            city: 'SP',
            state: 'SP',
            reference: null,
          },
        },
      }),
    );

    await processor.processJob('job-1');

    expect(apiClient.updateJobStatus).toHaveBeenCalledWith('job-1', 'COMPLETED');
  });

  it('processes RECEIPT type', async () => {
    apiClient.getJob.mockResolvedValue(makeJob({ type: 'RECEIPT' }));

    await processor.processJob('job-1');

    expect(apiClient.updateJobStatus).toHaveBeenCalledWith('job-1', 'COMPLETED');
  });
});
