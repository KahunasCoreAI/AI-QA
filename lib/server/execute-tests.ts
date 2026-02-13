import { generateTestResultSummary } from '@/lib/ai-client';
import type { QAState, TestCase, TestResult, TestEvent, AllCompleteEvent, QASettings } from '@/types';
import { generateId } from '@/lib/utils';
import { DEFAULT_BROWSER_PROVIDER, getBrowserProvider } from '@/lib/browser/providers';
import { isAccountInUse, releaseAccount, tryAcquireAccount } from '@/lib/server/account-locks';

export interface ExecutionCredentials {
  email: string;
  password: string;
  profileId?: string;
  metadata?: Record<string, string>;
}

export interface ExecuteTestBatchInput {
  testCases: TestCase[];
  websiteUrl: string;
  aiModel: string;
  settings: Partial<QASettings>;
  parallelLimit: number;
  persistedState: QAState;
  providerKeys: { hyperbrowser?: string; browserUseCloud?: string };
  signal?: AbortSignal;
  onEvent?: (event: TestEvent | AllCompleteEvent) => Promise<void>;
}

export interface ExecuteTestBatchResult {
  results: TestResult[];
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
}

export function normalizeSettings(settings?: Partial<QASettings>): Partial<QASettings> {
  const merged: Partial<QASettings> = {
    ...settings,
    hyperbrowserEnabled: settings?.hyperbrowserEnabled ?? true,
    browserProvider: settings?.browserProvider || DEFAULT_BROWSER_PROVIDER,
    providerApiKeys: settings?.providerApiKeys || {},
  };

  return {
    ...merged,
    browserProvider:
      merged.hyperbrowserEnabled === false && merged.browserProvider !== 'browser-use-cloud'
        ? 'browser-use-cloud'
        : merged.browserProvider,
  };
}

export function normalizeRequestedAccountId(userAccountId?: string): string | undefined {
  if (!userAccountId || userAccountId === 'none') return undefined;
  return userAccountId;
}

export function buildAccountMapFromTeamState(
  testCases: TestCase[],
  state: QAState,
  settings: Partial<QASettings>
): Map<string, ExecutionCredentials> {
  const map = new Map<string, ExecutionCredentials>();

  const projectIds = new Set(testCases.map((testCase) => testCase.projectId));
  for (const projectId of projectIds) {
    const accounts = state.userAccounts[projectId] || [];
    for (const account of accounts) {
      const profileId =
        settings.browserProvider === 'browser-use-cloud'
          ? account.providerProfiles?.browserUseCloud?.profileId
          : account.providerProfiles?.hyperbrowser?.profileId;

      map.set(account.id, {
        email: account.email,
        password: account.password,
        profileId,
        metadata: account.metadata,
      });
    }
  }

  return map;
}

export function buildGoalFromTestCase(
  testCase: TestCase,
  credentials?: ExecutionCredentials
): string {
  let goal = '';

  goal += `IMPORTANT: If at any point in the test you see a screen that has an error message, stop immediately. You must fail the test and detail what happened and where the error appeared.\n\n`;

  if (credentials) {
    if (credentials.profileId) {
      goal += `IMPORTANT: Reuse the existing authenticated browser profile/session for this account.\n`;
      goal += `Only log in manually if the app clearly shows you are signed out or blocked at a login screen.\n`;
      goal += `Fallback credentials (use only if login is required):\n`;
      goal += `- Email: ${credentials.email}\n`;
      goal += `- Password: ${credentials.password}\n`;
    } else {
      goal += `IMPORTANT: Before performing the test, you must first log in to the application.\n`;
      goal += `Use these credentials to log in:\n`;
      goal += `- Email: ${credentials.email}\n`;
      goal += `- Password: ${credentials.password}\n`;
    }

    if (credentials.metadata && Object.keys(credentials.metadata).length > 0) {
      goal += `- Account info: ${Object.entries(credentials.metadata)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ')}\n`;
    }
    goal += `\nAfter confirming authentication state, proceed with the following test:\n\n`;
  }

  goal += testCase.description;

  goal += `\n\nExpected outcome: ${testCase.expectedOutcome || 'Test should complete successfully'}`;
  goal +=
    '\n\nAfter completing the steps, verify that the expected outcome is met. Return ONLY a valid JSON object with this exact shape:\n{ "success": true/false, "reason": "explanation", "extractedData": {} }\nDo not include any extra text before or after the JSON.';

  return goal;
}

