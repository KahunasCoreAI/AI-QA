# Next Tasks

> Planning document for upcoming features and fixes. No code changes — reference only.

---

## Task 1: User Accounts Per Project

### Summary

Add per-project user accounts (up to 20) so that parallel agent sessions each use a distinct login. Only 1 user account may be assigned to a test at a time, and no two concurrently running tests may share the same user account.

### Requirements

| # | Requirement |
|---|---|
| 1 | A project can have 0–20 user accounts |
| 2 | Each user account stores: `id`, `label` (friendly name), `email`, `password`, and optional `metadata` (key-value, e.g. role, plan tier) |
| 3 | A test case can be assigned **at most 1** user account (optional — unassigned tests use no auth) |
| 4 | At execution time, the scheduler must guarantee **no two concurrently running tests share the same user account** |
| 5 | If all eligible accounts are busy, the test must wait (queued) until one frees up |
| 6 | The UI should show which account each test will use and which accounts are currently "in use" during a run |
| 7 | Credentials must never be logged to the browser console or included in SSE events sent to the client |

### Proposed Data Model

```ts
// New type
interface UserAccount {
  id: string;
  projectId: string;
  label: string;          // e.g. "Admin User", "Free Tier User"
  email: string;
  password: string;       // stored in local state only (localStorage) — NOT sent in SSE events
  metadata?: Record<string, string>; // optional extra context e.g. { role: "admin" }
  createdAt: number;
  providerProfiles?: UserAccountProviderProfiles; // added in Task 2 for provider-scoped auth sessions
}

// Extend TestCase
interface TestCase {
  // ... existing fields ...
  userAccountId?: string; // FK to UserAccount.id — null = no auth
}

// Extend QAState
interface QAState {
  // ... existing fields ...
  userAccounts: Record<string, UserAccount[]>; // keyed by projectId
}
```

### Execution Scheduling Logic

The current parallel execution in `app/api/execute-tests/route.ts` batches tests by `parallelLimit`. The new constraint adds **account locking**:

```
available_accounts = set(project.userAccounts)
running_accounts  = set()   # accounts currently in use

for each batch:
  for each test in pending_queue:
    if test.userAccountId is None:
      → run immediately (no account needed)
    elif test.userAccountId in available_accounts and test.userAccountId not in running_accounts:
      → claim account, run test
      → on complete: release account
    else:
      → defer to next batch cycle
```

Key: The scheduler must respect **both** `parallelLimit` (max concurrent sessions) **and** account uniqueness (no two concurrent tests on the same account).

### UI Touchpoints

- **Accounts tab**: one table row per account, CRUD for accounts (add/edit/delete), max 20 enforced in UI
- **Account sheet**: row click or `...` → **Edit** opens a right-side sheet for account edits and provider login actions
- **Test Case editor**: Optional dropdown to assign a user account
- **Test Case list**: Small avatar/badge showing assigned account label
- **Execution grid**: During a run, show which account each running test is using

### Files Likely Affected

| File | Change |
|------|--------|
| `types/index.ts` | `UserAccount` interface, extend `TestCase`, extend `QAState`, new actions |
| `lib/qa-context.tsx` | Reducer cases for CRUD, account assignment, state backfill |
| `app/api/execute-tests/route.ts` | Account-aware scheduling, pass credentials to agent |
| `lib/browser/providers/*.ts` | Accept account credentials, inject credentials/profile into provider-specific execution tasks |
| `components/qa/user-accounts-manager.tsx` | **New** — CRUD UI for managing accounts |
| `components/qa/test-case-list.tsx` | Show assigned account badge |
| `components/qa/test-case-editor.tsx` | Account assignment dropdown |
| `components/qa/test-execution-grid.tsx` | Show active account badge during execution |

---

## Task 2: Persistent Login Sessions via Provider Profiles

### Summary

Use provider-scoped profiles to persist browser login state so that user accounts do not need to re-authenticate on every test run. Each account stores session state independently for Hyperbrowser and BrowserUse Cloud.

### How Provider Profiles Work

Both providers support persistent profile IDs. Profile IDs are provider-scoped and must be stored per provider key on the user account.

**Key patterns:**

```ts
// Hyperbrowser: create/reuse profile, login with persistChanges=true, then stop session
// BrowserUse Cloud: create/reuse profile, login task against profile, then cleanup session
// Test execution: pass stored provider profile with persistChanges=false / provider equivalent
```

**Important notes:**
- Profile IDs must not be shared across providers.
- Login state is tracked separately for each provider (`hyperbrowser`, `browserUseCloud`).
- Re-login and logout are executed per provider from the account sheet.

