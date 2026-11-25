import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatQuantity,
  formatDateTime,
  formatTime,
  orderTypeLabel,
} from '../../src/templates/format-utils.js';

describe('formatCurrency', () => {
  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('R$0,00');
  });

  it('formats integer value', () => {
    expect(formatCurrency(10)).toBe('R$10,00');
  });

  it('formats decimal value', () => {
    expect(formatCurrency(97.5)).toBe('R$97,50');
  });

  it('formats large value', () => {
    expect(formatCurrency(1234.56)).toBe('R$1234,56');
  });

  it('rounds to 2 decimal places', () => {
    expect(formatCurrency(9.999)).toBe('R$10,00');
  });
});

describe('formatDateTime', () => {
  it('formats ISO string to dd/mm HH:MM', () => {
    const result = formatDateTime('2026-03-15T18:25:33.417Z');
    // Result depends on timezone, just check format
    expect(result).toMatch(/^\d{2}\/\d{2} \d{2}:\d{2}$/);
  });
});

describe('formatTime', () => {
  it('formats ISO string to HH:MM', () => {
    const result = formatTime('2026-03-15T18:25:33.417Z');
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe('orderTypeLabel', () => {
  it('maps DINE_IN to MESA', () => {
    expect(orderTypeLabel('DINE_IN')).toBe('MESA');
  });

  it('maps TAKEAWAY to RETIRADA', () => {
    expect(orderTypeLabel('TAKEAWAY')).toBe('RETIRADA');
  });

  it('maps DELIVERY to DELIVERY', () => {
    expect(orderTypeLabel('DELIVERY')).toBe('DELIVERY');
  });

  it('returns unknown types as-is', () => {
    expect(orderTypeLabel('OTHER')).toBe('OTHER');
  });
});

describe('formatQuantity', () => {
  it('prints whole units without decimals and fractions with a comma', () => {
    expect(formatQuantity(2)).toBe('2');
    expect(formatQuantity(0.5)).toBe('0,5');
    expect(formatQuantity(1.25)).toBe('1,25');
    expect(formatQuantity('3')).toBe('3');
  });
});
