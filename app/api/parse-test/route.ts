import { NextRequest, NextResponse } from 'next/server';
import { parseTestDescription } from '@/lib/ai-client';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { handleRouteError } from '@/lib/server/route-utils';
import { requireTeamContext } from '@/lib/server/team-context';

export async function POST(request: NextRequest) {
  try {
    const team = await requireTeamContext();
    enforceRateLimit(`parse-test:${team.userId}`, { limit: 40, windowMs: 60_000 });

    const { plainEnglish, websiteUrl, aiModel } = await request.json();

    if (!plainEnglish || !websiteUrl) {
      return NextResponse.json(
        { error: 'plainEnglish and websiteUrl are required' },
        { status: 400 }
      );
    }

    if (!aiModel) {
      return NextResponse.json(
        { error: 'aiModel is required' },
        { status: 400 }
      );
    }

    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json(
        { error: 'OPENROUTER_API_KEY not configured' },
        { status: 500 }
      );
    }

    const result = await parseTestDescription(plainEnglish, websiteUrl, aiModel);

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error, 'Failed to parse test description');
  }
}
