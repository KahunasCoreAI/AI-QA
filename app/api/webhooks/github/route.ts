import { NextRequest, NextResponse, after } from 'next/server';
import crypto from 'crypto';
import { generateText } from 'ai';
import { handleRouteError } from '@/lib/server/route-utils';
import { saveTeamState, getOrCreateTeamState, getTeamProviderKeys } from '@/lib/server/team-state-store';
import type { QAState, GeneratedTestDraft, AiGenerationJob, TestCase, TestRun, AutomationRun } from '@/types';
import { generateId } from '@/lib/utils';
import { getModel } from '@/lib/ai-client';
import { z } from 'zod';
import { executeTestBatch } from '@/lib/server/execute-tests';

// Increase max duration for automation execution + delay window
export const maxDuration = 900;

// Environment variables
const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const SHARED_TEAM_ID = process.env.SHARED_TEAM_ID || 'team-default';
const DEFAULT_AI_MODEL = process.env.NEXT_PUBLIC_DEFAULT_AI_MODEL || 'openai/gpt-5.2';
const AUTOMATION_DELAY_MS = 10 * 60 * 1000;

// Zod schemas for webhook payload validation
export const githubPingEventSchema = z.object({
  hook: z.object({
    id: z.number(),
    url: z.string(),
    type: z.string(),
  }),
  zen: z.string().optional(),
});

export const pullRequestSchema = z.object({
  action: z.string(),
  number: z.number(),
  pull_request: z.object({
    id: z.number(),
    number: z.number(),
    title: z.string(),
    body: z.string().nullable(),
    state: z.string(),
    merged: z.boolean().nullable(),
    merged_at: z.string().nullable(),
    base: z.object({
      repo: z.object({
        id: z.number(),
        name: z.string(),
        full_name: z.string(),
        html_url: z.string(),
        description: z.string().nullable(),
        owner: z.object({
          login: z.string(),
          id: z.number(),
        }),
      }),
      ref: z.string(),
      sha: z.string(),
    }),
    head: z.object({
      ref: z.string(),
      sha: z.string(),
      repo: z.object({
        id: z.number(),
        name: z.string(),
        full_name: z.string(),
        html_url: z.string(),
        description: z.string().nullable(),
      }).nullable(),
    }),
    user: z.object({
      login: z.string(),
      id: z.number(),
    }),
    merged_by: z.object({
      login: z.string(),
      id: z.number(),
    }).nullable(),
    diff_url: z.string(),
    html_url: z.string(),
  }),
  repository: z.object({
    id: z.number(),
    name: z.string(),
    full_name: z.string(),
    html_url: z.string(),
    description: z.string().nullable(),
    owner: z.object({
      login: z.string(),
      id: z.number(),
    }),
  }),
  sender: z.object({
    login: z.string(),
    id: z.number(),
  }),
});

export type GitHubPullRequestEvent = z.infer<typeof pullRequestSchema>;
export type GitHubPingEvent = z.infer<typeof githubPingEventSchema>;

// Verify GitHub webhook signature using HMAC SHA-256
function verifyGitHubSignature(payload: string, signatureHeader: string | null): boolean {
  if (!GITHUB_WEBHOOK_SECRET) {
    console.error('GITHUB_WEBHOOK_SECRET is not configured');
    return false;
  }

  if (!signatureHeader) {
    return false;
  }

  const signature = signatureHeader.replace(/^sha256=/, '');
  const hmac = crypto.createHmac('sha256', GITHUB_WEBHOOK_SECRET);
  const digest = hmac.update(payload).digest('hex');

  if (signature.length !== 64 || digest.length !== 64) {
    return false;
  }

  const sigBuf = Buffer.from(signature, 'utf8');
  const digBuf = Buffer.from(digest, 'utf8');

  try {
    return crypto.timingSafeEqual(sigBuf, digBuf);
  } catch {
    return false;
  }
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

// Fetch changed files from a pull request using GitHub API
async function fetchPRFiles(owner: string, repo: string, pullNumber: number): Promise<{
  files: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
    patch: string | null;
    raw_url: string;
    contents_url: string;
  }>;
  totalCount: number;
}> {
  if (!GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN is not configured');
  }

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/files?per_page=100`,
    {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'QA-Testing-Dashboard',
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API error: ${response.status} ${errorText}`);
  }

  const files = await response.json();
  const linkHeader = response.headers.get('Link');
  let totalCount = files.length;

  if (linkHeader) {
    const match = linkHeader.match(/per_page=\d+>&page=(\d+)>; rel="last"/);
    if (match) {
      totalCount = parseInt(match[1], 10) * files.length;
    }
  }

  return { files, totalCount };
}

