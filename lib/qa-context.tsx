"use client";

import React, { createContext, useContext, useReducer, useEffect, ReactNode, useCallback, useRef, useState } from 'react';
import type {
  QAState,
  QAAction,
  AiDraftNotification,
  AiGenerationJob,
  GeneratedTestDraft,
  Project,
  TestCase,
  TestGroup,
  TestRun,
  TestResult,
  QASettings,
  GeneratedTest,
  UserAccount,
} from '@/types';
import { generateId } from './utils';

const DEFAULT_AI_MODEL = process.env.NEXT_PUBLIC_DEFAULT_AI_MODEL || 'openai/gpt-5.2';
const DEFAULT_BROWSER_PROVIDER = 'hyperbrowser-browser-use' as const;
const DEFAULT_HYPERBROWSER_MODEL = process.env.NEXT_PUBLIC_HYPERBROWSER_MODEL || 'gemini-2.5-flash';
const DEFAULT_BROWSER_USE_CLOUD_MODEL = process.env.NEXT_PUBLIC_BROWSER_USE_CLOUD_MODEL || 'browser-use-llm';

const defaultSettings: QASettings = {
  aiModel: DEFAULT_AI_MODEL,
  defaultTimeout: 60000,
  parallelLimit: 3,
  browserProfile: 'standard',
  proxyEnabled: false,
  hyperbrowserEnabled: true,
  browserProvider: DEFAULT_BROWSER_PROVIDER,
  hyperbrowserModel: DEFAULT_HYPERBROWSER_MODEL,
  browserUseCloudModel: DEFAULT_BROWSER_USE_CLOUD_MODEL,
  providerApiKeys: {},
};

const initialState: QAState = {
  projects: [],
  currentProjectId: null,
  testCases: {},
  testRuns: {},
  testGroups: {},
  userAccounts: {},
  aiGenerationJobs: {},
  aiDrafts: {},
  aiDraftNotifications: {},
  settings: defaultSettings,
  activeTestRuns: {},
  lastUpdated: null,
  isFirstLoad: true,
};

/**
 * Clean up stale "running" state left behind by interrupted sessions.
 * Runs once when state is loaded from the server.
 */
function cleanStaleRunningState(incoming: QAState): QAState {
  let mutated = false;

  // 1. Clear all activeTestRuns — they're from dead server sessions
  const hadActiveRuns = Object.keys(incoming.activeTestRuns || {}).length > 0;

  // 2. Fix testRuns with stuck running status or running results
  const fixedTestRuns = { ...incoming.testRuns };
  for (const projectId of Object.keys(fixedTestRuns)) {
    const runs = fixedTestRuns[projectId];
    if (!runs) continue;

    const updatedRuns = runs.map((run) => {
      if (run.status !== 'running') {
        // Even completed runs can have individual results stuck at running
        const hasStaleResults = run.results.some(
          (r) => r.status === 'running' || r.status === 'pending'
        );
        if (!hasStaleResults) return run;
      }

      mutated = true;
      const fixedResults = run.results.map((r) => {
        if (r.status === 'running' || r.status === 'pending') {
          return {
            ...r,
            status: 'error' as const,
            error: 'Connection lost before result was received.',
            completedAt: r.completedAt || run.startedAt,
          };
        }
        return r;
      });

      const passed = fixedResults.filter((r) => r.status === 'passed').length;
      const failed = fixedResults.filter((r) => r.status === 'failed' || r.status === 'error').length;
      const skipped = fixedResults.filter((r) => r.status === 'skipped').length;

      return {
        ...run,
        status: 'failed' as const,
        completedAt: run.completedAt || Date.now(),
        results: fixedResults,
        passed,
        failed,
        skipped,
      };
    });

    fixedTestRuns[projectId] = updatedRuns;
  }

  // 3. Fix test cases with stale running status
  const fixedTestCases = { ...incoming.testCases };
  for (const projectId of Object.keys(fixedTestCases)) {
    const cases = fixedTestCases[projectId];
    if (!cases) continue;

    const updated = cases.map((tc) => {
      const hasStaleStatus = tc.status === 'running';
      const hasStaleLastRunResult =
        tc.lastRunResult?.status === 'running' || tc.lastRunResult?.status === 'pending';

      if (!hasStaleStatus && !hasStaleLastRunResult) return tc;
      mutated = true;

      // Fix stale lastRunResult
      let fixedLastRunResult = tc.lastRunResult;
      if (fixedLastRunResult) {
        if (fixedLastRunResult.status === 'running' || fixedLastRunResult.status === 'pending') {
          fixedLastRunResult = {
            ...fixedLastRunResult,
            status: 'error' as const,
            error: 'Connection lost before result was received.',
            completedAt: fixedLastRunResult.completedAt || Date.now(),
          };
        }
      }

      // Recalculate tc.status from lastRunResult
      let newStatus: 'pending' | 'passed' | 'failed' = hasStaleStatus ? 'pending' : tc.status as 'pending' | 'passed' | 'failed';
      if (hasStaleStatus && fixedLastRunResult) {
        if (fixedLastRunResult.status === 'passed') newStatus = 'passed';
        else if (fixedLastRunResult.status === 'failed') newStatus = 'failed';
      }

      return { ...tc, status: newStatus, lastRunResult: fixedLastRunResult } as TestCase;
    });

    fixedTestCases[projectId] = updated;
  }

  // 4. Fix projects with stale running lastRunStatus
  const fixedProjects = incoming.projects.map((p) => {
    if (p.lastRunStatus !== 'running') return p;
    mutated = true;

    // Derive from most recent run
    const projectRuns = fixedTestRuns[p.id];
    if (projectRuns && projectRuns.length > 0) {
      const latest = projectRuns[0];
      return {
        ...p,
        lastRunStatus: (latest.failed > 0 ? 'failed' : 'passed') as 'passed' | 'failed',
      };
    }
    return { ...p, lastRunStatus: 'never_run' as const };
  });

  // 5. Fix groups with stale running lastRunStatus
  const fixedGroups = { ...incoming.testGroups };
  for (const projectId of Object.keys(fixedGroups)) {
    const groups = fixedGroups[projectId];
    if (!groups) continue;

    fixedGroups[projectId] = groups.map((g) => {
      if (g.lastRunStatus !== 'running') return g;
      mutated = true;
      return { ...g, lastRunStatus: 'failed' as const };
    });
  }

  if (!mutated && !hadActiveRuns) return incoming;

  return {
    ...incoming,
    activeTestRuns: {},
    testRuns: fixedTestRuns,
    testCases: fixedTestCases,
    projects: fixedProjects,
    testGroups: fixedGroups,
    lastUpdated: mutated ? Date.now() : incoming.lastUpdated,
  };
}

