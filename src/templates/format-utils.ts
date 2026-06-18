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
    default:
      return type;
  }
}
