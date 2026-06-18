import { EscPosBuilder } from '../escpos/builder.js';
import type { PrintPayload } from '../types.js';
import { formatTime, orderTypeLabel } from './format-utils.js';

export function buildKitchenTicket(
  payload: PrintPayload,
  paperWidth: number,
): Buffer {
  const b = new EscPosBuilder(paperWidth);

  // Header
  b.alignCenter();
  b.fontSize(2);
  b.bold(`PEDIDO #${payload.orderCode}`);
  b.resetFontSize();
  b.pair(orderTypeLabel(payload.orderType), `[${formatTime(payload.createdAt)}]`);
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
  b.line();

  // Items
  for (const item of payload.items) {
    const itemName = item.variantName
      ? `${item.name} (${item.variantName})`
      : item.name;
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
