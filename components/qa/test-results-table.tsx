"use client";

import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CheckCircle2, XCircle, Clock, AlertCircle, Bug, Copy, Check } from 'lucide-react';
import type { TestCase, TestResult, BugReport } from '@/types';
import { formatDuration, cn } from '@/lib/utils';

interface TestResultsTableProps {
  testCases: TestCase[];
  results: TestResult[];
  projectUrl: string;
  aiModel: string;
}

export function TestResultsTable({
  testCases,
  results,
  projectUrl,
  aiModel,
}: TestResultsTableProps) {
  const [bugReport, setBugReport] = useState<BugReport | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const getTestCase = (testCaseId: string) => {
    return testCases.find((tc) => tc.id === testCaseId);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'passed':
        return <CheckCircle2 className="h-3.5 w-3.5 text-[#30a46c]" />;
      case 'failed':
      case 'error':
        return <XCircle className="h-3.5 w-3.5 text-[#e5484d]" />;
      case 'skipped':
        return <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />;
      default:
        return <Clock className="h-3.5 w-3.5 text-muted-foreground/50" />;
    }
  };

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

  const copyReport = () => {
    if (!bugReport) return;

    const markdown = `# ${bugReport.title}\n\n**Severity:** ${bugReport.severity}\n\n## Description\n${bugReport.description}\n\n## Steps to Reproduce\n${bugReport.stepsToReproduce.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n## Expected Behavior\n${bugReport.expectedBehavior}\n\n## Actual Behavior\n${bugReport.actualBehavior}\n\n${bugReport.environment ? `## Environment\n${bugReport.environment}\n` : ''}${bugReport.additionalNotes ? `## Additional Notes\n${bugReport.additionalNotes}` : ''}`;

    navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const summary = {
    total: results.length,
    passed: results.filter((r) => r.status === 'passed').length,
    failed: results.filter((r) => r.status === 'failed' || r.status === 'error').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
  };

  return (
    <>
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="rounded-md border border-border/40 bg-card p-3">
          <div className="text-lg font-semibold tabular-nums">{summary.total}</div>
          <div className="text-[11px] text-muted-foreground">Total Tests</div>
        </div>
        <div className="rounded-md border border-[#30a46c]/15 bg-card p-3">
          <div className="text-lg font-semibold tabular-nums text-[#30a46c]">{summary.passed}</div>
          <div className="text-[11px] text-muted-foreground">Passed</div>
        </div>
        <div className="rounded-md border border-[#e5484d]/15 bg-card p-3">
          <div className="text-lg font-semibold tabular-nums text-[#e5484d]">{summary.failed}</div>
          <div className="text-[11px] text-muted-foreground">Failed</div>
        </div>
        <div className="rounded-md border border-border/40 bg-card p-3">
          <div className="text-lg font-semibold tabular-nums text-muted-foreground">{summary.skipped}</div>
          <div className="text-[11px] text-muted-foreground">Skipped</div>
        </div>
      </div>

      {/* Results Table */}
      <div className="rounded-md border border-border/40">
        <Table>
          <TableHeader>
            <TableRow className="border-border/40 hover:bg-transparent">
              <TableHead className="w-10 text-[11px]"></TableHead>
              <TableHead className="text-[11px]">Test Case</TableHead>
              <TableHead className="text-[11px]">Duration</TableHead>
              <TableHead className="w-28 text-[11px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((result) => {
              const testCase = getTestCase(result.testCaseId);
              const title = testCase?.title || `Test ${result.testCaseId.slice(0, 8)}...`;
              const description = testCase?.description || 'Test case details not available';

              return (
                <TableRow key={result.id} className="border-border/30 hover:bg-accent/20">
                  <TableCell>{getStatusIcon(result.status)}</TableCell>
                  <TableCell>
                    <Accordion type="single" collapsible>
                      <AccordionItem value="details" className="border-0">
                        <AccordionTrigger className="py-0 hover:no-underline">
                          <span className="text-sm font-medium">{title}</span>
                        </AccordionTrigger>
                        <AccordionContent className="pt-2">
                          <div className="space-y-2 text-xs">
                            <p className="text-muted-foreground">
                              {description}
                            </p>
                            {result.reason && (
                              <div className={cn(
                                'p-2 rounded-md border',
                                result.status === 'passed'
                                  ? 'bg-[#30a46c]/5 text-[#30a46c] border-[#30a46c]/15'
                                  : result.status === 'failed' || result.status === 'error'
                                  ? 'bg-[#e5484d]/5 text-[#e5484d] border-[#e5484d]/15'
                                  : 'bg-muted/30 text-muted-foreground border-border/30'
                              )}>
                                <span className="font-medium">Summary: </span>
                                {result.reason}
                              </div>
                            )}
                            {result.error && !result.reason && (
                              <div className="p-2 rounded-md bg-[#e5484d]/5 text-[#e5484d] border border-[#e5484d]/15">
                                <span className="font-medium">Error: </span>
                                {result.error}
                              </div>
                            )}
                            {result.steps && result.steps.length > 0 && (
                              <div className="p-2 rounded-md bg-muted/30 border border-border/30">
                                <span className="font-medium">Steps Executed:</span>
                                <ol className="mt-1 list-decimal list-inside text-[11px] space-y-0.5">
                                  {result.steps.map((step, i) => (
                                    <li key={i}>{step}</li>
                                  ))}
                                </ol>
                              </div>
                            )}
                            {result.extractedData && Object.keys(result.extractedData).length > 0 && (
                              <div className="p-2 rounded-md bg-muted/30 border border-border/30">
                                <span className="font-medium">Extracted Data:</span>
                                <pre className="mt-1 text-[11px] overflow-auto font-mono">
                                  {JSON.stringify(result.extractedData, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">
                    {result.duration ? formatDuration(result.duration) : '--'}
                  </TableCell>
                  <TableCell>
                    {(result.status === 'failed' || result.status === 'error') && testCase && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px]"
                        onClick={() => generateBugReport(result, testCase)}
                        disabled={isGenerating}
                      >
                        <Bug className="mr-1.5 h-3 w-3" />
                        {isGenerating ? 'Generating...' : 'Bug Report'}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

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
    </>
  );
}
