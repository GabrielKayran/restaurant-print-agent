import { vi } from 'vitest';

// Global mock for node-thermal-printer to avoid network connections in tests
vi.mock('node-thermal-printer', () => {
  class FakePrinter {
    private buffer: string[] = [];
    println(str: string) {
      this.buffer.push(str + '\n');
    }
    bold() {}
    alignLeft() {}
    alignCenter() {}
    alignRight() {}
    setTextSize() {}
    setTextNormal() {}
    newLine() {
      this.buffer.push('\n');
    }
    cut() {
      this.buffer.push('\x1d\x56\x00');
    }
    raw(buf: Buffer) {
      this.buffer.push(buf.toString());
    }
    getBuffer() {
      return Buffer.from(this.buffer.join(''));
    }
    isPrinterConnected() {
      return Promise.resolve(true);
    }
    execute() {
      return Promise.resolve();
    }
  }
  return {
    default: { printer: FakePrinter },
    PrinterTypes: { EPSON: 'epson' },
    CharacterSet: { PC860_PORTUGUESE: 'PC860_PORTUGUESE' },
  };
});
