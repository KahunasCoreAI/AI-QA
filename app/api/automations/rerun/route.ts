import { NextRequest, NextResponse, after } from 'next/server';
import { handleRouteError } from '@/lib/server/route-utils';
import { requireTeamContext } from '@/lib/server/team-context';
import { getOrCreateTeamState, getTeamProviderKeys, saveTeamState } from '@/lib/server/team-state-store';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { executeTestBatch } from '@/lib/server/execute-tests';
import { generateId } from '@/lib/utils';
import type { AutomationRun, TestRun } from '@/types';

export const maxDuration = 300;

const DEFAULT_AI_MODEL = process.env.NEXT_PUBLIC_DEFAULT_AI_MODEL || 'openai/gpt-5.2';

export async function POST(request: NextRequest) {
  let teamContext: Awaited<ReturnType<typeof requireTeamContext>>;
  try {
    teamContext = await requireTeamContext();
    enforceRateLimit(`automation-rerun:${teamContext.userId}`, { limit: 10, windowMs: 60_000 });
  } catch (error) {
    return handleRouteError(error, 'Failed to authorize rerun request');
  }

  const body = await request.json();
  const { automationRunId, projectId } = body;

  if (!automationRunId || !projectId) {
    return NextResponse.json({ error: 'automationRunId and projectId are required' }, { status: 400 });
  }

  const state = await getOrCreateTeamState(teamContext.teamId);

  // Find the original automation run
  const automationRuns = state.automationRuns?.[projectId] || [];
  const originalRun = automationRuns.find((r) => r.id === automationRunId);
  if (!originalRun) {
    return NextResponse.json({ error: 'Automation run not found' }, { status: 404 });
  }

  // Gather test cases
  const allTestCaseIds = [...originalRun.generatedTestCaseIds, ...originalRun.selectedTestCaseIds];
  const projectTestCases = state.testCases[projectId] || [];
  const testsToRun = projectTestCases.filter((tc) => allTestCaseIds.includes(tc.id));

  if (testsToRun.length === 0) {
    return NextResponse.json({ error: 'No test cases found for rerun' }, { status: 400 });
  }

  // Create new automation run
  const newAutoRunId = generateId();
  const newTestRunId = generateId();

  const newAutoRun: AutomationRun = {
    id: newAutoRunId,
    projectId,
    prNumber: originalRun.prNumber,
    prTitle: originalRun.prTitle,
    prUrl: originalRun.prUrl,
    prAuthor: originalRun.prAuthor,
    baseBranch: originalRun.baseBranch,
    headBranch: originalRun.headBranch,
    deliveryId: `rerun-${newAutoRunId}`,
    selectedTestCaseIds: originalRun.selectedTestCaseIds,
    generatedTestCaseIds: originalRun.generatedTestCaseIds,
    totalTests: testsToRun.length,
    testRunId: newTestRunId,
    status: 'running',
    createdAt: Date.now(),
    startedAt: Date.now(),
    passed: 0,
    failed: 0,
    skipped: 0,
    selectionReason: originalRun.selectionReason
      ? `Rerun of PR #${originalRun.prNumber}. ${originalRun.selectionReason}`
      : undefined,
  };

  const newTestRun: TestRun = {
    id: newTestRunId,
    projectId,
    startedAt: Date.now(),
    status: 'running',
    testCaseIds: testsToRun.map((tc) => tc.id),
    parallelLimit: state.settings.parallelLimit,
    totalTests: testsToRun.length,
    passed: 0,
    failed: 0,
    skipped: 0,
    results: [],
  };

  // Save new runs to state
  const existingAutoRuns = state.automationRuns?.[projectId] || [];
  const existingTestRuns = state.testRuns[projectId] || [];
  const updatedState = {
    ...state,
    automationRuns: {
      ...(state.automationRuns || {}),
      [projectId]: [newAutoRun, ...existingAutoRuns].slice(0, 50),
    },
    testRuns: {
      ...state.testRuns,
      [projectId]: [newTestRun, ...existingTestRuns].slice(0, 50),
    },
    lastUpdated: Date.now(),
  };

  await saveTeamState(teamContext.teamId, null, updatedState);

  // Execute in background using after()
  after(async () => {
    try {
      const providerKeys = await getTeamProviderKeys(teamContext.teamId);
      const project = updatedState.projects.find((p) => p.id === projectId);
      const websiteUrl = project?.websiteUrl || '';

      const batchResult = await executeTestBatch({
        testCases: testsToRun,
        websiteUrl,
        aiModel: DEFAULT_AI_MODEL,
        settings: updatedState.settings,
        parallelLimit: updatedState.settings.parallelLimit,
        persistedState: updatedState,
        providerKeys: {
          hyperbrowser: providerKeys.hyperbrowser || undefined,
          browserUseCloud: providerKeys.browserUseCloud || undefined,
        },
      });

      // Update state with results
      const freshState = await getOrCreateTeamState(teamContext.teamId);
      const autoRuns = freshState.automationRuns?.[projectId] || [];
      const testRuns = freshState.testRuns[projectId] || [];

      const finalState = {
        ...freshState,
        automationRuns: {
          ...(freshState.automationRuns || {}),
          [projectId]: autoRuns.map((r) =>
            r.id === newAutoRunId
              ? { ...r, status: 'completed' as const, completedAt: Date.now(), passed: batchResult.passed, failed: batchResult.failed, skipped: batchResult.skipped }
              : r
          ),
        },
        testRuns: {
          ...freshState.testRuns,
          [projectId]: testRuns.map((r) =>
            r.id === newTestRunId
              ? { ...r, status: 'completed' as const, completedAt: Date.now(), results: batchResult.results, passed: batchResult.passed, failed: batchResult.failed, skipped: batchResult.skipped }
              : r
          ),
        },
        lastUpdated: Date.now(),
      };

      await saveTeamState(teamContext.teamId, null, finalState);
    } catch (error) {
      console.error('[automation:rerun] Execution failed:', error);

      const freshState = await getOrCreateTeamState(teamContext.teamId);
      const autoRuns = freshState.automationRuns?.[projectId] || [];
      const testRuns = freshState.testRuns[projectId] || [];

      const failedState = {
        ...freshState,
        automationRuns: {
          ...(freshState.automationRuns || {}),
          [projectId]: autoRuns.map((r) =>
            r.id === newAutoRunId
              ? { ...r, status: 'failed' as const, completedAt: Date.now(), error: error instanceof Error ? error.message : 'Unknown error' }
              : r
          ),
        },
        testRuns: {
          ...freshState.testRuns,
          [projectId]: testRuns.map((r) =>
            r.id === newTestRunId ? { ...r, status: 'failed' as const, completedAt: Date.now() } : r
          ),
        },
        lastUpdated: Date.now(),
      };

      await saveTeamState(teamContext.teamId, null, failedState);
    }
  });

  return NextResponse.json(
    {
      automationRunId: newAutoRunId,
      testRunId: newTestRunId,
      message: 'Rerun started',
    },
    { status: 202 }
  );
}
