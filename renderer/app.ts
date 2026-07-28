// Type declaration for the agent API exposed via contextBridge
interface AgentAPI {
  getStatus(): Promise<AgentStatus>;
  getConfig(): Promise<ConfigView>;
  saveConfig(key: string): Promise<{ success: boolean; error?: string }>;
  setupAgent(key: string): Promise<{ success: boolean; error?: string }>;
  clearCredentials(): Promise<{ success: boolean; error?: string }>;
  getPrinters(): Promise<Array<{ deviceName: string; printerType: string }>>;
  printTest(deviceName: string): Promise<{ success: boolean; error?: string }>;
  setAutostart(enabled: boolean): Promise<{ success: boolean }>;
  getAutostartEnabled(): Promise<boolean>;
  onStatusUpdate(cb: (data: AgentStatus) => void): void;
  onJobPrinted(cb: (data: JobEvent) => void): void;
  onJobFailed(cb: (data: JobFailedEvent) => void): void;
}

interface AgentStatus {
  phase: 'setup' | 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'error';
  errorMessage: string | null;
  unitName: string | null;
  agentId: string | null;
  printers: Array<{ id: string; name: string; deviceName: string; isOnline: boolean }>;
  discoveredPrinters: Array<{ deviceName: string; printerType: string }>;
  jobsProcessedToday: number;
  lastJobAt: string | null;
  serverLatencyMs: number | null;
  socketConnected: boolean;
  version: string;
  updateAvailable: { version: string; url: string } | null;
}

interface ConfigView {
  agentKeyMasked: string;
  agentId: string | null;
  autostartEnabled: boolean;
  version: string;
  apiUrl: string;
}

interface JobEvent {
  jobId: string;
  deviceName: string;
  type: string;
  printedAt: string;
}

interface JobFailedEvent {
  jobId: string;
  error: string;
}

declare global {
  interface Window {
    agent: AgentAPI;
  }
}

// ===== State =====
let currentView: 'setup' | 'dashboard' | 'settings' = 'setup';
const recentJobs: Array<{ time: string; desc: string; type: string; success: boolean }> = [];
const MAX_RECENT_JOBS = 20;

// ===== DOM refs =====
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const views = {
  setup: $<HTMLDivElement>('view-setup'),
  dashboard: $<HTMLDivElement>('view-dashboard'),
  settings: $<HTMLDivElement>('view-settings'),
};

// ===== Navigation =====
function showView(view: 'setup' | 'dashboard' | 'settings'): void {
  currentView = view;
  for (const [name, el] of Object.entries(views)) {
    el.classList.toggle('active', name === view);
  }
}

// ===== Setup view =====
function initSetup(): void {
  const keyInput = $<HTMLInputElement>('setup-key');
  const btnSetup = $<HTMLButtonElement>('btn-setup');
  const errorBanner = $<HTMLDivElement>('setup-error');
  const errorText = $<HTMLSpanElement>('setup-error-text');

  btnSetup.addEventListener('click', async () => {
    const key = keyInput.value.trim();
    if (!key) {
      keyInput.focus();
      return;
    }

    btnSetup.disabled = true;
    btnSetup.textContent = 'Conectando...';
    errorBanner.hidden = true;

    const result = await window.agent.setupAgent(key);

    if (!result.success) {
      errorText.textContent = result.error || 'Erro desconhecido';
      errorBanner.hidden = false;
      btnSetup.disabled = false;
      btnSetup.textContent = 'Conectar';
    }
    // If success, the status update event will switch the view
  });

  keyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnSetup.click();
  });
}