function reducer(state: QAState, action: QAAction): QAState {
  switch (action.type) {
    case 'CREATE_PROJECT':
      return {
        ...state,
        projects: [...state.projects, action.payload],
        testCases: { ...state.testCases, [action.payload.id]: [] },
        testRuns: { ...state.testRuns, [action.payload.id]: [] },
        testGroups: { ...state.testGroups, [action.payload.id]: [] },
        userAccounts: { ...state.userAccounts, [action.payload.id]: [] },
        aiGenerationJobs: { ...state.aiGenerationJobs, [action.payload.id]: [] },
        aiDrafts: { ...state.aiDrafts, [action.payload.id]: [] },
        aiDraftNotifications: {
          ...state.aiDraftNotifications,
          [action.payload.id]: { hasUnseenDrafts: false },
        },
        lastUpdated: Date.now(),
      };

    case 'UPDATE_PROJECT':
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === action.payload.id ? { ...p, ...action.payload.updates } : p
        ),
        lastUpdated: Date.now(),
      };

    case 'DELETE_PROJECT': {
      const { [action.payload]: removedTests, ...remainingTests } = state.testCases;
      const { [action.payload]: removedRuns, ...remainingRuns } = state.testRuns;
      const { [action.payload]: removedGroups, ...remainingGroups } = state.testGroups;
      const { [action.payload]: removedAccounts, ...remainingAccounts } = state.userAccounts;
      const { [action.payload]: removedJobs, ...remainingJobs } = state.aiGenerationJobs;
      const { [action.payload]: removedDrafts, ...remainingDrafts } = state.aiDrafts;
      const { [action.payload]: removedDraftNotifications, ...remainingDraftNotifications } = state.aiDraftNotifications;
      void removedTests;
      void removedRuns;
      void removedGroups;
      void removedAccounts;
      void removedJobs;
      void removedDrafts;
      void removedDraftNotifications;
      return {
        ...state,
        projects: state.projects.filter((p) => p.id !== action.payload),
        testCases: remainingTests,
        testRuns: remainingRuns,
        testGroups: remainingGroups,
        userAccounts: remainingAccounts,
        aiGenerationJobs: remainingJobs,
        aiDrafts: remainingDrafts,
        aiDraftNotifications: remainingDraftNotifications,
        currentProjectId: state.currentProjectId === action.payload ? null : state.currentProjectId,
        lastUpdated: Date.now(),
      };
    }

    case 'SET_CURRENT_PROJECT':
      return {
        ...state,
        currentProjectId: action.payload,
      };

    case 'CREATE_TEST_CASE': {
      const projectId = action.payload.projectId;
      const existingTests = state.testCases[projectId] || [];
      return {
        ...state,
        testCases: {
          ...state.testCases,
          [projectId]: [...existingTests, action.payload],
        },
        projects: state.projects.map((p) =>
          p.id === projectId ? { ...p, testCount: existingTests.length + 1 } : p
        ),
        lastUpdated: Date.now(),
      };
    }

    case 'CREATE_TEST_CASES_BULK': {
      if (action.payload.length === 0) return state;
      const projectId = action.payload[0].projectId;
      const existingTests = state.testCases[projectId] || [];
      return {
        ...state,
        testCases: {
          ...state.testCases,
          [projectId]: [...existingTests, ...action.payload],
        },
        projects: state.projects.map((p) =>
          p.id === projectId ? { ...p, testCount: existingTests.length + action.payload.length } : p
        ),
        lastUpdated: Date.now(),
      };
    }

    case 'UPDATE_TEST_CASE': {
      const { id, projectId, updates } = action.payload;
      const tests = state.testCases[projectId] || [];
      return {
        ...state,
        testCases: {
          ...state.testCases,
          [projectId]: tests.map((t) =>
            t.id === id ? { ...t, ...updates } : t
          ),
        },
        lastUpdated: Date.now(),
      };
    }

    case 'DELETE_TEST_CASE': {
      const { id, projectId } = action.payload;
      const tests = state.testCases[projectId] || [];
      const newTests = tests.filter((t) => t.id !== id);
      // Remove deleted test from any groups that contain it
      const updatedGroups = { ...state.testGroups };
      if (updatedGroups[projectId]) {
        updatedGroups[projectId] = updatedGroups[projectId].map((group) => {
          if (group.testCaseIds.includes(id)) {
            return { ...group, testCaseIds: group.testCaseIds.filter((tid) => tid !== id) };
          }
          return group;
        });
      }
      return {
        ...state,
        testCases: {
          ...state.testCases,
          [projectId]: newTests,
        },
        testGroups: updatedGroups,
        projects: state.projects.map((p) =>
          p.id === projectId ? { ...p, testCount: newTests.length } : p
        ),
        lastUpdated: Date.now(),
      };
    }

    case 'CREATE_TEST_GROUP': {
      const projectId = action.payload.projectId;
      const existingGroups = state.testGroups[projectId] || [];
      return {
        ...state,
        testGroups: {
          ...state.testGroups,
          [projectId]: [...existingGroups, action.payload],
        },
        lastUpdated: Date.now(),
      };
    }

    case 'UPDATE_TEST_GROUP': {
      const { id, projectId, updates } = action.payload;
      const groups = state.testGroups[projectId] || [];
      return {
        ...state,
        testGroups: {
          ...state.testGroups,
          [projectId]: groups.map((g) =>
            g.id === id ? { ...g, ...updates } : g
          ),
        },
        lastUpdated: Date.now(),
      };
    }

    case 'DELETE_TEST_GROUP': {
      const { id, projectId } = action.payload;
      const groups = state.testGroups[projectId] || [];
      return {
        ...state,
        testGroups: {
          ...state.testGroups,
          [projectId]: groups.filter((g) => g.id !== id),
        },
        lastUpdated: Date.now(),
      };
    }

    case 'CREATE_USER_ACCOUNT': {
      const projectId = action.payload.projectId;
      const existing = state.userAccounts[projectId] || [];
      if (existing.length >= 20) return state;
      return {
        ...state,
        userAccounts: { ...state.userAccounts, [projectId]: [...existing, action.payload] },
        lastUpdated: Date.now(),
      };
    }

    case 'UPDATE_USER_ACCOUNT': {
      const { id, projectId, updates } = action.payload;
      const accounts = state.userAccounts[projectId] || [];
      return {
        ...state,
        userAccounts: {
          ...state.userAccounts,
          [projectId]: accounts.map((a) => a.id === id ? { ...a, ...updates } : a),
        },
        lastUpdated: Date.now(),
      };
    }

    case 'DELETE_USER_ACCOUNT': {
      const { id, projectId } = action.payload;
      const accounts = state.userAccounts[projectId] || [];
      const tests = state.testCases[projectId] || [];
      return {
        ...state,
        userAccounts: { ...state.userAccounts, [projectId]: accounts.filter(a => a.id !== id) },
        testCases: {
          ...state.testCases,
          [projectId]: tests.map(tc => tc.userAccountId === id ? { ...tc, userAccountId: undefined } : tc),
        },
        lastUpdated: Date.now(),
      };
    }

    case 'SYNC_AI_GENERATION_PROJECT_STATE': {
      const { projectId, jobs, drafts, notification } = action.payload;
      return {
        ...state,
        aiGenerationJobs: {
          ...state.aiGenerationJobs,
          [projectId]: jobs,
        },
        aiDrafts: {
          ...state.aiDrafts,
          [projectId]: drafts,
        },
        aiDraftNotifications: {
          ...state.aiDraftNotifications,
          [projectId]:
            notification ??
            state.aiDraftNotifications[projectId] ??
            { hasUnseenDrafts: drafts.length > 0 },
        },
      };
    }

    case 'MARK_AI_DRAFTS_SEEN': {
      const { projectId, seenAt } = action.payload;
      return {
        ...state,
        aiDraftNotifications: {
          ...state.aiDraftNotifications,
          [projectId]: {
            hasUnseenDrafts: false,
            lastSeenAt: seenAt ?? Date.now(),
          },
        },
        lastUpdated: Date.now(),
      };
    }

    case 'START_TEST_RUN':
      return {
        ...state,
        activeTestRuns: {
          ...state.activeTestRuns,
          [action.payload.id]: action.payload,
        },
        projects: state.projects.map((p) =>
          p.id === action.payload.projectId
            ? { ...p, lastRunStatus: 'running', lastRunAt: Date.now() }
            : p
        ),
        lastUpdated: Date.now(),
      };

    case 'UPDATE_TEST_RESULT': {
      const targetRun = state.activeTestRuns[action.payload.runId];
      if (!targetRun) {
        return state;
      }

      const existingResultIndex = targetRun.results.findIndex(
        (r) => r.testCaseId === action.payload.result.testCaseId
      );

      let newResults: TestResult[];
      if (existingResultIndex >= 0) {
        newResults = [...targetRun.results];
        newResults[existingResultIndex] = action.payload.result;
      } else {
        newResults = [...targetRun.results, action.payload.result];
      }

      const passed = newResults.filter((r) => r.status === 'passed').length;
      const failed = newResults.filter((r) => r.status === 'failed' || r.status === 'error').length;

      return {
        ...state,
        activeTestRuns: {
          ...state.activeTestRuns,
          [action.payload.runId]: {
            ...targetRun,
            results: newResults,
            passed,
            failed,
          },
        },
        lastUpdated: Date.now(),
      };
    }

    case 'COMPLETE_TEST_RUN': {
      const targetRun = state.activeTestRuns[action.payload.runId];
      if (!targetRun) {
        return state;
      }

      // Use finalResults if provided (avoids timing issues), otherwise fall back to state
      const resultsToUse = action.payload.finalResults || targetRun.results;

      // Recalculate passed/failed counts from the results we're using
      const passed = resultsToUse.filter((r: TestResult) => r.status === 'passed').length;
      const failed = resultsToUse.filter((r: TestResult) => r.status === 'failed' || r.status === 'error').length;

      const completedRun: TestRun = {
        ...targetRun,
        results: resultsToUse,
        passed,
        failed,
        status: action.payload.status,
        completedAt: Date.now(),
      };

      // Remove the completed run from activeTestRuns
      const remainingActiveRuns = { ...state.activeTestRuns };
      delete remainingActiveRuns[action.payload.runId];

      const projectId = completedRun.projectId;
      const existingRuns = state.testRuns[projectId] || [];

      const lastRunStatus: 'passed' | 'failed' =
        completedRun.failed > 0 ? 'failed' : 'passed';

      const updatedTestCases = { ...state.testCases };
      if (updatedTestCases[projectId]) {
        updatedTestCases[projectId] = updatedTestCases[projectId].map((tc) => {
          const result = completedRun.results.find((r) => r.testCaseId === tc.id);
          if (result) {
            return {
              ...tc,
              status: result.status === 'passed' ? 'passed' : result.status === 'failed' ? 'failed' : tc.status,
              lastRunResult: result,
            } as TestCase;
          }
          return tc;
        });
      }

      // Update group statuses based on completed run results
      const updatedGroupsAfterRun = { ...state.testGroups };
      if (updatedGroupsAfterRun[projectId]) {
        const completedTestIds = new Set(completedRun.results.map((r) => r.testCaseId));
        updatedGroupsAfterRun[projectId] = updatedGroupsAfterRun[projectId].map((group) => {
          const groupTestsRun = group.testCaseIds.filter((id) => completedTestIds.has(id));
          if (groupTestsRun.length === 0) return group;
          const groupResults = completedRun.results.filter((r) => group.testCaseIds.includes(r.testCaseId));
          const anyFailed = groupResults.some((r) => r.status === 'failed' || r.status === 'error');
          return {
            ...group,
            lastRunAt: Date.now(),
            lastRunStatus: anyFailed ? 'failed' as const : 'passed' as const,
          };
        });
      }

      return {
        ...state,
        activeTestRuns: remainingActiveRuns,
        testRuns: {
          ...state.testRuns,
          [projectId]: [completedRun, ...existingRuns].slice(0, 50),
        },
        testCases: updatedTestCases,
        testGroups: updatedGroupsAfterRun,
        projects: state.projects.map((p) =>
          p.id === projectId ? { ...p, lastRunStatus, lastRunAt: Date.now() } : p
        ),
        lastUpdated: Date.now(),
      };
    }

    case 'DELETE_TEST_RESULT': {
      const { runId, projectId, resultId } = action.payload;
      // Guard: don't mutate a currently-running run
      if (state.activeTestRuns[runId]) return state;

      const projectRuns = state.testRuns[projectId] || [];
      const targetRun = projectRuns.find((r) => r.id === runId);
      if (!targetRun) return state;
      const deletedResult = targetRun.results.find((r) => r.id === resultId);
      if (!deletedResult) return state;

      const deletedResultIds = new Set<string>([deletedResult.id]);

      const remainingRuns: TestRun[] = [];
      for (const run of projectRuns) {
        if (run.id !== runId) {
          remainingRuns.push(run);
          continue;
        }

        const newResults = run.results.filter((r) => r.id !== resultId);
        if (newResults.length === 0) {
          // Drop empty runs
          continue;
        }

        const passed = newResults.filter((r) => r.status === 'passed').length;
        const failed = newResults.filter((r) => r.status === 'failed' || r.status === 'error').length;
        const skipped = newResults.filter((r) => r.status === 'skipped').length;

        remainingRuns.push({
          ...run,
          results: newResults,
          totalTests: newResults.length,
          passed,
          failed,
          skipped,
        });
      }

      // Clean up lastRunResult on test cases
      const updatedTestCases = { ...state.testCases };
      if (updatedTestCases[projectId]) {
        updatedTestCases[projectId] = updatedTestCases[projectId].map((tc) => {
          if (tc.lastRunResult && deletedResultIds.has(tc.lastRunResult.id)) {
            // Find the next most recent result for this test case from remaining runs
            let replacement: TestResult | undefined;
            for (const run of remainingRuns) {
              for (const result of run.results) {
                if (result.testCaseId === tc.id) {
                  if (!replacement || (result.startedAt || 0) > (replacement.startedAt || 0)) {
                    replacement = result;
                  }
                }
              }
            }
            return {
              ...tc,
              lastRunResult: replacement,
              status: replacement
                ? (replacement.status === 'passed' ? 'passed' : replacement.status === 'failed' ? 'failed' : 'pending')
                : 'pending',
            } as TestCase;
          }
          return tc;
        });
      }

      // Recalculate project lastRunStatus
      let projectLastRunStatus: 'passed' | 'failed' | 'never_run' = 'never_run';
      let projectLastRunAt: number | undefined;
      if (remainingRuns.length > 0) {
        const mostRecentRun = remainingRuns[0]; // runs are stored newest-first
        projectLastRunStatus = mostRecentRun.failed > 0 ? 'failed' : 'passed';
        projectLastRunAt = mostRecentRun.completedAt || mostRecentRun.startedAt;
      }

      // Recalculate group statuses
      const updatedGroups = { ...state.testGroups };
      if (updatedGroups[projectId]) {
        updatedGroups[projectId] = updatedGroups[projectId].map((group) => {
          // Find the most recent result for any test in this group across remaining runs
          let latestGroupTime: number | undefined;
          let anyFailed = false;
          let hasResults = false;
          for (const run of remainingRuns) {
            for (const result of run.results) {
              if (group.testCaseIds.includes(result.testCaseId)) {
                hasResults = true;
                const resultTime = result.completedAt || result.startedAt || 0;
                if (!latestGroupTime || resultTime > latestGroupTime) {
                  latestGroupTime = resultTime;
                }
                if (result.status === 'failed' || result.status === 'error') {
                  anyFailed = true;
                }
              }
            }
          }
          if (!hasResults) {
            return { ...group, lastRunStatus: 'never_run' as const, lastRunAt: undefined };
          }
          return {
            ...group,
            lastRunStatus: anyFailed ? 'failed' as const : 'passed' as const,
            lastRunAt: latestGroupTime,
          };
        });
      }

      return {
        ...state,
        testRuns: { ...state.testRuns, [projectId]: remainingRuns },
        testCases: updatedTestCases,
        testGroups: updatedGroups,
        projects: state.projects.map((p) =>
          p.id === projectId
            ? {
                ...p,
                lastRunStatus: projectLastRunStatus,
                lastRunAt: projectLastRunAt,
              }
            : p
        ),
        lastUpdated: Date.now(),
      };
    }

    case 'DELETE_TEST_RUN': {
      const { runId, projectId } = action.payload;
      // Guard: don't delete a currently-running run
      if (state.activeTestRuns[runId]) return state;

      const projectRuns = state.testRuns[projectId] || [];
      const deletedRun = projectRuns.find(r => r.id === runId);
      if (!deletedRun) return state;

      const deletedResultIds = new Set(deletedRun.results.map(r => r.id));
      const remainingRuns = projectRuns.filter(r => r.id !== runId);

      // Clean up lastRunResult on test cases
      const updatedTestCases = { ...state.testCases };
      if (updatedTestCases[projectId]) {
        updatedTestCases[projectId] = updatedTestCases[projectId].map(tc => {
          if (tc.lastRunResult && deletedResultIds.has(tc.lastRunResult.id)) {
            // Find the next most recent result for this test case from remaining runs
            let replacement: TestResult | undefined;
            for (const run of remainingRuns) {
              for (const result of run.results) {
                if (result.testCaseId === tc.id) {
                  if (!replacement || (result.startedAt || 0) > (replacement.startedAt || 0)) {
                    replacement = result;
                  }
                }
              }
            }
            return {
              ...tc,
              lastRunResult: replacement,
              status: replacement
                ? (replacement.status === 'passed' ? 'passed' : replacement.status === 'failed' ? 'failed' : 'pending')
                : 'pending',
            } as TestCase;
          }
          return tc;
        });
      }

      // Recalculate project lastRunStatus
      let projectLastRunStatus: 'passed' | 'failed' | 'never_run' = 'never_run';
      let projectLastRunAt: number | undefined;
      if (remainingRuns.length > 0) {
        const mostRecentRun = remainingRuns[0]; // runs are stored newest-first
        projectLastRunStatus = mostRecentRun.failed > 0 ? 'failed' : 'passed';
        projectLastRunAt = mostRecentRun.completedAt || mostRecentRun.startedAt;
      }

      // Recalculate group statuses
      const updatedGroups = { ...state.testGroups };
      if (updatedGroups[projectId]) {
        updatedGroups[projectId] = updatedGroups[projectId].map(group => {
          // Find the most recent result for any test in this group across remaining runs
          let latestGroupTime: number | undefined;
          let anyFailed = false;
          let hasResults = false;
          for (const run of remainingRuns) {
            for (const result of run.results) {
              if (group.testCaseIds.includes(result.testCaseId)) {
                hasResults = true;
                const resultTime = result.completedAt || result.startedAt || 0;
                if (!latestGroupTime || resultTime > latestGroupTime) {
                  latestGroupTime = resultTime;
                }
                if (result.status === 'failed' || result.status === 'error') {
                  anyFailed = true;
                }
              }
            }
          }
          if (!hasResults) {
            return { ...group, lastRunStatus: 'never_run' as const, lastRunAt: undefined };
          }
          return {
            ...group,
            lastRunStatus: anyFailed ? 'failed' as const : 'passed' as const,
            lastRunAt: latestGroupTime,
          };
        });
      }

      return {
        ...state,
        testRuns: { ...state.testRuns, [projectId]: remainingRuns },
        testCases: updatedTestCases,
        testGroups: updatedGroups,
        projects: state.projects.map(p =>
          p.id === projectId
            ? {
                ...p,
                lastRunStatus: projectLastRunStatus,
                lastRunAt: projectLastRunAt,
              }
            : p
        ),
        lastUpdated: Date.now(),
      };
    }

    case 'CLEAR_TEST_RUNS': {
      const { projectId } = action.payload;

      // Clear all lastRunResult and reset status on test cases
      const clearedTestCases = { ...state.testCases };
      if (clearedTestCases[projectId]) {
        clearedTestCases[projectId] = clearedTestCases[projectId].map(tc => ({
          ...tc,
          lastRunResult: undefined,
          status: 'pending' as const,
        }));
      }

      // Reset all groups
      const clearedGroups = { ...state.testGroups };
      if (clearedGroups[projectId]) {
        clearedGroups[projectId] = clearedGroups[projectId].map(group => ({
          ...group,
          lastRunStatus: 'never_run' as const,
          lastRunAt: undefined,
        }));
      }

      return {
        ...state,
        testRuns: { ...state.testRuns, [projectId]: [] },
        testCases: clearedTestCases,
        testGroups: clearedGroups,
        projects: state.projects.map(p =>
          p.id === projectId
            ? { ...p, lastRunStatus: 'never_run' as const, lastRunAt: undefined }
            : p
        ),
        lastUpdated: Date.now(),
      };
    }

    case 'UPDATE_SETTINGS': {
      const mergedSettings = { ...state.settings, ...action.payload };
      const parallelLimit = Math.max(1, Math.min(250, Math.floor(Number(mergedSettings.parallelLimit) || 3)));
      return {
        ...state,
        settings: {
          ...mergedSettings,
          parallelLimit,
          browserProvider:
            mergedSettings.hyperbrowserEnabled === false &&
            mergedSettings.browserProvider !== 'browser-use-cloud'
              ? 'browser-use-cloud'
              : mergedSettings.browserProvider,
        },
        lastUpdated: Date.now(),
      };
    }

    case 'LOAD_STATE': {
      // Clean up stale running state from interrupted sessions
      const cleaned = cleanStaleRunningState(action.payload);

      const mergedActiveRuns: Record<string, TestRun> = {
        ...cleaned.activeTestRuns,
        ...state.activeTestRuns,  // Local runs take precedence
      };
      return {
        ...cleaned,
        activeTestRuns: mergedActiveRuns,
        testGroups: cleaned.testGroups || {},
        userAccounts: cleaned.userAccounts || {},
        aiGenerationJobs: cleaned.aiGenerationJobs || {},
        aiDrafts: cleaned.aiDrafts || {},
        aiDraftNotifications: cleaned.aiDraftNotifications || {},
        isFirstLoad: false,
      };
    }

    case 'SET_FIRST_LOAD':
      return {
        ...state,
        isFirstLoad: action.payload,
      };

    case 'RESET':
      return {
        ...initialState,
        lastUpdated: Date.now(),
      };

    default:
      return state;
  }
}

