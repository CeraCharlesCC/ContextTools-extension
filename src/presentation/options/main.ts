/**
 * Options Page Main Script
 */
import { getBrowserAdapters, detectBrowser } from '@infrastructure/adapters';
import type { ExportOptions, ExportPreset, Settings, SettingsUpdate } from '@domain/entities';

const adapters = getBrowserAdapters();

// DOM Elements
const commonNotificationsToggle = document.getElementById('common-notifications-toggle') as HTMLInputElement;
const commonThemeSelect = document.getElementById('common-theme-select') as HTMLSelectElement;
const prEnabledToggle = document.getElementById('pr-enabled-toggle') as HTMLInputElement;
const prDefaultPresetSelect = document.getElementById('pr-default-preset-select') as HTMLSelectElement;
const issueEnabledToggle = document.getElementById('issue-enabled-toggle') as HTMLInputElement;
const issueHistoricalModeToggle = document.getElementById('issue-historical-mode-toggle') as HTMLInputElement;
const githubTokenInput = document.getElementById('github-token') as HTMLInputElement;
const githubTokenToggle = document.getElementById('github-token-toggle') as HTMLButtonElement;
const versionEl = document.getElementById('version')!;
const browserTypeEl = document.getElementById('browser-type')!;
const saveStatusEl = document.getElementById('save-status')!;

const prCustomSmartDiffRow = document.getElementById('pr-custom-smart-diff-row') as HTMLLabelElement;

const prCustomOptionInputs: Record<keyof ExportOptions, HTMLInputElement> = {
  includeIssueComments: document.getElementById('pr-custom-include-issue-comments-toggle') as HTMLInputElement,
  includeReviewComments: document.getElementById('pr-custom-include-review-comments-toggle') as HTMLInputElement,
  includeReviews: document.getElementById('pr-custom-include-reviews-toggle') as HTMLInputElement,
  includeCommits: document.getElementById('pr-custom-include-commits-toggle') as HTMLInputElement,
  includeFileDiffs: document.getElementById('pr-custom-include-file-diffs-toggle') as HTMLInputElement,
  includeCommitDiffs: document.getElementById('pr-custom-include-commit-diffs-toggle') as HTMLInputElement,
  smartDiffMode: document.getElementById('pr-custom-smart-diff-mode-toggle') as HTMLInputElement,
  timelineMode: document.getElementById('pr-custom-timeline-mode-toggle') as HTMLInputElement,
  ignoreResolvedComments: document.getElementById('pr-custom-ignore-resolved-comments-toggle') as HTMLInputElement,
};

// Show save status
function showStatus(message: string, type: 'success' | 'error'): void {
  saveStatusEl.textContent = message;
  saveStatusEl.className = `save-status visible ${type}`;

  setTimeout(() => {
    saveStatusEl.classList.remove('visible');
  }, 2000);
}

function isExportPreset(value: string): value is ExportPreset {
  return value === 'full-conversation' ||
    value === 'with-diffs' ||
    value === 'review-comments-only' ||
    value === 'commit-log' ||
    value === 'custom';
}

function updateSmartDiffControl(): void {
  const includeCommitDiffsInput = prCustomOptionInputs.includeCommitDiffs;
  const smartDiffInput = prCustomOptionInputs.smartDiffMode;

  const enabled = includeCommitDiffsInput.checked;
  const tooltip = 'Enable “Include commit diffs” to use Smart diff mode.';

  smartDiffInput.disabled = !enabled;
  if (!enabled) {
    smartDiffInput.checked = false;
    smartDiffInput.title = tooltip;
    prCustomSmartDiffRow.title = tooltip;
  } else {
    smartDiffInput.removeAttribute('title');
    prCustomSmartDiffRow.removeAttribute('title');
  }

  prCustomSmartDiffRow.classList.toggle('is-disabled', !enabled);
}

