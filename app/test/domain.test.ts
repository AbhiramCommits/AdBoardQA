import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_EVENTS,
  CAMPAIGN_STATUSES,
  LEGAL_TRANSITIONS,
  MAX_CAMPAIGN_BUDGET_CENTS,
  canTransition,
  computeCampaignTotals,
  computeFlightMetrics,
  daysInclusive,
  findOverlap,
  flightCostCents,
  formatCents,
  isEditableStatus,
  isWithinCampaignWindow,
  parseIsoDate,
  rangesOverlap,
  resolveTransition,
  validateAdvertiser,
  validateCampaignBudget,
  validateCampaignName,
  validateCampaignWindow,
  validateDailyBudget,
  validateFlightBudget,
  validateFlightWindow,
  type Campaign,
  type CampaignEvent,
  type CampaignStatus,
  type Flight,
  type Screen,
} from '../src/domain/index.js';

const screens: Screen[] = [
  {
    id: 'scr_a',
    name: 'Alpha Wall',
    venue: 'airport',
    dailyImpressions: 1000,
    cpm: 10,
  },
  {
    id: 'scr_b',
    name: 'Beta Wall',
    venue: 'mall',
    dailyImpressions: 2000,
    cpm: 20,
  },
];

function flight(overrides: Partial<Flight> = {}): Flight {
  return {
    id: 'flt_1',
    screenId: 'scr_a',
    startDate: '2026-01-01',
    endDate: '2026-01-03',
    dailyBudgetCents: 1000,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function campaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: 'cmp_1',
    name: 'Alpha Launch',
    advertiser: 'Alpha Inc',
    budgetCents: 10_000,
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    status: 'draft',
    createdBy: 'planner@adboard.test',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    flights: [],
    history: [],
    ...overrides,
  };
}

describe('date helpers', () => {
  it('parses valid ISO calendar dates only', () => {
    expect(parseIsoDate('2026-01-31')?.toISOString()).toBe('2026-01-31T00:00:00.000Z');
    expect(parseIsoDate('2024-02-29')?.toISOString()).toBe('2024-02-29T00:00:00.000Z');
    expect(parseIsoDate('2026-02-30')).toBeNull();
    expect(parseIsoDate('2026-1-1')).toBeNull();
    expect(parseIsoDate('not-a-date')).toBeNull();
    expect(parseIsoDate(undefined)).toBeNull();
    expect(parseIsoDate(20260101)).toBeNull();
  });

  it('counts inclusive days', () => {
    expect(daysInclusive('2026-01-01', '2026-01-01')).toBe(1);
    expect(daysInclusive('2026-01-01', '2026-01-03')).toBe(3);
    expect(daysInclusive('2026-01-01', '2026-01-31')).toBe(31);
    expect(daysInclusive('bad', '2026-01-31')).toBe(0);
  });

  it('formats cents as US dollars', () => {
    expect(formatCents(0)).toBe('$0.00');
    expect(formatCents(100)).toBe('$1.00');
    expect(formatCents(123_456)).toBe('$1,234.56');
    expect(formatCents(1_000_000)).toBe('$10,000.00');
    expect(formatCents(-50)).toBe('-$0.50');
  });
});

describe('campaign validation', () => {
  it('requires a non-empty campaign name', () => {
    expect(validateCampaignName('  Summer Push  ')).toBeNull();
    expect(validateCampaignName('キャンペーン Ünïcode')).toBeNull();
    expect(validateCampaignName('a'.repeat(120))).toBeNull();
    expect(validateCampaignName('a'.repeat(121))?.code).toBe('NAME_TOO_LONG');
    expect(validateCampaignName('   ')?.field).toBe('name');
    expect(validateCampaignName('')?.code).toBe('NAME_REQUIRED');
    expect(validateCampaignName(undefined)?.code).toBe('NAME_REQUIRED');
  });

  it('requires a non-empty advertiser', () => {
    expect(validateAdvertiser('Northwind')).toBeNull();
    expect(validateAdvertiser('')?.field).toBe('advertiser');
    expect(validateAdvertiser(42)?.code).toBe('ADVERTISER_REQUIRED');
  });

  it('accepts only positive whole-cent budgets within the ceiling', () => {
    expect(validateCampaignBudget(1)).toBeNull();
    expect(validateCampaignBudget(MAX_CAMPAIGN_BUDGET_CENTS)).toBeNull();
    expect(validateCampaignBudget(0)?.code).toBe('BUDGET_INVALID');
    expect(validateCampaignBudget(-100)?.code).toBe('BUDGET_INVALID');
    expect(validateCampaignBudget(10.5)?.code).toBe('BUDGET_INVALID');
    expect(validateCampaignBudget(MAX_CAMPAIGN_BUDGET_CENTS + 1)?.code).toBe(
      'BUDGET_INVALID',
    );
    expect(validateCampaignBudget('100')?.field).toBe('budgetCents');
  });

  it('requires endDate to be strictly after startDate', () => {
    expect(validateCampaignWindow('2026-01-01', '2026-01-02')).toBeNull();
    expect(validateCampaignWindow('2026-01-01', '2026-01-01')?.code).toBe(
      'DATE_WINDOW_INVALID',
    );
    expect(validateCampaignWindow('2026-01-02', '2026-01-01')?.code).toBe(
      'DATE_WINDOW_INVALID',
    );
    expect(validateCampaignWindow('2026-01-01', '2026-13-01')?.code).toBe(
      'DATE_FORMAT_INVALID',
    );
    expect(validateCampaignWindow('nope', '2026-01-02')?.field).toBe('startDate');
  });
});

