/**
 * Hyperbrowser HyperAgent client for QA test execution
 */

import Hyperbrowser from "@hyperbrowser/sdk";

interface HyperbrowserConfig {
  url: string;
  task: string;
  expectedOutcome?: string;
  useStealth?: boolean;
  useProxy?: boolean;
  proxyCountry?: string;
  maxSteps?: number;
  profileId?: string;
  persistProfileChanges?: boolean;
}

interface HyperbrowserResponse {
  success: boolean;
  result?: unknown;
  error?: string;
  liveUrl?: string;
  recordingUrl?: string;
}

interface HyperbrowserCallbacks {
  onLiveUrl?: (liveUrl: string, sessionUrl: string) => void;
  onComplete?: (result: unknown) => void;
  onError?: (error: string) => void;
}

function extractJsonObjects(text: string): string[] {
  const results: string[] = [];
  let i = 0;

  while (i < text.length) {
    const start = text.indexOf("{", i);
    if (start === -1) break;

    let depth = 0;
    let inString = false;
    let escape = false;

    for (let j = start; j < text.length; j++) {
      const ch = text[j];

      if (inString) {
        if (escape) {
          escape = false;
          continue;
        }
        if (ch === "\\") {
          escape = true;
          continue;
        }
        if (ch === "\"") {
          inString = false;
        }
        continue;
      }

      if (ch === "\"") {
        inString = true;
        continue;
      }

      if (ch === "{") {
        depth++;
        continue;
      }
      if (ch === "}") {
        depth--;
        if (depth === 0) {
          results.push(text.slice(start, j + 1));
          i = j + 1;
          break;
        }
        continue;
      }
    }

    // If we found a '{' but couldn't close it, stop scanning to avoid looping forever.
    if (depth !== 0) break;
  }

  return results;
}

export function coerceSuccess(value: unknown): { valid: boolean; value: boolean } {
  if (typeof value === 'boolean') return { valid: true, value };
  if (typeof value === 'number') return { valid: true, value: value !== 0 };
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    if (['true', 'yes', 'passed', 'pass', '1'].includes(lower)) return { valid: true, value: true };
    if (['false', 'no', 'failed', 'fail', '0'].includes(lower)) return { valid: true, value: false };
  }
  return { valid: false, value: false };
}

function parseAgentResult(finalResult: string): Record<string, unknown> {
  console.log('[parseAgentResult] Raw finalResult (truncated):', finalResult.slice(0, 500));

  // Prefer JSON inside ```json fences if present
  const fenced = finalResult.match(/```json\s*([\s\S]*?)\s*```/i);
  const candidateText = fenced?.[1] ?? finalResult;

  const candidates = extractJsonObjects(candidateText);

  // --- First pass: look for candidates with boolean `success` (highest confidence) ---
  for (let idx = candidates.length - 1; idx >= 0; idx--) {
    try {
      const obj = JSON.parse(candidates[idx]) as Record<string, unknown>;
      if (obj && typeof obj === 'object' && 'success' in obj) {
        if (typeof obj.success === 'boolean') {
          console.log('[parseAgentResult] Tier: explicit | success:', obj.success);
          return { ...obj, _parseConfidence: 'explicit' };
        }
      }
    } catch {
      // Ignore bad candidates and keep scanning.
    }
  }

  // --- Second pass: look for candidates with coercible `success` ---
  for (let idx = candidates.length - 1; idx >= 0; idx--) {
    try {
      const obj = JSON.parse(candidates[idx]) as Record<string, unknown>;
      if (obj && typeof obj === 'object' && 'success' in obj) {
        const coerced = coerceSuccess(obj.success);
        if (coerced.valid) {
          console.log('[parseAgentResult] Tier: coerced | success:', coerced.value, '| original:', obj.success);
          return { ...obj, success: coerced.value, _parseConfidence: 'coerced' };
        }
      }
    } catch {
      // Ignore bad candidates and keep scanning.
    }
  }

  // --- Third pass: look for alternative fields (outcome, result, status, passed) ---
  const altFields = ['outcome', 'result', 'status', 'passed'] as const;
  for (let idx = candidates.length - 1; idx >= 0; idx--) {
    try {
      const obj = JSON.parse(candidates[idx]) as Record<string, unknown>;
      if (obj && typeof obj === 'object') {
        for (const field of altFields) {
          if (field in obj) {
            const coerced = coerceSuccess(obj[field]);
            if (coerced.valid) {
              console.log('[parseAgentResult] Tier: coerced (alt field:', field, ') | success:', coerced.value);
              return { ...obj, success: coerced.value, _parseConfidence: 'coerced' };
            }
          }
        }
      }
    } catch {
      // Ignore bad candidates and keep scanning.
    }
  }

  // --- Text-heuristic fallback ---
  const textLower = finalResult.toLowerCase();
  const positiveSignals = [
    'successfully', 'outcome was met', 'outcome was achieved', 'outcome has been met',
    'outcome has been achieved', 'verified successfully', 'test passed',
    'completed successfully', 'expected outcome was verified',
    'expected outcome is met', 'expected outcome has been met',
  ];
  const negativeSignals = [
    'failed to', 'could not', 'error occurred', 'not met',
    'outcome was not', 'outcome is not', 'outcome has not',
    'test failed', 'unable to', 'did not succeed',
  ];

  const hasPositive = positiveSignals.some(s => textLower.includes(s));
  const hasNegative = negativeSignals.some(s => textLower.includes(s));

  if (hasPositive && !hasNegative) {
    console.log('[parseAgentResult] Tier: heuristic (positive) | success: true');
    return {
      success: true,
      reason: finalResult.slice(0, 500),
      _parseConfidence: 'heuristic',
    };
  }
  if (hasNegative && !hasPositive) {
    console.log('[parseAgentResult] Tier: heuristic (negative) | success: false');
    return {
      success: false,
      reason: finalResult.slice(0, 500),
      _parseConfidence: 'heuristic',
    };
  }

  // Ambiguous or no signals — return with 'none' confidence so verification triggers
  console.log('[parseAgentResult] Tier: none | Could not determine success from agent output');
  return {
    success: false,
    error: 'Agent response did not contain valid JSON with required boolean `success` field.',
    extractedData: { rawOutput: finalResult },
    _parseConfidence: 'none',
  };
}

