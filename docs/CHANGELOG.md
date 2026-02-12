# Changelog

All notable changes to this project are documented in this file.

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
