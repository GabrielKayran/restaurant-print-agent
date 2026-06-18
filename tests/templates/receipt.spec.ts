import { describe, it, expect } from 'vitest';
import { buildReceipt } from '../../src/templates/receipt.js';
import type { PrintPayload } from '../../src/types.js';

function makePayload(overrides: Partial<PrintPayload> = {}): PrintPayload {
  return {
    orderCode: 55,
    orderType: 'TAKEAWAY',
    orderChannel: 'POS',
    tableName: null,
    customerName: 'Ana Costa',
    customerPhone: '11988887777',
    deliveryAddress: null,
    courierName: null,
    createdAt: '2026-03-15T14:00:00Z',
    items: [
      {
        name: 'Acai',
        variantName: '500ml',
        quantity: 1,
        unitPrice: 22,
        totalPrice: 22,
        notes: null,
        options: [
          { name: 'Granola', price: 0 },
          { name: 'Leite em po', price: 3 },
        ],
        categoryName: 'Acai',
      },
    ],
    generalNotes: null,
    subtotal: 25,
    deliveryFee: 0,
    discount: 0,
    total: 25,
    payments: [{ method: 'PIX', amount: 25 }],
    changeFor: null,
    sourceReference: null,
    unitName: 'Acai Tropical',
    unitAddress: 'Av. Central, 300, Centro',
    unitCnpj: '98.765.432/0001-99',
    ...overrides,
  };
}

describe('buildReceipt', () => {
  it('returns a buffer', () => {
    const result = buildReceipt(makePayload(), 80);
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes unit info', () => {
    const result = buildReceipt(makePayload(), 80);
    const str = result.toString();
    expect(str).toContain('Acai Tropical');
    expect(str).toContain('Av. Central, 300, Centro');
    expect(str).toContain('98.765.432/0001-99');
  });

  it('includes CUPOM NAO FISCAL header', () => {
    const result = buildReceipt(makePayload(), 80);
    expect(result.toString()).toContain('CUPOM NAO FISCAL');
  });

  it('includes order code', () => {
    const result = buildReceipt(makePayload(), 80);
    expect(result.toString()).toContain('Pedido #55');
  });

  it('includes items with prices', () => {
    const result = buildReceipt(makePayload(), 80);
    const str = result.toString();
    expect(str).toContain('Acai (500ml)');
    expect(str).toContain('R$22,00');
  });

  it('includes options with prices', () => {
    const result = buildReceipt(makePayload(), 80);
    const str = result.toString();
    expect(str).toContain('Leite em po');
    expect(str).toContain('R$3,00');
  });

  it('includes totals', () => {
    const result = buildReceipt(makePayload(), 80);
    const str = result.toString();
    expect(str).toContain('Subtotal:');
    expect(str).toContain('R$25,00');
  });

  it('includes delivery fee when present', () => {
    const result = buildReceipt(makePayload({ deliveryFee: 10 }), 80);
    expect(result.toString()).toContain('Taxa entrega:');
  });

  it('omits delivery fee when zero', () => {
    const result = buildReceipt(makePayload({ deliveryFee: 0 }), 80);
    expect(result.toString()).not.toContain('Taxa entrega:');
  });

  it('includes payment info', () => {
    const result = buildReceipt(makePayload(), 80);
    expect(result.toString()).toContain('PIX');
  });

  it('includes thank you message', () => {
    const result = buildReceipt(makePayload(), 80);
    expect(result.toString()).toContain('Obrigado pela preferencia!');
  });

  it('works with 58mm paper', () => {
    const result = buildReceipt(makePayload(), 58);
    expect(result.length).toBeGreaterThan(0);
  });
});