describe('flight validation', () => {
  const campaignWindow = { startDate: '2026-01-01', endDate: '2026-01-31' };

  it('keeps flights inside the campaign window', () => {
    expect(
      validateFlightWindow(
        { startDate: '2026-01-05', endDate: '2026-01-10' },
        campaignWindow,
      ),
    ).toBeNull();
    expect(
      validateFlightWindow(
        { startDate: '2026-01-05', endDate: '2026-01-05' },
        campaignWindow,
      ),
    ).toBeNull();
    expect(
      validateFlightWindow(
        { startDate: '2025-12-31', endDate: '2026-01-10' },
        campaignWindow,
      )?.code,
    ).toBe('FLIGHT_OUTSIDE_CAMPAIGN');
    expect(
      validateFlightWindow(
        { startDate: '2026-01-05', endDate: '2026-02-01' },
        campaignWindow,
      )?.code,
    ).toBe('FLIGHT_OUTSIDE_CAMPAIGN');
    expect(
      validateFlightWindow(
        { startDate: '2026-01-10', endDate: '2026-01-05' },
        campaignWindow,
      )?.code,
    ).toBe('FLIGHT_WINDOW_INVALID');
    expect(
      validateFlightWindow({ startDate: 'bad', endDate: '2026-01-05' }, campaignWindow)
        ?.field,
    ).toBe('startDate');
    expect(
      validateFlightWindow(
        { startDate: '2026-01-05', endDate: '2026-01-10' },
        { startDate: 'bad', endDate: '2026-01-31' },
      )?.code,
    ).toBe('CAMPAIGN_WINDOW_INVALID');
  });

  it('validates the daily budget is a whole number of cents', () => {
    expect(validateDailyBudget(100)).toBeNull();
    expect(validateDailyBudget(0)?.code).toBe('DAILY_BUDGET_INVALID');
    expect(validateDailyBudget(-1)?.code).toBe('DAILY_BUDGET_INVALID');
    expect(validateDailyBudget(1.5)?.code).toBe('DAILY_BUDGET_INVALID');
    expect(validateDailyBudget('100')?.field).toBe('dailyBudgetCents');
  });

  it('computes inclusive flight cost', () => {
    expect(flightCostCents(1000, '2026-01-01', '2026-01-03')).toBe(3000);
    expect(flightCostCents(0, '2026-01-01', '2026-01-01')).toBe(0);
  });

  it('detects overlapping intervals', () => {
    expect(rangesOverlap('2026-01-01', '2026-01-10', '2026-01-05', '2026-01-15')).toBe(
      true,
    );
    expect(rangesOverlap('2026-01-01', '2026-01-10', '2026-01-10', '2026-01-15')).toBe(
      true,
    );
    expect(rangesOverlap('2026-01-01', '2026-01-10', '2026-01-11', '2026-01-15')).toBe(
      false,
    );
    expect(rangesOverlap('2026-01-01', '2026-01-10', '2026-01-20', '2026-01-25')).toBe(
      false,
    );
    expect(rangesOverlap('bad', '2026-01-10', '2026-01-05', '2026-01-15')).toBe(false);
  });

  it('finds the first overlapping flight', () => {
    const existing = [
      flight(),
      flight({ id: 'flt_2', startDate: '2026-01-20', endDate: '2026-01-22' }),
    ];
    expect(
      findOverlap(existing, { startDate: '2026-01-02', endDate: '2026-01-04' })?.id,
    ).toBe('flt_1');
    expect(
      findOverlap(existing, { startDate: '2026-01-10', endDate: '2026-01-12' }),
    ).toBeNull();
  });

  it('rejects a flight that overflows the remaining campaign budget', () => {
    expect(validateFlightBudget(1000, 10, 0, 10_000)).toBeNull();
    expect(validateFlightBudget(1000, 10, 0, 9_999)?.code).toBe('BUDGET_EXCEEDED');
    expect(validateFlightBudget(1000, 10, 5_000, 14_000)?.code).toBe('BUDGET_EXCEEDED');
    expect(validateFlightBudget(1000, 10, 5_000, 15_000)).toBeNull();
  });

  it('reports whether a flight sits inside a campaign window', () => {
    expect(
      isWithinCampaignWindow(
        { startDate: '2026-01-05', endDate: '2026-01-10' },
        campaignWindow,
      ),
    ).toBe(true);
    expect(
      isWithinCampaignWindow(
        { startDate: '2025-01-05', endDate: '2026-01-10' },
        campaignWindow,
      ),
    ).toBe(false);
    expect(
      isWithinCampaignWindow({ startDate: 'bad', endDate: '2026-01-10' }, campaignWindow),
    ).toBe(false);
  });
});

