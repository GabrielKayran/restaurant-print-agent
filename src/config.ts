import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { hostname, platform } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { enableAutostart, isAutostartEnabled } from './autostart.js';
import type { AgentConfig } from './types.js';

/**
 * API URL is hardcoded at build time.
 * Override via AGENT_API_URL env var for development.
 */
const DEFAULT_API_URL = 'https://api.kayran.dev.br';

interface PersistedData {
  agentKey: string;
  agentId: string;
}

function getDataDir(): string {
  const isPackaged = !!(process as NodeJS.Process & { pkg?: unknown }).pkg;
  if (isPackaged) return dirname(process.execPath);
  try {
    return dirname(fileURLToPath(import.meta.url));
  } catch {
    return process.cwd();
  }
}

function getDataPath(): string {
  const dir = getDataDir();
  const isPackaged = !!(process as NodeJS.Process & { pkg?: unknown }).pkg;
  return join(dir, isPackaged ? '.agent-data.json' : '../.agent-data.json');
}

function generateAgentId(): string {
  const host = hostname()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '');
  return `agent-${host || 'unknown'}`;
}

function readPersistedData(): PersistedData | null {
  const path = getDataPath();
  if (!existsSync(path)) return null;

  try {
    const raw = readFileSync(path, 'utf-8');
    const data = JSON.parse(raw) as Partial<PersistedData>;
    if (data.agentKey && data.agentId) {
      return { agentKey: data.agentKey, agentId: data.agentId };
    }
    return null;
  } catch {
    return null;
  }
}

function savePersistedData(data: PersistedData): void {
  const path = getDataPath();
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
}

function promptLine(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function loadConfig(): Promise<AgentConfig> {
  const apiUrl = (process.env.AGENT_API_URL || DEFAULT_API_URL).replace(/\/+$/, '');

  const persisted = readPersistedData();

  if (persisted) {
    return {
      apiUrl,
      agentKey: persisted.agentKey,
      agentId: persisted.agentId,
    };
  }

  // First run — prompt for API key
  console.log('');
  console.log('============================================');
  console.log('   Print Agent — Primeira execucao');
  console.log('============================================');
  console.log('');
  console.log('Cole a chave do agente (API Key) gerada no');
  console.log('painel: Configuracoes > Impressoras > Chave');
  console.log('');

  let agentKey = '';
  while (!agentKey) {
    agentKey = await promptLine('API Key: ');
    if (!agentKey) {
      console.log('A chave nao pode ser vazia. Tente novamente.');
    }
  }

  const agentId = generateAgentId();

  savePersistedData({ agentKey, agentId });

  console.log('');
  console.log(`Chave salva com sucesso! (agentId: ${agentId})`);

  // Offer autostart on Windows
  if (platform() === 'win32' && !isAutostartEnabled()) {
    console.log('');
    const answer = await promptLine(
      'Deseja que o agente inicie automaticamente ao ligar o PC? (S/n): ',
    );
    const yes = !answer || answer.toLowerCase() === 's';

    if (yes) {
      const ok = enableAutostart();
      if (ok) {
        console.log('Atalho criado! O agente vai iniciar automaticamente.');
      } else {
        console.log('Nao foi possivel criar o atalho. Voce pode configurar manualmente depois.');
      }
    }
  }

  console.log('');

  return { apiUrl, agentKey, agentId };
}

// Exported for testing
export { generateAgentId, readPersistedData, savePersistedData, getDataPath };
