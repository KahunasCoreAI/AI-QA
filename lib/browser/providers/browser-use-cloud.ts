import type { BrowserProvider } from './types';
import {
  buildLoginTask,
  parseVerdictFromOutput,
  resolveApiKey,
  VERDICT_JSON_SCHEMA,
} from './utils';

const BROWSER_USE_API_BASE = 'https://api.browser-use.com/api/v2';
const DEFAULT_MODEL = 'browser-use-llm';
const DEFAULT_MAX_STEPS = 50;
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

interface BrowserUseCloudSession {
  id: string;
  liveUrl?: string | null;
  publicShareUrl?: string | null;
}

interface BrowserUseCloudTask {
  id: string;
  sessionId: string;
}

interface BrowserUseCloudTaskView {
  id: string;
  sessionId: string;
  status: 'created' | 'started' | 'finished' | 'stopped';
  output?: string | null;
  isSuccess?: boolean | null;
  metadata?: Record<string, unknown> | null;
  outputFiles?: Array<{ id: string; fileName: string }>;
}

interface BrowserUseShareView {
  shareUrl?: string;
}

interface BrowserUseOutputFileView {
  downloadUrl: string;
}

function normalizeBrowserUseModel(modelId: string | undefined): string {
  const raw = modelId?.trim();
  if (!raw) return DEFAULT_MODEL;

  switch (raw.toLowerCase()) {
    case 'browser_use_1.0':
    case 'browser-use-1.0':
    case 'bu-1-0':
    case 'browser_use_llm':
      return 'browser-use-llm';
    case 'browser_use_2.0':
    case 'browser-use-2.0':
    case 'bu-2-0':
      return 'browser-use-2.0';
    default:
      return raw;
  }
}

function resolveConfiguredModel(settingsModel: string | undefined): string {
  return normalizeBrowserUseModel(
    settingsModel?.trim() ||
      process.env.BROWSER_USE_CLOUD_MODEL ||
      process.env.BROWSER_USE_MODEL ||
      DEFAULT_MODEL
  );
}

function isProfileNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('Profile not found');
}

async function requestBrowserUse<T>(
  apiKey: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${BROWSER_USE_API_BASE}${path}`, {
    ...init,
    headers: {
      'X-Browser-Use-API-Key': apiKey,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      if (!response.ok) {
        throw new Error(`BrowserUse Cloud API ${response.status}: ${text}`);
      }
      throw new Error(`BrowserUse Cloud API returned non-JSON response: ${text}`);
    }
  }

  if (!response.ok) {
    const detail = (payload as { detail?: unknown } | null)?.detail;
    const detailText =
      typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
        ? detail.map((item) => (typeof item?.msg === 'string' ? item.msg : JSON.stringify(item))).join('; ')
        : JSON.stringify(payload);

    throw new Error(`BrowserUse Cloud API ${response.status}: ${detailText}`);
  }

  return payload as T;
}

async function createSession(
  apiKey: string,
  options: {
    profileId?: string;
    proxyCountryCode?: string;
  }
): Promise<BrowserUseCloudSession> {
  return requestBrowserUse<BrowserUseCloudSession>(apiKey, '/sessions', {
    method: 'POST',
    body: JSON.stringify({
      ...(options.profileId ? { profileId: options.profileId } : {}),
      ...(options.proxyCountryCode ? { proxyCountryCode: options.proxyCountryCode } : {}),
    }),
  });
}

async function deleteSession(apiKey: string, sessionId: string): Promise<void> {
  await requestBrowserUse<void>(apiKey, `/sessions/${sessionId}`, {
    method: 'DELETE',
  });
}

async function stopSession(apiKey: string, sessionId: string): Promise<void> {
  await requestBrowserUse<void>(apiKey, `/sessions/${sessionId}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'stop' }),
  });
}

