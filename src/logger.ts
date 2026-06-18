import { appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

function getLogPath(): string {
  const isPackaged = !!(process as NodeJS.Process & { pkg?: unknown }).pkg;
  const base = isPackaged ? dirname(process.execPath) : process.cwd();
  return join(base, 'print-agent.log');
}

const logFile = getLogPath();

function timestamp(): string {
  return new Date().toISOString();
}

function writeToFile(line: string): void {
  try {
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
