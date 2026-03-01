import { bridgeClient } from '@ext/bridge';

const pullEnabledToggle = document.getElementById('pull-enabled-toggle') as HTMLInputElement;
const issueEnabledToggle = document.getElementById('issue-enabled-toggle') as HTMLInputElement;
const actionsEnabledToggle = document.getElementById('actions-enabled-toggle') as HTMLInputElement;
const pageInfoEl = document.getElementById('page-info') as HTMLElement;
const optionsBtn = document.getElementById('options-btn') as HTMLButtonElement;

function clearPageInfo(): void {
  while (pageInfoEl.firstChild) {
    pageInfoEl.removeChild(pageInfoEl.firstChild);
  }
}

function renderPageInfoMessage(message: string): void {
  clearPageInfo();

  const paragraph = document.createElement('p');
  paragraph.className = 'loading';
  paragraph.textContent = message;
  pageInfoEl.append(paragraph);
}

function createPageInfoRow(label: string, value: string): HTMLParagraphElement {
  const paragraph = document.createElement('p');
  const strong = document.createElement('strong');
  strong.textContent = `${label}:`;
  paragraph.append(strong, document.createTextNode(` ${value}`));
  return paragraph;
}

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0] ?? null);
    });
  });
}

async function loadSettings(): Promise<void> {
  try {
    const settings = await bridgeClient.call('settings.get', null);
    pullEnabledToggle.checked = settings.enabled.pull;
    issueEnabledToggle.checked = settings.enabled.issue;
    actionsEnabledToggle.checked = settings.enabled.actionsRun;
  } catch {
    // Keep UI unchanged if settings cannot be loaded.
  }
}

async function loadPageInfo(): Promise<void> {
  try {
    const tab = await getActiveTab();
    if (!tab) {
      renderPageInfoMessage('No active tab');
      return;
    }

    const title = tab.title ?? 'Unknown';
    const url = tab.url ?? '';
    const hostname = url ? new URL(url).hostname : 'Unknown';

    clearPageInfo();
    pageInfoEl.append(createPageInfoRow('Title', title), createPageInfoRow('URL', hostname));
  } catch {
    renderPageInfoMessage('Unable to access page');
  }
}

function bindEnabledToggle(toggle: HTMLInputElement, key: 'pull' | 'issue' | 'actionsRun'): void {
  toggle.addEventListener('change', () => {
    void bridgeClient.call('settings.patch', {
      enabled: {
        [key]: toggle.checked,
      },
    }).catch(() => {
      toggle.checked = !toggle.checked;
    });
  });
}

bindEnabledToggle(pullEnabledToggle, 'pull');
bindEnabledToggle(issueEnabledToggle, 'issue');
bindEnabledToggle(actionsEnabledToggle, 'actionsRun');

optionsBtn.addEventListener('click', () => {
  void bridgeClient.call('options.open', null);
});

void loadSettings();
void loadPageInfo();
