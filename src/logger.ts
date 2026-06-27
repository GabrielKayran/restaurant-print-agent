import { appendFileSync, existsSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';

function getLogPath(): string {
  const isPackaged = !!(process as NodeJS.Process & { pkg?: unknown }).pkg;
  const base = isPackaged ? dirname(process.execPath) : process.cwd();
  return join(base, 'print-agent.log');
}

const logFile = getLogPath();

const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_LOG_FILES = 3;

function rotateLogs(logPath: string): void {
  try {
    const stat = statSync(logPath);
    if (stat.size < MAX_LOG_SIZE) return;

    for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
      const from = i === 1 ? logPath : `${logPath}.${i - 1}`;
      const to = `${logPath}.${i}`;
      if (existsSync(from)) {
        if (existsSync(to)) unlinkSync(to);
        renameSync(from, to);
      }
    }
  } catch {}
}

function timestamp(): string {
  return new Date().toISOString();
}

function writeToFile(line: string): void {
  try {
    rotateLogs(logFile);
    appendFileSync(logFile, line + '\n', 'utf-8');
  } catch {
    // silent
  }
}

export function log(message: string, ...args: unknown[]): void {
  const line = `[${timestamp()}] ${message}`;
  console.log(line, ...args);
  writeToFile(args.length ? `${line} ${args.map(String).join(' ')}` : line);
}

export function logError(message: string, ...args: unknown[]): void {
  const line = `[${timestamp()}] ERROR: ${message}`;
  console.error(line, ...args);
  writeToFile(args.length ? `${line} ${args.map(String).join(' ')}` : line);
}

export function logWarn(message: string, ...args: unknown[]): void {
  const line = `[${timestamp()}] WARN: ${message}`;
  console.warn(line, ...args);
  writeToFile(args.length ? `${line} ${args.map(String).join(' ')}` : line);
}
