"use client";

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  Play,
  Edit2,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  FileText,
  Target,
  Timer,
  SkipForward,
  ListOrdered,
  AlertCircle,
} from 'lucide-react';
import type { TestCase } from '@/types';
import { cn, formatDuration, formatRelativeTime } from '@/lib/utils';

interface TestCaseDetailProps {
  testCase: TestCase;
  onBack: () => void;
  onEdit: () => void;
  onRun: () => void;
}

export function TestCaseDetail({
  testCase,
  onBack,
  onEdit,
  onRun,
}: TestCaseDetailProps) {
  const result = testCase.lastRunResult;
  const hasResult = result && result.status !== 'pending';

  const getStatusConfig = () => {
    if (!hasResult) {
      return {
        icon: Clock,
        label: 'Never Run',
        color: 'text-muted-foreground',
        bgColor: 'bg-muted/30',
        borderColor: 'border-border/40',
      };
    }
    switch (result.status) {
      case 'passed':
        return {
          icon: CheckCircle2,
          label: 'Passed',
          color: 'text-[#30a46c]',
          bgColor: 'bg-[#30a46c]/5',
          borderColor: 'border-[#30a46c]/20',
        };
      case 'failed':
      case 'error':
        return {
          icon: XCircle,
          label: result.status === 'error' ? 'Error' : 'Failed',
          color: 'text-[#e5484d]',
          bgColor: 'bg-[#e5484d]/5',
          borderColor: 'border-[#e5484d]/20',
        };
      case 'skipped':
        return {
          icon: SkipForward,
          label: 'Skipped',
          color: 'text-muted-foreground',
          bgColor: 'bg-muted/30',
          borderColor: 'border-border/40',
        };
      default:
        return {
          icon: Clock,
          label: 'Pending',
          color: 'text-muted-foreground',
          bgColor: 'bg-muted/30',
          borderColor: 'border-border/40',
        };
    }
  };

  const status = getStatusConfig();
  const StatusIcon = status.icon;

  const getSummary = () => {
    if (!hasResult) return null;

    if (result.reason) {
      return result.reason;
    }

    if (result.status === 'passed') {
      const stepCount = result.steps?.length || 0;
      return stepCount > 0
        ? `The test completed successfully after executing ${stepCount} step${stepCount === 1 ? '' : 's'}.`
        : 'The test completed successfully.';
    }

    if (result.status === 'failed' || result.status === 'error') {
      return result.error || 'The test did not complete as expected.';
    }

    if (result.status === 'skipped') {
      return 'This test was skipped by the user during execution.';
    }

    return null;
  };

  const summary = getSummary();

  return (
    <div className="space-y-4">
      {/* Header */}
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

      {/* Status Banner */}
      <Card className={cn('border', status.borderColor)}>
        <CardContent className={cn('py-4', status.bgColor)}>
          <div className="flex items-center gap-3">
            <div className={cn('p-2 rounded-md', status.bgColor)}>
              <StatusIcon className={cn('h-6 w-6', status.color)} />
            </div>
            <div className="flex-1">
              <div className={cn('text-base font-semibold tracking-tight', status.color)}>
                {status.label}
              </div>
              {hasResult && result.completedAt && (
                <p className="text-xs text-muted-foreground">
                  Last run {formatRelativeTime(result.completedAt)}
                </p>
              )}
            </div>
            {hasResult && result.duration && (
              <div className="text-right">
                <div className="text-base font-semibold tabular-nums">
                  {formatDuration(result.duration)}
                </div>
                <p className="text-[11px] text-muted-foreground">Duration</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Result Summary */}
      {hasResult && summary && (
        <Card className="border-border/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              {result.status === 'passed' ? (
                <CheckCircle2 className="h-4 w-4 text-[#30a46c]" />
              ) : result.status === 'failed' || result.status === 'error' ? (
                <AlertCircle className="h-4 w-4 text-[#e5484d]" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              Result Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn(
              'p-3 rounded-md border text-sm',
              result.status === 'passed'
                ? 'bg-[#30a46c]/5 border-[#30a46c]/15'
                : result.status === 'failed' || result.status === 'error'
                ? 'bg-[#e5484d]/5 border-[#e5484d]/15'
                : 'bg-muted/30 border-border/40'
            )}>
              <ul className="space-y-1.5">
                {summary.split('\n').filter(line => line.trim()).map((line, index) => {
                  const cleanLine = line.replace(/^[•\-\*]\s*/, '').trim();
                  if (!cleanLine) return null;
                  return (
                    <li key={index} className="flex gap-2.5">
                      <span className={cn(
                        'flex-shrink-0 w-1 h-1 rounded-full mt-2',
                        result.status === 'passed' ? 'bg-[#30a46c]' :
                        result.status === 'failed' || result.status === 'error' ? 'bg-[#e5484d]' :
                        'bg-muted-foreground'
                      )} />
                      <span className="text-foreground/90 text-xs leading-relaxed">{cleanLine}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Steps Taken */}
      {hasResult && result.steps && result.steps.length > 0 && (
        <Card className="border-border/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <ListOrdered className="h-4 w-4" />
              Steps Executed ({result.steps.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {result.steps.map((step, index) => (
                <li key={index} className="flex gap-2.5">
                  <span className={cn(
                    'flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-[11px] font-medium',
                    result.status === 'passed'
                      ? 'bg-[#30a46c]/8 text-[#30a46c]'
                      : result.status === 'failed' || result.status === 'error'
                      ? index === result.steps!.length - 1
                        ? 'bg-[#e5484d]/8 text-[#e5484d]'
                        : 'bg-[#30a46c]/8 text-[#30a46c]'
                      : 'bg-muted text-muted-foreground'
                  )}>
                    {index + 1}
                  </span>
                  <span className="text-xs text-foreground/80 pt-0.5 leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {/* Test Details */}
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

      {/* Execution Details */}
      {hasResult && (
        <Card className="border-border/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <Timer className="h-4 w-4" />
              Execution Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-2.5 rounded-md bg-muted/30 border border-border/30">
                <div className="text-[11px] text-muted-foreground mb-1">Status</div>
                <Badge className={cn(
                  'text-[11px] font-medium px-1.5 py-0',
                  result.status === 'passed' && 'bg-[#30a46c]/8 text-[#30a46c] border-[#30a46c]/15',
                  (result.status === 'failed' || result.status === 'error') && 'bg-[#e5484d]/8 text-[#e5484d] border-[#e5484d]/15',
                  result.status === 'skipped' && 'bg-muted text-muted-foreground',
                )}>
                  {result.status.charAt(0).toUpperCase() + result.status.slice(1)}
                </Badge>
              </div>
              <div className="p-2.5 rounded-md bg-muted/30 border border-border/30">
                <div className="text-[11px] text-muted-foreground mb-1">Duration</div>
                <div className="text-xs font-medium tabular-nums">
                  {result.duration ? formatDuration(result.duration) : '--'}
                </div>
              </div>
              <div className="p-2.5 rounded-md bg-muted/30 border border-border/30">
                <div className="text-[11px] text-muted-foreground mb-1">Started</div>
                <div className="text-xs font-medium tabular-nums">
                  {result.startedAt ? new Date(result.startedAt).toLocaleTimeString() : '--'}
                </div>
              </div>
              <div className="p-2.5 rounded-md bg-muted/30 border border-border/30">
                <div className="text-[11px] text-muted-foreground mb-1">Completed</div>
                <div className="text-xs font-medium tabular-nums">
                  {result.completedAt ? new Date(result.completedAt).toLocaleTimeString() : '--'}
                </div>
              </div>
            </div>

            {result.streamingUrl && (
              <div className="mt-3 pt-3 border-t border-border/30">
                <a
                  href={result.streamingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-primary/70 hover:text-primary transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  View Browser Recording
                </a>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Extracted Data */}
      {hasResult && result.extractedData && Object.keys(result.extractedData).length > 0 && (
        <Card className="border-border/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold tracking-tight">Extracted Data</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="p-3 rounded-md bg-muted/30 border border-border/30 text-xs overflow-auto max-h-64 font-mono">
              {JSON.stringify(result.extractedData, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* No Result Message */}
      {!hasResult && (
        <Card className="border-border/40">
          <CardContent className="py-10 text-center">
            <Clock className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
            <h3 className="text-sm font-medium mb-1">No Results Yet</h3>
            <p className="text-xs text-muted-foreground mb-4">
              This test has not been run yet. Click Run Test to execute it.
            </p>
            <Button size="sm" className="h-7 text-xs" onClick={onRun}>
              <Play className="mr-1.5 h-3 w-3" />
              Run Test
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
