/**
 * Options Page Main Script
 */
import { getBrowserAdapters, detectBrowser } from '@infrastructure/adapters';
import type { Settings } from '@domain/entities';

const adapters = getBrowserAdapters();

// DOM Elements
const enabledToggle = document.getElementById('enabled-toggle') as HTMLInputElement;
const notificationsToggle = document.getElementById('notifications-toggle') as HTMLInputElement;
const themeSelect = document.getElementById('theme-select') as HTMLSelectElement;
const githubTokenInput = document.getElementById('github-token') as HTMLInputElement;
const githubTokenToggle = document.getElementById('github-token-toggle') as HTMLButtonElement;
const versionEl = document.getElementById('version')!;
const browserTypeEl = document.getElementById('browser-type')!;
const saveStatusEl = document.getElementById('save-status')!;

// Show save status
function showStatus(message: string, type: 'success' | 'error'): void {
  saveStatusEl.textContent = message;
  saveStatusEl.className = `save-status visible ${type}`;

  setTimeout(() => {
    saveStatusEl.classList.remove('visible');
  }, 2000);
}

// Load settings
async function loadSettings(): Promise<void> {
  try {
    const settings = await adapters.messaging.sendMessage<{ type: string }, Settings>({
      type: 'GET_SETTINGS',
    });

    enabledToggle.checked = settings.enabled;
    notificationsToggle.checked = settings.notifications;
    themeSelect.value = settings.theme;
  } catch (error) {
    console.error('Failed to load settings:', error);
    showStatus('Failed to load settings', 'error');
  }
}

async function loadToken(): Promise<void> {
  try {
    const token = await adapters.messaging.sendMessage<{ type: string }, string>({
      type: 'GET_GITHUB_TOKEN',
    });
    githubTokenInput.value = token ?? '';
  } catch (error) {
    console.error('Failed to load token:', error);
    showStatus('Failed to load token', 'error');
  }
}

// Update settings
async function updateSettings(updates: Partial<Settings>): Promise<void> {
  try {
    await adapters.messaging.sendMessage({
      type: 'UPDATE_SETTINGS',
      payload: updates,
    });
    showStatus('Settings saved', 'success');
  } catch (error) {
    console.error('Failed to update settings:', error);
    showStatus('Failed to save settings', 'error');
  }
}

async function updateToken(token: string): Promise<void> {
  try {
    await adapters.messaging.sendMessage({
      type: 'SET_GITHUB_TOKEN',
      payload: { token },
    });
    showStatus('Token saved', 'success');
  } catch (error) {
    console.error('Failed to update token:', error);
    showStatus('Failed to save token', 'error');
  }
}

// Event handlers
enabledToggle.addEventListener('change', () => {
  updateSettings({ enabled: enabledToggle.checked });
});

notificationsToggle.addEventListener('change', () => {
  updateSettings({ notifications: notificationsToggle.checked });
});

themeSelect.addEventListener('change', () => {
  updateSettings({ theme: themeSelect.value as Settings['theme'] });
});

githubTokenToggle.addEventListener('click', () => {
  const isHidden = githubTokenInput.type === 'password';
  githubTokenInput.type = isHidden ? 'text' : 'password';
  githubTokenToggle.textContent = isHidden ? 'Hide' : 'Show';
});

githubTokenInput.addEventListener('change', () => {
  updateToken(githubTokenInput.value.trim());
});

// Initialize
loadSettings();
loadToken();

// Show version and browser type
const manifest = adapters.runtime.getManifest();
versionEl.textContent = (manifest.version as string) || '0.1.0';
browserTypeEl.textContent = detectBrowser() === 'firefox' ? 'Firefox' : 'Chrome/Chromium';
