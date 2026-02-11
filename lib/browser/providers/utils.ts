import type { BrowserExecutionVerdict } from './types';
import type { QASettings } from '@/types';

export const VERDICT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    reason: { type: 'string' },
    extractedData: {
      type: 'object',
      additionalProperties: true,
    },
  },
  required: ['success', 'reason'],
  additionalProperties: true,
};

function extractJsonObjects(text: string): string[] {
  const results: string[] = [];
  let i = 0;

  while (i < text.length) {
    const start = text.indexOf('{', i);
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
        if (ch === '\\') {
          escape = true;
          continue;
        }
        if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }

      if (ch === '{') {
        depth++;
        continue;
      }

      if (ch === '}') {
        depth--;
        if (depth === 0) {
          results.push(text.slice(start, j + 1));
          i = j + 1;
          break;
        }
      }
    }

    if (depth !== 0) break;
  }

  return results;
}

export function coerceSuccess(value: unknown): { valid: boolean; value: boolean } {
  if (typeof value === 'boolean') return { valid: true, value };
  if (typeof value === 'number') return { valid: true, value: value !== 0 };
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'yes', 'passed', 'pass', '1'].includes(normalized)) return { valid: true, value: true };
    if (['false', 'no', 'failed', 'fail', '0'].includes(normalized)) return { valid: true, value: false };
  }
  return { valid: false, value: false };
}

function parseVerdictObject(obj: Record<string, unknown>): BrowserExecutionVerdict | null {
  const success = coerceSuccess(obj.success);
  const reasonValue = obj.reason;
  const reason = typeof reasonValue === 'string' ? reasonValue.trim() : '';

  if (!success.valid || !reason) return null;

  const extractedData =
    obj.extractedData && typeof obj.extractedData === 'object'
      ? (obj.extractedData as Record<string, unknown>)
      : undefined;

  return {
    success: success.value,
    reason,
    extractedData,
  };
}

export function parseVerdictFromOutput(finalResult: unknown): BrowserExecutionVerdict | null {
  if (finalResult && typeof finalResult === 'object') {
    return parseVerdictObject(finalResult as Record<string, unknown>);
  }

  if (typeof finalResult !== 'string') {
    return null;
  }

  const fenced = finalResult.match(/```json\s*([\s\S]*?)\s*```/i);
  const candidateText = fenced?.[1] ?? finalResult;
  const jsonCandidates = extractJsonObjects(candidateText);

  for (let idx = jsonCandidates.length - 1; idx >= 0; idx--) {
    try {
      const parsed = JSON.parse(jsonCandidates[idx]) as Record<string, unknown>;
      const verdict = parseVerdictObject(parsed);
      if (verdict) return verdict;
    } catch {
      // Continue scanning candidates
    }
  }

  return null;
}

export function resolveApiKey(settings: Partial<QASettings>, provider: QASettings['browserProvider']): string | undefined {
  const settingsKeys = settings.providerApiKeys;

  if (provider === 'browser-use-cloud') {
    return settingsKeys?.browserUseCloud || process.env.BROWSER_USE_API_KEY;
  }

  return settingsKeys?.hyperbrowser || process.env.HYPERBROWSER_API_KEY;
}

export function buildExecutionTask(url: string, task: string): string {
  return `Navigate to ${url} and then: ${task}`;
}

export function buildLoginTask(websiteUrl: string, email: string, password: string): string {
  return [
    `Navigate to ${websiteUrl} and log in with these credentials:`,
    `Email: ${email}`,
    `Password: ${password}`,
    '',
    'Perform the login flow and verify the user is logged in.',
    'Return ONLY a valid JSON object with this exact shape:',
    '{ "success": true/false, "reason": "short factual explanation" }',
    'Do not include any extra text before or after the JSON.',
  ].join('\n');
}
