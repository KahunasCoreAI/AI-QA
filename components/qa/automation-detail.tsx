"use client";

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, ExternalLink, Play, CheckCircle2, XCircle, Clock, GitPullRequest } from 'lucide-react';
import { TestResultsTable } from './test-results-table';
import type { AutomationRun, TestCase, TestRun, TestGroup, UserAccount } from '@/types';
import { formatRelativeTime, formatDuration } from '@/lib/utils';

interface AutomationDetailProps {
  automationRun: AutomationRun;
  testRuns: TestRun[];
  testCases: TestCase[];
  testGroups: TestGroup[];
  userAccounts: UserAccount[];
  projectUrl: string;
  aiModel: string;
  onBack: () => void;
  onRerun: () => void;
}

const getStatusBadge = (status: AutomationRun['status']) => {
  switch (status) {
    case 'completed':
      return <Badge className="bg-[#30a46c]/8 text-[#30a46c] border-[#30a46c]/15 text-[11px] font-medium px-1.5 py-0">Completed</Badge>;
    case 'failed':
      return <Badge className="bg-[#e5484d]/8 text-[#e5484d] border-[#e5484d]/15 text-[11px] font-medium px-1.5 py-0">Failed</Badge>;
    case 'running':
      return <Badge className="bg-[#f5a623]/8 text-[#f5a623] border-[#f5a623]/15 text-[11px] font-medium px-1.5 py-0">Running</Badge>;
    case 'selecting_tests':
      return <Badge className="bg-[#6e56cf]/8 text-[#6e56cf] border-[#6e56cf]/15 text-[11px] font-medium px-1.5 py-0">Selecting Tests</Badge>;
    case 'pending':
      return <Badge variant="secondary" className="text-[11px] font-medium px-1.5 py-0">Pending</Badge>;
    default:
      return <Badge variant="secondary" className="text-[11px] font-medium px-1.5 py-0">{status}</Badge>;
  }
};

export function AutomationDetail({
  automationRun,
  testRuns,
  testCases,
  testGroups,
  userAccounts,
  projectUrl,
  aiModel,
  onBack,
  onRerun,
}: AutomationDetailProps) {
  const linkedTestRun = useMemo(() => {
    if (!automationRun.testRunId) return null;
    return testRuns.find((r) => r.id === automationRun.testRunId) || null;
  }, [automationRun.testRunId, testRuns]);

  const linkedTestRuns = useMemo(() => {
    return linkedTestRun ? [linkedTestRun] : [];
  }, [linkedTestRun]);

  const duration = automationRun.completedAt && automationRun.startedAt
    ? automationRun.completedAt - automationRun.startedAt
    : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onBack}>
            <ArrowLeft className="mr-1.5 h-3 w-3" />
            Back
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold tracking-tight">
                PR #{automationRun.prNumber}
              </h2>
              {getStatusBadge(automationRun.status)}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-lg truncate">
              {automationRun.prTitle}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-8 text-xs" asChild>
            <a href={automationRun.prUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              View PR
            </a>
          </Button>
          {automationRun.status !== 'running' && automationRun.status !== 'pending' && (
            <Button size="sm" className="h-8 text-xs" onClick={onRerun}>
              <Play className="mr-1.5 h-3.5 w-3.5" />
              Rerun
            </Button>
          )}
        </div>
      </div>

      {/* Summary Card */}
      <Card className="border-border/40">
        <CardContent className="py-3 px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-0.5">
              <div className="text-[11px] text-muted-foreground font-medium">Author</div>
              <div className="text-xs font-medium flex items-center gap-1.5">
                <GitPullRequest className="h-3 w-3 text-muted-foreground" />
                {automationRun.prAuthor}
              </div>
            </div>
            <div className="space-y-0.5">
              <div className="text-[11px] text-muted-foreground font-medium">Branch</div>
              <div className="text-xs font-mono">
                {automationRun.headBranch} &rarr; {automationRun.baseBranch}
              </div>
            </div>
            <div className="space-y-0.5">
              <div className="text-[11px] text-muted-foreground font-medium">Started</div>
              <div className="text-xs">
                {formatRelativeTime(automationRun.startedAt || automationRun.createdAt)}
              </div>
            </div>
            <div className="space-y-0.5">
              <div className="text-[11px] text-muted-foreground font-medium">Duration</div>
              <div className="text-xs">
                {duration ? formatDuration(duration) : automationRun.status === 'running' ? 'In progress...' : '\u2014'}
              </div>
            </div>
          </div>

          {/* Results summary */}
          {(automationRun.status === 'completed' || automationRun.status === 'failed') && (
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border/40">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">Total:</span>
                <span className="text-xs font-medium tabular-nums">{automationRun.totalTests}</span>
              </div>
              <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#30a46c]/8">
                <CheckCircle2 className="h-3 w-3 text-[#30a46c]" />
                <span className="text-[11px] font-medium text-[#30a46c] tabular-nums">{automationRun.passed}</span>
              </div>
              <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#e5484d]/8">
                <XCircle className="h-3 w-3 text-[#e5484d]" />
                <span className="text-[11px] font-medium text-[#e5484d] tabular-nums">{automationRun.failed}</span>
              </div>
              {automationRun.skipped > 0 && (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-muted">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[11px] font-medium text-muted-foreground tabular-nums">{automationRun.skipped}</span>
                </div>
              )}
            </div>
          )}

          {automationRun.error && (
            <div className="mt-3 pt-3 border-t border-border/40">
              <p className="text-xs text-[#e5484d]">{automationRun.error}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Test Results */}
      {linkedTestRuns.length > 0 ? (
        <TestResultsTable
          testCases={testCases}
          testRuns={linkedTestRuns}
          groups={testGroups}
          userAccounts={userAccounts}
          projectUrl={projectUrl}
          aiModel={aiModel}
        />
      ) : (
        <Card className="border-border/40">
          <CardContent className="py-10 text-center">
            <p className="text-xs text-muted-foreground">
              {automationRun.status === 'running' || automationRun.status === 'pending'
                ? 'Tests are still running...'
                : 'No test results available for this automation run.'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
