/**
 * Port: Runtime Interface
 * Browser-agnostic interface for extension runtime operations
 */
export interface RuntimePort {
  getURL(path: string): string;
  getManifest(): Record<string, unknown>;
  getPlatformInfo(): Promise<{ os: string; arch: string }>;
  openOptionsPage(): Promise<void>;
}
