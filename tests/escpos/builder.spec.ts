import { describe, it, expect } from 'vitest';
import { EscPosBuilder } from '../../src/escpos/builder.js';

describe('EscPosBuilder', () => {
  it('defaults to 48 chars for 80mm paper', () => {
    const b = new EscPosBuilder(80);
    expect(b.lineWidth).toBe(48);
  });

  it('uses 32 chars for 58mm paper', () => {
    const b = new EscPosBuilder(58);
    expect(b.lineWidth).toBe(32);
  });

  it('defaults to 80mm when no width given', () => {
    const b = new EscPosBuilder();
    expect(b.lineWidth).toBe(48);
  });

  it('builds a buffer with text', () => {
    const b = new EscPosBuilder(80);
    b.text('Hello');
    const buffer = b.build();
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('builds a buffer with bold text', () => {
    const b = new EscPosBuilder(80);
    b.bold('Bold text');
    const buffer = b.build();
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('builds a separator line', () => {
    const b = new EscPosBuilder(80);
    b.line('-');
    const buffer = b.build();
    const str = buffer.toString();
    expect(str).toContain('-'.repeat(48));
  });

  it('builds a pair with left and right alignment', () => {
    const b = new EscPosBuilder(80);
    b.pair('Item', 'R$10,00');
    const buffer = b.build();
    const str = buffer.toString();
    expect(str).toContain('Item');
    expect(str).toContain('R$10,00');
  });

  it('truncates left side when pair is too long', () => {
    const b = new EscPosBuilder(58); // 32 chars
    const longName = 'A'.repeat(40);
    b.pair(longName, 'R$10,00');
    const buffer = b.build();
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('chains methods fluently', () => {
    const b = new EscPosBuilder(80);
    const result = b
      .alignCenter()
      .bold('Title')
      .alignLeft()
      .text('Body')
      .newline()
      .cut();
    expect(result).toBe(b);
  });

  it('builds a buffer with raw data', () => {
    const b = new EscPosBuilder(80);
    b.raw(Buffer.from([0x1b, 0x40])); // ESC @ (initialize)
    const buffer = b.build();
    expect(buffer.length).toBeGreaterThan(0);
  });
});
