"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { TestCase, TestResult, TestEvent, QASettings } from '@/types';

/**
 * Hook for localStorage with SSR support
 * Uses lazy initialization to avoid setState in effect
 */
export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((val: T) => T)) => void] {
  // Use lazy initialization to read from localStorage on first render
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return initialValue;
    }
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error('Error reading from localStorage:', error);
      return initialValue;
    }
  });

  const setValue = useCallback((value: T | ((val: T) => T)) => {
    setStoredValue((currentValue) => {
      try {
        const valueToStore = value instanceof Function ? value(currentValue) : value;
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(key, JSON.stringify(valueToStore));
        }
        return valueToStore;
      } catch (error) {
        console.error('Error writing to localStorage:', error);
        return currentValue;
      }
    });
  }, [key]);

  return [storedValue, setValue];
}

/**
 * Hook for managing test execution with SSE
 */
export type ExecutionRunStatus = 'running' | 'completed' | 'cancelled' | 'error';

interface ExecutionRunState {
  status: ExecutionRunStatus;
  resultsMap: Map<string, TestResult>;
  error: string | null;
  startedAt: number;
  completedAt?: number;
}

interface ExecuteRunInput {
  runId: string;
  testCases: TestCase[];
  websiteUrl: string;
  parallelLimit: number;
  aiModel: string;
  settings: QASettings;
}

export function useTestExecution(
  onComplete?: (
    runId: string,
    finalResults: Map<string, TestResult>,
    status: Exclude<ExecutionRunStatus, 'running'>
  ) => void
) {
  const [runStates, setRunStates] = useState<Map<string, ExecutionRunState>>(new Map());
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const resultsRef = useRef<Map<string, Map<string, TestResult>>>(new Map());

  const handleTestEvent = useCallback((runId: string, event: TestEvent) => {
    const { testCaseId, data } = event;

    setRunStates((prev) => {
      const run = prev.get(runId);
      if (!run) return prev;

      const next = new Map(prev);
      const updatedResults = new Map(run.resultsMap);
      const existing = updatedResults.get(testCaseId) || {
        id: `result-${testCaseId}`,
        testCaseId,
        status: 'running' as const,
        startedAt: Date.now(),
      };

      switch (event.type) {
        case 'test_start':
          updatedResults.set(testCaseId, {
            ...existing,
            status: 'running' as const,
            startedAt: event.timestamp,
          });
          break;

        case 'streaming_url':
          updatedResults.set(testCaseId, {
            ...existing,
            streamingUrl: data?.streamingUrl,
            ...(data?.recordingUrl ? { recordingUrl: data.recordingUrl } : {}),
          });
          break;

        case 'step_progress':
          updatedResults.set(testCaseId, {
            ...existing,
            currentStep: data?.currentStep,
            totalSteps: data?.totalSteps,
            currentStepDescription: data?.stepDescription,
          });
          break;

        case 'test_complete':
          if (data?.result) {
            updatedResults.set(testCaseId, data.result);
          }
          break;

        case 'test_error':
          updatedResults.set(testCaseId, {
            ...existing,
            status: 'error' as const,
            error: data?.error,
            completedAt: event.timestamp,
          });
          break;

        default:
          break;
      }

      resultsRef.current.set(runId, updatedResults);
      next.set(runId, {
        ...run,
        resultsMap: updatedResults,
      });
      return next;
    });
  }, []);

  const executeRun = useCallback(async ({
    runId,
    testCases,
    websiteUrl,
    parallelLimit,
    aiModel,
    settings,
  }: ExecuteRunInput) => {
    if (abortControllersRef.current.has(runId)) return;

    const controller = new AbortController();
    abortControllersRef.current.set(runId, controller);
    resultsRef.current.set(runId, new Map());

    setRunStates((prev) => {
      const next = new Map(prev);
      next.set(runId, {
        status: 'running',
        resultsMap: new Map(),
        error: null,
        startedAt: Date.now(),
      });
      return next;
    });

    let completionStatus: Exclude<ExecutionRunStatus, 'running'> = 'completed';
    let errorMessage: string | null = null;

    try {
      const response = await fetch('/api/execute-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testCases,
          websiteUrl,
          parallelLimit,
          aiModel,
          settings,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event: TestEvent = JSON.parse(line.slice(6));
            handleTestEvent(runId, event);
          } catch (e) {
            console.error('Failed to parse SSE event:', e);
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        completionStatus = 'cancelled';
      } else {
        completionStatus = 'error';
        errorMessage = err instanceof Error ? err.message : 'Unknown error';
      }
    } finally {
      abortControllersRef.current.delete(runId);

      const finalResults = new Map(resultsRef.current.get(runId) ?? []);
      setRunStates((prev) => {
        const run = prev.get(runId);
        if (!run) return prev;
        const next = new Map(prev);
        next.set(runId, {
          ...run,
          status: completionStatus,
          error: errorMessage,
          completedAt: Date.now(),
        });
        return next;
      });

      onComplete?.(runId, finalResults, completionStatus);
    }
  }, [handleTestEvent, onComplete]);

  const cancelRun = useCallback((runId: string) => {
    const controller = abortControllersRef.current.get(runId);
    if (!controller) return;

    setRunStates((prev) => {
      const run = prev.get(runId);
      if (!run) return prev;
      const next = new Map(prev);
      next.set(runId, {
        ...run,
        status: 'cancelled',
      });
      return next;
    });

    controller.abort();
  }, []);

  const skipTest = useCallback((runId: string, testCaseId: string) => {
    setRunStates((prev) => {
      const run = prev.get(runId);
      if (!run) return prev;

      const next = new Map(prev);
      const updatedResults = new Map(run.resultsMap);
      const existing = updatedResults.get(testCaseId);
      if (!existing || (existing.status !== 'running' && existing.status !== 'pending')) {
        return prev;
      }

      updatedResults.set(testCaseId, {
        ...existing,
        status: 'skipped',
        completedAt: Date.now(),
        duration: existing.startedAt ? Date.now() - existing.startedAt : 0,
      });
      resultsRef.current.set(runId, updatedResults);

      next.set(runId, {
        ...run,
        resultsMap: updatedResults,
      });
      return next;
    });
  }, []);

  const activeRunIds = useMemo(() => {
    return Array.from(runStates.entries())
      .filter(([, run]) => run.status === 'running')
      .map(([runId]) => runId);
  }, [runStates]);

  const getRunState = useCallback((runId: string): ExecutionRunState | undefined => {
    return runStates.get(runId);
  }, [runStates]);

  const getRunResults = useCallback((runId: string): Map<string, TestResult> => {
    return runStates.get(runId)?.resultsMap ?? new Map();
  }, [runStates]);

  return {
    runStates,
    activeRunIds,
    isAnyExecuting: activeRunIds.length > 0,
    executeRun,
    cancelRun,
    getRunState,
    getRunResults,
    skipTest,
  };
}

