import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => 'C:\\Users\\TestUser'),
}));

// Must import after mocks are set up
const { isAutostartEnabled, enableAutostart, disableAutostart } = await import(
  '../src/autostart.js'
);

const expectedShortcutPath = join(
  'C:\\Users\\TestUser',
  'AppData',
  'Roaming',
  'Microsoft',
  'Windows',
  'Start Menu',
  'Programs',
  'Startup',
  'PrintAgent.lnk',
);

describe('isAutostartEnabled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when shortcut exists', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    expect(isAutostartEnabled()).toBe(true);
    expect(existsSync).toHaveBeenCalledWith(expectedShortcutPath);
  });

  it('returns false when shortcut does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(isAutostartEnabled()).toBe(false);
  });
});

describe('enableAutostart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls PowerShell to create a shortcut and returns true', () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from(''));
    const result = enableAutostart();

    expect(result).toBe(true);
    expect(execSync).toHaveBeenCalledTimes(1);

    const call = vi.mocked(execSync).mock.calls[0];
    const command = call[0] as string;
    expect(command).toContain('powershell');
    expect(command).toContain('CreateShortcut');
    expect(command).toContain('PrintAgent.lnk');
  });

  it('returns false when PowerShell fails', () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('PowerShell not found');
    });

    const result = enableAutostart();
    expect(result).toBe(false);
  });
});

describe('disableAutostart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes the shortcut and returns true', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(unlinkSync).mockReturnValue(undefined);

    const result = disableAutostart();

    expect(result).toBe(true);
    expect(unlinkSync).toHaveBeenCalledWith(expectedShortcutPath);
  });

  it('returns true when shortcut does not exist (already removed)', () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const result = disableAutostart();

    expect(result).toBe(true);
    expect(unlinkSync).not.toHaveBeenCalled();
  });

  it('returns false when unlinkSync fails', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(unlinkSync).mockImplementation(() => {
      throw new Error('Permission denied');
    });

    const result = disableAutostart();
    expect(result).toBe(false);
  });
});
