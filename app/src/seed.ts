import type { Campaign, Screen } from './domain/campaign.js';

export interface DatabaseShape {
  version: 1;
  screens: Screen[];
  campaigns: Campaign[];
  sequences: {
    campaign: number;
    flight: number;
  };
}

const SEED_AT = '2026-01-05T09:00:00.000Z';

export function createSeedData(): DatabaseShape {
  const screens: Screen[] = [
    {
      id: 'scr_airport_01',
      name: 'Skyline Arrivals',
      venue: 'airport',
      dailyImpressions: 42000,
      cpm: 18.5,
    },
    {
      id: 'scr_airport_02',
      name: 'Terminal 2 Concourse',
      venue: 'airport',
      dailyImpressions: 31000,
      cpm: 16,
    },
    {
      id: 'scr_mall_01',
      name: 'Grand Atrium',
      venue: 'mall',
      dailyImpressions: 58000,
      cpm: 12.75,
    },
    {
      id: 'scr_mall_02',
      name: 'Food Court Loop',
      venue: 'mall',
      dailyImpressions: 26500,
      cpm: 9.5,
    },
    {
      id: 'scr_gym_01',
      name: 'Peak Fitness Wall',
      venue: 'gym',
      dailyImpressions: 12400,
      cpm: 7.25,
    },
    {
      id: 'scr_gym_02',
      name: 'Studio Corridor',
      venue: 'gym',
      dailyImpressions: 8600,
      cpm: 6.5,
    },
  ];

  const campaigns: Campaign[] = [
    {
      id: 'cmp_seed_draft',
      name: 'Kite Travel Late Summer',
      advertiser: 'Kite Travel',
      budgetCents: 1_200_000,
      startDate: '2026-06-01',
      endDate: '2026-06-30',
      status: 'draft',
      createdBy: 'planner@adboard.test',
      createdAt: SEED_AT,
      updatedAt: SEED_AT,
      flights: [],
      history: [
        {
          at: SEED_AT,
          event: 'create',
          from: null,
          to: 'draft',
          actor: 'planner@adboard.test',
        },
      ],
    },
    {
      id: 'cmp_seed_pending',
      name: 'Northwind Spring Launch',
      advertiser: 'Northwind Outdoor',
      budgetCents: 2_500_000,
      startDate: '2026-03-01',
      endDate: '2026-03-31',
      status: 'pending_approval',
      createdBy: 'planner@adboard.test',
      createdAt: SEED_AT,
      updatedAt: '2026-01-08T14:30:00.000Z',
      flights: [
        {
          id: 'flt_seed_001',
          screenId: 'scr_airport_01',
          startDate: '2026-03-02',
          endDate: '2026-03-08',
          dailyBudgetCents: 45000,
          createdAt: SEED_AT,
        },
        {
          id: 'flt_seed_002',
          screenId: 'scr_mall_01',
          startDate: '2026-03-10',
          endDate: '2026-03-20',
          dailyBudgetCents: 38000,
          createdAt: SEED_AT,
        },
      ],
      history: [
        {
          at: SEED_AT,
          event: 'create',
          from: null,
          to: 'draft',
          actor: 'planner@adboard.test',
        },
        {
          at: '2026-01-08T14:30:00.000Z',
          event: 'submit',
          from: 'draft',
          to: 'pending_approval',
          actor: 'planner@adboard.test',
        },
      ],
    },
    {
      id: 'cmp_seed_approved',
      name: 'Verde Mobile Always-On',
      advertiser: 'Verde Mobile',
      budgetCents: 3_000_000,
      startDate: '2026-04-01',
      endDate: '2026-04-30',
      status: 'approved',
      createdBy: 'planner@adboard.test',
      createdAt: SEED_AT,
      updatedAt: '2026-01-11T10:15:00.000Z',
      flights: [
        {
          id: 'flt_seed_003',
          screenId: 'scr_mall_02',
          startDate: '2026-04-05',
          endDate: '2026-04-18',
          dailyBudgetCents: 52000,
          createdAt: SEED_AT,
        },
      ],
      history: [
        {
          at: SEED_AT,
          event: 'create',
          from: null,
          to: 'draft',
          actor: 'planner@adboard.test',
        },
        {
          at: '2026-01-10T09:00:00.000Z',
          event: 'submit',
          from: 'draft',
          to: 'pending_approval',
          actor: 'planner@adboard.test',
        },
        {
          at: '2026-01-11T10:15:00.000Z',
          event: 'approve',
          from: 'pending_approval',
          to: 'approved',
          actor: 'reviewer@adboard.test',
        },
      ],
    },
    {
      id: 'cmp_seed_live',
      name: 'Atlas Audio Roadshow',
      advertiser: 'Atlas Audio',
      budgetCents: 1_800_000,
      startDate: '2026-02-01',
      endDate: '2026-02-28',
      status: 'live',
      createdBy: 'planner@adboard.test',
      createdAt: SEED_AT,
      updatedAt: '2026-01-20T16:45:00.000Z',
      publishedAt: '2026-01-20T16:45:00.000Z',
      flights: [
        {
          id: 'flt_seed_004',
          screenId: 'scr_gym_01',
          startDate: '2026-02-03',
          endDate: '2026-02-17',
          dailyBudgetCents: 60000,
          createdAt: SEED_AT,
        },
      ],
      history: [
        {
          at: SEED_AT,
          event: 'create',
          from: null,
          to: 'draft',
          actor: 'planner@adboard.test',
        },
        {
          at: '2026-01-15T09:00:00.000Z',
          event: 'submit',
          from: 'draft',
          to: 'pending_approval',
          actor: 'planner@adboard.test',
        },
        {
          at: '2026-01-16T09:00:00.000Z',
          event: 'approve',
          from: 'pending_approval',
          to: 'approved',
          actor: 'reviewer@adboard.test',
        },
        {
          at: '2026-01-20T16:45:00.000Z',
          event: 'publish',
          from: 'approved',
          to: 'live',
          actor: 'reviewer@adboard.test',
        },
      ],
    },
  ];

  return {
    version: 1,
    screens,
    campaigns,
    sequences: { campaign: 0, flight: 0 },
  };
}
