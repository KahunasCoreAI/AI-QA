import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db/client';
import { decryptSecret, encryptSecret } from '@/lib/security/encryption';

export interface UserLinearConfig {
  apiKey?: string;
  defaultTeamId?: string;
  defaultTeamName?: string;
}

export interface UserLinearConfigStatus {
  configured: boolean;
  defaultTeamId?: string;
  defaultTeamName?: string;
}

export async function getUserLinearConfig(userId: string): Promise<UserLinearConfig> {
  const db = getDb();
  const row = await db.query.userSecrets.findFirst({
    where: eq(schema.userSecrets.userId, userId),
  });

  if (!row) return {};

  return {
    apiKey: row.linearApiKeyEncrypted ? decryptSecret(row.linearApiKeyEncrypted) : undefined,
    defaultTeamId: row.linearDefaultTeamId || undefined,
    defaultTeamName: row.linearDefaultTeamName || undefined,
  };
}

export async function getUserLinearConfigStatus(userId: string): Promise<UserLinearConfigStatus> {
  const db = getDb();
  const row = await db.query.userSecrets.findFirst({
    where: eq(schema.userSecrets.userId, userId),
  });

  return {
    configured: Boolean(row?.linearApiKeyEncrypted),
    defaultTeamId: row?.linearDefaultTeamId || undefined,
    defaultTeamName: row?.linearDefaultTeamName || undefined,
  };
}

export async function updateUserLinearConfig(
  userId: string,
  payload: {
    apiKey?: string | null;
    defaultTeamId?: string | null;
    defaultTeamName?: string | null;
  }
): Promise<UserLinearConfigStatus> {
  const db = getDb();
  const existing = await db.query.userSecrets.findFirst({
    where: eq(schema.userSecrets.userId, userId),
  });

  const nextApiKeyEncrypted =
    payload.apiKey === undefined
      ? existing?.linearApiKeyEncrypted || null
      : payload.apiKey
      ? encryptSecret(payload.apiKey)
      : null;

  // If key is removed, clear team defaults unless explicitly provided.
  const keyWasRemoved = payload.apiKey !== undefined && !payload.apiKey;

  const nextTeamId =
    payload.defaultTeamId === undefined
      ? keyWasRemoved
        ? null
        : existing?.linearDefaultTeamId || null
      : payload.defaultTeamId || null;

  const nextTeamName =
    payload.defaultTeamName === undefined
      ? keyWasRemoved
        ? null
        : existing?.linearDefaultTeamName || null
      : payload.defaultTeamName || null;

  await db
    .insert(schema.userSecrets)
    .values({
      userId,
      linearApiKeyEncrypted: nextApiKeyEncrypted,
      linearDefaultTeamId: nextTeamId,
      linearDefaultTeamName: nextTeamName,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.userSecrets.userId,
      set: {
        linearApiKeyEncrypted: nextApiKeyEncrypted,
        linearDefaultTeamId: nextTeamId,
        linearDefaultTeamName: nextTeamName,
        updatedAt: new Date(),
      },
    });

  return getUserLinearConfigStatus(userId);
}
