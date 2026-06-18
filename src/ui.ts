const reset = '\x1b[0m';
const bold = '\x1b[1m';
const dim = '\x1b[2m';
const green = '\x1b[32m';
const yellow = '\x1b[33m';
const red = '\x1b[31m';
const cyan = '\x1b[36m';
const white = '\x1b[37m';
const bgGreen = '\x1b[42m';
const bgRed = '\x1b[41m';
const bgYellow = '\x1b[43m';
const black = '\x1b[30m';

const BANNER = `
${cyan}${bold}  ╔══════════════════════════════════════════╗
  ║                                          ║
  ║        🖨️  Print Agent                    ║
  ║                                          ║
  ╚══════════════════════════════════════════╝${reset}
`;

export function showBanner(version: string): void {
  console.log(BANNER);
  console.log(`${dim}  Versao: v${version}${reset}`);
  console.log('');
}

export function showFirstRunHeader(): void {
  console.log('');
  console.log(`${cyan}${bold}  ┌──────────────────────────────────────┐${reset}`);
  console.log(`${cyan}${bold}  │      Primeira execucao do agente     │${reset}`);
  console.log(`${cyan}${bold}  └──────────────────────────────────────┘${reset}`);
  console.log('');
  console.log(`  Cole a chave do agente ${dim}(API Key)${reset} gerada no`);
  console.log(`  painel: ${bold}Configuracoes > Impressoras > Chave${reset}`);
  console.log('');
}

export function showKeySaved(agentId: string): void {
  console.log('');
  console.log(`  ${bgGreen}${black}${bold} ✓ SALVO ${reset} Chave configurada com sucesso`);
  console.log(`${dim}  ID do agente: ${agentId}${reset}`);
}

export function showKeyEmpty(): void {
  console.log(`  ${yellow}⚠ A chave nao pode ser vazia. Tente novamente.${reset}`);
}

export function showAutostartCreated(): void {
  console.log(`  ${bgGreen}${black}${bold} ✓ ${reset} Inicio automatico ativado`);
}

export function showAutostartFailed(): void {
  console.log(`  ${yellow}⚠ Nao foi possivel ativar o inicio automatico.${reset}`);
}

export function showStep(label: string): void {
  console.log(`${dim}  ► ${label}${reset}`);
}

export function showSuccess(label: string): void {
  console.log(`  ${green}✓${reset} ${label}`);
}

export function showWarning(label: string): void {
  console.log(`  ${yellow}⚠${reset} ${label}`);
}

export function showError(label: string): void {
  console.log(`  ${red}✗${reset} ${label}`);
}

export function showPrinters(printerNames: string[]): void {
  if (printerNames.length === 0) {
    showWarning('Nenhuma impressora encontrada');
    return;
  }
  console.log(`  ${green}✓${reset} ${printerNames.length} impressora(s) encontrada(s):`);
  for (const name of printerNames) {
    console.log(`${dim}    • ${name}${reset}`);
  }
}

export function showRunning(): void {
  console.log('');
  console.log(`${green}${bold}  ┌──────────────────────────────────────┐${reset}`);
  console.log(`${green}${bold}  │     ✓ Agente conectado e rodando     │${reset}`);
  console.log(`${green}${bold}  └──────────────────────────────────────┘${reset}`);
  console.log('');
  console.log(`${dim}  Aguardando pedidos de impressao...${reset}`);
  console.log(`${dim}  Pressione Ctrl+C para parar.${reset}`);
  console.log('');
}

export function showShutdown(): void {
  console.log('');
  console.log(`${dim}  Encerrando agente...${reset}`);
}

export function showJobReceived(jobId: string, type: string): void {
  console.log(`  ${cyan}⬇${reset} Job recebido: ${bold}${type}${reset} ${dim}(${jobId})${reset}`);
}

export function showJobPrinted(jobId: string, printerName: string): void {
  console.log(
    `  ${green}✓${reset} Impresso em ${bold}${printerName}${reset} ${dim}(${jobId})${reset}`,
  );
}

export function showJobFailed(jobId: string, reason: string): void {
  console.log(`  ${red}✗${reset} Falha no job ${dim}(${jobId})${reset}: ${reason}`);
}

export function showUpdateAvailable(current: string, latest: string, url: string): void {
  console.log(
    `  ${bgYellow}${black}${bold} ATUALIZAR ${reset} Nova versao disponivel: ${bold}v${latest}${reset} ${dim}(atual: v${current})${reset}`,
  );
  console.log(`${dim}  Baixe em: ${url}${reset}`);
  console.log('');
}

export function showUpToDate(): void {
  console.log(`  ${green}✓${reset} Versao atualizada`);
}

export function showConnected(): void {
  console.log(`  ${green}✓${reset} Conectado ao servidor`);
}

export function showDisconnected(): void {
  console.log(`  ${yellow}⚠${reset} Desconectado do servidor. Tentando reconectar...`);
}

export function showReconnected(): void {
  console.log(`  ${green}✓${reset} Reconectado ao servidor`);
}

export function showFatalError(error: unknown): void {
  console.log('');
  console.log(`  ${bgRed}${white}${bold} ERRO FATAL ${reset}`);
  console.log(`  ${red}${error instanceof Error ? error.message : String(error)}${reset}`);
  if (error instanceof Error && error.stack) {
    console.log(`${dim}${error.stack}${reset}`);
  }
  console.log('');
}
