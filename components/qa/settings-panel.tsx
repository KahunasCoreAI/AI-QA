"use client";

import { useState } from 'react';
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
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Trash2 } from 'lucide-react';
import type { QASettings } from '@/types';

const PRESET_MODELS = [
  { value: 'openai/gpt-5.2', label: 'GPT-5.2' },
  { value: 'anthropic/claude-opus-4.6', label: 'Claude Opus 4.6' },
  { value: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5' },
  { value: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
] as const;

interface SettingsPanelProps {
  settings: QASettings;
  onSettingsChange: (settings: Partial<QASettings>) => void;
  onClearData: () => void;
}

export function SettingsPanel({
  settings,
  onSettingsChange,
  onClearData,
}: SettingsPanelProps) {
  const isPreset = PRESET_MODELS.some((m) => m.value === settings.aiModel);
  const [useCustomModel, setUseCustomModel] = useState(!isPreset);

  return (
    <div className="space-y-4 max-w-2xl">
      {/* AI Model Settings */}
      <Card className="border-border/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold tracking-tight">AI Model</CardTitle>
          <CardDescription className="text-xs">
            Choose the model used for test generation, result analysis, and bug reports.
            All models are accessed via{' '}
            <a href="https://openrouter.ai/models" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground transition-colors">
              OpenRouter
            </a>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!useCustomModel ? (
            <div className="space-y-1.5">
              <Label htmlFor="aiModel" className="text-xs font-medium">Model</Label>
              <Select
                value={settings.aiModel}
                onValueChange={(v) => {
                  if (v === '_custom') {
                    setUseCustomModel(true);
                  } else {
                    onSettingsChange({ aiModel: v });
                  }
                }}
              >
                <SelectTrigger id="aiModel" className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRESET_MODELS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                      <span className="ml-1.5 text-muted-foreground">{m.value}</span>
                    </SelectItem>
                  ))}
                  <SelectItem value="_custom">Custom model…</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="customModel" className="text-xs font-medium">Custom Model ID</Label>
              <div className="flex gap-2">
                <Input
                  id="customModel"
                  type="text"
                  placeholder="e.g. openai/gpt-4o"
                  value={settings.aiModel}
                  onChange={(e) => onSettingsChange({ aiModel: e.target.value })}
                  className="h-8 text-sm font-mono"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs shrink-0"
                  onClick={() => {
                    // If current value matches a preset, switch back to dropdown
                    const match = PRESET_MODELS.find((m) => m.value === settings.aiModel);
                    if (!match && settings.aiModel) {
                      // Keep the custom value, just switch view
                    }
                    setUseCustomModel(false);
                    // Reset to first preset if current isn't a preset
                    if (!PRESET_MODELS.some((m) => m.value === settings.aiModel)) {
                      onSettingsChange({ aiModel: PRESET_MODELS[0].value });
                    }
                  }}
                >
                  Presets
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground/60">
                Enter any{' '}
                <a href="https://openrouter.ai/models" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground transition-colors">
                  OpenRouter model ID
                </a>
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Execution Settings */}
      <Card className="border-border/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold tracking-tight">Execution Settings</CardTitle>
          <CardDescription className="text-xs">
            Configure how tests are executed
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="parallelLimit" className="text-xs font-medium">Parallel Test Limit</Label>
              <Select
                value={settings.parallelLimit.toString()}
                onValueChange={(v) => onSettingsChange({ parallelLimit: parseInt(v) })}
              >
                <SelectTrigger id="parallelLimit" className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 (Sequential)</SelectItem>
                  <SelectItem value="2">2</SelectItem>
                  <SelectItem value="3">3</SelectItem>
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="10">10</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground/60">
                Number of tests to run simultaneously
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="timeout" className="text-xs font-medium">Default Timeout (seconds)</Label>
              <Input
                id="timeout"
                type="number"
                min="10"
                max="300"
                value={settings.defaultTimeout / 1000}
                onChange={(e) => onSettingsChange({ defaultTimeout: parseInt(e.target.value) * 1000 })}
                className="h-8 text-sm"
              />
              <p className="text-[11px] text-muted-foreground/60">
                Maximum time for each test
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Browser Settings */}
      <Card className="border-border/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold tracking-tight">Browser Settings</CardTitle>
          <CardDescription className="text-xs">
            Configure browser behavior for test execution
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="browserProfile" className="text-xs font-medium">Browser Profile</Label>
            <Select
              value={settings.browserProfile}
              onValueChange={(v) => onSettingsChange({ browserProfile: v as 'standard' | 'stealth' })}
            >
              <SelectTrigger id="browserProfile" className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard (Fast)</SelectItem>
                <SelectItem value="stealth">Stealth (Anti-detection)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground/60">
              Use &quot;Stealth&quot; for sites with bot protection (Cloudflare, CAPTCHAs)
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-xs font-medium">Enable Proxy</Label>
              <p className="text-[11px] text-muted-foreground/60">
                Route requests through a proxy server
              </p>
            </div>
            <Switch
              checked={settings.proxyEnabled}
              onCheckedChange={(v) => onSettingsChange({ proxyEnabled: v })}
            />
          </div>

          {settings.proxyEnabled && (
            <div className="space-y-1.5">
              <Label htmlFor="proxyCountry" className="text-xs font-medium">Proxy Country</Label>
              <Select
                value={settings.proxyCountry || 'US'}
                onValueChange={(v) => onSettingsChange({ proxyCountry: v as QASettings['proxyCountry'] })}
              >
                <SelectTrigger id="proxyCountry" className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="US">United States</SelectItem>
                  <SelectItem value="GB">United Kingdom</SelectItem>
                  <SelectItem value="CA">Canada</SelectItem>
                  <SelectItem value="DE">Germany</SelectItem>
                  <SelectItem value="FR">France</SelectItem>
                  <SelectItem value="JP">Japan</SelectItem>
                  <SelectItem value="AU">Australia</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Data Management */}
      <Card className="border-[#e5484d]/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold tracking-tight text-[#e5484d]">Danger Zone</CardTitle>
          <CardDescription className="text-xs">
            Irreversible actions that affect your data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive" className="mb-3 border-[#e5484d]/15 bg-[#e5484d]/5">
            <AlertTriangle className="h-3.5 w-3.5" />
            <AlertTitle className="text-xs font-medium">Warning</AlertTitle>
            <AlertDescription className="text-[11px]">
              This will permanently delete all projects, test cases, and test results.
              This action cannot be undone.
            </AlertDescription>
          </Alert>

          <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={onClearData}>
            <Trash2 className="mr-1.5 h-3 w-3" />
            Clear All Data
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
