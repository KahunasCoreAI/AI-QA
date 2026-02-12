import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { QAState } from '@/types';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { handleRouteError } from '@/lib/server/route-utils';
import { requireTeamContext } from '@/lib/server/team-context';
import { getOrCreateTeamState, saveTeamState } from '@/lib/server/team-state-store';

const discardSchema = z.object({
  projectId: z.string().min(1),
  draftIds: z.array(z.string().min(1)).min(1),
});

export async function POST(request: NextRequest) {
  try {
    const team = await requireTeamContext();
    enforceRateLimit(`generate-tests:discard:${team.userId}`, { limit: 60, windowMs: 60_000 });

    const body = discardSchema.parse(await request.json());
    const state = await getOrCreateTeamState(team.teamId);
    const projectDrafts = state.aiDrafts[body.projectId] || [];
    const discardSet = new Set(body.draftIds);

    const updatedDrafts = projectDrafts.map((draft) => {
      if (!discardSet.has(draft.id)) return draft;
      return {
        ...draft,
        status: 'discarded' as const,
        discardedAt: Date.now(),
      };
    });

    const remainingDrafts = updatedDrafts.filter(
      (draft) => draft.status === 'draft' || draft.status === 'duplicate_skipped'
    );

    const nextState: QAState = {
      ...state,
      aiDrafts: {
        ...state.aiDrafts,
        [body.projectId]: remainingDrafts,
      },
      aiDraftNotifications: {
        ...state.aiDraftNotifications,
        [body.projectId]: {
          hasUnseenDrafts: remainingDrafts.some((draft) => draft.status === 'draft'),
          lastSeenAt: state.aiDraftNotifications[body.projectId]?.lastSeenAt,
        },
      },
      lastUpdated: Date.now(),
    };

    const savedState = await saveTeamState(team.teamId, team.userId, nextState);

    return NextResponse.json({
      success: true,
      drafts: remainingDrafts,
      jobs: nextState.aiGenerationJobs[body.projectId] || [],
      notification: nextState.aiDraftNotifications[body.projectId] || { hasUnseenDrafts: false },
      state: savedState,
    });
  } catch (error) {
    return handleRouteError(error, 'Failed to discard AI draft tests.');
  }
}
