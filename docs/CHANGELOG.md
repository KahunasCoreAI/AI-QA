# Changelog

All notable changes to this project are documented in this file.

## 2026-02-13

### Added
- **Automated test runs triggered by GitHub PR merges**:
  - Full automation pipeline: PR merged → AI generates tests → AI selects regression tests → tests run headlessly → results recorded.
  - New **Automations** tab in the sidebar to view all automation runs with status, results, and PR links.
  - Automation detail view showing PR metadata, test results (reusing `TestResultsTable`), and AI selection reasoning.
  - Automation settings in **Settings** tab: enable/disable toggle, target project, test count (1-20), allowed GitHub usernames filter, and base branch pattern filter (supports `*` wildcards).
  - `POST /api/automations/rerun` endpoint to re-execute a previous automation run.
- **AI test selection agent** with structured prompt:
  - Selects existing tests based on 4 prioritized criteria: directly affected, regression risk, previously failing, coverage breadth.
  - Receives changed files and components as context from the webhook's file analysis.
  - Returns a human-readable reason explaining its selection, displayed in the automation detail view.
- **Shared execution module** (`lib/server/execute-tests.ts`):
  - Extracted core test execution logic (account scheduling, parallel limits, round-robin) from the SSE route into a reusable module.
  - Used by both the interactive SSE endpoint and headless automation/rerun flows.

### Changed
- GitHub webhook (`/api/webhooks/github`) now uses Next.js `after()` API for background processing:
  - Returns `202 Accepted` immediately after signature verification.
  - Processes PR, generates drafts, and optionally runs the full automation pipeline in the background.
  - `maxDuration` increased from 60s to 300s to support full test execution cycles.
- `app/api/execute-tests/route.ts` refactored to delegate to shared `executeTestBatch()` module, keeping only SSE plumbing and auth inline.

### Types
- Added `AutomationRun`, `AutomationRunStatus`, `AutomationSettings` types.
- Extended `QAState` with `automationRuns` (per-project) and `automationSettings`.
- Added 4 new reducer actions: `CREATE_AUTOMATION_RUN`, `UPDATE_AUTOMATION_RUN`, `DELETE_AUTOMATION_RUN`, `UPDATE_AUTOMATION_SETTINGS`.

### New Files
| File | Purpose |
|------|---------|
| `lib/server/execute-tests.ts` | Shared execution orchestrator with `executeTestBatch()` |
| `app/api/automations/rerun/route.ts` | Rerun automation endpoint |
| `components/qa/automations-panel.tsx` | Automation runs table view |
| `components/qa/automation-detail.tsx` | Single automation run detail view |
| `components/qa/automation-settings-card.tsx` | Settings card for automation configuration |

## 2026-02-12

### Added
- Asynchronous AI exploration workflow for test generation:
  - `POST /api/generate-tests` now queues a fire-and-forget exploration job and returns immediately.
  - `GET /api/generate-tests?projectId=...` returns AI job status and draft test data.
- Draft lifecycle endpoints:
  - `POST /api/generate-tests/publish` publishes selected draft tests into project test cases.
  - `POST /api/generate-tests/discard` discards selected draft tests.
- Draft-aware UI and state:
  - New AI job + draft state persisted in shared team state.
  - Test Cases supports a `Drafts` filter with checklist selection.
  - Draft actions for publish/discard with optional group assignment.
  - Red-dot navigation indicator for unseen drafts.
  - Execution tab now displays AI exploration jobs and progress.

### Changed
- AI Test Generator now supports:
  - Fire-and-forget generation UX with immediate success response.
  - Account selection (`none`, `any`, specific account) for exploration context.
  - Optional group targeting input for publish-time grouping.
- AI generation now performs balanced duplicate detection against existing project tests and active drafts, marking exact/high-confidence duplicates as skipped.

### Notes
- Documentation was updated in `README.md` to reflect async generation, draft review flow, and new API routes.
