import type { QASettings } from '@/types';

export type BrowserExecutionStatus = 'completed' | 'failed' | 'error';

export interface ProviderCallbacks {
  onLiveUrl?: (liveUrl: string, recordingUrl?: string) => void | Promise<void>;
}

export interface ProviderCredentials {
  email: string;
  password: string;
  metadata?: Record<string, string>;
  profileId?: string;
}

export interface BrowserExecutionInput {
  url: string;
  task: string;
  expectedOutcome?: string;
  settings: Partial<QASettings>;
  credentials?: ProviderCredentials;
  maxSteps?: number;
}

export interface BrowserExecutionVerdict {
  success: boolean;
  reason: string;
  extractedData?: Record<string, unknown>;
}

export interface BrowserExecutionResult {
  status: BrowserExecutionStatus;
  verdict: BrowserExecutionVerdict | null;
  liveUrl?: string;
  recordingUrl?: string;
  error?: string;
  rawProviderData?: unknown;
}

export interface AuthSessionInput {
  email: string;
  password: string;
  websiteUrl: string;
  existingProfileId?: string;
  settings: Partial<QASettings>;
}

export interface AuthSessionResult {
  success: boolean;
  profileId?: string;
  error?: string;
}

export interface BrowserProvider {
  id: QASettings['browserProvider'];
  executeTest: (input: BrowserExecutionInput, callbacks?: ProviderCallbacks) => Promise<BrowserExecutionResult>;
  loginWithProfile: (input: AuthSessionInput) => Promise<AuthSessionResult>;
  deleteProfile: (profileId: string, settings: Partial<QASettings>) => Promise<void>;
}
