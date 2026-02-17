/**
 * In-memory account lock set.
 *
 * LIMITATION: On serverless platforms (Vercel) each isolate maintains its own
 * Set, so two concurrent requests in different isolates can acquire the same
 * account simultaneously. For strict mutual exclusion, replace with a
 * distributed lock (e.g. database advisory lock or Redis SETNX).
 */
const inUseAccountIds = new Set<string>();

export function isAccountInUse(accountId: string): boolean {
  return inUseAccountIds.has(accountId);
}

export function tryAcquireAccount(accountId: string): boolean {
  if (inUseAccountIds.has(accountId)) {
    return false;
  }
  inUseAccountIds.add(accountId);
  return true;
}

export function releaseAccount(accountId: string | undefined): void {
  if (!accountId) return;
  inUseAccountIds.delete(accountId);
}
