import { EscPosBuilder } from '../escpos/builder.js';
import type { TestPagePayload } from '../types.js';
import { formatDateTime } from './format-utils.js';

export function buildTestPage(payload: TestPagePayload, paperWidth: number): Buffer {
  const b = new EscPosBuilder(paperWidth);

  b.alignCenter();
  b.line('=');
  b.newline();
  b.fontSize(2);
  b.bold('PAGINA DE TESTE');
  b.resetFontSize();
  b.newline();
  b.line('=');

  b.alignLeft();
  b.newline();
  b.text(`Impressora: ${payload.printerName}`);
  b.text(`Dispositivo: ${payload.deviceName}`);
  b.text(`Unidade: ${payload.unitName}`);
  b.text(`Largura: ${payload.paperWidth}mm`);
  b.text(`Data/hora: ${formatDateTime(payload.printedAt)}`);
  b.newline();

  b.line('-');
  b.alignCenter();
  b.bold('Teste de caracteres');
  b.line('-');
  b.alignLeft();
  b.text('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  b.text('abcdefghijklmnopqrstuvwxyz');
  b.text('0123456789');
  b.text('!@#$%&*()-+=[]{}|;:,.<>?');
  b.text('aeiou AEIOU cC');
  b.newline();

  b.line('=');
  b.alignCenter();
  b.bold('Impressora configurada');
  b.bold('com sucesso!');
  b.line('=');
  b.newline();

  b.cut();

  return b.build();
}
