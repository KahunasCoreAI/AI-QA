import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { handleRouteError } from '@/lib/server/route-utils';
import { requireTeamContext } from '@/lib/server/team-context';
import { getTeamProviderKeys } from '@/lib/server/team-state-store';
import { checkTaskStatus } from '@/lib/browser/providers/browser-use-cloud';

interface TaskStatusRequest {
  tasks: Array<{
    testCaseId: string;
    taskId: string;
    sessionId: string;
    resolvedUserAccountId?: string;
  }>;
}

interface TaskStatusResponseItem {
  testCaseId: string;
  taskId: string;
  resolvedUserAccountId?: string;
  status: 'running' | 'finished' | 'stopped' | 'error';
  result?: {
    verdict: { success: boolean; reason: string; extractedData?: Record<string, unknown> } | null;
    recordingUrl?: string;
  };
  error?: string;
}

export async function POST(request: NextRequest) {
  let teamContext: Awaited<ReturnType<typeof requireTeamContext>>;
  try {
    teamContext = await requireTeamContext();
    enforceRateLimit(`execute-tests-status:${teamContext.userId}`, { limit: 60, windowMs: 60_000 });
  } catch (error) {
    return handleRouteError(error, 'Failed to authorize status request');
  }

  try {
    const body: TaskStatusRequest = await request.json();

    if (!body.tasks || !Array.isArray(body.tasks) || body.tasks.length === 0) {
      return NextResponse.json({ error: 'tasks array is required and must not be empty' }, { status: 400 });
    }

    if (body.tasks.length > 50) {
      return NextResponse.json({ error: 'Maximum 50 tasks per request' }, { status: 400 });
    }

    const providerKeys = await getTeamProviderKeys(teamContext.teamId);
    const apiKey = providerKeys.browserUseCloud || process.env.BROWSER_USE_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'BrowserUse Cloud API key is not configured.' },
        { status: 400 }
      );
    }

    const settled = await Promise.allSettled(
      body.tasks.map(async (task): Promise<TaskStatusResponseItem> => {
        const result = await checkTaskStatus(apiKey, task.taskId, task.sessionId);
        return {
          testCaseId: task.testCaseId,
          taskId: task.taskId,
          resolvedUserAccountId: task.resolvedUserAccountId,
          status: result.status,
          result:
            result.status !== 'running'
              ? { verdict: result.verdict, recordingUrl: result.recordingUrl }
              : undefined,
        };
      })
    );

    const results: TaskStatusResponseItem[] = settled.map((outcome, idx) => {
      if (outcome.status === 'fulfilled') return outcome.value;
      return {
        testCaseId: body.tasks[idx].testCaseId,
        taskId: body.tasks[idx].taskId,
        resolvedUserAccountId: body.tasks[idx].resolvedUserAccountId,
        status: 'error' as const,
        error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
      };
    });

    return NextResponse.json({ results });
  } catch (error) {
    return handleRouteError(error, 'Failed to check task status');
  }
}
