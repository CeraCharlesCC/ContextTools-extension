import { bridgeClient } from '@ext/bridge';
import { isActionsRunPreset, isPullPreset, type PullExportOptions, type SettingsPatchV1 } from '@core/model';

const rememberLastUsedToggle = document.getElementById('remember-last-used-toggle') as HTMLInputElement;
const rememberScopeSelect = document.getElementById('remember-scope-select') as HTMLSelectElement;

const pullEnabledToggle = document.getElementById('pull-enabled-toggle') as HTMLInputElement;
const issueEnabledToggle = document.getElementById('issue-enabled-toggle') as HTMLInputElement;
const actionsEnabledToggle = document.getElementById('actions-enabled-toggle') as HTMLInputElement;

const pullDefaultPresetSelect = document.getElementById('pull-default-preset-select') as HTMLSelectElement;
const issueTimelineModeToggle = document.getElementById('issue-timeline-mode-toggle') as HTMLInputElement;
const actionsDefaultPresetSelect = document.getElementById('actions-default-preset-select') as HTMLSelectElement;

const githubTokenInput = document.getElementById('github-token') as HTMLInputElement;
const githubTokenToggle = document.getElementById('github-token-toggle') as HTMLButtonElement;

const versionEl = document.getElementById('version') as HTMLElement;
const browserTypeEl = document.getElementById('browser-type') as HTMLElement;
const saveStatusEl = document.getElementById('save-status') as HTMLElement;

const pullCustomSmartDiffRow = document.getElementById('pull-custom-smart-diff-row') as HTMLLabelElement;

const pullCustomOptionInputs: Record<keyof PullExportOptions, HTMLInputElement> = {
  includeIssueComments: document.getElementById('pull-custom-include-issue-comments-toggle') as HTMLInputElement,
  includeReviewComments: document.getElementById('pull-custom-include-review-comments-toggle') as HTMLInputElement,
  includeReviews: document.getElementById('pull-custom-include-reviews-toggle') as HTMLInputElement,
  includeCommits: document.getElementById('pull-custom-include-commits-toggle') as HTMLInputElement,
  includeFileDiffs: document.getElementById('pull-custom-include-file-diffs-toggle') as HTMLInputElement,
  includeCommitDiffs: document.getElementById('pull-custom-include-commit-diffs-toggle') as HTMLInputElement,
  smartDiffMode: document.getElementById('pull-custom-smart-diff-mode-toggle') as HTMLInputElement,
  timelineMode: document.getElementById('pull-custom-timeline-mode-toggle') as HTMLInputElement,
  ignoreResolvedComments: document.getElementById('pull-custom-ignore-resolved-comments-toggle') as HTMLInputElement,
};

function showStatus(message: string, type: 'success' | 'error'): void {
  saveStatusEl.textContent = message;
  saveStatusEl.className = `save-status visible ${type}`;
  window.setTimeout(() => {
    saveStatusEl.classList.remove('visible');
  }, 2000);
}

function updateRememberScopeAvailability(): void {
  rememberScopeSelect.disabled = !rememberLastUsedToggle.checked;
}

function updateSmartDiffControl(): void {
  const includeCommitDiffsInput = pullCustomOptionInputs.includeCommitDiffs;
  const smartDiffInput = pullCustomOptionInputs.smartDiffMode;
  const enabled = includeCommitDiffsInput.checked;
  const tooltip = 'Enable "Include commit diffs" to use Smart diff mode.';

  smartDiffInput.disabled = !enabled;
  if (!enabled) {
    smartDiffInput.checked = false;
    smartDiffInput.title = tooltip;
    pullCustomSmartDiffRow.title = tooltip;
  } else {
    smartDiffInput.removeAttribute('title');
    pullCustomSmartDiffRow.removeAttribute('title');
  }

  pullCustomSmartDiffRow.classList.toggle('is-disabled', !enabled);
}

async function patchSettings(patch: SettingsPatchV1): Promise<void> {
  try {
    await bridgeClient.call('settings.patch', patch);
    showStatus('Settings saved', 'success');
  } catch {
    showStatus('Failed to save settings', 'error');
  }
}

async function updateToken(token: string): Promise<void> {
  try {
    await bridgeClient.call('auth.setToken', { token });
    showStatus('Token saved', 'success');
  } catch {
    showStatus('Failed to save token', 'error');
  }
}

