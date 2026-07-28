import type { PrintPayloadItem } from '../types.js';

export interface PrintItemGroup {
  guestId: string | null;
  guestName: string | null;
  items: PrintPayloadItem[];
}

/**
 * Returns items grouped by guestId when at least one item has a guestName,
 * or null when no item has a guestName (flat rendering unchanged).
 * Named groups appear first (in insertion order); GERAL (null guestId) is last.
 */
export function groupItemsByGuest(items: PrintPayloadItem[]): PrintItemGroup[] | null {
  if (!items.some((i) => i.guestName)) return null;

  const groupMap = new Map<string | null, PrintItemGroup>();

  for (const item of items) {
    const key = item.guestId;
    if (!groupMap.has(key)) {
      groupMap.set(key, { guestId: key, guestName: item.guestName, items: [] });
    }
    groupMap.get(key)!.items.push(item);
  }

  const result: PrintItemGroup[] = [];
  for (const [key, group] of groupMap) {
    if (key !== null) result.push(group);
  }
  if (groupMap.has(null)) result.push(groupMap.get(null)!);

  return result;
}

export function formatCurrency(value: number): string {
  return `R$${value.toFixed(2).replace('.', ',')}`;
}

export function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month} ${hours}:${minutes}`;
}

export function formatTime(isoString: string): string {
  const date = new Date(isoString);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function orderTypeLabel(type: string): string {
  switch (type) {
    case 'DINE_IN':
      return 'MESA';
    case 'TAKEAWAY':
      return 'RETIRADA';
    case 'DELIVERY':
      return 'DELIVERY';
    case 'COUNTER':
      return 'BALCAO';
    default:
      return type;
  }
}
