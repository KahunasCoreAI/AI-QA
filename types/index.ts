// Project types
export interface Project {
  id: string;
  name: string;
  websiteUrl: string;
  description?: string;
  createdAt: number;
  lastRunStatus?: 'passed' | 'failed' | 'running' | 'never_run';
  lastRunAt?: number;
  testCount?: number;
}

// Simplified Test case types
export type TestStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped';

export interface TestCase {
  id: string;
  projectId: string;
  title: string;
  description: string; // Natural language test description
  expectedOutcome: string;
  status: TestStatus;
  createdAt: number;
  createdByUserId?: string;
  createdByName?: string;
  lastRunResult?: TestResult;
  userAccountId?: string;
}

export interface TestGroup {
  id: string;
  projectId: string;
  name: string;
  testCaseIds: string[];  // ordered list of test IDs in this group
  createdAt: number;
  lastRunAt?: number;
  lastRunStatus?: 'passed' | 'failed' | 'running' | 'never_run';
}

export type ProfileStatus = 'none' | 'authenticating' | 'authenticated' | 'expired';

export type AccountProfileProviderKey = 'hyperbrowser' | 'browserUseCloud';

export interface UserAccountProviderProfile {
  profileId?: string;
  status: ProfileStatus;
  lastAuthenticatedAt?: number;
}

export interface UserAccountProviderProfiles {
  hyperbrowser?: UserAccountProviderProfile;
  browserUseCloud?: UserAccountProviderProfile;
}

export interface UserAccount {
  id: string;
  projectId: string;
  label: string;
  email: string;
  password: string;
  metadata?: Record<string, string>;
  createdAt: number;
  providerProfiles?: UserAccountProviderProfiles;
}

// Test execution types
export interface TestResult {
  id: string;
  testCaseId: string;
  resolvedUserAccountId?: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped' | 'error';
  startedAt: number;
  completedAt?: number;
  duration?: number;
  currentStep?: number;
  totalSteps?: number;
  currentStepDescription?: string;
  streamingUrl?: string;   // ephemeral live view URL — valid only while session is active
  recordingUrl?: string;   // persistent session/recording URL — valid after session ends
  error?: string;
  reason?: string; // Explanation of why the test passed or failed
  steps?: string[]; // All steps taken during test execution
  extractedData?: Record<string, unknown>;
  linearIssueId?: string;
  linearIssueIdentifier?: string;
  linearIssueUrl?: string;
  linearCreatedAt?: number;
}

// Test run types (batch execution)
export interface TestRun {
  id: string;
  projectId: string;
  startedAt: number;
  completedAt?: number;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  testCaseIds: string[];
  parallelLimit: number;
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  results: TestResult[];
}

// Settings types
export type BrowserProvider =
  | 'hyperbrowser-browser-use'
  | 'hyperbrowser-hyperagent'
  | 'browser-use-cloud';

export interface ProviderApiKeys {
  hyperbrowser?: string;
  browserUseCloud?: string;
}

export interface QASettings {
  aiModel: string; // OpenRouter model ID (e.g. 'openai/gpt-5.2')
  defaultTimeout: number; // ms
  parallelLimit: number; // max concurrent tests
  browserProfile: 'standard' | 'stealth';
  proxyEnabled: boolean;
  proxyCountry?: 'US' | 'GB' | 'CA' | 'DE' | 'FR' | 'JP' | 'AU';
  hyperbrowserEnabled: boolean;
  browserProvider: BrowserProvider;
  hyperbrowserModel: string;
  browserUseCloudModel: string;
  providerApiKeys: ProviderApiKeys;
  draftUserAccounts: boolean;
}

// Bulk test generation types
export interface GeneratedTest {
  title: string;
  description: string;
  expectedOutcome: string;
}

export type AiGenerationJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export type AiDraftStatus = 'draft' | 'published' | 'discarded' | 'duplicate_skipped';

export interface AiGenerationJob {
  id: string;
  projectId: string;
  prompt: string;
  groupName?: string;
  userAccountId?: string;
  browserProvider: BrowserProvider;
  settingsSnapshot?: Partial<QASettings>;
  aiModel: string;
  status: AiGenerationJobStatus;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  progressMessage?: string;
  streamingUrl?: string;   // ephemeral live view URL during exploration
  recordingUrl?: string;   // persistent recording URL after exploration
  draftCount: number;
  duplicateCount: number;
}

export interface GeneratedTestDraft extends GeneratedTest {
  id: string;
  projectId: string;
  jobId: string;
  userAccountId?: string;
  groupName?: string;
  status: AiDraftStatus;
  duplicateOfTestCaseId?: string;
  duplicateReason?: string;
  createdAt: number;
  publishedAt?: number;
  discardedAt?: number;
}

export interface AiDraftNotification {
  hasUnseenDrafts: boolean;
  lastSeenAt?: number;
}

