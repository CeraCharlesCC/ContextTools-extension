import { z } from 'zod';
import type { BridgeMethodName } from './protocol';

const targetSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('pull'),
    owner: z.string().min(1),
    repo: z.string().min(1),
    number: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal('issue'),
    owner: z.string().min(1),
    repo: z.string().min(1),
    number: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal('actionsRun'),
    owner: z.string().min(1),
    repo: z.string().min(1),
    runId: z.number().int().positive(),
  }),
]);

const markerSchema = z.object({
  type: z.enum(['issue-comment', 'review-comment', 'review']),
  id: z.number().int().positive(),
});

const markerRangeSchema = z.object({
  start: markerSchema.nullish(),
  end: markerSchema.nullish(),
});

const selectionSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('all') }),
  z.object({ mode: z.literal('range'), range: markerRangeSchema }),
]);

const pullPresetSchema = z.enum([
  'full-conversation',
  'with-diffs',
  'review-comments-only',
  'commit-log',
  'custom',
]);

const pullExportOptionsSchema = z.object({
  includeIssueComments: z.boolean(),
  includeReviewComments: z.boolean(),
  includeReviews: z.boolean(),
  includeCommits: z.boolean(),
  includeFileDiffs: z.boolean(),
  includeCommitDiffs: z.boolean(),
  smartDiffMode: z.boolean(),
  timelineMode: z.boolean(),
  ignoreResolvedComments: z.boolean(),
});

const issueProfileSchema = z.object({
  kind: z.literal('issue'),
  timelineMode: z.boolean(),
});

const pullProfileSchema = z.object({
  kind: z.literal('pull'),
  preset: pullPresetSchema,
  options: pullExportOptionsSchema,
});

const actionsRunPresetSchema = z.enum([
  'only-summary',
  'export-all',
  'failure-job',
  'failure-step',
]);

const actionsRunExportOptionsSchema = z.object({
  includeSummary: z.boolean(),
  includeJobs: z.boolean(),
  includeSteps: z.boolean(),
  onlyFailureJobs: z.boolean(),
  onlyFailureSteps: z.boolean(),
});

const actionsRunProfileSchema = z.object({
  kind: z.literal('actionsRun'),
  preset: actionsRunPresetSchema,
  options: actionsRunExportOptionsSchema,
});

const exportProfileSchema = z.discriminatedUnion('kind', [
  pullProfileSchema,
  issueProfileSchema,
  actionsRunProfileSchema,
]);

const exportRequestSchema = z.object({
  requestId: z.string().min(1),
  target: targetSchema,
  selection: selectionSchema.optional(),
  profile: exportProfileSchema.optional(),
});

const exportErrorCodeSchema = z.enum([
  'aborted',
  'rateLimited',
  'unauthorized',
  'notFound',
  'network',
  'invalidSelection',
  'invalidRequest',
  'unknown',
]);

const exportResultSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    markdown: z.string(),
    warning: z.string().optional(),
  }),
  z.object({
    ok: z.literal(false),
    code: exportErrorCodeSchema,
    message: z.string(),
    warning: z.string().optional(),
  }),
]);

const settingsBehaviorSchema = z.object({
  rememberLastUsed: z.boolean(),
  rememberScope: z.enum(['global', 'repo']),
});

const settingsEnabledSchema = z.object({
  pull: z.boolean(),
  issue: z.boolean(),
  actionsRun: z.boolean(),
});

const settingsV1Schema = z.object({
  version: z.literal(1),
  behavior: settingsBehaviorSchema,
  enabled: settingsEnabledSchema,
  defaults: z.object({
    pull: pullProfileSchema,
    issue: issueProfileSchema,
    actionsRun: actionsRunProfileSchema,
  }),
});

const settingsPatchSchema = z.object({
  behavior: settingsBehaviorSchema.partial().optional(),
  enabled: settingsEnabledSchema.partial().optional(),
  defaults: z
    .object({
      pull: z
        .object({
          preset: pullPresetSchema.optional(),
          options: pullExportOptionsSchema.partial().optional(),
        })
        .optional(),
      issue: z
        .object({
          timelineMode: z.boolean().optional(),
        })
        .optional(),
      actionsRun: z
        .object({
          preset: actionsRunPresetSchema.optional(),
          options: actionsRunExportOptionsSchema.partial().optional(),
        })
        .optional(),
    })
    .optional(),
});

const bridgeMethodSchema = z.enum([
  'export.run',
  'export.cancel',
  'settings.get',
  'settings.patch',
  'auth.getToken',
  'auth.setToken',
  'profile.getEffective',
  'options.open',
]);

export const bridgeRequestEnvelopeBaseSchema = z.object({
  kind: z.literal('ctx.bridge.request'),
  id: z.string().min(1),
  method: bridgeMethodSchema,
  payload: z.unknown(),
});

export const bridgeResponseEnvelopeBaseSchema = z.object({
  kind: z.literal('ctx.bridge.response'),
  id: z.string().min(1),
  method: bridgeMethodSchema,
  ok: z.boolean(),
  payload: z.unknown().optional(),
  error: z
    .object({
      message: z.string(),
      code: z.string().optional(),
    })
    .optional(),
});

export const bridgeMethodSchemas: Record<BridgeMethodName, { request: z.ZodTypeAny; response: z.ZodTypeAny }> = {
  'export.run': {
    request: exportRequestSchema,
    response: exportResultSchema,
  },
  'export.cancel': {
    request: z.object({ requestId: z.string().min(1) }),
    response: z.object({ ok: z.literal(true) }),
  },
  'settings.get': {
    request: z.null(),
    response: settingsV1Schema,
  },
  'settings.patch': {
    request: settingsPatchSchema,
    response: settingsV1Schema,
  },
  'auth.getToken': {
    request: z.null(),
    response: z.object({ token: z.string() }),
  },
  'auth.setToken': {
    request: z.object({ token: z.string() }),
    response: z.object({ ok: z.literal(true) }),
  },
  'profile.getEffective': {
    request: z.object({
      target: targetSchema,
      profile: exportProfileSchema.nullish(),
    }),
    response: z.object({
      profile: exportProfileSchema,
      source: z.enum(['request', 'last', 'default']),
    }),
  },
  'options.open': {
    request: z.null(),
    response: z.object({ ok: z.literal(true) }),
  },
};
