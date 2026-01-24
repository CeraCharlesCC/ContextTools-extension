import type {
  StoragePort,
  TabsPort,
  MessagingPort,
  RuntimePort,
} from '@application/ports';

import {
  ChromeStorageAdapter,
  ChromeTabsAdapter,
  ChromeMessagingAdapter,
  ChromeRuntimeAdapter,
} from './chrome';

import {
  FirefoxStorageAdapter,
  FirefoxTabsAdapter,
  FirefoxMessagingAdapter,
  FirefoxRuntimeAdapter,
} from './firefox';

declare const __IS_FIREFOX__: boolean;

export type BrowserType = 'chrome' | 'firefox';

/**
 * Detects the current browser environment
 */
export function detectBrowser(): BrowserType {
  // Build-time detection via Vite define
  if (typeof __IS_FIREFOX__ !== 'undefined' && __IS_FIREFOX__) {
    return 'firefox';
  }

  // Runtime detection fallback
  if (typeof browser !== 'undefined' && browser.runtime?.id) {
    return 'firefox';
  }

  return 'chrome';
}

/**
 * Browser Adapters Container
 * Provides all browser adapters for the current environment
 */
export interface BrowserAdapters {
  storage: StoragePort;
  tabs: TabsPort;
  messaging: MessagingPort;
  runtime: RuntimePort;
}

/**
 * Creates browser adapters for the detected or specified browser
 */
export function createBrowserAdapters(browser?: BrowserType): BrowserAdapters {
  const targetBrowser = browser ?? detectBrowser();

  if (targetBrowser === 'firefox') {
    return {
      storage: new FirefoxStorageAdapter(),
      tabs: new FirefoxTabsAdapter(),
      messaging: new FirefoxMessagingAdapter(),
      runtime: new FirefoxRuntimeAdapter(),
    };
  }

  return {
    storage: new ChromeStorageAdapter(),
    tabs: new ChromeTabsAdapter(),
    messaging: new ChromeMessagingAdapter(),
    runtime: new ChromeRuntimeAdapter(),
  };
}

// Singleton instance for convenience
let _adapters: BrowserAdapters | null = null;

export function getBrowserAdapters(): BrowserAdapters {
  if (!_adapters) {
    _adapters = createBrowserAdapters();
  }
  return _adapters;
}
