import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { z } from 'zod';
import { getModel } from '@/lib/ai-client';
import { DEFAULT_BROWSER_PROVIDER, getBrowserProvider } from '@/lib/browser/providers';
import type {
  AiDraftNotification,
  AiGenerationJob,
  GeneratedTest,
  GeneratedTestDraft,
  QASettings,
  QAState,
  UserAccount,
} from '@/types';
import { generateId } from '@/lib/utils';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { handleRouteError } from '@/lib/server/route-utils';
import { requireTeamContext } from '@/lib/server/team-context';
import { getOrCreateTeamState, getTeamProviderKeys, saveTeamState } from '@/lib/server/team-state-store';
import { releaseAccount, tryAcquireAccount } from '@/lib/server/account-locks';

interface ExecutionCredentials {
  email: string;
  password: string;
  profileId?: string;
  metadata?: Record<string, string>;
}

const RUNNING_STALE_MS = 10 * 60 * 1000;
const MAX_GENERATED_TESTS = 10;
const ACCOUNT_WAIT_POLL_MS = 350;
const ACCOUNT_WAIT_TIMEOUT_MS = 10 * 60 * 1000;

const generatedTestSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  expectedOutcome: z.string().min(1),
});

const generatedCollectionSchema = z.object({
  testCases: z.array(generatedTestSchema).min(1).max(MAX_GENERATED_TESTS),
});

const kickoffSchema = z.object({
  projectId: z.string().min(1),
  rawText: z.string().min(1),
  websiteUrl: z.string().url(),
  aiModel: z.string().min(1),
  groupName: z.string().trim().min(1).max(120).optional(),
  userAccountId: z.string().trim().min(1).optional(),
  settings: z.custom<Partial<QASettings>>().optional(),
});

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

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSignature(test: GeneratedTest): string {
  return `${normalizeText(test.title)}|${normalizeText(test.description)}|${normalizeText(test.expectedOutcome)}`;
}

