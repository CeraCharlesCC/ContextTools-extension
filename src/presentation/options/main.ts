/**
 * Options Page Main Script
 */
import { getBrowserAdapters, detectBrowser } from '@infrastructure/adapters';
import type { Settings, SettingsUpdate } from '@domain/entities';

const adapters = getBrowserAdapters();

// DOM Elements
const prEnabledToggle = document.getElementById('pr-enabled-toggle') as HTMLInputElement;
const prNotificationsToggle = document.getElementById('pr-notifications-toggle') as HTMLInputElement;
const prThemeSelect = document.getElementById('pr-theme-select') as HTMLSelectElement;
const prHistoricalModeToggle = document.getElementById('pr-historical-mode-toggle') as HTMLInputElement;
const prIncludeFileDiffToggle = document.getElementById('pr-include-file-diff-toggle') as HTMLInputElement;
const prIncludeCommitDiffToggle = document.getElementById('pr-include-commit-diff-toggle') as HTMLInputElement;
const prSmartDiffModeToggle = document.getElementById('pr-smart-diff-mode-toggle') as HTMLInputElement;
const prOnlyReviewCommentsToggle = document.getElementById('pr-only-review-comments-toggle') as HTMLInputElement;
const prIgnoreResolvedCommentsToggle = document.getElementById('pr-ignore-resolved-comments-toggle') as HTMLInputElement;
const issueEnabledToggle = document.getElementById('issue-enabled-toggle') as HTMLInputElement;
const issueNotificationsToggle = document.getElementById('issue-notifications-toggle') as HTMLInputElement;
const issueThemeSelect = document.getElementById('issue-theme-select') as HTMLSelectElement;
const issueHistoricalModeToggle = document.getElementById('issue-historical-mode-toggle') as HTMLInputElement;
const issueSmartDiffModeToggle = document.getElementById('issue-smart-diff-mode-toggle') as HTMLInputElement;
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

    prEnabledToggle.checked = settings.pr.enabled;
    prNotificationsToggle.checked = settings.pr.notifications;
    prThemeSelect.value = settings.pr.theme;

    prHistoricalModeToggle.checked = settings.pr.historicalMode;
    prIncludeFileDiffToggle.checked = settings.pr.includeFileDiff;
    prIncludeCommitDiffToggle.checked = settings.pr.includeCommit;
    prSmartDiffModeToggle.checked = settings.pr.smartDiffMode;
    prOnlyReviewCommentsToggle.checked = settings.pr.onlyReviewComments;
    prIgnoreResolvedCommentsToggle.checked = settings.pr.ignoreResolvedComments;

    issueEnabledToggle.checked = settings.issue.enabled;
    issueNotificationsToggle.checked = settings.issue.notifications;
    issueThemeSelect.value = settings.issue.theme;
    issueHistoricalModeToggle.checked = settings.issue.historicalMode;
    issueSmartDiffModeToggle.checked = settings.issue.smartDiffMode;
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

type PrBooleanSettingKey =
  | 'enabled'
  | 'notifications'
  | 'historicalMode'
  | 'includeFileDiff'
  | 'includeCommit'
  | 'smartDiffMode'
  | 'onlyReviewComments'
  | 'ignoreResolvedComments';

type IssueBooleanSettingKey = 'enabled' | 'notifications' | 'historicalMode' | 'smartDiffMode';

function bindPrBooleanSetting(element: HTMLInputElement, key: PrBooleanSettingKey): void {
  element.addEventListener('change', () => {
    updateSettings({
      pr: { [key]: element.checked } as Partial<Settings['pr']>,
    });
  });
}

function bindIssueBooleanSetting(element: HTMLInputElement, key: IssueBooleanSettingKey): void {
  element.addEventListener('change', () => {
    updateSettings({
      issue: { [key]: element.checked } as Partial<Settings['issue']>,
    });
  });
}

function bindPrThemeSetting(element: HTMLSelectElement): void {
  element.addEventListener('change', () => {
    updateSettings({
      pr: { theme: element.value as Settings['pr']['theme'] },
    });
  });
}

function bindIssueThemeSetting(element: HTMLSelectElement): void {
  element.addEventListener('change', () => {
    updateSettings({
      issue: { theme: element.value as Settings['issue']['theme'] },
    });
  });
}

// Event handlers
bindPrBooleanSetting(prEnabledToggle, 'enabled');
bindPrBooleanSetting(prNotificationsToggle, 'notifications');
bindPrThemeSetting(prThemeSelect);
bindIssueBooleanSetting(issueEnabledToggle, 'enabled');
bindIssueBooleanSetting(issueNotificationsToggle, 'notifications');
bindIssueThemeSetting(issueThemeSelect);
bindPrBooleanSetting(prHistoricalModeToggle, 'historicalMode');
bindPrBooleanSetting(prIncludeFileDiffToggle, 'includeFileDiff');
bindPrBooleanSetting(prIncludeCommitDiffToggle, 'includeCommit');
bindPrBooleanSetting(prSmartDiffModeToggle, 'smartDiffMode');
bindPrBooleanSetting(prOnlyReviewCommentsToggle, 'onlyReviewComments');
bindPrBooleanSetting(prIgnoreResolvedCommentsToggle, 'ignoreResolvedComments');
bindIssueBooleanSetting(issueHistoricalModeToggle, 'historicalMode');
bindIssueBooleanSetting(issueSmartDiffModeToggle, 'smartDiffMode');

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
