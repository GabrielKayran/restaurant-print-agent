import { EscPosBuilder } from '../escpos/builder.js';
import type { TableBillLine, TableBillPayload } from '../types.js';
import { formatCurrency, formatDateTime } from './format-utils.js';

function formatPercent(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(2).replace('.', ',')}%`;
}

function printLines(b: EscPosBuilder, lines: TableBillLine[]): void {
  for (const line of lines) {
    b.pair(`${line.quantity}x ${line.name}`, formatCurrency(line.total));
    for (const option of line.options) {
      b.text(`   > ${option}`);
    }
  }
}

function describeSplit(amounts: number[]): string[] {
  const groups = new Map<number, number>();
  for (const amount of amounts) {
    groups.set(amount, (groups.get(amount) ?? 0) + 1);
  }
  return [...groups].map(([amount, count]) => `${count}x ${formatCurrency(amount)}`);
}

export function buildTableBill(payload: TableBillPayload, paperWidth: number): Buffer {
  const b = new EscPosBuilder(paperWidth);
  const feeLabel = `Servico (${formatPercent(payload.serviceFeePercent)})`;

  b.alignCenter();
  b.bold(payload.unitName);
  if (payload.unitAddress) {
    b.text(payload.unitAddress);
  }
  if (payload.unitCnpj) {
    b.text(`CNPJ: ${payload.unitCnpj}`);
  }

  b.line();
  b.bold('CONFERENCIA DE CONTA');
  b.text('NAO E DOCUMENTO FISCAL');
  b.tallText();
  b.bold(payload.tableName);
  b.resetFontSize();
  b.line();
  b.alignLeft();
  b.pair('Abertura:', formatDateTime(payload.openedAt));
  b.pair('Emissao:', formatDateTime(payload.printedAt));
  if (payload.guestCount) {
    b.pair('Pessoas:', String(payload.guestCount));
  }
  b.line();

  for (const section of payload.sections) {
    b.bold(section.title.toUpperCase());
    printLines(b, section.lines);
    if (section.sharedShare !== 0) {
      b.pair('  Itens:', formatCurrency(section.itemsTotal));
      b.pair('  Parte da mesa:', formatCurrency(section.sharedShare));
    }
    if (section.serviceFee > 0) {
      b.pair(`  ${feeLabel}:`, formatCurrency(section.serviceFee));
    }
    b.boldPair(`  Total ${section.title}:`, formatCurrency(section.total));
    if (section.paid && section.paid > 0) {
      b.pair('  Ja pago:', formatCurrency(section.paid));
    }
    b.line();
  }

  if (payload.sharedLines.length > 0) {
    b.bold('MESA (COMPARTILHADO)');
    printLines(b, payload.sharedLines);
    if (payload.sharedSplitAmong > 1) {
      b.text(`  Dividido entre ${payload.sharedSplitAmong} pessoas`);
    }
    b.line();
  }

  if (payload.personOnly && payload.sharedSplitAmong > 1) {
    b.text(
      `Inclui 1/${payload.sharedSplitAmong} dos itens da mesa (${formatCurrency(payload.sharedTotal)})`,
    );
    b.line();
  }

  b.pair('Subtotal:', formatCurrency(payload.subtotal + payload.discount));
  if (payload.discount > 0) {
    b.pair('Desconto:', `-${formatCurrency(payload.discount)}`);
  }
  if (payload.serviceFee > 0) {
    b.pair(`${feeLabel}:`, formatCurrency(payload.serviceFee));
  }
  b.tallText();
  b.boldPair('TOTAL:', formatCurrency(payload.total));
  b.resetFontSize();

  if (payload.paid && payload.paid > 0) {
    b.pair('Ja pago:', formatCurrency(payload.paid));
    b.tallText();
    b.boldPair('FALTA PAGAR:', formatCurrency(payload.remaining ?? 0));
    b.resetFontSize();
  }

  if (payload.splitAmounts && payload.splitAmounts.length > 1) {
    b.line();
    b.bold(
      payload.paid && payload.paid > 0
        ? `Restante dividido por ${payload.splitAmounts.length}:`
        : `Dividido por ${payload.splitAmounts.length}:`,
    );
    for (const row of describeSplit(payload.splitAmounts)) {
      b.text(`  ${row}`);
    }
  }

  b.line();
  b.alignCenter();
  if (payload.serviceFee > 0) {
    b.text('Taxa de servico opcional');
  }
  b.text('Obrigado pela preferencia!');
  b.newline();
  b.cut();

  return b.build();
}
