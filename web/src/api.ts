export type CampaignStatus = 'draft' | 'pending_approval' | 'approved' | 'live';

export interface Screen {
  id: string;
  name: string;
  venue: 'airport' | 'mall' | 'gym';
  dailyImpressions: number;
  cpm: number;
}

export interface Flight {
  id: string;
  screenId: string;
  startDate: string;
  endDate: string;
  dailyBudgetCents: number;
  createdAt: string;
}

export interface FlightMetrics {
  flightId: string;
  screenId: string;
  days: number;
  costCents: number;
  impressions: number;
}

export interface CampaignTotals {
  flightCount: number;
  bookedBudgetCents: number;
  remainingBudgetCents: number;
  totalImpressions: number;
  averageCpmCents: number;
  mediaValueCents: number;
}

export interface Campaign {
  id: string;
  name: string;
  advertiser: string;
  budgetCents: number;
  startDate: string;
  endDate: string;
  status: CampaignStatus;
  createdBy: string;
  updatedAt: string;
  publishedAt?: string;
  lastRejection?: { reason: string; reviewer: string; at: string };
  flights: Flight[];
  totals: CampaignTotals;
  flightMetrics: FlightMetrics[];
}

export interface CampaignSummary {
  id: string;
  name: string;
  advertiser: string;
  budgetCents: number;
  startDate: string;
  endDate: string;
  status: CampaignStatus;
  flightCount: number;
  bookedBudgetCents: number;
  updatedAt: string;
}

export interface CreateCampaignInput {
  name: string;
  advertiser: string;
  budgetCents: number;
  startDate: string;
  endDate: string;
}

export interface CreateFlightInput {
  screenId: string;
  startDate: string;
  endDate: string;
  dailyBudgetCents: number;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  field?: string;
}

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly payload: ApiErrorPayload,
  ) {
    super(payload.message);
    this.name = 'ApiRequestError';
  }
}

const USER_KEY = 'adboard.user';
const REVIEWER_KEY = 'adboard.reviewer';

export function currentUser(): string {
  return localStorage.getItem(USER_KEY) ?? 'planner@adboard.test';
}

export function setCurrentUser(user: string): void {
  localStorage.setItem(USER_KEY, user);
}

export function currentReviewer(): string {
  return localStorage.getItem(REVIEWER_KEY) ?? 'reviewer@adboard.test';
}

export function setCurrentReviewer(reviewer: string): void {
  localStorage.setItem(REVIEWER_KEY, reviewer);
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; reviewer?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-user': currentUser(),
  };
  if (options.reviewer) {
    headers['x-reviewer'] = options.reviewer;
  }
  const response = await fetch(`/api${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const body: unknown = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const payload =
      body && typeof body === 'object' && 'error' in body
        ? (body as { error: ApiErrorPayload }).error
        : { code: 'UNKNOWN', message: `Request failed with status ${response.status}` };
    throw new ApiRequestError(response.status, payload);
  }
  return body as T;
}

export const api = {
  reset: () => request<{ ok: boolean }>('/test/reset', { method: 'POST' }),
  listScreens: () => request<{ screens: Screen[] }>('/screens'),
  listCampaigns: () => request<{ campaigns: CampaignSummary[] }>('/campaigns'),
  getCampaign: (id: string) => request<Campaign>(`/campaigns/${id}`),
  createCampaign: (input: CreateCampaignInput) =>
    request<Campaign>('/campaigns', { method: 'POST', body: input }),
  addFlight: (campaignId: string, input: CreateFlightInput) =>
    request<Campaign>(`/campaigns/${campaignId}/flights`, { method: 'POST', body: input }),
  deleteFlight: (campaignId: string, flightId: string) =>
    request<{ deletedFlightId: string; campaign: Campaign }>(
      `/campaigns/${campaignId}/flights/${flightId}`,
      { method: 'DELETE' },
    ),
  submit: (campaignId: string) =>
    request<Campaign>(`/campaigns/${campaignId}/submit`, { method: 'POST' }),
  approve: (campaignId: string, reviewer: string) =>
    request<Campaign>(`/campaigns/${campaignId}/approve`, {
      method: 'POST',
      reviewer,
      body: { reviewer },
    }),
  reject: (campaignId: string, reason: string, reviewer: string) =>
    request<Campaign>(`/campaigns/${campaignId}/reject`, {
      method: 'POST',
      reviewer,
      body: { reason, reviewer },
    }),
  publish: (campaignId: string) =>
    request<Campaign>(`/campaigns/${campaignId}/publish`, { method: 'POST' }),
};

export function statusLabel(status: CampaignStatus): string {
  return {
    draft: 'Draft',
    pending_approval: 'Pending approval',
    approved: 'Approved',
    live: 'Live',
  }[status];
}