/**
 * Hook for debounced value
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Hook for window resize
 */
export function useWindowSize() {
  const [size, setSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  useEffect(() => {
    function handleResize() {
      setSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return size;
}

/**
 * Hook for keyboard shortcuts
 */
export function useKeyboardShortcut(
  key: string,
  callback: () => void,
  modifiers: { ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean } = {}
) {
  const { ctrl, meta, shift, alt } = modifiers;

  // Use a ref to store the callback to avoid stale closures
  const callbackRef = useRef(callback);
  
  // Update the ref whenever callback changes
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const modifierMatch =
        (ctrl === undefined || event.ctrlKey === ctrl) &&
        (meta === undefined || event.metaKey === meta) &&
        (shift === undefined || event.shiftKey === shift) &&
        (alt === undefined || event.altKey === alt);

      if (event.key.toLowerCase() === key.toLowerCase() && modifierMatch) {
        event.preventDefault();
        callbackRef.current();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [key, ctrl, meta, shift, alt]);
}

/**
 * Hook for click outside detection
 */
export function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  callback: () => void
) {
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        callback();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [ref, callback]);
}

/**
 * Hook for elapsed time counter
 */
export function useElapsedTime(startTime: number | null, isRunning: boolean): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isRunning || !startTime) {
      return;
    }

    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 100);

    return () => clearInterval(interval);
  }, [startTime, isRunning]);

  return elapsed;
}