export async function executeTestCase(
  testCase: TestCase,
  websiteUrl: string,
  aiModel: string,
  settings: Partial<QASettings>,
  sendEvent?: (event: TestEvent) => Promise<void>,
  credentials?: ExecutionCredentials,
  signal?: AbortSignal,
  resolvedUserAccountId?: string,
): Promise<TestResult> {
  const testCaseId = testCase.id;
  const startTime = Date.now();

  await sendEvent?.({
    type: 'test_start',
    testCaseId,
    timestamp: startTime,
    ...(resolvedUserAccountId ? { data: { resolvedUserAccountId } } : {}),
  });

  try {
    const provider = getBrowserProvider(settings.browserProvider);
    const goal = buildGoalFromTestCase(testCase, credentials);

    const execution = await provider.executeTest(
      {
        url: websiteUrl,
        task: goal,
        expectedOutcome: testCase.expectedOutcome,
        settings,
        credentials,
        signal,
      },
      {
        onLiveUrl: async (liveUrl, recordingUrl) => {
          await sendEvent?.({
            type: 'streaming_url',
            testCaseId,
            timestamp: Date.now(),
            data: {
              streamingUrl: liveUrl,
              ...(recordingUrl ? { recordingUrl } : {}),
            },
          });
        },
        onTaskCreated: async (taskId, sessionId) => {
          await sendEvent?.({
            type: 'task_created',
            testCaseId,
            timestamp: Date.now(),
            data: { taskId, sessionId, resolvedUserAccountId },
          });
        },
      }
    );

    const completedAt = Date.now();
    const duration = completedAt - startTime;

    let status: TestResult['status'];
    let error: string | undefined;
    let reason: string | undefined;
    let extractedData: Record<string, unknown> | undefined;

    if (execution.status === 'error') {
      status = 'error';
      error = execution.error || 'Browser provider execution failed.';
      reason = error;
    } else if (!execution.verdict) {
      status = 'error';
      error = 'Browser provider returned no verdict.';
      reason = error;
    } else {
      status = execution.verdict.success ? 'passed' : 'failed';
      reason = execution.verdict.reason;
      extractedData = execution.verdict.extractedData;
    }

    if (execution.rawProviderData && typeof execution.rawProviderData === 'object') {
      extractedData = {
        ...(extractedData || {}),
        provider: execution.rawProviderData as Record<string, unknown>,
      };
    }

    if (!reason) {
      try {
        const aiSummary = await generateTestResultSummary(
          {
            title: testCase.title,
            description: testCase.description,
            expectedOutcome: testCase.expectedOutcome,
          },
          {
            status,
            steps: ['Browser agent executed test'],
            error,
            duration,
          },
          websiteUrl,
          aiModel
        );
        reason = aiSummary;
      } catch (summaryError) {
        console.error('Failed to generate AI summary:', summaryError);
        reason = error || 'No summary available.';
      }
    }

    const testResult: TestResult = {
      id: generateId(),
      testCaseId,
      resolvedUserAccountId,
      status,
      startedAt: startTime,
      completedAt,
      duration,
      streamingUrl: execution.liveUrl,
      recordingUrl: execution.recordingUrl,
      error,
      reason,
      extractedData,
    };

    if (status === 'error') {
      await sendEvent?.({
        type: 'test_error',
        testCaseId,
        timestamp: completedAt,
        data: { error: error || 'Unknown provider error', result: testResult },
      });
    } else {
      await sendEvent?.({
        type: 'test_complete',
        testCaseId,
        timestamp: completedAt,
        data: { result: testResult },
      });
    }

    return testResult;
  } catch (error) {
    const completedAt = Date.now();
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorDuration = completedAt - startTime;

    let errorReason: string | undefined;
    try {
      errorReason = await generateTestResultSummary(
        {
          title: testCase.title,
          description: testCase.description,
          expectedOutcome: testCase.expectedOutcome,
        },
        {
          status: 'error',
          steps: ['Browser provider encountered an error'],
          error: errorMessage,
          duration: errorDuration,
        },
        websiteUrl,
        aiModel
      );
    } catch {
      errorReason = errorMessage;
    }

    const testResult: TestResult = {
      id: generateId(),
      testCaseId,
      resolvedUserAccountId,
      status: 'error',
      startedAt: startTime,
      completedAt,
      duration: errorDuration,
      error: errorMessage,
      reason: errorReason,
    };

    await sendEvent?.({
      type: 'test_error',
      testCaseId,
      timestamp: completedAt,
      data: { error: errorMessage, result: testResult },
    });

    return testResult;
  }
}

