/**
 * Turns what Windows (through PowerShell) says when a print fails into a
 * sentence the restaurant staff can act on. The raw output carries the whole
 * encoded script and CLIXML noise, which nobody can read on the panel.
 */

/** ERROR_INVALID_PRINTER_NAME: no printer with that name in Windows. */
const ERROR_INVALID_PRINTER_NAME = 1801;
const ERROR_ACCESS_DENIED = 5;
/** The print spooler is stopped or not answering. */
const SPOOLER_ERRORS = new Set([1722, 1753, 1068, 1058]);

const MAX_MESSAGE_LENGTH = 200;

export class PrinterNotFoundError extends Error {
  constructor(readonly deviceName: string) {
    super(
      `Impressora "${deviceName}" nao encontrada no Windows (removida ou renomeada). ` +
        'Abra o GKFood Print Agent e escolha a impressora certa.',
    );
    this.name = 'PrinterNotFoundError';
  }
}

export class PrintFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrintFailedError';
  }
}

function rawTextOf(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const stderr = (error as { stderr?: unknown }).stderr;
  const stderrText =
    stderr instanceof Buffer ? stderr.toString('utf-8') : typeof stderr === 'string' ? stderr : '';
  return `${error.message}\n${stderrText}`;
}

function windowsErrorCode(text: string): number | null {
  const match = /(?:OpenPrinter|StartDocPrinter|StartPagePrinter|WritePrinter) falhou: (\d+)/.exec(
    text,
  );
  return match ? Number(match[1]) : null;
}

function isTimeout(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  const signal = (error as { signal?: unknown } | null)?.signal;
  return code === 'ETIMEDOUT' || signal === 'SIGTERM';
}

export function describePrintFailure(error: unknown, deviceName: string): Error {
  const text = rawTextOf(error);
  const code = windowsErrorCode(text);

  if (code === ERROR_INVALID_PRINTER_NAME) {
    return new PrinterNotFoundError(deviceName);
  }
  if (code === ERROR_ACCESS_DENIED) {
    return new PrintFailedError(
      `Sem permissao para imprimir em "${deviceName}". Confira o usuario do Windows.`,
    );
  }
  if (code !== null && SPOOLER_ERRORS.has(code)) {
    return new PrintFailedError(
      'O servico de impressao do Windows (Spooler) nao esta respondendo. Reinicie o computador.',
    );
  }
  if (code !== null) {
    return new PrintFailedError(
      `Falha ao imprimir em "${deviceName}" (codigo ${code} do Windows). Confira se a impressora esta ligada.`,
    );
  }
  if (isTimeout(error)) {
    return new PrintFailedError(
      `A impressora "${deviceName}" nao respondeu a tempo. Confira cabo, energia e papel.`,
    );
  }

  const clixmlError = /<S S="Error">([^<]*)<\/S>/.exec(text)?.[1];
  const readable = (clixmlError ? clixmlError.replace(/_x000D__x000A_/g, '\n') : text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(
      (line) =>
        line.length > 0 &&
        !line.startsWith('Command failed') &&
        !line.startsWith('#< CLIXML') &&
        !line.startsWith('<'),
    );
  return new PrintFailedError(
    (readable ?? `Falha ao imprimir em "${deviceName}".`).slice(0, MAX_MESSAGE_LENGTH),
  );
}
