export interface GithubIssue {
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  labels: string[];
  assignees: string[];
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
}

export interface GithubComment {
  id: number;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export type GithubFeaturesErrorCode =
  | "CONFIG_MISSING"
  | "AUTH_FAILED"
  | "RATE_LIMITED"
  | "API_ERROR"
  | "NETWORK_ERROR"
  | "INVALID_RESPONSE";

export interface GithubFeaturesErrorObject {
  code: GithubFeaturesErrorCode;
  message: string;
  status?: number;
  details?: unknown;
}

export class GithubFeaturesError
  extends Error
  implements GithubFeaturesErrorObject
{
  code: GithubFeaturesErrorCode;
  status?: number;
  details?: unknown;

  constructor(params: GithubFeaturesErrorObject) {
    super(params.message);
    this.name = "GithubFeaturesError";
    this.code = params.code;
    this.status = params.status;
    this.details = params.details;
  }
}

interface GithubRepoConfig {
  owner: string;
  repo: string;
  token: string;
}

interface GithubLabel {
  name?: string;
}

interface GithubAssignee {
  login?: string;
}

interface GithubIssueResponse {
  number?: number;
  title?: string;
  body?: string | null;
  state?: "open" | "closed";
  labels?: Array<GithubLabel | string>;
  assignees?: GithubAssignee[];
  created_at?: string;
  updated_at?: string;
  html_url?: string;
  pull_request?: unknown;
}

interface GithubCommentResponse {
  id?: number;
  body?: string | null;
  created_at?: string;
  updated_at?: string;
}

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_ACCEPT_HEADER = "application/vnd.github.v3+json";

function getGithubRepoConfig(): GithubRepoConfig {
  const owner = process.env.GITHUB_REPO_OWNER;
  const repo = process.env.GITHUB_REPO_NAME;
  const token = process.env.GITHUB_SYSTEM_PAT;

  if (!owner || !repo || !token) {
    throw new GithubFeaturesError({
      code: "CONFIG_MISSING",
      message:
        "Missing GitHub configuration. Required env vars: GITHUB_REPO_OWNER, GITHUB_REPO_NAME, GITHUB_SYSTEM_PAT.",
    });
  }

  return { owner, repo, token };
}

function getRepoIssuesBaseUrl(config: GithubRepoConfig): string {
  return `${GITHUB_API_BASE}/repos/${config.owner}/${config.repo}/issues`;
}

function parseJsonSafely(text: string): unknown {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function parseErrorMessage(details: unknown): string | undefined {
  if (!details || typeof details !== "object") {
    return undefined;
  }

  const candidate = details as { message?: unknown; error?: unknown };
  if (typeof candidate.message === "string") {
    return candidate.message;
  }

  if (typeof candidate.error === "string") {
    return candidate.error;
  }

  return undefined;
}

function isRateLimited(response: Response, details: unknown): boolean {
  if (response.status === 429) {
    return true;
  }

  if (response.status !== 403) {
    return false;
  }

  if (response.headers.get("x-ratelimit-remaining") === "0") {
    return true;
  }

  const message = parseErrorMessage(details);
  return typeof message === "string" && /rate limit/i.test(message);
}

function normalizeIssue(raw: GithubIssueResponse): GithubIssue {
  if (
    typeof raw.number !== "number" ||
    typeof raw.title !== "string" ||
    typeof raw.state !== "string" ||
    typeof raw.created_at !== "string" ||
    typeof raw.updated_at !== "string" ||
    typeof raw.html_url !== "string"
  ) {
    throw new GithubFeaturesError({
      code: "INVALID_RESPONSE",
      message: "GitHub API returned an invalid issue response shape.",
      details: raw,
    });
  }

  return {
    number: raw.number,
    title: raw.title,
    body: raw.body ?? "",
    state: raw.state === "closed" ? "closed" : "open",
    labels: (raw.labels ?? []).map((label) => {
      if (typeof label === "string") {
        return label;
      }
      return label.name ?? "";
    }).filter(Boolean),
    assignees: (raw.assignees ?? [])
      .map((assignee) => assignee.login ?? "")
      .filter(Boolean),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    htmlUrl: raw.html_url,
  };
}

function normalizeComment(raw: GithubCommentResponse): GithubComment {
  if (
    typeof raw.id !== "number" ||
    typeof raw.created_at !== "string" ||
    typeof raw.updated_at !== "string"
  ) {
    throw new GithubFeaturesError({
      code: "INVALID_RESPONSE",
      message: "GitHub API returned an invalid comment response shape.",
      details: raw,
    });
  }

  return {
    id: raw.id,
    body: raw.body ?? "",
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

function parseNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) {
    return null;
  }

  const parts = linkHeader.split(",");
  for (const part of parts) {
    const trimmed = part.trim();
    const match = trimmed.match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (match && match[2] === "next") {
      return match[1];
    }
  }

  return null;
}

async function requestGithub<T>(
  url: string,
  init: RequestInit,
  options?: { allow404?: boolean },
): Promise<{ data: T | null; response: Response }> {
  const config = getGithubRepoConfig();

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Accept: GITHUB_ACCEPT_HEADER,
        Authorization: `token ${config.token}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
  } catch (error) {
    throw new GithubFeaturesError({
      code: "NETWORK_ERROR",
      message: "GitHub API request failed due to a network error.",
      details: error,
    });
  }

  const text = await response.text();
  const parsed = parseJsonSafely(text);

  if (options?.allow404 && response.status === 404) {
    return { data: null, response };
  }

  if (response.status === 401 || response.status === 403) {
    if (isRateLimited(response, parsed)) {
      throw new GithubFeaturesError({
        code: "RATE_LIMITED",
        message: "GitHub rate limit exceeded",
        status: response.status,
        details: parsed,
      });
    }

    throw new GithubFeaturesError({
      code: "AUTH_FAILED",
      message: "GitHub API authorization failed",
      status: response.status,
      details: parsed,
    });
  }

  if (isRateLimited(response, parsed)) {
    throw new GithubFeaturesError({
      code: "RATE_LIMITED",
      message: "GitHub rate limit exceeded",
      status: response.status,
      details: parsed,
    });
  }

  if (!response.ok) {
    const apiMessage = parseErrorMessage(parsed);
    throw new GithubFeaturesError({
      code: "API_ERROR",
      message: `GitHub API request failed with status ${response.status}${apiMessage ? `: ${apiMessage}` : ""}`,
      status: response.status,
      details: parsed,
    });
  }

  return { data: parsed as T, response };
}

export async function listAllIssues(
  state: "open" | "closed" | "all" = "open",
): Promise<GithubIssue[]> {
  const config = getGithubRepoConfig();
  const baseUrl = getRepoIssuesBaseUrl(config);

  const allIssues: GithubIssue[] = [];
  let nextUrl: string | null = `${baseUrl}?state=${state}&per_page=100&page=1`;

  while (nextUrl) {
    const { data, response } = await requestGithub<GithubIssueResponse[]>(nextUrl, {
      method: "GET",
    });

    const pageItems = Array.isArray(data) ? data : [];
    const filteredItems = pageItems.filter((item) => !item.pull_request);
    allIssues.push(...filteredItems.map(normalizeIssue));

    nextUrl = parseNextLink(response.headers.get("link"));
  }

  return allIssues;
}

export const listIssues = listAllIssues;

export async function getIssue(issueNumber: number): Promise<GithubIssue | null> {
  const config = getGithubRepoConfig();
  const url = `${getRepoIssuesBaseUrl(config)}/${issueNumber}`;

  const { data } = await requestGithub<GithubIssueResponse>(
    url,
    { method: "GET" },
    { allow404: true },
  );

  if (!data) {
    return null;
  }

  if (data.pull_request) {
    return null;
  }

  return normalizeIssue(data);
}

export async function createIssue(
  title: string,
  body: string,
  labels: string[] = [],
): Promise<GithubIssue> {
  const config = getGithubRepoConfig();
  const url = getRepoIssuesBaseUrl(config);
  const payload: { title: string; body: string; labels?: string[] } = { title, body };

  if (labels.length > 0) {
    payload.labels = labels;
  }

  const { data } = await requestGithub<GithubIssueResponse>(url, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!data) {
    throw new GithubFeaturesError({
      code: "INVALID_RESPONSE",
      message: "GitHub API returned empty response for createIssue.",
    });
  }

  return normalizeIssue(data);
}

export async function updateIssue(
  issueNumber: number,
  data: {
    title?: string;
    body?: string;
    state?: "open" | "closed";
    labels?: string[];
  },
): Promise<GithubIssue> {
  const config = getGithubRepoConfig();
  const url = `${getRepoIssuesBaseUrl(config)}/${issueNumber}`;

  const { data: issue } = await requestGithub<GithubIssueResponse>(url, {
    method: "PATCH",
    body: JSON.stringify(data),
  });

  if (!issue) {
    throw new GithubFeaturesError({
      code: "INVALID_RESPONSE",
      message: "GitHub API returned empty response for updateIssue.",
    });
  }

  return normalizeIssue(issue);
}

export async function addIssueComment(
  issueNumber: number,
  body: string,
): Promise<GithubComment> {
  const config = getGithubRepoConfig();
  const url = `${getRepoIssuesBaseUrl(config)}/${issueNumber}/comments`;

  const { data } = await requestGithub<GithubCommentResponse>(url, {
    method: "POST",
    body: JSON.stringify({ body }),
  });

  if (!data) {
    throw new GithubFeaturesError({
      code: "INVALID_RESPONSE",
      message: "GitHub API returned empty response for addIssueComment.",
    });
  }

  return normalizeComment(data);
}

export async function listIssueComments(
  issueNumber: number,
): Promise<GithubComment[]> {
  const config = getGithubRepoConfig();
  const baseUrl = `${getRepoIssuesBaseUrl(config)}/${issueNumber}/comments`;

  const allComments: GithubComment[] = [];
  let nextUrl: string | null = `${baseUrl}?per_page=100&page=1`;

  while (nextUrl) {
    const { data, response } = await requestGithub<GithubCommentResponse[]>(nextUrl, {
      method: "GET",
    });

    const pageItems = Array.isArray(data) ? data : [];
    allComments.push(...pageItems.map(normalizeComment));

    nextUrl = parseNextLink(response.headers.get("link"));
  }

  return allComments;
}

export async function ensureLabel(
  name: string,
  color = "ededed",
): Promise<void> {
  const config = getGithubRepoConfig();
  const url = `${GITHUB_API_BASE}/repos/${config.owner}/${config.repo}/labels`;

  try {
    await requestGithub(url, {
      method: "POST",
      body: JSON.stringify({ name, color }),
    });
  } catch (error) {
    if (
      error instanceof GithubFeaturesError &&
      error.code === "API_ERROR" &&
      (error.status === 409 || error.status === 422)
    ) {
      return;
    }
    throw error;
  }
}

export async function setIssueLabels(
  issueNumber: number,
  labels: string[],
): Promise<void> {
  const config = getGithubRepoConfig();
  const url = `${getRepoIssuesBaseUrl(config)}/${issueNumber}/labels`;

  await requestGithub(url, {
    method: "PUT",
    body: JSON.stringify({ labels }),
  });
}

export async function setIssueState(
  issueNumber: number,
  state: "open" | "closed",
): Promise<void> {
  const config = getGithubRepoConfig();
  const url = `${getRepoIssuesBaseUrl(config)}/${issueNumber}`;

  await requestGithub(url, {
    method: "PATCH",
    body: JSON.stringify({ state }),
  });
}

export async function setIssueAssignees(
  issueNumber: number,
  assignees: string[],
): Promise<void> {
  const config = getGithubRepoConfig();
  const url = `${getRepoIssuesBaseUrl(config)}/${issueNumber}`;

  await requestGithub(url, {
    method: "PATCH",
    body: JSON.stringify({ assignees }),
  });
}
