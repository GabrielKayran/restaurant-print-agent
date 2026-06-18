import { showUpdateAvailable, showUpToDate } from './ui.js';
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
      showUpdateAvailable(CURRENT_VERSION, latest, data.html_url);
    } else {
      showUpToDate();
    }
  } catch {
    // silent — don't break if offline
  }
}
