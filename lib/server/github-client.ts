/**
 * GitHub API client for fetching pull request data
 */

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

export interface PRFile {
  filename: string;
  status: 'added' | 'removed' | 'modified' | 'renamed';
  additions: number;
  deletions: number;
  changes: number;
  patch: string | null;
  raw_url: string;
  contents_url: string;
}

export interface PRFilesResponse {
  files: PRFile[];
  totalCount: number;
}

export interface PullRequest {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  merged: boolean | null;
  merged_at: string | null;
  diff_url: string;
  html_url: string;
  base: {
    repo: {
      id: number;
      name: string;
      full_name: string;
      html_url: string;
      description: string | null;
      owner: {
        login: string;
        id: number;
      };
    };
    ref: string;
    sha: string;
  };
  head: {
    ref: string;
    sha: string;
    repo: {
      id: number;
      name: string;
      full_name: string;
      html_url: string;
      description: string | null;
    } | null;
  };
  user: {
    login: string;
    id: number;
  };
  merged_by: {
    login: string;
    id: number;
  } | null;
}

export interface Repository {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  owner: {
    login: string;
    id: number;
  };
}

/**
 * Fetch files changed in a pull request
 */
export async function fetchPRFiles(
  owner: string,
  repo: string,
  pullNumber: number,
  options?: { perPage?: number }
): Promise<PRFilesResponse> {
  if (!GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN is not configured');
  }

  const perPage = options?.perPage || 100;
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/files?per_page=${perPage}`,
    {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'QA-Testing-Dashboard',
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API error: ${response.status} ${errorText}`);
  }

  const files = await response.json();
  const linkHeader = response.headers.get('Link');
  let totalCount = files.length;

  // Handle pagination if there are more files
  if (linkHeader) {
    const match = linkHeader.match(/per_page=\d+>&page=(\d+)>; rel="last"/);
    if (match) {
      totalCount = parseInt(match[1], 10) * files.length;
    }
  }

  return { files, totalCount };
}

/**
 * Fetch a single pull request details
 */
export async function fetchPullRequest(
  owner: string,
  repo: string,
  pullNumber: number
): Promise<PullRequest> {
  if (!GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN is not configured');
  }

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}`,
    {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'QA-Testing-Dashboard',
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API error: ${response.status} ${errorText}`);
  }

  return response.json();
}

/**
 * Fetch repository details
 */
export async function fetchRepository(
  owner: string,
  repo: string
): Promise<Repository> {
  if (!GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN is not configured');
  }

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}`,
    {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'QA-Testing-Dashboard',
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API error: ${response.status} ${errorText}`);
  }

  return response.json();
}

/**
 * Fetch file content from a repository (for additional context)
 */
export async function fetchFileContent(
  owner: string,
  repo: string,
  path: string,
  ref?: string
): Promise<string> {
  if (!GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN is not configured');
  }

  const refParam = ref ? `?ref=${ref}` : '';
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}${refParam}`,
    {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'QA-Testing-Dashboard',
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  
  // Content is base64 encoded
  if (data.content) {
    return Buffer.from(data.content, 'base64').toString('utf-8');
  }

  return '';
}

/**
 * List open pull requests in a repository
 */
export async function listOpenPullRequests(
  owner: string,
  repo: string,
  options?: { perPage?: number; state?: 'open' | 'closed' | 'all' }
): Promise<Array<{
  id: number;
  number: number;
  title: string;
  state: string;
  html_url: string;
}>> {
  if (!GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN is not configured');
  }

  const perPage = options?.perPage || 30;
  const state = options?.state || 'open';
  
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls?state=${state}&per_page=${perPage}`,
    {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'QA-Testing-Dashboard',
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API error: ${response.status} ${errorText}`);
  }

  return response.json();
}
