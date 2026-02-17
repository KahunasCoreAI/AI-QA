"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useQA } from '@/lib/qa-context';
import { useTestExecution } from '@/lib/hooks';
import {
  DashboardLayout,
  ProjectDialog,
  TestCaseEditor,
  TestCaseList,
  TestCaseDetail,
  TestExecutionGrid,
  TestResultsTable,
  SettingsPanel,
  LinearSettingsCard,
  AITestGenerator,
  AiExplorationCard,
  CreateGroupDialog,
  UserAccountsManager,
  AutomationsPanel,
  AutomationDetail,
  AutomationSettingsCard,
} from '@/components/qa';
import type { TabType } from '@/components/qa/dashboard-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Plus,
  ArrowLeft,
  Play,
  Square,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  Lock,
} from 'lucide-react';
import type {
  AiGenerationJob,
  AutomationRun,
  GeneratedTestDraft,
  QAState,
  Project,
  TestCase,
  TestRun,
  TestGroup,
  BrowserProvider,
  UserAccount,
  AccountProfileProviderKey,
} from '@/types';

type TestCreationMode = 'choice' | 'manual' | 'ai';
type AccountProviderColumn = 'hyperbrowser' | 'browser-use-cloud';

function getProviderProfileKey(provider: BrowserProvider): AccountProfileProviderKey {
  return provider === 'browser-use-cloud' ? 'browserUseCloud' : 'hyperbrowser';
}

function resolveProviderForColumn(
  providerColumn: AccountProviderColumn,
  selectedProvider: BrowserProvider
): BrowserProvider {
  if (providerColumn === 'browser-use-cloud') return 'browser-use-cloud';
  return selectedProvider === 'browser-use-cloud' ? 'hyperbrowser-browser-use' : selectedProvider;
}