describe('campaign totals', () => {
  it('computes per-flight metrics', () => {
    expect(computeFlightMetrics(flight(), screens[0] as Screen)).toEqual({
      flightId: 'flt_1',
      screenId: 'scr_a',
      days: 3,
      costCents: 3000,
      impressions: 3000,
    });
  });

  it('sums booked budget, impressions and media value', () => {
    const totals = computeCampaignTotals(
      campaign({
        flights: [
          flight(),
          flight({
            id: 'flt_2',
            screenId: 'scr_b',
            startDate: '2026-01-10',
            endDate: '2026-01-11',
            dailyBudgetCents: 500,
          }),
        ],
      }),
      screens,
    );

    expect(totals).toEqual({
      flightCount: 2,
      bookedBudgetCents: 4000,
      remainingBudgetCents: 6000,
      totalImpressions: 7000,
      averageCpmCents: 571,
      mediaValueCents: 11000,
    });
  });

  it('handles empty plans and unknown screens', () => {
    expect(computeCampaignTotals(campaign(), screens)).toEqual({
      flightCount: 0,
      bookedBudgetCents: 0,
      remainingBudgetCents: 10_000,
      totalImpressions: 0,
      averageCpmCents: 0,
      mediaValueCents: 0,
    });

    const totals = computeCampaignTotals(
      campaign({ flights: [flight({ screenId: 'missing' })] }),
      screens,
    );
    expect(totals.bookedBudgetCents).toBe(3000);
    expect(totals.totalImpressions).toBe(0);
    expect(totals.mediaValueCents).toBe(0);
  });
});

describe('status machine', () => {
  const expected: Record<string, CampaignStatus> = {
    'draft:submit': 'pending_approval',
    'pending_approval:approve': 'approved',
    'pending_approval:reject': 'draft',
    'approved:publish': 'live',
  };

  it('exposes exactly the four legal transitions', () => {
    expect(LEGAL_TRANSITIONS).toEqual([
      { from: 'draft', event: 'submit', to: 'pending_approval' },
      { from: 'pending_approval', event: 'approve', to: 'approved' },
      { from: 'pending_approval', event: 'reject', to: 'draft' },
      { from: 'approved', event: 'publish', to: 'live' },
    ]);
  });

  it('accepts every legal transition', () => {
    for (const transition of LEGAL_TRANSITIONS) {
      expect(resolveTransition(transition.from, transition.event)).toBe(transition.to);
      expect(canTransition(transition.from, transition.event)).toBe(true);
    }
  });

  it('rejects every illegal status/event pair', () => {
    let checked = 0;
    for (const status of CAMPAIGN_STATUSES) {
      for (const event of CAMPAIGN_EVENTS) {
        const key = `${status}:${event}`;
        const legal = expected[key];
        if (legal) {
          expect(resolveTransition(status, event)).toBe(legal);
        } else {
          expect(resolveTransition(status, event)).toBeNull();
          expect(canTransition(status, event)).toBe(false);
          checked += 1;
        }
      }
    }
    expect(checked).toBe(12);
  });

  it('only allows edits while the campaign is a draft', () => {
    expect(isEditableStatus('draft')).toBe(true);
    for (const status of CAMPAIGN_STATUSES.filter((value) => value !== 'draft')) {
      expect(isEditableStatus(status)).toBe(false);
    }
  });

  it('covers every status/event pair at least once', () => {
    const pairs = new Set<string>();
    for (const status of CAMPAIGN_STATUSES) {
      for (const event of CAMPAIGN_EVENTS) {
        pairs.add(`${status}:${event satisfies CampaignEvent}`);
      }
    }
    expect(pairs.size).toBe(16);
  });
});
