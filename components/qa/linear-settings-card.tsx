"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Link2, RefreshCw, Unplug } from 'lucide-react';

interface LinearTeam {
  id: string;
  name: string;
  key?: string;
}

interface LinearSettingsStatus {
  configured: boolean;
  defaultTeamId?: string;
  defaultTeamName?: string;
}

export function LinearSettingsCard() {
  const [linearApiKey, setLinearApiKey] = useState('');
  const [configured, setConfigured] = useState(false);
  const [defaultTeamId, setDefaultTeamId] = useState<string>('');
  const [defaultTeamName, setDefaultTeamName] = useState<string>('');
  const [teams, setTeams] = useState<LinearTeam[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingTeams, setIsLoadingTeams] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selectedTeam = useMemo(
    () => teams.find((team) => team.id === defaultTeamId),
    [teams, defaultTeamId]
  );

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      const response = await fetch('/api/settings/linear');
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || `Failed to load Linear settings (${response.status})`);
      }

      const payload = (await response.json()) as LinearSettingsStatus;
      setConfigured(Boolean(payload.configured));
      setDefaultTeamId(payload.defaultTeamId || '');
      setDefaultTeamName(payload.defaultTeamName || '');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load Linear settings.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadTeams = useCallback(async (apiKeyOverride?: string) => {
    setIsLoadingTeams(true);
    setMessage(null);

    try {
      const trimmedApiKey = apiKeyOverride?.trim() || '';
      const response = await fetch('/api/settings/linear/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trimmedApiKey ? { apiKey: trimmedApiKey } : {}),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || `Failed to load teams (${response.status})`);
      }

      const payload = (await response.json()) as {
        teams: LinearTeam[];
      };

      setTeams(payload.teams || []);
      setMessage(payload.teams?.length ? 'Teams loaded.' : 'No teams found for this Linear account.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load teams.');
    } finally {
      setIsLoadingTeams(false);
    }
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setMessage(null);

    try {
      const trimmedApiKey = linearApiKey.trim();
      const nextTeamId = defaultTeamId.trim();

      if (!nextTeamId) {
        throw new Error('Select a default Linear team before saving.');
      }

      if (!configured && !trimmedApiKey) {
        throw new Error('Enter your Linear API key before saving.');
      }

      const teamName =
        teams.find((team) => team.id === nextTeamId)?.name || defaultTeamName || 'Unknown Team';

      const response = await fetch('/api/settings/linear', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(trimmedApiKey ? { apiKey: trimmedApiKey } : {}),
          defaultTeamId: nextTeamId,
          defaultTeamName: teamName,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || `Failed to save Linear settings (${response.status})`);
      }

      const payload = (await response.json()) as LinearSettingsStatus;
      setConfigured(Boolean(payload.configured));
      setDefaultTeamId(payload.defaultTeamId || nextTeamId);
      setDefaultTeamName(payload.defaultTeamName || teamName);
      setLinearApiKey('');
      setMessage('Linear settings saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to save Linear settings.');
    } finally {
      setIsSaving(false);
    }
  }, [configured, defaultTeamId, defaultTeamName, linearApiKey, teams]);

  const handleDisconnect = useCallback(async () => {
    setIsDisconnecting(true);
    setMessage(null);

    try {
      const response = await fetch('/api/settings/linear', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: null,
          defaultTeamId: null,
          defaultTeamName: null,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || `Failed to disconnect Linear (${response.status})`);
      }

      setConfigured(false);
      setLinearApiKey('');
      setDefaultTeamId('');
      setDefaultTeamName('');
      setTeams([]);
      setMessage('Linear integration disconnected.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to disconnect Linear.');
    } finally {
      setIsDisconnecting(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (!isLoading && configured) {
      void loadTeams();
    }
  }, [configured, isLoading, loadTeams]);

  return (
    <Card className="border-border/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold tracking-tight flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          Linear Integration
        </CardTitle>
        <CardDescription className="text-xs">
          Add your personal Linear API key and default team for one-click bug creation from failed tests.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="linearApiKey" className="text-xs font-medium">Linear API Key</Label>
          <Input
            id="linearApiKey"
            type="password"
            value={linearApiKey}
            onChange={(e) => setLinearApiKey(e.target.value)}
            className="h-8 text-sm font-mono"
            placeholder={configured ? 'Configured (enter to replace)' : 'lin_api_...'}
            disabled={isLoading || isSaving || isDisconnecting}
          />
          <p className="text-[11px] text-muted-foreground/60">
            {configured ? 'Key configured for your account.' : 'No key configured yet.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => void loadTeams(linearApiKey)}
            disabled={isLoading || isLoadingTeams || isSaving || isDisconnecting || (!configured && !linearApiKey.trim())}
          >
            <RefreshCw className="mr-1.5 h-3 w-3" />
            {isLoadingTeams ? 'Loading Teams…' : 'Load Teams'}
          </Button>
          {configured && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs text-destructive hover:text-destructive"
              onClick={() => void handleDisconnect()}
              disabled={isLoading || isDisconnecting || isSaving}
            >
              <Unplug className="mr-1.5 h-3 w-3" />
              {isDisconnecting ? 'Disconnecting…' : 'Disconnect'}
            </Button>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="linearTeam" className="text-xs font-medium">Default Team</Label>
          <Select
            value={defaultTeamId || undefined}
            onValueChange={(value) => {
              setDefaultTeamId(value);
              const team = teams.find((entry) => entry.id === value);
              setDefaultTeamName(team?.name || defaultTeamName);
            }}
            disabled={isLoading || isSaving || isDisconnecting || teams.length === 0}
          >
            <SelectTrigger id="linearTeam" className="h-8 text-sm">
              <SelectValue placeholder={teams.length === 0 ? 'Load teams first' : 'Choose team'} />
            </SelectTrigger>
            <SelectContent>
              {teams.map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  {team.key ? `${team.key} · ` : ''}{team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {defaultTeamName && !selectedTeam && (
            <p className="text-[11px] text-muted-foreground/60">
              Current saved team: {defaultTeamName}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground/60">
            Linear credentials are encrypted server-side and scoped to your user.
          </p>
          <Button
            type="button"
            size="sm"
            className="h-8 text-xs"
            onClick={() => void handleSave()}
            disabled={isLoading || isSaving || isDisconnecting}
          >
            {isSaving ? 'Saving…' : 'Save Linear Settings'}
          </Button>
        </div>

        {message && (
          <p className="text-[11px] text-muted-foreground/80">{message}</p>
        )}
      </CardContent>
    </Card>
  );
}
