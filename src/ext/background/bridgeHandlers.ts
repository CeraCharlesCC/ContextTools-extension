import { registerBridgeHandlers, type BridgeHandlerMap } from '@ext/bridge';
import { AuthService } from './services/AuthService';
import { ExportService } from './services/ExportService';
import { LastProfileStore } from './services/LastProfileStore';
import { SettingsService } from './services/SettingsService';

export interface BackgroundServices {
  settingsService: SettingsService;
  authService: AuthService;
  exportService: ExportService;
}

async function openOptionsPage(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    chrome.runtime.openOptionsPage(() => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve();
    });
  });
}

export function createBackgroundServices(): BackgroundServices {
  const settingsService = new SettingsService();
  const authService = new AuthService();
  const lastProfileStore = new LastProfileStore();
  const exportService = new ExportService(settingsService, authService, lastProfileStore);

  return {
    settingsService,
    authService,
    exportService,
  };
}

export function registerBackgroundBridgeHandlers(services: BackgroundServices): void {
  const handlers: BridgeHandlerMap = {
    'export.run': async (payload) => services.exportService.run(payload),
    'export.cancel': async (payload) => services.exportService.cancel(payload.requestId),
    'settings.get': async () => services.settingsService.getSettings(),
    'settings.patch': async (payload) => services.settingsService.patchSettings(payload),
    'auth.getToken': async () => ({ token: await services.authService.getToken() }),
    'auth.setToken': async (payload) => {
      await services.authService.setToken(payload.token);
      return { ok: true };
    },
    'profile.getEffective': async (payload) => services.exportService.getEffectiveProfile(payload),
    'options.open': async () => {
      await openOptionsPage();
      return { ok: true };
    },
  };

  registerBridgeHandlers(handlers);
}
