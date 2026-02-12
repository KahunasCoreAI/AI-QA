import { NextRequest, NextResponse } from 'next/server';
import { generateBugReport } from '@/lib/ai-client';
import type { BugReport, TestCase, TestResult } from '@/types';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { createIssueInLinear, getTeamBacklogStateId, LinearApiError } from '@/lib/server/linear-client';
import { handleRouteError } from '@/lib/server/route-utils';
import { requireTeamContext } from '@/lib/server/team-context';
import { getUserLinearConfig } from '@/lib/server/user-secrets-store';

interface CreateLinearIssueRequest {
  failedTest: TestResult;
  testCase: TestCase;
  projectUrl: string;
  aiModel: string;
}

function sanitizePII(text: string | undefined): string {
  if (!text) return '';
  return text
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL_REDACTED]')
    .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE_REDACTED]')
    .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CARD_REDACTED]');
}

function getProjectHost(projectUrl: string): string {
  try {
    return new URL(projectUrl).host;
  } catch {
    return projectUrl;
  }
}

const LINEAR_PRIORITY_HIGH = 2;

function buildFallbackBugReport(testCase: TestCase, failedTest: TestResult): BugReport {
  return {
    title: `Bug: ${testCase.title}`,
    severity: 'high',
    description: `Test failed while validating: ${testCase.description}`,
    stepsToReproduce: [
      'Navigate to the project URL.',
      'Execute the referenced automated test case.',
      'Observe the failure outcome captured by the run.',
    ],
    expectedBehavior: testCase.expectedOutcome || 'Test should pass.',
    actualBehavior: failedTest.error || failedTest.reason || 'Test failed with no explicit reason.',
    additionalNotes: failedTest.reason,
  };
}

function buildLinearDescription(input: {
  testCase: TestCase;
  failedTest: TestResult;
  bugReport: BugReport;
  projectUrl: string;
}): string {
  const { testCase, failedTest, bugReport, projectUrl } = input;

  const runStarted = failedTest.startedAt ? new Date(failedTest.startedAt).toISOString() : undefined;
  const runCompleted = failedTest.completedAt ? new Date(failedTest.completedAt).toISOString() : undefined;

  const sections = [
    `## QA Failure Summary\n${bugReport.description}`,
    `## Test Case\n- **Title:** ${testCase.title}\n- **Description:** ${testCase.description}\n- **Expected Outcome:** ${testCase.expectedOutcome || 'Not specified'}`,
    `## Actual Behavior\n${bugReport.actualBehavior}`,
    `## Steps to Reproduce\n${bugReport.stepsToReproduce.map((step, index) => `${index + 1}. ${step}`).join('\n')}`,
    `## Execution Context\n- **Project URL:** ${projectUrl}\n- **Result ID:** ${failedTest.id}\n- **Started:** ${runStarted || 'Unknown'}\n- **Completed:** ${runCompleted || 'Unknown'}\n- **Duration:** ${failedTest.duration ? `${failedTest.duration} ms` : 'Unknown'}`,
  ];

  if (failedTest.error) {
    sections.push(`## Error\n${failedTest.error}`);
  }

  if (failedTest.reason) {
    sections.push(`## AI Summary\n${failedTest.reason}`);
  }

  if (failedTest.recordingUrl) {
    sections.push(`## Recording\n${failedTest.recordingUrl}`);
  }

  if (bugReport.additionalNotes) {
    sections.push(`## Additional Notes\n${bugReport.additionalNotes}`);
  }

  return sections.join('\n\n');
}

export async function POST(request: NextRequest) {
  try {
    const team = await requireTeamContext();
    enforceRateLimit(`linear:create-issue:${team.userId}`, { limit: 30, windowMs: 60_000 });

    const body: CreateLinearIssueRequest = await request.json();
    const { failedTest, testCase, projectUrl, aiModel } = body;

    if (!failedTest || !testCase || !projectUrl) {
      return NextResponse.json(
        { error: 'failedTest, testCase, and projectUrl are required' },
        { status: 400 }
      );
    }

    if (failedTest.status !== 'failed' && failedTest.status !== 'error') {
      return NextResponse.json(
        { error: 'Linear issue can only be created from failed or error results.' },
        { status: 400 }
      );
    }

    const linearConfig = await getUserLinearConfig(team.userId);
    if (!linearConfig.apiKey) {
      return NextResponse.json(
        { error: 'Configure your Linear API key in Settings before creating issues.' },
        { status: 400 }
      );
    }

    if (!linearConfig.defaultTeamId) {
      return NextResponse.json(
        { error: 'Choose a default Linear team in Settings before creating issues.' },
        { status: 400 }
      );
    }

    let bugReport: BugReport;
    try {
      if (!aiModel || !process.env.OPENROUTER_API_KEY) {
        bugReport = buildFallbackBugReport(testCase, failedTest);
      } else {
        bugReport = await generateBugReport(
          {
            title: testCase.title,
            description: sanitizePII(testCase.description),
            expectedOutcome: testCase.expectedOutcome,
          },
          {
            error: failedTest.error,
            extractedData: sanitizePII(JSON.stringify(failedTest.extractedData || {}))
              ? { summary: sanitizePII(JSON.stringify(failedTest.extractedData || {})) }
              : undefined,
          },
          projectUrl,
          aiModel
        );
      }
    } catch {
      bugReport = buildFallbackBugReport(testCase, failedTest);
    }

    const title = `[QA] ${testCase.title} (${getProjectHost(projectUrl)})`;
    const description = buildLinearDescription({
      testCase,
      failedTest,
      bugReport,
      projectUrl,
    });

    const backlogStateId = await getTeamBacklogStateId(linearConfig.apiKey, linearConfig.defaultTeamId);

    const issue = await createIssueInLinear(linearConfig.apiKey, {
      teamId: linearConfig.defaultTeamId,
      title,
      description,
      priority: LINEAR_PRIORITY_HIGH,
      stateId: backlogStateId,
    });

    return NextResponse.json({
      issueId: issue.id,
      issueIdentifier: issue.identifier,
      issueUrl: issue.url,
      title: issue.title,
      teamId: linearConfig.defaultTeamId,
      teamName: linearConfig.defaultTeamName,
    });
  } catch (error) {
    if (error instanceof LinearApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return handleRouteError(error, 'Failed to create Linear issue');
  }
}