// Extract frontend file changes from PR
function extractFrontendChanges(files: Array<{ filename: string; status: string; patch: string | null }>): {
  frontendFiles: string[];
  changedComponents: string[];
  domains: string[];
} {
  const frontendExtensions = ['.tsx', '.jsx', '.ts', '.js', '.css', '.scss', '.less'];
  const componentPatterns = ['/components/', '/ui/', '/pages/', '/app/', '/views/'];

  const frontendFiles: string[] = [];
  const changedComponents: string[] = [];
  const domains: string[] = [];

  for (const file of files) {
    const ext = file.filename.substring(file.filename.lastIndexOf('.'));
    const isFrontend = frontendExtensions.includes(ext.toLowerCase());

    if (isFrontend) {
      frontendFiles.push(file.filename);

      for (const pattern of componentPatterns) {
        if (file.filename.includes(pattern)) {
          const parts = file.filename.split(pattern);
          if (parts.length > 1) {
            const componentName = parts[1].split('/')[0].replace(/\.(tsx|jsx|ts|js)$/, '');
            if (componentName && !changedComponents.includes(componentName)) {
              changedComponents.push(componentName);
            }
          }
        }
      }

      const lowerPath = file.filename.toLowerCase();
      for (const keyword of domainKeywords) {
        if (lowerPath.includes(keyword) && !domains.includes(keyword)) {
          domains.push(keyword);
        }
      }
    }
  }

  return {
    frontendFiles,
    changedComponents,
    domains,
  };
}

// Generate AI test suggestions for merged PR
async function generateTestSuggestionsForPR(
  pr: GitHubPullRequestEvent['pull_request'],
  frontendFiles: string[],
  changedComponents: string[],
  domains: string[]
): Promise<Array<{
  title: string;
  description: string;
  expectedOutcome: string;
  groupName: string;
}>> {
  const model = getModel(DEFAULT_AI_MODEL);

  const changedFilesList = frontendFiles.slice(0, 20).map((f) => `- ${f}`).join('\n');
  const componentsList = changedComponents.length > 0 ? changedComponents.join(', ') : 'general UI';
  const domainsList = domains.length > 0 ? domains.join(', ') : 'general functionality';

  const system = `You are a QA test generation agent for a web application testing platform.

Your job is to create UI test cases that will be executed by an AI browser agent against a live website. The browser agent navigates pages, clicks elements, fills forms, and verifies visual outcomes — exactly like a human tester.

CRITICAL: The "description" field IS the instruction the browser agent receives. It must be written as concrete, step-by-step browser actions the agent can follow. Do NOT write abstract descriptions, unit test assertions, or backend-focused checks.

GOOD description example:
"Navigate to the settings page. Click the 'Profile' tab. Change the display name to 'Test User'. Click 'Save'. Verify the success toast appears and the display name updates to 'Test User'."

BAD description example:
"Verify that the profile update function works correctly and saves data to the database."

RULES:
- Each test must be atomic — one clear workflow, testable in a single browser session
- The description must be step-by-step browser actions: navigate, click, type, select, scroll, verify
- Reference specific UI elements where possible (buttons, links, tabs, form fields) based on what the changed files suggest
- The expectedOutcome must be something visually observable in the browser (text appears, element is visible, page navigates, toast shows, etc.)
- Do NOT test internal/backend behavior that isn't visible in the UI
- Set groupName to a relevant domain from: ${domainKeywords.join(', ')} or "general"

Return strict JSON only:
{ "testCases": [{ "title": "...", "description": "...", "expectedOutcome": "...", "groupName": "..." }] }`;

  const prompt = `A pull request was merged. Generate UI test cases that validate the changes.

## Pull Request
PR #${pr.number}: ${pr.title}
Author: ${pr.merged_by?.login || pr.user.login}
Repository: ${pr.base.repo.full_name}
Description: ${(pr.body || 'No description').slice(0, 500)}

## Changed Files (${frontendFiles.length} frontend files)
${changedFilesList}

## Detected Areas
Components: ${componentsList}
Domains: ${domainsList}

## Instructions
Generate 3-5 test cases. For each one, think about what a user would actually do in the browser after this change:
1. Happy path — the primary workflow the PR enables or modifies
2. Validation / edge cases — incorrect inputs, empty states, boundary values
3. Error handling — what happens when something goes wrong (if the PR touches error flows)
4. Regression — adjacent features that could break from these changes

Each test description must be step-by-step browser actions the AI agent can execute.
Each expectedOutcome must describe what should be visually true in the browser after the steps.

Return JSON: { "testCases": [{ "title": "...", "description": "...", "expectedOutcome": "...", "groupName": "..." }] }`;

  try {
    const { text } = await generateText({ model, system, prompt });

    const jsonMatch = text.match(/[\[{][\s\S]*[\]}]/);
    if (!jsonMatch) {
      throw new Error('No JSON found in AI response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const testCasesSchema = z.object({
      testCases: z.array(z.object({
        title: z.string(),
        description: z.string(),
        expectedOutcome: z.string(),
        groupName: z.string(),
      })),
    });

    const validated = testCasesSchema.parse(parsed);
    return validated.testCases;
  } catch (error) {
    console.error('Failed to generate test suggestions:', error);
    return [{
      title: `Verify PR #${pr.number} changes`,
      description: `Test that the changes from PR "${pr.title}" work correctly`,
      expectedOutcome: 'All changes from the PR function as expected',
      groupName: domains[0] || 'general',
    }];
  }
}

