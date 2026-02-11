"use client";

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, FolderPlus } from 'lucide-react';
import type { TestCase } from '@/types';

interface CreateGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedTests: TestCase[];
  parallelLimit: number;
  onCreateGroup: (name: string, testCaseIds: string[]) => void;
  /** Tests that already belong to another group (will be moved) */
  alreadyGroupedTests?: { test: TestCase; groupName: string }[];
}

export function CreateGroupDialog({
  open,
  onOpenChange,
  selectedTests,
  parallelLimit,
  onCreateGroup,
  alreadyGroupedTests = [],
}: CreateGroupDialogProps) {
  const [name, setName] = useState('');

  const exceedsLimit = selectedTests.length > parallelLimit;
  const canCreate = name.trim().length > 0 && !exceedsLimit && selectedTests.length > 0;

  const handleCreate = () => {
    if (!canCreate) return;
    onCreateGroup(name.trim(), selectedTests.map((t) => t.id));
    setName('');
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setName('');
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <FolderPlus className="h-4 w-4" />
            Save as Test Group
          </DialogTitle>
          <DialogDescription className="text-xs">
            Name this selection of tests to run them together as a batch.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Group name input */}
          <div className="space-y-2">
            <Label htmlFor="group-name" className="text-xs font-medium">
              Group Name
            </Label>
            <Input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Checkout Flow, Login Tests"
              className="h-8 text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canCreate) {
                  handleCreate();
                }
              }}
            />
          </div>

          {/* Test count */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {selectedTests.length} of {parallelLimit} tests (max parallel limit)
            </span>
            {exceedsLimit && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                <AlertTriangle className="mr-1 h-3 w-3" />
                Exceeds limit
              </Badge>
            )}
          </div>

          {/* Selected tests list */}
          <div className="max-h-48 overflow-y-auto rounded-md border border-border/40 divide-y divide-border/30">
            {selectedTests.map((test) => {
              const alreadyGrouped = alreadyGroupedTests.find((ag) => ag.test.id === test.id);
              return (
                <div key={test.id} className="px-3 py-2 text-xs">
                  <div className="font-medium truncate">{test.title}</div>
                  {alreadyGrouped && (
                    <div className="text-amber-500 mt-0.5 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Will be moved from &quot;{alreadyGrouped.groupName}&quot;
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {alreadyGroupedTests.length > 0 && (
            <p className="text-[11px] text-amber-500/80">
              {alreadyGroupedTests.length} test{alreadyGroupedTests.length !== 1 ? 's' : ''} will be moved from existing groups.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" className="h-8 text-xs" onClick={handleCreate} disabled={!canCreate}>
            <FolderPlus className="mr-1.5 h-3.5 w-3.5" />
            Create Group
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
