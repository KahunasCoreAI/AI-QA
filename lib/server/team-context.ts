import { auth, currentUser } from '@clerk/nextjs/server';
import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db/client';

export const ALLOWED_EMAIL_DOMAIN = 'kahunas.io';
export const SHARED_TEAM_ID = 'team-kahunas';

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

  await db
    .insert(schema.teams)
    .values({
      id: SHARED_TEAM_ID,
      name: 'Kahunas Team',
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
  };
}