const domainKeywords = [
  'auth', 'login', 'signup', 'register', 'dashboard', 'settings', 'profile',
  'billing', 'payment', 'checkout', 'cart', 'user', 'admin', 'home',
  'landing', 'pricing', 'contact', 'about', 'navigation', 'menu', 'sidebar',
  'header', 'footer', 'modal', 'form', 'input', 'button', 'link', 'table',
  'list', 'search', 'filter', 'sort', 'pagination', 'upload', 'download',
];

// AI test selection for automation - selects a mix of new + existing tests
async function selectTestsForAutomation(
  pr: GitHubPullRequestEvent['pull_request'],
  existingTestCases: TestCase[],
  newTestCaseIds: string[],
  testCount: number,
  changedFiles: string[],
  changedComponents: string[],
): Promise<{ selectedExistingIds: string[]; selectedNewIds: string[]; selectionReason: string }> {
  // Always include all new tests (generated from this PR)
  const selectedNewIds = [...newTestCaseIds];
  const remainingSlots = Math.max(0, testCount - selectedNewIds.length);

  if (remainingSlots === 0 || existingTestCases.length === 0) {
    const reason = selectedNewIds.length > 0
      ? `All ${selectedNewIds.length} test slot${selectedNewIds.length !== 1 ? 's' : ''} filled by newly generated tests for this PR.`
      : 'No existing tests available to select from.';
    return { selectedExistingIds: [], selectedNewIds: selectedNewIds.slice(0, testCount), selectionReason: reason };
  }

  // Use AI to select the most relevant existing tests
  const model = getModel(DEFAULT_AI_MODEL);
  const candidateTests = existingTestCases
    .filter((tc) => !newTestCaseIds.includes(tc.id));
  const testCatalogue = candidateTests
    .slice(0, 50)
    .map((tc) => `- [${tc.id}] ${tc.title}: ${tc.description.slice(0, 150)}`)
    .join('\n');

  if (!testCatalogue) {
    return { selectedExistingIds: [], selectedNewIds, selectionReason: 'No existing tests available to select from.' };
  }

  const changedFilesList = changedFiles.slice(0, 25).join('\n  ');
  const componentsList = changedComponents.length > 0
    ? `\nChanged components/areas: ${changedComponents.join(', ')}`
    : '';

  try {
    const { text } = await generateText({
      model,
      system: `You are a QA test selection agent for a web application testing platform.

Your job is to choose the most valuable existing test cases to run as regression tests after a code change (pull request merge). The tests are UI tests executed by an AI browser agent against a live website.

SELECTION CRITERIA (in priority order):
1. DIRECTLY AFFECTED — Tests that exercise UI features or pages explicitly touched by the changed files. These are the highest priority.
2. REGRESSION RISK — Tests for features that are adjacent to or depend on the changed code. For example, if a checkout flow changed, payment and order confirmation tests are high regression risk.
3. PREVIOUSLY FAILING — If a test description suggests it covers a known issue area, prefer it to catch regressions.
4. COVERAGE BREADTH — Among equally relevant tests, prefer diversity (different features/pages) over redundancy.

Do NOT select tests that have no plausible connection to the change just to fill slots. It's better to select fewer, highly relevant tests than to pad the list.

Respond with strict JSON only:
{
  "selectedIds": ["id1", "id2"],
  "reason": "Brief 1-2 sentence explanation of why these tests were selected and what risk areas they cover."
}`,
      prompt: `## Pull Request
PR #${pr.number}: ${pr.title}
Author: ${pr.user.login}
Description: ${pr.body?.slice(0, 500) || 'No description provided'}

## Changed Files
  ${changedFilesList}${componentsList}

## New Tests Already Included (${selectedNewIds.length})
These were generated specifically for this PR and are already selected. You do NOT need to select them.

## Existing Test Catalogue (${candidateTests.length} available)
Select up to ${remainingSlots} of the most relevant existing tests to run alongside the new ones:
${testCatalogue}

Return JSON with selectedIds and reason.`,
    });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const ids: string[] = Array.isArray(parsed.selectedIds) ? parsed.selectedIds : [];
      const validIds = ids.filter((id) => candidateTests.some((tc) => tc.id === id));
      const aiReason: string = typeof parsed.reason === 'string' ? parsed.reason : '';

      const newCount = selectedNewIds.length;
      const existingCount = validIds.length;
      const reason = aiReason
        || `Selected ${existingCount} existing test${existingCount !== 1 ? 's' : ''} based on relevance to changed files.`;
      const fullReason = newCount > 0
        ? `${newCount} new test${newCount !== 1 ? 's' : ''} generated from this PR. ${reason}`
        : reason;

      return { selectedExistingIds: validIds.slice(0, remainingSlots), selectedNewIds, selectionReason: fullReason };
    }
  } catch (error) {
    console.error('AI test selection failed, falling back to recent tests:', error);
  }

  // Fallback: select most recently created existing tests
  const fallbackIds = candidateTests
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, remainingSlots)
    .map((tc) => tc.id);

  const fallbackReason = selectedNewIds.length > 0
    ? `${selectedNewIds.length} new test${selectedNewIds.length !== 1 ? 's' : ''} generated from this PR. ${fallbackIds.length} most recent existing tests selected as fallback (AI selection unavailable).`
    : `${fallbackIds.length} most recent existing tests selected as fallback (AI selection unavailable).`;

  return { selectedExistingIds: fallbackIds, selectedNewIds, selectionReason: fallbackReason };
}

