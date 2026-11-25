import { EscPosBuilder } from '../escpos/builder.js';
import type { PrintPayload } from '../types.js';
import {
  formatCurrency,
  formatDateTime,
  formatQuantity,
  paymentMethodLabel,
} from './format-utils.js';

export function buildReceipt(
  payload: PrintPayload,
  paperWidth: number,
): Buffer {
  const b = new EscPosBuilder(paperWidth);

  // Unit info
  b.alignCenter();
  if (payload.unitName) {
    b.bold(payload.unitName);
  }
  if (payload.unitAddress) {
    b.text(payload.unitAddress);
  }
  if (payload.unitCnpj) {
    b.text(`CNPJ: ${payload.unitCnpj}`);
  }

  b.line();
  b.bold('CUPOM NAO FISCAL');
  if (payload.receiptTitle) {
    b.text(payload.receiptTitle);
    b.text(formatDateTime(payload.createdAt));
  } else {
    b.pair(`Pedido #${payload.orderCode}`, formatDateTime(payload.createdAt));
  }
  b.line();
  b.alignLeft();

  // Items
  for (const item of payload.items) {
    const itemName = item.variantName
      ? `${item.name} (${item.variantName})`
      : item.name;
    const qty = `${formatQuantity(item.quantity)}x ${itemName}`;
    b.pair(qty, formatCurrency(item.totalPrice));

    for (const option of item.options) {
      if (option.price > 0) {
        b.pair(`   > ${option.name}`, formatCurrency(option.price));
      } else {
        b.text(`   > ${option.name}`);
      }
    }
  }

  b.line();

  // Totals
  b.pair('Subtotal:', formatCurrency(payload.subtotal));
  if (payload.deliveryFee > 0) {
    b.pair('Taxa entrega:', formatCurrency(payload.deliveryFee));
  }
  if (payload.discount > 0) {
    b.pair('Desconto:', `-${formatCurrency(payload.discount)}`);
  }
  if (payload.serviceFee && payload.serviceFee > 0) {
    const percent = payload.serviceFeePercent
      ? ` (${String(payload.serviceFeePercent).replace('.', ',')}%)`
      : '';
    b.pair(`Servico${percent}:`, formatCurrency(payload.serviceFee));
  }
  b.boldPair('TOTAL:', formatCurrency(payload.total));

  b.line();

  // Payments
  for (const payment of payload.payments) {
    b.pair(
      `Pagamento: ${paymentMethodLabel(payment.method)}`,
      formatCurrency(payment.amount),
    );
  }
  if (payload.remaining !== undefined) {
    b.boldPair(
      payload.remaining > 0 ? 'Falta pagar:' : 'Conta quitada',
      payload.remaining > 0 ? formatCurrency(payload.remaining) : '',
    );
  }

  b.line();

  // Footer
  b.alignCenter();
  b.text('Obrigado pela preferencia!');
  b.newline();
  b.cut();

  return b.build();
}
