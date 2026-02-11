import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { canManageTeamSettings, requireTeamContext } from '@/lib/server/team-context';
import {
  getTeamProviderKeyStatus,
  updateTeamProviderKeys,
} from '@/lib/server/team-state-store';
import { handleRouteError } from '@/lib/server/route-utils';

export async function GET() {
  try {
    const team = await requireTeamContext();
    enforceRateLimit(`provider-keys:get:${team.userId}`, { limit: 120, windowMs: 60_000 });
    if (!canManageTeamSettings(team.email)) {
      return NextResponse.json({ error: 'Contact Mark' }, { status: 403 });
    }

    const status = await getTeamProviderKeyStatus(team.teamId);
    return NextResponse.json(status);
  } catch (error) {
    return handleRouteError(error, 'Failed to load provider key status');
  }
}

export async function PUT(request: NextRequest) {
  try {
    const team = await requireTeamContext();
    enforceRateLimit(`provider-keys:put:${team.userId}`, { limit: 30, windowMs: 60_000 });
    if (!canManageTeamSettings(team.email)) {
      return NextResponse.json({ error: 'Contact Mark' }, { status: 403 });
    }

    const body = (await request.json()) as {
      hyperbrowser?: string | null;
      browserUseCloud?: string | null;
    };

    const status = await updateTeamProviderKeys(team.teamId, team.userId, {
      hyperbrowser:
        body.hyperbrowser === undefined ? undefined : body.hyperbrowser?.trim() || null,
      browserUseCloud:
        body.browserUseCloud === undefined ? undefined : body.browserUseCloud?.trim() || null,
    });

    return NextResponse.json(status);
  } catch (error) {
    return handleRouteError(error, 'Failed to update provider keys');
  }
}
