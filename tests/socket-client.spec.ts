import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock socket.io-client before importing
vi.mock('socket.io-client', () => {
  const mockSocket = {
    on: vi.fn(),
    disconnect: vi.fn(),
    connected: false,
  };
  return {
    io: vi.fn(() => mockSocket),
  };
});

import { ConnectionManager } from '../src/socket-client.js';
import type { AgentConfig, PrintJobCreatedEvent } from '../src/types.js';

const config: AgentConfig = {
  apiUrl: 'https://api.test.com',
  agentKey: 'pk_test',
  agentId: 'agent-test',
};

describe('ConnectionManager', () => {
  let onJobCreated: ReturnType<typeof vi.fn>;
  let onPollTick: ReturnType<typeof vi.fn>;
  let onReconnect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    onJobCreated = vi.fn();
    onPollTick = vi.fn().mockResolvedValue(undefined);
    onReconnect = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates without throwing', () => {
    const cm = new ConnectionManager(config, onJobCreated, onPollTick, onReconnect);
    expect(cm).toBeDefined();
  });

  it('stop clears all timers', () => {
    const cm = new ConnectionManager(config, onJobCreated, onPollTick, onReconnect);
    cm.start();
    cm.stop(); // Should not throw
  });
});
