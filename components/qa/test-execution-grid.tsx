"use client";

import { useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Loader2, Clock, ExternalLink, SkipForward, User, AlertCircle } from 'lucide-react';
import type { TestCase, TestResult, UserAccount } from '@/types';
import { cn, formatDuration } from '@/lib/utils';
import { useElapsedTime } from '@/lib/hooks';

interface TestExecutionCardProps {
  testCase: TestCase;
  result?: TestResult;
  onSkip?: () => void;
  userAccount?: UserAccount;
}

function IframeWithLoading({
  previewUrl,
  externalViewUrl
}: {
  previewUrl: string;
  externalViewUrl?: string;
}) {
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeError, setIframeError] = useState(false);

  const handleIframeLoad = useCallback(() => {
    setIframeLoaded(true);
    setIframeError(false);
  }, []);

  const handleIframeError = useCallback(() => {
    setIframeLoaded(true);
    setIframeError(true);
  }, []);

  if (iframeError) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center space-y-2">
          <AlertCircle className="h-6 w-6 text-[#f5a623] mx-auto" />
          <p className="text-[10px] text-muted-foreground/60">Stream unavailable</p>
          {externalViewUrl && (
            <a
              href={externalViewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-primary/70 hover:text-primary transition-colors underline"
            >
              Open in new tab
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <iframe
        key={previewUrl}
        src={previewUrl}
        className="w-full h-full border-0"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        onLoad={handleIframeLoad}
        onError={handleIframeError}
      />
      {!iframeLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
          <div className="text-center space-y-2">
            <Loader2 className="h-6 w-6 text-[#f5a623] animate-spin mx-auto" />
            <p className="text-[10px] text-muted-foreground/60">Loading browser stream...</p>
          </div>
        </div>
      )}
    </>
  );
}

function TestExecutionCard({ testCase, result, onSkip, userAccount }: TestExecutionCardProps) {
  const isRunning = result?.status === 'running' || (!result && testCase.status === 'running');
  const elapsed = useElapsedTime(result?.startedAt || null, isRunning);
  const previewUrl = isRunning ? (result?.streamingUrl || result?.recordingUrl) : undefined;
  const externalViewUrl = result?.recordingUrl || (isRunning ? result?.streamingUrl : undefined);

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

  return (
    <Card className={cn('relative overflow-hidden rounded-md', getStatusBorderClass())}>
      <div className="p-3 pb-2">
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <span className="text-[13px] font-medium truncate">
            {testCase.title}
          </span>
          {userAccount && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 gap-0.5">
              <User className="h-2.5 w-2.5" />
              {userAccount.label}
            </Badge>
          )}
        </div>
      </div>

      <div className="px-3 pb-3 space-y-2.5">
        {/* Browser Preview */}
        <div
          className={cn(
            'browser-preview bg-black rounded overflow-hidden relative',
            isRunning ? 'aspect-square' : 'aspect-video'
          )}
        >
          {previewUrl ? (
            <IframeWithLoading previewUrl={previewUrl} externalViewUrl={externalViewUrl} />
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
                {result?.currentStepDescription || 'Browser agent executing test...'}
              </span>
            </div>
            <div className="relative h-[3px] w-full overflow-hidden rounded-full bg-muted/40">
              <div
                className="absolute inset-y-0 w-1/3 rounded-full bg-[#f5a623]/80"
                style={{ animation: 'indeterminate-slide 1.2s ease-in-out infinite' }}
              />
            </div>
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
          {externalViewUrl && (
            <a
              href={externalViewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] text-primary/70 hover:text-primary transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              {result?.recordingUrl ? 'View recording' : 'Open live browser'}
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
  userAccounts?: UserAccount[];
}

export function TestExecutionGrid({
  testCases,
  results,
  isRunning,
  onSkipTest,
  userAccounts = [],
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
      {testCases.map((tc) => {
        const account = userAccounts.find(a => a.id === tc.userAccountId);
        return (
          <TestExecutionCard
            key={tc.id}
            testCase={tc}
            result={results.get(tc.id)}
            onSkip={onSkipTest ? () => onSkipTest(tc.id) : undefined}
            userAccount={account}
          />
        );
      })}

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
