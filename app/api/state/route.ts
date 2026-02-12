import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { canManageTeamSettings, requireTeamContext } from '@/lib/server/team-context';
import { getOrCreateTeamState, getTeamStateForClient, saveTeamState } from '@/lib/server/team-state-store';
import { handleRouteError } from '@/lib/server/route-utils';

export async function GET() {
  try {
    const team = await requireTeamContext();
    enforceRateLimit(`state:get:${team.userId}`, { limit: 120, windowMs: 60_000 });

    const state = await getTeamStateForClient(team.teamId);
    return NextResponse.json({
      state,
      viewer: {
        id: team.userId,
        email: team.email,
        displayName: team.displayName,
      },
    });
  } catch (error) {
    return handleRouteError(error, 'Failed to load state');
  }
}

export async function PUT(request: NextRequest) {
  try {
    const team = await requireTeamContext();
    enforceRateLimit(`state:put:${team.userId}`, { limit: 120, windowMs: 60_000 });

    const body = await request.json();
    const nextState = body?.state;
    if (!nextState) {
      return NextResponse.json({ error: 'state is required' }, { status: 400 });
    }

    const canManage = canManageTeamSettings(team.email);
    let stateToSave: unknown;

    if (canManage) {
      stateToSave = nextState;
    } else {
      const currentState = await getOrCreateTeamState(team.teamId);
      stateToSave = {
        ...(nextState as Record<string, unknown>),
        settings: currentState.settings,
        projects: currentState.projects,
      };
    }

    const saved = await saveTeamState(team.teamId, team.userId, stateToSave);
    return NextResponse.json({ state: saved });
  } catch (error) {
    return handleRouteError(error, 'Failed to save state');
  }
}
