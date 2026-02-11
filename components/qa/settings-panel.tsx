"use client";

import { useEffect, useState } from 'react';
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
import { useTheme } from 'next-themes';
import type { QASettings } from '@/types';

const PRESET_MODELS = [
  { value: 'openai/gpt-5.2', label: 'GPT-5.2' },
  { value: 'anthropic/claude-opus-4.6', label: 'Claude Opus 4.6' },
  { value: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5' },
  { value: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
] as const;

const BROWSER_PROVIDERS = [
  { value: 'hyperbrowser-browser-use', label: 'Hyperbrowser Browser-Use', requiresHyperbrowser: true },
  { value: 'hyperbrowser-hyperagent', label: 'Hyperbrowser HyperAgent', requiresHyperbrowser: true },
  { value: 'browser-use-cloud', label: 'BrowserUse Cloud', requiresHyperbrowser: false },
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
  const availableBrowserProviders = settings.hyperbrowserEnabled
    ? BROWSER_PROVIDERS
    : BROWSER_PROVIDERS.filter((provider) => !provider.requiresHyperbrowser);
  const resolvedBrowserProvider = settings.hyperbrowserEnabled
    ? settings.browserProvider
    : 'browser-use-cloud';
  const isPreset = PRESET_MODELS.some((m) => m.value === settings.aiModel);
  const [useCustomModel, setUseCustomModel] = useState(!isPreset);
  const [hyperbrowserApiKey, setHyperbrowserApiKey] = useState('');
  const [browserUseCloudApiKey, setBrowserUseCloudApiKey] = useState('');
  const [providerKeyStatus, setProviderKeyStatus] = useState({
    hyperbrowserConfigured: false,
    browserUseCloudConfigured: false,
  });
  const [isSavingProviderKeys, setIsSavingProviderKeys] = useState(false);
  const [providerKeyMessage, setProviderKeyMessage] = useState<string | null>(null);
  const { theme, setTheme, resolvedTheme } = useTheme();
  const themeValue = theme ?? 'system';
  const resolvedThemeValue = resolvedTheme;

  useEffect(() => {
    let isCancelled = false;

    const loadProviderKeyStatus = async () => {
      try {
        const response = await fetch('/api/settings/provider-keys');
        if (!response.ok) return;
        const result = await response.json();
        if (!isCancelled) {
          setProviderKeyStatus({
            hyperbrowserConfigured: Boolean(result.hyperbrowserConfigured),
            browserUseCloudConfigured: Boolean(result.browserUseCloudConfigured),
          });
        }
      } catch {
        // Best-effort status display only.
      }
    };

    void loadProviderKeyStatus();
    return () => {
      isCancelled = true;
    };
  }, []);

  const handleSaveProviderKeys = async () => {
    const trimmedHyperbrowser = hyperbrowserApiKey.trim();
    const trimmedBrowserUse = browserUseCloudApiKey.trim();

    if (!trimmedHyperbrowser && !trimmedBrowserUse) {
      setProviderKeyMessage('Enter at least one key before saving.');
      return;
    }

    setIsSavingProviderKeys(true);
    setProviderKeyMessage(null);
    try {
      const response = await fetch('/api/settings/provider-keys', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(trimmedHyperbrowser ? { hyperbrowser: trimmedHyperbrowser } : {}),
          ...(trimmedBrowserUse ? { browserUseCloud: trimmedBrowserUse } : {}),
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || `Failed to save keys (${response.status})`);
      }

      const result = await response.json();
      setProviderKeyStatus({
        hyperbrowserConfigured: Boolean(result.hyperbrowserConfigured),
        browserUseCloudConfigured: Boolean(result.browserUseCloudConfigured),
      });
      setHyperbrowserApiKey('');
      setBrowserUseCloudApiKey('');
      setProviderKeyMessage('Provider keys updated.');
    } catch (error) {
      setProviderKeyMessage(error instanceof Error ? error.message : 'Failed to save provider keys.');
    } finally {
      setIsSavingProviderKeys(false);
    }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Appearance */}
      <Card className="border-border/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold tracking-tight">Appearance</CardTitle>
          <CardDescription className="text-xs">
            Choose how the dashboard looks. System follows your OS appearance.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5" suppressHydrationWarning>
            <Label htmlFor="theme" className="text-xs font-medium">Theme</Label>
            <Select
              value={themeValue}
              onValueChange={(v) => setTheme(v)}
            >
              <SelectTrigger id="theme" className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">System</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground/60">
              {themeValue === 'system' && resolvedThemeValue
                ? `System currently: ${resolvedThemeValue}`
                : 'Saved per browser on this device.'}
            </p>
          </div>
        </CardContent>
      </Card>

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

      {/* Browser Provider */}
      <Card className="border-border/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold tracking-tight">Browser Provider</CardTitle>
          <CardDescription className="text-xs">
            Choose which browser automation backend runs tests and account login sessions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-md border border-border/40 bg-muted/20 px-3 py-2.5">
            <div className="space-y-0.5">
              <Label className="text-xs font-medium">Enable Hyperbrowser</Label>
              <p className="text-[11px] text-muted-foreground/70">
                Disable to hide Hyperbrowser login/status flows across accounts and tests.
              </p>
            </div>
            <Switch
              checked={settings.hyperbrowserEnabled}
              onCheckedChange={(enabled) =>
                onSettingsChange({
                  hyperbrowserEnabled: enabled,
                  ...(enabled ? {} : { browserProvider: 'browser-use-cloud' as const }),
                })
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="browserProvider" className="text-xs font-medium">Provider</Label>
            <Select
              value={resolvedBrowserProvider}
              onValueChange={(v) => onSettingsChange({ browserProvider: v as QASettings['browserProvider'] })}
            >
              <SelectTrigger id="browserProvider" className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableBrowserProviders.map((provider) => (
                  <SelectItem key={provider.value} value={provider.value}>
                    {provider.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {settings.hyperbrowserEnabled && (
            <div className="space-y-1.5">
              <Label htmlFor="hyperbrowserModel" className="text-xs font-medium">Hyperbrowser Model</Label>
              <Input
                id="hyperbrowserModel"
                type="text"
                value={settings.hyperbrowserModel}
                onChange={(e) => onSettingsChange({ hyperbrowserModel: e.target.value })}
                className="h-8 text-sm font-mono"
                placeholder="e.g. gemini-2.5-flash"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="browserUseCloudModel" className="text-xs font-medium">BrowserUse Cloud Model</Label>
            <Input
              id="browserUseCloudModel"
              type="text"
              value={settings.browserUseCloudModel}
              onChange={(e) => onSettingsChange({ browserUseCloudModel: e.target.value })}
              className="h-8 text-sm font-mono"
              placeholder="e.g. browser-use-llm or browser-use-2.0"
            />
            <p className="text-[11px] text-muted-foreground/60">
              Each provider uses its own model field; `BROWSER_USE_1.0` is accepted and normalized automatically.
            </p>
          </div>

          {settings.hyperbrowserEnabled && (
            <div className="space-y-1.5">
              <Label htmlFor="hyperbrowserApiKey" className="text-xs font-medium">Hyperbrowser API Key</Label>
              <Input
                id="hyperbrowserApiKey"
                type="password"
                value={hyperbrowserApiKey}
                onChange={(e) => setHyperbrowserApiKey(e.target.value)}
                className="h-8 text-sm font-mono"
                placeholder={providerKeyStatus.hyperbrowserConfigured ? 'Configured (enter to replace)' : 'hb_...'}
              />
              <p className="text-[11px] text-muted-foreground/60">
                {providerKeyStatus.hyperbrowserConfigured ? 'Key configured.' : 'No key configured yet.'}
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="browserUseCloudApiKey" className="text-xs font-medium">BrowserUse Cloud API Key</Label>
            <Input
              id="browserUseCloudApiKey"
              type="password"
              value={browserUseCloudApiKey}
              onChange={(e) => setBrowserUseCloudApiKey(e.target.value)}
              className="h-8 text-sm font-mono"
              placeholder={providerKeyStatus.browserUseCloudConfigured ? 'Configured (enter to replace)' : 'bu_...'}
            />
            <p className="text-[11px] text-muted-foreground/60">
              {providerKeyStatus.browserUseCloudConfigured ? 'Key configured.' : 'No key configured yet.'}
            </p>
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground/60">
              Provider keys are stored server-side. Leave an input blank to keep its current value.
            </p>
            <Button
              type="button"
              size="sm"
              className="h-8 text-xs"
              onClick={handleSaveProviderKeys}
              disabled={isSavingProviderKeys}
            >
              {isSavingProviderKeys ? 'Saving…' : 'Save Keys'}
            </Button>
          </div>
          {providerKeyMessage && (
            <p className="text-[11px] text-muted-foreground/80">{providerKeyMessage}</p>
          )}
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
