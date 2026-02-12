"use client";

import React, { useState, useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import { ExternalLink, Bug, Copy, Check, Trash2, Sparkles, Bot, Camera, Link2, Cpu } from 'lucide-react';
import type { TestCase, TestResult, TestRun, TestGroup, UserAccount, BugReport } from '@/types';
import { formatDuration, cn } from '@/lib/utils';

interface TestResultsTableProps {
  testCases: TestCase[];
  testRuns: TestRun[];
  groups: TestGroup[];
  userAccounts: UserAccount[];
  projectUrl: string;
  aiModel: string;
  onPatchResult?: (
    runId: string,
    resultId: string,
    updates: Partial<Pick<TestResult, 'linearIssueId' | 'linearIssueIdentifier' | 'linearIssueUrl' | 'linearCreatedAt'>>
  ) => void;
  onDeleteResult?: (runId: string, resultId: string) => void;
  onClearAllRuns?: () => void;
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'passed':
      return <Badge className="bg-[#30a46c]/8 text-[#30a46c] border-[#30a46c]/15 text-[11px] font-medium px-1.5 py-0">Passed</Badge>;
    case 'failed':
    case 'error':
      return <Badge className="bg-[#e5484d]/8 text-[#e5484d] border-[#e5484d]/15 text-[11px] font-medium px-1.5 py-0">Failed</Badge>;
    case 'running':
      return <Badge className="bg-[#f5a623]/8 text-[#f5a623] border-[#f5a623]/15 text-[11px] font-medium px-1.5 py-0">Running</Badge>;
    case 'skipped':
      return <Badge variant="secondary" className="text-[11px] font-medium px-1.5 py-0">Skipped</Badge>;
    default:
      return <Badge variant="secondary" className="text-[11px] font-medium px-1.5 py-0">Pending</Badge>;
  }
};

interface BrowserUseStep {
  number?: number;
  memory?: string;
  url?: string;
  screenshotUrl?: string;
}

interface ProviderSummary {
  taskId?: string;
  sessionId?: string;
  status?: string;
  llm?: string;
  startedAt?: string;
  finishedAt?: string;
  isSuccess?: boolean;
  cost?: string;
  browserUseVersion?: string;
  outputFilesCount?: number;
  steps: BrowserUseStep[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function summarizeValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value.length > 220 ? `${value.slice(0, 217)}...` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return 'None';
    const primitiveValues = value.filter((v) => ['string', 'number', 'boolean'].includes(typeof v));
    if (primitiveValues.length === value.length) {
      return primitiveValues
        .slice(0, 5)
        .map((v) => String(v))
        .join(', ') + (value.length > 5 ? ` (+${value.length - 5} more)` : '');
    }
    return `${value.length} item${value.length === 1 ? '' : 's'}`;
  }
  if (isRecord(value)) {
    const keys = Object.keys(value);
    return keys.length === 0 ? 'No details' : `${keys.length} field${keys.length === 1 ? '' : 's'}`;
  }
  return String(value);
}

