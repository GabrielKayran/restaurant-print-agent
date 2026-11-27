import { describe, it, expect } from 'vitest';
import { describePrintFailure, PrinterNotFoundError } from '../src/print-error.js';

const ENCODED = 'QQBkAGQALQBUAHkAcABlACAALQBUAHkAcABl';

function powershellFailure(errorText: string): Error {
  const stderr =
    '#< CLIXML\r\n<Objs Version="1.1.0.1"><Obj S="progress" RefId="0"></Obj>' +
    `<S S="Error">${errorText}_x000D__x000A_</S>` +
    '<S S="Error">No linha:45 caractere:1_x000D__x000A_</S></Objs>';
  return Object.assign(
    new Error(`Command failed: powershell -NoProfile -EncodedCommand ${ENCODED}\n${stderr}`),
    { stderr: Buffer.from(stderr) },
  );
}

describe('describePrintFailure', () => {
  it('turns Windows error 1801 into "printer not found" with no script noise', () => {
    const error = describePrintFailure(
      powershellFailure(
        'Exceção ao chamar "Send" com "2" argumento(s): "OpenPrinter falhou: 1801"',
      ),
      'EPSON TM-T20 CAIXA',
    );

    expect(error).toBeInstanceOf(PrinterNotFoundError);
    expect(error.message).toContain('"EPSON TM-T20 CAIXA" nao encontrada no Windows');
    expect(error.message).not.toContain(ENCODED);
    expect(error.message).not.toContain('CLIXML');
  });

  it('explains access denied and a stopped spooler', () => {
    expect(
      describePrintFailure(powershellFailure('"OpenPrinter falhou: 5"'), 'ELGIN').message,
    ).toContain('Sem permissao');
    expect(
      describePrintFailure(powershellFailure('"StartDocPrinter falhou: 1722"'), 'ELGIN').message,
    ).toContain('Spooler');
  });

  it('keeps any other Windows code short and actionable', () => {
    const message = describePrintFailure(
      powershellFailure('"WritePrinter falhou: 1460"'),
      'ELGIN',
    ).message;

    expect(message).toBe(
      'Falha ao imprimir em "ELGIN" (codigo 1460 do Windows). Confira se a impressora esta ligada.',
    );
  });

  it('says the printer did not answer when the command timed out', () => {
    const timeout = Object.assign(new Error('spawnSync powershell ETIMEDOUT'), {
      code: 'ETIMEDOUT',
    });

    expect(describePrintFailure(timeout, 'ELGIN').message).toContain('nao respondeu a tempo');
  });

  it('falls back to the PowerShell error line, never the encoded script', () => {
    const message = describePrintFailure(
      powershellFailure('Arquivo de impressao bloqueado'),
      'ELGIN',
    ).message;

    expect(message).toBe('Arquivo de impressao bloqueado');
  });
});
