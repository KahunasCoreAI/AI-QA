"use client";

import { useEffect, useMemo, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
  MoreVertical,
  Edit2,
  Trash2,
  Play,
  Plus,
  FolderPlus,
  FolderMinus,
  Sparkles,
  Upload,
  Trash,
} from 'lucide-react';
import type { GeneratedTestDraft, TestCase, TestGroup, UserAccount } from '@/types';
import { cn, formatRelativeTime } from '@/lib/utils';

interface TestCaseListProps {
  testCases: TestCase[];
  drafts?: GeneratedTestDraft[];
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
  onPublishDrafts?: (draftIds: string[], groupName?: string) => void;
  onDiscardDrafts?: (draftIds: string[]) => void;
  onDraftsViewed?: () => void;
  isPublishingDrafts?: boolean;
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

type ContentFilter = '__published__' | '__drafts__';

export function TestCaseList({
  testCases,
  drafts = [],
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
  onPublishDrafts,
  onDiscardDrafts,
  onDraftsViewed,
  isPublishingDrafts = false,
  userAccounts = [],
  fallbackCreatorName,
}: TestCaseListProps) {
  const [groupFilter, setGroupFilter] = useState<string>('__all__');
  const [contentFilter, setContentFilter] = useState<ContentFilter>('__published__');
  const [selectedDraftIds, setSelectedDraftIds] = useState<Set<string>>(new Set());
  const [draftPublishGroupName, setDraftPublishGroupName] = useState('');

  useEffect(() => {
    if (contentFilter === '__drafts__') {
      onDraftsViewed?.();
    }
  }, [contentFilter, onDraftsViewed]);

  const testGroupMap = useMemo(() => {
    const map = new Map<string, TestGroup>();
    for (const group of groups) {
      for (const id of group.testCaseIds) {
        map.set(id, group);
      }
    }
    return map;
  }, [groups]);

  const filteredTestCases = useMemo(() => {
    if (groupFilter === '__all__') return testCases;
    if (groupFilter === '__ungrouped__') return testCases.filter((testCase) => !testGroupMap.has(testCase.id));
    return testCases.filter((testCase) => testGroupMap.get(testCase.id)?.id === groupFilter);
  }, [testCases, groupFilter, testGroupMap]);

  const publishedAllSelected =
    filteredTestCases.length > 0 && filteredTestCases.every((testCase) => selectedIds.has(testCase.id));
  const publishedSomeSelected =
    filteredTestCases.some((testCase) => selectedIds.has(testCase.id)) && !publishedAllSelected;

  const draftRows = useMemo(
    () => drafts.filter((draft) => draft.status === 'draft' || draft.status === 'duplicate_skipped'),
    [drafts]
  );
  const selectableDraftRows = useMemo(
    () => draftRows.filter((draft) => draft.status === 'draft'),
    [draftRows]
  );
  const draftAllSelected =
    selectableDraftRows.length > 0 && selectableDraftRows.every((draft) => selectedDraftIds.has(draft.id));

  const resolveAccountCell = (userAccountId?: string) => {
    if (userAccountId === '__any__') {
      return <Badge variant="outline" className="text-[10px] px-1.5 py-0">Any</Badge>;
    }
    if (userAccountId) {
      const account = userAccounts.find((entry) => entry.id === userAccountId);
      return (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
          {account?.label ?? 'Unknown'}
        </Badge>
      );
    }
    return <span className="text-muted-foreground">—</span>;
  };

  const togglePublishedSelection = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onSelectionChange(next);
  };

  const toggleAllPublished = () => {
    const next = new Set(selectedIds);
    if (publishedAllSelected) {
      for (const testCase of filteredTestCases) next.delete(testCase.id);
    } else {
      for (const testCase of filteredTestCases) next.add(testCase.id);
    }
    onSelectionChange(next);
  };

  const selectAllPublished = () => {
    const next = new Set(selectedIds);
    for (const testCase of filteredTestCases) next.add(testCase.id);
    onSelectionChange(next);
  };

  const selectNonePublished = () => {
    const next = new Set(selectedIds);
    for (const testCase of filteredTestCases) next.delete(testCase.id);
    onSelectionChange(next);
  };

