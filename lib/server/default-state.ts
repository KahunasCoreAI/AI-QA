import type { QASettings, QAState } from '@/types';

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
    settings: buildDefaultSettings(),
    activeTestRun: null,
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
    settings,
    activeTestRun: raw.activeTestRun || null,
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