function tokenize(input: string): Set<string> {
  return new Set(
    normalizeText(input)
      .split(' ')
      .filter(Boolean)
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function extractJsonObject(text: string): string {
  let jsonText = text.trim();

  if (jsonText.startsWith('```json')) jsonText = jsonText.slice(7);
  else if (jsonText.startsWith('```')) jsonText = jsonText.slice(3);
  if (jsonText.endsWith('```')) jsonText = jsonText.slice(0, -3);
  jsonText = jsonText.trim();

  const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in model response.');
  }
  return jsonMatch[0];
}

function dedupeCandidates(
  candidates: GeneratedTest[],
  existingTests: Array<{ id: string; title: string; description: string; expectedOutcome: string }>,
  existingDrafts: GeneratedTestDraft[]
): Array<{
  candidate: GeneratedTest;
  status: GeneratedTestDraft['status'];
  duplicateOfTestCaseId?: string;
  duplicateReason?: string;
}> {
  const existingSignatures = new Map<string, string>();
  const existingTokenSets = new Map<string, Set<string>>();

  for (const testCase of existingTests) {
    const signature = buildSignature(testCase);
    existingSignatures.set(signature, testCase.id);
    existingTokenSets.set(
      testCase.id,
      tokenize(`${testCase.title} ${testCase.description} ${testCase.expectedOutcome}`)
    );
  }

  for (const draft of existingDrafts) {
    if (draft.status !== 'draft') continue;
    const signature = buildSignature(draft);
    if (!existingSignatures.has(signature)) {
      existingSignatures.set(signature, draft.id);
    }
  }

  const acceptedSignatures = new Set<string>();
  const result: Array<{
    candidate: GeneratedTest;
    status: GeneratedTestDraft['status'];
    duplicateOfTestCaseId?: string;
    duplicateReason?: string;
  }> = [];

  for (const candidate of candidates) {
    const signature = buildSignature(candidate);
    if (existingSignatures.has(signature) || acceptedSignatures.has(signature)) {
      result.push({
        candidate,
        status: 'duplicate_skipped',
        duplicateOfTestCaseId: existingSignatures.get(signature),
        duplicateReason: 'Exact duplicate of an existing or already-generated test.',
      });
      continue;
    }

    const candidateTokens = tokenize(`${candidate.title} ${candidate.description} ${candidate.expectedOutcome}`);
    let bestMatchId: string | undefined;
    let bestScore = 0;
    for (const [testId, tokenSet] of existingTokenSets.entries()) {
      const score = jaccardSimilarity(candidateTokens, tokenSet);
      if (score > bestScore) {
        bestScore = score;
        bestMatchId = testId;
      }
    }

    if (bestScore >= 0.88) {
      result.push({
        candidate,
        status: 'duplicate_skipped',
        duplicateOfTestCaseId: bestMatchId,
        duplicateReason: `Near-duplicate of existing coverage (${Math.round(bestScore * 100)}% similarity).`,
      });
      continue;
    }

    if (bestScore >= 0.72) {
      result.push({
        candidate,
        status: 'draft',
        duplicateOfTestCaseId: bestMatchId,
        duplicateReason: `Potential overlap detected (${Math.round(bestScore * 100)}% similarity).`,
      });
      acceptedSignatures.add(signature);
      continue;
    }

    result.push({ candidate, status: 'draft' });
    acceptedSignatures.add(signature);
  }

  return result;
}

function resolveAccountCredentials(
  account: UserAccount | undefined,
  settings: Partial<QASettings>
): ExecutionCredentials | undefined {
  if (!account) return undefined;
  const profileId =
    settings.browserProvider === 'browser-use-cloud'
      ? account.providerProfiles?.browserUseCloud?.profileId
      : account.providerProfiles?.hyperbrowser?.profileId;

  return {
    email: account.email,
    password: account.password,
    profileId,
    metadata: account.metadata,
  };
}

function buildExplorationTask(
  prompt: string,
  websiteUrl: string,
  groupName?: string,
  credentials?: ExecutionCredentials
): string {
  let task = `You are exploring a web application to design production QA test coverage.\n`;
  task += `Primary user request: ${prompt}\n`;
  task += `Target URL: ${websiteUrl}\n`;
  if (groupName) {
    task += `Focus area/group: ${groupName}\n`;
  }

  if (credentials?.profileId) {
    task += `Use the existing authenticated profile/session for this account.\n`;
    task += `Only perform a manual login if the app clearly requires it.\n`;
    task += `Fallback credentials:\n- Email: ${credentials.email}\n- Password: ${credentials.password}\n`;
  } else if (credentials) {
    task += `Log in before exploration using:\n- Email: ${credentials.email}\n- Password: ${credentials.password}\n`;
  }

  if (credentials?.metadata && Object.keys(credentials.metadata).length > 0) {
    task += `Account metadata: ${Object.entries(credentials.metadata)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ')}\n`;
  }

  task += `\nExplore key pages and flows related to the request. Identify:\n`;
  task += `1) Main happy-path workflows\n2) Important validation/error states\n3) Edge cases and permissions\n4) Data integrity checks users rely on\n`;
  task += `\nReturn JSON only with this exact shape:\n`;
  task += `{\n`;
  task += `  "success": true,\n`;
  task += `  "reason": "short summary of what you explored",\n`;
  task += `  "extractedData": {\n`;
  task += `    "visitedAreas": ["..."],\n`;
  task += `    "criticalFlows": ["..."],\n`;
  task += `    "risks": ["..."],\n`;
  task += `    "notes": "important findings"\n`;
  task += `  }\n`;
  task += `}\n`;
  return task;
}

function buildSynthesisPrompt(
  projectName: string,
  websiteUrl: string,
  prompt: string,
  groupName: string | undefined,
  explorationSummary: string,
  explorationData: Record<string, unknown> | undefined
): string {
  return `Project: ${projectName}
Website URL: ${websiteUrl}
User request: ${prompt}
${groupName ? `Group: ${groupName}` : ''}

Exploration summary:
${explorationSummary}

Exploration details:
${JSON.stringify(explorationData || {}, null, 2)}

Generate up to 10 comprehensive but non-duplicative QA test cases for this scope.
Return JSON: { "testCases": [{ "title": "...", "description": "...", "expectedOutcome": "..." }] }`;
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function waitForSpecificAccount(accountId: string): Promise<boolean> {
  const deadline = Date.now() + ACCOUNT_WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (tryAcquireAccount(accountId)) return true;
    await wait(ACCOUNT_WAIT_POLL_MS);
  }
  return false;
}

async function waitForAnyAccount(accountIds: string[], seed: number): Promise<string | undefined> {
  const uniqueAccountIds = [...new Set(accountIds)];
  if (uniqueAccountIds.length === 0) return undefined;

  const deadline = Date.now() + ACCOUNT_WAIT_TIMEOUT_MS;
  let cursor = Math.abs(seed) % uniqueAccountIds.length;

  while (Date.now() < deadline) {
    for (let i = 0; i < uniqueAccountIds.length; i++) {
      const accountId = uniqueAccountIds[(cursor + i) % uniqueAccountIds.length];
      if (tryAcquireAccount(accountId)) {
        return accountId;
      }
    }

    cursor = (cursor + 1) % uniqueAccountIds.length;
    await wait(ACCOUNT_WAIT_POLL_MS);
  }

  return undefined;
}

function updateJobList(
  jobs: AiGenerationJob[],
  jobId: string,
  updater: (job: AiGenerationJob) => AiGenerationJob
): AiGenerationJob[] {
  return jobs.map((job) => (job.id === jobId ? updater(job) : job));
}

async function claimNextJob(
  teamId: string,
  userId: string,
  targetJobId?: string
): Promise<AiGenerationJob | null> {
  const state = await getOrCreateTeamState(teamId);
  const now = Date.now();

  let chosenProjectId: string | null = null;
  let chosenJob: AiGenerationJob | null = null;

  const projectIds = Object.keys(state.aiGenerationJobs || {});
  for (const projectId of projectIds) {
    const jobs = state.aiGenerationJobs[projectId] || [];
    for (const job of jobs) {
      if (targetJobId && job.id !== targetJobId) continue;
      const isQueued = job.status === 'queued';
      const isStaleRunning =
        job.status === 'running' &&
        typeof job.startedAt === 'number' &&
        now - job.startedAt > RUNNING_STALE_MS;

      if (!isQueued && !isStaleRunning) continue;

      if (!chosenJob || job.createdAt < chosenJob.createdAt) {
        chosenProjectId = projectId;
        chosenJob = job;
      }
    }
  }

  if (!chosenJob || !chosenProjectId) return null;

  const updatedJobs = updateJobList(
    state.aiGenerationJobs[chosenProjectId] || [],
    chosenJob.id,
    (job) => ({
      ...job,
      status: 'running',
      startedAt: job.startedAt || now,
      error: undefined,
      progressMessage: 'AI is now checking your app to determine best test cases. You can check progress on the Execution tab.',
    })
  );

  const nextState: QAState = {
    ...state,
    aiGenerationJobs: {
      ...state.aiGenerationJobs,
      [chosenProjectId]: updatedJobs,
    },
    lastUpdated: Date.now(),
  };

  await saveTeamState(teamId, userId, nextState);

  return {
    ...chosenJob,
    status: 'running',
    startedAt: chosenJob.startedAt || now,
    error: undefined,
    progressMessage: 'AI is now checking your app to determine best test cases. You can check progress on the Execution tab.',
  };
}

async function updateJob(
  teamId: string,
  userId: string,
  projectId: string,
  jobId: string,
  updates: Partial<AiGenerationJob>
): Promise<void> {
  const state = await getOrCreateTeamState(teamId);
  const jobs = state.aiGenerationJobs[projectId] || [];
  const nextJobs = updateJobList(jobs, jobId, (job) => ({ ...job, ...updates }));
  const nextState: QAState = {
    ...state,
    aiGenerationJobs: {
      ...state.aiGenerationJobs,
      [projectId]: nextJobs,
    },
    lastUpdated: Date.now(),
  };
  await saveTeamState(teamId, userId, nextState);
}

async function completeJobWithDrafts(
  teamId: string,
  userId: string,
  projectId: string,
  jobId: string,
  drafts: GeneratedTestDraft[],
  duplicateCount: number
): Promise<void> {
  const state = await getOrCreateTeamState(teamId);
  const existingDrafts = state.aiDrafts[projectId] || [];
  const mergedDrafts = [...existingDrafts, ...drafts];
  const nextNotification: AiDraftNotification = {
    hasUnseenDrafts: drafts.some((draft) => draft.status === 'draft') || (state.aiDraftNotifications[projectId]?.hasUnseenDrafts ?? false),
    lastSeenAt: state.aiDraftNotifications[projectId]?.lastSeenAt,
  };

  const updatedJobs = updateJobList(state.aiGenerationJobs[projectId] || [], jobId, (job) => ({
    ...job,
    status: 'completed',
    completedAt: Date.now(),
    streamingUrl: undefined,
    progressMessage: 'Exploration complete. Draft test cases are ready for review.',
    draftCount: drafts.filter((draft) => draft.status === 'draft').length,
    duplicateCount,
  }));

  const nextState: QAState = {
    ...state,
    aiGenerationJobs: {
      ...state.aiGenerationJobs,
      [projectId]: updatedJobs,
    },
    aiDrafts: {
      ...state.aiDrafts,
      [projectId]: mergedDrafts,
    },
    aiDraftNotifications: {
      ...state.aiDraftNotifications,
      [projectId]: nextNotification,
    },
    lastUpdated: Date.now(),
  };

  await saveTeamState(teamId, userId, nextState);
}

async function failJob(
  teamId: string,
  userId: string,
  projectId: string,
  jobId: string,
  message: string
): Promise<void> {
  await updateJob(teamId, userId, projectId, jobId, {
    status: 'failed',
    completedAt: Date.now(),
    error: message,
    progressMessage: undefined,
    streamingUrl: undefined,
  });
}

async function runClaimedJob(teamId: string, userId: string, job: AiGenerationJob): Promise<void> {
  const state = await getOrCreateTeamState(teamId);
  const project = state.projects.find((entry) => entry.id === job.projectId);
  if (!project) {
    await failJob(teamId, userId, job.projectId, job.id, 'Project not found.');
    return;
  }

  const providerKeys = await getTeamProviderKeys(teamId);
  const settings = normalizeSettings({
    ...job.settingsSnapshot,
    browserProvider: job.browserProvider,
    providerApiKeys: {
      hyperbrowser: providerKeys.hyperbrowser || undefined,
      browserUseCloud: providerKeys.browserUseCloud || undefined,
    },
  });

  const provider = getBrowserProvider(settings.browserProvider);
  const projectAccounts = state.userAccounts[job.projectId] || [];
  let selectedAccount: UserAccount | undefined;
  let lockedAccountId: string | undefined;
  if (job.userAccountId && job.userAccountId !== 'none') {
    if (job.userAccountId === '__any__') {
      const preferredAccountIds = projectAccounts
        .filter((account) =>
          settings.browserProvider === 'browser-use-cloud'
            ? Boolean(account.providerProfiles?.browserUseCloud?.profileId)
            : Boolean(account.providerProfiles?.hyperbrowser?.profileId)
        )
        .map((account) => account.id);
      const fallbackAccountIds = projectAccounts.map((account) => account.id);
      const orderedAccountIds = [...preferredAccountIds, ...fallbackAccountIds];
      lockedAccountId = await waitForAnyAccount(orderedAccountIds, job.createdAt);
      if (!lockedAccountId) {
        await failJob(teamId, userId, job.projectId, job.id, 'No available user account could be allocated.');
        return;
      }
      selectedAccount = projectAccounts.find((account) => account.id === lockedAccountId);
    } else {
      selectedAccount = projectAccounts.find((account) => account.id === job.userAccountId);
      if (!selectedAccount) {
        await failJob(teamId, userId, job.projectId, job.id, `Assigned account '${job.userAccountId}' was not found.`);
        return;
      }
      const acquired = await waitForSpecificAccount(selectedAccount.id);
      if (!acquired) {
        await failJob(teamId, userId, job.projectId, job.id, 'Assigned account is busy and could not be allocated in time.');
        return;
      }
      lockedAccountId = selectedAccount.id;
    }
  }
  if (lockedAccountId && !selectedAccount) {
    releaseAccount(lockedAccountId);
    lockedAccountId = undefined;
    await failJob(teamId, userId, job.projectId, job.id, 'Allocated account could not be resolved.');
    return;
  }
  const credentials = resolveAccountCredentials(selectedAccount, settings);

  await updateJob(teamId, userId, job.projectId, job.id, {
    progressMessage: 'AI is now checking your app to determine best test cases. You can check progress on the Execution tab.',
  });

  const explorationTask = buildExplorationTask(job.prompt, project.websiteUrl, job.groupName, credentials);

  try {
    const execution = await provider.executeTest(
      {
        url: project.websiteUrl,
        task: explorationTask,
        settings,
        credentials,
      },
      {
        onLiveUrl: async (liveUrl: string, recordingUrl?: string) => {
          await updateJob(teamId, userId, job.projectId, job.id, {
            streamingUrl: liveUrl,
            recordingUrl: recordingUrl,
          });
        },
        onTaskCreated: async () => {
          await updateJob(teamId, userId, job.projectId, job.id, {
            progressMessage: 'AI is now checking your app to determine best test cases. You can check progress on the Execution tab.',
          });
        },
      }
    );

    if (execution.status === 'error' || !execution.verdict) {
      throw new Error(execution.error || 'Browser exploration failed without a verdict.');
    }

    await updateJob(teamId, userId, job.projectId, job.id, {
      progressMessage: 'Exploration complete. Synthesizing draft tests.',
      streamingUrl: undefined,
      recordingUrl: execution.recordingUrl || job.recordingUrl,
    });

    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY not configured.');
    }

    const model = getModel(job.aiModel);
    const system = `You are a senior QA engineer. Convert browser exploration findings into high-value test cases.
Return strict JSON only: { "testCases": [{ "title": "...", "description": "...", "expectedOutcome": "..." }] }.
Rules:
- Keep tests atomic and actionable.
- Include happy path, validation, and edge scenarios.
- Avoid duplicates and avoid generic filler tests.
- Target real product risks and data integrity checks.`;

    const prompt = buildSynthesisPrompt(
      project.name,
      project.websiteUrl,
      job.prompt,
      job.groupName,
      execution.verdict.reason,
      execution.verdict.extractedData
    );

    const { text } = await generateText({ model, system, prompt });
    const parsed = JSON.parse(extractJsonObject(text));
    const validated = generatedCollectionSchema.parse(parsed);

    const latestState = await getOrCreateTeamState(teamId);
    const existingTests = (latestState.testCases[job.projectId] || []).map((testCase) => ({
      id: testCase.id,
      title: testCase.title,
      description: testCase.description,
      expectedOutcome: testCase.expectedOutcome,
    }));
    const existingDrafts = latestState.aiDrafts[job.projectId] || [];

    const deduped = dedupeCandidates(validated.testCases, existingTests, existingDrafts);
    const now = Date.now();
    const drafts: GeneratedTestDraft[] = deduped.map((entry, index) => ({
      id: generateId(),
      projectId: job.projectId,
      jobId: job.id,
      title: entry.candidate.title,
      description: entry.candidate.description,
      expectedOutcome: entry.candidate.expectedOutcome,
      userAccountId: job.userAccountId && job.userAccountId !== 'none' ? job.userAccountId : undefined,
      groupName: job.groupName,
      status: entry.status,
      duplicateOfTestCaseId: entry.duplicateOfTestCaseId,
      duplicateReason: entry.duplicateReason,
      createdAt: now + index,
    }));

    const duplicateCount = drafts.filter((draft) => draft.status === 'duplicate_skipped').length;
    await completeJobWithDrafts(teamId, userId, job.projectId, job.id, drafts, duplicateCount);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate test drafts.';
    await failJob(teamId, userId, job.projectId, job.id, message);
  } finally {
    releaseAccount(lockedAccountId);
  }
}

