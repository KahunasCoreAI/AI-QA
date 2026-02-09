"use client";

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, XCircle, Loader2, Clock, ExternalLink, SkipForward } from 'lucide-react';
import type { TestCase, TestResult } from '@/types';
import { cn, formatDuration } from '@/lib/utils';
import { useElapsedTime } from '@/lib/hooks';

interface TestExecutionCardProps {
  testCase: TestCase;
  result?: TestResult;
  onSkip?: () => void;
}

function TestExecutionCard({ testCase, result, onSkip }: TestExecutionCardProps) {
  const isRunning = result?.status === 'running' || (!result && testCase.status === 'running');
  const elapsed = useElapsedTime(result?.startedAt || null, isRunning);

  const getStatusIcon = () => {
    if (!result) {
      return <Clock className="h-3.5 w-3.5 text-muted-foreground/50" />;
    }
    switch (result.status) {
      case 'passed':
        return <CheckCircle2 className="h-3.5 w-3.5 text-[#30a46c]" />;
      case 'failed':
      case 'error':
        return <XCircle className="h-3.5 w-3.5 text-[#e5484d]" />;
      case 'running':
        return <Loader2 className="h-3.5 w-3.5 text-[#f5a623] animate-spin" />;
      case 'skipped':
        return <SkipForward className="h-3.5 w-3.5 text-muted-foreground" />;
      default:
        return <Clock className="h-3.5 w-3.5 text-muted-foreground/50" />;
    }
  };

  const getStatusBorderClass = () => {
    if (!result) return 'border-border/40';
    switch (result.status) {
      case 'passed':
        return 'border-[#30a46c]/30 animate-pulse-success';
      case 'failed':
      case 'error':
        return 'border-[#e5484d]/30 animate-pulse-error';
      case 'running':
        return 'border-[#f5a623]/30 animate-pulse-running';
      default:
        return 'border-border/40';
    }
  };

  const progress = result?.currentStep && result?.totalSteps
    ? (result.currentStep / result.totalSteps) * 100
    : 0;

  return (
    <Card className={cn('relative overflow-hidden rounded-md', getStatusBorderClass())}>
      <div className="p-3 pb-2">
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <span className="text-[13px] font-medium truncate">
            {testCase.title}
          </span>
        </div>
      </div>

      <div className="px-3 pb-3 space-y-2.5">
        {/* Browser Preview */}
        <div className="browser-preview aspect-video bg-black rounded overflow-hidden relative">
          {result?.streamingUrl ? (
            <iframe
              src={result.streamingUrl}
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-same-origin"
            />
          ) : isRunning ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-6 w-6 text-[#f5a623] animate-spin" />
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/40">
              <span className="text-[11px]">Waiting...</span>
            </div>
          )}

          {/* Browser toolbar overlay */}
          <div className="absolute top-0 left-0 right-0 h-6 bg-[#111214] border-b border-[#1e2023] flex items-center px-2 gap-1.5 z-10">
            <div className="w-2 h-2 rounded-full bg-[#e5484d]/50" />
            <div className="w-2 h-2 rounded-full bg-[#f5a623]/50" />
            <div className="w-2 h-2 rounded-full bg-[#30a46c]/50" />
          </div>
        </div>

        {/* Progress */}
        {isRunning && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="truncate">
                {result?.currentStepDescription || 'Starting...'}
              </span>
              <span className="flex-shrink-0 ml-2">
                {result?.currentStep || 0}/{result?.totalSteps || '?'}
              </span>
            </div>
            <Progress value={progress} className="h-[3px]" />
          </div>
        )}

        {/* Status / Time */}
        <div className="flex items-center justify-between text-[11px]">
          {result?.status === 'passed' && (
            <span className="text-[#30a46c] font-medium">Passed</span>
          )}
          {(result?.status === 'failed' || result?.status === 'error') && (
            <span className="text-[#e5484d] font-medium truncate max-w-[70%]">
              {result.error || 'Failed'}
            </span>
          )}
          {result?.status === 'skipped' && (
            <span className="text-muted-foreground font-medium">Skipped</span>
          )}
          {isRunning && (
            <span className="text-[#f5a623] font-medium">Running</span>
          )}
          {!result && !isRunning && (
            <span className="text-muted-foreground/50">Pending</span>
          )}

          <span className="text-muted-foreground/60 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {result?.duration
              ? formatDuration(result.duration)
              : isRunning
              ? formatDuration(elapsed)
              : '--'}
          </span>
        </div>

        {/* Actions row */}
        <div className="flex items-center justify-between">
          {result?.streamingUrl && (
            <a
              href={result.streamingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] text-primary/70 hover:text-primary transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              Open in new tab
            </a>
          )}

          {isRunning && onSkip && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={onSkip}
            >
              <SkipForward className="h-3 w-3 mr-1" />
              Skip
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

interface TestExecutionGridProps {
  testCases: TestCase[];
  results: Map<string, TestResult>;
  isRunning: boolean;
  onSkipTest?: (testCaseId: string) => void;
}

export function TestExecutionGrid({
  testCases,
  results,
  isRunning,
  onSkipTest,
}: TestExecutionGridProps) {
  if (testCases.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground">
        No test cases selected for execution
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {testCases.map((tc) => (
        <TestExecutionCard
          key={tc.id}
          testCase={tc}
          result={results.get(tc.id)}
          onSkip={onSkipTest ? () => onSkipTest(tc.id) : undefined}
        />
      ))}

      {isRunning && testCases.length < 3 && (
        Array.from({ length: 3 - testCases.length }).map((_, i) => (
          <Card key={`skeleton-${i}`} className="opacity-30 border-border/40 rounded-md">
            <div className="p-3 pb-2">
              <Skeleton className="h-4 w-3/4" />
            </div>
            <div className="px-3 pb-3 space-y-2.5">
              <Skeleton className="aspect-video w-full rounded" />
              <Skeleton className="h-[3px] w-full" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
