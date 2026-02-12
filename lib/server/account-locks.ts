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
