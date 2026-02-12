import { NextRequest } from 'next/server';
import { generateTestResultSummary } from '@/lib/ai-client';
import type { QAState, TestCase, TestResult, TestEvent, QASettings } from '@/types';
import { generateId } from '@/lib/utils';
import { DEFAULT_BROWSER_PROVIDER, getBrowserProvider } from '@/lib/browser/providers';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { handleRouteError } from '@/lib/server/route-utils';
import { requireTeamContext } from '@/lib/server/team-context';
import { getOrCreateTeamState, getTeamProviderKeys } from '@/lib/server/team-state-store';
import { registerRun, unregisterRun } from '@/lib/server/active-runs';

interface ExecuteTestsRequest {
  runId?: string;
  testCases: TestCase[];
  websiteUrl: string;
  parallelLimit?: number;
  aiModel: string;
  settings?: Partial<QASettings>;
}

interface ExecutionCredentials {
  email: string;
  password: string;
  profileId?: string;
  metadata?: Record<string, string>;
}

function normalizeSettings(settings?: Partial<QASettings>): Partial<QASettings> {
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

export async function POST(request: NextRequest) {
  let teamContext: Awaited<ReturnType<typeof requireTeamContext>>;
  try {
    teamContext = await requireTeamContext();
    enforceRateLimit(`execute-tests:${teamContext.userId}`, { limit: 20, windowMs: 60_000 });
  } catch (error) {
    return handleRouteError(error, 'Failed to authorize execution request');
  }
  const activeTeam = teamContext;

  const encoder = new TextEncoder();

  // Create a TransformStream for SSE
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  let isClosed = false;

  const sendEvent = async (
    event:
      | TestEvent
      | {
          type: 'all_complete';
          timestamp: number;
          summary: { total: number; passed: number; failed: number; skipped: number; duration: number };
        }
  ) => {
    if (isClosed) return;
    try {
      await writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    } catch {
      isClosed = true;
    }
  };

  const closeWriter = async () => {
    if (isClosed) return;
    try {
      isClosed = true;
      await writer.close();
    } catch {
      // Already closed
    }
  };

  // Start processing in the background
  (async () => {
    let runId: string | undefined;
    try {
      const body: ExecuteTestsRequest = await request.json();
      const { testCases, websiteUrl, aiModel, settings: rawSettings } = body;
      runId = body.runId;

      // Register this run for server-side abort tracking
      let runAbortController: AbortController | undefined;
      if (runId) {
        runAbortController = registerRun(runId);
        // Forward client disconnect to the run abort controller
        request.signal.addEventListener('abort', () => {
          runAbortController?.abort();
        }, { once: true });
      }
      const runSignal = runAbortController?.signal;

      const persistedState = await getOrCreateTeamState(activeTeam.teamId);
      const providerKeys = await getTeamProviderKeys(activeTeam.teamId);
      const settings = normalizeSettings({
        ...rawSettings,
        providerApiKeys: {
          hyperbrowser: providerKeys.hyperbrowser || undefined,
          browserUseCloud: providerKeys.browserUseCloud || undefined,
        },
      });

      // Validate and sanitize parallelLimit to prevent infinite loops
      const parallelLimit = Math.max(1, Math.min(250, Math.floor(Number(body.parallelLimit) || 3)));

      if (!testCases || testCases.length === 0) {
        await sendEvent({
          type: 'test_error',
          testCaseId: 'system',
          timestamp: Date.now(),
          data: { error: 'No test cases provided' },
        });
        await closeWriter();
        return;
      }

      if (!websiteUrl) {
        await sendEvent({
          type: 'test_error',
          testCaseId: 'system',
          timestamp: Date.now(),
          data: { error: 'No website URL provided' },
        });
        await closeWriter();
        return;
      }

      if (!aiModel) {
        await sendEvent({
          type: 'test_error',
          testCaseId: 'system',
          timestamp: Date.now(),
          data: { error: 'No AI model specified' },
        });
        await closeWriter();
        return;
      }

      const startTime = Date.now();

      // Build account lookup from server-side team state only.
      const accountMap = buildAccountMapFromTeamState(testCases, persistedState, settings);

      // Account-aware scheduler with round-robin for "__any__" assignments
      const lockedAccounts = new Set<string>();
      const allAccountIds = Array.from(accountMap.keys());
      const preferredAnyAccountIds = allAccountIds.filter((accountId) =>
        Boolean(accountMap.get(accountId)?.profileId)
      );
      let preferredRoundRobinIndex = 0;
      let fallbackRoundRobinIndex = 0;
      const results: TestResult[] = [];
      const pending = [...testCases];
      let running = 0;

      function hasUnlockedAccount(accountIds: string[]): boolean {
        return accountIds.some((accountId) => !lockedAccounts.has(accountId));
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
          if (lockedAccounts.has(accountId)) continue;

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

      // Resolve "__any__" to the next free account.
      // Prefer accounts with reusable provider profiles (persisted sessions),
      // then fall back to any unlocked account.
      function pickFreeAccount(): string | undefined {
        const preferred = pickFromPool(preferredAnyAccountIds, 'preferred');
        if (preferred) return preferred;
        return pickFromPool(allAccountIds, 'fallback');
      }

      await new Promise<void>((resolve) => {
        function trySchedule() {
          while (running < parallelLimit && pending.length > 0) {
            const idx = pending.findIndex((tc) => {
              if (!tc.userAccountId) return true;
              if (tc.userAccountId === '__any__') return hasFreeAnyAccount();
              return !lockedAccounts.has(tc.userAccountId);
            });
            if (idx === -1) break; // all remaining need locked accounts

            const testCase = pending.splice(idx, 1)[0];

            // Resolve the actual account ID to use
            let resolvedAccountId = testCase.userAccountId;
            if (resolvedAccountId === '__any__') {
              resolvedAccountId = pickFreeAccount();
            }

            const credentials = resolvedAccountId ? accountMap.get(resolvedAccountId) : undefined;

            if (resolvedAccountId && !credentials) {
              const missingAccountResult: TestResult = {
                id: generateId(),
                testCaseId: testCase.id,
                status: 'error',
                startedAt: Date.now(),
                completedAt: Date.now(),
                error: `Assigned account '${resolvedAccountId}' was not found in shared team state.`,
                reason: 'Assigned account was missing.',
              };

              void sendEvent({
                type: 'test_error',
                testCaseId: testCase.id,
                timestamp: Date.now(),
                data: {
                  error: missingAccountResult.error,
                  result: missingAccountResult,
                },
              });
              results.push(missingAccountResult);
              continue;
            }

            if (resolvedAccountId) lockedAccounts.add(resolvedAccountId);
            running++;

            // Capture resolvedAccountId in closure for unlock
            const lockedId = resolvedAccountId;
            executeTestCase(testCase, websiteUrl, aiModel, settings, sendEvent, credentials, runSignal)
              .then((result) => {
                results.push(result);
              })
              .catch((err) => {
                results.push({
                  id: generateId(),
                  testCaseId: testCase.id,
                  status: 'error',
                  startedAt: Date.now(),
                  error: err instanceof Error ? err.message : 'Unknown error',
                });
              })
              .finally(() => {
                if (lockedId) lockedAccounts.delete(lockedId);
                running--;
                if (pending.length === 0 && running === 0) resolve();
                else trySchedule();
              });
          }

          if (running === 0 && pending.length > 0) {
            const unscheduled = pending.splice(0, pending.length);
            for (const pendingTest of unscheduled) {
              const reason =
                pendingTest.userAccountId === '__any__'
                  ? 'No available user accounts were eligible for this provider.'
                  : 'No available account could be allocated for this test.';

              const unscheduledResult: TestResult = {
                id: generateId(),
                testCaseId: pendingTest.id,
                status: 'error',
                startedAt: Date.now(),
                completedAt: Date.now(),
                error: reason,
                reason,
              };

              results.push(unscheduledResult);
              void sendEvent({
                type: 'test_error',
                testCaseId: pendingTest.id,
                timestamp: Date.now(),
                data: {
                  error: reason,
                  result: unscheduledResult,
                },
              });
            }
            resolve();
            return;
          }

          if (running === 0 && pending.length === 0) resolve();
        }
        trySchedule();
      });

      // Calculate summary
      const passed = results.filter((r) => r.status === 'passed').length;
      const failed = results.filter((r) => r.status === 'failed' || r.status === 'error').length;
      const skipped = results.filter((r) => r.status === 'skipped').length;

      await sendEvent({
        type: 'all_complete',
        timestamp: Date.now(),
        summary: {
          total: results.length,
          passed,
          failed,
          skipped,
          duration: Date.now() - startTime,
        },
      });
    } catch (error) {
      console.error('Error in execute-tests API:', error);
      await sendEvent({
        type: 'test_error',
        testCaseId: 'system',
        timestamp: Date.now(),
        data: { error: error instanceof Error ? error.message : 'Unknown error' },
      });
    } finally {
      if (runId) unregisterRun(runId);
      await closeWriter();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

function buildAccountMapFromTeamState(
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

async function executeTestCase(
  testCase: TestCase,
  websiteUrl: string,
  aiModel: string,
  settings: Partial<QASettings>,
  sendEvent?: (event: TestEvent) => Promise<void>,
  credentials?: ExecutionCredentials,
  signal?: AbortSignal,
): Promise<TestResult> {
  const testCaseId = testCase.id;
  const startTime = Date.now();

  // Send test start event
  await sendEvent?.({
    type: 'test_start',
    testCaseId,
    timestamp: startTime,
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
            data: { taskId, sessionId },
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

    // Generate detailed AI summary if reason is missing
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

function buildGoalFromTestCase(
  testCase: TestCase,
  credentials?: ExecutionCredentials
): string {
  let goal = '';

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
