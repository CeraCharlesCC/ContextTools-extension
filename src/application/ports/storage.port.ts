import type { Settings } from '@domain/entities';

/**
 * Port: Storage Repository Interface
 * Defines the contract for storage operations (Hexagonal Architecture port)
 */
export interface StoragePort {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Port: Settings Repository Interface
 */
export interface SettingsRepositoryPort {
  getSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<void>;
}