/**
 * Execute a batch of test cases with account-aware scheduling and parallelism.
 * This is the shared orchestrator used by both the SSE route and headless automation.
 */
export async function executeTestBatch(input: ExecuteTestBatchInput): Promise<ExecuteTestBatchResult> {
  const {
    testCases,
    websiteUrl,
    aiModel,
    settings: rawSettings,
    parallelLimit: rawParallelLimit,
    persistedState,
    providerKeys,
    signal,
    onEvent,
  } = input;

  const settings = normalizeSettings({
    ...rawSettings,
    providerApiKeys: {
      hyperbrowser: providerKeys.hyperbrowser || undefined,
      browserUseCloud: providerKeys.browserUseCloud || undefined,
    },
  });

  const parallelLimit = Math.max(1, Math.min(250, Math.floor(Number(rawParallelLimit) || 3)));
  const startTime = Date.now();

  const accountMap = buildAccountMapFromTeamState(testCases, persistedState, settings);

  const lockedAccountsByRun = new Set<string>();
  const allAccountIds = Array.from(accountMap.keys());
  const preferredAnyAccountIds = allAccountIds.filter((accountId) =>
    Boolean(accountMap.get(accountId)?.profileId)
  );
  let preferredRoundRobinIndex = 0;
  let fallbackRoundRobinIndex = 0;
  const results: TestResult[] = [];
  const pending = [...testCases];
  let running = 0;
  let waitTimer: ReturnType<typeof setTimeout> | null = null;

  function hasUnlockedAccount(accountIds: string[]): boolean {
    return accountIds.some((accountId) => !isAccountInUse(accountId));
  }

  function pickFromPool(
    accountIds: string[],
    pool: 'preferred' | 'fallback'
  ): string | undefined {
    if (accountIds.length === 0) return undefined;
    const startIndex = pool === 'preferred' ? preferredRoundRobinIndex : fallbackRoundRobinIndex;

    for (let i = 0; i < accountIds.length; i++) {
      const idx = (startIndex + i) % accountIds.length;
      const accountId = accountIds[idx];
      if (isAccountInUse(accountId)) continue;

      if (pool === 'preferred') {
        preferredRoundRobinIndex = (idx + 1) % accountIds.length;
      } else {
        fallbackRoundRobinIndex = (idx + 1) % accountIds.length;
      }

      return accountId;
    }

    return undefined;
  }

  function hasFreeAnyAccount(): boolean {
    if (preferredAnyAccountIds.length > 0 && hasUnlockedAccount(preferredAnyAccountIds)) return true;
    return hasUnlockedAccount(allAccountIds);
  }

  function pickFreeAccount(): string | undefined {
    const preferred = pickFromPool(preferredAnyAccountIds, 'preferred');
    if (preferred) return preferred;
    return pickFromPool(allAccountIds, 'fallback');
  }

  function releaseRunLocks() {
    for (const accountId of lockedAccountsByRun) {
      releaseAccount(accountId);
    }
    lockedAccountsByRun.clear();
  }

  function scheduleRetry(trySchedule: () => void) {
    if (waitTimer) return;
    waitTimer = setTimeout(() => {
      waitTimer = null;
      trySchedule();
    }, 350);
  }

  function clearRetry() {
    if (!waitTimer) return;
    clearTimeout(waitTimer);
    waitTimer = null;
  }

  async function recordAccountError(
    testCase: TestCase,
    reason: string,
    resolvedUserAccountId?: string
  ) {
    const errorResult: TestResult = {
      id: generateId(),
      testCaseId: testCase.id,
      resolvedUserAccountId,
      status: 'error',
      startedAt: Date.now(),
      completedAt: Date.now(),
      error: reason,
      reason,
    };

    results.push(errorResult);
    await onEvent?.({
      type: 'test_error',
      testCaseId: testCase.id,
      timestamp: Date.now(),
      data: {
        error: reason,
        resolvedUserAccountId,
        result: errorResult,
      },
    });
  }

  try {
    await new Promise<void>((resolve) => {
      let isResolved = false;

      const finalize = () => {
        if (isResolved) return;
        isResolved = true;
        clearRetry();
        resolve();
      };

      function trySchedule() {
        if (isResolved) return;
        clearRetry();
        if (signal?.aborted && running === 0) {
          finalize();
          return;
        }

        while (running < parallelLimit && pending.length > 0) {
          const idx = pending.findIndex((tc) => {
            const requestedAccountId = normalizeRequestedAccountId(tc.userAccountId);
            if (!requestedAccountId) return true;
            if (requestedAccountId === '__any__') return hasFreeAnyAccount();
            if (!accountMap.has(requestedAccountId)) return true;
            return !isAccountInUse(requestedAccountId);
          });
          if (idx === -1) break;

          const testCase = pending.splice(idx, 1)[0];

          const requestedAccountId = normalizeRequestedAccountId(testCase.userAccountId);
          let resolvedAccountId = requestedAccountId;
          if (requestedAccountId === '__any__') {
            resolvedAccountId = pickFreeAccount();
            if (!resolvedAccountId) {
              pending.push(testCase);
              continue;
            }
          }

          const credentials = resolvedAccountId ? accountMap.get(resolvedAccountId) : undefined;
          if (resolvedAccountId && !credentials) {
            void recordAccountError(
              testCase,
              `Assigned account '${resolvedAccountId}' was not found in shared team state.`,
              resolvedAccountId
            );
            continue;
          }

          if (resolvedAccountId && !tryAcquireAccount(resolvedAccountId)) {
            pending.push(testCase);
            continue;
          }

          if (resolvedAccountId) {
            lockedAccountsByRun.add(resolvedAccountId);
          }
          running++;

          const lockedId = resolvedAccountId;
          executeTestCase(
            testCase,
            websiteUrl,
            aiModel,
            settings,
            onEvent,
            credentials,
            signal,
            resolvedAccountId
          )
            .then((result) => {
              results.push(result);
            })
            .catch((err) => {
              results.push({
                id: generateId(),
                testCaseId: testCase.id,
                resolvedUserAccountId: lockedId,
                status: 'error',
                startedAt: Date.now(),
                error: err instanceof Error ? err.message : 'Unknown error',
              });
            })
            .finally(() => {
              if (lockedId) {
                releaseAccount(lockedId);
                lockedAccountsByRun.delete(lockedId);
              }
              running--;
              if (pending.length === 0 && running === 0) finalize();
              else trySchedule();
            });
        }

        if (running === 0 && pending.length > 0) {
          for (let i = pending.length - 1; i >= 0; i--) {
            const pendingTest = pending[i];
            const requestedAccountId = normalizeRequestedAccountId(pendingTest.userAccountId);

            if (!requestedAccountId) continue;
            if (requestedAccountId === '__any__' && allAccountIds.length === 0) {
              pending.splice(i, 1);
              void recordAccountError(
                pendingTest,
                'No available user accounts were eligible for this provider.'
              );
              continue;
            }
            if (requestedAccountId !== '__any__' && !accountMap.has(requestedAccountId)) {
              pending.splice(i, 1);
              void recordAccountError(
                pendingTest,
                `Assigned account '${requestedAccountId}' was not found in shared team state.`,
                requestedAccountId
              );
              continue;
            }
          }

          if (pending.length === 0) {
            finalize();
            return;
          }

          if (signal?.aborted) {
            finalize();
            return;
          }

          scheduleRetry(trySchedule);
          return;
        }

        if (running === 0 && pending.length === 0) finalize();
      }
      trySchedule();
    });
  } finally {
    releaseRunLocks();
  }

  const passed = results.filter((r) => r.status === 'passed').length;
  const failed = results.filter((r) => r.status === 'failed' || r.status === 'error').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const duration = Date.now() - startTime;

  await onEvent?.({
    type: 'all_complete',
    timestamp: Date.now(),
    summary: { total: results.length, passed, failed, skipped, duration },
  });

  return { results, passed, failed, skipped, duration };
}
