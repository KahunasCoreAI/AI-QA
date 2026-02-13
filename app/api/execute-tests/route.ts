import { NextRequest } from 'next/server';
import type { TestCase, TestEvent, QASettings, AllCompleteEvent } from '@/types';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { handleRouteError } from '@/lib/server/route-utils';
import { requireTeamContext } from '@/lib/server/team-context';
import { getOrCreateTeamState, getTeamProviderKeys } from '@/lib/server/team-state-store';
import { registerRun, unregisterRun } from '@/lib/server/active-runs';
import { executeTestBatch } from '@/lib/server/execute-tests';

interface ExecuteTestsRequest {
  runId?: string;
  testCases: TestCase[];
  websiteUrl: string;
  parallelLimit?: number;
  aiModel: string;
  settings?: Partial<QASettings>;
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

  const sendEvent = async (event: TestEvent | AllCompleteEvent) => {
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
        request.signal.addEventListener('abort', () => {
          runAbortController?.abort();
        }, { once: true });
      }
      const runSignal = runAbortController?.signal;

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

      const persistedState = await getOrCreateTeamState(activeTeam.teamId);
      const providerKeys = await getTeamProviderKeys(activeTeam.teamId);

      await executeTestBatch({
        testCases,
        websiteUrl,
        aiModel,
        settings: rawSettings || {},
        parallelLimit: body.parallelLimit || 3,
        persistedState,
        providerKeys: {
          hyperbrowser: providerKeys.hyperbrowser || undefined,
          browserUseCloud: providerKeys.browserUseCloud || undefined,
        },
        signal: runSignal,
        onEvent: sendEvent,
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
