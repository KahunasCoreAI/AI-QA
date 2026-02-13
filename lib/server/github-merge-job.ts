/**
 * GitHub merge job processor - handles async processing of merged PRs
 */

import { getOrCreateTeamState, saveTeamState } from './team-state-store';
import { fetchPRFiles, type PRFile } from './github-client';
import type { QAState, GeneratedTestDraft, AiGenerationJob } from '@/types';
import { generateId } from '@/lib/utils';

const DEFAULT_AI_MODEL = process.env.NEXT_PUBLIC_DEFAULT_AI_MODEL || 'openai/gpt-5.2';
const SHARED_TEAM_ID = process.env.SHARED_TEAM_ID || 'team-default';

// Domain keywords for categorizing test groups
const DOMAIN_KEYWORDS = [
  'auth', 'login', 'signup', 'register', 'dashboard', 'settings', 'profile',
  'billing', 'payment', 'checkout', 'cart', 'user', 'admin', 'home',
  'landing', 'pricing', 'contact', 'about', 'navigation', 'menu', 'sidebar',
  'header', 'footer', 'modal', 'form', 'input', 'button', 'link', 'table',
  'list', 'search', 'filter', 'sort', 'pagination', 'upload', 'download',
];

export interface MergeJobInput {
  prNumber: number;
  prTitle: string;
  prBody: string | null;
  repoFullName: string;
  mergedBy: string | null;
}

export interface MergeJobResult {
  success: boolean;
  draftCount: number;
  message: string;
  projectId?: string;
}

/**
 * Extract frontend file changes from PR files
 */
export function extractFrontendChanges(files: PRFile[]): {
  frontendFiles: string[];
  changedComponents: string[];
  domains: string[];
} {
  const frontendExtensions = ['.tsx', '.jsx', '.ts', '.js', '.css', '.scss', '.less'];
  const componentPatterns = ['/components/', '/ui/', '/pages/', '/app/', '/views/'];

  const frontendFiles: string[] = [];
  const changedComponents: string[] = [];
  const domains: string[] = [];

  for (const file of files) {
    const ext = file.filename.substring(file.filename.lastIndexOf('.'));
    const isFrontend = frontendExtensions.includes(ext.toLowerCase());

    if (isFrontend) {
      frontendFiles.push(file.filename);

      // Extract component path
      for (const pattern of componentPatterns) {
        if (file.filename.includes(pattern)) {
          const parts = file.filename.split(pattern);
          if (parts.length > 1) {
            const componentName = parts[1].split('/')[0].replace(/\.(tsx|jsx|ts|js)$/, '');
            if (componentName && !changedComponents.includes(componentName)) {
              changedComponents.push(componentName);
            }
          }
        }
      }
    }

    // Extract domain from file path
    const lowerPath = file.filename.toLowerCase();
    for (const keyword of DOMAIN_KEYWORDS) {
      if (lowerPath.includes(keyword) && !domains.includes(keyword)) {
        domains.push(keyword);
      }
    }
  }

  return {
    frontendFiles,
    changedComponents,
    domains,
  };
}

/**
 * Find or create a suitable project for webhook tests
 */
function findOrCreateProject(
  state: QAState,
  repoFullName: string
): { projectId: string; isNew: boolean } {
  const repoName = repoFullName.split('/')[1];

  // Try to find existing project matching the repo
  const existingProject = state.projects.find(
    (p) => p.websiteUrl.includes(repoName) || p.name.includes(repoName)
  );

  if (existingProject) {
    return { projectId: existingProject.id, isNew: false };
  }

  // Create a new project for this repo
  const projectId = generateId();
  const newProject = {
    id: projectId,
    name: `${repoName} Tests`,
    websiteUrl: `https://${repoFullName.replace('/', '.github.io/')}`,
    createdAt: Date.now(),
  };

  state.projects.push(newProject);
  state.testCases[projectId] = [];
  state.testRuns[projectId] = [];
  state.testGroups[projectId] = [];
  state.userAccounts[projectId] = [];
  state.aiGenerationJobs[projectId] = [];
  state.aiDrafts[projectId] = [];
  state.aiDraftNotifications[projectId] = { hasUnseenDrafts: false };

  return { projectId, isNew: true };
}

/**
 * Generate test suggestions using AI
 * This is a placeholder - in production, you'd call the AI client
 */