// ===== Dashboard view =====
function updateDashboard(status: AgentStatus): void {
  // Status badge
  const dot = $('status-dot');
  const text = $('status-text');
  dot.className = 'status-dot';

  switch (status.phase) {
    case 'connected':
      dot.classList.add('connected');
      text.textContent = 'Conectado';
      break;
    case 'connecting':
    case 'reconnecting':
      dot.classList.add('connecting');
      text.textContent = 'Conectando...';
      break;
    case 'disconnected':
      dot.classList.add('disconnected');
      text.textContent = 'Desconectado';
      break;
    case 'error':
      dot.classList.add('error');
      text.textContent = `Erro: ${status.errorMessage || 'desconhecido'}`;
      break;
  }

  // Version
  $('version-label').textContent = `v${status.version}`;

  // Unit name
  $('unit-name').textContent = status.unitName || (
    status.phase === 'connected' ? 'Conectado' :
    status.phase === 'error' ? '' :
    'Conectando...'
  );

  // Metrics
  $('metric-jobs').textContent = String(status.jobsProcessedToday);

  const onlinePrinters = status.printers.filter((p) => p.isOnline).length;
  $('metric-printers').textContent = `${onlinePrinters} online`;

  if (status.lastJobAt) {
    const d = new Date(status.lastJobAt);
    $('metric-last-job').textContent = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  } else {
    $('metric-last-job').textContent = '\u2014';
  }

  // Printers list
  const printersList = $('printers-list');
  if (status.printers.length === 0 && status.discoveredPrinters.length === 0) {
    printersList.innerHTML = '<div class="empty-state">Nenhuma impressora detectada</div>';
  } else {
    const items = status.printers.length > 0 ? status.printers : status.discoveredPrinters.map((p) => ({
      id: '',
      name: p.deviceName,
      deviceName: p.deviceName,
      isOnline: false,
    }));

    printersList.innerHTML = items.map((p) => `
      <div class="printer-item">
        <span class="printer-status-dot ${p.isOnline ? 'online' : 'offline'}"></span>
        <div class="printer-info">
          <div class="printer-name">${escapeHtml(p.name || p.deviceName)}</div>
          <div class="printer-meta">${escapeHtml(p.deviceName)}</div>
        </div>
      </div>
    `).join('');
  }

  // Jobs feed
  renderJobsFeed();
}

function renderJobsFeed(): void {
  const feed = $('jobs-feed');
  if (recentJobs.length === 0) {
    feed.innerHTML = '<div class="empty-state">Nenhuma impressão ainda</div>';
    return;
  }

  feed.innerHTML = recentJobs.map((j) => `
    <div class="job-item">
      <span class="job-time">${escapeHtml(j.time)}</span>
      <span class="job-desc">${escapeHtml(j.desc)}</span>
      <span class="job-type">${escapeHtml(formatJobType(j.type))}</span>
      <span class="job-status-icon ${j.success ? 'success' : 'failed'}">${j.success ? '\u2713' : '\u2717'}</span>
    </div>
  `).join('');
}

function formatJobType(type: string): string {
  const map: Record<string, string> = {
    'KITCHEN_TICKET': 'Cozinha',
    'EXPEDITION_TICKET': 'Expedição',
    'RECEIPT': 'Recibo',
    'TEST_PAGE': 'Teste',
  };
  return map[type] || type;
}

// ===== Settings view =====
async function loadSettings(): Promise<void> {
  const config = await window.agent.getConfig();
  $('settings-key-masked').textContent = config.agentKeyMasked;
  $('settings-version').textContent = config.version;
  $('settings-agent-id').textContent = config.agentId || '\u2014';
  $('settings-api-url').textContent = config.apiUrl;
  ($<HTMLInputElement>('settings-autostart')).checked = config.autostartEnabled;
}

