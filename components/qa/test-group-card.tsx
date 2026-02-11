"use client";

import { useState, useRef, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
  ChevronRight,
  ChevronDown,
  FolderOpen,
  SkipForward,
  Pencil,
  MinusCircle,
  AlertTriangle,
  User,
} from 'lucide-react';
import type { TestCase, TestGroup, UserAccount } from '@/types';
import { cn, formatRelativeTime } from '@/lib/utils';

interface TestGroupCardProps {
  group: TestGroup;
  testCases: TestCase[];           // the test cases that belong to this group
  selectedIds: Set<string>;
  parallelLimit: number;
  onSelectionChange: (ids: Set<string>) => void;
  onSelectTest: (testCase: TestCase) => void;
  onEditTest: (testCase: TestCase) => void;
  onDeleteTest: (testCase: TestCase) => void;
  onRunTest: (testCase: TestCase) => void;
  onRunGroup: (group: TestGroup) => void;
  onRenameGroup: (group: TestGroup, newName: string) => void;
  onDeleteGroup: (group: TestGroup) => void;
  onRemoveFromGroup: (testCaseId: string, group: TestGroup) => void;
  userAccounts?: UserAccount[];
}

export function TestGroupCard({
  group,
  testCases,
  selectedIds,
  parallelLimit,
  onSelectionChange,
  onSelectTest,
  onEditTest,
  onDeleteTest,
  onRunTest,
  onRunGroup,
  onRenameGroup,
  onDeleteGroup,
  onRemoveFromGroup,
  userAccounts = [],
}: TestGroupCardProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameName, setRenameName] = useState(group.name);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const exceedsLimit = testCases.length > parallelLimit;

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  const handleRenameSubmit = () => {
    const trimmed = renameName.trim();
    if (trimmed && trimmed !== group.name) {
      onRenameGroup(group, trimmed);
    } else {
      setRenameName(group.name);
    }
    setIsRenaming(false);
  };

  const toggleSelection = (id: string) => {
    const newSelection = new Set(selectedIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    onSelectionChange(newSelection);
  };

  const toggleGroupSelection = () => {
    const groupTestIds = testCases.map((tc) => tc.id);
    const allSelected = groupTestIds.every((id) => selectedIds.has(id));
    const newSelection = new Set(selectedIds);
    if (allSelected) {
      groupTestIds.forEach((id) => newSelection.delete(id));
    } else {
      groupTestIds.forEach((id) => newSelection.add(id));
    }
    onSelectionChange(newSelection);
  };

  const allSelected = testCases.length > 0 && testCases.every((tc) => selectedIds.has(tc.id));
  const someSelected = testCases.some((tc) => selectedIds.has(tc.id)) && !allSelected;

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

  const getGroupStatusBadge = () => {
    if (!group.lastRunStatus || group.lastRunStatus === 'never_run') {
      return <Badge variant="secondary" className="text-[10px] font-medium px-1.5 py-0">Never Run</Badge>;
    }
    switch (group.lastRunStatus) {
      case 'passed':
        return <Badge className="bg-[#30a46c]/8 text-[#30a46c] border-[#30a46c]/15 text-[10px] font-medium px-1.5 py-0">Passed</Badge>;
      case 'failed':
        return <Badge className="bg-[#e5484d]/8 text-[#e5484d] border-[#e5484d]/15 text-[10px] font-medium px-1.5 py-0">Failed</Badge>;
      case 'running':
        return <Badge className="bg-[#f5a623]/8 text-[#f5a623] border-[#f5a623]/15 text-[10px] font-medium px-1.5 py-0">Running</Badge>;
      default:
        return null;
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="rounded-md border border-border/50 bg-card/50">
        {/* Group header */}
        <div className="flex items-center gap-2 px-3 py-2">
          <Checkbox
            checked={allSelected}
            ref={(el) => {
              if (el) {
                const input = el as unknown as HTMLButtonElement;
                if (someSelected) {
                  input.dataset.state = 'indeterminate';
                }
              }
            }}
            onCheckedChange={() => toggleGroupSelection()}
            onClick={(e) => e.stopPropagation()}
            className="flex-shrink-0"
          />

          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 flex-1 min-w-0 text-left hover:bg-accent/30 rounded px-1.5 py-0.5 -ml-1.5 transition-colors">
              {isOpen ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              )}
              <FolderOpen className="h-3.5 w-3.5 text-muted-foreground/60 flex-shrink-0" />

              {isRenaming ? (
                <Input
                  ref={renameInputRef}
                  value={renameName}
                  onChange={(e) => setRenameName(e.target.value)}
                  onBlur={handleRenameSubmit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRenameSubmit();
                    if (e.key === 'Escape') {
                      setRenameName(group.name);
                      setIsRenaming(false);
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="h-6 text-xs font-medium px-1.5 py-0 w-48"
                />
              ) : (
                <span className="text-xs font-medium truncate">{group.name}</span>
              )}

              <span className="text-[11px] text-muted-foreground/60 flex-shrink-0">
                {testCases.length} test{testCases.length !== 1 ? 's' : ''}
              </span>
            </button>
          </CollapsibleTrigger>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {exceedsLimit && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-500 border-amber-500/30">
                <AlertTriangle className="mr-0.5 h-2.5 w-2.5" />
                &gt; limit
              </Badge>
            )}
            {getGroupStatusBadge()}
            {group.lastRunAt && (
              <span className="text-[10px] text-muted-foreground/50 whitespace-nowrap">
                {formatRelativeTime(group.lastRunAt)}
              </span>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                onRunGroup(group);
              }}
              title="Run Group"
            >
              <Play className="h-3 w-3" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => {
                  setRenameName(group.name);
                  setIsRenaming(true);
                }}>
                  <Pencil className="mr-2 h-3.5 w-3.5" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onRunGroup(group)}>
                  <Play className="mr-2 h-3.5 w-3.5" />
                  Run Group
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onClick={() => onDeleteGroup(group)}>
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Delete Group
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Expanded test list */}
        <CollapsibleContent>
          <div className="border-t border-border/30">
            {testCases.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-xs text-muted-foreground">No tests in this group</p>
              </div>
            ) : (
              <div className="divide-y divide-border/20">
                {testCases.map((testCase) => {
                  const lastResult = testCase.lastRunResult;
                  return (
                    <div
                      key={testCase.id}
                      className={cn(
                        'flex items-start gap-2.5 px-3 py-2.5 pl-8 transition-colors duration-100 cursor-pointer group/test',
                        selectedIds.has(testCase.id)
                          ? 'bg-primary/5'
                          : 'hover:bg-accent/20'
                      )}
                      onClick={() => onSelectTest(testCase)}
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
                          {testCase.userAccountId && (() => {
                            if (testCase.userAccountId === '__any__') {
                              return (
                                <Badge variant="outline" className="text-[10px] px-1 py-0 ml-1 gap-0.5">
                                  <User className="h-2.5 w-2.5" />
                                  Any account
                                </Badge>
                              );
                            }
                            const account = userAccounts.find(a => a.id === testCase.userAccountId);
                            return (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 ml-1 gap-0.5">
                                <User className="h-2.5 w-2.5" />
                                {account?.label ?? 'Unknown'}
                              </Badge>
                            );
                          })()}
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
                            onEditTest(testCase);
                          }}>
                            <Edit2 className="mr-2 h-3.5 w-3.5" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            onRunTest(testCase);
                          }}>
                            <Play className="mr-2 h-3.5 w-3.5" />
                            Run
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            onRemoveFromGroup(testCase.id, group);
                          }}>
                            <MinusCircle className="mr-2 h-3.5 w-3.5" />
                            Remove from Group
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteTest(testCase);
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
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
