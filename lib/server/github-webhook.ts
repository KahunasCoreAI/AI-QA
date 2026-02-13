import crypto from 'crypto';

/**
 * Verify GitHub webhook signature using HMAC SHA-256
 * Per GitHub docs: https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
 */
export function verifyGitHubSignature(
  payload: string,
  signatureHeader: string | null,
  secret: string | undefined
): boolean {
  if (!secret) {
    console.error('GITHUB_WEBHOOK_SECRET is not configured');
    return false;
  }

  if (!signatureHeader) {
    console.error('No signature header provided');
    return false;
  }

  try {
    const signature = signatureHeader.replace(/^sha256=/, '');
    const hmac = crypto.createHmac('sha256', secret);
    const digest = hmac.update(payload).digest('hex');

    // Use timing-safe comparison to prevent timing attacks
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

/**
 * Create a signature for testing purposes
 */
export function createGitHubSignature(payload: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = hmac.update(payload).digest('hex');
  return `sha256=${digest}`;
}

/**
 * Extract event type from GitHub webhook headers
 */
export function getGitHubEvent(request: Request): string | null {
  return request.headers.get('x-github-event');
}

/**
 * Extract delivery ID from GitHub webhook headers
 */
export function getGitHubDelivery(request: Request): string | null {
  return request.headers.get('x-github-delivery');
}

/**
 * Check if the webhook is a ping event
 */
export function isPingEvent(event: string | null): boolean {
  return event === 'ping';
}

/**
 * Check if the webhook is a pull_request event
 */
export function isPullRequestEvent(event: string | null): boolean {
  return event === 'pull_request';
}
