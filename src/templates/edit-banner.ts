import type { EscPosBuilder } from '../escpos/builder.js';
import type { PrintPayload } from '../types.js';

/**
 * Pedido editado depois de ir para a cozinha: destaca a reemissao e lista o
 * que mudou, para a equipe nao produzir de novo o que ja estava pronto.
 */
export function printEditBanner(b: EscPosBuilder, payload: PrintPayload): void {
  if (!payload.edited) return;

  b.alignCenter();
  b.tallText();
  b.bold('*** PEDIDO ALTERADO ***');
  b.resetFontSize();
  b.alignLeft();

  const changes = payload.editChanges ?? [];
  if (changes.length > 0) {
    b.bold('Alteracoes:');
    for (const change of changes) {
      b.text(`  ${change}`);
    }
  }

  b.line();
}
