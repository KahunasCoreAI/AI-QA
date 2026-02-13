"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Zap } from 'lucide-react';
import type { AutomationSettings, Project } from '@/types';

interface AutomationSettingsCardProps {
  settings: AutomationSettings;
  projects: Project[];
  onSettingsChange: (settings: Partial<AutomationSettings>) => void;
}

export function AutomationSettingsCard({
  settings,
  projects,
  onSettingsChange,
}: AutomationSettingsCardProps) {
  return (
    <Card className="border-border/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold tracking-tight flex items-center gap-2">
          <Zap className="h-4 w-4" />
          Automations
        </CardTitle>
        <CardDescription className="text-xs">
          Automatically run tests when GitHub pull requests are merged.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Enable/Disable toggle */}
        <div className="flex items-center justify-between rounded-md border border-border/40 bg-muted/20 px-3 py-2.5">
          <div className="space-y-0.5">
            <Label className="text-xs font-medium">Enable Automations</Label>
            <p className="text-[11px] text-muted-foreground/70">
              When enabled, merged PRs will trigger automated test runs.
            </p>
          </div>
          <Switch
            checked={settings.enabled}
            onCheckedChange={(enabled) => onSettingsChange({ enabled })}
          />
        </div>

        {settings.enabled && (
          <>
            {/* Target Project */}
            <div className="space-y-1.5">
              <Label htmlFor="targetProject" className="text-xs font-medium">Target Project</Label>
              <Select
                value={settings.targetProjectId || '_auto'}
                onValueChange={(v) => onSettingsChange({ targetProjectId: v === '_auto' ? null : v })}
              >
                <SelectTrigger id="targetProject" className="h-8 text-sm">
                  <SelectValue placeholder="Auto-detect" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_auto">Auto-detect (most recent)</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground/60">
                Which project to create tests in and run automations against.
              </p>
            </div>

            {/* Test Count */}
            <div className="space-y-1.5">
              <Label htmlFor="testCount" className="text-xs font-medium">Test Count</Label>
              <Input
                id="testCount"
                type="number"
                min={1}
                max={20}
                value={settings.testCount}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) {
                    onSettingsChange({ testCount: Math.max(1, Math.min(20, val)) });
                  }
                }}
                className="h-8 text-sm w-24"
              />
              <p className="text-[11px] text-muted-foreground/60">
                Total tests to run per automation (1-20). Includes newly generated and selected existing tests.
              </p>
            </div>

            {/* Allowed GitHub Usernames */}
            <div className="space-y-1.5">
              <Label htmlFor="allowedUsernames" className="text-xs font-medium">Allowed GitHub Usernames</Label>
              <Input
                id="allowedUsernames"
                type="text"
                value={settings.allowedGitHubUsernames.join(', ')}
                onChange={(e) => {
                  const usernames = e.target.value
                    .split(',')
                    .map((u) => u.trim())
                    .filter(Boolean);
                  onSettingsChange({ allowedGitHubUsernames: usernames });
                }}
                className="h-8 text-sm"
                placeholder="Leave empty for all users"
              />
              <p className="text-[11px] text-muted-foreground/60">
                Comma-separated. Only PRs from these authors will trigger automation. Leave empty to allow all.
              </p>
            </div>

            {/* Branch Patterns */}
            <div className="space-y-1.5">
              <Label htmlFor="branchPatterns" className="text-xs font-medium">Base Branch Patterns</Label>
              <Input
                id="branchPatterns"
                type="text"
                value={settings.branchPatterns.join(', ')}
                onChange={(e) => {
                  const patterns = e.target.value
                    .split(',')
                    .map((p) => p.trim())
                    .filter(Boolean);
                  onSettingsChange({ branchPatterns: patterns });
                }}
                className="h-8 text-sm"
                placeholder="e.g. main, develop, release/*"
              />
              <p className="text-[11px] text-muted-foreground/60">
                Comma-separated. Only PRs merged into matching branches trigger automation. Supports * wildcards. Leave empty for all branches.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
