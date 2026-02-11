import { NextRequest, NextResponse } from 'next/server';
import type { QASettings } from '@/types';
import { DEFAULT_BROWSER_PROVIDER, getBrowserProvider } from '@/lib/browser/providers';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { handleRouteError } from '@/lib/server/route-utils';
import { requireTeamContext } from '@/lib/server/team-context';
import { getOrCreateTeamState, getTeamProviderKeys } from '@/lib/server/team-state-store';

function normalizeSettings(settings?: Partial<QASettings>): Partial<QASettings> {
  return {
    ...settings,
    browserProvider: settings?.browserProvider || DEFAULT_BROWSER_PROVIDER,
    providerApiKeys: settings?.providerApiKeys || {},
  };
}

/**
 * DELETE /api/auth-session — Delete provider profile
 */
export async function DELETE(request: NextRequest) {
  try {
    const team = await requireTeamContext();
    enforceRateLimit(`auth-session:delete:${team.userId}`, { limit: 40, windowMs: 60_000 });

    const body = await request.json();
    const { profileId, settings: rawSettings } = body;
    const providerKeys = await getTeamProviderKeys(team.teamId);
    const settings = normalizeSettings({
      ...rawSettings,
      providerApiKeys: {
        hyperbrowser: providerKeys.hyperbrowser || undefined,
        browserUseCloud: providerKeys.browserUseCloud || undefined,
      },
    });

    if (!profileId) {
      return NextResponse.json({ error: 'Missing required field: profileId' }, { status: 400 });
    }

    const provider = getBrowserProvider(settings.browserProvider);
    await provider.deleteProfile(profileId, settings);

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleRouteError(error, 'Failed to delete provider profile');
  }
}

/**
 * POST /api/auth-session — Create/reuse profile and log in
 */
export async function POST(request: NextRequest) {
  try {
    const team = await requireTeamContext();
    enforceRateLimit(`auth-session:post:${team.userId}`, { limit: 40, windowMs: 60_000 });

    const body = await request.json();
    const {
      accountId,
      projectId,
      websiteUrl,
      profileId: existingProfileId,
      settings: rawSettings,
    } = body;

    if (!accountId || !projectId || !websiteUrl) {
      return NextResponse.json({ error: 'Missing required fields: accountId, projectId, websiteUrl' }, { status: 400 });
    }

    const teamState = await getOrCreateTeamState(team.teamId);
    const account = (teamState.userAccounts[projectId] || []).find((entry) => entry.id === accountId);
    if (!account) {
      return NextResponse.json({ error: 'Account not found for this project.' }, { status: 404 });
    }

    const providerKeys = await getTeamProviderKeys(team.teamId);
    const settings = normalizeSettings({
      ...rawSettings,
      providerApiKeys: {
        hyperbrowser: providerKeys.hyperbrowser || undefined,
        browserUseCloud: providerKeys.browserUseCloud || undefined,
      },
    });

    const provider = getBrowserProvider(settings.browserProvider);
    const result = await provider.loginWithProfile({
      email: account.email,
      password: account.password,
      websiteUrl,
      existingProfileId,
      settings,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'Login did not succeed. The agent could not confirm a successful login.',
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      profileId: result.profileId,
    });
  } catch (error) {
    return handleRouteError(error, 'Failed to create provider auth session');
  }
}