export default function DashboardPage() {
  const {
    state,
    dispatch,
    currentViewer,
    createProject,
    updateProject,
    deleteProject,
    setCurrentProject,
    createTestCase,
    updateTestCase,
    deleteTestCase,
    createTestGroup,
    updateTestGroup,
    deleteTestGroup,
    getTestGroupsForProject,
    createUserAccount,
    updateUserAccount,
    deleteUserAccount,
    getUserAccountsForProject,
    startTestRun,
    updateTestResult,
    completeTestRun,
    patchTestResult,
    deleteTestResult,
    clearTestRuns,
    updateSettings,
    syncAiGenerationProjectState,
    markAiDraftsSeen,
    getAiGenerationJobsForProject,
    getAiDraftsForProject,
    getAiDraftNotificationForProject,
    deleteAutomationRun,
    updateAutomationSettings,
    getAutomationRunsForProject,
    getCurrentProject,
    getTestCasesForProject,
    getTestRunsForProject,
    reset,
  } = useQA();

  const [activeTab, setActiveTab] = useState<TabType>('tests');
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | undefined>();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
  const [testCaseToDelete, setTestCaseToDelete] = useState<{ id: string; projectId: string } | null>(null);
  const [groupToDelete, setGroupToDelete] = useState<{ id: string; projectId: string } | null>(null);
  const [selectedTestIds, setSelectedTestIds] = useState<Set<string>>(new Set());
  const [testCreationMode, setTestCreationMode] = useState<TestCreationMode | null>(null);
  const [editingTestCase, setEditingTestCase] = useState<TestCase | undefined>();
  const [editingDraft, setEditingDraft] = useState<GeneratedTestDraft | null>(null);
  const [viewingTestCase, setViewingTestCase] = useState<TestCase | null>(null);
  const [createGroupDialogOpen, setCreateGroupDialogOpen] = useState(false);
  const [executionViewRunId, setExecutionViewRunId] = useState<string | null>(null);
  const [isPublishingDrafts, setIsPublishingDrafts] = useState(false);
  const [showAiLockedMessage, setShowAiLockedMessage] = useState(false);
  const [viewingAutomationRunId, setViewingAutomationRunId] = useState<string | null>(null);

  const currentProject = getCurrentProject();
  const currentUserEmail = (currentViewer?.email || '').toLowerCase();
  const currentUserFirstName = currentViewer?.displayName;
  const canManageSettings = currentViewer?.canManageSettings === true;
  const canManageProjects = canManageSettings;
  const testCases = useMemo(
    () => currentProject ? getTestCasesForProject(currentProject.id) : [],
    [currentProject, getTestCasesForProject]
  );
  const testGroups = useMemo(
    () => currentProject ? getTestGroupsForProject(currentProject.id) : [],
    [currentProject, getTestGroupsForProject]
  );
  const testRuns = useMemo(
    () => currentProject ? getTestRunsForProject(currentProject.id) : [],
    [currentProject, getTestRunsForProject]
  );
  const userAccounts = useMemo(
    () => currentProject ? getUserAccountsForProject(currentProject.id) : [],
    [currentProject, getUserAccountsForProject]
  );
  const aiGenerationJobs = useMemo(
    () => currentProject ? getAiGenerationJobsForProject(currentProject.id) : [],
    [currentProject, getAiGenerationJobsForProject]
  );
  const aiDrafts = useMemo(
    () => currentProject ? getAiDraftsForProject(currentProject.id) : [],
    [currentProject, getAiDraftsForProject]
  );
  const aiDraftNotification = useMemo(
    () => currentProject ? getAiDraftNotificationForProject(currentProject.id) : { hasUnseenDrafts: false },
    [currentProject, getAiDraftNotificationForProject]
  );
  const automationRuns = useMemo(
    () => currentProject ? getAutomationRunsForProject(currentProject.id) : [],
    [currentProject, getAutomationRunsForProject]
  );
  const activeAiJob = useMemo(
    () =>
      aiGenerationJobs.find((job) => job.status === 'running' || job.status === 'queued') ||
      aiGenerationJobs[0] ||
      null,
    [aiGenerationJobs]
  );

  // Track synced results to avoid infinite loops
  const syncedResultsRef = useRef<Map<string, string>>(new Map());

  // Track run metadata so it's available at completion even if activeTestRuns is cleared
  const runMetadataRef = useRef<Map<string, { projectId: string; testCaseIds: string[] }>>(new Map());

  // Test execution hook
  const {
    runStates,
    isAnyExecuting,
    executeRun,
    cancelRun,
    skipTest,
  } = useTestExecution((runId, finalResults, status) => {
    const finalStatus = status === 'cancelled' ? 'cancelled' : status === 'error' ? 'failed' : 'completed';
    const metadata = runMetadataRef.current.get(runId);
    completeTestRun(runId, finalStatus, Array.from(finalResults.values()), metadata?.projectId, metadata?.testCaseIds);
    runMetadataRef.current.delete(runId);
  });

  // Update test results in context as they come in (only sync changed results)
  useEffect(() => {
    runStates.forEach((runState, runId) => {
      runState.resultsMap.forEach((result) => {
        const syncKey = `${runId}:${result.testCaseId}`;
        const resultKey = `${result.status}-${result.completedAt || ''}`;
        const lastSynced = syncedResultsRef.current.get(syncKey);

        if (lastSynced !== resultKey) {
          syncedResultsRef.current.set(syncKey, resultKey);
          updateTestResult(runId, result);
        }
      });
    });
  }, [runStates, updateTestResult]);

  // Clear synced results when execution ends
  useEffect(() => {
    if (!isAnyExecuting) {
      syncedResultsRef.current.clear();
    }
  }, [isAnyExecuting]);

  const activeRuns = useMemo(() => {
    if (!currentProject) return [];
    return Object.values(state.activeTestRuns)
      .filter((run) => run.projectId === currentProject.id)
      .sort((a, b) => b.startedAt - a.startedAt);
  }, [currentProject, state.activeTestRuns]);

  const executionRuns = useMemo(() => {
    // Only show actively running tests — completed/cancelled/failed runs
    // are available in the History tab.
    return [...activeRuns];
  }, [activeRuns]);

  const executionRunById = useMemo(() => {
    const byId = new Map<string, (typeof executionRuns)[number]>();
    executionRuns.forEach((run) => byId.set(run.id, run));
    return byId;
  }, [executionRuns]);

  const resolvedExecutionViewRunId = useMemo(() => {
    if (executionRuns.length === 0) return null;
    if (executionViewRunId && executionRunById.has(executionViewRunId)) {
      return executionViewRunId;
    }
    return executionRuns[0].id;
  }, [executionRunById, executionRuns, executionViewRunId]);

  const refreshAiGenerationState = useCallback(async () => {
    if (!currentProject) return;

    try {
      const response = await fetch(`/api/generate-tests?projectId=${encodeURIComponent(currentProject.id)}`, {
        method: 'GET',
      });
      if (!response.ok) return;
      const payload = await response.json();

      syncAiGenerationProjectState(
        currentProject.id,
        (payload?.jobs || []) as AiGenerationJob[],
        (payload?.drafts || []) as GeneratedTestDraft[],
        payload?.notification
      );
    } catch (error) {
      console.error('Failed to refresh AI generation status:', error);
    }
  }, [currentProject, syncAiGenerationProjectState]);

  const hasActiveAiJob = useMemo(
    () => aiGenerationJobs.some((job) => job.status === 'running' || job.status === 'queued'),
    [aiGenerationJobs]
  );

  useEffect(() => {
    if (!currentProject) return;

    void refreshAiGenerationState();

    // Only poll frequently when AI jobs are in progress; otherwise use a slower interval
    const pollMs = hasActiveAiJob ? 3000 : 30000;
    const interval = setInterval(() => {
      void refreshAiGenerationState();
    }, pollMs);
    return () => clearInterval(interval);
  }, [currentProject, refreshAiGenerationState, hasActiveAiJob]);

  const handleAiJobQueued = useCallback(() => {
    void refreshAiGenerationState();
  }, [refreshAiGenerationState]);

  const handlePublishDrafts = useCallback(async (draftIds: string[], groupName?: string) => {
    if (!currentProject || draftIds.length === 0) return;
    setIsPublishingDrafts(true);

    try {
      const response = await fetch('/api/generate-tests/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: currentProject.id,
          draftIds,
          groupName,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to publish drafts.');
      }

      syncAiGenerationProjectState(
        currentProject.id,
        (result?.jobs || []) as AiGenerationJob[],
        (result?.drafts || []) as GeneratedTestDraft[],
        result?.notification
      );

      if (result?.state) {
        dispatch({ type: 'LOAD_STATE', payload: result.state as QAState });
      } else {
        void refreshAiGenerationState();
      }
    } catch (error) {
      console.error('Failed to publish draft tests:', error);
    } finally {
      setIsPublishingDrafts(false);
    }
  }, [currentProject, dispatch, refreshAiGenerationState, syncAiGenerationProjectState]);

  const handleDiscardDrafts = useCallback(async (draftIds: string[]) => {
    if (!currentProject || draftIds.length === 0) return;
    setIsPublishingDrafts(true);

    // Optimistic local update: remove discarded drafts from local state immediately.
    // This ensures the pending auto-save timer is replaced with correct state (no discarded drafts),
    // preventing the race condition where an old auto-save restores the draft on the server.
    const discardSet = new Set(draftIds);
    const currentDrafts = getAiDraftsForProject(currentProject.id);
    const currentJobs = getAiGenerationJobsForProject(currentProject.id);
    const currentNotification = getAiDraftNotificationForProject(currentProject.id);
    const optimisticDrafts = currentDrafts.filter((d) => !discardSet.has(d.id));
    syncAiGenerationProjectState(currentProject.id, currentJobs, optimisticDrafts, currentNotification);

    try {
      const response = await fetch('/api/generate-tests/discard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: currentProject.id,
          draftIds,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to discard drafts.');
      }

      if (result?.state) {
        dispatch({ type: 'LOAD_STATE', payload: result.state as QAState });
      } else {
        void refreshAiGenerationState();
      }
    } catch (error) {
      console.error('Failed to discard draft tests:', error);
    } finally {
      setIsPublishingDrafts(false);
    }
  }, [currentProject, dispatch, refreshAiGenerationState, getAiDraftsForProject, getAiGenerationJobsForProject, syncAiGenerationProjectState, getAiDraftNotificationForProject]);

  const handleDraftsViewed = useCallback(() => {
    if (!currentProject) return;
    if (!aiDraftNotification.hasUnseenDrafts) return;
    markAiDraftsSeen(currentProject.id);
  }, [aiDraftNotification.hasUnseenDrafts, currentProject, markAiDraftsSeen]);

  // Handle tab changes
  const handleTabChange = useCallback((tab: TabType) => {
    setActiveTab(tab);
    setTestCreationMode(null);
    setViewingTestCase(null);
    setEditingDraft(null);
    setViewingAutomationRunId(null);
  }, []);

  // View test case detail
  const handleViewTestCase = useCallback((testCase: TestCase) => {
    setViewingTestCase(testCase);
    setTestCreationMode(null);
    setEditingDraft(null);
  }, []);

  // Project handlers
  const handleCreateProject = useCallback((name: string, websiteUrl: string, description?: string) => {
    const project = createProject(name, websiteUrl, description);
    setCurrentProject(project.id);
  }, [createProject, setCurrentProject]);

  const handleEditProject = useCallback((project: Project) => {
    setEditingProject(project);
    setProjectDialogOpen(true);
  }, []);

  const handleUpdateProject = useCallback((name: string, websiteUrl: string, description?: string) => {
    if (editingProject) {
      updateProject(editingProject.id, { name, websiteUrl, description });
      setEditingProject(undefined);
    } else {
      handleCreateProject(name, websiteUrl, description);
    }
  }, [editingProject, updateProject, handleCreateProject]);

  const handleDeleteProject = useCallback((id: string) => {
    setProjectToDelete(id);
    setDeleteConfirmOpen(true);
  }, []);

  const confirmDeleteProject = useCallback(() => {
    if (projectToDelete) {
      deleteProject(projectToDelete);
      setProjectToDelete(null);
      setDeleteConfirmOpen(false);
    }
  }, [projectToDelete, deleteProject]);

  const handleSelectProject = useCallback((project: Project) => {
    setCurrentProject(project.id);
    // Reset sub-views when switching projects
    setTestCreationMode(null);
    setViewingTestCase(null);
    setEditingDraft(null);
    setSelectedTestIds(new Set());
    setExecutionViewRunId(null);
    setViewingAutomationRunId(null);
  }, [setCurrentProject]);

  // Test case handlers
  const handleSaveTestCase = useCallback((testCase: Pick<TestCase, 'title' | 'description' | 'expectedOutcome' | 'status'> & { userAccountId?: string }) => {
    if (!currentProject) return;

    if (editingTestCase) {
      updateTestCase(editingTestCase.id, currentProject.id, { ...testCase, userAccountId: testCase.userAccountId });
    } else {
      createTestCase(currentProject.id, testCase.title, testCase.description, testCase.expectedOutcome, testCase.userAccountId);
    }

    // If saving from a draft editor, mark the draft as published
    if (editingDraft) {
      const projectId = currentProject.id;
      const draftId = editingDraft.id;

      // Update local state: mark draft as published so it disappears from the drafts list
      const currentDrafts = getAiDraftsForProject(projectId);
      const updatedDrafts = currentDrafts.map((d) =>
        d.id === draftId ? { ...d, status: 'published' as const, publishedAt: Date.now() } : d
      );
      const currentJobs = getAiGenerationJobsForProject(projectId);
      const currentNotification = getAiDraftNotificationForProject(projectId);
      syncAiGenerationProjectState(projectId, currentJobs, updatedDrafts, currentNotification);

      // Persist to server: discard endpoint removes non-draft entries from persisted state
      void fetch('/api/generate-tests/discard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, draftIds: [draftId] }),
      }).catch(() => { /* best-effort */ });
    }

    setTestCreationMode(null);
    setEditingTestCase(undefined);
    setEditingDraft(null);
  }, [currentProject, editingTestCase, editingDraft, createTestCase, updateTestCase, getAiDraftsForProject, getAiGenerationJobsForProject, getAiDraftNotificationForProject, syncAiGenerationProjectState]);

  const handleEditTestCase = useCallback((testCase: TestCase) => {
    setEditingTestCase(testCase);
    setEditingDraft(null);
    setTestCreationMode('manual');
  }, []);

  const handleEditDraft = useCallback((draft: GeneratedTestDraft) => {
    setEditingDraft(draft);
    setEditingTestCase(undefined);
    setTestCreationMode('manual');
  }, []);

  const handleDeleteTestCase = useCallback((testCase: TestCase) => {
    setTestCaseToDelete({ id: testCase.id, projectId: testCase.projectId });
    setDeleteConfirmOpen(true);
  }, []);

  const confirmDeleteTestCase = useCallback(() => {
    if (testCaseToDelete) {
      deleteTestCase(testCaseToDelete.id, testCaseToDelete.projectId);
      setTestCaseToDelete(null);
      setDeleteConfirmOpen(false);
    }
  }, [testCaseToDelete, deleteTestCase]);

  // Test group handlers
  const handleCreateGroup = useCallback((name: string, testCaseIds: string[]) => {
    if (!currentProject) return;
    // Remove these tests from any existing groups they belong to
    for (const group of testGroups) {
      const overlapping = testCaseIds.filter((id) => group.testCaseIds.includes(id));
      if (overlapping.length > 0) {
        updateTestGroup(group.id, group.projectId, {
          testCaseIds: group.testCaseIds.filter((id) => !testCaseIds.includes(id)),
        });
      }
    }
    createTestGroup(currentProject.id, name, testCaseIds);
    setSelectedTestIds(new Set());
    setCreateGroupDialogOpen(false);
  }, [currentProject, testGroups, createTestGroup, updateTestGroup]);

  const confirmDeleteGroup = useCallback(() => {
    if (groupToDelete) {
      deleteTestGroup(groupToDelete.id, groupToDelete.projectId);
      setGroupToDelete(null);
      setDeleteConfirmOpen(false);
    }
  }, [groupToDelete, deleteTestGroup]);

  const handleRemoveFromGroup = useCallback((testCaseId: string, group: TestGroup) => {
    updateTestGroup(group.id, group.projectId, {
      testCaseIds: group.testCaseIds.filter((id) => id !== testCaseId),
    });
  }, [updateTestGroup]);

  // Profile login/clear handlers

  const handleLoginAccount = useCallback(async (account: UserAccount, providerColumn: AccountProviderColumn) => {
    if (!currentProject) return;
    if (!state.settings.hyperbrowserEnabled && providerColumn === 'hyperbrowser') return;
    const providerForLogin = resolveProviderForColumn(providerColumn, state.settings.browserProvider);
    const providerKey = getProviderProfileKey(providerForLogin);
    const existingProfile = account.providerProfiles?.[providerKey];
    const reusableProfileId = existingProfile?.profileId;

    // Set authenticating state
    updateUserAccount(account.id, currentProject.id, {
      providerProfiles: {
        ...(account.providerProfiles || {}),
        [providerKey]: {
          ...existingProfile,
          status: 'authenticating',
        },
      },
    });

    try {
      const response = await fetch('/api/auth-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: account.id,
          projectId: currentProject.id,
          websiteUrl: currentProject.websiteUrl,
          profileId: reusableProfileId, // only reuse IDs from the selected provider
          settings: {
            ...state.settings,
            browserProvider: providerForLogin,
          },
        }),
      });

      const result = await response.json();

      if (result.success && result.profileId) {
        updateUserAccount(account.id, currentProject.id, {
          providerProfiles: {
            ...(account.providerProfiles || {}),
            [providerKey]: {
              profileId: result.profileId,
              status: 'authenticated',
              lastAuthenticatedAt: Date.now(),
            },
          },
        });
      } else {
        const fallbackStatus = reusableProfileId ? 'expired' : 'none';
        updateUserAccount(account.id, currentProject.id, {
          providerProfiles: {
            ...(account.providerProfiles || {}),
            [providerKey]: {
              ...existingProfile,
              status: fallbackStatus,
            },
          },
        });
        console.error('Login failed:', result.error);
      }
    } catch (error) {
      const fallbackStatus = reusableProfileId ? 'expired' : 'none';
      updateUserAccount(account.id, currentProject.id, {
        providerProfiles: {
          ...(account.providerProfiles || {}),
          [providerKey]: {
            ...existingProfile,
            status: fallbackStatus,
          },
        },
      });
      console.error('Login request failed:', error);
    }
  }, [currentProject, updateUserAccount, state.settings]);

  const handleClearProfile = useCallback(async (account: UserAccount, providerColumn: AccountProviderColumn) => {
    if (!currentProject) return;
    if (!state.settings.hyperbrowserEnabled && providerColumn === 'hyperbrowser') return;
    const providerForProfile = resolveProviderForColumn(providerColumn, state.settings.browserProvider);
    const providerKey = getProviderProfileKey(providerForProfile);
    const profileId = account.providerProfiles?.[providerKey]?.profileId;
    if (!profileId) return;

    // Delete profile on selected provider
    try {
      await fetch('/api/auth-session', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId,
          settings: { ...state.settings, browserProvider: providerForProfile },
        }),
      });
    } catch {
      // Best effort — clear local state regardless
    }

    // Clear local profile fields
    const nextProfiles = { ...(account.providerProfiles || {}) };
    delete nextProfiles[providerKey];
    updateUserAccount(account.id, currentProject.id, {
      providerProfiles: nextProfiles,
    });
  }, [currentProject, updateUserAccount, state.settings]);

  // Test execution handlers

  const startExecutionRun = useCallback((testsToRun: TestCase[], parallelLimit: number) => {
    if (!currentProject || testsToRun.length === 0) return;

    const safeParallelLimit = Math.max(1, Math.min(250, parallelLimit));
    const testCaseIds = testsToRun.map((tc) => tc.id);
    const run = startTestRun(currentProject.id, testCaseIds, safeParallelLimit);

    // Store metadata for completion callback fallback
    runMetadataRef.current.set(run.id, { projectId: currentProject.id, testCaseIds });

    setExecutionViewRunId(run.id);
    setActiveTab('execution');

    void executeRun({
      runId: run.id,
      testCases: testsToRun,
      websiteUrl: currentProject.websiteUrl,
      parallelLimit: safeParallelLimit,
      aiModel: state.settings.aiModel,
      settings: state.settings,
    });
  }, [currentProject, startTestRun, executeRun, state.settings]);

  const handleRunTests = useCallback(() => {
    if (!currentProject || selectedTestIds.size === 0) return;
    const testsToRun = testCases.filter((tc) => selectedTestIds.has(tc.id));
    startExecutionRun(testsToRun, state.settings.parallelLimit);
  }, [currentProject, selectedTestIds, testCases, startExecutionRun, state.settings.parallelLimit]);

  const handleRunSingleTest = useCallback((testCase: TestCase) => {
    startExecutionRun([testCase], 1);
  }, [startExecutionRun]);

  const handleStopRun = useCallback((runId: string) => {
    cancelRun(runId);
  }, [cancelRun]);

  const handleRunAgain = useCallback((run: TestRun) => {
    const testCaseIdSet = new Set(run.testCaseIds);
    const testsToRun = testCases.filter((tc) => testCaseIdSet.has(tc.id));
    startExecutionRun(testsToRun, state.settings.parallelLimit);
  }, [startExecutionRun, state.settings.parallelLimit, testCases]);

  // Automation handlers
  const handleRerunAutomation = useCallback(async (run: AutomationRun) => {
    if (!currentProject) return;
    try {
      const response = await fetch('/api/automations/rerun', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          automationRunId: run.id,
          projectId: currentProject.id,
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => null);
        console.error('Rerun failed:', err?.error || response.statusText);
        return;
      }
      // Reload state to pick up the new run
      const stateResponse = await fetch('/api/state', { method: 'GET' });
      if (stateResponse.ok) {
        const payload = await stateResponse.json();
        if (payload?.state) {
          dispatch({ type: 'LOAD_STATE', payload: payload.state as QAState });
        }
      }
    } catch (error) {
      console.error('Failed to rerun automation:', error);
    }
  }, [currentProject, dispatch]);

  const handleDeleteAutomationRun = useCallback((run: AutomationRun) => {
    if (!currentProject) return;
    deleteAutomationRun(run.id, currentProject.id);
  }, [currentProject, deleteAutomationRun]);

  // Clear all data
  const handleClearData = useCallback(() => {
    if (window.confirm('Are you sure you want to delete all data? This cannot be undone.')) {
      reset();
    }
  }, [reset]);

  // No-project selected prompt (reused across tabs)
  const renderNoProject = () => (
    <div className="text-center py-16">
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 mb-3">
        <Plus className="h-5 w-5 text-primary" />
      </div>
      <h3 className="text-sm font-medium mb-1">No project selected</h3>
      <p className="text-xs text-muted-foreground mb-4">
        {state.projects.length === 0
          ? 'Create your first project to get started'
          : 'Select a project from the sidebar to continue'}
      </p>
      {state.projects.length === 0 && (
        <Button size="sm" className="h-8 text-xs" onClick={() => setProjectDialogOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Create Project
        </Button>
      )}
    </div>
  );

  // Render content based on active tab
  const renderContent = () => {
    switch (activeTab) {
      case 'tests':
        if (!currentProject) return renderNoProject();

        // Show test case detail view
        if (viewingTestCase) {
          // Get fresh test case data (in case results updated)
          const freshTestCase = testCases.find(tc => tc.id === viewingTestCase.id) || viewingTestCase;
          return (
            <TestCaseDetail
              testCase={freshTestCase}
              testRuns={testRuns}
              userAccounts={userAccounts}
              onBack={() => setViewingTestCase(null)}
              onEdit={() => {
                setEditingTestCase(freshTestCase);
                setTestCreationMode('manual');
                setViewingTestCase(null);
              }}
              onRun={() => {
                handleRunSingleTest(freshTestCase);
                setViewingTestCase(null);
              }}
            />
          );
        }

        // Show choice dialog for new test creation
        if (testCreationMode === 'choice') {
          return (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => {
                  setTestCreationMode(null);
                  setShowAiLockedMessage(false);
                }}>
                  <ArrowLeft className="mr-1.5 h-3 w-3" />
                  Back
                </Button>
                <div>
                  <h2 className="text-base font-semibold tracking-tight">Create Test Case</h2>
                  <p className="text-xs text-muted-foreground">Choose how you want to create your test</p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-3 max-w-2xl">
                <Card
                  className="cursor-pointer border-border/40 hover:border-primary/30 transition-colors duration-150"
                  onClick={() => {
                    setTestCreationMode('manual');
                    setShowAiLockedMessage(false);
                  }}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm font-medium">
                      <Plus className="h-4 w-4" />
                      Manual Test
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Write a single test case with title, description, and expected outcome
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground/60">
                      Best for adding specific individual tests when you know exactly what to test.
                    </p>
                  </CardContent>
                </Card>

                <Card
                  className={`border-border/40 transition-colors duration-150 ${
                    canManageSettings
                      ? 'cursor-pointer hover:border-primary/30'
                      : 'cursor-not-allowed opacity-60 grayscale'
                  }`}
                  onClick={() => {
                    if (canManageSettings) {
                      setTestCreationMode('ai');
                      setShowAiLockedMessage(false);
                    } else {
                      setShowAiLockedMessage(true);
                    }
                  }}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm font-medium">
                      {canManageSettings ? (
                        <Sparkles className="h-4 w-4" />
                      ) : (
                        <Lock className="h-4 w-4" />
                      )}
                      AI-Generated Tests
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {canManageSettings
                        ? 'Paste requirements or user stories to generate multiple tests automatically'
                        : 'Restricted to settings owner'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground/60">
                      {canManageSettings
                        ? 'Best for quickly creating comprehensive test suites from documentation.'
                        : 'Contact your settings owner to generate AI tests.'}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Locked message - shown when user clicks AI card without permission */}
              {showAiLockedMessage && (
                <div className="flex items-center gap-2 p-3 rounded-md bg-muted/50 text-sm text-muted-foreground">
                  <Lock className="h-4 w-4" />
                  <span>
                    AI test generation is restricted to the designated settings owner.
                    <span className="block mt-1 text-xs text-muted-foreground/60">
                      Signed in as {currentUserEmail}
                    </span>
                  </span>
                </div>
              )}
            </div>
          );
        }

        // Show manual test editor
        if (testCreationMode === 'manual') {
          return (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => {
                  setTestCreationMode(editingTestCase || editingDraft ? null : 'choice');
                  setEditingTestCase(undefined);
                  setEditingDraft(null);
                }}>
                  <ArrowLeft className="mr-1.5 h-3 w-3" />
                  Back
                </Button>
              </div>
              <TestCaseEditor
                testCase={editingTestCase || (editingDraft ? {
                  title: editingDraft.title,
                  description: editingDraft.description,
                  expectedOutcome: editingDraft.expectedOutcome,
                  userAccountId: editingDraft.userAccountId,
                } : undefined)}
                websiteUrl={currentProject.websiteUrl}
                userAccounts={userAccounts}
                onSave={handleSaveTestCase}
                onCancel={() => {
                  setTestCreationMode(null);
                  setEditingTestCase(undefined);
                  setEditingDraft(null);
                }}
              />
            </div>
          );
        }

        // Show AI test generator
        if (testCreationMode === 'ai') {
          return (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setTestCreationMode('choice')}>
                  <ArrowLeft className="mr-1.5 h-3 w-3" />
                  Back
                </Button>
                <div>
                  <h2 className="text-base font-semibold tracking-tight">AI Test Generator</h2>
                  <p className="text-xs text-muted-foreground">
                    Paste your requirements or user stories to generate test cases automatically
                  </p>
                </div>
              </div>

              <AITestGenerator
                projectId={currentProject.id}
                websiteUrl={currentProject.websiteUrl}
                aiModel={state.settings.aiModel}
                settings={state.settings}
                userAccounts={userAccounts}
                activeJob={activeAiJob}
                onJobQueued={handleAiJobQueued}
                onGoToExecution={() => {
                  setActiveTab('execution');
                  setTestCreationMode(null);
                  void refreshAiGenerationState();
                }}
              />
            </div>
          );
        }

        // Show test list (default view)
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold tracking-tight">{currentProject.name}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{currentProject.websiteUrl}</p>
              </div>
              {selectedTestIds.size > 0 && (
                <Button size="sm" className="h-8 text-xs" onClick={handleRunTests}>
                  <Play className="mr-1.5 h-3.5 w-3.5" />
                  Run {selectedTestIds.size} Tests
                </Button>
              )}
            </div>

            <TestCaseList
              testCases={testCases}
              drafts={aiDrafts}
              selectedIds={selectedTestIds}
              onSelectionChange={setSelectedTestIds}
              onSelect={handleViewTestCase}
              onEdit={handleEditTestCase}
              onDelete={handleDeleteTestCase}
              onRun={handleRunSingleTest}
              onCreateNew={() => setTestCreationMode('choice')}
              groups={testGroups}
              parallelLimit={state.settings.parallelLimit}
              onSaveAsGroupClick={() => setCreateGroupDialogOpen(true)}
              onRemoveFromGroup={handleRemoveFromGroup}
              onEditDraft={handleEditDraft}
              onPublishDrafts={handlePublishDrafts}
              onDiscardDrafts={handleDiscardDrafts}
              onDraftsViewed={handleDraftsViewed}
              isPublishingDrafts={isPublishingDrafts}
              userAccounts={userAccounts}
              fallbackCreatorName={currentUserFirstName}
            />
          </div>
        );

      case 'execution':
        if (!currentProject) return renderNoProject();

        const selectedRun = resolvedExecutionViewRunId
          ? executionRunById.get(resolvedExecutionViewRunId) || null
          : null;
        const selectedRunState = selectedRun ? runStates.get(selectedRun.id) : undefined;
        const selectedRunIsRunning = selectedRun ? activeRuns.some((run) => run.id === selectedRun.id) : false;
        const selectedRunTestIds = selectedRun?.testCaseIds?.length
          ? selectedRun.testCaseIds
          : (selectedRun?.results || []).map((result) => result.testCaseId);
        const selectedRunTestIdSet = new Set(selectedRunTestIds);
        const selectedRunTests = testCases.filter((tc) => selectedRunTestIdSet.has(tc.id));
        const selectedRunResults = selectedRunState?.resultsMap
          ?? new Map((selectedRun?.results || []).map((result) => [result.testCaseId, result]));
        const selectedRunResultList = Array.from(selectedRunResults.values());
        const runningCount = selectedRunResultList.filter((result) => result.status === 'running').length;
        const completedCount = selectedRunResultList.filter((result) =>
          result.status === 'passed' ||
          result.status === 'failed' ||
          result.status === 'error' ||
          result.status === 'skipped'
        ).length;
        const queuedCount = selectedRun
          ? Math.max(selectedRun.totalTests - runningCount - completedCount, 0)
          : 0;
        const summary = selectedRun
          ? { total: selectedRun.totalTests, passed: selectedRun.passed, failed: selectedRun.failed }
          : { total: 0, passed: 0, failed: 0 };

        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold tracking-tight">Test Execution</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isAnyExecuting ? 'Running tests...' : 'View test execution results'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {/* Summary badges */}
                <div className="flex items-center gap-1.5">
                  <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-[#30a46c]/8 text-[#30a46c]">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium tabular-nums">{summary.passed}</span>
                  </div>
                  <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-[#e5484d]/8 text-[#e5484d]">
                    <XCircle className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium tabular-nums">{summary.failed}</span>
                  </div>
                  <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium tabular-nums">{queuedCount}</span>
                  </div>
                </div>

                {selectedRun && selectedRunIsRunning ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => handleStopRun(selectedRun.id)}
                  >
                    <Square className="mr-1.5 h-3.5 w-3.5" />
                    Stop
                  </Button>
                ) : selectedRun && selectedRunTests.length > 0 ? (
                  <Button size="sm" className="h-8 text-xs" onClick={() => handleRunAgain(selectedRun)}>
                    <Play className="mr-1.5 h-3.5 w-3.5" />
                    Run Again
                  </Button>
                ) : null}
              </div>
            </div>

            {/* Only show active AI exploration jobs (running/queued) in the Execution tab */}
            {aiGenerationJobs.filter(job => job.status === 'running' || job.status === 'queued').length > 0 && (
              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold tracking-tight">AI Exploration</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Active browser exploration sessions
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {aiGenerationJobs
                    .filter(job => job.status === 'running' || job.status === 'queued')
                    .slice(0, 9)
                    .map(job => (
                      <AiExplorationCard key={job.id} job={job} />
                    ))}
                </div>
              </div>
            )}

            {executionRuns.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {executionRuns.map((run) => {
                  const runState = runStates.get(run.id);
                  const isRunning = activeRuns.some((activeRun) => activeRun.id === run.id);
                  const statusLabel = isRunning
                    ? 'Running'
                    : run.status === 'failed'
                    ? 'Failed'
                    : run.status === 'cancelled'
                    ? 'Cancelled'
                    : 'Completed';

                  return (
                    <Button
                      key={run.id}
                      size="sm"
                      variant={resolvedExecutionViewRunId === run.id ? 'default' : 'outline'}
                      className="h-7 text-[11px]"
                      onClick={() => setExecutionViewRunId(run.id)}
                    >
                      {isRunning && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                      Run {run.id.slice(-6)} · {statusLabel}
                      {runState?.error ? ' · Error' : ''}
                    </Button>
                  );
                })}
              </div>
            )}

            {selectedRun ? (
              <TestExecutionGrid
                testCases={selectedRunTests}
                results={selectedRunResults}
                isRunning={selectedRunIsRunning}
                onSkipTest={
                  selectedRunIsRunning
                    ? (testCaseId) => skipTest(selectedRun.id, testCaseId)
                    : undefined
                }
                userAccounts={userAccounts}
              />
            ) : (
              <Card className="border-border/40">
                <CardContent className="py-10 text-center">
                  <p className="text-xs text-muted-foreground">
                    No runs available. Start tests from the Test Cases tab.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        );

      case 'history':
        if (!currentProject) return renderNoProject();

        return (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold tracking-tight">Test History</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                View past test runs and results for {currentProject.name}
              </p>
            </div>

            {testRuns.length === 0 ? (
              <Card className="border-border/40">
                <CardContent className="py-10 text-center">
                  <p className="text-xs text-muted-foreground">
                    No test runs yet. Run some tests to see results here.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <TestResultsTable
                testCases={testCases}
                testRuns={testRuns}
                groups={testGroups}
                userAccounts={userAccounts}
                projectUrl={currentProject.websiteUrl}
                aiModel={state.settings.aiModel}
                onOpenSettings={() => setActiveTab('settings')}
                onPatchResult={(runId, resultId, updates) =>
                  patchTestResult(runId, currentProject.id, resultId, updates)
                }
                onDeleteResult={(runId, resultId) => deleteTestResult(runId, currentProject.id, resultId)}
                onClearAllRuns={() => clearTestRuns(currentProject.id)}
              />
            )}
          </div>
        );

      case 'accounts':
        if (!currentProject) return renderNoProject();
        return (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold tracking-tight">User Accounts</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Manage test user credentials for {currentProject.name}. Max 20 accounts.
              </p>
            </div>
            <UserAccountsManager
              projectId={currentProject.id}
              accounts={userAccounts}
              hyperbrowserEnabled={state.settings.hyperbrowserEnabled}
              onCreateAccount={(label, email, password, metadata) => createUserAccount(currentProject.id, label, email, password, metadata)}
              onUpdateAccount={(id, updates) => updateUserAccount(id, currentProject.id, updates)}
              onDeleteAccount={(id) => deleteUserAccount(id, currentProject.id)}
              onLogin={handleLoginAccount}
              onClearProfile={handleClearProfile}
            />
          </div>
        );

      case 'automations':
        if (!currentProject) return renderNoProject();

        if (viewingAutomationRunId) {
          const autoRun = automationRuns.find((r) => r.id === viewingAutomationRunId);
          if (autoRun) {
            return (
              <AutomationDetail
                automationRun={autoRun}
                testRuns={testRuns}
                testCases={testCases}
                testGroups={testGroups}
                userAccounts={userAccounts}
                projectUrl={currentProject.websiteUrl}
                aiModel={state.settings.aiModel}
                onBack={() => setViewingAutomationRunId(null)}
                onRerun={() => handleRerunAutomation(autoRun)}
              />
            );
          }
        }

        return (
          <AutomationsPanel
            automationRuns={automationRuns}
            onViewDetail={(runId) => setViewingAutomationRunId(runId)}
            onRerun={handleRerunAutomation}
            onDelete={handleDeleteAutomationRun}
            onOpenSettings={() => setActiveTab('settings')}
          />
        );

      case 'settings':
        return (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold tracking-tight">Settings</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Configure integrations and test execution settings
              </p>
            </div>

            {canManageSettings && (
              <AutomationSettingsCard
                settings={state.automationSettings}
                projects={state.projects}
                onSettingsChange={updateAutomationSettings}
              />
            )}

            <LinearSettingsCard />

            {canManageSettings ? (
              <SettingsPanel
                settings={state.settings}
                onSettingsChange={updateSettings}
                onClearData={handleClearData}
              />
            ) : (
              <Card className="border-border/40">
                <CardContent className="py-8">
                  <p className="text-sm text-muted-foreground">
                    Additional workspace settings are restricted to the designated settings owner.
                    {currentUserEmail && (
                      <span className="block mt-1 text-xs text-muted-foreground/60">
                        Signed in as {currentUserEmail}
                      </span>
                    )}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <DashboardLayout
        activeTab={activeTab}
        onTabChange={handleTabChange}
        projects={state.projects}
        currentProject={currentProject ?? null}
        onSelectProject={handleSelectProject}
        canManageProjects={canManageProjects}
        onCreateProject={() => {
          if (!canManageProjects) return;
          setEditingProject(undefined);
          setProjectDialogOpen(true);
        }}
        onEditProject={(project) => {
          if (!canManageProjects) return;
          handleEditProject(project);
        }}
        onDeleteProject={(id) => {
          if (!canManageProjects) return;
          handleDeleteProject(id);
        }}
        hasUnseenDrafts={Boolean(currentProject && aiDraftNotification.hasUnseenDrafts)}
      >
        {renderContent()}
      </DashboardLayout>

      {/* Project Dialog */}
      <ProjectDialog
        key={`${editingProject?.id ?? 'new'}-${projectDialogOpen ? 'open' : 'closed'}`}
        open={projectDialogOpen}
        onOpenChange={(open) => {
          setProjectDialogOpen(open);
          if (!open) setEditingProject(undefined);
        }}
        project={editingProject}
        onSave={handleUpdateProject}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-semibold">Are you sure?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              {projectToDelete
                ? 'This will permanently delete the project and all its test cases.'
                : groupToDelete
                ? 'This will delete the group. The tests inside will become ungrouped but will not be deleted.'
                : 'This will permanently delete this test case.'}
              {' '}This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 text-xs" onClick={() => {
              setProjectToDelete(null);
              setTestCaseToDelete(null);
              setGroupToDelete(null);
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="h-8 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (projectToDelete) {
                  confirmDeleteProject();
                } else if (groupToDelete) {
                  confirmDeleteGroup();
                } else if (testCaseToDelete) {
                  confirmDeleteTestCase();
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Group Dialog */}
      <CreateGroupDialog
        open={createGroupDialogOpen}
        onOpenChange={setCreateGroupDialogOpen}
        selectedTests={testCases.filter((tc) => selectedTestIds.has(tc.id))}
        parallelLimit={state.settings.parallelLimit}
        onCreateGroup={handleCreateGroup}
        alreadyGroupedTests={
          testCases
            .filter((tc) => selectedTestIds.has(tc.id))
            .map((tc) => {
              const existingGroup = testGroups.find((g) => g.testCaseIds.includes(tc.id));
              return existingGroup ? { test: tc, groupName: existingGroup.name } : null;
            })
            .filter((item): item is { test: TestCase; groupName: string } => item !== null)
        }
      />
    </>
  );
}
