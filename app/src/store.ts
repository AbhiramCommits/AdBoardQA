import fs from 'node:fs';
import path from 'node:path';
import {
  computeCampaignTotals,
  computeFlightMetrics,
  daysInclusive,
  findOverlap,
  flightCostCents,
  isEditableStatus,
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
  type FlightMetrics,
  type CampaignTotals,
  type Screen,
} from './domain/index.js';
import { conflict, fromValidationIssue, notFound } from './errors.js';
import { createSeedData, type DatabaseShape } from './seed.js';

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

export interface CampaignDetail extends Campaign {
  totals: CampaignTotals;
  flightMetrics: FlightMetrics[];
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

export interface TransitionMeta {
  reviewer?: string;
  reason?: string;
}

export interface StoreOptions {
  filePath?: string | null;
  data?: DatabaseShape;
}

export class Store {
  private data: DatabaseShape;
  private readonly filePath: string | null;

  constructor(options: StoreOptions = {}) {
    this.filePath = options.filePath ?? null;
    if (options.data) {
      this.data = structuredClone(options.data);
    } else if (this.filePath && fs.existsSync(this.filePath)) {
      this.data = this.readFromDisk();
    } else {
      this.data = createSeedData();
      this.save();
    }
  }

  reset(): { screens: number; campaigns: number } {
    this.data = createSeedData();
    this.save();
    return { screens: this.data.screens.length, campaigns: this.data.campaigns.length };
  }

  listScreens(): Screen[] {
    return structuredClone(this.data.screens);
  }

  getScreen(id: string): Screen | undefined {
    return this.data.screens.find((screen) => screen.id === id);
  }

  listCampaigns(): CampaignSummary[] {
    return this.data.campaigns.map((campaign) => {
      const totals = computeCampaignTotals(campaign, this.data.screens);
      return {
        id: campaign.id,
        name: campaign.name,
        advertiser: campaign.advertiser,
        budgetCents: campaign.budgetCents,
        startDate: campaign.startDate,
        endDate: campaign.endDate,
        status: campaign.status,
        flightCount: totals.flightCount,
        bookedBudgetCents: totals.bookedBudgetCents,
        updatedAt: campaign.updatedAt,
      };
    });
  }

  getCampaign(id: string): CampaignDetail {
    return this.toDetail(this.requireCampaign(id));
  }

  createCampaign(input: CreateCampaignInput, actor: string): CampaignDetail {
    const issue =
      validateCampaignName(input.name) ??
      validateAdvertiser(input.advertiser) ??
      validateCampaignBudget(input.budgetCents) ??
      validateCampaignWindow(input.startDate, input.endDate);
    if (issue) {
      throw fromValidationIssue(issue);
    }

    const now = new Date().toISOString();
    const id = `cmp_new_${++this.data.sequences.campaign}`;
    const campaign: Campaign = {
      id,
      name: input.name.trim(),
      advertiser: input.advertiser.trim(),
      budgetCents: input.budgetCents,
      startDate: input.startDate,
      endDate: input.endDate,
      status: 'draft',
      createdBy: actor,
      createdAt: now,
      updatedAt: now,
      flights: [],
      history: [{ at: now, event: 'create', from: null, to: 'draft', actor }],
    };
    this.data.campaigns.push(campaign);
    this.save();
    return this.toDetail(campaign);
  }

  addFlight(campaignId: string, input: CreateFlightInput, actor: string): CampaignDetail {
    const campaign = this.requireCampaign(campaignId);
    if (!isEditableStatus(campaign.status)) {
      throw conflict('CAMPAIGN_LOCKED', 'Flights can only be changed while the campaign is a draft');
    }

    const screen = this.getScreen(input.screenId);
    if (!screen) {
      throw fromValidationIssue({
        code: 'SCREEN_NOT_FOUND',
        message: 'Screen not found',
        field: 'screenId',
      });
    }

    const windowIssue = validateFlightWindow(input, campaign);
    if (windowIssue) {
      throw fromValidationIssue(windowIssue);
    }
    const budgetIssue = validateDailyBudget(input.dailyBudgetCents);
    if (budgetIssue) {
      throw fromValidationIssue(budgetIssue);
    }

    const overlap = findOverlap(campaign.flights, input);
    if (overlap) {
      throw fromValidationIssue({
        code: 'FLIGHT_OVERLAP',
        message: `Screen is already booked on overlapping dates (flight ${overlap.id})`,
        field: 'startDate',
      });
    }

    const days = daysInclusive(input.startDate, input.endDate);
    const existingBookedCents = campaign.flights.reduce(
      (total, flight) =>
        total + flightCostCents(flight.dailyBudgetCents, flight.startDate, flight.endDate),
      0,
    );
    const campaignBudgetIssue = validateFlightBudget(
      input.dailyBudgetCents,
      days,
      existingBookedCents,
      campaign.budgetCents,
    );
    if (campaignBudgetIssue) {
      throw fromValidationIssue(campaignBudgetIssue);
    }

    const now = new Date().toISOString();
    const flight: Flight = {
      id: `flt_new_${++this.data.sequences.flight}`,
      screenId: input.screenId,
      startDate: input.startDate,
      endDate: input.endDate,
      dailyBudgetCents: input.dailyBudgetCents,
      createdAt: now,
    };
    campaign.flights.push(flight);
    campaign.updatedAt = now;
    campaign.history.push({
      at: now,
      event: 'flight_added',
      from: campaign.status,
      to: campaign.status,
      actor,
      note: `${screen.name} ${input.startDate} to ${input.endDate}`,
    });
    this.save();
    return this.toDetail(campaign);
  }