async function loadSettings(): Promise<void> {
  try {
    const settings = await bridgeClient.call('settings.get', null);

    rememberLastUsedToggle.checked = settings.behavior.rememberLastUsed;
    rememberScopeSelect.value = settings.behavior.rememberScope;
    updateRememberScopeAvailability();

    pullEnabledToggle.checked = settings.enabled.pull;
    issueEnabledToggle.checked = settings.enabled.issue;
    actionsEnabledToggle.checked = settings.enabled.actionsRun;

    pullDefaultPresetSelect.value = settings.defaults.pull.preset;
    (Object.keys(pullCustomOptionInputs) as Array<keyof PullExportOptions>).forEach((key) => {
      pullCustomOptionInputs[key].checked = settings.defaults.pull.options[key];
    });
    updateSmartDiffControl();

    issueTimelineModeToggle.checked = settings.defaults.issue.timelineMode;
    actionsDefaultPresetSelect.value = settings.defaults.actionsRun.preset;
  } catch {
    showStatus('Failed to load settings', 'error');
  }
}

async function loadToken(): Promise<void> {
  try {
    const result = await bridgeClient.call('auth.getToken', null);
    githubTokenInput.value = result.token;
  } catch {
    showStatus('Failed to load token', 'error');
  }
}

rememberLastUsedToggle.addEventListener('change', () => {
  updateRememberScopeAvailability();
  void patchSettings({
    behavior: {
      rememberLastUsed: rememberLastUsedToggle.checked,
    },
  });
});

rememberScopeSelect.addEventListener('change', () => {
  const scope = rememberScopeSelect.value === 'repo' ? 'repo' : 'global';
  void patchSettings({
    behavior: {
      rememberScope: scope,
    },
  });
});

pullEnabledToggle.addEventListener('change', () => {
  void patchSettings({ enabled: { pull: pullEnabledToggle.checked } });
});

issueEnabledToggle.addEventListener('change', () => {
  void patchSettings({ enabled: { issue: issueEnabledToggle.checked } });
});

actionsEnabledToggle.addEventListener('change', () => {
  void patchSettings({ enabled: { actionsRun: actionsEnabledToggle.checked } });
});

pullDefaultPresetSelect.addEventListener('change', () => {
  const preset = isPullPreset(pullDefaultPresetSelect.value)
    ? pullDefaultPresetSelect.value
    : 'full-conversation';
  void patchSettings({ defaults: { pull: { preset } } });
});

(Object.keys(pullCustomOptionInputs) as Array<keyof PullExportOptions>).forEach((key) => {
  pullCustomOptionInputs[key].addEventListener('change', () => {
    if (key === 'includeCommitDiffs') {
      updateSmartDiffControl();
      void patchSettings({
        defaults: {
          pull: {
            options: {
              includeCommitDiffs: pullCustomOptionInputs.includeCommitDiffs.checked,
              smartDiffMode: pullCustomOptionInputs.smartDiffMode.checked,
            },
          },
        },
      });
      return;
    }

    void patchSettings({
      defaults: {
        pull: {
          options: {
            [key]: pullCustomOptionInputs[key].checked,
          },
        },
      },
    });
  });
});

issueTimelineModeToggle.addEventListener('change', () => {
  void patchSettings({
    defaults: {
      issue: {
        timelineMode: issueTimelineModeToggle.checked,
      },
    },
  });
});

actionsDefaultPresetSelect.addEventListener('change', () => {
  const preset = isActionsRunPreset(actionsDefaultPresetSelect.value)
    ? actionsDefaultPresetSelect.value
    : 'export-all';
  void patchSettings({
    defaults: {
      actionsRun: {
        preset,
      },
    },
  });
});

githubTokenToggle.addEventListener('click', () => {
  const isHidden = githubTokenInput.type === 'password';
  githubTokenInput.type = isHidden ? 'text' : 'password';
  githubTokenToggle.textContent = isHidden ? 'Hide' : 'Show';
});

githubTokenInput.addEventListener('change', () => {
  void updateToken(githubTokenInput.value.trim());
});

void loadSettings();
void loadToken();

const manifest = chrome.runtime.getManifest();
versionEl.textContent = manifest.version || '0.1.0';
browserTypeEl.textContent = navigator.userAgent.includes('Firefox') ? 'Firefox' : 'Chrome/Chromium';
