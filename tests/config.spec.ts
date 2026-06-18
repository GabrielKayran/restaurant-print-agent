import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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
    expect(generateAgentId()).toBe('agent-desktop-abc123');
  });

  it('strips special characters from hostname', () => {
    vi.mocked(hostname).mockReturnValue('PC_João.local');
    expect(generateAgentId()).toBe('agent-pcjoolocal');
  });

  it('uses "unknown" when hostname is empty after sanitization', () => {
    vi.mocked(hostname).mockReturnValue('!!!');
    expect(generateAgentId()).toBe('agent-unknown');
  });
});
