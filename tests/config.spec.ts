import { describe, it, expect, vi } from 'vitest';
import { hostname } from 'node:os';
import { generateAgentId } from '../src/config.js';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('node:os', () => ({
  hostname: vi.fn(),
}));

describe('generateAgentId', () => {
  it('generates id from hostname', () => {
    vi.mocked(hostname).mockReturnValue('DESKTOP-ABC123');
    expect(generateAgentId()).toMatch(/^agent-desktop-abc123-[0-9a-f]{8}$/);
  });

  it('strips special characters from hostname', () => {
    vi.mocked(hostname).mockReturnValue('PC_João.local');
    expect(generateAgentId()).toMatch(/^agent-pcjoolocal-[0-9a-f]{8}$/);
  });

  it('uses "unknown" when hostname is empty after sanitization', () => {
    vi.mocked(hostname).mockReturnValue('!!!');
    expect(generateAgentId()).toMatch(/^agent-unknown-[0-9a-f]{8}$/);
  });
});
