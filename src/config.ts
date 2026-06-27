import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { hostname, platform } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import keytar from 'keytar';
import { enableAutostart, isAutostartEnabled } from './autostart.js';
import { logWarn } from './logger.js';
import type { AgentConfig } from './types.js';
import {
  showAutostartCreated,
  showAutostartFailed,
  showFirstRunHeader,
  showKeyEmpty,
  showKeySaved,
} from './ui.js';

/**
 * API URL is hardcoded at build time.
 * Override via AGENT_API_URL env var for development.
 */
const DEFAULT_API_URL = 'https://api.kayran.dev.br';

const KEYTAR_SERVICE = 'restaurant-print-agent';
const KEYTAR_ACCOUNT = 'agentKey';

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
  const host =
    hostname()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '') || 'unknown';
  const uniqueSuffix = randomUUID().split('-')[0]; // 8 chars hex — suficiente para unicidade local
  return `agent-${host}-${uniqueSuffix}`;
}

async function readPersistedData(): Promise<PersistedData | null> {
  const path = getDataPath();

  // Try to read agentKey from the OS credential store
  let agentKey: string | null = null;
  try {
    agentKey = await keytar.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
  } catch {
    // keytar unavailable (e.g. headless server) — will attempt file fallback below
  }

  // Migration: if keytar returned nothing but the old JSON file has agentKey, migrate it
  if (!agentKey && existsSync(path)) {
    try {
      const raw = readFileSync(path, 'utf-8');
      const data = JSON.parse(raw) as Partial<PersistedData>;
      if (data.agentKey && data.agentId) {
        try {
          await keytar.setPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT, data.agentKey);
          // Remove agentKey from file after successful migration
          writeFileSync(path, JSON.stringify({ agentId: data.agentId }, null, 2), 'utf-8');
        } catch {
          // keytar still unavailable — keep agentKey in file as fallback
        }
        return { agentKey: data.agentKey, agentId: data.agentId };
      }
    } catch {
      // ignore parse errors
    }
  }

  if (!agentKey) return null;
  if (!existsSync(path)) return null;

  try {
    const raw = readFileSync(path, 'utf-8');
    const data = JSON.parse(raw) as { agentId?: string };
    if (data.agentId) return { agentKey, agentId: data.agentId };
  } catch {
    // ignore
  }

  return null;
}

async function savePersistedData(data: PersistedData): Promise<void> {
  const path = getDataPath();
  try {
    await keytar.setPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT, data.agentKey);
    // Only write agentId to the file — agentKey is now in the credential store
    writeFileSync(path, JSON.stringify({ agentId: data.agentId }, null, 2), 'utf-8');
  } catch {
    logWarn('Credential store indisponível. Usando arquivo de fallback com permissões restritas.');
    // Fallback: save entire payload with restricted permissions
    writeFileSync(path, JSON.stringify(data, null, 2), { encoding: 'utf-8', mode: 0o600 });
  }
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

  const persisted = await readPersistedData();

  if (persisted) {
    return {
      apiUrl,
      agentKey: persisted.agentKey,
      agentId: persisted.agentId,
    };
  }

  // First run
  showFirstRunHeader();

  let agentKey = '';
  while (!agentKey) {
    agentKey = await promptLine('  API Key: ');
    if (!agentKey) {
      showKeyEmpty();
    }
  }

  const agentId = generateAgentId();
  await savePersistedData({ agentKey, agentId });
  showKeySaved(agentId);

  // Offer autostart on Windows
  if (platform() === 'win32' && !isAutostartEnabled()) {
    console.log('');
    const answer = await promptLine('  Iniciar automaticamente ao ligar o PC? (S/n): ');
    const yes = !answer || answer.toLowerCase() === 's';

    if (yes) {
      const ok = enableAutostart();
      if (ok) {
        showAutostartCreated();
      } else {
        showAutostartFailed();
      }
    }
  }

  console.log('');

  return { apiUrl, agentKey, agentId };
}

export async function reconfigureKey(): Promise<AgentConfig> {
  const apiUrl = (process.env.AGENT_API_URL || DEFAULT_API_URL).replace(/\/+$/, '');
  const persisted = await readPersistedData();
  const agentId = persisted?.agentId || generateAgentId();

  let agentKey = '';
  while (!agentKey) {
    agentKey = await promptLine('  Nova API Key: ');
    if (!agentKey) {
      showKeyEmpty();
    }
  }

  await savePersistedData({ agentKey, agentId });
  showKeySaved(agentId);
  console.log('');

  return { apiUrl, agentKey, agentId };
}

export async function clearCredentials(): Promise<void> {
  try {
    await keytar.deletePassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
  } catch {
    // best-effort — ignore errors during uninstall
  }
}

// Exported for testing
export { generateAgentId, readPersistedData, savePersistedData, getDataPath };