  deleteFlight(campaignId: string, flightId: string, actor: string): CampaignDetail {
    const campaign = this.requireCampaign(campaignId);
    if (!isEditableStatus(campaign.status)) {
      throw conflict('CAMPAIGN_LOCKED', 'Flights can only be changed while the campaign is a draft');
    }
    const index = campaign.flights.findIndex((flight) => flight.id === flightId);
    if (index === -1) {
      throw notFound('Flight');
    }
    const [removed] = campaign.flights.splice(index, 1);
    const now = new Date().toISOString();
    campaign.updatedAt = now;
    campaign.history.push({
      at: now,
      event: 'flight_removed',
      from: campaign.status,
      to: campaign.status,
      actor,
      note: removed ? `Removed ${removed.id}` : undefined,
    });
    this.save();
    return this.toDetail(campaign);
  }

  transition(
    campaignId: string,
    event: CampaignEvent,
    actor: string,
    meta: TransitionMeta = {},
  ): CampaignDetail {
    const campaign = this.requireCampaign(campaignId);
    const from = campaign.status;
    const to = resolveTransition(from, event);
    if (!to) {
      throw conflict(
        'INVALID_TRANSITION',
        `Cannot ${event} a campaign while it is in ${from} status`,
      );
    }

    if (event === 'submit' && campaign.flights.length === 0) {
      throw fromValidationIssue({
        code: 'NO_FLIGHTS',
        message: 'Add at least one flight before submitting for approval',
        field: 'flights',
      });
    }
    if (event === 'approve' && !meta.reviewer) {
      throw fromValidationIssue({
        code: 'REVIEWER_REQUIRED',
        message: 'A reviewer is required to approve a campaign',
        field: 'reviewer',
      });
    }
    if (
      event === 'approve' &&
      meta.reviewer &&
      meta.reviewer.trim().toLowerCase() === campaign.createdBy.trim().toLowerCase()
    ) {
      throw conflict(
        'SELF_APPROVAL',
        'Reviewers cannot approve campaigns they created',
        'reviewer',
      );
    }
    if (event === 'reject' && (!meta.reason || meta.reason.trim().length === 0)) {
      throw fromValidationIssue({
        code: 'REJECTION_REASON_REQUIRED',
        message: 'A rejection reason is required',
        field: 'reason',
      });
    }

    const now = new Date().toISOString();
    campaign.status = to;
    campaign.updatedAt = now;
    if (event === 'approve') {
      campaign.history.push({
        at: now,
        event,
        from,
        to,
        actor,
        note: `Approved by ${meta.reviewer}`,
      });
    } else if (event === 'reject') {
      campaign.lastRejection = {
        reason: (meta.reason ?? '').trim(),
        reviewer: meta.reviewer ?? actor,
        at: now,
      };
      campaign.history.push({
        at: now,
        event,
        from,
        to,
        actor,
        note: campaign.lastRejection.reason,
      });
    } else {
      campaign.history.push({ at: now, event, from, to, actor });
    }
    if (event === 'publish') {
      campaign.publishedAt = now;
    }
    this.save();
    return this.toDetail(campaign);
  }

  private requireCampaign(id: string): Campaign {
    const campaign = this.data.campaigns.find((candidate) => candidate.id === id);
    if (!campaign) {
      throw notFound('Campaign');
    }
    return campaign;
  }

  private toDetail(campaign: Campaign): CampaignDetail {
    const totals = computeCampaignTotals(campaign, this.data.screens);
    const flightMetrics = campaign.flights.flatMap((flight) => {
      const screen = this.getScreen(flight.screenId);
      return screen ? [computeFlightMetrics(flight, screen)] : [];
    });
    return structuredClone({ ...campaign, totals, flightMetrics });
  }

  private readFromDisk(): DatabaseShape {
    const raw = fs.readFileSync(this.filePath ?? '', 'utf8');
    const parsed = JSON.parse(raw) as DatabaseShape;
    if (!Array.isArray(parsed.screens) || !Array.isArray(parsed.campaigns)) {
      throw new Error(`Invalid database file at ${this.filePath ?? ''}`);
    }
    return parsed;
  }

  private save(): void {
    if (!this.filePath) {
      return;
    }
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryPath, this.filePath);
  }
}
