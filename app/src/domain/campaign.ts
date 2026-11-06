/**
 * Pure domain logic for DOOH campaigns. Nothing in this file touches Express,
 * the filesystem or the clock, which keeps every rule unit-testable.
 */

export const CAMPAIGN_STATUSES = ['draft', 'pending_approval', 'approved', 'live'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_EVENTS = ['submit', 'approve', 'reject', 'publish'] as const;
export type CampaignEvent = (typeof CAMPAIGN_EVENTS)[number];

export const VENUE_TYPES = ['airport', 'mall', 'gym'] as const;
export type VenueType = (typeof VENUE_TYPES)[number];

export const MAX_CAMPAIGN_NAME_LENGTH = 120;
export const MAX_CAMPAIGN_BUDGET_CENTS = 1_000_000_000;

const DAY_MS = 86_400_000;

export interface Screen {
  id: string;
  name: string;
  venue: VenueType;
  dailyImpressions: number;
  /** Cost per mille in US dollars. */
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

export interface CampaignHistoryEntry {
  at: string;
  event: CampaignEvent | 'create' | 'flight_added' | 'flight_removed';
  from: CampaignStatus | null;
  to: CampaignStatus;
  actor: string;
  note?: string;
}

export interface RejectionRecord {
  reason: string;
  reviewer: string;
  at: string;
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
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  lastRejection?: RejectionRecord;
  flights: Flight[];
  history: CampaignHistoryEntry[];
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

export interface ValidationIssue {
  code: string;
  message: string;
  field: string;
}

export interface CampaignWindow {
  startDate: string;
  endDate: string;
}

export interface FlightWindow {
  startDate: string;
  endDate: string;
}

const TRANSITIONS: Record<
  CampaignStatus,
  Partial<Record<CampaignEvent, CampaignStatus>>
> = {
  draft: { submit: 'pending_approval' },
  pending_approval: { approve: 'approved', reject: 'draft' },
  approved: { publish: 'live' },
  live: {},
};

/** The complete state machine, useful for table-driven tests and docs. */
export const LEGAL_TRANSITIONS: ReadonlyArray<{
  from: CampaignStatus;
  event: CampaignEvent;
  to: CampaignStatus;
}> = CAMPAIGN_STATUSES.flatMap((from) =>
  CAMPAIGN_EVENTS.flatMap((event) => {
    const to = TRANSITIONS[from][event];
    return to ? [{ from, event, to }] : [];
  }),
);

export function resolveTransition(
  from: CampaignStatus,
  event: CampaignEvent,
): CampaignStatus | null {
  return TRANSITIONS[from][event] ?? null;
}

export function canTransition(from: CampaignStatus, event: CampaignEvent): boolean {
  return resolveTransition(from, event) !== null;
}

export function isEditableStatus(status: CampaignStatus): boolean {
  return status === 'draft';
}

export function parseIsoDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return null;
  }
  return date;
}

export function daysInclusive(startDate: string, endDate: string): number {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (!start || !end) {
    return 0;
  }
  return Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
}

export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  const dollars = Math.floor(absolute / 100).toLocaleString('en-US');
  const remainder = String(absolute % 100).padStart(2, '0');
  return `${sign}$${dollars}.${remainder}`;
}

export function validateCampaignName(name: unknown): ValidationIssue | null {
  if (typeof name !== 'string' || name.trim().length === 0) {
    return {
      code: 'NAME_REQUIRED',
      message: 'Campaign name is required',
      field: 'name',
    };
  }
  return null;
}

export function validateAdvertiser(advertiser: unknown): ValidationIssue | null {
  if (typeof advertiser !== 'string' || advertiser.trim().length === 0) {
    return {
      code: 'ADVERTISER_REQUIRED',
      message: 'Advertiser is required',
      field: 'advertiser',
    };
  }
  return null;
}

export function validateCampaignBudget(budgetCents: unknown): ValidationIssue | null {
  if (
    typeof budgetCents !== 'number' ||
    !Number.isInteger(budgetCents) ||
    budgetCents <= 0 ||
    budgetCents > MAX_CAMPAIGN_BUDGET_CENTS
  ) {
    return {
      code: 'BUDGET_INVALID',
      message: 'Budget must be a positive whole number of cents',
      field: 'budgetCents',
    };
  }
  return null;
}

export function validateCampaignWindow(
  startDate: unknown,
  endDate: unknown,
): ValidationIssue | null {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (!start || !end) {
    return {
      code: 'DATE_FORMAT_INVALID',
      message: 'Dates must use YYYY-MM-DD',
      field: !start ? 'startDate' : 'endDate',
    };
  }
  if (end.getTime() <= start.getTime()) {
    return {
      code: 'DATE_WINDOW_INVALID',
      message: 'End date must be after start date',
      field: 'endDate',
    };
  }
  return null;
}

