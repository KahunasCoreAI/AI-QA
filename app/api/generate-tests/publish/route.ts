import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { GeneratedTest, QAState, TestCase, TestGroup } from '@/types';
import { generateId } from '@/lib/utils';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { handleRouteError } from '@/lib/server/route-utils';
import { requireTeamContext } from '@/lib/server/team-context';
import { getOrCreateTeamState, saveTeamState } from '@/lib/server/team-state-store';

const publishSchema = z.object({
  projectId: z.string().min(1),
  draftIds: z.array(z.string().min(1)).min(1),
  groupName: z.string().trim().min(1).max(120).optional(),
});

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSignature(test: GeneratedTest): string {
  return `${normalizeText(test.title)}|${normalizeText(test.description)}|${normalizeText(test.expectedOutcome)}`;
}

export async function POST(request: NextRequest) {
  try {
    const team = await requireTeamContext();
    enforceRateLimit(`generate-tests:publish:${team.userId}`, { limit: 40, windowMs: 60_000 });

    const body = publishSchema.parse(await request.json());
    const state = await getOrCreateTeamState(team.teamId);
    const project = state.projects.find((entry) => entry.id === body.projectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    }

    const projectDrafts = state.aiDrafts[body.projectId] || [];
    const draftSet = new Set(body.draftIds);
    const selectedDrafts = projectDrafts.filter(
      (draft) => draftSet.has(draft.id) && draft.status === 'draft'
    );

    if (selectedDrafts.length === 0) {
      return NextResponse.json(
        { error: 'No publishable drafts found for the provided draft IDs.' },
        { status: 400 }
      );
    }

    const existingTests = state.testCases[body.projectId] || [];
    const existingSignatures = new Set(existingTests.map((testCase) => buildSignature(testCase)));

    const publishableDrafts = [];
    const skippedDraftIds: string[] = [];
    for (const draft of selectedDrafts) {
      const signature = buildSignature(draft);
      if (existingSignatures.has(signature)) {
        skippedDraftIds.push(draft.id);
        continue;
      }
      existingSignatures.add(signature);
      publishableDrafts.push(draft);
    }

    const createdAt = Date.now();
    const newTests: TestCase[] = publishableDrafts.map((draft, index) => ({
      id: generateId(),
      projectId: body.projectId,
      title: draft.title,
      description: draft.description,
      expectedOutcome: draft.expectedOutcome,
      status: 'pending',
      createdAt: createdAt + index,
      createdByUserId: team.userId,
      createdByName: team.displayName,
      userAccountId: draft.userAccountId,
    }));

    const nextTestCases = [...existingTests, ...newTests];

    let nextGroups: TestGroup[] = state.testGroups[body.projectId] || [];
    let createdOrUpdatedGroupId: string | undefined;
    const requestedGroupName = body.groupName?.trim();
    if (requestedGroupName && newTests.length > 0) {
      const normalizedRequested = requestedGroupName.toLowerCase();
      const existingGroup = nextGroups.find((group) => group.name.trim().toLowerCase() === normalizedRequested);
      if (existingGroup) {
        createdOrUpdatedGroupId = existingGroup.id;
        nextGroups = nextGroups.map((group) =>
          group.id === existingGroup.id
            ? {
                ...group,
                testCaseIds: [...group.testCaseIds, ...newTests.map((testCase) => testCase.id)],
              }
            : group
        );
      } else {
        const createdGroup: TestGroup = {
          id: generateId(),
          projectId: body.projectId,
          name: requestedGroupName,
          testCaseIds: newTests.map((testCase) => testCase.id),
          createdAt,
          lastRunStatus: 'never_run',
        };
        nextGroups = [...nextGroups, createdGroup];
        createdOrUpdatedGroupId = createdGroup.id;
      }
    }

    const publishedDraftIds = new Set(publishableDrafts.map((draft) => draft.id));
    const skippedDraftSet = new Set(skippedDraftIds);
    const nextDrafts = projectDrafts.map((draft) => {
      if (!draftSet.has(draft.id)) return draft;
      if (publishedDraftIds.has(draft.id)) {
        return { ...draft, status: 'published' as const, publishedAt: Date.now() };
      }
      if (skippedDraftSet.has(draft.id)) {
        return {
          ...draft,
          status: 'duplicate_skipped' as const,
          duplicateReason: draft.duplicateReason || 'Duplicate skipped at publish time.',
        };
      }
      return draft;
    });

    const remainingDrafts = nextDrafts.filter(
      (draft) => draft.status === 'draft' || draft.status === 'duplicate_skipped'
    );

    const nextState: QAState = {
      ...state,
      testCases: {
        ...state.testCases,
        [body.projectId]: nextTestCases,
      },
      testGroups: {
        ...state.testGroups,
        [body.projectId]: nextGroups,
      },
      aiDrafts: {
        ...state.aiDrafts,
        [body.projectId]: remainingDrafts,
      },
      aiDraftNotifications: {
        ...state.aiDraftNotifications,
        [body.projectId]: {
          hasUnseenDrafts: (() => {
            const lastSeenAt = state.aiDraftNotifications[body.projectId]?.lastSeenAt;
            return lastSeenAt
              ? remainingDrafts.some((d) => d.status === 'draft' && d.createdAt > lastSeenAt)
              : remainingDrafts.some((d) => d.status === 'draft');
          })(),
          lastSeenAt: state.aiDraftNotifications[body.projectId]?.lastSeenAt,
        },
      },
      projects: state.projects.map((entry) =>
        entry.id === body.projectId
          ? { ...entry, testCount: nextTestCases.length }
          : entry
      ),
      lastUpdated: Date.now(),
    };

    const savedState = await saveTeamState(team.teamId, team.userId, nextState);

    return NextResponse.json({
      success: true,
      publishedCount: newTests.length,
      skippedDuplicates: selectedDrafts.length - newTests.length,
      groupId: createdOrUpdatedGroupId,
      jobs: nextState.aiGenerationJobs[body.projectId] || [],
      drafts: remainingDrafts,
      notification: nextState.aiDraftNotifications[body.projectId] || { hasUnseenDrafts: false },
      testCases: nextTestCases,
      groups: nextGroups,
      state: savedState,
    });
  } catch (error) {
    return handleRouteError(error, 'Failed to publish AI-generated drafts.');
  }
}
