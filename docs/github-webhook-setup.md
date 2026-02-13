# GitHub Webhook Integration Guide

This guide explains how to set up the GitHub webhook integration that automatically creates draft test cases when pull requests are merged.

## Overview

When you merge a pull request in GitHub, the webhook will:
1. Receive the merge event from GitHub
2. Analyze the changed files using AI
3. Generate draft test cases for the new features/bug fixes
4. Save them to your project as drafts organized by domain

This helps ensure that every merge has test coverage to prevent future regressions.

## Prerequisites

- A Next.js application with the QA Testing Dashboard deployed
- A GitHub repository
- Access to your deployment's environment variables

## Step 1: Configure Environment Variables

Add the following environment variables to your deployment:

```bash
# Required: Secret token for verifying webhook requests
GITHUB_WEBHOOK_SECRET=your_secure_random_string

# Optional but recommended: GitHub Personal Access Token for fetching PR details
# Create one at: https://github.com/settings/tokens
# Required scopes: repo (for private repos) or public_repo (for public repos)
GITHUB_TOKEN=ghp_your_token_here
```

### Generating a Webhook Secret

Generate a secure random string for your webhook secret:

```bash
# Using openssl
openssl rand -hex 32

# Using python
python3 -c "import secrets; print(secrets.token_hex(32))"
```

## Step 2: Set Up the GitHub Webhook

1. Go to your GitHub repository
2. Navigate to **Settings** → **Webhooks** → **Add webhook**
3. Configure the following:

| Setting | Value |
|---------|-------|
| **Payload URL** | `https://your-domain.com/api/webhooks/github` |
| **Content type** | `application/json` |
| **Secret** | Enter the `GITHUB_WEBHOOK_SECRET` you generated |
| **Which events?** | Select "Let me select individual events" |
| **Pull requests** | ✅ Check this (required) |
| **Ping events** | ✅ Check this (optional, for testing) |

4. Click **Add webhook**

## Step 3: Verify the Setup

### Test with Ping Event

After creating the webhook, GitHub will send a `ping` event. You can verify the webhook is working by:

1. Check the webhook delivery logs in GitHub (Settings → Webhooks → Recent Deliveries)
2. Look for a successful `200` response

### Test with a Pull Request

1. Create a test branch with a small change
2. Open a pull request and merge it
3. Check your QA Dashboard for new draft tests

## Step 4: View Generated Draft Tests

After a PR is merged:

1. Open your QA Testing Dashboard
2. Navigate to the project associated with your repository
3. Look for the **Drafts** section
4. You should see new test drafts with:
   - Titles based on the PR changes
   - Descriptions explaining what was tested
   - Group names (domains) like "auth", "settings", "checkout", etc.

## How It Works

### Webhook Flow

```
GitHub PR Merge
    ↓
Webhook POST to /api/webhooks/github
    ↓
Verify HMAC-SHA256 signature
    ↓
Parse pull_request event (only merged PRs)
    ↓
Fetch changed files via GitHub API
    ↓
AI analyzes changes → generates test suggestions
    ↓
Create draft tests with domain grouping
    ↓
Save to team state
```

### AI Test Generation

The AI analyzes:
- Changed files (focusing on frontend: `.tsx`, `.jsx`, `.ts`, `.js`, `.css`)
- File paths to detect domains (auth, checkout, settings, etc.)
- PR title and description

Then generates 3-5 test cases covering:
- Happy path workflows
- Edge cases and validation
- Error states
- Cross-component integration

## Troubleshooting

### Webhook Not Receiving Events

1. **Check the webhook URL** - Ensure it's publicly accessible
2. **Verify the secret** - Must match exactly in GitHub and your env vars
3. **Check recent deliveries** - GitHub shows delivery status and response

### No Draft Tests Created

1. **Verify GITHUB_TOKEN** - Required for fetching PR files
2. **Check logs** - Look for errors in your deployment logs
3. **Confirm merged PR** - Only closed + merged PRs trigger generation
4. **Check frontend files** - Only frontend file changes generate tests

### Duplicate Drafts

The webhook uses the `X-GitHub-Delivery` header for idempotency. If you see duplicates, check:
1. GitHub webhook retry settings
2. Manual redelivery attempts

## Configuration Options

### Shared Team ID

By default, webhook drafts are saved to the team with ID `team-default`. To change this:

```bash
SHARED_TEAM_ID=your_team_id
```

### AI Model

The webhook uses `openai/gpt-5.2` by default. To change:

```bash
NEXT_PUBLIC_DEFAULT_AI_MODEL=anthropic/claude-3-opus
```

### Domain Keywords

The system detects these domains from file paths:
- auth, login, signup, register
- dashboard, settings, profile
- billing, payment, checkout, cart
- user, admin, home, landing
- pricing, contact, about
- navigation, menu, sidebar
- header, footer, modal, form
- input, button, link, table
- list, search, filter, sort
- pagination, upload, download

## Security Considerations

1. **Webhook Secret**: Keep it secure and rotate periodically
2. **Token Scope**: Use minimal required scopes for your GitHub token
3. **Rate Limiting**: Consider implementing rate limiting for webhook endpoints
4. **Idempotency**: The system tracks delivery IDs to prevent duplicate processing
