export type Role = 'planner' | 'reviewer' | 'admin';

export type CampaignStatus = 'draft' | 'pending_approval' | 'approved' | 'live';

export interface CampaignPayload {
  name: string;
  advertiser: string;
  budgetCents: number;
  startDate: string;
  endDate: string;
}

export interface FlightPayload {
  screenId: string;
  startDate: string;
  endDate: string;
  dailyBudgetCents: number;
}

export interface Flight {
  id: string;
  screenId: string;
  startDate: string;
  endDate: string;
  dailyBudgetCents: number;
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
  flights: Flight[];
  totals: CampaignTotals;
  flightMetrics: FlightMetrics[];
  lastRejection?: { reason: string; reviewer: string; at: string };
  publishedAt?: string;
}

export interface Screen {
  id: string;
  name: string;
  venue: string;
  dailyImpressions: number;
  cpm: number;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    field?: string;
  };
}