function formatKeyLabel(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

function getProviderSummary(extractedData: Record<string, unknown> | undefined): ProviderSummary | null {
  if (!extractedData) return null;
  const provider = extractedData.provider;
  if (!isRecord(provider)) return null;

  const steps: BrowserUseStep[] = Array.isArray(provider.steps)
    ? provider.steps
        .filter(isRecord)
        .map((step) => ({
          number: typeof step.number === 'number' ? step.number : undefined,
          memory: typeof step.memory === 'string' ? step.memory : undefined,
          url: typeof step.url === 'string' ? step.url : undefined,
          screenshotUrl: typeof step.screenshotUrl === 'string' ? step.screenshotUrl : undefined,
        }))
    : [];

  return {
    taskId: typeof provider.id === 'string' ? provider.id : undefined,
    sessionId: typeof provider.sessionId === 'string' ? provider.sessionId : undefined,
    status: typeof provider.status === 'string' ? provider.status : undefined,
    llm: typeof provider.llm === 'string' ? provider.llm : undefined,
    startedAt: typeof provider.startedAt === 'string' ? provider.startedAt : undefined,
    finishedAt: typeof provider.finishedAt === 'string' ? provider.finishedAt : undefined,
    isSuccess: typeof provider.isSuccess === 'boolean' ? provider.isSuccess : undefined,
    cost: typeof provider.cost === 'string' ? provider.cost : undefined,
    browserUseVersion: typeof provider.browserUseVersion === 'string' ? provider.browserUseVersion : undefined,
    outputFilesCount: Array.isArray(provider.outputFiles) ? provider.outputFiles.length : undefined,
    steps,
  };
}

export function TestResultsTable({
  testCases,
  testRuns,
  groups,
  userAccounts,
  projectUrl,
  aiModel,
  onPatchResult,
  onDeleteResult,
  onClearAllRuns,
}: TestResultsTableProps) {
  const [selectedResult, setSelectedResult] = useState<(TestResult & { runId: string; runStartedAt: number }) | null>(null);
  const [bugReport, setBugReport] = useState<BugReport | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCreatingLinear, setIsCreatingLinear] = useState(false);
  const [linearMessage, setLinearMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [deleteItem, setDeleteItem] = useState<{ runId: string; resultId: string } | null>(null);
  const [clearAllOpen, setClearAllOpen] = useState(false);

  // Flat log rows (one per result), newest first
  const resultRows = useMemo(() => {
    const rows = testRuns.flatMap((run) =>
      run.results.map((r) => ({
        ...r,
        runId: run.id,
        runStartedAt: run.startedAt,
      }))
    );
    rows.sort((a, b) => (b.startedAt || b.runStartedAt || 0) - (a.startedAt || a.runStartedAt || 0));
    return rows;
  }, [testRuns]);

  // Lookup helpers
  const getTestCase = (testCaseId: string) => {
    return testCases.find((tc) => tc.id === testCaseId);
  };

  const getGroup = (testCaseId: string) => {
    return groups.find((g) => g.testCaseIds.includes(testCaseId));
  };

  const getAccountById = (accountId: string | undefined) => {
    if (!accountId) return null;
    return userAccounts.find((a) => a.id === accountId) ?? null;
  };

  const getAssignedAccount = (userAccountId: string | undefined) => {
    if (!userAccountId) return null;
    if (userAccountId === '__any__') return '__any__' as const;
    return getAccountById(userAccountId);
  };

  // Summary across all results
  const totalResultsCount = resultRows.length;

  // Bug report generation
  const generateBugReport = async (result: TestResult, testCase: TestCase) => {
    setIsGenerating(true);
    try {
      const response = await fetch('/api/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          failedTest: result,
          testCase,
          projectUrl,
          aiModel,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate report');
      }

      const report = await response.json();
      setBugReport(report);
    } catch (error) {
      console.error('Error generating bug report:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const createLinearIssue = async (result: TestResult, testCase: TestCase, runId: string) => {
    setIsCreatingLinear(true);
    setLinearMessage(null);
    try {
      const response = await fetch('/api/linear/create-issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          failedTest: result,
          testCase,
          projectUrl,
          aiModel,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || `Failed to create Linear issue (${response.status})`);
      }

      const payload = (await response.json()) as {
        issueId: string;
        issueIdentifier: string;
        issueUrl: string;
      };

      const updates = {
        linearIssueId: payload.issueId,
        linearIssueIdentifier: payload.issueIdentifier,
        linearIssueUrl: payload.issueUrl,
        linearCreatedAt: Date.now(),
      };

      onPatchResult?.(runId, result.id, updates);
      setSelectedResult((previous) => {
        if (!previous || previous.id !== result.id || previous.runId !== runId) return previous;
        return {
          ...previous,
          ...updates,
        };
      });
      setLinearMessage(`Linked Linear issue ${payload.issueIdentifier}.`);
    } catch (error) {
      setLinearMessage(error instanceof Error ? error.message : 'Failed to create Linear issue.');
    } finally {
      setIsCreatingLinear(false);
    }
  };

  const removeLinearReference = (result: TestResult, runId: string) => {
    const updates = {
      linearIssueId: undefined,
      linearIssueIdentifier: undefined,
      linearIssueUrl: undefined,
      linearCreatedAt: undefined,
    };

    onPatchResult?.(runId, result.id, updates);
    setSelectedResult((previous) => {
      if (!previous || previous.id !== result.id || previous.runId !== runId) return previous;
      return {
        ...previous,
        ...updates,
      };
    });
    setLinearMessage('Linear reference removed from this failed result.');
  };

  const copyReport = () => {
    if (!bugReport) return;

    const markdown = `# ${bugReport.title}\n\n**Severity:** ${bugReport.severity}\n\n## Description\n${bugReport.description}\n\n## Steps to Reproduce\n${bugReport.stepsToReproduce.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n## Expected Behavior\n${bugReport.expectedBehavior}\n\n## Actual Behavior\n${bugReport.actualBehavior}\n\n${bugReport.environment ? `## Environment\n${bugReport.environment}\n` : ''}${bugReport.additionalNotes ? `## Additional Notes\n${bugReport.additionalNotes}` : ''}`;

    navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Sheet detail data
  const selectedTestCase = selectedResult ? getTestCase(selectedResult.testCaseId) : null;
  const selectedExtractedData = selectedResult?.extractedData;
  const providerSummary = getProviderSummary(selectedExtractedData);
  const userFacingDataEntries = selectedExtractedData
    ? Object.entries(selectedExtractedData).filter(([key]) => key !== 'provider')
    : [];

  return (
    <>
      {/* Header with Clear All */}
      {onClearAllRuns && testRuns.length > 0 && (
        <div className="flex items-center justify-end mb-3">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[11px] text-muted-foreground hover:text-destructive hover:border-destructive/30"
            onClick={() => setClearAllOpen(true)}
          >
            <Trash2 className="mr-1.5 h-3 w-3" />
            Clear All History
          </Button>
        </div>
      )}

      {/* Results Table */}
      <div className="rounded-lg border border-border/40">
        <Table>
          <TableHeader>
            <TableRow className="border-border/40 hover:bg-transparent">
              <TableHead>Test name</TableHead>
              <TableHead className="w-[160px]">Group</TableHead>
              <TableHead className="w-[140px]">Account</TableHead>
              <TableHead className="w-[170px]">When</TableHead>
              <TableHead className="w-[90px]">Duration</TableHead>
              <TableHead className="w-[90px]">Result</TableHead>
              <TableHead className="w-[86px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {resultRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  <p className="text-xs text-muted-foreground">No results yet.</p>
                </TableCell>
              </TableRow>
            ) : (
              resultRows.map((result) => {
                const testCase = getTestCase(result.testCaseId);
                const title = testCase?.title || `Test ${result.testCaseId.slice(0, 8)}…`;
                const group = getGroup(result.testCaseId);
                const account = getAssignedAccount(testCase?.userAccountId);
                const resolvedAccount = getAccountById(result.resolvedUserAccountId);
                const whenTs = result.startedAt || result.runStartedAt;
                const whenObj = whenTs ? new Date(whenTs) : null;
                const recordingLink =
                  result.recordingUrl || (result.status === 'running' ? result.streamingUrl : undefined);

                return (
                  <TableRow
                    key={`${result.runId}-${result.id}-${result.startedAt}`}
                    className="cursor-pointer hover:bg-accent/20 border-border/30"
                    onClick={() => {
                      setLinearMessage(null);
                      setSelectedResult(result);
                    }}
                  >
                    {/* Test name */}
                    <TableCell>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{title}</div>
                      </div>
                    </TableCell>

                    {/* Group */}
                    <TableCell>
                      {group ? (
                        <span className="text-sm">{group.name}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {/* Account */}
                    <TableCell>
                      {resolvedAccount ? (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{resolvedAccount.label}</Badge>
                      ) : result.resolvedUserAccountId ? (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {`Acct ${result.resolvedUserAccountId.slice(0, 8)}…`}
                        </Badge>
                      ) : account === '__any__' ? (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">Any</Badge>
                      ) : account ? (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{account.label}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {/* When */}
                    <TableCell className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                      {whenObj
                        ? whenObj.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </TableCell>

                    {/* Duration */}
                    <TableCell className="text-xs text-muted-foreground tabular-nums">
                      {result.duration ? formatDuration(result.duration) : '—'}
                    </TableCell>

                    {/* Result */}
                    <TableCell>{getStatusBadge(result.status)}</TableCell>

                    {/* Actions: recording | trash */}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {recordingLink ? (
                          <a
                            href={recordingLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-accent/40 transition-colors"
                            aria-label="Open recording"
                            title="Open recording"
                          >
                            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                          </a>
                        ) : (
                          <span className="inline-flex items-center justify-center h-7 w-7 rounded-md opacity-40">
                            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                          </span>
                        )}

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteItem({ runId: result.runId, resultId: result.id });
                          }}
                          aria-label="Delete history item"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Result Detail Sheet */}
      <Sheet open={!!selectedResult} onOpenChange={(open) => {
        if (!open) {
          setSelectedResult(null);
          setLinearMessage(null);
        }
      }}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-sm">
              {selectedTestCase?.title || 'Test Result'}
              {selectedResult && getStatusBadge(selectedResult.status)}
            </SheetTitle>
            {selectedTestCase?.description && (
              <SheetDescription className="text-xs leading-relaxed whitespace-pre-wrap">
                {selectedTestCase.description}
              </SheetDescription>
            )}
          </SheetHeader>

          {selectedResult && (
            <div className="space-y-4 px-4 pb-6">
              {/* Timing */}
              <div>
                <h4 className="text-[11px] font-medium text-muted-foreground mb-2 uppercase tracking-wider">Timing</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-0.5">
                    <div className="text-[11px] text-muted-foreground">Started</div>
                    <div className="text-xs tabular-nums">
                      {selectedResult.startedAt
                        ? new Date(selectedResult.startedAt).toLocaleTimeString()
                        : '—'}
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-[11px] text-muted-foreground">Completed</div>
                    <div className="text-xs tabular-nums">
                      {selectedResult.completedAt
                        ? new Date(selectedResult.completedAt).toLocaleTimeString()
                        : '—'}
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-[11px] text-muted-foreground">Duration</div>
                    <div className="text-xs tabular-nums">
                      {selectedResult.duration ? formatDuration(selectedResult.duration) : '—'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Summary / Reason */}
              {selectedResult.reason && (
                <div>
                  <h4 className="text-[11px] font-medium text-muted-foreground mb-2 uppercase tracking-wider">Summary</h4>
                  <div className={cn(
                    'p-3 rounded-md border text-xs leading-relaxed whitespace-pre-wrap',
                    selectedResult.status === 'passed'
                      ? 'bg-[#30a46c]/5 text-[#30a46c] border-[#30a46c]/15'
                      : selectedResult.status === 'failed' || selectedResult.status === 'error'
                      ? 'bg-[#e5484d]/5 text-[#e5484d] border-[#e5484d]/15'
                      : 'bg-muted/30 text-muted-foreground border-border/30'
                  )}>
                    {selectedResult.reason}
                  </div>
                </div>
              )}

              {/* Error */}
              {selectedResult.error && !selectedResult.reason && (
                <div>
                  <h4 className="text-[11px] font-medium text-muted-foreground mb-2 uppercase tracking-wider">Error</h4>
                  <div className="p-3 rounded-md bg-[#e5484d]/5 text-[#e5484d] border border-[#e5484d]/15 text-xs leading-relaxed whitespace-pre-wrap">
                    {selectedResult.error}
                  </div>
                </div>
              )}

              {/* Steps */}
              {selectedResult.steps && selectedResult.steps.length > 0 && (
                <div>
                  <h4 className="text-[11px] font-medium text-muted-foreground mb-2 uppercase tracking-wider">Steps Executed</h4>
                  <div className="p-3 rounded-md bg-muted/30 border border-border/30">
                    <ol className="list-decimal list-inside text-[11px] space-y-1">
                      {selectedResult.steps.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                  </div>
                </div>
              )}

              {/* Extracted Data */}
              {selectedExtractedData && Object.keys(selectedExtractedData).length > 0 && (
                <div>
                  <h4 className="text-[11px] font-medium text-muted-foreground mb-2 uppercase tracking-wider">Observed Data</h4>

                  {userFacingDataEntries.length > 0 && (
                    <div className="grid grid-cols-1 gap-2">
                      {userFacingDataEntries.map(([key, value]) => (
                        <div key={key} className="rounded-md border border-border/30 bg-muted/20 px-3 py-2">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                            {formatKeyLabel(key)}
                          </div>
                          <div className="text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap">
                            {summarizeValue(value)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {providerSummary && (
                    <div className="mt-3 rounded-lg border border-border/30 bg-gradient-to-br from-muted/35 to-muted/10 p-3 space-y-3">
                      <div className="flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-primary/80" />
                        <span className="text-[11px] font-medium tracking-wide text-foreground/90">Automation Insights</span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-md border border-border/30 bg-background/80 px-2.5 py-2">
                          <div className="text-[10px] uppercase text-muted-foreground mb-1">Task Status</div>
                          <div className="text-xs font-medium">{providerSummary.status || '—'}</div>
                        </div>
                        <div className="rounded-md border border-border/30 bg-background/80 px-2.5 py-2">
                          <div className="text-[10px] uppercase text-muted-foreground mb-1">Validation</div>
                          <div className="text-xs font-medium">
                            {providerSummary.isSuccess === undefined ? '—' : providerSummary.isSuccess ? 'Successful' : 'Needs review'}
                          </div>
                        </div>
                        <div className="rounded-md border border-border/30 bg-background/80 px-2.5 py-2">
                          <div className="text-[10px] uppercase text-muted-foreground mb-1 flex items-center gap-1">
                            <Cpu className="h-3 w-3" />
                            Model
                          </div>
                          <div className="text-xs font-medium break-all">{providerSummary.llm || '—'}</div>
                        </div>
                        <div className="rounded-md border border-border/30 bg-background/80 px-2.5 py-2">
                          <div className="text-[10px] uppercase text-muted-foreground mb-1">Cost</div>
                          <div className="text-xs font-medium">{providerSummary.cost ? `$${providerSummary.cost}` : '—'}</div>
                        </div>
                        <div className="rounded-md border border-border/30 bg-background/80 px-2.5 py-2">
                          <div className="text-[10px] uppercase text-muted-foreground mb-1">Steps</div>
                          <div className="text-xs font-medium">{providerSummary.steps.length}</div>
                        </div>
                        <div className="rounded-md border border-border/30 bg-background/80 px-2.5 py-2">
                          <div className="text-[10px] uppercase text-muted-foreground mb-1">Output Files</div>
                          <div className="text-xs font-medium">{providerSummary.outputFilesCount ?? 0}</div>
                        </div>
                      </div>

                      {(providerSummary.startedAt || providerSummary.finishedAt || providerSummary.taskId || providerSummary.sessionId) && (
                        <div className="rounded-md border border-border/30 bg-background/80 px-2.5 py-2 space-y-1">
                          {providerSummary.startedAt && (
                            <div className="text-[11px] text-muted-foreground">
                              Started: {new Date(providerSummary.startedAt).toLocaleString()}
                            </div>
                          )}
                          {providerSummary.finishedAt && (
                            <div className="text-[11px] text-muted-foreground">
                              Finished: {new Date(providerSummary.finishedAt).toLocaleString()}
                            </div>
                          )}
                          {providerSummary.taskId && (
                            <div className="text-[11px] text-muted-foreground">Task ID: {providerSummary.taskId}</div>
                          )}
                          {providerSummary.sessionId && (
                            <div className="text-[11px] text-muted-foreground">Session ID: {providerSummary.sessionId}</div>
                          )}
                          {providerSummary.browserUseVersion && (
                            <div className="text-[11px] text-muted-foreground">Browser Use: {providerSummary.browserUseVersion}</div>
                          )}
                        </div>
                      )}

                      {providerSummary.steps.length > 0 && (
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
                            <Bot className="h-3 w-3" />
                            Step Timeline
                          </div>
                          <div className="space-y-2 max-h-52 overflow-auto pr-1">
                            {providerSummary.steps.map((step, index) => (
                              <div key={`${step.number || index}-${step.url || ''}`} className="rounded-md border border-border/30 bg-background/85 px-2.5 py-2">
                                <div className="text-[11px] font-medium mb-1">Step {step.number || index + 1}</div>
                                {step.memory && (
                                  <p className="text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap mb-1.5">
                                    {step.memory}
                                  </p>
                                )}
                                <div className="flex flex-wrap items-center gap-2">
                                  {step.url && (
                                    <a
                                      href={step.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                                    >
                                      <Link2 className="h-3 w-3" />
                                      Open URL
                                    </a>
                                  )}
                                  {step.screenshotUrl && (
                                    <a
                                      href={step.screenshotUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                                    >
                                      <Camera className="h-3 w-3" />
                                      Screenshot
                                    </a>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <details className="mt-3 rounded-md border border-border/30 bg-muted/10 px-3 py-2">
                    <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                      Show technical payload
                    </summary>
                    <pre className="mt-2 text-[11px] overflow-auto font-mono whitespace-pre-wrap max-h-48">
                      {JSON.stringify(selectedExtractedData, null, 2)}
                    </pre>
                  </details>
                  {!providerSummary && userFacingDataEntries.length === 0 && (
                    <div className="p-3 rounded-md bg-muted/30 border border-border/30 text-xs text-muted-foreground">
                      No structured extracted data was provided for this run.
                    </div>
                  )}
                </div>
              )}

              {/* Recording Link */}
              {(selectedResult.recordingUrl || (selectedResult.status === 'running' ? selectedResult.streamingUrl : undefined)) && (
                <a
                  href={selectedResult.recordingUrl || selectedResult.streamingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {selectedResult.recordingUrl ? 'View Browser Recording' : 'Open Live Browser'}
                </a>
              )}

              {(selectedResult.status === 'failed' || selectedResult.status === 'error') && selectedTestCase && (
                <div className="space-y-2">
                  {selectedResult.linearIssueIdentifier && selectedResult.linearIssueUrl ? (
                    <div className="rounded-md border border-border/30 bg-muted/20 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <a
                          href={selectedResult.linearIssueUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <Link2 className="h-3.5 w-3.5" />
                          {selectedResult.linearIssueIdentifier}
                        </a>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-[11px] text-muted-foreground hover:text-destructive"
                          onClick={() => removeLinearReference(selectedResult, selectedResult.runId)}
                        >
                          Remove Reference
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="default"
                      size="sm"
                      className="h-7 text-[11px] w-full"
                      onClick={() => createLinearIssue(selectedResult, selectedTestCase, selectedResult.runId)}
                      disabled={isCreatingLinear}
                    >
                      <Link2 className="mr-1.5 h-3 w-3" />
                      {isCreatingLinear ? 'Creating Linear Bug…' : 'Create Bug in Linear'}
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px] w-full"
                    onClick={() => generateBugReport(selectedResult, selectedTestCase)}
                    disabled={isGenerating}
                  >
                    <Bug className="mr-1.5 h-3 w-3" />
                    {isGenerating ? 'Generating…' : 'Generate Bug Report'}
                  </Button>

                  {linearMessage && (
                    <p className="text-[11px] text-muted-foreground/80">{linearMessage}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Bug Report Dialog */}
      <Dialog open={!!bugReport} onOpenChange={(open) => !open && setBugReport(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
              <Bug className="h-4 w-4 text-[#e5484d]" />
              Bug Report
            </DialogTitle>
            <DialogDescription className="text-xs">
              AI-generated bug report based on the test failure
            </DialogDescription>
          </DialogHeader>

          {bugReport && (
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-medium">{bugReport.title}</h3>
                <Badge
                  className={cn(
                    'mt-1 text-[11px] font-medium px-1.5 py-0',
                    bugReport.severity === 'critical' && 'bg-[#e5484d] text-white',
                    bugReport.severity === 'high' && 'bg-orange-500 text-white',
                    bugReport.severity === 'medium' && 'bg-[#f5a623] text-black',
                    bugReport.severity === 'low' && 'bg-[#0090FF] text-white'
                  )}
                >
                  {bugReport.severity}
                </Badge>
              </div>

              <div>
                <h4 className="text-[11px] font-medium text-muted-foreground mb-1">Description</h4>
                <p className="text-xs">{bugReport.description}</p>
              </div>

              <div>
                <h4 className="text-[11px] font-medium text-muted-foreground mb-1">Steps to Reproduce</h4>
                <ol className="text-xs list-decimal list-inside space-y-0.5">
                  {bugReport.stepsToReproduce.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <h4 className="text-[11px] font-medium text-muted-foreground mb-1">Expected Behavior</h4>
                  <p className="text-xs">{bugReport.expectedBehavior}</p>
                </div>
                <div>
                  <h4 className="text-[11px] font-medium text-muted-foreground mb-1">Actual Behavior</h4>
                  <p className="text-xs">{bugReport.actualBehavior}</p>
                </div>
              </div>

              {bugReport.additionalNotes && (
                <div>
                  <h4 className="text-[11px] font-medium text-muted-foreground mb-1">Additional Notes</h4>
                  <p className="text-xs">{bugReport.additionalNotes}</p>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button size="sm" className="h-7 text-xs" onClick={copyReport}>
                  {copied ? (
                    <>
                      <Check className="mr-1.5 h-3 w-3" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1.5 h-3 w-3" />
                      Copy as Markdown
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete History Item Confirmation */}
      <AlertDialog open={!!deleteItem} onOpenChange={(open) => { if (!open) setDeleteItem(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete history item?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove this test result from history. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteItem && onDeleteResult) {
                  onDeleteResult(deleteItem.runId, deleteItem.resultId);
                  if (selectedResult && selectedResult.id === deleteItem.resultId) {
                    setSelectedResult(null);
                  }
                }
                setDeleteItem(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear All Confirmation */}
      <AlertDialog open={clearAllOpen} onOpenChange={setClearAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all test history?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove {testRuns.length} test run{testRuns.length !== 1 ? 's' : ''} ({totalResultsCount} total result{totalResultsCount !== 1 ? 's' : ''}) for this project. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                onClearAllRuns?.();
                setClearAllOpen(false);
              }}
            >
              Clear All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
