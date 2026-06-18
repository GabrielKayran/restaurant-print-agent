import { createInterface } from 'node:readline';
import { ApiClient } from './api-client.js';
import { disableAutostart } from './autostart.js';
import { loadConfig } from './config.js';
import { JobProcessor } from './job-processor.js';
import { log, logError } from './logger.js';
import { discoverPrinters } from './printer-discovery.js';
import { ConnectionManager } from './socket-client.js';
import type { RegisteredPrinter } from './types.js';
import {
  showBanner,
  showFatalError,
  showPrinters,
  showRunning,
  showShutdown,
  showStep,
  showWarning,
} from './ui.js';
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

  showBanner(CURRENT_VERSION);
  await checkForUpdates();

  showStep('Carregando configuracao...');
  const config = await loadConfig();
  log(`Config loaded: apiUrl=${config.apiUrl}, agentId=${config.agentId}`);

  const apiClient = new ApiClient(config);

  showStep('Descobrindo impressoras...');
  const discovered = discoverPrinters();
  showPrinters(discovered.map((p) => p.deviceName));

  if (discovered.length === 0) {
    showWarning('O agente vai iniciar, mas nao podera imprimir.');
  }

  let registeredPrinters: RegisteredPrinter[] = [];
  try {
    showStep('Registrando impressoras no servidor...');
    registeredPrinters = await apiClient.registerPrinters(discovered);
  } catch (error) {
    logError('Falha ao registrar impressoras. Tentara novamente ao reconectar.', error);
  }

  const jobProcessor = new JobProcessor(apiClient);
  jobProcessor.updatePrinters(registeredPrinters);

  const printerIds = registeredPrinters.map((p) => p.id);

  let processingQueue = Promise.resolve();
  function enqueueJob(jobId: string): void {
    processingQueue = processingQueue
      .then(() => jobProcessor.processJob(jobId))
      .catch((error) => logError(`Unexpected error processing job ${jobId}`, error));
  }

  showStep('Conectando ao servidor...');

  const connectionManager = new ConnectionManager(
    config,
    (event) => {
      enqueueJob(event.jobId);
    },
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
    async () => {
      try {
        const freshPrinters = await apiClient.registerPrinters(discovered);
        jobProcessor.updatePrinters(freshPrinters);
        const freshIds = freshPrinters.map((p) => p.id);
        printerIds.length = 0;
        printerIds.push(...freshIds);
      } catch (error) {
        logError('Falha ao re-registrar impressoras ao reconectar', error);
      }

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

  showRunning();

  const shutdown = (): void => {
    showShutdown();
    connectionManager.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  setInterval(() => {}, 60_000);
}

function waitForEnter(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question('\nPressione Enter para fechar...', () => {
      rl.close();
      resolve();
    });
  });
}

process.on('uncaughtException', async (error) => {
  showFatalError(error);
  logError('Erro nao tratado', error);
  await waitForEnter();
  process.exit(1);
});

process.on('unhandledRejection', async (reason) => {
  showFatalError(reason);
  logError('Promise rejeitada nao tratada', reason);
  await waitForEnter();
  process.exit(1);
});

main().catch(async (error) => {
  showFatalError(error);
  logError('Erro fatal', error);
  await waitForEnter();
  process.exit(1);
});