interface QAContextType {
  state: QAState;
  dispatch: React.Dispatch<QAAction>;
  currentViewer: { id: string; email?: string; displayName: string } | null;
  // Project actions
  createProject: (name: string, websiteUrl: string, description?: string) => Project;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  setCurrentProject: (id: string | null) => void;
  // Test case actions
  createTestCase: (projectId: string, title: string, description: string, expectedOutcome: string, userAccountId?: string) => TestCase;
  createTestCasesBulk: (projectId: string, tests: GeneratedTest[]) => TestCase[];
  updateTestCase: (id: string, projectId: string, updates: Partial<TestCase>) => void;
  deleteTestCase: (id: string, projectId: string) => void;
  // Test group actions
  createTestGroup: (projectId: string, name: string, testCaseIds: string[]) => TestGroup;
  updateTestGroup: (id: string, projectId: string, updates: Partial<TestGroup>) => void;
  deleteTestGroup: (id: string, projectId: string) => void;
  getTestGroupsForProject: (projectId: string) => TestGroup[];
  // User account actions
  createUserAccount: (projectId: string, label: string, email: string, password: string, metadata?: Record<string, string>) => UserAccount;
  updateUserAccount: (id: string, projectId: string, updates: Partial<UserAccount>) => void;
  deleteUserAccount: (id: string, projectId: string) => void;
  getUserAccountsForProject: (projectId: string) => UserAccount[];
  // AI generation actions
  syncAiGenerationProjectState: (
    projectId: string,
    jobs: AiGenerationJob[],
    drafts: GeneratedTestDraft[],
    notification?: AiDraftNotification
  ) => void;
  markAiDraftsSeen: (projectId: string) => void;
  getAiGenerationJobsForProject: (projectId: string) => AiGenerationJob[];
  getAiDraftsForProject: (projectId: string) => GeneratedTestDraft[];
  getAiDraftNotificationForProject: (projectId: string) => AiDraftNotification;
  // Test run actions
  startTestRun: (projectId: string, testCaseIds: string[], parallelLimit: number) => TestRun;
  updateTestResult: (runId: string, result: TestResult) => void;
  completeTestRun: (runId: string, status: 'completed' | 'failed' | 'cancelled', finalResults?: TestResult[]) => void;
  deleteTestResult: (runId: string, projectId: string, resultId: string) => void;
  deleteTestRun: (runId: string, projectId: string) => void;
  clearTestRuns: (projectId: string) => void;
  // Settings
  updateSettings: (settings: Partial<QASettings>) => void;
  // Helpers
  getCurrentProject: () => Project | null;
  getTestCasesForProject: (projectId: string) => TestCase[];
  getTestRunsForProject: (projectId: string) => TestRun[];
  reset: () => void;
}