function isParseFailure(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') return true;
  const rec = obj as Record<string, unknown>;
  const confidence = rec._parseConfidence as string | undefined;

  // High confidence results: trust them, don't re-verify
  if (confidence === 'explicit' || confidence === 'coerced') return false;

  // Heuristic results where success=true: moderately confident, trust them
  if (confidence === 'heuristic' && rec.success === true) return false;

  // Heuristic negative, no confidence, or missing confidence: trigger verification
  return true;
}

/**
 * Execute a browser automation task with Hyperbrowser HyperAgent
 */
export async function runHyperbrowserAgent(
  config: HyperbrowserConfig,
  apiKey?: string,
  callbacks?: HyperbrowserCallbacks
): Promise<HyperbrowserResponse> {
  const key = apiKey || process.env.HYPERBROWSER_API_KEY;

  if (!key) {
    throw new Error(
      "HYPERBROWSER_API_KEY is required. Set it in .env or pass as parameter."
    );
  }

  const client = new Hyperbrowser({ apiKey: key });
  let sessionId: string | undefined;
  // Track the permanent session URL (valid after session ends)
  let sessionUrl: string | undefined;

  try {
    // Create a session with recording enabled to get persistent playback
    const session = await client.sessions.create({
      useStealth: config.useStealth ?? false,
      useProxy: config.useProxy ?? false,
      enableWebRecording: true,
      ...(config.proxyCountry ? { proxyCountry: config.proxyCountry as "US" | "GB" | "CA" | "DE" | "FR" | "JP" | "AU" } : {}),
      ...(config.profileId ? {
        profile: {
          id: config.profileId,
          persistChanges: config.persistProfileChanges ?? false,
        },
      } : {}),
    });

    sessionId = session.id;
    // sessionUrl is a permanent dashboard link (survives session stop)
    sessionUrl = session.sessionUrl;

    // Fire liveUrl callback immediately so UI can show browser preview
    if (session.liveUrl) {
      callbacks?.onLiveUrl?.(session.liveUrl, sessionUrl || '');
    }

    // Build the full task with URL context
    const taskWithUrl = `Navigate to ${config.url} and then: ${config.task}`;

    // Execute the agent task using the session
    const response = await client.agents.hyperAgent.startAndWait({
      task: taskWithUrl,
      sessionId: session.id,
      maxSteps: config.maxSteps ?? 50,
    });

    const mainFinalResult = response.data?.finalResult;
    const mainStepsCount = Array.isArray(response.data?.steps) ? response.data?.steps.length : 0;
    const mainNumStepsCompleted = response.metadata?.numTaskStepsCompleted ?? null;

    // Parse the main agent result. If it fails the JSON contract, do a short,
    // formatting-only verification pass in the same session (only when needed).
    let parsedResult: unknown = null;
    let verifyFinalResult: string | null = null;
    let verifyStepsCount = 0;
    let verifyNumStepsCompleted: number | null = null;

    if (typeof mainFinalResult === "string") {
      parsedResult = parseAgentResult(mainFinalResult);
    } else {
      parsedResult = {
        success: false,
        error: "Agent did not return a finalResult string.",
        extractedData: { rawOutput: mainFinalResult ?? null },
      };
    }

    if (isParseFailure(parsedResult)) {
      const expectedOutcome = (config.expectedOutcome || "").trim() || "Test should complete successfully";
      const verificationTask =
        `Do NOT navigate away or change any toggles/settings unless required for verification.\n` +
        `Verify whether the expected outcome is currently true in the application.\n\n` +
        `Expected outcome:\n${expectedOutcome}\n\n` +
        `Return ONLY a valid JSON object with this exact shape:\n` +
        `{ "success": true/false, "reason": "short factual explanation of what you observed" }\n` +
        `Do not include any extra text before or after the JSON.`;

      const verifyResponse = await client.agents.hyperAgent.startAndWait({
        task: verificationTask,
        sessionId: session.id,
        maxSteps: 8,
      });

      verifyFinalResult = verifyResponse.data?.finalResult ?? null;
      verifyStepsCount = Array.isArray(verifyResponse.data?.steps) ? verifyResponse.data?.steps.length : 0;
      verifyNumStepsCompleted = verifyResponse.metadata?.numTaskStepsCompleted ?? null;

      if (typeof verifyFinalResult === "string") {
        parsedResult = parseAgentResult(verifyFinalResult);
      } else {
        parsedResult = {
          success: false,
          error: "Verifier did not return a finalResult string.",
          extractedData: { rawOutput: verifyFinalResult ?? null },
        };
      }
    }

    // Attach debugging metadata without affecting the required contract fields.
    if (parsedResult && typeof parsedResult === "object") {
      const rec = parsedResult as Record<string, unknown>;
      const existingExtracted =
        rec.extractedData && typeof rec.extractedData === "object" ? (rec.extractedData as Record<string, unknown>) : {};
      rec.extractedData = {
        ...existingExtracted,
        hyperbrowser: {
          main: {
            finalResult: mainFinalResult,
            stepsCount: mainStepsCount,
            numTaskStepsCompleted: mainNumStepsCompleted,
          },
          verify: {
            finalResult: verifyFinalResult,
            stepsCount: verifyStepsCount,
            numTaskStepsCompleted: verifyNumStepsCompleted,
          },
        },
      };
    }

    callbacks?.onComplete?.(parsedResult);

    // Stop session before retrieving recording URL (recordings process on stop)
    if (sessionId) {
      try {
        await client.sessions.stop(sessionId);
      } catch {
        // Session may already be stopped
      }
    }

    // Use sessionUrl as the recording link — it's the permanent Hyperbrowser dashboard
    // page with the built-in recording player. getRecordingURL() returns a raw JSON file
    // URL which isn't directly viewable.
    const recordingUrl = sessionUrl;

    // Clear sessionId so finally block doesn't double-stop
    sessionId = undefined;

    return {
      success: true,
      result: parsedResult,
      liveUrl: session.liveUrl,
      recordingUrl,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    callbacks?.onError?.(errorMsg);
    return {
      success: false,
      error: errorMsg,
      recordingUrl: sessionUrl,
    };
  } finally {
    // Stop the session to free resources (only if not already stopped above)
    if (sessionId) {
      try {
        await client.sessions.stop(sessionId);
      } catch {
        // Session may already be stopped
      }
    }
  }
}

/**
 * Build a goal from test steps
 */
export function buildGoalFromSteps(
  steps: Array<{
    action: string;
    target?: string;
    value?: string;
    goal: string;
    expectedOutcome?: string;
  }>,
  expectedOutcome?: string
): string {
  const stepDescriptions = steps
    .map((step, index) => `${index + 1}. ${step.goal}`)
    .join("\n");

  let goal = `Execute the following test steps in order:\n\n${stepDescriptions}\n\n`;

  if (expectedOutcome) {
    goal += `Expected final outcome: ${expectedOutcome}\n\n`;
  }

  goal += `After completing all steps, return a JSON result with:
{
  "success": true/false,
  "stepsCompleted": number,
  "failedAtStep": number or null,
  "error": "error message if failed" or null,
  "extractedData": { any data extracted during the test }
}`;

  return goal;
}

/**
 * Build a goal from plain English test description
 */
export function buildGoalFromDescription(
  description: string,
  expectedOutcome?: string
): string {
  let goal = `Execute the following test:\n\n${description}\n\n`;

  if (expectedOutcome) {
    goal += `Expected outcome: ${expectedOutcome}\n\n`;
  }

  goal += `After completing the test, return a JSON result with:
{
  "success": true/false,
  "error": "error message if failed" or null,
  "extractedData": { any data extracted during the test },
  "observations": ["list of observations about what happened"]
}`;

  return goal;
}