### Requirements

| # | Requirement |
|---|---|
| 1 | Each user account can store per-provider profiles (`hyperbrowser`, `browserUseCloud`) |
| 2 | Login/Re-login/Logout controls live in the account sheet, per provider |
| 3 | While logging in, show per-provider `authenticating` status |
| 4 | On success, persist provider profile fields: `profileId`, `status`, `lastAuthenticatedAt` |
| 5 | On failure, preserve previous provider profile when possible and set status to `expired` or `none` |
| 6 | During execution, resolve profile ID from the selected provider and attach it to provider session creation |

### Proposed Flow

```
User opens account row → right-side sheet → provider section (Hyperbrowser / Browser Use)
  → Click Login or Re-login
  → POST /api/auth-session with provider-specific settings
    → Provider creates/reuses profile + runs login task with account credentials
    → Provider returns profileId on success
  → UI updates account.providerProfiles[providerKey] with status + timestamp
```

### Data Model Changes

```ts
interface UserAccountProviderProfile {
  profileId?: string;
  status: 'none' | 'authenticating' | 'authenticated' | 'expired';
  lastAuthenticatedAt?: number;
}

interface UserAccount {
  // ... existing fields from Task 1 ...
  providerProfiles?: {
    hyperbrowser?: UserAccountProviderProfile;
    browserUseCloud?: UserAccountProviderProfile;
  };
}
```

### Execution Integration

In provider adapters (`lib/browser/providers/*`), test execution resolves the selected provider profile:

```ts
const profileId = input.credentials?.profileId; // provider-scoped profile
// pass profileId into provider session creation (read-only for execution)
```

### Files Likely Affected

| File | Change |
|------|--------|
| `types/index.ts` | Added `UserAccountProviderProfiles` and provider-scoped profile state |
| `lib/browser/providers/hyperbrowser-browser-use.ts` | Profile-aware login/execution for Hyperbrowser Browser-Use |
| `lib/browser/providers/hyperbrowser-hyperagent.ts` | Profile-aware login/execution for Hyperbrowser HyperAgent |
| `lib/browser/providers/browser-use-cloud.ts` | Profile-aware login/execution for BrowserUse Cloud |
| `app/api/auth-session/route.ts` | **New** — endpoint to create profile + login session |
| `app/page.tsx` | Resolve provider key/column and pass provider-scoped profile IDs |
| `app/api/execute-tests/route.ts` | Pass selected-provider profile ID in account credentials |
| `components/qa/user-accounts-manager.tsx` | Login/re-login/clear buttons, status badges, spinner |
| `lib/qa-context.tsx` | Actions for updating profile status on accounts |

### Edge Cases

- **Expired sessions**: if a login-backed test fails, mark provider state as expired and allow re-login for that provider only
- **Provider mismatch**: stale IDs from one provider must not be sent to another provider
- **Parallel safety**: execution uses read-only profile sessions where provider supports it

---

## ~~Task 3: Fix Broken Session Playback Links (Bug)~~ ✅ COMPLETED

> **Resolved** — smoke tested and confirmed working.

### What Was Wrong

The `liveUrl` from `client.sessions.create()` is an ephemeral real-time view token that expires when `client.sessions.stop()` is called. We were storing it as `streamingUrl` on `TestResult` and using it for both the live iframe AND the post-run "View Browser Recording" link — resulting in 404s after test completion.

### What Was Done

| File | Change |
|------|--------|
| `types/index.ts` | Added `recordingUrl?: string` to `TestResult` (persistent URL, valid after session ends) |
| `lib/browser/providers/hyperbrowser-*.ts` | Enabled recording-capable sessions and use `session.sessionUrl` as persistent `recordingUrl`; keep `liveUrl` for active preview |
| `lib/browser/providers/browser-use-cloud.ts` | Resolve persistent recording link via session public-share URL, then fallback to task output file URLs |
| `app/api/execute-tests/route.ts` | Threads provider `recordingUrl` into `TestResult` |
| `components/qa/test-case-detail.tsx` | "View Browser Recording" link now uses `recordingUrl` (falls back to `streamingUrl`) |
| `components/qa/test-execution-grid.tsx` | Link uses `recordingUrl` when available; falls back to `streamingUrl` only while running |
| `components/qa/test-results-table.tsx` | Result actions use `recordingUrl` after completion and avoid stale `streamingUrl` links |

### How It Works Now

- **During execution**: `liveUrl` powers the real-time iframe preview
- **After completion**: `recordingUrl` is used for playback links across providers
- **Fallback behavior**: if no recording URL is returned, UI keeps live-link behavior only for active runs