function initSettings(): void {
  const btnBack = $('btn-back');
  const btnEditKey = $('btn-edit-key');
  const keyEditGroup = $('key-edit-group');
  const keyInput = $<HTMLInputElement>('settings-key-input');
  const btnSave = $('btn-save-settings');
  const btnClear = $('btn-clear');
  const autostartToggle = $<HTMLInputElement>('settings-autostart');

  btnBack.addEventListener('click', () => {
    keyEditGroup.hidden = true;
    showView('dashboard');
  });

  btnEditKey.addEventListener('click', () => {
    keyEditGroup.hidden = !keyEditGroup.hidden;
    if (!keyEditGroup.hidden) {
      keyInput.value = '';
      keyInput.focus();
    }
  });

  btnSave.addEventListener('click', async () => {
    const newKey = keyInput.value.trim();

    // Save autostart
    await window.agent.setAutostart(autostartToggle.checked);

    // Save key if edited
    if (newKey) {
      const result = await window.agent.saveConfig(newKey);
      if (!result.success) {
        alert(result.error || 'Erro ao salvar chave');
        return;
      }
    }

    keyEditGroup.hidden = true;
    showView('dashboard');
  });

  // Clear credentials
  btnClear.addEventListener('click', () => {
    $('confirm-clear-modal').hidden = false;
  });

  $('btn-cancel-clear').addEventListener('click', () => {
    $('confirm-clear-modal').hidden = true;
  });

  $('btn-confirm-clear').addEventListener('click', async () => {
    $('confirm-clear-modal').hidden = true;
    await window.agent.clearCredentials();
    // Status update will switch to setup view
  });
}

// ===== Test print =====
function initTestPrint(): void {
  const modal = $('test-print-modal');

  $('btn-test-print').addEventListener('click', async () => {
    const printers = await window.agent.getPrinters();
    const list = $('test-printer-list');

    if (printers.length === 0) {
      list.innerHTML = '<div class="empty-state">Nenhuma impressora disponível</div>';
    } else {
      list.innerHTML = printers.map((p) => `
        <div class="test-printer-item" data-device="${escapeHtml(p.deviceName)}">
          <span class="test-printer-name">${escapeHtml(p.deviceName)}</span>
          <span class="test-printer-type">${escapeHtml(p.printerType)}</span>
        </div>
      `).join('');

      list.querySelectorAll('.test-printer-item').forEach((item) => {
        item.addEventListener('click', async () => {
          const device = (item as HTMLElement).dataset.device!;
          modal.hidden = true;
          await window.agent.printTest(device);
        });
      });
    }

    modal.hidden = false;
  });

  $('btn-cancel-test').addEventListener('click', () => {
    modal.hidden = true;
  });
}

// ===== Navigation buttons =====
function initNavigation(): void {
  $('btn-settings').addEventListener('click', () => {
    loadSettings();
    showView('settings');
  });

  $('btn-open-settings').addEventListener('click', () => {
    loadSettings();
    showView('settings');
  });
}

// ===== Event listeners =====
function initEventListeners(): void {
  window.agent.onStatusUpdate((status: AgentStatus) => {
    if (status.phase === 'setup') {
      showView('setup');
    } else if (currentView === 'setup') {
      showView('dashboard');
    }

    if (currentView === 'dashboard' || currentView === 'setup') {
      updateDashboard(status);
    }
  });

  window.agent.onJobPrinted((event: JobEvent) => {
    const d = new Date(event.printedAt);
    const time = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    recentJobs.unshift({
      time,
      desc: `Job #${event.jobId.slice(-6)} em ${event.deviceName}`,
      type: event.type,
      success: true,
    });
    if (recentJobs.length > MAX_RECENT_JOBS) recentJobs.pop();
    renderJobsFeed();
  });

  window.agent.onJobFailed((event: JobFailedEvent) => {
    const d = new Date();
    const time = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    recentJobs.unshift({
      time,
      desc: `Job #${event.jobId.slice(-6)} falhou`,
      type: '',
      success: false,
    });
    if (recentJobs.length > MAX_RECENT_JOBS) recentJobs.pop();
    renderJobsFeed();
  });
}

// ===== Helpers =====
function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===== Init =====
async function init(): Promise<void> {
  initSetup();
  initSettings();
  initTestPrint();
  initNavigation();
  initEventListeners();

  // Get initial status
  const status = await window.agent.getStatus();
  if (status.phase === 'setup') {
    showView('setup');
  } else {
    showView('dashboard');
    updateDashboard(status);
  }
}

init();
