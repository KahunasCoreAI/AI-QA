"use client";

import { useState, useMemo, Fragment } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Play, Edit2, ExternalLink, FileText, Target, History, Clock, ChevronDown, ChevronRight } from 'lucide-react';
import type { TestCase, TestRun, UserAccount } from '@/types';
import { cn, formatDuration, formatRelativeTime } from '@/lib/utils';

interface TestCaseDetailProps {
  testCase: TestCase;
  testRuns: TestRun[];
  userAccounts: UserAccount[];
  onBack: () => void;
  onEdit: () => void;
  onRun: () => void;
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

export function TestCaseDetail({
  testCase,
  testRuns,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  userAccounts,
  onBack,
  onEdit,
  onRun,
}: TestCaseDetailProps) {
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  const runHistory = useMemo(() => {
    return testRuns
      .flatMap(run => run.results
        .filter(r => r.testCaseId === testCase.id)
        .map(r => ({ ...r, runId: run.id }))
      )
      .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  }, [testRuns, testCase.id]);

  return (
    <div className="space-y-4">
      {/* Test Definition — Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onBack}>
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Back
          </Button>
          <div>
            <h2 className="text-base font-semibold tracking-tight">{testCase.title}</h2>
            <p className="text-xs text-muted-foreground">
              Created {formatRelativeTime(testCase.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onEdit}>
            <Edit2 className="mr-1.5 h-3 w-3" />
            Edit
          </Button>
          <Button size="sm" className="h-7 text-xs" onClick={onRun}>
            <Play className="mr-1.5 h-3 w-3" />
            Run Test
          </Button>
        </div>
      </div>

      {/* Test Definition — Description & Expected Outcome */}
      <div className="grid md:grid-cols-2 gap-3">
        <Card className="border-border/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <FileText className="h-4 w-4" />
              Test Description
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap">
              {testCase.description}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <Target className="h-4 w-4" />
              Expected Outcome
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap">
              {testCase.expectedOutcome || 'No expected outcome specified.'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Run History */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold tracking-tight">Run History</h3>
          <Badge variant="secondary" className="text-[11px] font-medium px-1.5 py-0">
            {runHistory.length}
          </Badge>
        </div>

        {runHistory.length === 0 ? (
          <Card className="border-border/40">
            <CardContent className="py-10 text-center">
              <Clock className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
              <h3 className="text-sm font-medium mb-1">No runs yet</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Run this test to see results here.
              </p>
              <Button size="sm" className="h-7 text-xs" onClick={onRun}>
                <Play className="mr-1.5 h-3 w-3" />
                Run Test
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border/40">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Duration</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Recording</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runHistory.map((result) => {
                  const isExpanded = expandedRunId === result.id;
                  const hasExpandableContent = !!(result.reason || result.error);
                  const recordingLink =
                    result.recordingUrl || (result.status === 'running' ? result.streamingUrl : undefined);

                  return (
                    <Fragment key={result.id}>
                      <TableRow className={cn(
                          hasExpandableContent && 'cursor-pointer hover:bg-muted/30',
                          isExpanded && 'border-b-0'
                        )}
                        onClick={() => {
                          if (hasExpandableContent) {
                            setExpandedRunId(isExpanded ? null : result.id);
                          }
                        }}
                      >
                        <TableCell className="w-8 pr-0">
                          {hasExpandableContent ? (
                            isExpanded
                              ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                              : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <div className="text-xs font-medium">
                            {new Date(result.startedAt).toLocaleDateString()}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {new Date(result.startedAt).toLocaleTimeString()}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs tabular-nums">
                          {result.duration ? formatDuration(result.duration) : '—'}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(result.status)}
                        </TableCell>
                        <TableCell>
                          {recordingLink ? (
                            <a
                              href={recordingLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center text-primary/70 hover:text-primary transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>

                      {isExpanded && (
                        <TableRow key={`${result.id}-expanded`}>
                          <TableCell colSpan={5} className="p-0">
                            <div className="bg-muted/20 border-t border-border/40 px-4 py-3 space-y-2">
                              {result.reason && (
                                <div className="p-2.5 rounded-md border border-border/40 text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap">
                                  {result.reason}
                                </div>
                              )}
                              {result.error && (
                                <div className="p-2.5 rounded-md border border-[#e5484d]/20 bg-[#e5484d]/5 text-xs text-[#e5484d] leading-relaxed whitespace-pre-wrap">
                                  {result.error}
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </div>
  );
}
