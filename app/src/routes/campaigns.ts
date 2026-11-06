import { Router, type Request, type Response } from 'express';
import type { CampaignEvent } from '../domain/index.js';
import type { CreateCampaignInput, CreateFlightInput, Store } from '../store.js';

const DEFAULT_ACTOR = 'planner@adboard.test';

function actorFrom(request: Request): string {
  return request.header('x-user')?.trim() || DEFAULT_ACTOR;
}

function reviewerFrom(request: Request, body: Record<string, unknown>): string | undefined {
  const header = request.header('x-reviewer')?.trim();
  if (header) {
    return header;
  }
  const bodyReviewer = body['reviewer'];
  return typeof bodyReviewer === 'string' && bodyReviewer.trim().length > 0
    ? bodyReviewer.trim()
    : undefined;
}

function stringField(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numberField(value: unknown): number {
  return typeof value === 'number' ? value : Number.NaN;
}

export function createCampaignsRouter(store: Store): Router {
  const router = Router();

  router.get('/', (_request, response) => {
    response.status(200).json({ campaigns: store.listCampaigns() });
  });

  router.post('/', (request, response) => {
    const body = request.body as Record<string, unknown>;
    const input: CreateCampaignInput = {
      name: stringField(body['name']),
      advertiser: stringField(body['advertiser']),
      budgetCents: numberField(body['budgetCents']),
      startDate: stringField(body['startDate']),
      endDate: stringField(body['endDate']),
    };
    const campaign = store.createCampaign(input, actorFrom(request));
    response.status(201).json(campaign);
  });

  router.get('/:id', (request, response) => {
    response.status(200).json(store.getCampaign(request.params['id'] ?? ''));
  });

  router.post('/:id/flights', (request, response) => {
    const body = request.body as Record<string, unknown>;
    const input: CreateFlightInput = {
      screenId: stringField(body['screenId']),
      startDate: stringField(body['startDate']),
      endDate: stringField(body['endDate']),
      dailyBudgetCents: numberField(body['dailyBudgetCents']),
    };
    const campaign = store.addFlight(request.params['id'] ?? '', input, actorFrom(request));
    response.status(201).json(campaign);
  });

  router.delete('/:id/flights/:flightId', (request, response) => {
    const flightId = request.params['flightId'] ?? '';
    const campaign = store.deleteFlight(
      request.params['id'] ?? '',
      flightId,
      actorFrom(request),
    );
    response.status(200).json({ deletedFlightId: flightId, campaign });
  });

  const action =
    (event: CampaignEvent) => (request: Request, response: Response): void => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const campaign = store.transition(request.params['id'] ?? '', event, actorFrom(request), {
        reviewer: reviewerFrom(request, body),
        reason: stringField(body['reason']),
      });
      response.status(200).json(campaign);
    };

  router.post('/:id/submit', action('submit'));
  router.post('/:id/approve', action('approve'));
  router.post('/:id/reject', action('reject'));
  router.post('/:id/publish', action('publish'));

  return router;
}