export interface BulkGenerateRequest {
  rawText: string;
  websiteUrl: string;
}

export interface BulkGenerateResponse {
  tests: GeneratedTest[];
}

// SSE Event types
export type TestEventType =
  | 'task_created'
  | 'test_start'
  | 'streaming_url'
  | 'step_progress'
  | 'step_complete'
  | 'test_complete'
  | 'test_error'
  | 'all_complete';

export interface TestEvent {
  type: TestEventType;
  testCaseId: string;
  timestamp: number;
  data?: {
    taskId?: string;
    sessionId?: string;
    resolvedUserAccountId?: string;
    streamingUrl?: string;
    recordingUrl?: string;
    currentStep?: number;
    totalSteps?: number;
    stepDescription?: string;
    status?: TestStatus;
    error?: string;
    result?: TestResult;
  };
}

export interface AllCompleteEvent {
  type: 'all_complete';
  timestamp: number;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
  };
}

// Bug report types
export interface BugReport {
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  stepsToReproduce: string[];
  expectedBehavior: string;
  actualBehavior: string;
  environment?: string;
  additionalNotes?: string;
}

// State types for context
export interface QAState {
  projects: Project[];
  currentProjectId: string | null;
  testCases: Record<string, TestCase[]>; // keyed by projectId
  testRuns: Record<string, TestRun[]>; // keyed by projectId
  testGroups: Record<string, TestGroup[]>; // keyed by projectId
  userAccounts: Record<string, UserAccount[]>; // keyed by projectId
  aiGenerationJobs: Record<string, AiGenerationJob[]>; // keyed by projectId
  aiDrafts: Record<string, GeneratedTestDraft[]>; // keyed by projectId
  aiDraftNotifications: Record<string, AiDraftNotification>; // keyed by projectId
  settings: QASettings;
  activeTestRuns: Record<string, TestRun>;
  lastUpdated: number | null;
  isFirstLoad: boolean;
}

// Action types for reducer
export type QAAction =
  | { type: 'CREATE_PROJECT'; payload: Project }
  | { type: 'UPDATE_PROJECT'; payload: { id: string; updates: Partial<Project> } }
  | { type: 'DELETE_PROJECT'; payload: string }
  | { type: 'SET_CURRENT_PROJECT'; payload: string | null }
  | { type: 'CREATE_TEST_CASE'; payload: TestCase }
  | { type: 'CREATE_TEST_CASES_BULK'; payload: TestCase[] }
  | { type: 'UPDATE_TEST_CASE'; payload: { id: string; projectId: string; updates: Partial<TestCase> } }
  | { type: 'DELETE_TEST_CASE'; payload: { id: string; projectId: string } }
  | { type: 'CREATE_TEST_GROUP'; payload: TestGroup }
  | { type: 'UPDATE_TEST_GROUP'; payload: { id: string; projectId: string; updates: Partial<TestGroup> } }
  | { type: 'DELETE_TEST_GROUP'; payload: { id: string; projectId: string } }
  | { type: 'CREATE_USER_ACCOUNT'; payload: UserAccount }
  | { type: 'UPDATE_USER_ACCOUNT'; payload: { id: string; projectId: string; updates: Partial<UserAccount> } }
  | { type: 'DELETE_USER_ACCOUNT'; payload: { id: string; projectId: string } }
  | {
      type: 'SYNC_AI_GENERATION_PROJECT_STATE';
      payload: {
        projectId: string;
        jobs: AiGenerationJob[];
        drafts: GeneratedTestDraft[];
        notification?: AiDraftNotification;
      };
    }
  | { type: 'MARK_AI_DRAFTS_SEEN'; payload: { projectId: string; seenAt?: number } }
  | { type: 'START_TEST_RUN'; payload: TestRun }
  | { type: 'UPDATE_TEST_RESULT'; payload: { runId: string; result: TestResult } }
  | {
      type: 'PATCH_TEST_RESULT';
      payload: {
        runId: string;
        projectId: string;
        resultId: string;
        updates: Partial<Pick<TestResult, 'linearIssueId' | 'linearIssueIdentifier' | 'linearIssueUrl' | 'linearCreatedAt'>>;
      };
    }
  | { type: 'COMPLETE_TEST_RUN'; payload: { runId: string; status: 'completed' | 'failed' | 'cancelled'; finalResults?: TestResult[] } }
  | { type: 'DELETE_TEST_RESULT'; payload: { runId: string; projectId: string; resultId: string } }
  | { type: 'DELETE_TEST_RUN'; payload: { runId: string; projectId: string } }
  | { type: 'CLEAR_TEST_RUNS'; payload: { projectId: string } }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<QASettings> }
  | { type: 'LOAD_STATE'; payload: QAState }
  | { type: 'SET_FIRST_LOAD'; payload: boolean }
  | { type: 'RESET' };
