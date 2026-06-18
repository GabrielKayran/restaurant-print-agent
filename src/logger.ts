function timestamp(): string {
  return new Date().toISOString();
}

export function log(message: string, ...args: unknown[]): void {
  console.log(`[${timestamp()}] ${message}`, ...args);
}

export function logError(message: string, ...args: unknown[]): void {
  console.error(`[${timestamp()}] ERROR: ${message}`, ...args);
}

export function logWarn(message: string, ...args: unknown[]): void {
  console.warn(`[${timestamp()}] WARN: ${message}`, ...args);
}
