import { describe, it, expect } from 'vitest';
import { buildKitchenTicket } from '../../src/templates/kitchen-ticket.js';
import type { PrintPayload } from '../../src/types.js';

function makePayload(overrides: Partial<PrintPayload> = {}): PrintPayload {
  return {
    orderCode: 42,
    orderType: 'DINE_IN',
    orderChannel: 'POS',
    tableName: 'Mesa 5',
    customerName: null,
    customerPhone: null,
    deliveryAddress: null,
    courierName: null,
    createdAt: '2026-03-15T18:25:00Z',
    items: [
      {
        name: 'X-Bacon',
        variantName: null,
        quantity: 2,
        unitPrice: 25,
        totalPrice: 50,
        notes: 'Sem cebola',
        options: [{ name: 'Cheddar extra', price: 5 }],
        categoryName: 'Lanches',
      },
    ],
    generalNotes: null,
    subtotal: 50,
    deliveryFee: 0,
    discount: 0,
    total: 50,
    payments: [{ method: 'PIX', amount: 50 }],
    changeFor: null,
    sourceReference: null,
    unitName: 'Hamburgueria Centro',
    unitAddress: 'Rua A, 100',
    unitCnpj: '12.345.678/0001-00',
    ...overrides,
  };
}

describe('buildKitchenTicket', () => {
  it('returns a buffer', () => {
    const result = buildKitchenTicket(makePayload(), 80);
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes order code', () => {
    const result = buildKitchenTicket(makePayload(), 80);
    expect(result.toString()).toContain('PEDIDO #42');
  });

  it('includes table name for DINE_IN', () => {
    const result = buildKitchenTicket(makePayload(), 80);
    expect(result.toString()).toContain('Mesa 5');
  });

  it('includes customer name for non-DINE_IN', () => {
    const result = buildKitchenTicket(
      makePayload({ orderType: 'DELIVERY', customerName: 'Maria', tableName: null }),
      80,
    );
    expect(result.toString()).toContain('Maria');
  });

  it('includes item name and quantity', () => {
    const result = buildKitchenTicket(makePayload(), 80);
    const str = result.toString();
    expect(str).toContain('2x X-Bacon');
  });

  it('includes item options', () => {
    const result = buildKitchenTicket(makePayload(), 80);
    expect(result.toString()).toContain('Cheddar extra');
  });

  it('includes item notes', () => {
    const result = buildKitchenTicket(makePayload(), 80);
    expect(result.toString()).toContain('Sem cebola');
  });

  it('includes general notes in uppercase', () => {
    const result = buildKitchenTicket(
      makePayload({ generalNotes: 'Alergia a amendoim' }),
      80,
    );
    expect(result.toString()).toContain('ALERGIA A AMENDOIM');
  });

  it('does NOT include prices', () => {
    const result = buildKitchenTicket(makePayload(), 80);
    const str = result.toString();
    expect(str).not.toContain('R$');
  });

  it('works with 58mm paper', () => {
    const result = buildKitchenTicket(makePayload(), 58);
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes variant name when present', () => {
    const payload = makePayload({
      items: [
        {
          name: 'Pizza',
          variantName: 'Grande',
          quantity: 1,
          unitPrice: 45,
          totalPrice: 45,
          notes: null,
          options: [],
          categoryName: 'Pizzas',
        },
      ],
    });
    const result = buildKitchenTicket(payload, 80);
    expect(result.toString()).toContain('Pizza (Grande)');
  });
});