export function validateFlightWindow(
  flight: FlightWindow,
  campaign: CampaignWindow,
): ValidationIssue | null {
  const start = parseIsoDate(flight.startDate);
  const end = parseIsoDate(flight.endDate);
  const campaignStart = parseIsoDate(campaign.startDate);
  const campaignEnd = parseIsoDate(campaign.endDate);
  if (!start || !end) {
    return {
      code: 'DATE_FORMAT_INVALID',
      message: 'Dates must use YYYY-MM-DD',
      field: !start ? 'startDate' : 'endDate',
    };
  }
  if (end.getTime() <= start.getTime()) {
    return {
      code: 'FLIGHT_WINDOW_INVALID',
      message: 'Flight end date must be after start date',
      field: 'endDate',
    };
  }
  if (!campaignStart || !campaignEnd) {
    return {
      code: 'CAMPAIGN_WINDOW_INVALID',
      message: 'Campaign window is invalid',
      field: 'startDate',
    };
  }
  if (start.getTime() < campaignStart.getTime() || end.getTime() > campaignEnd.getTime()) {
    return {
      code: 'FLIGHT_OUTSIDE_CAMPAIGN',
      message: 'Flight must fall inside the campaign window',
      field: 'startDate',
    };
  }
  return null;
}

export function validateDailyBudget(dailyBudgetCents: unknown): ValidationIssue | null {
  if (typeof dailyBudgetCents !== 'number' || !Number.isInteger(dailyBudgetCents)) {
    return {
      code: 'DAILY_BUDGET_INVALID',
      message: 'Daily budget must be a whole number of cents',
      field: 'dailyBudgetCents',
    };
  }
  return null;
}

export function flightCostCents(
  dailyBudgetCents: number,
  startDate: string,
  endDate: string,
): number {
  return dailyBudgetCents * daysInclusive(startDate, endDate);
}

export function rangesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): boolean {
  const aStart = parseIsoDate(startA);
  const aEnd = parseIsoDate(endA);
  const bStart = parseIsoDate(startB);
  const bEnd = parseIsoDate(endB);
  if (!aStart || !aEnd || !bStart || !bEnd) {
    return false;
  }
  return aStart.getTime() <= bEnd.getTime() + DAY_MS && aEnd.getTime() >= bStart.getTime() - DAY_MS;
}

export function findOverlap<T extends FlightWindow>(
  existing: readonly T[],
  candidate: FlightWindow,
): T | null {
  return (
    existing.find((flight) =>
      rangesOverlap(candidate.startDate, candidate.endDate, flight.startDate, flight.endDate),
    ) ?? null
  );
}

export function validateFlightBudget(
  dailyBudgetCents: number,
  days: number,
  existingBookedCents: number,
  campaignBudgetCents: number,
): ValidationIssue | null {
  const cost = dailyBudgetCents * days;
  if (existingBookedCents + cost > campaignBudgetCents) {
    return {
      code: 'BUDGET_EXCEEDED',
      message: `Flight cost ${formatCents(cost)} exceeds the remaining campaign budget ${formatCents(
        campaignBudgetCents - existingBookedCents,
      )}`,
      field: 'dailyBudgetCents',
    };
  }
  return null;
}

export function computeFlightMetrics(flight: Flight, screen: Screen): FlightMetrics {
  const days = daysInclusive(flight.startDate, flight.endDate);
  return {
    flightId: flight.id,
    screenId: flight.screenId,
    days,
    costCents: flight.dailyBudgetCents * days,
    impressions: screen.dailyImpressions * days,
  };
}

export function computeCampaignTotals(
  campaign: Campaign,
  screens: readonly Screen[],
): CampaignTotals {
  const screensById = new Map(screens.map((screen) => [screen.id, screen]));
  const metrics = campaign.flights.map((flight) => {
    const screen = screensById.get(flight.screenId);
    return {
      flight,
      screen,
      days: daysInclusive(flight.startDate, flight.endDate),
      cost: flightCostCents(flight.dailyBudgetCents, flight.startDate, flight.endDate),
    };
  });

  const bookedBudgetCents = metrics.reduce((total, item) => total + item.cost, 0);
  const totalImpressions = metrics.reduce(
    (total, item) => total + (item.screen ? item.screen.dailyImpressions * item.days : 0),
    0,
  );
  const mediaValueCents = metrics.reduce(
    (total, item) =>
      total + (item.screen ? Math.round((item.screen.dailyImpressions * item.days * item.screen.cpm) / 1000 * 100) : 0),
    0,
  );
  const averageCpmCents =
    totalImpressions === 0 ? 0 : Math.round((bookedBudgetCents / totalImpressions) * 1000);

  return {
    flightCount: campaign.flights.length,
    bookedBudgetCents,
    remainingBudgetCents: campaign.budgetCents - bookedBudgetCents,
    totalImpressions,
    averageCpmCents,
    mediaValueCents,
  };
}

export function isWithinCampaignWindow(
  flight: FlightWindow,
  campaign: CampaignWindow,
): boolean {
  const start = parseIsoDate(flight.startDate);
  const end = parseIsoDate(flight.endDate);
  const campaignStart = parseIsoDate(campaign.startDate);
  const campaignEnd = parseIsoDate(campaign.endDate);
  if (!start || !end || !campaignStart || !campaignEnd) {
    return false;
  }
  return start.getTime() >= campaignStart.getTime() && end.getTime() <= campaignEnd.getTime();
}
