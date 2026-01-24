/**
 * Port: Tabs Interface
 * Browser-agnostic interface for tab operations
 */
export interface Tab {
  id: number;
  url?: string;
  title?: string;
  active: boolean;
  windowId: number;
}

export interface TabsPort {
  getActiveTab(): Promise<Tab | null>;
  getAllTabs(): Promise<Tab[]>;
  createTab(url: string): Promise<Tab>;
  updateTab(tabId: number, props: Partial<Pick<Tab, 'url' | 'active'>>): Promise<Tab>;
  closeTab(tabId: number): Promise<void>;
  sendMessageToTab<T, R>(tabId: number, message: T): Promise<R>;
}
