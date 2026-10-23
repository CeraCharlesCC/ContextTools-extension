import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addRuntimeMessageListener, runtimeSendMessage } from './transport';

describe('runtime transport', () => {
  beforeEach(() => {
    vi.stubGlobal('chrome', { runtime: { onMessage: { addListener: vi.fn() }, sendMessage: vi.fn() } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('leaves unrelated messages to other listeners without claiming the response channel', async () => {
    const handler = vi.fn();
    const listener = addRuntimeMessageListener(handler, (message) => message === 'ours');
    const respond = vi.fn();
    expect(listener('theirs', {}, respond)).toBe(false);
    await Promise.resolve();
    expect(handler).not.toHaveBeenCalled();
    expect(respond).not.toHaveBeenCalled();
  });

  it('returns synchronous handler failures through the async response channel', async () => {
    const listener = addRuntimeMessageListener(() => { throw new Error('Handler failed'); });
    const response = new Promise((resolve) => {
      expect(listener({}, {}, resolve)).toBe(true);
    });
    await expect(response).resolves.toEqual({ ok: false, error: { message: 'Handler failed' } });
  });

  it('maps the sender and preserves asynchronous handler responses', async () => {
    const handler = vi.fn(async () => ({ value: 42 }));
    const listener = addRuntimeMessageListener(handler);
    const response = new Promise((resolve) => {
      expect(listener('ours', { tab: { id: 7 } as chrome.tabs.Tab, frameId: 2, url: 'https://github.com/' }, resolve)).toBe(true);
    });
    await expect(response).resolves.toEqual({ value: 42 });
    expect(handler).toHaveBeenCalledWith('ours', { tabId: 7, frameId: 2, url: 'https://github.com/' });
  });

  it('rejects runtime send failures instead of accepting an undefined response', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(async (_message, callback: unknown) => {
      Object.assign(chrome.runtime, { lastError: { message: 'Receiving end does not exist' } });
      (callback as (response?: unknown) => void)();
      delete chrome.runtime.lastError;
    });
    await expect(runtimeSendMessage({})).rejects.toThrow('Receiving end does not exist');
  });
});
