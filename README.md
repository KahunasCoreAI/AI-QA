# AI QA Tester

A no-code QA testing dashboard that uses AI to generate test cases from plain English and executes them in real browsers. 

Write what you want to test in natural language, and the app spins up real browser sessions to verify your website works as expected — no selectors, no scripts, no Selenium.

## What It Does

1. **Create projects** — Point the dashboard at any website URL.
2. **Write tests in plain English** — Describe what to test ("log in with valid credentials and verify the dashboard loads") or paste requirements / user stories and let AI generate a full suite.
3. **Execute in real browsers** — Tests run in parallel via pluggable providers (Hyperbrowser Browser-Use, Hyperbrowser HyperAgent, or BrowserUse Cloud), each in its own browser session with optional proxy support.
4. **Get results with AI analysis** — Every pass/fail comes with a bullet-point summary explaining what happened and why.
5. **Generate bug reports** — One click turns a failed test into a structured bug report with severity, reproduction steps, and expected vs. actual behaviour.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Next.js 16](https://nextjs.org/) (App Router) |
| UI | [shadcn/ui](https://ui.shadcn.com/) + [Tailwind CSS 4](https://tailwindcss.com/) + [Radix](https://www.radix-ui.com/) |
| AI | [Vercel AI SDK](https://sdk.vercel.ai/) via [OpenRouter](https://openrouter.ai/) 
| Browser Execution | [Hyperbrowser SDK](https://docs.hyperbrowser.ai/) + [BrowserUse Cloud API](https://docs.cloud.browser-use.com/) |
| Auth | [Clerk](https://clerk.com/) (Google SSO, `@kahunas.io` domain-gated) |
| Data | [Neon Postgres](https://neon.tech/) + [Drizzle ORM](https://orm.drizzle.team/) |
| State | React Context + `useReducer`, synchronized with authenticated server state |
| Language | TypeScript, Zod for runtime validation |

## Architecture

```
app/
├── page.tsx                      # Main dashboard (projects → tests → execution → history)
├── layout.tsx                    # Root layout with QAProvider + theme (light/dark/system)
├── sign-in/                      # Clerk sign-in route
├── unauthorized/                 # Access denied route for non-kahunas.io users
├── api/
│   ├── state/route.ts            # Shared team state load/save API
│   ├── settings/provider-keys/   # Team-level encrypted provider key management
│   ├── execute-tests/route.ts    # SSE endpoint — runs tests via selected provider, streams results
│   ├── auth-session/route.ts     # Profile login/delete API for account sessions
│   ├── generate-tests/route.ts   # Bulk AI test generation from raw text / user stories
│   ├── generate-report/route.ts  # AI bug report generation for failed tests
│   └── parse-test/route.ts       # Parse plain-English test → structured steps
├── proxy.ts                      # Auth protection + domain gate
lib/
├── ai-client.ts                  # OpenRouter provider, test parsing, bug reports, result summaries
├── browser/providers/            # Browser provider adapters + registry
├── db/                           # Drizzle schema + Neon client
├── server/                       # Team context + shared state store
├── security/                     # Encryption + rate limiting utilities
├── qa-context.tsx                # Client state synced to /api/state
├── hooks.ts                      # useTestExecution (SSE consumer), useLocalStorage, utilities
└── utils.ts                      # ID generation, cn() helper
components/qa/                    # Dashboard components (project cards, test lists, execution grid, etc.)
components/ui/                    # shadcn/ui primitives
types/index.ts                    # All TypeScript interfaces and Zod schemas
```

### How Test Execution Works

1. The client calls `POST /api/execute-tests` with an array of test cases, the target URL, and a parallelism limit.
2. The server opens a **Server-Sent Events** stream and processes tests in batches.
3. For each test, the selected provider from Settings creates a browser session, executes the natural-language task, and emits normalized pass/fail/error verdicts.
4. After execution, an AI model generates a human-readable summary of each result.
5. The client updates the live execution grid in real time and synchronizes team state to the database via `/api/state`.

### Team Access Model

- Only authenticated users with `@kahunas.io` email addresses can access the app and APIs.
- Team state is shared across allowed users (projects, tests, accounts, runs, and settings).
- Browser provider API keys are stored server-side (encrypted at rest), not in localStorage.

## Getting Started

### Prerequisites

- Node.js 20+
- A [Clerk](https://clerk.com/) app with Google sign-in enabled
- A [Neon](https://neon.tech/) Postgres database
- An [OpenRouter](https://openrouter.ai/) API key (for AI features)

### Setup

```bash
# Clone the repo (if standalone)
git clone <repo-url>
cd ai-qa

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
```

Add your keys to `.env`:

```env
# Auth (Clerk)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

# Database (Neon Postgres)
DATABASE_URL=

# 32-byte base64 key used for encrypting provider API keys
# Example: openssl rand -base64 32
APP_ENCRYPTION_KEY=

# Optional provider fallbacks (used if team keys are not configured in Settings)
HYPERBROWSER_API_KEY=your_hyperbrowser_key
HYPERBROWSER_MODEL=gemini-2.5-flash
BROWSER_USE_API_KEY=your_browser_use_cloud_key
BROWSER_USE_CLOUD_MODEL=browser-use-llm

# AI
OPENROUTER_API_KEY=your_openrouter_key

# Optional — override the default AI model (defaults to openai/gpt-5.2)
# NEXT_PUBLIC_DEFAULT_AI_MODEL=openai/gpt-5.2
```

Apply database schema before first run:

```bash
npm run db:push
```

### Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Build

```bash
npm run build
npm start
```

### Deploy on Vercel

1. Create a Neon database and set `DATABASE_URL`.
2. Create a Clerk app, enable Google sign-in, and set:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
3. Add all environment variables from `.env.example` in the Vercel project settings.
4. Generate an encryption key (`openssl rand -base64 32`) and set `APP_ENCRYPTION_KEY`.
5. Run migrations against production DB:

```bash
npm run db:push
```

6. Deploy to Vercel. Access is restricted to authenticated `@kahunas.io` users.

## Usage

### Manual Test Creation

1. Create a project and enter your website URL.
2. Click **New Test** → **Manual Test**.
3. Write a title, a natural-language description of the steps, and the expected outcome.
4. Select the test and hit **Run**.

### AI Test Generation

1. Open a project and click **New Test** → **AI-Generated Tests**.
2. Paste feature requirements, user stories, or any descriptive text.
3. Review the generated tests, deselect any you don't need, and add them to the project.

### Execution & Results

- Tests execute in parallel (configurable in Settings, default: 3).
- Each running test shows a live browser stream URL (ephemeral while the session is active).
- After completion, links switch to a persistent recording/session URL when the provider exposes one.
- Results include pass/fail status, duration, AI-generated explanation, and extracted data.
- Failed tests can generate a structured bug report with one click.

### Accounts & Provider Sessions

- Manage test user credentials in the **Accounts** tab (up to 20 per project).
- The account list shows one row per user with provider session state columns for **Hyperbrowser** and **Browser Use**.
- Click a row (or `...` → **Edit**) to open the right-side sheet and run **Login / Re-login / Logout** per provider.
- Provider sessions are independent per account, so one account can be authenticated on one provider and logged out on the other.

### Settings

- **AI Model** — select from preset OpenRouter models (GPT-5.2, Claude Opus 4.6, Claude Sonnet 4.5, Gemini 3 Flash Preview) or enter any custom OpenRouter model ID. The chosen model is used for all AI features: test generation, result analysis, and bug reports.
- **Parallel limit** — how many browser sessions run concurrently (1–10).
- **Browser provider** — switch execution backend (`Hyperbrowser Browser-Use`, `Hyperbrowser HyperAgent`, `BrowserUse Cloud`).
- **Hyperbrowser model** — model used by Hyperbrowser Browser-Use and HyperAgent providers.
- **BrowserUse Cloud model** — model used only by BrowserUse Cloud tasks (default `browser-use-llm`). Aliases like `BROWSER_USE_1.0` are accepted and normalized automatically.
- **Provider API keys** — stored server-side (encrypted). Team members can update keys from Settings; env vars are fallback.
- **Browser profile** — standard or stealth mode.
- **Proxy** — enable/disable with country selection.

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/state` | GET / PUT | Load/save shared team state |
| `/api/settings/provider-keys` | GET / PUT | Read/update team-level encrypted provider keys |
| `/api/execute-tests` | POST | Execute tests via SSE stream |
| `/api/auth-session` | POST / DELETE | Create/login/delete provider browser profiles for account sessions |
| `/api/generate-tests` | POST | AI-generate test cases from raw text |
| `/api/generate-report` | POST | Generate a bug report from a failed test |
| `/api/parse-test` | POST | Parse plain-English description into structured steps |

## License

This project is licensed under the MIT License — see [LICENSE](./LICENSE) for details.