---

## Task 4: Test Fragments (Composable Sub-Tests for Parallel Execution)

### Summary

Break long end-to-end tests into reusable **fragments** (sub-tests) that can be composed and run in parallel. Each fragment has its own start URL, so it can jump directly to the relevant page instead of navigating through the full app flow.

### Motivation

A 20-minute end-to-end test like "Create nutrition plan → Add meal → Add food → Verify totals" can be split into:

| Fragment | Start URL | Depends On |
|----------|-----------|------------|
| Create nutrition plan | `/plans` | None |
| Add meal to existing plan | `/plans/{planId}/meals` | Plan exists (precondition) |
| Add food to meal | `/plans/{planId}/meals/{mealId}` | Plan + meal exist |
| Verify nutrition totals | `/plans/{planId}/summary` | All above |

Fragments 1, 2, and 3 could potentially run in parallel (if preconditions are met or seeded), dramatically reducing total test time.

### Requirements

| # | Requirement |
|---|---|
| 1 | A **fragment** is a lightweight test unit with: title, description, expected outcome, **start URL** (absolute or relative to project URL), and optional **preconditions** (text description of what must be true before this fragment runs) |
| 2 | Fragments belong to a project, independent of test cases |
| 3 | A **test case** can be composed from 1+ fragments in a defined order, OR remain a standalone description (backward compatible) |
| 4 | Fragments can be shared across multiple test cases within the same project |
| 5 | When executing a fragment-based test, the agent navigates to the fragment's `startUrl` directly instead of the project's `websiteUrl` |
| 6 | Fragments can be tagged/categorized (e.g. "setup", "action", "verification") for organization |
| 7 | UI to create, edit, delete, and reorder fragments within a test case |
| 8 | Support "generate fragments" from an existing long test description (AI-powered decomposition) |

### Proposed Data Model

```ts
type FragmentCategory = 'setup' | 'action' | 'verification' | 'teardown';

interface TestFragment {
  id: string;
  projectId: string;
  title: string;
  description: string;         // what this fragment does
  startUrl: string;            // absolute URL or path relative to project websiteUrl
  expectedOutcome: string;
  preconditions?: string;      // human-readable: "A nutrition plan must already exist"
  category?: FragmentCategory;
  createdAt: number;
}

// Extend TestCase to optionally reference fragments
interface TestCase {
  // ... existing fields ...
  mode: 'standalone' | 'composed';  // backward compat: existing tests are 'standalone'
  fragmentIds?: string[];            // ordered list of fragment IDs (only for 'composed' mode)
}

// Extend QAState
interface QAState {
  // ... existing fields ...
  testFragments: Record<string, TestFragment[]>; // keyed by projectId
}
```

### Execution Behavior

**Standalone test** (current behavior): Agent navigates to `project.websiteUrl` and follows the test description.

**Composed test**: For each fragment in order:
1. Agent navigates to `fragment.startUrl` (resolved against `project.websiteUrl` if relative)
2. Agent executes the fragment's description
3. Result is recorded per-fragment
4. If any fragment fails, subsequent fragments in that test are skipped (unless marked independent)

**Parallel fragment execution** (advanced): When multiple composed tests share setup fragments, the scheduler can:
- Run setup fragments once
- Fan out independent action fragments in parallel
- Converge for verification fragments

This is a future optimization — initial implementation should execute fragments sequentially within a test case, with parallelism handled at the test-case level (via groups from the existing Task Groups feature).

### UI Touchpoints

- **Fragments Library** (new view within project): List all fragments, create/edit/delete, filter by category
- **Test Case Editor**: Toggle between "Standalone" and "Composed" mode; in composed mode, drag-and-drop fragment picker
- **Fragment Creator**: Form with title, start URL, description, expected outcome, category, preconditions
- **AI Decomposer**: "Break into fragments" button on a standalone test that sends the description to AI and gets back suggested fragments
- **Execution View**: When running a composed test, show fragment-level progress (which fragment is currently executing)

### AI Decomposition Prompt (for "generate fragments")

```
Given this end-to-end test description:
"{test.description}"

For the website at: {project.websiteUrl}

Break this into independent, reusable test fragments. Each fragment should:
1. Have a clear, single responsibility
2. Include a specific start URL (page where the fragment begins)
3. Be potentially reusable in other test compositions
4. Include preconditions (what must be true before this fragment can run)

Return as JSON array:
[{
  "title": "...",
  "description": "...",
  "startUrl": "...",
  "expectedOutcome": "...",
  "preconditions": "...",
  "category": "setup" | "action" | "verification" | "teardown"
}]
```