async function processQueuedJobs(teamId: string, userId: string, targetJobId?: string): Promise<void> {
  // Process one targeted job or a short burst of queued jobs.
  const maxJobs = targetJobId ? 1 : 2;
  for (let i = 0; i < maxJobs; i++) {
    const claimedJob = await claimNextJob(teamId, userId, targetJobId);
    if (!claimedJob) break;
    await runClaimedJob(teamId, userId, claimedJob);
    if (targetJobId) break;
  }
}

function getProjectPayload(state: QAState, projectId: string) {
  const jobs = [...(state.aiGenerationJobs[projectId] || [])].sort((a, b) => b.createdAt - a.createdAt);
  const drafts = [...(state.aiDrafts[projectId] || [])].filter(
    (draft) => draft.status === 'draft' || draft.status === 'duplicate_skipped'
  );
  const notification = state.aiDraftNotifications[projectId] || { hasUnseenDrafts: false };
  return { jobs, drafts, notification };
}

export async function POST(request: NextRequest) {
  try {
    const team = await requireTeamContext();
    enforceRateLimit(`generate-tests:post:${team.userId}`, { limit: 20, windowMs: 60_000 });

    const rawBody = await request.json();
    const body = kickoffSchema.parse(rawBody);

    const state = await getOrCreateTeamState(team.teamId);
    const project = state.projects.find((entry) => entry.id === body.projectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    }

    const job: AiGenerationJob = {
      id: generateId(),
      projectId: body.projectId,
      prompt: body.rawText.trim(),
      groupName: body.groupName?.trim(),
      userAccountId: body.userAccountId,
      browserProvider: normalizeSettings(body.settings).browserProvider || DEFAULT_BROWSER_PROVIDER,
      settingsSnapshot: normalizeSettings(body.settings),
      aiModel: body.aiModel,
      status: 'queued',
      createdAt: Date.now(),
      draftCount: 0,
      duplicateCount: 0,
    };

    const jobs = state.aiGenerationJobs[body.projectId] || [];
    const nextState: QAState = {
      ...state,
      aiGenerationJobs: {
        ...state.aiGenerationJobs,
        [body.projectId]: [job, ...jobs].slice(0, 30),
      },
      aiDraftNotifications: {
        ...state.aiDraftNotifications,
        [body.projectId]: state.aiDraftNotifications[body.projectId] || { hasUnseenDrafts: false },
      },
      lastUpdated: Date.now(),
    };

    await saveTeamState(team.teamId, team.userId, nextState);

    void processQueuedJobs(team.teamId, team.userId, job.id).catch((error) => {
      console.error('Failed to process queued AI job:', error);
    });

    return NextResponse.json(
      {
        success: true,
        jobId: job.id,
        message: 'AI is now checking your app to determine best test cases. You can check progress on the Execution tab.',
      },
      { status: 202 }
    );
  } catch (error) {
    return handleRouteError(error, 'Failed to queue AI generation.');
  }
}

export async function GET(request: NextRequest) {
  try {
    const team = await requireTeamContext();
    enforceRateLimit(`generate-tests:get:${team.userId}`, { limit: 120, windowMs: 60_000 });

    const projectId = request.nextUrl.searchParams.get('projectId');
    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    void processQueuedJobs(team.teamId, team.userId).catch((error) => {
      console.error('Failed to continue queued AI jobs:', error);
    });

    const state = await getOrCreateTeamState(team.teamId);
    const payload = getProjectPayload(state, projectId);
    return NextResponse.json(payload);
  } catch (error) {
    return handleRouteError(error, 'Failed to fetch AI generation status.');
  }
}
