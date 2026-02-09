"use client";

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import type { TestCase } from '@/types';

interface TestCaseEditorProps {
  testCase?: Partial<TestCase>;
  websiteUrl: string;
  onSave: (testCase: Pick<TestCase, 'title' | 'description' | 'expectedOutcome' | 'status'>) => void;
  onCancel: () => void;
}

export function TestCaseEditor({
  testCase,
  websiteUrl,
  onSave,
  onCancel,
}: TestCaseEditorProps) {
  const [title, setTitle] = useState(testCase?.title || '');
  const [description, setDescription] = useState(testCase?.description || '');
  const [expectedOutcome, setExpectedOutcome] = useState(testCase?.expectedOutcome || '');

  const handleSave = () => {
    if (!title.trim() || !description.trim()) return;

    onSave({
      title,
      description,
      expectedOutcome,
      status: 'pending',
    });
  };

  return (
    <div className="space-y-4">
      <Card className="border-border/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold tracking-tight">{testCase?.id ? 'Edit Test Case' : 'Create Test Case'}</CardTitle>
          <CardDescription className="text-xs">
            Describe your test in plain English. The AI will execute these steps on {websiteUrl}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title" className="text-xs font-medium">Title</Label>
            <Input
              id="title"
              placeholder="e.g., Login with valid credentials"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description" className="text-xs font-medium">Test Description</Label>
            <Textarea
              id="description"
              placeholder={`Describe what this test should do. For example:\n\n1. Navigate to the login page\n2. Enter username 'test@example.com' and password 'password123'\n3. Click the login button\n4. Verify the dashboard appears with the user's name`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={8}
              className="resize-none font-mono text-xs leading-relaxed"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="expected" className="text-xs font-medium">Expected Outcome</Label>
            <Input
              id="expected"
              placeholder="e.g., User is logged in and sees their dashboard"
              value={expectedOutcome}
              onChange={(e) => setExpectedOutcome(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          className="h-8 text-xs"
          onClick={handleSave}
          disabled={!title.trim() || !description.trim()}
        >
          Save Test Case
        </Button>
      </div>
    </div>
  );
}