### Files Likely Affected

| File | Change |
|------|--------|
| `types/index.ts` | `TestFragment` interface, `FragmentCategory` type, extend `TestCase` with `mode` + `fragmentIds`, extend `QAState` |
| `lib/qa-context.tsx` | Reducer cases for fragment CRUD, state backfill, cascading delete |
| `lib/browser/providers/*.ts` | Accept `startUrl` override per-fragment |
| `app/api/execute-tests/route.ts` | Fragment-aware execution: resolve start URLs, execute in sequence, report per-fragment |
| `app/api/generate-fragments/route.ts` | **New** — AI endpoint to decompose a test into fragments |
| `lib/ai-client.ts` | Add `decomposeTestIntoFragments()` function |
| `components/qa/fragments-library.tsx` | **New** — Fragment list/CRUD view |
| `components/qa/fragment-editor.tsx` | **New** — Create/edit fragment form |
| `components/qa/test-case-editor.tsx` | Mode toggle, fragment picker with drag-and-drop |
| `components/qa/test-execution-grid.tsx` | Show per-fragment progress for composed tests |

### Relationship to Existing Features

- **Test Groups** (already implemented): Groups control which tests run in parallel. Fragments control how a single test is decomposed.
- **User Accounts** (Task 1): Each fragment within a composed test uses the same user account as its parent test case.
- **Profiles** (Task 2): The profile is attached at session level — fragments within the same test share the session/profile.

---

## ~~Task 5: Automated Test Runs on PR Merge~~ ✅ COMPLETED

> **Resolved** — Full automation pipeline implemented and verified.

### What Was Done

End-to-end automation: when a GitHub PR is merged, tests are generated, an AI agent selects relevant existing tests for regression coverage, and the full suite runs headlessly with results recorded.

| File | Change |
|------|--------|
| `types/index.ts` | Added `AutomationRun`, `AutomationRunStatus`, `AutomationSettings`; extended `QAState` and `QAAction` |
| `lib/server/default-state.ts` | Added automation defaults and sanitization |
| `lib/qa-context.tsx` | 4 new reducer cases, context helpers, init/cleanup for automation state |
| `components/qa/dashboard-layout.tsx` | Added Automations tab to sidebar navigation |
| `lib/server/execute-tests.ts` | **New** — Shared `executeTestBatch()` extracted from SSE route |
| `app/api/execute-tests/route.ts` | Refactored to delegate to shared execution module |
| `app/api/webhooks/github/route.ts` | Added `after()` background processing, AI test selection agent, full automation flow |
| `app/api/automations/rerun/route.ts` | **New** — Rerun endpoint with background execution |
| `components/qa/automations-panel.tsx` | **New** — Table view of automation runs |
| `components/qa/automation-detail.tsx` | **New** — Detail view with PR info, selection reasoning, and test results |
| `components/qa/automation-settings-card.tsx` | **New** — Settings card for automation configuration |
| `components/qa/index.ts` | Added 3 new barrel exports |
| `app/page.tsx` | Wired automations tab, settings, state, and handlers |

### Key Design Decisions

- **Next.js `after()` API** used for background processing — webhook returns 202 immediately, tests execute after response
- **Shared execution module** (`executeTestBatch`) reused by both SSE interactive runs and headless automation
- **AI test selection** uses a structured prompt with 4 prioritized criteria (directly affected, regression risk, previously failing, coverage breadth)
- **Selection reasoning** stored on `AutomationRun.selectionReason` and displayed in the detail view
- **Filters** support allowed GitHub usernames and base branch patterns with `*` wildcard matching

---

## Implementation Order

Recommended sequence based on dependencies:

```
Task 3 (Bug Fix)          ✅ DONE
  ↓
Task 1 (User Accounts)    ✅ DONE
  ↓
Task 2 (Login Profiles)   ✅ DONE
  ↓
Task 5 (Automations)      ✅ DONE
  ↓
Task 4 (Fragments)        ← Independent but most complex; benefits from 1+2 being stable
```

### Estimated Scope

| Task | Status | New Files | Modified Files | Complexity |
|------|--------|-----------|----------------|------------|
| Task 3 — Session playback fix | ✅ Done | 0 | 5 | Low |
| Task 1 — User accounts | ✅ Done | 1 | 7 | Medium |
| Task 2 — Login profiles | ✅ Done | 1 | 6 | Medium |
| Task 5 — Automated test runs | ✅ Done | 5 | 8 | High |
| Task 4 — Test fragments | Pending | 4 | 6 | High |