async function createProfile(apiKey: string, name: string): Promise<{ id: string }> {
  return requestBrowserUse<{ id: string }>(apiKey, '/profiles', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

async function deleteProfileInternal(apiKey: string, profileId: string): Promise<void> {
  await requestBrowserUse<void>(apiKey, `/profiles/${profileId}`, {
    method: 'DELETE',
  });
}

async function createTask(
  apiKey: string,
  payload: {
    task: string;
    sessionId: string;
    llm?: string;
    maxSteps?: number;
    structuredOutput?: string;
  }
): Promise<BrowserUseCloudTask> {
  return requestBrowserUse<BrowserUseCloudTask>(apiKey, '/tasks', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

async function getTask(apiKey: string, taskId: string): Promise<BrowserUseCloudTaskView> {
  return requestBrowserUse<BrowserUseCloudTaskView>(apiKey, `/tasks/${taskId}`);
}

async function stopTaskAndSession(apiKey: string, taskId: string): Promise<void> {
  await requestBrowserUse(apiKey, `/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'stop_task_and_session' }),
  });
}

async function createOrGetSessionShareUrl(apiKey: string, sessionId: string): Promise<string | undefined> {
  try {
    const share = await requestBrowserUse<BrowserUseShareView>(apiKey, `/sessions/${sessionId}/public-share`, {
      method: 'POST',
    });
    if (share.shareUrl) return share.shareUrl;
  } catch {
    // Fall back to GET for already-shared sessions.
  }

  try {
    const share = await requestBrowserUse<BrowserUseShareView>(apiKey, `/sessions/${sessionId}/public-share`);
    return share.shareUrl;
  } catch {
    return undefined;
  }
}

function pickPreferredOutputFile(
  outputFiles: Array<{ id: string; fileName: string }> | undefined
): Array<{ id: string; fileName: string }> {
  if (!outputFiles || outputFiles.length === 0) return [];
  const scoring = (fileName: string): number => {
    if (/\.(mp4|webm|mov)$/i.test(fileName)) return 3;
    if (/\.(gif)$/i.test(fileName)) return 2;
    if (/\.(png|jpg|jpeg|webp)$/i.test(fileName)) return 1;
    return 0;
  };

  return [...outputFiles].sort((a, b) => scoring(b.fileName) - scoring(a.fileName));
}

async function resolveOutputFileUrl(
  apiKey: string,
  taskId: string,
  outputFiles: Array<{ id: string; fileName: string }> | undefined
): Promise<string | undefined> {
  const preferred = pickPreferredOutputFile(outputFiles);
  for (const file of preferred) {
    try {
      const output = await requestBrowserUse<BrowserUseOutputFileView>(
        apiKey,
        `/files/tasks/${taskId}/output-files/${file.id}`
      );
      if (output.downloadUrl) return output.downloadUrl;
    } catch {
      // Best effort per file.
    }
  }
  return undefined;
}

async function waitForTaskCompletion(apiKey: string, taskId: string): Promise<BrowserUseCloudTaskView> {
  const started = Date.now();

  while (true) {
    const task = await getTask(apiKey, taskId);

    if (task.status === 'finished' || task.status === 'stopped') {
      return task;
    }

    if (Date.now() - started > POLL_TIMEOUT_MS) {
      try {
        await stopTaskAndSession(apiKey, taskId);
      } catch {
        // Best effort stop.
      }
      throw new Error(`BrowserUse Cloud task ${taskId} timed out after ${Math.floor(POLL_TIMEOUT_MS / 1000)}s.`);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

export const browserUseCloudProvider: BrowserProvider = {
  id: 'browser-use-cloud',

  async executeTest(input, callbacks) {
    const apiKey = resolveApiKey(input.settings, 'browser-use-cloud');
    if (!apiKey) {
      return {
        status: 'error',
        verdict: null,
        error: 'BrowserUse Cloud API key is required. Add it in Settings or set BROWSER_USE_API_KEY.',
      };
    }

    let sessionId: string | undefined;
    const requestedProfileId = input.credentials?.profileId;

    try {
      let session: BrowserUseCloudSession;
      try {
        session = await createSession(apiKey, {
          profileId: requestedProfileId,
          proxyCountryCode: input.settings.proxyEnabled ? input.settings.proxyCountry : undefined,
        });
      } catch (error) {
        if (requestedProfileId && isProfileNotFoundError(error)) {
          session = await createSession(apiKey, {
            proxyCountryCode: input.settings.proxyEnabled ? input.settings.proxyCountry : undefined,
          });
        } else {
          throw error;
        }
      }
      sessionId = session.id;

      if (session.liveUrl) {
        await callbacks?.onLiveUrl?.(session.liveUrl);
      }

      const createdTask = await createTask(apiKey, {
        task: `Navigate to ${input.url} and then: ${input.task}`,
        sessionId: session.id,
        llm: resolveConfiguredModel(input.settings.browserUseCloudModel),
        maxSteps: input.maxSteps ?? DEFAULT_MAX_STEPS,
        structuredOutput: JSON.stringify(VERDICT_JSON_SCHEMA),
      });

      const task = await waitForTaskCompletion(apiKey, createdTask.id);
      const verdict = parseVerdictFromOutput(task.output);
      let recordingUrl =
        session.publicShareUrl || (await createOrGetSessionShareUrl(apiKey, session.id)) || undefined;
      if (!recordingUrl) {
        recordingUrl = await resolveOutputFileUrl(apiKey, createdTask.id, task.outputFiles);
      }

      if (!verdict) {
        return {
          status: 'error',
          verdict: null,
          error: 'BrowserUse Cloud did not return a valid structured verdict payload.',
          liveUrl: session.liveUrl || undefined,
          recordingUrl,
          rawProviderData: task,
        };
      }

      return {
        status: verdict.success ? 'completed' : 'failed',
        verdict,
        liveUrl: session.liveUrl || undefined,
        recordingUrl,
        rawProviderData: task,
      };
    } catch (error) {
      return {
        status: 'error',
        verdict: null,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      if (sessionId) {
        try {
          await stopSession(apiKey, sessionId);
        } catch {
          // Best effort cleanup.
        }
      }
    }
  },

  async loginWithProfile(input) {
    const apiKey = resolveApiKey(input.settings, 'browser-use-cloud');
    if (!apiKey) {
      return {
        success: false,
        error: 'BrowserUse Cloud API key is required. Add it in Settings or set BROWSER_USE_API_KEY.',
      };
    }

    let profileId = input.existingProfileId;
    let createdProfileId: string | undefined;
    let sessionId: string | undefined;

    try {
      if (!profileId) {
        const createdProfile = await createProfile(apiKey, `qa-${input.email}`);
        profileId = createdProfile.id;
        createdProfileId = createdProfile.id;
      }

      let session: BrowserUseCloudSession;
      try {
        session = await createSession(apiKey, {
          profileId,
          proxyCountryCode: input.settings.proxyEnabled ? input.settings.proxyCountry : undefined,
        });
      } catch (error) {
        // Profile IDs are provider-scoped; if a stale/mismatched profile ID is passed,
        // create a fresh provider profile and retry once.
        if (profileId && isProfileNotFoundError(error)) {
          const createdProfile = await createProfile(apiKey, `qa-${input.email}`);
          profileId = createdProfile.id;
          createdProfileId = createdProfile.id;
          session = await createSession(apiKey, {
            profileId,
            proxyCountryCode: input.settings.proxyEnabled ? input.settings.proxyCountry : undefined,
          });
        } else {
          throw error;
        }
      }
      sessionId = session.id;

      const createdTask = await createTask(apiKey, {
        task: buildLoginTask(input.websiteUrl, input.email, input.password),
        sessionId: session.id,
        llm: resolveConfiguredModel(input.settings.browserUseCloudModel),
        maxSteps: 30,
        structuredOutput: JSON.stringify(VERDICT_JSON_SCHEMA),
      });

      const task = await waitForTaskCompletion(apiKey, createdTask.id);
      const verdict = parseVerdictFromOutput(task.output);

      if (!verdict?.success) {
        if (createdProfileId) {
          try {
            await deleteProfileInternal(apiKey, createdProfileId);
          } catch {
            // Best effort cleanup.
          }
        }

        return {
          success: false,
          error: verdict?.reason || 'Login did not succeed.',
        };
      }

      return {
        success: true,
        profileId,
      };
    } catch (error) {
      if (createdProfileId) {
        try {
          await deleteProfileInternal(apiKey, createdProfileId);
        } catch {
          // Best effort cleanup.
        }
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      if (sessionId) {
        try {
          await deleteSession(apiKey, sessionId);
        } catch {
          // Best effort cleanup.
        }
      }
    }
  },

  async deleteProfile(profileId, settings) {
    const apiKey = resolveApiKey(settings, 'browser-use-cloud');
    if (!apiKey) {
      throw new Error('BrowserUse Cloud API key is required. Add it in Settings or set BROWSER_USE_API_KEY.');
    }

    await deleteProfileInternal(apiKey, profileId);
  },
};
