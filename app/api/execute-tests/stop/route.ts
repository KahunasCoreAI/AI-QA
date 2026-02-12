import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { handleRouteError } from '@/lib/server/route-utils';
import { requireTeamContext } from '@/lib/server/team-context';
import { stopRun } from '@/lib/server/active-runs';

export async function POST(request: NextRequest) {
  try {
    const teamContext = await requireTeamContext();
    enforceRateLimit(`execute-tests-stop:${teamContext.userId}`, { limit: 30, windowMs: 60_000 });

    const body = await request.json();
    const { runId } = body as { runId?: string };

    if (!runId || typeof runId !== 'string') {
      return NextResponse.json({ error: 'runId is required' }, { status: 400 });
    }

    const stopped = stopRun(runId);
    return NextResponse.json({ stopped });
  } catch (error) {
    return handleRouteError(error, 'Failed to stop execution run');
  }
}
