import { NextResponse } from 'next/server';
import { AccessError } from './team-context';
import { RateLimitError } from '@/lib/security/rate-limit';

export function handleRouteError(error: unknown, fallbackMessage: string) {
  if (error instanceof AccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof RateLimitError) {
    return NextResponse.json({ error: error.message }, { status: 429 });
  }

  const message = error instanceof Error ? error.message : fallbackMessage;
  return NextResponse.json({ error: message }, { status: 500 });
}

