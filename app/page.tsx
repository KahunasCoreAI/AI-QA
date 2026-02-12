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
  AITestGenerator,
  CreateGroupDialog,
  UserAccountsManager,
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
  Sparkles,
} from 'lucide-react';
import type {
  Project,
  TestCase,
  TestGroup,
  GeneratedTest,
  BrowserProvider,
  UserAccount,
  AccountProfileProviderKey,
} from '@/types';

type TestCreationMode = 'choice' | 'manual' | 'ai';
type AccountProviderColumn = 'hyperbrowser' | 'browser-use-cloud';
const SETTINGS_OWNER_EMAIL = (
  process.env.NEXT_PUBLIC_SETTINGS_OWNER_EMAIL ||
  'owner@example.com'
)
  .trim()
  .toLowerCase();

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
    currentViewer,
    createProject,
    updateProject,
    deleteProject,
    setCurrentProject,
    createTestCase,
    createTestCasesBulk,
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
    deleteTestResult,
    clearTestRuns,
    updateSettings,
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
  const [viewingTestCase, setViewingTestCase] = useState<TestCase | null>(null);
  const [createGroupDialogOpen, setCreateGroupDialogOpen] = useState(false);

  const currentProject = getCurrentProject();
  const currentUserEmail = (currentViewer?.email || '').toLowerCase();
  const currentUserFirstName = currentViewer?.displayName;
  const canManageSettings = currentUserEmail === SETTINGS_OWNER_EMAIL;
  const testCases = useMemo(
    () => currentProject ? getTestCasesForProject(currentProject.id) : [],
    [currentProject, getTestCasesForProject]
  );
  const testGroups = useMemo(
    () => currentProject ? getTestGroupsForProject(currentProject.id) : [],
    [currentProject, getTestGroupsForProject]
  );
  const testRuns = currentProject ? getTestRunsForProject(currentProject.id) : [];
  const userAccounts = useMemo(
    () => currentProject ? getUserAccountsForProject(currentProject.id) : [],
    [currentProject, getUserAccountsForProject]
  );

  // Track synced results to avoid infinite loops
  const syncedResultsRef = useRef<Map<string, string>>(new Map());

  // Track active test run ID in a ref to avoid stale closure issues
  const activeTestRunIdRef = useRef<string | null>(null);

  // activeTestRunIdRef is set directly in handleRunTests/handleRunSingleTest

  // Test execution hook
  const {
    isExecuting,
    resultsMap,
    executeTests,
    cancelExecution,
    skipTest,
  } = useTestExecution((finalResults) => {
    // On complete callback - use ref to get current activeTestRun ID
    const runId = activeTestRunIdRef.current;
    if (runId) {
      // Pass final results directly to completeTestRun to avoid timing issues
      const resultsArray = finalResults ? Array.from(finalResults.values()) : [];
      completeTestRun(runId, 'completed', resultsArray);
    }
  });

  // Update test results in context as they come in (only sync changed results)
  useEffect(() => {
    const runId = activeTestRunIdRef.current;
    if (runId && resultsMap.size > 0) {
      resultsMap.forEach((result) => {
        // Create a hash of the result status to detect changes
        const resultKey = `${result.testCaseId}-${result.status}-${result.completedAt || ''}`;
        const lastSynced = syncedResultsRef.current.get(result.testCaseId);

        if (lastSynced !== resultKey) {
          syncedResultsRef.current.set(result.testCaseId, resultKey);
          updateTestResult(runId, result);
        }
      });
    }
  }, [resultsMap, updateTestResult]);

  // Clear synced results when execution ends
  useEffect(() => {
    if (!isExecuting) {
      syncedResultsRef.current.clear();
    }
  }, [isExecuting]);

  // Handle tab changes
  const handleTabChange = useCallback((tab: TabType) => {
    setActiveTab(tab);
    setTestCreationMode(null);
    setViewingTestCase(null);
  }, []);

  // View test case detail
  const handleViewTestCase = useCallback((testCase: TestCase) => {
    setViewingTestCase(testCase);
    setTestCreationMode(null);
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
    setSelectedTestIds(new Set());
  }, [setCurrentProject]);

  // Test case handlers
  const handleSaveTestCase = useCallback((testCase: Pick<TestCase, 'title' | 'description' | 'expectedOutcome' | 'status'> & { userAccountId?: string }) => {
    if (!currentProject) return;

    if (editingTestCase) {
      updateTestCase(editingTestCase.id, currentProject.id, { ...testCase, userAccountId: testCase.userAccountId });
    } else {
      createTestCase(currentProject.id, testCase.title, testCase.description, testCase.expectedOutcome, testCase.userAccountId);
    }
    setTestCreationMode(null);
    setEditingTestCase(undefined);
  }, [currentProject, editingTestCase, createTestCase, updateTestCase]);

  const handleEditTestCase = useCallback((testCase: TestCase) => {
    setEditingTestCase(testCase);
    setTestCreationMode('manual');
  }, []);

  const handleAddGeneratedTests = useCallback((tests: GeneratedTest[]) => {
    if (!currentProject) return;
    createTestCasesBulk(currentProject.id, tests);
    setTestCreationMode(null);
  }, [currentProject, createTestCasesBulk]);

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

  const handleRunTests = useCallback(async () => {
    if (!currentProject || selectedTestIds.size === 0) return;

    const testsToRun = testCases.filter((tc) => selectedTestIds.has(tc.id));
    const run = startTestRun(currentProject.id, testsToRun.map((tc) => tc.id));
    activeTestRunIdRef.current = run.id;
    setActiveTab('execution');

    await executeTests(
      testsToRun,
      currentProject.websiteUrl,
      state.settings.parallelLimit,
      state.settings.aiModel,
      state.settings
    );
  }, [currentProject, selectedTestIds, testCases, startTestRun, executeTests, state.settings]);

  const handleRunSingleTest = useCallback(async (testCase: TestCase) => {
    if (!currentProject) return;

    setSelectedTestIds(new Set([testCase.id]));
    const run = startTestRun(currentProject.id, [testCase.id]);
    activeTestRunIdRef.current = run.id;
    setActiveTab('execution');

    await executeTests(
      [testCase],
      currentProject.websiteUrl,
      1,
      state.settings.aiModel,
      state.settings
    );
  }, [currentProject, startTestRun, executeTests, state.settings]);

  const handleStopTests = useCallback(() => {
    cancelExecution();
    const runId = activeTestRunIdRef.current;
    if (runId) {
      // Pass current results when cancelling so partial progress is saved
      const currentResults = Array.from(resultsMap.values());
      completeTestRun(runId, 'cancelled', currentResults);
    }
  }, [cancelExecution, completeTestRun, resultsMap]);

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
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setTestCreationMode(null)}>
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
                  onClick={() => setTestCreationMode('manual')}
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
                  className="cursor-pointer border-border/40 hover:border-primary/30 transition-colors duration-150"
                  onClick={() => setTestCreationMode('ai')}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm font-medium">
                      <Sparkles className="h-4 w-4" />
                      AI-Generated Tests
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Paste requirements or user stories to generate multiple tests automatically
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground/60">
                      Best for quickly creating comprehensive test suites from documentation.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          );
        }

        // Show manual test editor
        if (testCreationMode === 'manual') {
          return (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => {
                  setTestCreationMode(editingTestCase ? null : 'choice');
                  setEditingTestCase(undefined);
                }}>
                  <ArrowLeft className="mr-1.5 h-3 w-3" />
                  Back
                </Button>
              </div>
              <TestCaseEditor
                testCase={editingTestCase}
                websiteUrl={currentProject.websiteUrl}
                userAccounts={userAccounts}
                onSave={handleSaveTestCase}
                onCancel={() => {
                  setTestCreationMode(null);
                  setEditingTestCase(undefined);
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
                websiteUrl={currentProject.websiteUrl}
                aiModel={state.settings.aiModel}
                onAddTests={handleAddGeneratedTests}
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
                <Button size="sm" className="h-8 text-xs" onClick={handleRunTests} disabled={isExecuting}>
                  {isExecuting ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      Running...
                    </>
                  ) : (
                    <>
                      <Play className="mr-1.5 h-3.5 w-3.5" />
                      Run {selectedTestIds.size} Tests
                    </>
                  )}
                </Button>
              )}
            </div>

            <TestCaseList
              testCases={testCases}
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
              userAccounts={userAccounts}
              fallbackCreatorName={currentUserFirstName}
            />
          </div>
        );

      case 'execution':
        const selectedTests = testCases.filter((tc) => selectedTestIds.has(tc.id));
        const currentRun = activeTestRunIdRef.current
          ? state.activeTestRuns[activeTestRunIdRef.current]
          : null;
        const summary = currentRun
          ? { total: currentRun.totalTests, passed: currentRun.passed, failed: currentRun.failed }
          : { total: 0, passed: 0, failed: 0 };

        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold tracking-tight">Test Execution</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isExecuting ? 'Running tests...' : 'View test execution results'}
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
                </div>

                {isExecuting ? (
                  <Button variant="destructive" size="sm" className="h-8 text-xs" onClick={handleStopTests}>
                    <Square className="mr-1.5 h-3.5 w-3.5" />
                    Stop
                  </Button>
                ) : selectedTestIds.size > 0 ? (
                  <Button size="sm" className="h-8 text-xs" onClick={handleRunTests}>
                    <Play className="mr-1.5 h-3.5 w-3.5" />
                    Run Again
                  </Button>
                ) : null}
              </div>
            </div>

            <TestExecutionGrid
              testCases={selectedTests}
              results={resultsMap}
              isRunning={isExecuting}
              onSkipTest={skipTest}
              userAccounts={userAccounts}
            />
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

      case 'settings':
        if (!canManageSettings) {
          return (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-semibold tracking-tight">Settings</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Contact Mark
                </p>
              </div>
              <Card className="border-border/40">
                <CardContent className="py-8">
                  <p className="text-sm text-muted-foreground">Contact Mark</p>
                </CardContent>
              </Card>
            </div>
          );
        }

        return (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold tracking-tight">Settings</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Configure test execution and browser settings
              </p>
            </div>

            <SettingsPanel
              settings={state.settings}
              onSettingsChange={updateSettings}
              onClearData={handleClearData}
            />
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
        onCreateProject={() => {
          setEditingProject(undefined);
          setProjectDialogOpen(true);
        }}
        onEditProject={handleEditProject}
        onDeleteProject={handleDeleteProject}
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
