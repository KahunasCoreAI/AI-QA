"use client";

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreVertical, Trash2, Edit2, Play, CheckCircle2, XCircle, Clock } from 'lucide-react';
import type { Project, TestCase } from '@/types';
import { formatRelativeTime } from '@/lib/utils';

interface ProjectCardProps {
  project: Project;
  testCases?: TestCase[];
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRunTests?: () => void;
}

export function ProjectCard({
  project,
  testCases = [],
  onSelect,
  onEdit,
  onDelete,
  onRunTests,
}: ProjectCardProps) {
  const stats = testCases.reduce(
    (acc, tc) => {
      const status = tc.lastRunResult?.status;
      if (status === 'passed') acc.passed++;
      else if (status === 'failed' || status === 'error') acc.failed++;
      else acc.pending++;
      return acc;
    },
    { passed: 0, failed: 0, pending: 0 }
  );

  const totalTests = testCases.length;
  const hasRun = stats.passed > 0 || stats.failed > 0;

  return (
    <Card
      className="cursor-pointer transition-all duration-150 hover:bg-accent/30 border-border/40"
      onClick={onSelect}
    >
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-sm font-medium tracking-tight text-foreground">{project.name}</h3>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-7 w-7 -mr-1.5 -mt-1 text-muted-foreground hover:text-foreground">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}>
                <Edit2 className="mr-2 h-3.5 w-3.5" />
                Edit
              </DropdownMenuItem>
              {onRunTests && (
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onRunTests(); }}>
                  <Play className="mr-2 h-3.5 w-3.5" />
                  Run Tests
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                className="text-destructive"
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <p className="text-xs text-muted-foreground truncate mb-1.5">
          {project.websiteUrl}
        </p>

        {project.description && (
          <p className="text-xs text-muted-foreground/60 line-clamp-2 mb-3">
            {project.description}
          </p>
        )}

        <div className="flex items-center justify-between pt-3 border-t border-border/30">
          {totalTests > 0 ? (
            <div className="flex items-center gap-3 text-xs">
              {hasRun ? (
                <>
                  <span className="flex items-center gap-1 text-[#30a46c]">
                    <CheckCircle2 className="h-3 w-3" />
                    {stats.passed}
                  </span>
                  <span className="flex items-center gap-1 text-[#e5484d]">
                    <XCircle className="h-3 w-3" />
                    {stats.failed}
                  </span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {stats.pending}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground/50">
                  {totalTests} test{totalTests !== 1 ? 's' : ''} · No runs yet
                </span>
              )}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground/50">
              No tests
            </span>
          )}

          {project.lastRunAt && (
            <span className="text-[11px] text-muted-foreground/40">
              {formatRelativeTime(project.lastRunAt)}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
