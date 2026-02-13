import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { generateText } from 'ai';
import { handleRouteError } from '@/lib/server/route-utils';
import { saveTeamState, getOrCreateTeamState } from '@/lib/server/team-state-store';
import type { QAState, GeneratedTestDraft, AiGenerationJob } from '@/types';
import { generateId } from '@/lib/utils';
import { getModel } from '@/lib/ai-client';
import { z } from 'zod';

// Increase max duration for AI processing (required for webhook to complete)
export const maxDuration = 60;

// Environment variables
const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const SHARED_TEAM_ID = process.env.SHARED_TEAM_ID || 'team-default';
const DEFAULT_AI_MODEL = process.env.NEXT_PUBLIC_DEFAULT_AI_MODEL || 'openai/gpt-5.2';

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

  // Compare as hex strings first (constant-time string comparison)
  // timingSafeEqual requires equal-length buffers, so we use a constant-time approach
  if (signature.length !== 64 || digest.length !== 64) {
    return false;
  }

  // Use timing-safe comparison for the hex strings
  const sigBuf = Buffer.from(signature, 'utf8');
  const digBuf = Buffer.from(digest, 'utf8');
  
  try {
    return crypto.timingSafeEqual(sigBuf, digBuf);
  } catch {
    // If timingSafeEqual throws (shouldn't happen with equal lengths), reject
    return false;
  }
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

  // Handle pagination if there are more files
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
  const domainKeywords = ['auth', 'login', 'signup', 'dashboard', 'settings', 'profile', 'billing', 'payment', 'checkout', 'cart', 'user', 'admin', 'home', 'landing', 'pricing', 'contact', 'about'];

  const frontendFiles: string[] = [];
  const changedComponents: string[] = [];
  const domains: string[] = [];

  for (const file of files) {
    const ext = file.filename.substring(file.filename.lastIndexOf('.'));
    const isFrontend = frontendExtensions.includes(ext.toLowerCase());

    if (isFrontend) {
      frontendFiles.push(file.filename);

      // Extract component path
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

      // Extract domain from file path
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

  const system = `You are a senior QA engineer. Based on a merged GitHub pull request, generate high-value test cases that validate the changes.
Return strict JSON only: { "testCases": [{ "title": "...", "description": "...", "expectedOutcome": "...", "groupName": "..." }] }.
Rules:
- Keep tests atomic and actionable
- Focus on user-facing functionality
- Include validation and edge cases
- Use descriptive titles that explain what is being tested
- Set groupName to a relevant domain from: ${domainKeywords.join(', ')} or "general"`;

  const prompt = `A pull request was merged to the repository:

PR #${pr.number}: ${pr.title}
${pr.body || 'No description'}
Merged by: ${pr.merged_by?.login || 'unknown'}
Repository: ${pr.base.repo.full_name}

Changed frontend files (${frontendFiles.length} total):
${changedFilesList}

Changed components: ${componentsList}
Identified domains: ${domainsList}

Generate 3-5 test cases that validate this PR's changes. Focus on:
1. Happy path workflows for the changed features
2. Edge cases and validation
3. Error states if applicable
4. Cross-component integration if multiple components changed

Return JSON with this exact structure:
{ "testCases": [{ "title": "...", "description": "...", "expectedOutcome": "...", "groupName": "..." }] }`;

  try {
    const { text } = await generateText({ model, system, prompt });

    // Extract JSON from response
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
    // Return fallback test cases
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
  // Check for idempotency - verify this delivery hasn't been processed already
  // We use the delivery ID to prevent duplicate processing
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

  // Extract frontend changes
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

  // Get the team state (already fetched for idempotency check)
  // Find a suitable project (use first project or create a placeholder)
  let projectId: string;
  if (state.projects.length > 0) {
    // Use the most recent project
    const recentProject = state.projects[state.projects.length - 1];
    projectId = recentProject.id;
  } else {
    // Create a default project for webhook tests
    projectId = generateId();
    const newProject = {
      id: projectId,
      name: `${pr.base.repo.name} Tests`,
      websiteUrl: pr.base.repo.html_url, // Use the repo URL as default
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
    status: 'draft' as const,
    createdAt: now + index,
  }));

  // Update state with job and drafts
  const existingJobs = state.aiGenerationJobs[projectId] || [];
  const existingDrafts = state.aiDrafts[projectId] || [];
  const existingNotification = state.aiDraftNotifications[projectId] || { hasUnseenDrafts: false };

  const nextState: QAState = {
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

  // Save state with system user (null userId)
  console.log('[webhook:github] Step 4: Saving state', { projectId, jobId, draftCount: drafts.length });
  await saveTeamState(teamId, 'system', nextState);
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

    // Get raw body for signature verification
    const rawBody = await request.text();

    // Verify signature
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

    // Parse and validate the webhook payload
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

    console.log('[webhook:github] Processing merged PR', {
      delivery,
      prNumber,
      title: prEvent.pull_request.title,
      repo: prEvent.repository.full_name,
    });

    // Process the merged PR synchronously to ensure completion on Vercel serverless.
    // GitHub may retry on timeout; the idempotency check handles duplicates.
    const result = await processMergedPR(prEvent.pull_request, teamId, delivery || `gh-${prNumber}`);

    console.log('[webhook:github] Processing complete', {
      delivery,
      prNumber,
      success: result.success,
      draftCount: result.draftCount,
    });

    return NextResponse.json(
      {
        message: result.message,
        success: result.success,
        draftCount: result.draftCount,
        prNumber,
        prTitle: prEvent.pull_request.title,
      },
      { status: 200 }
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
