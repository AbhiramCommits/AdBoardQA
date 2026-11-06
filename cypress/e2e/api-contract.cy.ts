import { assertSchema, schemas } from '../support/contracts';
import { approvalPage } from '../support/pages/ApprovalPage';
import { campaignBuilderPage } from '../support/pages/CampaignBuilderPage';
import { campaignListPage } from '../support/pages/CampaignListPage';
import { flightSchedulerPage } from '../support/pages/FlightSchedulerPage';
import type { Campaign } from '../support/types';

const FLIGHT = {
  screenId: 'scr_mall_01',
  startDate: '2026-08-05',
  endDate: '2026-08-09',
  dailyBudgetCents: 40000,
};

describe('REST contract', () => {
  it(
    'serves screens, campaign list and campaign detail with the documented schema',
    { tags: ['@regression'] },
    () => {
      cy.resetDb();
      cy.intercept('GET', '/api/screens').as('screens');
      cy.intercept('GET', '/api/campaigns').as('campaigns');

      campaignListPage.visit();
      cy.wait('@campaigns').then(({ request, response }) => {
        expect(request.method).to.eq('GET');
        expect(request.url).to.match(/\/api\/campaigns$/);
        expect(response?.statusCode).to.eq(200);
        assertSchema(response?.body, schemas.campaignList, 'GET /api/campaigns');
      });

      cy.intercept('GET', '/api/campaigns/cmp_seed_draft').as('campaignDetail');
      campaignListPage.openFlights('Kite Travel Late Summer');
      cy.wait('@campaignDetail').then(({ request, response }) => {
        expect(request.method).to.eq('GET');
        expect(request.url).to.match(/\/api\/campaigns\/cmp_seed_draft$/);
        expect(response?.statusCode).to.eq(200);
        assertSchema(response?.body, schemas.campaignDetail, 'GET /api/campaigns/:id');
        expect(response?.body.status).to.eq('draft');
      });

      cy.wait('@screens').then(({ request, response }) => {
        expect(request.method).to.eq('GET');
        expect(request.url).to.match(/\/api\/screens$/);
        expect(response?.statusCode).to.eq(200);
        assertSchema(response?.body, schemas.screenList, 'GET /api/screens');
      });
    },
  );

  it(
    'returns 201 for a valid create and 422 with the error envelope for invalid input',
    { tags: ['@regression'] },
    () => {
      cy.resetDb();
      campaignBuilderPage.visit();
      cy.intercept('POST', '/api/campaigns').as('create');

      campaignBuilderPage.create({
        name: 'Contract Campaign',
        advertiser: 'Contract Co',
        budgetDollars: '8000',
        startDate: '2026-08-01',
        endDate: '2026-08-31',
      });

      cy.wait('@create').then(({ request, response }) => {
        expect(request.method).to.eq('POST');
        expect(request.url).to.match(/\/api\/campaigns$/);
        assertSchema(request.body, schemas.createCampaignRequest, 'POST /api/campaigns body');
        expect(request.body.name).to.eq('Contract Campaign');
        expect(request.body.budgetCents).to.eq(800000);
        expect(response?.statusCode).to.eq(201);
        assertSchema(response?.body, schemas.campaignDetail, 'POST /api/campaigns response');
        expect(response?.body.status).to.eq('draft');
      });

      campaignBuilderPage.visit();
      campaignBuilderPage
        .fill({
          advertiser: 'Contract Co',
          budgetDollars: '8000',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
        })
        .submit();

      cy.wait('@create').then(({ request, response }) => {
        expect(request.body.name).to.eq('');
        expect(response?.statusCode).to.eq(422);
        assertSchema(response?.body, schemas.error, 'POST /api/campaigns 422');
        expect(response?.body.error.code).to.eq('NAME_REQUIRED');
        expect(response?.body.error.field).to.eq('name');
      });
    },
  );

  it(
    'books and deletes flights with the documented request and response shapes',
    { tags: ['@regression'] },
    () => {
      cy.resetDb();
      cy.seedCampaign().then((campaign) => {
        cy.wrap(campaign).as('campaign');
      });
      cy.intercept('POST', '/api/campaigns/**/flights').as('addFlight');
      cy.intercept('DELETE', '/api/campaigns/**/flights/*').as('deleteFlight');

      cy.get<Campaign>('@campaign').then((campaign) => {
        flightSchedulerPage.visit(campaign.id).addFlight({
          screenId: 'scr_airport_01',
          startDate: '2026-08-03',
          endDate: '2026-08-10',
          dailyBudgetDollars: '450',
        });
      });

      cy.wait('@addFlight').then(({ request, response }) => {
        expect(request.method).to.eq('POST');
        expect(request.url).to.match(/\/api\/campaigns\/[^/]+\/flights$/);
        assertSchema(request.body, schemas.flightRequest, 'POST flights body');
        expect(request.body.dailyBudgetCents).to.eq(45000);
        expect(response?.statusCode).to.eq(201);
        assertSchema(response?.body, schemas.campaignDetail, 'POST flights response');
        expect(response?.body.flights).to.have.length(1);
      });

      flightSchedulerPage.deleteFlight('Skyline Arrivals');
      cy.wait('@deleteFlight').then(({ request, response }) => {
        expect(request.method).to.eq('DELETE');
        expect(request.url).to.match(/\/api\/campaigns\/[^/]+\/flights\/[^/]+$/);
        expect(response?.statusCode).to.eq(200);
        assertSchema(response?.body, schemas.deleteResult, 'DELETE flight response');
        expect(response?.body.campaign.flights).to.have.length(0);
      });
    },
  );

  it(
    'contracts submit, approve and publish transitions',
    { tags: ['@regression'] },
    () => {
      cy.resetDb();
      cy.seedCampaign().then((campaign) => {
        cy.apiAddFlight(campaign.id, FLIGHT);
        cy.wrap(campaign).as('campaign');
      });
      cy.intercept('POST', '/api/campaigns/**/submit').as('submit');
      cy.intercept('POST', '/api/campaigns/**/approve').as('approve');
      cy.intercept('POST', '/api/campaigns/**/publish').as('publish');

      cy.get<Campaign>('@campaign').then((campaign) => {
        approvalPage.visit(campaign.id).submitForApproval();
      });

      cy.wait('@submit').then(({ request, response }) => {
        expect(request.method).to.eq('POST');
        expect(request.url).to.match(/\/submit$/);
        expect(response?.statusCode).to.eq(200);
        assertSchema(response?.body, schemas.campaignDetail, 'submit response');
        expect(response?.body.status).to.eq('pending_approval');
      });

      approvalPage.approve('reviewer@adboard.test');
      cy.wait('@approve').then(({ request, response }) => {
        expect(request.method).to.eq('POST');
        expect(request.url).to.match(/\/approve$/);
        expect(request.headers['x-reviewer']).to.eq('reviewer@adboard.test');
        assertSchema(request.body, schemas.approveRequest, 'approve body');
        expect(response?.statusCode).to.eq(200);
        assertSchema(response?.body, schemas.campaignDetail, 'approve response');
        expect(response?.body.status).to.eq('approved');
      });

      approvalPage.publish();
      cy.wait('@publish').then(({ request, response }) => {
        expect(request.method).to.eq('POST');
        expect(request.url).to.match(/\/publish$/);
        expect(response?.statusCode).to.eq(200);
        assertSchema(response?.body, schemas.campaignDetail, 'publish response');
        expect(response?.body.status).to.eq('live');
      });
    },
  );

  it(
    'contracts rejection, including the 422 reason validation',
    { tags: ['@regression'] },
    () => {
      cy.resetDb();
      cy.seedCampaign().then((campaign) => {
        cy.apiAddFlight(campaign.id, FLIGHT);
        cy.wrap(campaign).as('campaign');
      });
      cy.intercept('POST', '/api/campaigns/**/reject').as('reject');

      cy.get<Campaign>('@campaign').then((campaign) => {
        approvalPage.visit(campaign.id).submitForApproval();
      });

      approvalPage.clickReject();
      cy.wait('@reject').then(({ request, response }) => {
        expect(request.method).to.eq('POST');
        expect(response?.statusCode).to.eq(422);
        assertSchema(response?.body, schemas.error, 'reject 422');
        expect(response?.body.error.field).to.eq('reason');
      });

      approvalPage.typeRejectionReason('Creative needs a legal review').clickReject();
      cy.wait('@reject').then(({ request, response }) => {
        assertSchema(request.body, schemas.rejectRequest, 'reject body');
        expect(request.body.reason).to.eq('Creative needs a legal review');
        expect(response?.statusCode).to.eq(200);
        assertSchema(response?.body, schemas.campaignDetail, 'reject response');
        expect(response?.body.status).to.eq('draft');
        expect(response?.body.lastRejection.reason).to.eq('Creative needs a legal review');
      });
    },
  );

  it(
    'returns 200 for reset and a 409 error envelope for an illegal transition',
    { tags: ['@regression'] },
    () => {
      cy.request({ method: 'POST', url: '/api/test/reset' }).then((response) => {
        expect(response.status).to.eq(200);
        assertSchema(response.body, schemas.resetResult, 'POST /api/test/reset');
      });

      cy.request({
        method: 'POST',
        url: '/api/campaigns/cmp_seed_draft/publish',
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(409);
        assertSchema(response.body, schemas.error, 'illegal publish 409');
        expect(response.body.error.code).to.eq('INVALID_TRANSITION');
        expect(response.body.error.field).to.eq('status');
      });
    },
  );
});
