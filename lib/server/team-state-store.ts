import { eq } from 'drizzle-orm';
import type { QAState } from '@/types';
import { getDb, schema } from '@/lib/db/client';
import { decryptSecret, encryptSecret } from '@/lib/security/encryption';
import {
  buildDefaultState,
  sanitizeStateForClient,
  sanitizeStateForStorage,
} from './default-state';

export interface TeamProviderKeys {
  hyperbrowser?: string;
  browserUseCloud?: string;
}

export async function getOrCreateTeamState(teamId: string): Promise<QAState> {
  const db = getDb();
  const row = await db.query.teamState.findFirst({
    where: eq(schema.teamState.teamId, teamId),
  });

  if (!row) {
    const defaultState = buildDefaultState();
    await db.insert(schema.teamState).values({
      teamId,
      state: defaultState,
    });
    return defaultState;
  }

  return sanitizeStateForStorage(row.state);
}

export async function getTeamStateForClient(teamId: string): Promise<QAState> {
  const state = await getOrCreateTeamState(teamId);
  return sanitizeStateForClient(state);
}

export async function saveTeamState(teamId: string, userId: string | null, nextState: unknown): Promise<QAState> {
  const db = getDb();
  const sanitized = sanitizeStateForStorage(nextState);

  await db
    .insert(schema.teamState)
    .values({
      teamId,
      state: sanitized,
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.teamState.teamId,
      set: {
        state: sanitized,
        updatedBy: userId,
        updatedAt: new Date(),
      },
    });

  return sanitizeStateForClient(sanitized);
}

export async function getTeamProviderKeys(teamId: string): Promise<TeamProviderKeys> {
  const db = getDb();
  const row = await db.query.teamSecrets.findFirst({
    where: eq(schema.teamSecrets.teamId, teamId),
  });

  if (!row) return {};

  return {
    hyperbrowser: row.hyperbrowserApiKeyEncrypted
      ? decryptSecret(row.hyperbrowserApiKeyEncrypted)
      : undefined,
    browserUseCloud: row.browserUseCloudApiKeyEncrypted
      ? decryptSecret(row.browserUseCloudApiKeyEncrypted)
      : undefined,
  };
}

export async function getTeamProviderKeyStatus(teamId: string): Promise<{
  hyperbrowserConfigured: boolean;
  browserUseCloudConfigured: boolean;
}> {
  const db = getDb();
  const row = await db.query.teamSecrets.findFirst({
    where: eq(schema.teamSecrets.teamId, teamId),
  });

  return {
    hyperbrowserConfigured: Boolean(row?.hyperbrowserApiKeyEncrypted),
    browserUseCloudConfigured: Boolean(row?.browserUseCloudApiKeyEncrypted),
  };
}

export async function updateTeamProviderKeys(
  teamId: string,
  userId: string,
  payload: {
    hyperbrowser?: string | null;
    browserUseCloud?: string | null;
  }
) {
  const db = getDb();
  const existing = await db.query.teamSecrets.findFirst({
    where: eq(schema.teamSecrets.teamId, teamId),
  });

  const nextHyperbrowser =
    payload.hyperbrowser === undefined
      ? existing?.hyperbrowserApiKeyEncrypted || null
      : payload.hyperbrowser
      ? encryptSecret(payload.hyperbrowser)
      : null;

  const nextBrowserUseCloud =
    payload.browserUseCloud === undefined
      ? existing?.browserUseCloudApiKeyEncrypted || null
      : payload.browserUseCloud
      ? encryptSecret(payload.browserUseCloud)
      : null;

  await db
    .insert(schema.teamSecrets)
    .values({
      teamId,
      hyperbrowserApiKeyEncrypted: nextHyperbrowser,
      browserUseCloudApiKeyEncrypted: nextBrowserUseCloud,
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.teamSecrets.teamId,
      set: {
        hyperbrowserApiKeyEncrypted: nextHyperbrowser,
        browserUseCloudApiKeyEncrypted: nextBrowserUseCloud,
        updatedBy: userId,
        updatedAt: new Date(),
      },
    });

  return getTeamProviderKeyStatus(teamId);
}

