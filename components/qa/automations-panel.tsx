"use client";

import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { MoreHorizontal, ExternalLink, Play, Trash2, Eye, Zap, Settings } from 'lucide-react';
import type { AutomationRun } from '@/types';
import { formatDelay, formatRelativeTime } from '@/lib/utils';

interface AutomationsPanelProps {
  automationRuns: AutomationRun[];
  onViewDetail: (runId: string) => void;
  onRerun: (run: AutomationRun) => void;
  onDelete: (run: AutomationRun) => void;
  onOpenSettings: () => void;
}

const getStatusBadge = (run: AutomationRun) => {
  switch (run.status) {
    case 'completed':
      return <Badge className="bg-[#30a46c]/8 text-[#30a46c] border-[#30a46c]/15 text-[11px] font-medium px-1.5 py-0">Completed</Badge>;
    case 'failed':
      return <Badge className="bg-[#e5484d]/8 text-[#e5484d] border-[#e5484d]/15 text-[11px] font-medium px-1.5 py-0">Failed</Badge>;
    case 'running':
      return <Badge className="bg-[#f5a623]/8 text-[#f5a623] border-[#f5a623]/15 text-[11px] font-medium px-1.5 py-0">Running</Badge>;
    case 'selecting_tests':
      return <Badge className="bg-[#6e56cf]/8 text-[#6e56cf] border-[#6e56cf]/15 text-[11px] font-medium px-1.5 py-0">Selecting</Badge>;
    case 'pending':
      if (run.delayMs) {
        return <Badge variant="secondary" className="text-[11px] font-medium px-1.5 py-0">Delayed {formatDelay(run.delayMs)}</Badge>;
      }
      return <Badge variant="secondary" className="text-[11px] font-medium px-1.5 py-0">Pending</Badge>;
    default:
      return <Badge variant="secondary" className="text-[11px] font-medium px-1.5 py-0">{run.status}</Badge>;
  }
};

const getStartedLabel = (run: AutomationRun) => {
  return formatRelativeTime(run.startedAt || run.createdAt);
};

export function AutomationsPanel({
  automationRuns,
  onViewDetail,
  onRerun,
  onDelete,
  onOpenSettings,
}: AutomationsPanelProps) {
  const [deleteTarget, setDeleteTarget] = useState<AutomationRun | null>(null);

  if (automationRuns.length === 0) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Automations</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Automated test runs triggered by GitHub PR merges
          </p>
        </div>
        <Card className="border-border/40">
          <CardContent className="py-10 text-center">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 mb-3">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <h3 className="text-sm font-medium mb-1">No automation runs yet</h3>
            <p className="text-xs text-muted-foreground mb-4 max-w-sm mx-auto">
              Enable automations in Settings to automatically run tests when PRs are merged.
            </p>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onOpenSettings}>
              <Settings className="mr-1.5 h-3.5 w-3.5" />
              Go to Settings
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Automations</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {automationRuns.length} automation run{automationRuns.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div className="rounded-md border border-border/40">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px] font-medium w-[40%]">PR</TableHead>
              <TableHead className="text-[11px] font-medium text-center">Tests</TableHead>
              <TableHead className="text-[11px] font-medium text-center">Results</TableHead>
              <TableHead className="text-[11px] font-medium">Started</TableHead>
              <TableHead className="text-[11px] font-medium">Status</TableHead>
              <TableHead className="text-[11px] font-medium w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {automationRuns.map((run) => (
              <TableRow
                key={run.id}
                className="cursor-pointer hover:bg-accent/30"
                onClick={() => onViewDetail(run.id)}
              >
                <TableCell className="py-2">
                  <div className="space-y-0.5">
                    <div className="text-xs font-medium truncate max-w-[300px]">
                      #{run.prNumber} {run.prTitle}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {run.prAuthor} &middot; {run.headBranch} &rarr; {run.baseBranch}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <span className="text-xs tabular-nums">{run.totalTests}</span>
                </TableCell>
                <TableCell className="text-center">
                  {run.status === 'completed' || run.status === 'failed' ? (
                    <div className="flex items-center justify-center gap-1.5">
                      {run.passed > 0 && (
                        <span className="text-[11px] text-[#30a46c] tabular-nums">{run.passed}P</span>
                      )}
                      {run.failed > 0 && (
                        <span className="text-[11px] text-[#e5484d] tabular-nums">{run.failed}F</span>
                      )}
                      {run.skipped > 0 && (
                        <span className="text-[11px] text-muted-foreground tabular-nums">{run.skipped}S</span>
                      )}
                      {run.passed === 0 && run.failed === 0 && run.skipped === 0 && (
                        <span className="text-[11px] text-muted-foreground">&mdash;</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">&mdash;</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className="text-[11px] text-muted-foreground">
                    {getStartedLabel(run)}
                  </span>
                </TableCell>
                <TableCell>
                  {getStatusBadge(run)}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onViewDetail(run.id); }}>
                        <Eye className="mr-2 h-3.5 w-3.5" />
                        View Details
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onRerun(run); }}>
                        <Play className="mr-2 h-3.5 w-3.5" />
                        Rerun
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <a
                          href={run.prUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="mr-2 h-3.5 w-3.5" />
                          Open PR
                        </a>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(run); }}
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-semibold">Delete automation run?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              This will remove the automation run record. The associated test run and results will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="h-8 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) {
                  onDelete(deleteTarget);
                  setDeleteTarget(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