  const toggleDraftSelection = (id: string) => {
    const next = new Set(selectedDraftIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedDraftIds(next);
  };

  const toggleAllDrafts = () => {
    if (draftAllSelected) {
      setSelectedDraftIds(new Set());
      return;
    }
    setSelectedDraftIds(new Set(selectableDraftRows.map((draft) => draft.id)));
  };

  const handlePublishDrafts = () => {
    if (!onPublishDrafts || selectedDraftIds.size === 0) return;
    onPublishDrafts(Array.from(selectedDraftIds), draftPublishGroupName.trim() || undefined);
    setSelectedDraftIds(new Set());
  };

  const handleDiscardDrafts = () => {
    if (!onDiscardDrafts || selectedDraftIds.size === 0) return;
    onDiscardDrafts(Array.from(selectedDraftIds));
    setSelectedDraftIds(new Set());
  };

  const shouldShowPublishedEmpty = contentFilter === '__published__' && testCases.length === 0;
  if (shouldShowPublishedEmpty) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Select value={contentFilter} onValueChange={(value) => setContentFilter(value as ContentFilter)}>
            <SelectTrigger className="!h-7 px-2 py-0 text-xs w-auto min-w-[132px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__published__" className="text-xs">Published</SelectItem>
              <SelectItem value="__drafts__" className="text-xs">
                Drafts ({draftRows.length})
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="rounded-lg border border-border/40 py-16 text-center">
          <Sparkles className="mx-auto h-10 w-10 text-muted-foreground/30 mb-4" />
          <p className="text-sm text-muted-foreground mb-4">
            No published test cases yet. Generate drafts with AI or create a test manually.
          </p>
          <Button size="sm" onClick={onCreateNew}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Create Test Case
          </Button>
        </div>
      </div>
    );
  }

  if (contentFilter === '__drafts__') {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Select value={contentFilter} onValueChange={(value) => setContentFilter(value as ContentFilter)}>
              <SelectTrigger className="!h-7 px-2 py-0 text-xs w-auto min-w-[132px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__published__" className="text-xs">Published</SelectItem>
                <SelectItem value="__drafts__" className="text-xs">
                  Drafts ({draftRows.length})
                </SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={toggleAllDrafts}>
              {draftAllSelected ? 'Select None' : 'Select All'}
            </Button>
            <span className="text-xs text-muted-foreground">
              {selectedDraftIds.size} of {selectableDraftRows.length} publishable selected
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Input
              value={draftPublishGroupName}
              onChange={(event) => setDraftPublishGroupName(event.target.value)}
              placeholder="Publish group (optional)"
              className="h-7 text-xs w-[180px]"
            />
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handlePublishDrafts}
              disabled={selectedDraftIds.size === 0 || isPublishingDrafts}
            >
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              Publish Selected
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={handleDiscardDrafts}
              disabled={selectedDraftIds.size === 0 || isPublishingDrafts}
            >
              <Trash className="mr-1.5 h-3.5 w-3.5" />
              Discard
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-border/40">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={draftAllSelected}
                    onCheckedChange={toggleAllDrafts}
                    aria-label="Select all draft tests"
                  />
                </TableHead>
                <TableHead className="max-w-0 w-full">Draft</TableHead>
                <TableHead className="w-[120px]">Account</TableHead>
                <TableHead className="w-[120px]">Group</TableHead>
                <TableHead className="w-[160px]">Duplicate Check</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {draftRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center whitespace-normal">
                    <p className="text-xs text-muted-foreground">
                      No draft test cases yet. Run AI generation to populate this list.
                    </p>
                  </TableCell>
                </TableRow>
              )}
              {draftRows.map((draft) => {
                const isSelectable = draft.status === 'draft';
                return (
                  <TableRow key={draft.id} className={cn(!isSelectable && 'opacity-70')}>
                    <TableCell>
                      <Checkbox
                        checked={selectedDraftIds.has(draft.id)}
                        disabled={!isSelectable}
                        onCheckedChange={() => toggleDraftSelection(draft.id)}
                        aria-label={`Select ${draft.title}`}
                      />
                    </TableCell>
                    <TableCell className="max-w-0 w-full whitespace-normal">
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{draft.title}</span>
                          <Badge
                            variant={draft.status === 'duplicate_skipped' ? 'secondary' : 'outline'}
                            className="text-[10px] px-1.5 py-0"
                          >
                            {draft.status === 'duplicate_skipped' ? 'Skipped' : 'Draft'}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground line-clamp-1">{draft.description}</div>
                        <div className="text-xs">
                          <span className="text-muted-foreground/60">Expected: </span>
                          <span className="text-[#30a46c]/80">{draft.expectedOutcome}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{resolveAccountCell(draft.userAccountId)}</TableCell>
                    <TableCell>
                      {draft.groupName ? (
                        <span className="text-sm">{draft.groupName}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {draft.duplicateReason ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 cursor-help">
                              {draft.status === 'duplicate_skipped' ? 'Duplicate skipped' : 'Possible overlap'}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[280px] text-xs">
                            {draft.duplicateReason}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-xs text-[#30a46c]">No conflict</span>
                      )}
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

  const exceedsLimit = selectedIds.size > parallelLimit;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Select value={contentFilter} onValueChange={(value) => setContentFilter(value as ContentFilter)}>
            <SelectTrigger className="!h-7 px-2 py-0 text-xs w-auto min-w-[132px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__published__" className="text-xs">Published</SelectItem>
              <SelectItem value="__drafts__" className="text-xs">
                Drafts ({draftRows.length})
              </SelectItem>
            </SelectContent>
          </Select>

          {groups.length > 0 && (
            <Select value={groupFilter} onValueChange={setGroupFilter}>
              <SelectTrigger className="!h-7 px-2 py-0 text-xs w-auto min-w-[120px]">
                <SelectValue placeholder="All groups" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__" className="text-xs">All groups</SelectItem>
                <SelectItem value="__ungrouped__" className="text-xs">Ungrouped</SelectItem>
                {groups.map((group) => (
                  <SelectItem key={group.id} value={group.id} className="text-xs">{group.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={selectAllPublished}>
            Select All
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={selectNonePublished}>
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
                    <Button variant="outline" size="sm" className="h-7 text-xs" disabled>
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

      <div className="rounded-lg border border-border/40">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={publishedAllSelected ? true : publishedSomeSelected ? 'indeterminate' : false}
                  onCheckedChange={toggleAllPublished}
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
            {filteredTestCases.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center whitespace-normal">
                  <p className="text-xs text-muted-foreground">No test cases match this filter.</p>
                </TableCell>
              </TableRow>
            )}
            {filteredTestCases.map((testCase) => {
              const lastResult = testCase.lastRunResult;
              const status = lastResult?.status || testCase.status;
              const group = testGroupMap.get(testCase.id);
              const isSelected = selectedIds.has(testCase.id);
              const createdByDisplay =
                testCase.createdByName?.trim().split(/\s+/)[0] ||
                fallbackCreatorName?.trim().split(/\s+/)[0] ||
                (testCase.createdByUserId ? 'User' : '—');

              return (
                <TableRow
                  key={testCase.id}
                  className={cn('cursor-pointer hover:bg-accent/30', isSelected && 'bg-primary/5')}
                  onClick={() => onSelect(testCase)}
                >
                  <TableCell onClick={(event) => event.stopPropagation()}>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => togglePublishedSelection(testCase.id)}
                      aria-label={`Select ${testCase.title}`}
                    />
                  </TableCell>

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

                  <TableCell>
                    <span
                      className="block max-w-[140px] truncate text-xs text-muted-foreground"
                      title={createdByDisplay === '—' ? undefined : createdByDisplay}
                    >
                      {createdByDisplay}
                    </span>
                  </TableCell>

                  <TableCell>{resolveAccountCell(testCase.userAccountId)}</TableCell>

                  <TableCell>
                    {group ? (
                      <span className="text-sm">{group.name}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  <TableCell>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {lastResult?.completedAt ? formatRelativeTime(lastResult.completedAt) : 'Never'}
                    </span>
                  </TableCell>

                  <TableCell>{getStatusBadge(status)}</TableCell>

                  <TableCell onClick={(event) => event.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
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
                        <DropdownMenuItem className="text-destructive" onClick={() => onDelete(testCase)}>
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
