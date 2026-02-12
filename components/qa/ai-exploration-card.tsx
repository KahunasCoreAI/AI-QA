"use client";

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Clock, ExternalLink, Sparkles, CheckCircle2, XCircle } from 'lucide-react';
import type { AiGenerationJob } from '@/types';
import { cn, formatDuration } from '@/lib/utils';
import { useElapsedTime } from '@/lib/hooks';

interface AiExplorationCardProps {
  job: AiGenerationJob;
}

export function AiExplorationCard({ job }: AiExplorationCardProps) {
  const isRunning = job.status === 'running' || job.status === 'queued';
  const elapsed = useElapsedTime(job.startedAt || job.createdAt, isRunning);
  const previewUrl = isRunning ? job.streamingUrl : undefined;
  const externalViewUrl = job.recordingUrl || (isRunning ? job.streamingUrl : undefined);

  const getStatusIcon = () => {
    switch (job.status) {
      case 'completed':
        return <CheckCircle2 className="h-3.5 w-3.5 text-[#30a46c]" />;
      case 'failed':
        return <XCircle className="h-3.5 w-3.5 text-[#e5484d]" />;
      case 'running':
        return <Loader2 className="h-3.5 w-3.5 text-[#f5a623] animate-spin" />;
      case 'queued':
        return <Clock className="h-3.5 w-3.5 text-muted-foreground/50" />;
      default:
        return <Clock className="h-3.5 w-3.5 text-muted-foreground/50" />;
    }
  };

  const getStatusBorderClass = () => {
    switch (job.status) {
      case 'completed':
        return 'border-[#30a46c]/30';
      case 'failed':
        return 'border-[#e5484d]/30';
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
          <Sparkles className="h-3 w-3 text-primary/60" />
          <span className="text-[13px] font-medium truncate">
            {job.groupName ? `AI Explore: ${job.groupName}` : 'AI Exploration'}
          </span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize ml-auto">
            {job.status}
          </Badge>
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
            <iframe
              src={previewUrl}
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-same-origin"
            />
          ) : isRunning ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center space-y-2">
                <Loader2 className="h-6 w-6 text-[#f5a623] animate-spin mx-auto" />
                <p className="text-[10px] text-muted-foreground/60">Connecting to browser...</p>
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/40">
              <span className="text-[11px]">
                {job.status === 'completed' ? 'Exploration complete' : job.status === 'failed' ? 'Exploration failed' : 'Waiting...'}
              </span>
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
                {job.progressMessage || 'AI is exploring your app...'}
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

        {/* Prompt preview */}
        <p className="text-[11px] text-muted-foreground/70 truncate">
          {job.prompt}
        </p>

        {/* Status / Time */}
        <div className="flex items-center justify-between text-[11px]">
          {job.status === 'completed' && (
            <span className="text-[#30a46c] font-medium">
              {job.draftCount} draft{job.draftCount === 1 ? '' : 's'} ready
            </span>
          )}
          {job.status === 'failed' && (
            <span className="text-[#e5484d] font-medium truncate max-w-[70%]">
              {job.error || 'Failed'}
            </span>
          )}
          {isRunning && (
            <span className="text-[#f5a623] font-medium">Exploring</span>
          )}

          <span className="text-muted-foreground/60 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {job.completedAt && job.startedAt
              ? formatDuration(job.completedAt - job.startedAt)
              : isRunning
              ? formatDuration(elapsed)
              : '--'}
          </span>
        </div>

        {/* External link */}
        {externalViewUrl && (
          <a
            href={externalViewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] text-primary/70 hover:text-primary transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            {job.recordingUrl && !isRunning ? 'View recording' : 'Open live browser'}
          </a>
        )}
      </div>
    </Card>
  );
}
