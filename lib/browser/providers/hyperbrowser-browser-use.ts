import Hyperbrowser from '@hyperbrowser/sdk';
import type { BrowserProvider } from './types';
import {
  buildExecutionTask,
  buildLoginTask,
  parseVerdictFromOutput,
  resolveApiKey,
  VERDICT_JSON_SCHEMA,
} from './utils';

const DEFAULT_MODEL = 'gemini-2.5-flash';

function buildSessionOptions(input: {
  useStealth?: boolean;
  useProxy?: boolean;
  proxyCountry?: string;
  profileId?: string;
  persistProfileChanges?: boolean;
}) {
  return {
    useStealth: input.useStealth ?? false,
    useProxy: input.useProxy ?? false,
    enableWebRecording: true,
    ...(input.proxyCountry
      ? {
          proxyCountry: input.proxyCountry as
            | 'US'
            | 'GB'
            | 'CA'
            | 'DE'
            | 'FR'
            | 'JP'
            | 'AU',
        }
      : {}),
    ...(input.profileId
      ? {
          profile: {
            id: input.profileId,
            persistChanges: input.persistProfileChanges ?? false,
          },
        }
      : {}),
  };
}

export const hyperbrowserBrowserUseProvider: BrowserProvider = {
  id: 'hyperbrowser-browser-use',

  async executeTest(input, callbacks) {
    const apiKey = resolveApiKey(input.settings, 'hyperbrowser-browser-use');
    if (!apiKey) {
      return {
        status: 'error',
        verdict: null,
        error: 'Hyperbrowser API key is required. Add it in Settings or set HYPERBROWSER_API_KEY.',
      };
    }

    const client = new Hyperbrowser({ apiKey });
    let sessionId: string | undefined;
    let recordingUrl: string | undefined;

    try {
      const session = await client.sessions.create(
        buildSessionOptions({
          useStealth: input.settings.browserProfile === 'stealth',
          useProxy: input.settings.proxyEnabled ?? false,
          proxyCountry: input.settings.proxyCountry,
          profileId: input.credentials?.profileId,
          persistProfileChanges: false,
        })
      );

      sessionId = session.id;
      recordingUrl = session.sessionUrl;

      if (session.liveUrl) {
        await callbacks?.onLiveUrl?.(session.liveUrl, recordingUrl);
      }

      const taskParams: Record<string, unknown> = {
        task: buildExecutionTask(input.url, input.task),
        sessionId: session.id,
        maxSteps: input.maxSteps ?? 50,
        validateOutput: true,
        outputModelSchema: VERDICT_JSON_SCHEMA,
      };

      const llm =
        input.settings.hyperbrowserModel?.trim() ||
        process.env.HYPERBROWSER_MODEL ||
        process.env.HYPERBROWSER_AGENT_MODEL ||
        DEFAULT_MODEL;
      taskParams.llm = llm;

      const response = await client.agents.browserUse.startAndWait(taskParams as never);
      const finalResult = response.data?.finalResult;
      const verdict = parseVerdictFromOutput(finalResult);

      if (!verdict) {
        return {
          status: 'error',
          verdict: null,
          error: response.error || 'Browser-Use did not return a valid verdict payload.',
          liveUrl: session.liveUrl || undefined,
          recordingUrl,
          rawProviderData: {
            status: response.status,
            finalResult,
          },
        };
      }

      return {
        status: verdict.success ? 'completed' : 'failed',
        verdict,
        liveUrl: session.liveUrl || undefined,
        recordingUrl,
        rawProviderData: {
          status: response.status,
          finalResult,
          metadata: response.metadata,
        },
      };
    } catch (error) {
      return {
        status: 'error',
        verdict: null,
        error: error instanceof Error ? error.message : String(error),
        recordingUrl,
      };
    } finally {
      if (sessionId) {
        try {
          await client.sessions.stop(sessionId);
        } catch {
          // Session may already be stopped.
        }
      }
    }
  },

  async loginWithProfile(input) {
    const apiKey = resolveApiKey(input.settings, 'hyperbrowser-browser-use');
    if (!apiKey) {
      return {
        success: false,
        error: 'Hyperbrowser API key is required. Add it in Settings or set HYPERBROWSER_API_KEY.',
      };
    }

    const client = new Hyperbrowser({ apiKey });
    let createdProfileId: string | undefined;
    let sessionId: string | undefined;

    try {
      let profileId = input.existingProfileId;
      if (!profileId) {
        const profile = await client.profiles.create({ name: `qa-${input.email}` });
        profileId = profile.id;
        createdProfileId = profile.id;
      }

      const session = await client.sessions.create(
        buildSessionOptions({
          useStealth: input.settings.browserProfile !== 'standard',
          useProxy: input.settings.proxyEnabled ?? false,
          proxyCountry: input.settings.proxyCountry,
          profileId,
          persistProfileChanges: true,
        })
      );
      sessionId = session.id;

      const taskParams: Record<string, unknown> = {
        task: buildLoginTask(input.websiteUrl, input.email, input.password),
        sessionId: session.id,
        maxSteps: 30,
        validateOutput: true,
        outputModelSchema: VERDICT_JSON_SCHEMA,
      };

      const llm =
        input.settings.hyperbrowserModel?.trim() ||
        process.env.HYPERBROWSER_MODEL ||
        process.env.HYPERBROWSER_AGENT_MODEL ||
        DEFAULT_MODEL;
      taskParams.llm = llm;

      const response = await client.agents.browserUse.startAndWait(taskParams as never);
      const verdict = parseVerdictFromOutput(response.data?.finalResult);

      if (!verdict?.success) {
        if (createdProfileId) {
          try {
            await client.profiles.delete(createdProfileId);
          } catch {
            // Best effort cleanup.
          }
        }
        return {
          success: false,
          error: verdict?.reason || response.error || 'Login did not succeed.',
        };
      }

      return {
        success: true,
        profileId,
      };
    } catch (error) {
      if (createdProfileId) {
        try {
          await client.profiles.delete(createdProfileId);
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
          await client.sessions.stop(sessionId);
        } catch {
          // Session may already be stopped.
        }
      }
    }
  },

  async deleteProfile(profileId, settings) {
    const apiKey = resolveApiKey(settings, 'hyperbrowser-browser-use');
    if (!apiKey) {
      throw new Error('Hyperbrowser API key is required. Add it in Settings or set HYPERBROWSER_API_KEY.');
    }

    const client = new Hyperbrowser({ apiKey });
    await client.profiles.delete(profileId);
  },
};
