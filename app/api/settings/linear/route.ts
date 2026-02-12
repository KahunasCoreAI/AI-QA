import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { handleRouteError } from '@/lib/server/route-utils';
import { requireTeamContext } from '@/lib/server/team-context';
import {
  getUserLinearConfigStatus,
  updateUserLinearConfig,
} from '@/lib/server/user-secrets-store';

export async function GET() {
  try {
    const team = await requireTeamContext();
    enforceRateLimit(`linear-settings:get:${team.userId}`, { limit: 120, windowMs: 60_000 });

    const status = await getUserLinearConfigStatus(team.userId);
    return NextResponse.json(status);
  } catch (error) {
    return handleRouteError(error, 'Failed to load Linear settings');
  }
}

export async function PUT(request: NextRequest) {
  try {
    const team = await requireTeamContext();
    enforceRateLimit(`linear-settings:put:${team.userId}`, { limit: 30, windowMs: 60_000 });

    const body = (await request.json()) as {
      apiKey?: string | null;
      defaultTeamId?: string | null;
      defaultTeamName?: string | null;
    };

    const normalizedApiKey =
      body.apiKey === undefined ? undefined : body.apiKey?.trim() ? body.apiKey.trim() : null;
    const normalizedTeamId =
      body.defaultTeamId === undefined
        ? undefined
        : body.defaultTeamId?.trim()
        ? body.defaultTeamId.trim()
        : null;
    const normalizedTeamName =
      body.defaultTeamName === undefined
        ? undefined
        : body.defaultTeamName?.trim()
        ? body.defaultTeamName.trim()
        : null;

    if (normalizedTeamName && !normalizedTeamId) {
      return NextResponse.json({ error: 'defaultTeamId is required when defaultTeamName is provided.' }, { status: 400 });
    }

    const existing = await getUserLinearConfigStatus(team.userId);
    const hasApiKeyAfterUpdate =
      normalizedApiKey === undefined ? existing.configured : Boolean(normalizedApiKey);

    if (normalizedTeamId && !hasApiKeyAfterUpdate) {
      return NextResponse.json({ error: 'Save a Linear API key before selecting a default team.' }, { status: 400 });
    }

    const status = await updateUserLinearConfig(team.userId, {
      apiKey: normalizedApiKey,
      defaultTeamId: normalizedTeamId,
      defaultTeamName: normalizedTeamName,
    });

    return NextResponse.json(status);
  } catch (error) {
    return handleRouteError(error, 'Failed to update Linear settings');
  }
}
