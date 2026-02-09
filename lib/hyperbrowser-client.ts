/**
 * Hyperbrowser HyperAgent client for QA test execution
 */

import Hyperbrowser from "@hyperbrowser/sdk";

interface HyperbrowserConfig {
  url: string;
  task: string;
  useStealth?: boolean;
  useProxy?: boolean;
  proxyCountry?: string;
  maxSteps?: number;
}

interface HyperbrowserResponse {
  success: boolean;
  result?: unknown;
  error?: string;
  liveUrl?: string;
}

interface HyperbrowserCallbacks {
  onLiveUrl?: (url: string) => void;
  onComplete?: (result: unknown) => void;
  onError?: (error: string) => void;
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

  try {
    // Create a session to get liveUrl before starting the agent task
    const session = await client.sessions.create({
      useStealth: config.useStealth ?? false,
      useProxy: config.useProxy ?? false,
      ...(config.proxyCountry ? { proxyCountry: config.proxyCountry as "US" | "GB" | "CA" | "DE" | "FR" | "JP" | "AU" } : {}),
    });

    sessionId = session.id;

    // Fire liveUrl callback immediately so UI can show browser preview
    if (session.liveUrl) {
      callbacks?.onLiveUrl?.(session.liveUrl);
    }

    // Build the full task with URL context
    const taskWithUrl = `Navigate to ${config.url} and then: ${config.task}`;

    // Execute the agent task using the session
    const response = await client.agents.hyperAgent.startAndWait({
      task: taskWithUrl,
      sessionId: session.id,
      maxSteps: config.maxSteps ?? 50,
    });

    const finalResult = response.data?.finalResult;

    // Try to parse JSON from the result
    let parsedResult: unknown = finalResult;
    if (typeof finalResult === "string") {
      try {
        // Extract JSON from the response if embedded in text
        const jsonMatch = finalResult.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedResult = JSON.parse(jsonMatch[0]);
        }
      } catch {
        // Not JSON, use raw string
        parsedResult = { success: true, reason: finalResult };
      }
    }

    callbacks?.onComplete?.(parsedResult);

    return {
      success: true,
      result: parsedResult,
      liveUrl: session.liveUrl,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    callbacks?.onError?.(errorMsg);
    return {
      success: false,
      error: errorMsg,
    };
  } finally {
    // Stop the session to free resources
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
