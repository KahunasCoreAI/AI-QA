import { auth, currentUser } from '@clerk/nextjs/server';
import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db/client';

const DEFAULT_ALLOWED_EMAIL_DOMAIN = 'example.com';

function readSetting(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

export const ALLOWED_EMAIL_DOMAIN = readSetting(
  process.env.ALLOWED_EMAIL_DOMAIN || process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN,
  DEFAULT_ALLOWED_EMAIL_DOMAIN
).toLowerCase();

export const SHARED_TEAM_ID = readSetting(process.env.SHARED_TEAM_ID, 'team-default');

export const SETTINGS_OWNER_EMAIL = readSetting(
  process.env.SETTINGS_OWNER_EMAIL || process.env.NEXT_PUBLIC_SETTINGS_OWNER_EMAIL,
  `owner@${ALLOWED_EMAIL_DOMAIN}`
).toLowerCase();

export class AccessError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'AccessError';
  }
}

function readPrimaryEmail(user: Awaited<ReturnType<typeof currentUser>>): string | null {
  if (!user) return null;

  const primaryId = user.primaryEmailAddressId;
  const primary = user.emailAddresses.find((entry) => entry.id === primaryId) || user.emailAddresses[0];
  if (!primary?.emailAddress) return null;
  return primary.emailAddress;
}

export async function requireTeamContext() {
  const authState = await auth();
  if (!authState.userId) {
    throw new AccessError(401, 'Authentication required.');
  }

  const user = await currentUser();
  const email = readPrimaryEmail(user);
  if (!email) {
    throw new AccessError(403, 'A verified email address is required.');
  }

  const normalizedEmail = email.toLowerCase();
  if (!normalizedEmail.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
    throw new AccessError(403, `Access restricted to ${ALLOWED_EMAIL_DOMAIN} users.`);
  }

  const db = getDb();
  const userId = authState.userId;
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || null;
  const firstName = user?.firstName?.trim() || null;
  const fallbackDisplayName = normalizedEmail.split('@')[0] || userId;
  const displayName = firstName || fallbackDisplayName;

  await db
    .insert(schema.teams)
    .values({
      id: SHARED_TEAM_ID,
      name: 'Shared Team',
      allowedEmailDomain: ALLOWED_EMAIL_DOMAIN,
    })
    .onConflictDoNothing();

  await db
    .insert(schema.users)
    .values({
      id: userId,
      email: normalizedEmail,
      fullName,
    })
    .onConflictDoUpdate({
      target: schema.users.id,
      set: {
        email: normalizedEmail,
        fullName,
        updatedAt: new Date(),
      },
    });

  await db
    .insert(schema.memberships)
    .values({
      teamId: SHARED_TEAM_ID,
      userId,
      role: 'member',
    })
    .onConflictDoNothing();

  const membership = await db.query.memberships.findFirst({
    where: and(eq(schema.memberships.teamId, SHARED_TEAM_ID), eq(schema.memberships.userId, userId)),
  });

  if (!membership) {
    throw new AccessError(403, 'Team membership missing.');
  }

  return {
    teamId: SHARED_TEAM_ID,
    userId,
    email: normalizedEmail,
    displayName,
  };
}

export function canManageTeamSettings(email: string): boolean {
  return email.toLowerCase() === SETTINGS_OWNER_EMAIL;
}