async function generateTestSuggestions(
  prTitle: string,
  prBody: string | null,
  frontendFiles: string[],
  domains: string[]
): Promise<Array<{
  title: string;
  description: string;
  expectedOutcome: string;
  groupName: string;
}>> {
  // For now, generate basic suggestions based on the PR
  // In production, this would call the AI client
  
  const changedFilesList = frontendFiles.slice(0, 10).map((f) => `- ${f}`).join('\n');
  const groupName = domains[0] || 'general';

  const suggestions = [
    {
      title: `Verify ${prTitle} functionality`,
      description: `Test that the changes from PR "${prTitle}" work correctly. ${prBody ? `Description: ${prBody.slice(0, 200)}` : ''}`,
      expectedOutcome: 'The PR changes should function as described and pass all validations',
      groupName,
    },
  ];

  // Add component-specific tests if we have changed components
  if (frontendFiles.length > 1) {
    suggestions.push({
      title: `Verify ${frontendFiles.length} changed files integration`,
      description: `Test that the ${frontendFiles.length} changed files work together correctly.\n\nChanged files:\n${changedFilesList}`,
      expectedOutcome: 'All changed files should integrate without conflicts',
      groupName,
    });
  }

  // Add domain-specific tests
  for (const domain of domains.slice(0, 2)) {
    if (domain !== groupName) {
      suggestions.push({
        title: `Verify ${domain} feature works`,
        description: `Test the ${domain} feature that was modified in this PR`,
        expectedOutcome: `${domain} feature should work as expected`,
        groupName: domain,
      });
    }
  }

  return suggestions;
}

/**
 * Process a merged PR and create draft tests
 */
export async function processMergedPR(
  prNumber: number,
  prTitle: string,
  prBody: string | null,
  repoFullName: string
): Promise<MergeJobResult> {
  try {
    // Fetch changed files from the PR
    const [owner, repo] = repoFullName.split('/');
    let prFiles: Awaited<ReturnType<typeof fetchPRFiles>>;

    try {
      prFiles = await fetchPRFiles(owner, repo, prNumber);
    } catch (error) {
      console.error('Failed to fetch PR files:', error);
      return {
        success: false,
        draftCount: 0,
        message: `Failed to fetch PR files: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }

    // Extract frontend changes
    const { frontendFiles, domains } = extractFrontendChanges(prFiles.files);

    if (frontendFiles.length === 0) {
      return {
        success: true,
        draftCount: 0,
        message: 'No frontend files changed in this PR',
      };
    }

    // Generate AI test suggestions
    const testSuggestions = await generateTestSuggestions(
      prTitle,
      prBody,
      frontendFiles,
      domains
    );

    if (testSuggestions.length === 0) {
      return {
        success: true,
        draftCount: 0,
        message: 'No test suggestions generated',
      };
    }

    // Get the team state
    const state = await getOrCreateTeamState(SHARED_TEAM_ID);

    // Find or create a project for this PR
    const { projectId } = findOrCreateProject(state, repoFullName);

    // Create a job for this PR
    const jobId = generateId();
    const job: AiGenerationJob = {
      id: jobId,
      projectId,
      prompt: `Auto-generated from GitHub PR #${prNumber}: ${prTitle}`,
      groupName: domains[0] || 'general',
      browserProvider: 'hyperbrowser-browser-use',
      settingsSnapshot: state.settings,
      aiModel: DEFAULT_AI_MODEL,
      status: 'completed',
      createdAt: Date.now(),
      completedAt: Date.now(),
      draftCount: testSuggestions.length,
      duplicateCount: 0,
    };

    // Create drafts from suggestions
    const now = Date.now();
    const drafts: GeneratedTestDraft[] = testSuggestions.map((suggestion, index) => ({
      id: generateId(),
      projectId,
      jobId,
      title: suggestion.title,
      description: suggestion.description,
      expectedOutcome: suggestion.expectedOutcome,
      groupName: suggestion.groupName,
      status: 'draft' as const,
      createdAt: now + index,
    }));

    // Update state with job and drafts
    const existingJobs = state.aiGenerationJobs[projectId] || [];
    const existingDrafts = state.aiDrafts[projectId] || [];
    const existingNotification = state.aiDraftNotifications[projectId] || { hasUnseenDrafts: false };

    const nextState: QAState = {
      ...state,
      projects: state.projects,
      aiGenerationJobs: {
        ...state.aiGenerationJobs,
        [projectId]: [job, ...existingJobs].slice(0, 30),
      },
      aiDrafts: {
        ...state.aiDrafts,
        [projectId]: [...existingDrafts, ...drafts],
      },
      aiDraftNotifications: {
        ...state.aiDraftNotifications,
        [projectId]: {
          hasUnseenDrafts: true,
          lastSeenAt: existingNotification.lastSeenAt,
        },
      },
      lastUpdated: Date.now(),
    };

    // Save state with system user
    await saveTeamState(SHARED_TEAM_ID, 'system', nextState);

    return {
      success: true,
      draftCount: drafts.length,
      message: `Created ${drafts.length} draft tests from PR #${prNumber}`,
      projectId,
    };
  } catch (error) {
    console.error('Failed to process merged PR:', error);
    return {
      success: false,
      draftCount: 0,
      message: `Processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
