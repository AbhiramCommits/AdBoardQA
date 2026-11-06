import type { Campaign, CampaignPayload, FlightPayload, Role } from './types';

const PLANNER = 'planner@adboard.test';

const USERS: Record<Role, string> = {
  planner: 'planner@adboard.test',
  reviewer: 'reviewer@adboard.test',
  admin: 'admin@adboard.test',
};

const DEFAULT_CAMPAIGN: CampaignPayload = {
  name: 'Harbor Light Summer Push',
  advertiser: 'Harbor Light',
  budgetCents: 800_000,
  startDate: '2026-08-01',
  endDate: '2026-08-31',
};

Cypress.Commands.add('resetDb', () => {
  return cy
    .request({ method: 'POST', url: '/api/test/reset' })
    .then((response) => {
      expect(response.status).to.eq(200);
      return response.body as { ok: boolean; screens: number; campaigns: number };
    });
});

Cypress.Commands.add('apiCreateCampaign', (payload: Partial<CampaignPayload> = {}) => {
  return cy
    .request({
      method: 'POST',
      url: '/api/campaigns',
      headers: { 'x-user': PLANNER },
      body: { ...DEFAULT_CAMPAIGN, ...payload },
    })
    .then((response) => {
      expect(response.status).to.eq(201);
      return response.body as Campaign;
    });
});

Cypress.Commands.add('seedCampaign', (payload: Partial<CampaignPayload> = {}) => {
  return cy.fixture<CampaignPayload>('campaign.json').then((fixture) => {
    return cy.apiCreateCampaign({ ...fixture, ...payload });
  });
});

Cypress.Commands.add('apiAddFlight', (campaignId: string, payload: FlightPayload) => {
  return cy
    .request({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/flights`,
      headers: { 'x-user': PLANNER },
      body: payload,
    })
    .then((response) => {
      expect(response.status).to.eq(201);
      return response.body as Campaign;
    });
});

Cypress.Commands.add('loginAs', (role: Role) => {
  const user = USERS[role];
  cy.visit('/', {
    onBeforeLoad(window) {
      window.localStorage.setItem('adboard.user', user);
      if (role === 'planner') {
        window.localStorage.removeItem('adboard.reviewer');
      } else {
        window.localStorage.setItem('adboard.reviewer', user);
      }
    },
  });
  cy.get('[data-cy="current-user"]').should('contain.text', user);
});

Cypress.Commands.add('expectFieldError', (field: string, message: string) => {
  return cy
    .get('[data-cy="form-error"]')
    .should('be.visible')
    .and('have.attr', 'data-field', field)
    .and('contain.text', message);
});
