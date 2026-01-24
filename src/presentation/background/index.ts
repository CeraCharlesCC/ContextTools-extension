/**
 * Background Service Worker
 * Entry point for the extension's background process
 */
import { getBrowserAdapters } from '@infrastructure/adapters';
import { SettingsRepository } from '@infrastructure/repositories';
import { GetSettingsUseCase, UpdateSettingsUseCase } from '@application/usecases';

// Initialize adapters
const adapters = getBrowserAdapters();

// Initialize repositories
const settingsRepository = new SettingsRepository(adapters.storage);

// Initialize use cases
const getSettingsUseCase = new GetSettingsUseCase(settingsRepository);
const updateSettingsUseCase = new UpdateSettingsUseCase(settingsRepository);

// Message types
interface GetSettingsMessage {
  type: 'GET_SETTINGS';
}

interface UpdateSettingsMessage {
  type: 'UPDATE_SETTINGS';
  payload: {
    enabled?: boolean;
    theme?: 'light' | 'dark' | 'system';
    notifications?: boolean;
  };
}

type Message = GetSettingsMessage | UpdateSettingsMessage;

// Message handler
adapters.messaging.addListener(async (message: Message) => {
  switch (message.type) {
    case 'GET_SETTINGS':
      return getSettingsUseCase.execute();

    case 'UPDATE_SETTINGS':
      return updateSettingsUseCase.execute(message.payload);

    default:
      console.warn('Unknown message type:', message);
      return null;
  }
});

// Log initialization
console.log('Context Tools Extension: Background service initialized');
