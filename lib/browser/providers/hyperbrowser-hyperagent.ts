import Hyperbrowser from '@hyperbrowser/sdk';
import type { BrowserProvider } from './types';
import {
  buildExecutionTask,
  buildLoginTask,
  parseVerdictFromOutput,
  resolveApiKey,
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

async function runHyperAgentTask(client: Hyperbrowser, task: string, sessionId: string, maxSteps: number, llm: string) {
  const params: Record<string, unknown> = {
    task,
    sessionId,
    maxSteps,
    llm,
  };

  return client.agents.hyperAgent.startAndWait(params as never);
}

export const hyperbrowserHyperAgentProvider: BrowserProvider = {
  id: 'hyperbrowser-hyperagent',

  async executeTest(input, callbacks) {
    const apiKey = resolveApiKey(input.settings, 'hyperbrowser-hyperagent');
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

      const llm =
        input.settings.hyperbrowserModel?.trim() ||
        process.env.HYPERBROWSER_MODEL ||
        process.env.HYPERBROWSER_AGENT_MODEL ||
        DEFAULT_MODEL;
      const taskResponse = await runHyperAgentTask(
        client,
        buildExecutionTask(input.url, input.task),
        session.id,
        input.maxSteps ?? 50,
        llm
      );

      const initialFinal = taskResponse.data?.finalResult;
      let verdict = parseVerdictFromOutput(initialFinal);

      if (!verdict) {
        const verificationTask = [
          'Do NOT navigate away from the current page unless necessary for verification.',
          'Verify whether the expected outcome is true right now.',
          '',
          `Expected outcome: ${input.expectedOutcome || 'Test should complete successfully'}`,
          '',
          'Return ONLY a valid JSON object with this exact shape:',
          '{ "success": true/false, "reason": "short factual explanation" }',
          'Do not include any extra text before or after the JSON.',
        ].join('\n');

        const verifyResponse = await runHyperAgentTask(client, verificationTask, session.id, 10, llm);
        verdict = parseVerdictFromOutput(verifyResponse.data?.finalResult);

        if (!verdict) {
          return {
            status: 'error',
            verdict: null,
            error: verifyResponse.error || 'HyperAgent did not return a valid verdict payload.',
            liveUrl: session.liveUrl || undefined,
            recordingUrl,
            rawProviderData: {
              initialFinal,
              verifyFinal: verifyResponse.data?.finalResult,
            },
          };
        }

        return {
          status: verdict.success ? 'completed' : 'failed',
          verdict,
          liveUrl: session.liveUrl || undefined,
          recordingUrl,
          rawProviderData: {
            initialFinal,
            verifyFinal: verifyResponse.data?.finalResult,
            metadata: {
              initial: taskResponse.metadata,
              verify: verifyResponse.metadata,
            },
          },
        };
      }

      return {
        status: verdict.success ? 'completed' : 'failed',
        verdict,
        liveUrl: session.liveUrl || undefined,
        recordingUrl,
        rawProviderData: {
          finalResult: initialFinal,
          metadata: taskResponse.metadata,
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
    const apiKey = resolveApiKey(input.settings, 'hyperbrowser-hyperagent');
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

      const llm =
        input.settings.hyperbrowserModel?.trim() ||
        process.env.HYPERBROWSER_MODEL ||
        process.env.HYPERBROWSER_AGENT_MODEL ||
        DEFAULT_MODEL;
      const response = await runHyperAgentTask(client, buildLoginTask(input.websiteUrl, input.email, input.password), session.id, 30, llm);
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
    const apiKey = resolveApiKey(settings, 'hyperbrowser-hyperagent');
    if (!apiKey) {
      throw new Error('Hyperbrowser API key is required. Add it in Settings or set HYPERBROWSER_API_KEY.');
    }

    const client = new Hyperbrowser({ apiKey });
    await client.profiles.delete(profileId);
  },
};
