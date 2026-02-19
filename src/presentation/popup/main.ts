/**
 * Popup Main Script
 */
import { getBrowserAdapters } from '@infrastructure/adapters';
import type { Settings } from '@domain/entities';

const adapters = getBrowserAdapters();

// DOM Elements
const prEnabledToggle = document.getElementById('pr-enabled-toggle') as HTMLInputElement;
const issueEnabledToggle = document.getElementById('issue-enabled-toggle') as HTMLInputElement;
const pageInfoEl = document.getElementById('page-info')!;
const optionsBtn = document.getElementById('options-btn')!;

// Load settings
async function loadSettings(): Promise<void> {
  try {
    const settings = await adapters.messaging.sendMessage<{ type: string }, Settings>({
      type: 'GET_SETTINGS',
    });
    prEnabledToggle.checked = settings.pr.enabled;
    issueEnabledToggle.checked = settings.issue.enabled;
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

// Load page info
async function loadPageInfo(): Promise<void> {
  try {
    const tab = await adapters.tabs.getActiveTab();
    if (tab?.id) {
      const info = await adapters.tabs.sendMessageToTab<
        { type: string },
        { title: string; url: string; hostname: string }
      >(tab.id, { type: 'GET_PAGE_INFO' });

      pageInfoEl.innerHTML = `
        <p><strong>Title:</strong> ${info.title}</p>
        <p><strong>URL:</strong> ${info.hostname}</p>
      `;
    } else {
      pageInfoEl.innerHTML = '<p class="loading">No active tab</p>';
    }
  } catch (error) {
    pageInfoEl.innerHTML = '<p class="loading">Unable to access page</p>';
  }
}

// Event handlers
prEnabledToggle.addEventListener('change', async () => {
  try {
    const enabled = prEnabledToggle.checked;
    await adapters.messaging.sendMessage({
      type: 'UPDATE_SETTINGS',
      payload: {
        pr: { enabled },
      },
    });
  } catch (error) {
    console.error('Failed to update settings:', error);
    prEnabledToggle.checked = !prEnabledToggle.checked;
  }
});

issueEnabledToggle.addEventListener('change', async () => {
  try {
    const enabled = issueEnabledToggle.checked;
    await adapters.messaging.sendMessage({
      type: 'UPDATE_SETTINGS',
      payload: {
        issue: { enabled },
      },
    });
  } catch (error) {
    console.error('Failed to update settings:', error);
    issueEnabledToggle.checked = !issueEnabledToggle.checked;
  }
});

optionsBtn.addEventListener('click', () => {
  adapters.runtime.openOptionsPage();
});

// Initialize
loadSettings();
loadPageInfo();
