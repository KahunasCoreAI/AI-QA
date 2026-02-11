"use client";

import { useState, useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { MoreVertical, Edit2, Trash2, Play, Plus, FolderPlus, FolderMinus, Sparkles } from 'lucide-react';
import type { TestCase, TestGroup, UserAccount } from '@/types';
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
  groups: TestGroup[];
  parallelLimit: number;
  onSaveAsGroupClick: () => void;
  onRemoveFromGroup: (testCaseId: string, group: TestGroup) => void;
  userAccounts?: UserAccount[];
  fallbackCreatorName?: string;
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

export function TestCaseList({
  testCases,
  selectedIds,
  onSelectionChange,
  onSelect,
  onEdit,
  onDelete,
  onRun,
  onCreateNew,
  groups,
  parallelLimit,
  onSaveAsGroupClick,
  onRemoveFromGroup,
  userAccounts = [],
  fallbackCreatorName,
}: TestCaseListProps) {
  const [groupFilter, setGroupFilter] = useState<string>('__all__');

  const testGroupMap = useMemo(() => {
    const map = new Map<string, TestGroup>();
    for (const g of groups) {
      for (const id of g.testCaseIds) {
        map.set(id, g);
      }
    }
    return map;
  }, [groups]);

  const filteredTestCases = useMemo(() => {
    if (groupFilter === '__all__') return testCases;
    if (groupFilter === '__ungrouped__') return testCases.filter(tc => !testGroupMap.has(tc.id));
    return testCases.filter(tc => testGroupMap.get(tc.id)?.id === groupFilter);
  }, [testCases, groupFilter, testGroupMap]);

  const allSelected = filteredTestCases.length > 0 && filteredTestCases.every(tc => selectedIds.has(tc.id));
  const someSelected = filteredTestCases.some(tc => selectedIds.has(tc.id)) && !allSelected;

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onSelectionChange(next);
  };

  const toggleAll = () => {
    if (allSelected) {
      const next = new Set(selectedIds);
      for (const tc of filteredTestCases) next.delete(tc.id);
      onSelectionChange(next);
    } else {
      const next = new Set(selectedIds);
      for (const tc of filteredTestCases) next.add(tc.id);
      onSelectionChange(next);
    }
  };

  const selectAll = () => {
    const next = new Set(selectedIds);
    for (const tc of filteredTestCases) next.add(tc.id);
    onSelectionChange(next);
  };

  const selectNone = () => {
    const next = new Set(selectedIds);
    for (const tc of filteredTestCases) next.delete(tc.id);
    onSelectionChange(next);
  };

  // Empty state
  if (testCases.length === 0) {
    return (
      <div className="rounded-lg border border-border/40 py-16 text-center">
        <Sparkles className="mx-auto h-10 w-10 text-muted-foreground/30 mb-4" />
        <p className="text-sm text-muted-foreground mb-4">
          No test cases yet. Use the AI Generator to create tests from your requirements,
          or create a test manually.
        </p>
        <Button size="sm" onClick={onCreateNew}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Create Test Case
        </Button>
      </div>
    );
  }

  const exceedsLimit = selectedIds.size > parallelLimit;

  return (
    <div className="space-y-3">
      {/* Selection toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {groups.length > 0 && (
            <Select value={groupFilter} onValueChange={setGroupFilter}>
              <SelectTrigger className="!h-7 px-2 py-0 text-xs w-auto min-w-[120px]">
                <SelectValue placeholder="All groups" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__" className="text-xs">All groups</SelectItem>
                <SelectItem value="__ungrouped__" className="text-xs">Ungrouped</SelectItem>
                {groups.map(g => (
                  <SelectItem key={g.id} value={g.id} className="text-xs">{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={selectAll}>
            Select All
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={selectNone}>
            Select None
          </Button>
          <span className="text-xs text-muted-foreground">
            {selectedIds.size} of {filteredTestCases.length} selected
          </span>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            exceedsLimit ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      disabled
                    >
                      <FolderPlus className="mr-1.5 h-3.5 w-3.5" />
                      Save Group ({selectedIds.size})
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  Group size cannot exceed parallel limit ({parallelLimit})
                </TooltipContent>
              </Tooltip>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={onSaveAsGroupClick}
              >
                <FolderPlus className="mr-1.5 h-3.5 w-3.5" />
                Save Group ({selectedIds.size})
              </Button>
            )
          )}
          <Button size="sm" className="h-7 text-xs" onClick={onCreateNew}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New Test
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border/40">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead className="max-w-0 w-full">Title</TableHead>
              <TableHead className="w-[140px]">Created By</TableHead>
              <TableHead className="w-[120px]">Account</TableHead>
              <TableHead className="w-[120px]">Group</TableHead>
              <TableHead className="w-[100px]">Last Run</TableHead>
              <TableHead className="w-[90px]">Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTestCases.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center whitespace-normal">
                  <p className="text-xs text-muted-foreground">No test cases match this filter.</p>
                </TableCell>
              </TableRow>
            ) : null}
            {filteredTestCases.map((testCase) => {
              const lastResult = testCase.lastRunResult;
              const status = lastResult?.status || testCase.status;
              const group = testGroupMap.get(testCase.id);
              const isSelected = selectedIds.has(testCase.id);

              // Resolve account label
              let accountCell: React.ReactNode;
              const createdByDisplay =
                testCase.createdByName?.trim().split(/\s+/)[0] ||
                fallbackCreatorName?.trim().split(/\s+/)[0] ||
                (testCase.createdByUserId ? 'User' : '—');
              if (testCase.userAccountId === '__any__') {
                accountCell = (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    Any
                  </Badge>
                );
              } else if (testCase.userAccountId) {
                const account = userAccounts.find((a) => a.id === testCase.userAccountId);
                accountCell = (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {account?.label ?? 'Unknown'}
                  </Badge>
                );
              } else {
                accountCell = <span className="text-muted-foreground">—</span>;
              }

              return (
                <TableRow
                  key={testCase.id}
                  className={cn(
                    'cursor-pointer hover:bg-accent/30',
                    isSelected && 'bg-primary/5'
                  )}
                  onClick={() => onSelect(testCase)}
                >
                  {/* Checkbox */}
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelection(testCase.id)}
                      aria-label={`Select ${testCase.title}`}
                    />
                  </TableCell>

                  {/* Title + description */}
                  <TableCell className="max-w-0 w-full whitespace-normal">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{testCase.title}</div>
                      {testCase.description && (
                        <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                          {testCase.description}
                        </div>
                      )}
                    </div>
                  </TableCell>

                  {/* Created By */}
                  <TableCell>
                    <span
                      className="block max-w-[140px] truncate text-xs text-muted-foreground"
                      title={createdByDisplay === '—' ? undefined : createdByDisplay}
                    >
                      {createdByDisplay}
                    </span>
                  </TableCell>

                  {/* Account */}
                  <TableCell>{accountCell}</TableCell>

                  {/* Group */}
                  <TableCell>
                    {group ? (
                      <span className="text-sm">{group.name}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  {/* Last Run */}
                  <TableCell>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {lastResult?.completedAt
                        ? formatRelativeTime(lastResult.completedAt)
                        : 'Never'}
                    </span>
                  </TableCell>

                  {/* Status */}
                  <TableCell>{getStatusBadge(status)}</TableCell>

                  {/* Actions */}
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit(testCase)}>
                          <Edit2 className="mr-2 h-3.5 w-3.5" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onRun(testCase)}>
                          <Play className="mr-2 h-3.5 w-3.5" />
                          Run
                        </DropdownMenuItem>
                        {group && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => onRemoveFromGroup(testCase.id, group)}>
                              <FolderMinus className="mr-2 h-3.5 w-3.5" />
                              Remove from group
                            </DropdownMenuItem>
                          </>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => onDelete(testCase)}
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
