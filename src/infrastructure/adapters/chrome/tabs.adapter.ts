import type { Tab, TabsPort } from '@application/ports';

/**
 * Chrome Tabs Adapter
 * Implements TabsPort using chrome.tabs
 */
export class ChromeTabsAdapter implements TabsPort {
  private mapTab(chromeTab: chrome.tabs.Tab): Tab {
    return {
      id: chromeTab.id!,
      url: chromeTab.url,
      title: chromeTab.title,
      active: chromeTab.active,
      windowId: chromeTab.windowId,
    };
  }

  async getActiveTab(): Promise<Tab | null> {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(tabs[0] ? this.mapTab(tabs[0]) : null);
      });
    });
  }

  async getAllTabs(): Promise<Tab[]> {
    return new Promise((resolve) => {
      chrome.tabs.query({}, (tabs) => {
        resolve(tabs.map((t) => this.mapTab(t)));
      });
    });
  }

  async createTab(url: string): Promise<Tab> {
    return new Promise((resolve) => {
      chrome.tabs.create({ url }, (tab) => {
        resolve(this.mapTab(tab));
      });
    });
  }

  async updateTab(tabId: number, props: Partial<Pick<Tab, 'url' | 'active'>>): Promise<Tab> {
    return new Promise((resolve) => {
      chrome.tabs.update(tabId, props, (tab) => {
        resolve(this.mapTab(tab!));
      });
    });
  }

  async closeTab(tabId: number): Promise<void> {
    return new Promise((resolve) => {
      chrome.tabs.remove(tabId, () => {
        resolve();
      });
    });
  }

  async sendMessageToTab<T, R>(tabId: number, message: T): Promise<R> {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        resolve(response);
      });
    });
  }
}
