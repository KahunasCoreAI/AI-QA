/**
 * Module-level tracking of active execution runs.
 *
 * Each run gets an AbortController whose signal is threaded through
 * the provider polling loops. When the signal fires (either via client
 * disconnect or explicit stop call) the provider calls its own stop API.
 *
 * LIMITATION: On serverless platforms (Vercel) each isolate has its own Map.
 * A stop request may hit a different isolate than the one running the tests,
 * making stopRun() ineffective. The SSE stream approach (client disconnect
 * triggers abort via request.signal) is the more reliable cancellation path.
 */

const activeRunControllers = new Map<string, AbortController>();

export function registerRun(runId: string): AbortController {
  // If a controller already exists for this runId, abort and replace it
  const existing = activeRunControllers.get(runId);
  if (existing) {
    existing.abort();
  }

  const controller = new AbortController();
  activeRunControllers.set(runId, controller);
  return controller;
}

export function stopRun(runId: string): boolean {
  const controller = activeRunControllers.get(runId);
  if (!controller) return false;
  controller.abort();
  return true;
}

export function unregisterRun(runId: string): void {
  activeRunControllers.delete(runId);
}
