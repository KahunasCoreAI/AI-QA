"use client";

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  MoreVertical,
  Edit2,
  Trash2,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Plus,
  Sparkles,
  ChevronRight,
  SkipForward,
} from 'lucide-react';
import type { TestCase } from '@/types';
import { cn, formatRelativeTime } from '@/lib/utils';

interface TestCaseListProps {
  testCases: TestCase[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  onSelect: (testCase: TestCase) => void;
  onEdit: (testCase: TestCase) => void;
  onDelete: (testCase: TestCase) => void;
  onRun: (testCase: TestCase) => void;
  onCreateNew: () => void;
}

export function TestCaseList({
  testCases,
  selectedIds,
  onSelectionChange,
  onSelect,
  onEdit,
  onDelete,
  onRun,
  onCreateNew,
}: TestCaseListProps) {
  const toggleSelection = (id: string) => {
    const newSelection = new Set(selectedIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    onSelectionChange(newSelection);
  };

  const selectAll = () => {
    onSelectionChange(new Set(testCases.map((tc) => tc.id)));
  };

  const selectNone = () => {
    onSelectionChange(new Set());
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'passed':
        return <CheckCircle2 className="h-3.5 w-3.5 text-[#30a46c]" />;
      case 'failed':
      case 'error':
        return <XCircle className="h-3.5 w-3.5 text-[#e5484d]" />;
      case 'skipped':
        return <SkipForward className="h-3.5 w-3.5 text-muted-foreground" />;
      default:
        return <Clock className="h-3.5 w-3.5 text-muted-foreground/60" />;
    }
  };

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

  if (testCases.length === 0) {
    return (
      <Card className="border-border/40">
        <CardContent className="py-12 text-center">
          <Sparkles className="mx-auto h-10 w-10 text-muted-foreground/30 mb-4" />
          <p className="text-sm text-muted-foreground mb-4">
            No test cases yet. Use the AI Generator to create tests from your requirements,
            or create a test manually.
          </p>
          <Button size="sm" onClick={onCreateNew}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Create Test Case
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Selection controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={selectAll}>
            Select All
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={selectNone}>
            Select None
          </Button>
          <span className="text-xs text-muted-foreground">
            {selectedIds.size} of {testCases.length} selected
          </span>
        </div>
        <Button size="sm" className="h-7 text-xs" onClick={onCreateNew}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New Test
        </Button>
      </div>

      {/* Test cases list */}
      <div className="space-y-1">
        {testCases.map((testCase) => {
          const lastResult = testCase.lastRunResult;

          return (
            <div
              key={testCase.id}
              className={cn(
                'flex items-start gap-2.5 p-3 rounded-md border transition-colors duration-100 cursor-pointer group',
                selectedIds.has(testCase.id)
                  ? 'bg-primary/5 border-primary/20'
                  : 'bg-transparent border-border/40 hover:bg-accent/30'
              )}
              onClick={() => onSelect(testCase)}
            >
              <Checkbox
                checked={selectedIds.has(testCase.id)}
                onCheckedChange={() => toggleSelection(testCase.id)}
                className="mt-0.5"
                onClick={(e) => e.stopPropagation()}
              />

              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-center gap-2">
                  {getStatusIcon(lastResult?.status || testCase.status)}
                  <span className="text-sm font-medium">{testCase.title}</span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-1 pl-5.5">
                  {testCase.description}
                </p>
                {testCase.expectedOutcome && (
                  <p className="text-xs pl-5.5">
                    <span className="text-muted-foreground/60">Expected: </span>
                    <span className="text-[#30a46c]/80 line-clamp-1">{testCase.expectedOutcome}</span>
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {getStatusBadge(lastResult?.status || testCase.status)}
                {lastResult?.completedAt && (
                  <span className="text-[11px] text-muted-foreground/50 whitespace-nowrap">
                    {formatRelativeTime(lastResult.completedAt)}
                  </span>
                )}
              </div>

              <ChevronRight className="h-4 w-4 text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity duration-100 flex-shrink-0 mt-0.5" />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 flex-shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={(e) => {
                    e.stopPropagation();
                    onEdit(testCase);
                  }}>
                    <Edit2 className="mr-2 h-3.5 w-3.5" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => {
                    e.stopPropagation();
                    onRun(testCase);
                  }}>
                    <Play className="mr-2 h-3.5 w-3.5" />
                    Run
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(testCase);
                    }}
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}
      </div>
    </div>
  );
}
