import {
  createGitHubClient,
  runExport,
  resolveEffectiveProfile,
  type ExportProfile,
  type ExportRequest,
  type ExportResult,
  type Target,
} from '@core/index';
import type { SettingsService } from './SettingsService';
import type { AuthService } from './AuthService';
import type { LastProfileStore } from './LastProfileStore';

export interface EffectiveProfileInput {
  target: Target;
  profile?: ExportProfile | null;
}

export interface EffectiveProfileResult {
  profile: ExportProfile;
  source: 'request' | 'last' | 'default';
}

export interface ExportServiceRuntimeDeps {
  createGitHubClientFn?: typeof createGitHubClient;
  runExportFn?: typeof runExport;
}

export class ExportService {
  private readonly inFlight = new Map<string, AbortController>();
  private readonly createGitHubClientFn: typeof createGitHubClient;
  private readonly runExportFn: typeof runExport;

  constructor(
    private readonly settingsService: SettingsService,
    private readonly authService: AuthService,
    private readonly lastProfileStore: LastProfileStore,
    runtimeDeps: ExportServiceRuntimeDeps = {},
  ) {
    this.createGitHubClientFn = runtimeDeps.createGitHubClientFn ?? createGitHubClient;
    this.runExportFn = runtimeDeps.runExportFn ?? runExport;
  }

  async getEffectiveProfile(input: EffectiveProfileInput): Promise<EffectiveProfileResult> {
    const settings = await this.settingsService.getSettings();
    const rememberedProfile = settings.behavior.rememberLastUsed
      ? await this.lastProfileStore.get(settings.behavior.rememberScope, input.target)
      : null;

    return resolveEffectiveProfile({
      targetKind: input.target.kind,
      defaults: settings.defaults,
      requestProfile: input.profile,
      rememberedProfile,
    });
  }

  async run(request: ExportRequest): Promise<ExportResult> {
    const settings = await this.settingsService.getSettings();
    const effective = await this.getEffectiveProfile({
      target: request.target,
      profile: request.profile,
    });

    const token = await this.authService.getToken();
    const client = this.createGitHubClientFn({ token });
    const controller = new AbortController();
    this.inFlight.set(request.requestId, controller);

    try {
      const result = await this.runExportFn(
        {
          ...request,
          profile: effective.profile,
        },
        {
          client,
          signal: controller.signal,
          concurrency: 4,
          cacheTtlMs: 30_000,
          authScopeKey: token ? 'token' : 'anon',
        },
      );

      if (
        result.ok &&
        settings.behavior.rememberLastUsed &&
        request.profile &&
        request.profile.kind === request.target.kind
      ) {
        await this.lastProfileStore.set(settings.behavior.rememberScope, request.target, effective.profile);
      }

      return result;
    } finally {
      this.inFlight.delete(request.requestId);
    }
  }

  cancel(requestId: string): { ok: true } {
    const controller = this.inFlight.get(requestId);
    if (controller) {
      controller.abort();
      this.inFlight.delete(requestId);
    }

    return { ok: true };
  }
}