// Process a merged PR and create draft tests
async function processMergedPR(
  pr: GitHubPullRequestEvent['pull_request'],
  teamId: string,
  deliveryId: string
): Promise<{
  success: boolean;
  draftCount: number;
  message: string;
}> {
  console.log('[webhook:github] Step 1: Loading team state', { teamId, deliveryId });
  const state = await getOrCreateTeamState(teamId);
  console.log('[webhook:github] Step 1 complete: Team state loaded', { projectCount: state.projects.length });

  // Check if any existing job was created from this delivery (exact match only)
  for (const projectId of Object.keys(state.aiGenerationJobs || {})) {
    const jobs = state.aiGenerationJobs[projectId] || [];
    const existingJob = jobs.find(
      (job) => job.prompt.includes(`delivery:${deliveryId}`)
    );
    if (existingJob && existingJob.status === 'completed') {
      console.log(`PR #${pr.number} already processed (delivery: ${deliveryId}), skipping`);
      return {
        success: true,
        draftCount: 0,
        message: `PR #${pr.number} already processed, skipping`,
      };
    }
  }

  // Fetch changed files from the PR
  const [owner, repo] = pr.base.repo.full_name.split('/');
  console.log('[webhook:github] Step 2: Fetching PR files', { owner, repo, prNumber: pr.number });
  let prFiles: Awaited<ReturnType<typeof fetchPRFiles>>;

  try {
    prFiles = await fetchPRFiles(owner, repo, pr.number);
  } catch (error) {
    console.error('Failed to fetch PR files:', error);
    return {
      success: false,
      draftCount: 0,
      message: `Failed to fetch PR files: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }

  const { frontendFiles, changedComponents, domains } = extractFrontendChanges(
    prFiles.files.map((f) => ({
      filename: f.filename,
      status: f.status,
      patch: f.patch,
    }))
  );

  console.log('[webhook:github] Step 2 complete', { totalFiles: prFiles.totalCount, frontendFiles: frontendFiles.length, components: changedComponents, domains });

  if (frontendFiles.length === 0) {
    return {
      success: true,
      draftCount: 0,
      message: 'No frontend files changed in this PR',
    };
  }

  // Generate AI test suggestions
  console.log('[webhook:github] Step 3: Generating AI test suggestions');
  const testSuggestions = await generateTestSuggestionsForPR(
    pr,
    frontendFiles,
    changedComponents,
    domains
  );

  console.log('[webhook:github] Step 3 complete', { suggestionCount: testSuggestions.length });

  if (testSuggestions.length === 0) {
    return {
      success: true,
      draftCount: 0,
      message: 'No test suggestions generated',
    };
  }

  // Find a suitable project
  let projectId: string;
  if (state.projects.length > 0) {
    const recentProject = state.projects[state.projects.length - 1];
    projectId = recentProject.id;
  } else {
    projectId = generateId();
    const newProject = {
      id: projectId,
      name: `${pr.base.repo.name} Tests`,
      websiteUrl: pr.base.repo.html_url,
      createdAt: Date.now(),
    };
    state.projects.push(newProject);
    state.testCases[projectId] = [];
    state.testRuns[projectId] = [];
    state.testGroups[projectId] = [];
    state.userAccounts[projectId] = [];
    state.aiGenerationJobs[projectId] = [];
    state.aiDrafts[projectId] = [];
    state.aiDraftNotifications[projectId] = { hasUnseenDrafts: false };
    state.automationRuns[projectId] = [];
  }

  // Create a job for this PR
  const jobId = generateId();
  const job: AiGenerationJob = {
    id: jobId,
    projectId,
    prompt: `Auto-generated from GitHub PR #${pr.number} (delivery:${deliveryId}): ${pr.title}`,
    groupName: domains[0] || 'general',
    browserProvider: 'hyperbrowser-browser-use',
    settingsSnapshot: state.settings,
    aiModel: DEFAULT_AI_MODEL,
    status: 'completed',
    createdAt: Date.now(),
    completedAt: Date.now(),
    draftCount: testSuggestions.length,
    duplicateCount: 0,
  };

  // Create drafts from suggestions
  const now = Date.now();
  const drafts: GeneratedTestDraft[] = testSuggestions.map((suggestion, index) => ({
    id: generateId(),
    projectId,
    jobId,
    title: suggestion.title,
    description: suggestion.description,
    expectedOutcome: suggestion.expectedOutcome,
    groupName: suggestion.groupName,
    userAccountId: state.settings.draftUserAccounts ? '__any__' : undefined,
    status: 'draft' as const,
    createdAt: now + index,
  }));

  const existingJobs = state.aiGenerationJobs[projectId] || [];
  const existingDrafts = state.aiDrafts[projectId] || [];
  const existingNotification = state.aiDraftNotifications[projectId] || { hasUnseenDrafts: false };

  let nextState: QAState = {
    ...state,
    aiGenerationJobs: {
      ...state.aiGenerationJobs,
      [projectId]: [job, ...existingJobs].slice(0, 30),
    },
    aiDrafts: {
      ...state.aiDrafts,
      [projectId]: [...existingDrafts, ...drafts],
    },
    aiDraftNotifications: {
      ...state.aiDraftNotifications,
      [projectId]: {
        hasUnseenDrafts: true,
        lastSeenAt: existingNotification.lastSeenAt,
      },
    },
    lastUpdated: Date.now(),
  };

  // Check if automation is enabled and should run
  const autoSettings = state.automationSettings;
  if (autoSettings?.enabled) {
    console.log('[webhook:github] Step 4a: Automation enabled, checking filters');

    const targetProjectId = autoSettings.targetProjectId || projectId;
    const prAuthor = pr.user.login;
    const baseBranch = pr.base.ref;

    // Check allowed usernames filter
    const usernamesMatch = autoSettings.allowedGitHubUsernames.length === 0 ||
      autoSettings.allowedGitHubUsernames.some((u) => u.toLowerCase() === prAuthor.toLowerCase());

    // Check branch patterns filter
    const branchMatch = autoSettings.branchPatterns.length === 0 ||
      autoSettings.branchPatterns.some((pattern) => {
        if (pattern.includes('*')) {
          const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
          return regex.test(baseBranch);
        }
        return pattern === baseBranch;
      });

    if (usernamesMatch && branchMatch) {
      console.log('[webhook:github] Step 4b: Filters passed, running automation');

      // Auto-publish drafts as TestCases
      const publishedTestCases: TestCase[] = drafts.map((draft, index) => ({
        id: generateId() + `-auto-${index}`,
        projectId: targetProjectId,
        title: draft.title,
        description: draft.description,
        expectedOutcome: draft.expectedOutcome,
        status: 'pending' as const,
        createdAt: Date.now() + index,
        userAccountId: draft.userAccountId,
      }));

      // Mark drafts as published
      const publishedDraftIds = new Set(drafts.map((d) => d.id));
      const updatedDrafts = (nextState.aiDrafts[projectId] || []).map((d) =>
        publishedDraftIds.has(d.id) ? { ...d, status: 'published' as const, publishedAt: Date.now() } : d
      );
      nextState = {
        ...nextState,
        aiDrafts: { ...nextState.aiDrafts, [projectId]: updatedDrafts },
        // Clear unseen drafts notification since all drafts were auto-published
        aiDraftNotifications: {
          ...nextState.aiDraftNotifications,
          [projectId]: {
            ...nextState.aiDraftNotifications[projectId],
            hasUnseenDrafts: false,
          },
        },
      };

      // Add test cases to state
      const existingTestCases = nextState.testCases[targetProjectId] || [];
      nextState = {
        ...nextState,
        testCases: {
          ...nextState.testCases,
          [targetProjectId]: [...existingTestCases, ...publishedTestCases],
        },
      };

      // Select tests for automation (mix of new + existing)
      const allProjectTests = nextState.testCases[targetProjectId] || [];
      const newTestCaseIds = publishedTestCases.map((tc) => tc.id);
      const { selectedExistingIds, selectedNewIds, selectionReason } = await selectTestsForAutomation(
        pr,
        allProjectTests,
        newTestCaseIds,
        autoSettings.testCount,
        frontendFiles,
        changedComponents,
      );

      const allSelectedIds = [...selectedNewIds, ...selectedExistingIds];
      const testsToRun = allProjectTests.filter((tc) => allSelectedIds.includes(tc.id));

      // Create AutomationRun record (pending until delay window elapses)
      const automationRunId = generateId();
      const scheduledFor = Date.now() + AUTOMATION_DELAY_MS;
      const automationRun: AutomationRun = {
        id: automationRunId,
        projectId: targetProjectId,
        prNumber: pr.number,
        prTitle: pr.title,
        prUrl: pr.html_url,
        prAuthor: prAuthor,
        baseBranch,
        headBranch: pr.head.ref,
        deliveryId,
        selectedTestCaseIds: selectedExistingIds,
        generatedTestCaseIds: selectedNewIds,
        totalTests: testsToRun.length,
        status: 'pending',
        createdAt: Date.now(),
        scheduledFor,
        delayMs: AUTOMATION_DELAY_MS,
        passed: 0,
        failed: 0,
        skipped: 0,
        selectionReason,
      };

      // Save state with automation run (delay before execution)
      const existingAutoRuns = nextState.automationRuns?.[targetProjectId] || [];
      nextState = {
        ...nextState,
        automationRuns: {
          ...(nextState.automationRuns || {}),
          [targetProjectId]: [automationRun, ...existingAutoRuns].slice(0, 50),
        },
        lastUpdated: Date.now(),
      };

      await saveTeamState(teamId, null, nextState);
      console.log('[webhook:github] Step 4c: Saved state, delaying automation execution', { delayMs: AUTOMATION_DELAY_MS });

      let testRunId: string | null = null;

      // Execute tests headlessly after delay
      try {
        await wait(AUTOMATION_DELAY_MS);

        const freshState = await getOrCreateTeamState(teamId);
        const autoRuns = freshState.automationRuns?.[targetProjectId] || [];
        const pendingRun = autoRuns.find((r) => r.id === automationRunId);

        if (!pendingRun) {
          console.log('[webhook:github] Automation run missing after delay', { automationRunId, targetProjectId });
          return {
            success: false,
            draftCount: drafts.length,
            message: `Automation run ${automationRunId} missing after delay`,
          };
        }

        if (pendingRun.status !== 'pending') {
          console.log('[webhook:github] Automation run no longer pending after delay', { automationRunId, status: pendingRun.status });
          return {
            success: true,
            draftCount: drafts.length,
            message: `Automation run ${automationRunId} already ${pendingRun.status}`,
          };
        }

        const allSelectedIdsAfterDelay = [...pendingRun.generatedTestCaseIds, ...pendingRun.selectedTestCaseIds];
        const allProjectTestsAfterDelay = freshState.testCases[targetProjectId] || [];
        const testsToRunAfterDelay = allProjectTestsAfterDelay.filter((tc) => allSelectedIdsAfterDelay.includes(tc.id));

        if (testsToRunAfterDelay.length === 0) {
          const failedState: QAState = {
            ...freshState,
            automationRuns: {
              ...(freshState.automationRuns || {}),
              [targetProjectId]: autoRuns.map((r) =>
                r.id === automationRunId
                  ? { ...r, status: 'failed' as const, completedAt: Date.now(), error: 'No test cases available after delay' }
                  : r
              ),
            },
            lastUpdated: Date.now(),
          };

          await saveTeamState(teamId, null, failedState);

          return {
            success: false,
            draftCount: drafts.length,
            message: `No test cases available after delay for automation run ${automationRunId}`,
          };
        }

        testRunId = generateId();
        const runStartedAt = Date.now();
        const testRun: TestRun = {
          id: testRunId,
          projectId: targetProjectId,
          startedAt: runStartedAt,
          status: 'running',
          testCaseIds: testsToRunAfterDelay.map((tc) => tc.id),
          parallelLimit: freshState.settings.parallelLimit,
          totalTests: testsToRunAfterDelay.length,
          passed: 0,
          failed: 0,
          skipped: 0,
          results: [],
        };

        const runningState: QAState = {
          ...freshState,
          automationRuns: {
            ...(freshState.automationRuns || {}),
            [targetProjectId]: autoRuns.map((r) =>
              r.id === automationRunId
                ? {
                    ...r,
                    status: 'running' as const,
                    startedAt: runStartedAt,
                    testRunId,
                    totalTests: testsToRunAfterDelay.length,
                  }
                : r
            ),
          },
          testRuns: {
            ...freshState.testRuns,
            [targetProjectId]: [testRun, ...(freshState.testRuns[targetProjectId] || [])].slice(0, 50),
          },
          lastUpdated: Date.now(),
        };

        await saveTeamState(teamId, null, runningState);
        console.log('[webhook:github] Step 4d: Delay complete, starting test execution');

        const providerKeys = await getTeamProviderKeys(teamId);
        const project = runningState.projects.find((p) => p.id === targetProjectId);
        const websiteUrl = project?.websiteUrl || pr.base.repo.html_url;

        const batchResult = await executeTestBatch({
          testCases: testsToRunAfterDelay,
          websiteUrl,
          aiModel: DEFAULT_AI_MODEL,
          settings: runningState.settings,
          parallelLimit: runningState.settings.parallelLimit,
          persistedState: runningState,
          providerKeys: {
            hyperbrowser: providerKeys.hyperbrowser || undefined,
            browserUseCloud: providerKeys.browserUseCloud || undefined,
          },
        });

        // Update automation run with results
        const completedAutoRun: Partial<AutomationRun> = {
          status: 'completed',
          completedAt: Date.now(),
          passed: batchResult.passed,
          failed: batchResult.failed,
          skipped: batchResult.skipped,
        };

        // Update test run with results
        const completedTestRun: Partial<TestRun> = {
          status: 'completed',
          completedAt: Date.now(),
          results: batchResult.results,
          passed: batchResult.passed,
          failed: batchResult.failed,
          skipped: batchResult.skipped,
        };

        // Reload and update state
        const finalState = await getOrCreateTeamState(teamId);
        const finalAutoRuns = finalState.automationRuns?.[targetProjectId] || [];
        const finalTestRuns = finalState.testRuns[targetProjectId] || [];

        const completedState: QAState = {
          ...finalState,
          automationRuns: {
            ...(finalState.automationRuns || {}),
            [targetProjectId]: finalAutoRuns.map((r) =>
              r.id === automationRunId ? { ...r, ...completedAutoRun } : r
            ),
          },
          testRuns: {
            ...finalState.testRuns,
            [targetProjectId]: finalTestRuns.map((r) =>
              r.id === testRunId ? { ...r, ...completedTestRun } : r
            ),
          },
          lastUpdated: Date.now(),
        };

        await saveTeamState(teamId, null, completedState);
        console.log('[webhook:github] Step 4e: Automation complete', {
          passed: batchResult.passed,
          failed: batchResult.failed,
          skipped: batchResult.skipped,
        });
      } catch (execError) {
        console.error('[webhook:github] Automation execution failed:', execError);

        const freshState = await getOrCreateTeamState(teamId);
        const autoRuns = freshState.automationRuns?.[targetProjectId] || [];
        const testRuns = freshState.testRuns[targetProjectId] || [];

        const failedState: QAState = {
          ...freshState,
          automationRuns: {
            ...(freshState.automationRuns || {}),
            [targetProjectId]: autoRuns.map((r) =>
              r.id === automationRunId
                ? { ...r, status: 'failed' as const, completedAt: Date.now(), error: execError instanceof Error ? execError.message : 'Unknown error' }
                : r
            ),
          },
          testRuns: {
            ...freshState.testRuns,
            [targetProjectId]: testRunId
              ? testRuns.map((r) =>
                  r.id === testRunId ? { ...r, status: 'failed' as const, completedAt: Date.now() } : r
                )
              : testRuns,
          },
          lastUpdated: Date.now(),
        };

        await saveTeamState(teamId, null, failedState);
      }

      return {
        success: true,
        draftCount: drafts.length,
        message: `Created ${drafts.length} tests and scheduled automation for PR #${pr.number}`,
      };
    } else {
      console.log('[webhook:github] Step 4a: Automation filters did not match', { usernamesMatch, branchMatch, prAuthor, baseBranch });
    }
  }

  // Save state (draft-only path or automation filters didn't match)
  console.log('[webhook:github] Step 4: Saving state', { projectId, jobId, draftCount: drafts.length });
  await saveTeamState(teamId, null, nextState);
  console.log('[webhook:github] Step 4 complete: State saved');

  return {
    success: true,
    draftCount: drafts.length,
    message: `Created ${drafts.length} draft tests from PR #${pr.number}`,
  };
}

export async function POST(request: NextRequest) {
  try {
    // Verify webhook signature
    const signature = request.headers.get('x-hub-signature-256');
    const event = request.headers.get('x-github-event');
    const delivery = request.headers.get('x-github-delivery');

    const rawBody = await request.text();

    if (!verifyGitHubSignature(rawBody, signature)) {
      console.log('[webhook:github] Invalid signature', { event, delivery });
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Handle ping event
    if (event === 'ping') {
      console.log('[webhook:github] Ping received', { delivery });
      return NextResponse.json({ message: 'Pong' }, { status: 200 });
    }

    // Only process pull_request events
    if (event !== 'pull_request') {
      console.log('[webhook:github] Ignored event type', { event, delivery });
      return NextResponse.json(
        { message: `Event '${event}' not supported` },
        { status: 200 }
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const parseResult = pullRequestSchema.safeParse(payload);
    if (!parseResult.success) {
      console.log('[webhook:github] Invalid payload', { delivery, errors: parseResult.error.flatten() });
      return NextResponse.json({ error: 'Invalid payload format' }, { status: 400 });
    }

    const prEvent = parseResult.data;

    // Only process merged pull requests
    if (prEvent.action !== 'closed' || !prEvent.pull_request.merged) {
      console.log('[webhook:github] PR not merged', { delivery, action: prEvent.action, merged: prEvent.pull_request.merged, prNumber: prEvent.number });
      return NextResponse.json(
        { message: `PR action '${prEvent.action}' not processed (only merged PRs)` },
        { status: 200 }
      );
    }

    const teamId = SHARED_TEAM_ID;
    const prNumber = prEvent.pull_request.number;
    const deliveryId = delivery || `gh-${prNumber}`;

    console.log('[webhook:github] Processing merged PR', {
      delivery: deliveryId,
      prNumber,
      title: prEvent.pull_request.title,
      repo: prEvent.repository.full_name,
    });

    // Use after() for background processing - return 202 immediately
    after(async () => {
      try {
        const result = await processMergedPR(prEvent.pull_request, teamId, deliveryId);
        console.log('[webhook:github] Processing complete', {
          delivery: deliveryId,
          prNumber,
          success: result.success,
          draftCount: result.draftCount,
        });
      } catch (error) {
        console.error('[webhook:github] Background processing failed:', error);
      }
    });

    return NextResponse.json(
      {
        message: 'Processing PR in background',
        accepted: true,
        prNumber,
        prTitle: prEvent.pull_request.title,
      },
      { status: 202 }
    );
  } catch (error) {
    console.error('Webhook processing error:', error);
    return handleRouteError(error, 'Failed to process webhook');
  }
}

// Handle GET requests (health check)
export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      message: 'GitHub webhook endpoint active',
      events: ['ping', 'pull_request (merged only)'],
    },
    { status: 200 }
  );
}
