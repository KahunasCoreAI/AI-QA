"use client";

import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, CheckCircle2, AlertCircle, Activity } from 'lucide-react';
import type { AiGenerationJob, QASettings, UserAccount } from '@/types';

interface AITestGeneratorProps {
  projectId: string;
  websiteUrl: string;
  aiModel: string;
  settings: QASettings;
  userAccounts: UserAccount[];
  activeJob: AiGenerationJob | null;
  onJobQueued: () => void;
}

export function AITestGenerator({
  projectId,
  websiteUrl,
  aiModel,
  settings,
  userAccounts,
  activeJob,
  onJobQueued,
}: AITestGeneratorProps) {
  const [rawText, setRawText] = useState('');
  const [groupName, setGroupName] = useState('');
  const [userAccountId, setUserAccountId] = useState<string>('none');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const activeStatus = useMemo(() => {
    if (!activeJob) return null;
    if (activeJob.status === 'queued' || activeJob.status === 'running') {
      return activeJob.progressMessage || 'AI is exploring your app to determine test cases. You can close this screen.';
    }
    if (activeJob.status === 'completed') {
      return `Exploration finished. ${activeJob.draftCount} draft test case${activeJob.draftCount === 1 ? '' : 's'} ready.`;
    }
    if (activeJob.status === 'failed') {
      return activeJob.error || 'AI exploration failed.';
    }
    return null;
  }, [activeJob]);

  const handleGenerate = async () => {
    if (!rawText.trim()) return;

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch('/api/generate-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          rawText: rawText.trim(),
          websiteUrl,
          aiModel,
          groupName: groupName.trim() || undefined,
          userAccountId,
          settings,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to queue AI exploration.');
      }

      setSuccessMessage(data?.message || 'AI is exploring your app to determine test cases. You can close this screen.');
      onJobQueued();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to queue AI exploration.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-border/40">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Test Generator
          </CardTitle>
          <CardDescription className="text-xs">
            Describe a flow and AI will log in, explore the product, and generate draft test cases for review.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ai-input" className="text-xs font-medium">Exploration Request</Label>
            <Textarea
              id="ai-input"
              placeholder={`Example: As a coach I can create nutrition plans. Explore this flow and determine all tests needed.`}
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
              rows={8}
              className="resize-none font-mono text-xs leading-relaxed"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="group-name" className="text-xs font-medium">Group (optional)</Label>
              <Input
                id="group-name"
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                placeholder="e.g. nutrition"
                className="h-8 text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Uses existing group if it matches, otherwise creates it on publish.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="user-account" className="text-xs font-medium">Account</Label>
              <Select value={userAccountId} onValueChange={setUserAccountId}>
                <SelectTrigger className="h-8 text-sm w-full">
                  <SelectValue placeholder="No account (unauthenticated)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No account (unauthenticated)</SelectItem>
                  <SelectItem value="__any__">Any available account</SelectItem>
                  {userAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.label} ({account.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={handleGenerate}
              disabled={!rawText.trim() || isSubmitting}
              size="sm"
              className="h-8 text-xs"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Queuing...
                </>
              ) : (
                <>
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  Generate Test Cases
                </>
              )}
            </Button>

            {successMessage && (
              <span className="inline-flex items-center text-xs text-[#30a46c]">
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                {successMessage}
              </span>
            )}

            {error && (
              <span className="inline-flex items-center text-xs text-[#e5484d]">
                <AlertCircle className="mr-1 h-3.5 w-3.5" />
                {error}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {activeJob && activeStatus && (
        <Card className="border-border/40">
          <CardContent className="py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Exploration Job</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
                    {activeJob.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{activeStatus}</p>
              </div>
              {(activeJob.status === 'queued' || activeJob.status === 'running') && (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
