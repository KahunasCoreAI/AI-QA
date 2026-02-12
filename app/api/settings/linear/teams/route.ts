import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { handleRouteError } from '@/lib/server/route-utils';
import { requireTeamContext } from '@/lib/server/team-context';
import { getViewerTeams, LinearApiError } from '@/lib/server/linear-client';
import { getUserLinearConfig } from '@/lib/server/user-secrets-store';

export async function POST(request: NextRequest) {
  try {
    const team = await requireTeamContext();
    enforceRateLimit(`linear-settings:teams:${team.userId}`, { limit: 60, windowMs: 60_000 });

    const body = (await request.json().catch(() => ({}))) as {
      apiKey?: string;
    };

    const providedApiKey = body.apiKey?.trim();
    const stored = providedApiKey ? undefined : await getUserLinearConfig(team.userId);
    const apiKey = providedApiKey || stored?.apiKey;

    if (!apiKey) {
      return NextResponse.json({ error: 'Linear API key is required.' }, { status: 400 });
    }

    const teams = await getViewerTeams(apiKey);
    const sorted = [...teams].sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      teams: sorted,
    });
  } catch (error) {
    if (error instanceof LinearApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return handleRouteError(error, 'Failed to load Linear teams');
  }
}
