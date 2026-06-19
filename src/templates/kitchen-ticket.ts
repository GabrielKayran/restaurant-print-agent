import { EscPosBuilder } from '../escpos/builder.js';
import type { PrintPayload } from '../types.js';
import { formatTime, orderTypeLabel } from './format-utils.js';

export function buildKitchenTicket(payload: PrintPayload, paperWidth: number): Buffer {
  const b = new EscPosBuilder(paperWidth);

  // Header — order type prominent
  b.alignCenter();
  b.fontSize(2);
  b.bold(orderTypeLabel(payload.orderType));
  b.resetFontSize();
  b.newline();
  b.fontSize(2);
  b.bold(`PEDIDO #${payload.orderCode}`);
  b.resetFontSize();
  b.text(`[${formatTime(payload.createdAt)}]`);
  b.line();

  // Customer or table
  b.alignLeft();
  if (payload.orderType === 'DINE_IN' && payload.tableName) {
    b.fontSize(1);
    b.bold(`Mesa: ${payload.tableName}`);
    b.resetFontSize();
  } else if (payload.customerName) {
    b.text(`Cliente: ${payload.customerName}`);
  }

  // Show delivery address on kitchen ticket for context
  if (payload.orderType === 'DELIVERY' && payload.deliveryAddress) {
    const addr = payload.deliveryAddress;
    let street = addr.street;
    if (addr.number) street += `, ${addr.number}`;
    b.text(`Endereco: ${street}`);
    if (addr.neighborhood) b.text(`  ${addr.neighborhood}`);
  }

  b.line();

  // Items
  for (const item of payload.items) {
    const itemName = item.variantName ? `${item.name} (${item.variantName})` : item.name;
    b.bold(`${item.quantity}x ${itemName}`);

    for (const option of item.options) {
      b.text(`   > ${option.name}`);
    }

    if (item.notes) {
      b.text(`   * ${item.notes}`);
    }
  }

  // General notes
  if (payload.generalNotes) {
    b.line();
    b.bold(`!! ${payload.generalNotes.toUpperCase()}`);
  }

  b.newline();
  b.cut();

  return b.build();
}
