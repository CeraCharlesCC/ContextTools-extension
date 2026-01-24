import type { Tab, TabsPort } from '@application/ports';

declare const browser: typeof chrome;

/**
 * Firefox Tabs Adapter
 * Implements TabsPort using browser.tabs (Promise-based)
 */
export class FirefoxTabsAdapter implements TabsPort {
  private mapTab(browserTab: chrome.tabs.Tab): Tab {
    return {
      id: browserTab.id!,
      url: browserTab.url,
      title: browserTab.title,
      active: browserTab.active,
      windowId: browserTab.windowId,
    };
  }

  async getActiveTab(): Promise<Tab | null> {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    return tabs[0] ? this.mapTab(tabs[0]) : null;
  }

  async getAllTabs(): Promise<Tab[]> {
    const tabs = await browser.tabs.query({});
    return tabs.map((t) => this.mapTab(t));
  }

  async createTab(url: string): Promise<Tab> {
    const tab = await browser.tabs.create({ url });
    return this.mapTab(tab);
  }

  async updateTab(tabId: number, props: Partial<Pick<Tab, 'url' | 'active'>>): Promise<Tab> {
    const tab = await browser.tabs.update(tabId, props);
    return this.mapTab(tab!);
  }

  async closeTab(tabId: number): Promise<void> {
    await browser.tabs.remove(tabId);
  }

  async sendMessageToTab<T, R>(tabId: number, message: T): Promise<R> {
    return browser.tabs.sendMessage(tabId, message) as Promise<R>;
  }
}
