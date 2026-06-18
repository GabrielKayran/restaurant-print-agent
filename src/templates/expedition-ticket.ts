import { EscPosBuilder } from '../escpos/builder.js';
import type { PrintPayload } from '../types.js';
import {
  formatCurrency,
  formatTime,
  orderTypeLabel,
} from './format-utils.js';

export function buildExpeditionTicket(
  payload: PrintPayload,
  paperWidth: number,
): Buffer {
  const b = new EscPosBuilder(paperWidth);

  // Header
  b.alignCenter();
  b.fontSize(2);
  b.bold(`EXPEDICAO - PEDIDO #${payload.orderCode}`);
  b.resetFontSize();
  b.pair(orderTypeLabel(payload.orderType), `[${formatTime(payload.createdAt)}]`);
  b.line();

  // Customer info
  b.alignLeft();
  if (payload.customerName) {
    b.text(`Cliente: ${payload.customerName}`);
  }
  if (payload.customerPhone) {
    b.text(`Tel: ${payload.customerPhone}`);
  }

  // Delivery address
  if (payload.deliveryAddress) {
    b.line();
    const addr = payload.deliveryAddress;
    b.bold('Endereco:');
    let street = addr.street;
    if (addr.number) street += `, ${addr.number}`;
    if (addr.complement) street += ` - ${addr.complement}`;
    b.text(street);

    const parts: string[] = [];
    if (addr.neighborhood) parts.push(addr.neighborhood);
    if (addr.city) {
      let cityState = addr.city;
      if (addr.state) cityState += `/${addr.state}`;
      parts.push(cityState);
    }
    if (parts.length > 0) {
      b.text(parts.join(' - '));
    }

    if (addr.reference) {
      b.text(`Ref: ${addr.reference}`);
    }
  }

  // Courier
  if (payload.courierName) {
    b.line();
    b.text(`Entregador: ${payload.courierName}`);
  }

  b.line();

  // Items with prices
  for (const item of payload.items) {
    const itemName = item.variantName
      ? `${item.name} (${item.variantName})`
      : item.name;
    const qty = `${item.quantity}x ${itemName}`;
    b.pair(qty, formatCurrency(item.totalPrice));

    for (const option of item.options) {
      if (option.price > 0) {
        b.pair(`   > ${option.name}`, formatCurrency(option.price));
      } else {
        b.text(`   > ${option.name}`);
      }
    }

    if (item.notes) {
      b.text(`   * ${item.notes}`);
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
  b.boldPair('TOTAL:', formatCurrency(payload.total));

  b.line();

  // Payment
  for (const payment of payload.payments) {
    b.pair(`Pagamento: ${payment.method}`, formatCurrency(payment.amount));
  }

  if (payload.changeFor && payload.changeFor > 0) {
    b.newline();
    b.alignCenter();
    b.fontSize(1);
    b.bold(`TROCO PARA ${formatCurrency(payload.changeFor)}`);
    b.resetFontSize();
    b.alignLeft();
  }

  // Source reference
  if (payload.sourceReference) {
    b.line();
    b.text(payload.sourceReference);
  }

  b.newline();
  b.cut();

  return b.build();
}