// Load settings
async function loadSettings(): Promise<void> {
  try {
    const settings = await adapters.messaging.sendMessage<{ type: string }, Settings>({
      type: 'GET_SETTINGS',
    });

    commonNotificationsToggle.checked = settings.commonSettings.notifications;
    commonThemeSelect.value = settings.commonSettings.theme;

    prEnabledToggle.checked = settings.pr.enabled;
    prDefaultPresetSelect.value = settings.pr.defaultPreset;
    Object.keys(prCustomOptionInputs).forEach((key) => {
      const optionKey = key as keyof ExportOptions;
      prCustomOptionInputs[optionKey].checked = settings.pr.customOptions[optionKey];
    });
    updateSmartDiffControl();

    issueEnabledToggle.checked = settings.issue.enabled;
    issueHistoricalModeToggle.checked = settings.issue.historicalMode;
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
async function updateSettings(updates: SettingsUpdate): Promise<void> {
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

type CommonBooleanSettingKey = 'notifications';
type IssueBooleanSettingKey = 'enabled' | 'historicalMode';

function bindCommonBooleanSetting(element: HTMLInputElement, key: CommonBooleanSettingKey): void {
  element.addEventListener('change', () => {
    void updateSettings({
      commonSettings: { [key]: element.checked } as Partial<Settings['commonSettings']>,
    });
  });
}

function bindIssueBooleanSetting(element: HTMLInputElement, key: IssueBooleanSettingKey): void {
  element.addEventListener('change', () => {
    void updateSettings({
      issue: { [key]: element.checked } as Partial<Settings['issue']>,
    });
  });
}

function bindCommonThemeSetting(element: HTMLSelectElement): void {
  element.addEventListener('change', () => {
    void updateSettings({
      commonSettings: { theme: element.value as Settings['commonSettings']['theme'] },
    });
  });
}

function bindPrEnabledSetting(element: HTMLInputElement): void {
  element.addEventListener('change', () => {
    void updateSettings({
      pr: { enabled: element.checked },
    });
  });
}

function bindPrDefaultPresetSetting(element: HTMLSelectElement): void {
  element.addEventListener('change', () => {
    const preset = isExportPreset(element.value) ? element.value : 'full-conversation';
    void updateSettings({
      pr: {
        defaultPreset: preset,
      },
    });
  });
}

function bindPrCustomOptionSetting(key: keyof ExportOptions): void {
  const element = prCustomOptionInputs[key];
  element.addEventListener('change', () => {
    if (key === 'includeCommitDiffs') {
      updateSmartDiffControl();
      void updateSettings({
        pr: {
          customOptions: {
            includeCommitDiffs: prCustomOptionInputs.includeCommitDiffs.checked,
            smartDiffMode: prCustomOptionInputs.smartDiffMode.checked,
          },
        },
      });
      return;
    }

    void updateSettings({
      pr: {
        customOptions: {
          [key]: element.checked,
        } as Partial<ExportOptions>,
      },
    });
  });
}

// Event handlers
bindCommonBooleanSetting(commonNotificationsToggle, 'notifications');
bindCommonThemeSetting(commonThemeSelect);
bindPrEnabledSetting(prEnabledToggle);
bindPrDefaultPresetSetting(prDefaultPresetSelect);
Object.keys(prCustomOptionInputs).forEach((key) => {
  bindPrCustomOptionSetting(key as keyof ExportOptions);
});
bindIssueBooleanSetting(issueEnabledToggle, 'enabled');
bindIssueBooleanSetting(issueHistoricalModeToggle, 'historicalMode');

githubTokenToggle.addEventListener('click', () => {
  const isHidden = githubTokenInput.type === 'password';
  githubTokenInput.type = isHidden ? 'text' : 'password';
  githubTokenToggle.textContent = isHidden ? 'Hide' : 'Show';
});

githubTokenInput.addEventListener('change', () => {
  void updateToken(githubTokenInput.value.trim());
});

// Initialize
void loadSettings();
void loadToken();

// Show version and browser type
const manifest = adapters.runtime.getManifest();
versionEl.textContent = (manifest.version as string) || '0.1.0';
browserTypeEl.textContent = detectBrowser() === 'firefox' ? 'Firefox' : 'Chrome/Chromium';
