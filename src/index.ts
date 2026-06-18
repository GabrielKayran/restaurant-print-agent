import { ApiClient } from './api-client.js';
import { loadConfig } from './config.js';
import { JobProcessor } from './job-processor.js';
import { log, logError } from './logger.js';
import { discoverPrinters } from './printer-discovery.js';
import { ConnectionManager } from './socket-client.js';
import type { RegisteredPrinter } from './types.js';

async function main(): Promise<void> {
  log('Print Agent starting...');

  // 1. Load config (prompts for API key on first run)
  const config = await loadConfig();
  log(`Config loaded: apiUrl=${config.apiUrl}, agentId=${config.agentId}`);

  // 2. Initialize API client
  const apiClient = new ApiClient(config);

  // 3. Discover printers
  const discovered = discoverPrinters();
  if (discovered.length === 0) {
    log('No printers discovered. The agent will start but cannot print.');
  }

  // 4. Register printers with backend
  let registeredPrinters: RegisteredPrinter[] = [];
  try {
    registeredPrinters = await apiClient.registerPrinters(discovered);
  } catch (error) {
    logError('Failed to register printers. Will retry on reconnect.', error);
  }

  // 5. Initialize job processor
  const jobProcessor = new JobProcessor(apiClient);
  jobProcessor.updatePrinters(registeredPrinters);

  const printerIds = registeredPrinters.map((p) => p.id);

  // Job queue for sequential processing per printer
  let processingQueue = Promise.resolve();
  function enqueueJob(jobId: string): void {
    processingQueue = processingQueue
      .then(() => jobProcessor.processJob(jobId))
      .catch((error) => logError(`Unexpected error processing job ${jobId}`, error));
  }

  // 6. Set up connection manager (socket + polling fallback)
  const connectionManager = new ConnectionManager(
    config,
    // onJobCreated (from socket)
    (event) => {
      enqueueJob(event.jobId);
    },
    // onPollTick
    async () => {
      if (printerIds.length === 0) return;
      try {
        const pendingJobs = await apiClient.listPendingJobs(printerIds);
        for (const job of pendingJobs) {
          enqueueJob(job.id);
        }
      } catch (error) {
        logError('Failed to poll pending jobs', error);
      }
    },
    // onReconnect
    async () => {
      // Re-register printers on reconnect
      try {
        const freshPrinters = await apiClient.registerPrinters(discovered);
        jobProcessor.updatePrinters(freshPrinters);
        const freshIds = freshPrinters.map((p) => p.id);
        printerIds.length = 0;
        printerIds.push(...freshIds);
      } catch (error) {
        logError('Failed to re-register printers on reconnect', error);
      }

      // Fetch accumulated PENDING jobs
      if (printerIds.length > 0) {
        try {
          const pendingJobs = await apiClient.listPendingJobs(printerIds);
          log(`Found ${pendingJobs.length} pending job(s) after reconnect`);
          for (const job of pendingJobs) {
            enqueueJob(job.id);
          }
        } catch (error) {
          logError('Failed to fetch pending jobs on reconnect', error);
        }
      }
    },
  );

  connectionManager.start();

  log('Print Agent is running. Press Ctrl+C to stop.');

  // Graceful shutdown
  const shutdown = (): void => {
    log('Shutting down...');
    connectionManager.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Keep the process alive
  setInterval(() => {}, 60_000);
}

main().catch((error) => {
  logError('Fatal error', error);
  process.exit(1);
});
