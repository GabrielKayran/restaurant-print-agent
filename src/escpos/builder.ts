import ThermalPrinter, {
  CharacterSet,
  PrinterTypes,
} from 'node-thermal-printer';

export class EscPosBuilder {
  private printer: InstanceType<typeof ThermalPrinter.printer>;
  private readonly maxChars: number;

  constructor(paperWidth: number = 80) {
    this.maxChars = paperWidth === 58 ? 32 : 48;
    this.printer = new ThermalPrinter.printer({
      type: PrinterTypes.EPSON,
      interface: 'tcp://127.0.0.1',
      characterSet: CharacterSet.PC860_PORTUGUESE,
      removeSpecialCharacters: false,
      width: this.maxChars,
    });
  }

  get lineWidth(): number {
    return this.maxChars;
  }

  text(str: string): this {
    this.printer.println(str);
    return this;
  }

  bold(str: string): this {
    this.printer.bold(true);
    this.printer.println(str);
    this.printer.bold(false);
    return this;
  }

  line(char: string = '-'): this {
    this.printer.println(char.repeat(this.maxChars));
    return this;
  }

  cut(): this {
    this.printer.cut();
    return this;
  }

  alignLeft(): this {
    this.printer.alignLeft();
    return this;
  }

  alignCenter(): this {
    this.printer.alignCenter();
    return this;
  }

  alignRight(): this {
    this.printer.alignRight();
    return this;
  }

  fontSize(n: number): this {
    this.printer.setTextSize(n, n);
    return this;
  }

  resetFontSize(): this {
    this.printer.setTextNormal();
    return this;
  }

  newline(): this {
    this.printer.newLine();
    return this;
  }

  pair(left: string, right: string): this {
    const space = this.maxChars - left.length - right.length;
    if (space > 0) {
      this.printer.println(left + ' '.repeat(space) + right);
    } else {
      // If too long, truncate left side
      const maxLeft = this.maxChars - right.length - 1;
      this.printer.println(
        left.substring(0, maxLeft) + ' ' + right,
      );
    }
    return this;
  }

  boldPair(left: string, right: string): this {
    this.printer.bold(true);
    this.pair(left, right);
    this.printer.bold(false);
    return this;
  }

  raw(buffer: Buffer): this {
    this.printer.raw(buffer);
    return this;
  }

  build(): Buffer {
    return this.printer.getBuffer();
  }
}
