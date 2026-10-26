import { describe, it, expect } from 'vitest';
import { buildTableBill } from '../../src/templates/table-bill.js';
import type { TableBillPayload } from '../../src/types.js';

function makePayload(overrides: Partial<TableBillPayload> = {}): TableBillPayload {
  return {
    unitName: 'Bar do Ze',
    unitAddress: 'Rua A, 10, Centro',
    unitCnpj: null,
    tableName: 'Mesa 4',
    openedAt: '2026-10-26T20:00:00Z',
    printedAt: '2026-10-26T22:00:00Z',
    guestCount: 2,
    personOnly: false,
    sections: [
      {
        title: 'Ana',
        lines: [{ quantity: 2, name: 'Chopp', total: 20, options: [] }],
        itemsTotal: 20,
        sharedShare: 15,
        serviceFee: 3.5,
        total: 38.5,
      },
      {
        title: 'Bia',
        lines: [{ quantity: 1, name: 'Combo Classico', total: 40, options: ['Burger', 'Fritas'] }],
        itemsTotal: 40,
        sharedShare: 15,
        serviceFee: 5.5,
        total: 60.5,
      },
    ],
    sharedLines: [{ quantity: 1, name: 'Porcao', total: 30, options: [] }],
    sharedTotal: 30,
    sharedSplitAmong: 2,
    subtotal: 90,
    discount: 0,
    serviceFeePercent: 10,
    serviceFee: 9,
    total: 99,
    splitCount: null,
    splitAmounts: null,
    ...overrides,
  };
}

describe('buildTableBill', () => {
  it('prints each person with their share and total', () => {
    const str = buildTableBill(makePayload(), 80).toString();
    expect(str).toContain('CONFERENCIA DE CONTA');
    expect(str).toContain('Mesa 4');
    expect(str).toContain('ANA');
    expect(str).toContain('Parte da mesa:');
    expect(str).toContain('Total Bia:');
    expect(str).toContain('R$60,50');
    expect(str).toContain('> Fritas');
  });

  it('prints the shared items and the table totals with the service fee', () => {
    const str = buildTableBill(makePayload(), 80).toString();
    expect(str).toContain('MESA (COMPARTILHADO)');
    expect(str).toContain('Dividido entre 2 pessoas');
    expect(str).toContain('Servico (10%):');
    expect(str).toContain('R$99,00');
    expect(str).toContain('Taxa de servico opcional');
  });

  it('omits the service fee lines when removed', () => {
    const base = makePayload();
    const str = buildTableBill(
      makePayload({
        sections: base.sections.map((section) => ({ ...section, serviceFee: 0 })),
        serviceFee: 0,
        serviceFeePercent: 0,
        total: 90,
      }),
      80,
    ).toString();
    expect(str).not.toContain('Taxa de servico opcional');
    expect(str).not.toContain('Servico (0%)');
  });

  it('groups even split amounts', () => {
    const str = buildTableBill(
      makePayload({ splitCount: 3, splitAmounts: [33.34, 33.33, 33.33] }),
      80,
    ).toString();
    expect(str).toContain('Dividido por 3:');
    expect(str).toContain('1x R$33,34');
    expect(str).toContain('2x R$33,33');
  });

  it('shows what was already paid and what is left', () => {
    const str = buildTableBill(
      makePayload({
        paid: 38.5,
        remaining: 60.5,
        sections: makePayload().sections.map((section, index) =>
          index === 0 ? { ...section, paid: 38.5 } : section,
        ),
        splitAmounts: [30.25, 30.25],
      }),
      80,
    ).toString();
    expect(str).toContain('Ja pago:');
    expect(str).toContain('FALTA PAGAR:');
    expect(str).toContain('R$60,50');
    expect(str).toContain('Restante dividido por 2:');
  });

  it('notes the shared part on a single person bill', () => {
    const str = buildTableBill(
      makePayload({ personOnly: true, sharedLines: [] }),
      80,
    ).toString();
    expect(str).toContain('Inclui 1/2 dos itens da mesa (R$30,00)');
    expect(str).not.toContain('MESA (COMPARTILHADO)');
  });
});
