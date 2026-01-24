import type { RuntimePort } from '@application/ports';

declare const browser: typeof chrome;

/**
 * Firefox Runtime Adapter
 * Implements RuntimePort using browser.runtime (Promise-based)
 */
export class FirefoxRuntimeAdapter implements RuntimePort {
  getURL(path: string): string {
    return browser.runtime.getURL(path);
  }

  getManifest(): Record<string, unknown> {
    return browser.runtime.getManifest() as Record<string, unknown>;
  }

  async getPlatformInfo(): Promise<{ os: string; arch: string }> {
    const info = await browser.runtime.getPlatformInfo();
    return { os: info.os, arch: info.arch };
  }

  async openOptionsPage(): Promise<void> {
    await browser.runtime.openOptionsPage();
  }
}
