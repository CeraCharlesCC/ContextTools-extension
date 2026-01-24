import type { StoragePort } from '@application/ports';

declare const browser: typeof chrome;

/**
 * Firefox Storage Adapter
 * Implements StoragePort using browser.storage.local (Promise-based)
 */
export class FirefoxStorageAdapter implements StoragePort {
  async get<T>(key: string): Promise<T | null> {
    const result = await browser.storage.local.get(key);
    return (result[key] as T) ?? null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    await browser.storage.local.set({ [key]: value });
  }

  async remove(key: string): Promise<void> {
    await browser.storage.local.remove(key);
  }

  async clear(): Promise<void> {
    await browser.storage.local.clear();
  }
}
