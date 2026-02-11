import type { BrowserProvider } from './types';
import type { QASettings } from '@/types';
import { hyperbrowserBrowserUseProvider } from './hyperbrowser-browser-use';
import { hyperbrowserHyperAgentProvider } from './hyperbrowser-hyperagent';
import { browserUseCloudProvider } from './browser-use-cloud';

export const DEFAULT_BROWSER_PROVIDER: QASettings['browserProvider'] = 'hyperbrowser-browser-use';

const providers: Record<QASettings['browserProvider'], BrowserProvider> = {
  'hyperbrowser-browser-use': hyperbrowserBrowserUseProvider,
  'hyperbrowser-hyperagent': hyperbrowserHyperAgentProvider,
  'browser-use-cloud': browserUseCloudProvider,
};

export function getBrowserProvider(providerId?: QASettings['browserProvider']): BrowserProvider {
  const resolvedProvider = providerId || DEFAULT_BROWSER_PROVIDER;
  return providers[resolvedProvider] || providers[DEFAULT_BROWSER_PROVIDER];
}
