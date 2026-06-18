import { ApiClient } from './api-client.js';
import { disableAutostart } from './autostart.js';
import { loadConfig } from './config.js';
import { JobProcessor } from './job-processor.js';
import { log, logError } from './logger.js';
import { discoverPrinters } from './printer-discovery.js';
import { ConnectionManager } from './socket-client.js';
import type { RegisteredPrinter } from './types.js';
import { CURRENT_VERSION } from './version.js';
import { checkForUpdates } from './version-check.js';

function handleCliFlags(): boolean {
  const args = process.argv.slice(2);

  if (args.includes('--uninstall')) {
    const ok = disableAutostart();
    if (ok) {
      console.log('Inicio automatico removido com sucesso.');
    } else {
      console.log('Nao foi possivel remover o inicio automatico.');
    }
    return true;
  }

  return false;
}

async function main(): Promise<void> {
  if (handleCliFlags()) {
    process.exit(0);
  }

  log(`Print Agent v${CURRENT_VERSION} iniciando...`);
  await checkForUpdates();

  const config = await loadConfig();
  log(`Configuracao carregada: apiUrl=${config.apiUrl}, agentId=${config.agentId}`);

  // 2. Initialize API client
  const apiClient = new ApiClient(config);

  // 3. Discover printers
  const discovered = discoverPrinters();
  if (discovered.length === 0) {
    log('Nenhuma impressora encontrada. O agente vai iniciar, mas nao podera imprimir.');
  }

  // 4. Register printers with backend
  let registeredPrinters: RegisteredPrinter[] = [];
  try {
    registeredPrinters = await apiClient.registerPrinters(discovered);
  } catch (error) {
    logError('Falha ao registrar impressoras. Tentara novamente ao reconectar.', error);
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
        logError('Falha ao buscar jobs pendentes', error);
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
        logError('Falha ao re-registrar impressoras ao reconectar', error);
      }

      // Fetch accumulated PENDING jobs
      if (printerIds.length > 0) {
        try {
          const pendingJobs = await apiClient.listPendingJobs(printerIds);
          log(`${pendingJobs.length} job(s) pendente(s) encontrado(s) apos reconexao`);
          for (const job of pendingJobs) {
            enqueueJob(job.id);
          }
        } catch (error) {
          logError('Falha ao buscar jobs pendentes apos reconexao', error);
        }
      }
    },
  );

  connectionManager.start();

  log('Print Agent rodando. Pressione Ctrl+C para parar.');

  // Graceful shutdown
  const shutdown = (): void => {
    log('Encerrando...');
    connectionManager.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Keep the process alive
  setInterval(() => {}, 60_000);
}

async function waitForEnter(): Promise<void> {
  const { createInterface } = await import('node:readline');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question('\nPressione Enter para fechar...', () => {
      rl.close();
      resolve();
    });
  });
}

main().catch(async (error) => {
  logError('Erro fatal', error);
  await waitForEnter();
  process.exit(1);
});
