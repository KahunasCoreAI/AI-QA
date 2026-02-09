# AI QA Tester

A no-code QA testing dashboard that uses AI to generate test cases from plain English and executes them in real browsers. 

Write what you want to test in natural language, and the app spins up real browser sessions to verify your website works as expected — no selectors, no scripts, no Selenium.

## What It Does

1. **Create projects** — Point the dashboard at any website URL.
2. **Write tests in plain English** — Describe what to test ("log in with valid credentials and verify the dashboard loads") or paste requirements / user stories and let AI generate a full suite.
3. **Execute in real browsers** — Tests run in parallel via Hyperbrowser's HyperAgent, each in its own stealth-capable browser session with optional proxy support.
4. **Get results with AI analysis** — Every pass/fail comes with a bullet-point summary explaining what happened and why.
5. **Generate bug reports** — One click turns a failed test into a structured bug report with severity, reproduction steps, and expected vs. actual behaviour.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Next.js 16](https://nextjs.org/) (App Router) |
| UI | [shadcn/ui](https://ui.shadcn.com/) + [Tailwind CSS 4](https://tailwindcss.com/) + [Radix](https://www.radix-ui.com/) |
| AI | [Vercel AI SDK](https://sdk.vercel.ai/) via [OpenRouter](https://openrouter.ai/) 
| Browser Execution | [Hyperbrowser SDK](https://docs.mino.ai/) (HyperAgent) |
| State | React Context + `useReducer`, persisted to `localStorage` |
| Language | TypeScript, Zod for runtime validation |

## Architecture

```
app/
├── page.tsx                      # Main dashboard (projects → tests → execution → history)
├── layout.tsx                    # Root layout with QAProvider + dark theme
├── api/
│   ├── execute-tests/route.ts    # SSE endpoint — runs tests via Hyperbrowser, streams results
│   ├── generate-tests/route.ts   # Bulk AI test generation from raw text / user stories
│   ├── generate-report/route.ts  # AI bug report generation for failed tests
│   └── parse-test/route.ts       # Parse plain-English test → structured steps
lib/
├── ai-client.ts                  # OpenRouter provider, test parsing, bug reports, result summaries
├── hyperbrowser-client.ts        # Hyperbrowser SDK wrapper — session management, goal building
├── qa-context.tsx                # Global state (projects, test cases, runs, settings)
├── hooks.ts                      # useTestExecution (SSE consumer), useLocalStorage, utilities
└── utils.ts                      # ID generation, cn() helper
components/qa/                    # Dashboard components (project cards, test lists, execution grid, etc.)
components/ui/                    # shadcn/ui primitives
types/index.ts                    # All TypeScript interfaces and Zod schemas
```

### How Test Execution Works

1. The client calls `POST /api/execute-tests` with an array of test cases, the target URL, and a parallelism limit.
2. The server opens a **Server-Sent Events** stream and processes tests in batches.
3. For each test, a Hyperbrowser session is created → the HyperAgent navigates the site and carries out the natural-language instructions → results are streamed back as SSE events (`test_start`, `streaming_url`, `step_progress`, `test_complete`, `test_error`).
4. After execution, an AI model generates a human-readable summary of each result.
5. The client updates the live execution grid in real time and persists final results to `localStorage`.

## Getting Started

### Prerequisites

- Node.js 20+
- A [Hyperbrowser](https://www.hyperbrowser.ai/) API key (for browser execution)
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
HYPERBROWSER_API_KEY=your_hyperbrowser_key
OPENROUTER_API_KEY=your_openrouter_key

# Optional — override the default AI model (defaults to openai/gpt-5.2)
# NEXT_PUBLIC_DEFAULT_AI_MODEL=openai/gpt-5.2
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
- Each running test shows a live browser stream URL.
- Results include pass/fail status, duration, AI-generated explanation, and extracted data.
- Failed tests can generate a structured bug report with one click.

### Settings

- **AI Model** — select from popular OpenRouter models (GPT-4o, Claude Sonnet 4, Gemini 2.5 Flash, etc.) or enter any custom OpenRouter model ID. The chosen model is used for all AI features: test generation, result analysis, and bug reports.
- **Parallel limit** — how many browser sessions run concurrently (1–10).
- **Browser profile** — standard or stealth mode.
- **Proxy** — enable/disable with country selection.

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/execute-tests` | POST | Execute tests via SSE stream |
| `/api/generate-tests` | POST | AI-generate test cases from raw text |
| `/api/generate-report` | POST | Generate a bug report from a failed test |
| `/api/parse-test` | POST | Parse plain-English description into structured steps |

## License

This project is licensed under the MIT License — see [LICENSE](./LICENSE) for details.
