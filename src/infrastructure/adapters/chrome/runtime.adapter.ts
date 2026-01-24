import type { RuntimePort } from '@application/ports';

/**
 * Chrome Runtime Adapter
 * Implements RuntimePort using chrome.runtime
 */
export class ChromeRuntimeAdapter implements RuntimePort {
  getURL(path: string): string {
    return chrome.runtime.getURL(path);
  }

  getManifest(): Record<string, unknown> {
    return chrome.runtime.getManifest() as Record<string, unknown>;
  }

  async getPlatformInfo(): Promise<{ os: string; arch: string }> {
    return new Promise((resolve) => {
      chrome.runtime.getPlatformInfo((info) => {
        resolve({ os: info.os, arch: info.arch });
      });
    });
  }

  async openOptionsPage(): Promise<void> {
    return new Promise((resolve) => {
      chrome.runtime.openOptionsPage(() => {
        resolve();
      });
    });
  }
}
