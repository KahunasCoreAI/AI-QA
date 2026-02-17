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

  // Log full error server-side but only return the safe fallback to clients
  console.error(`[route-error] ${fallbackMessage}:`, error);
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

