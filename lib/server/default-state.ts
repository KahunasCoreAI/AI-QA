import type { QASettings, QAState, TestRun } from '@/types';

const DEFAULT_AI_MODEL = process.env.NEXT_PUBLIC_DEFAULT_AI_MODEL || 'openai/gpt-5.2';
const DEFAULT_BROWSER_PROVIDER = 'hyperbrowser-browser-use' as const;
const DEFAULT_HYPERBROWSER_MODEL = process.env.NEXT_PUBLIC_HYPERBROWSER_MODEL || 'gemini-2.5-flash';
const DEFAULT_BROWSER_USE_CLOUD_MODEL = process.env.NEXT_PUBLIC_BROWSER_USE_CLOUD_MODEL || 'browser-use-llm';

export function buildDefaultSettings(): QASettings {
  return {
    aiModel: DEFAULT_AI_MODEL,
    defaultTimeout: 60000,
    parallelLimit: 3,
    browserProfile: 'standard',
    proxyEnabled: false,
    hyperbrowserEnabled: true,
    browserProvider: DEFAULT_BROWSER_PROVIDER,
    hyperbrowserModel: DEFAULT_HYPERBROWSER_MODEL,
    browserUseCloudModel: DEFAULT_BROWSER_USE_CLOUD_MODEL,
    providerApiKeys: {},
    draftUserAccounts: true,
  };
}

export function buildDefaultState(): QAState {
  return {
    projects: [],
    currentProjectId: null,
    testCases: {},
    testRuns: {},
    testGroups: {},
    userAccounts: {},
    aiGenerationJobs: {},
    aiDrafts: {},
    aiDraftNotifications: {},
    settings: buildDefaultSettings(),
    activeTestRuns: {},
    lastUpdated: null,
    isFirstLoad: false,
  };
}

export function sanitizeStateForStorage(candidate: unknown): QAState {
  const base = buildDefaultState();
  if (!candidate || typeof candidate !== 'object') {
    return base;
  }

  const raw = candidate as Partial<QAState> & { settings?: Partial<QASettings> };
  const mergedSettings = {
    ...base.settings,
    ...(raw.settings || {}),
    providerApiKeys: {},
  };
  const settings = {
    ...mergedSettings,
    parallelLimit: Math.max(1, Math.min(250, Math.floor(Number(mergedSettings.parallelLimit) || 3))),
    browserProvider:
      mergedSettings.hyperbrowserEnabled === false &&
      mergedSettings.browserProvider !== 'browser-use-cloud'
        ? 'browser-use-cloud'
        : mergedSettings.browserProvider,
  };

  return {
    ...base,
    ...raw,
    projects: Array.isArray(raw.projects) ? raw.projects : base.projects,
    testCases: raw.testCases && typeof raw.testCases === 'object' ? raw.testCases : base.testCases,
    testRuns: raw.testRuns && typeof raw.testRuns === 'object' ? raw.testRuns : base.testRuns,
    testGroups: raw.testGroups && typeof raw.testGroups === 'object' ? raw.testGroups : base.testGroups,
    userAccounts: raw.userAccounts && typeof raw.userAccounts === 'object' ? raw.userAccounts : base.userAccounts,
    aiGenerationJobs:
      raw.aiGenerationJobs && typeof raw.aiGenerationJobs === 'object'
        ? raw.aiGenerationJobs
        : base.aiGenerationJobs,
    aiDrafts: raw.aiDrafts && typeof raw.aiDrafts === 'object' ? raw.aiDrafts : base.aiDrafts,
    aiDraftNotifications:
      raw.aiDraftNotifications && typeof raw.aiDraftNotifications === 'object'
        ? raw.aiDraftNotifications
        : base.aiDraftNotifications,
    settings,
    activeTestRuns: (() => {
      const candidate = raw as Record<string, unknown>;
      if (candidate.activeTestRuns && typeof candidate.activeTestRuns === 'object' && !Array.isArray(candidate.activeTestRuns)) {
        return candidate.activeTestRuns as Record<string, TestRun>;
      }
      if (candidate.activeTestRun && typeof candidate.activeTestRun === 'object') {
        const oldRun = candidate.activeTestRun as TestRun;
        if (oldRun.id) {
          return { [oldRun.id]: oldRun };
        }
      }
      return {};
    })(),
    currentProjectId:
      typeof raw.currentProjectId === 'string' || raw.currentProjectId === null
        ? raw.currentProjectId
        : base.currentProjectId,
    lastUpdated: typeof raw.lastUpdated === 'number' ? raw.lastUpdated : Date.now(),
    isFirstLoad: false,
  };
}

export function sanitizeStateForClient(state: QAState): QAState {
  return {
    ...state,
    isFirstLoad: false,
    settings: {
      ...state.settings,
      providerApiKeys: {},
    },
  };
}