const QAContext = createContext<QAContextType | undefined>(undefined);

export function QAProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const viewerRef = useRef<{ id: string; displayName: string } | null>(null);
  const [currentViewer, setCurrentViewer] = useState<{ id: string; email?: string; displayName: string } | null>(null);

  // Load shared team state from server on mount
  useEffect(() => {
    let isCancelled = false;

    const load = async () => {
      try {
        const response = await fetch('/api/state', { method: 'GET' });
        if (!response.ok) {
          throw new Error(`Failed to load state: ${response.status}`);
        }

        const payload = await response.json();
        const viewer = payload?.viewer;
        if (viewer && typeof viewer.id === 'string') {
          const rawDisplayName =
            typeof viewer.displayName === 'string' && viewer.displayName.trim().length > 0
              ? viewer.displayName.trim()
              : viewer.id;
          const firstToken = rawDisplayName.split(/\s+/)[0] || rawDisplayName;
          const email = typeof viewer.email === 'string' ? viewer.email : undefined;
          viewerRef.current = {
            id: viewer.id,
            displayName: firstToken,
          };
          setCurrentViewer({
            id: viewer.id,
            email,
            displayName: firstToken,
          });
        }

        if (!isCancelled && payload?.state) {
          dispatch({ type: 'LOAD_STATE', payload: payload.state as QAState });
          return;
        }
      } catch (error) {
        console.error('Failed to load shared state:', error);
      }

      if (!isCancelled) {
        dispatch({ type: 'SET_FIRST_LOAD', payload: false });
      }
    };

    void load();
    return () => {
      isCancelled = true;
    };
  }, []);

  // Save shared team state to server on change (debounced)
  useEffect(() => {
    if (!state.lastUpdated || state.isFirstLoad) return;

    const saveTimeout = setTimeout(() => {
      const stateForSync: QAState = {
        ...state,
        isFirstLoad: false,
        settings: {
          ...state.settings,
          providerApiKeys: {},
        },
      };

      void fetch('/api/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: stateForSync }),
      }).catch((error) => {
        console.error('Failed to persist shared state:', error);
      });
    }, 350);

    return () => clearTimeout(saveTimeout);
  }, [state]);

  // Project actions
  const createProject = useCallback((name: string, websiteUrl: string, description?: string): Project => {
    const project: Project = {
      id: generateId(),
      name,
      websiteUrl,
      description,
      createdAt: Date.now(),
      lastRunStatus: 'never_run',
      testCount: 0,
    };
    dispatch({ type: 'CREATE_PROJECT', payload: project });
    return project;
  }, []);

  const updateProject = useCallback((id: string, updates: Partial<Project>) => {
    dispatch({ type: 'UPDATE_PROJECT', payload: { id, updates } });
  }, []);

  const deleteProject = useCallback((id: string) => {
    dispatch({ type: 'DELETE_PROJECT', payload: id });
  }, []);

  const setCurrentProject = useCallback((id: string | null) => {
    dispatch({ type: 'SET_CURRENT_PROJECT', payload: id });
  }, []);

  // Test case actions - simplified
  const createTestCase = useCallback((
    projectId: string,
    title: string,
    description: string,
    expectedOutcome: string,
    userAccountId?: string
  ): TestCase => {
    const viewer = viewerRef.current;
    const testCase: TestCase = {
      id: generateId(),
      projectId,
      title,
      description,
      expectedOutcome,
      status: 'pending',
      createdAt: Date.now(),
      createdByUserId: viewer?.id,
      createdByName: viewer?.displayName,
      userAccountId,
    };
    dispatch({ type: 'CREATE_TEST_CASE', payload: testCase });
    return testCase;
  }, []);

  // Bulk create test cases from AI-generated tests
  const createTestCasesBulk = useCallback((
    projectId: string,
    tests: GeneratedTest[]
  ): TestCase[] => {
    const viewer = viewerRef.current;
    const now = Date.now();
    const testCases: TestCase[] = tests.map((test, index) => ({
      id: generateId() + `-${index}`,
      projectId,
      title: test.title,
      description: test.description,
      expectedOutcome: test.expectedOutcome,
      status: 'pending' as const,
      createdAt: now + index, // Ensure unique timestamps for ordering
      createdByUserId: viewer?.id,
      createdByName: viewer?.displayName,
    }));
    dispatch({ type: 'CREATE_TEST_CASES_BULK', payload: testCases });
    return testCases;
  }, []);

  const updateTestCase = useCallback((id: string, projectId: string, updates: Partial<TestCase>) => {
    dispatch({ type: 'UPDATE_TEST_CASE', payload: { id, projectId, updates } });
  }, []);

  const deleteTestCase = useCallback((id: string, projectId: string) => {
    dispatch({ type: 'DELETE_TEST_CASE', payload: { id, projectId } });
  }, []);

  // Test group actions
  const createTestGroup = useCallback((projectId: string, name: string, testCaseIds: string[]): TestGroup => {
    const group: TestGroup = {
      id: generateId(),
      projectId,
      name,
      testCaseIds,
      createdAt: Date.now(),
      lastRunStatus: 'never_run',
    };
    dispatch({ type: 'CREATE_TEST_GROUP', payload: group });
    return group;
  }, []);

  const updateTestGroup = useCallback((id: string, projectId: string, updates: Partial<TestGroup>) => {
    dispatch({ type: 'UPDATE_TEST_GROUP', payload: { id, projectId, updates } });
  }, []);

  const deleteTestGroup = useCallback((id: string, projectId: string) => {
    dispatch({ type: 'DELETE_TEST_GROUP', payload: { id, projectId } });
  }, []);

  const getTestGroupsForProject = useCallback((projectId: string): TestGroup[] => {
    return state.testGroups[projectId] || [];
  }, [state.testGroups]);

  // User account actions
  const createUserAccount = useCallback((
    projectId: string,
    label: string,
    email: string,
    password: string,
    metadata?: Record<string, string>
  ): UserAccount => {
    const account: UserAccount = {
      id: generateId(),
      projectId,
      label,
      email,
      password,
      metadata,
      createdAt: Date.now(),
      providerProfiles: {},
    };
    dispatch({ type: 'CREATE_USER_ACCOUNT', payload: account });
    return account;
  }, []);

  const updateUserAccount = useCallback((id: string, projectId: string, updates: Partial<UserAccount>) => {
    dispatch({ type: 'UPDATE_USER_ACCOUNT', payload: { id, projectId, updates } });
  }, []);

  const deleteUserAccount = useCallback((id: string, projectId: string) => {
    dispatch({ type: 'DELETE_USER_ACCOUNT', payload: { id, projectId } });
  }, []);

  const getUserAccountsForProject = useCallback((projectId: string): UserAccount[] => {
    return state.userAccounts[projectId] || [];
  }, [state.userAccounts]);

  // AI generation actions
  const syncAiGenerationProjectState = useCallback((
    projectId: string,
    jobs: AiGenerationJob[],
    drafts: GeneratedTestDraft[],
    notification?: AiDraftNotification
  ) => {
    dispatch({
      type: 'SYNC_AI_GENERATION_PROJECT_STATE',
      payload: { projectId, jobs, drafts, notification },
    });
  }, []);

  const markAiDraftsSeen = useCallback((projectId: string) => {
    dispatch({ type: 'MARK_AI_DRAFTS_SEEN', payload: { projectId } });
  }, []);

  const getAiGenerationJobsForProject = useCallback((projectId: string): AiGenerationJob[] => {
    return state.aiGenerationJobs[projectId] || [];
  }, [state.aiGenerationJobs]);

  const getAiDraftsForProject = useCallback((projectId: string): GeneratedTestDraft[] => {
    return state.aiDrafts[projectId] || [];
  }, [state.aiDrafts]);

  const getAiDraftNotificationForProject = useCallback((projectId: string): AiDraftNotification => {
    return state.aiDraftNotifications[projectId] || { hasUnseenDrafts: false };
  }, [state.aiDraftNotifications]);

  // Test run actions
  const startTestRun = useCallback((projectId: string, testCaseIds: string[], parallelLimit: number): TestRun => {
    const run: TestRun = {
      id: generateId(),
      projectId,
      startedAt: Date.now(),
      status: 'running',
      testCaseIds: [...testCaseIds],
      parallelLimit,
      totalTests: testCaseIds.length,
      passed: 0,
      failed: 0,
      skipped: 0,
      results: [],
    };
    dispatch({ type: 'START_TEST_RUN', payload: run });
    return run;
  }, []);

  const updateTestResult = useCallback((runId: string, result: TestResult) => {
    dispatch({ type: 'UPDATE_TEST_RESULT', payload: { runId, result } });
  }, []);

  const completeTestRun = useCallback((runId: string, status: 'completed' | 'failed' | 'cancelled', finalResults?: TestResult[]) => {
    dispatch({ type: 'COMPLETE_TEST_RUN', payload: { runId, status, finalResults } });
  }, []);

  const deleteTestResult = useCallback((runId: string, projectId: string, resultId: string) => {
    dispatch({ type: 'DELETE_TEST_RESULT', payload: { runId, projectId, resultId } });
  }, []);

  const deleteTestRun = useCallback((runId: string, projectId: string) => {
    dispatch({ type: 'DELETE_TEST_RUN', payload: { runId, projectId } });
  }, []);

  const clearTestRuns = useCallback((projectId: string) => {
    dispatch({ type: 'CLEAR_TEST_RUNS', payload: { projectId } });
  }, []);

  // Settings
  const updateSettings = useCallback((settings: Partial<QASettings>) => {
    dispatch({ type: 'UPDATE_SETTINGS', payload: settings });
  }, []);

  // Helpers
  const getCurrentProject = useCallback((): Project | null => {
    if (!state.currentProjectId) return null;
    return state.projects.find((p) => p.id === state.currentProjectId) || null;
  }, [state.currentProjectId, state.projects]);

  const getTestCasesForProject = useCallback((projectId: string): TestCase[] => {
    return state.testCases[projectId] || [];
  }, [state.testCases]);

  const getTestRunsForProject = useCallback((projectId: string): TestRun[] => {
    return state.testRuns[projectId] || [];
  }, [state.testRuns]);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  const value: QAContextType = {
    state,
    dispatch,
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
    syncAiGenerationProjectState,
    markAiDraftsSeen,
    getAiGenerationJobsForProject,
    getAiDraftsForProject,
    getAiDraftNotificationForProject,
    startTestRun,
    updateTestResult,
    completeTestRun,
    deleteTestResult,
    deleteTestRun,
    clearTestRuns,
    updateSettings,
    getCurrentProject,
    getTestCasesForProject,
    getTestRunsForProject,
    reset,
  };

  return (
    <QAContext.Provider value={value}>
      {children}
    </QAContext.Provider>
  );
}

export function useQA() {
  const context = useContext(QAContext);
  if (context === undefined) {
    throw new Error('useQA must be used within a QAProvider');
  }
  return context;
}
