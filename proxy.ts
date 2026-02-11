import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const ALLOWED_EMAIL_DOMAIN = 'kahunas.io';
const isPublicRoute = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)', '/unauthorized']);

function extractEmailFromClaims(claims: Record<string, unknown> | null | undefined): string | null {
  if (!claims) return null;
  const directEmail = claims.email;
  if (typeof directEmail === 'string' && directEmail.length > 0) {
    return directEmail;
  }

  const primaryEmail = claims.primary_email_address;
  if (typeof primaryEmail === 'string' && primaryEmail.length > 0) {
    return primaryEmail;
  }

  return null;
}

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;

  const authState = await auth();
  if (!authState.userId) {
    return authState.redirectToSignIn({ returnBackUrl: req.url });
  }

  const email = extractEmailFromClaims(authState.sessionClaims as Record<string, unknown> | null | undefined);
  if (!email) return;

  const normalized = email.toLowerCase();
  if (normalized.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) return;

  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: `Access restricted to ${ALLOWED_EMAIL_DOMAIN} users.` },
      { status: 403 }
    );
  }

  return NextResponse.redirect(new URL('/unauthorized', req.url));
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};

