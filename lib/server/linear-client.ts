const LINEAR_API_URL = 'https://api.linear.app/graphql';

export interface LinearTeam {
  id: string;
  name: string;
  key?: string;
}

interface LinearTeamState {
  id: string;
  name: string;
  type?: string;
}

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  url: string;
}

export class LinearApiError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'LinearApiError';
    this.status = status;
  }
}

async function linearGraphQLRequest<T>(
  apiKey: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const response = await fetch(LINEAR_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: apiKey,
    },
    body: JSON.stringify({ query, variables }),
  });

  let payload: {
    data?: T;
    errors?: Array<{ message?: string }>;
  } | null = null;

  try {
    payload = (await response.json()) as {
      data?: T;
      errors?: Array<{ message?: string }>;
    };
  } catch {
    throw new LinearApiError('Linear API returned a non-JSON response.', 502);
  }

  if (!response.ok) {
    const message = payload?.errors?.[0]?.message || `Linear API request failed (${response.status}).`;
    throw new LinearApiError(message, response.status);
  }

  if (payload?.errors && payload.errors.length > 0) {
    const message = payload.errors[0]?.message || 'Linear API returned an error.';
    throw new LinearApiError(message, 400);
  }

  if (!payload?.data) {
    throw new LinearApiError('Linear API returned no data.', 502);
  }

  return payload.data;
}

export async function getViewerTeams(apiKey: string): Promise<LinearTeam[]> {
  const data = await linearGraphQLRequest<{
    viewer?: {
      teams?: {
        nodes?: Array<{ id?: string; name?: string; key?: string | null }>;
      };
    };
  }>(
    apiKey,
    `query ViewerTeams {
      viewer {
        teams {
          nodes {
            id
            name
            key
          }
        }
      }
    }`
  );

  const nodes = data.viewer?.teams?.nodes || [];
  return nodes
    .filter((team): team is { id: string; name: string; key?: string | null } => {
      return Boolean(team.id && team.name);
    })
    .map((team) => ({
      id: team.id,
      name: team.name,
      key: team.key || undefined,
    }));
}

export async function createIssueInLinear(
  apiKey: string,
  input: {
    teamId: string;
    title: string;
    description: string;
    priority?: number;
    stateId?: string;
  }
): Promise<LinearIssue> {
  const data = await linearGraphQLRequest<{
    issueCreate?: {
      success?: boolean;
      issue?: {
        id?: string;
        identifier?: string;
        title?: string;
        url?: string;
      };
    };
  }>(
    apiKey,
    `mutation IssueCreate($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id
          identifier
          title
          url
        }
      }
    }`,
    {
      input: {
        teamId: input.teamId,
        title: input.title,
        description: input.description,
        ...(typeof input.priority === 'number' ? { priority: input.priority } : {}),
        ...(typeof input.stateId === 'string' ? { stateId: input.stateId } : {}),
      },
    }
  );

  const issue = data.issueCreate?.issue;
  if (!data.issueCreate?.success || !issue?.id || !issue.identifier || !issue.url || !issue.title) {
    throw new LinearApiError('Linear issue creation failed.', 502);
  }

  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    url: issue.url,
  };
}

export async function getTeamBacklogStateId(
  apiKey: string,
  teamId: string
): Promise<string> {
  const data = await linearGraphQLRequest<{
    team?: {
      states?: {
        nodes?: Array<{ id?: string; name?: string; type?: string | null }>;
      };
    };
  }>(
    apiKey,
    `query TeamStates($teamId: String!) {
      team(id: $teamId) {
        states {
          nodes {
            id
            name
            type
          }
        }
      }
    }`,
    { teamId }
  );

  const states: LinearTeamState[] = (data.team?.states?.nodes || [])
    .filter((state): state is { id: string; name: string; type?: string | null } => {
      return Boolean(state.id && state.name);
    })
    .map((state) => ({
      id: state.id,
      name: state.name,
      type: state.type || undefined,
    }));

  const backlogByName = states.find((state) => state.name.toLowerCase() === 'backlog');
  if (backlogByName) return backlogByName.id;

  const backlogByType = states.find((state) => state.type?.toLowerCase() === 'backlog');
  if (backlogByType) return backlogByType.id;

  throw new LinearApiError("No 'Backlog' workflow state was found for the selected team.", 400);
}
