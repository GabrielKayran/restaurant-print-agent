import { log } from './logger.js';
import { CURRENT_VERSION } from './version.js';

const REPO = 'GabrielKayran/restaurant-print-agent';

export async function checkForUpdates(): Promise<void> {
  if (CURRENT_VERSION === '0.0.0-dev') return; // skip in dev

  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
    if (!res.ok) return;

    const data = (await res.json()) as { tag_name: string; html_url: string };
    const latest = data.tag_name.replace(/^v/, '');

    if (latest !== CURRENT_VERSION) {
      console.log('');
      console.log('=============================================');
      console.log(`  Nova versao disponivel: v${latest}`);
      console.log(`  Versao atual: v${CURRENT_VERSION}`);
      console.log(`  Baixe em: ${data.html_url}`);
      console.log('=============================================');
      console.log('');
    } else {
      log(`Version v${CURRENT_VERSION} is up to date`);
    }
  } catch {
    // silent — don't break if offline
  }
}
