import { describe, it, expect } from 'vitest';
import { buildExpeditionTicket } from '../../src/templates/expedition-ticket.js';
import type { PrintPayload } from '../../src/types.js';

function makePayload(overrides: Partial<PrintPayload> = {}): PrintPayload {
  return {
    orderCode: 101,
    orderType: 'DELIVERY',
    orderChannel: 'WHATSAPP',
    tableName: null,
    customerName: 'Joao Silva',
    customerPhone: '34999998888',
    deliveryAddress: {
      street: 'Rua das Flores',
      number: '200',
      complement: 'Apto 301',
      neighborhood: 'Centro',
      city: 'Uberlandia',
      state: 'MG',
      reference: 'Proximo ao mercado',
    },
    courierName: 'Carlos',
    createdAt: '2026-03-15T20:30:00Z',
    items: [
      {
        name: 'Pizza Margherita',
        variantName: 'Grande',
        quantity: 1,
        unitPrice: 45,
        totalPrice: 45,
        notes: null,
        options: [{ name: 'Borda recheada', price: 8 }],
        categoryName: 'Pizzas',
      },
      {
        name: 'Coca-Cola',
        variantName: '2L',
        quantity: 1,
        unitPrice: 12,
        totalPrice: 12,
        notes: null,
        options: [],
        categoryName: 'Bebidas',
      },
    ],
    generalNotes: null,
    subtotal: 65,
    deliveryFee: 8,
    discount: 5,
    total: 68,
    payments: [{ method: 'DINHEIRO', amount: 68 }],
    changeFor: 100,
    sourceReference: 'iFood #ABC123',
    unitName: 'Pizzaria Bella',
    unitAddress: 'Av. Brasil, 500',
    unitCnpj: '12.345.678/0001-00',
    ...overrides,
  };
}

describe('buildExpeditionTicket', () => {
  it('returns a buffer', () => {
    const result = buildExpeditionTicket(makePayload(), 80);
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes EXPEDICAO header with order code', () => {
    const result = buildExpeditionTicket(makePayload(), 80);
    expect(result.toString()).toContain('EXPEDICAO - PEDIDO #101');
  });

  it('includes customer name and phone', () => {
    const result = buildExpeditionTicket(makePayload(), 80);
    const str = result.toString();
    expect(str).toContain('Joao Silva');
    expect(str).toContain('34999998888');
  });

  it('includes delivery address', () => {
    const result = buildExpeditionTicket(makePayload(), 80);
    const str = result.toString();
    expect(str).toContain('Rua das Flores');
    expect(str).toContain('200');
    expect(str).toContain('Apto 301');
    expect(str).toContain('Centro');
    expect(str).toContain('Proximo ao mercado');
  });

  it('includes courier name', () => {
    const result = buildExpeditionTicket(makePayload(), 80);
    expect(result.toString()).toContain('Carlos');
  });

  it('includes items WITH prices', () => {
    const result = buildExpeditionTicket(makePayload(), 80);
    const str = result.toString();
    expect(str).toContain('Pizza Margherita (Grande)');
    expect(str).toContain('R$45,00');
  });

  it('includes totals', () => {
    const result = buildExpeditionTicket(makePayload(), 80);
    const str = result.toString();
    expect(str).toContain('Subtotal:');
    expect(str).toContain('R$65,00');
    expect(str).toContain('Taxa entrega:');
    expect(str).toContain('R$8,00');
    expect(str).toContain('Desconto:');
    expect(str).toContain('R$68,00');
  });

  it('includes change info when paying cash', () => {
    const result = buildExpeditionTicket(makePayload(), 80);
    expect(result.toString()).toContain('TROCO PARA R$100,00');
  });

  it('omits change when not applicable', () => {
    const result = buildExpeditionTicket(makePayload({ changeFor: null }), 80);
    expect(result.toString()).not.toContain('TROCO');
  });

  it('includes source reference', () => {
    const result = buildExpeditionTicket(makePayload(), 80);
    expect(result.toString()).toContain('iFood #ABC123');
  });

  it('omits address section when no delivery address', () => {
    const result = buildExpeditionTicket(
      makePayload({ deliveryAddress: null }),
      80,
    );
    expect(result.toString()).not.toContain('Endereco:');
  });

  it('works with 58mm paper', () => {
    const result = buildExpeditionTicket(makePayload(), 58);
    expect(result.length).toBeGreaterThan(0);
  });
});
