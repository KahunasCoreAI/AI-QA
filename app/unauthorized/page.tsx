import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';

const ALLOWED_EMAIL_DOMAIN = (
  process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN ||
  process.env.ALLOWED_EMAIL_DOMAIN ||
  'example.com'
)
  .trim()
  .toLowerCase();

export default function UnauthorizedPage() {
  const hasClerk = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg border border-border/50 bg-card/60 p-6 space-y-4">
        <h1 className="text-lg font-semibold">Access Restricted</h1>
        <p className="text-sm text-muted-foreground">
          This workspace is only available to users with a <code>@{ALLOWED_EMAIL_DOMAIN}</code> email.
        </p>
        {hasClerk && (
          <div className="flex items-center gap-3">
            <SignedOut>
              <SignInButton mode="modal">
                <Button>Sign In</Button>
              </SignInButton>
            </SignedOut>
            <SignedIn>
              <UserButton afterSignOutUrl="/sign-in" />
            </SignedIn>
          </div>
        )}
      </div>
    </main>
  );
}
