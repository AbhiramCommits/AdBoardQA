import { approvalPage } from '../support/pages/ApprovalPage';
import { campaignBuilderPage } from '../support/pages/CampaignBuilderPage';
import { flightSchedulerPage } from '../support/pages/FlightSchedulerPage';

const DRAFT = {
  name: 'Slow Lane Launch',
  advertiser: 'Slow Lane',
  budgetDollars: '8000',
  startDate: '2026-08-01',
  endDate: '2026-08-31',
};

describe('API failure simulation', () => {
  it(
    'ADQA-008: shows a retryable error banner when campaign creation returns 500',
    { tags: ['@regression'] },
    () => {
      let serverError: unknown;
      cy.fixture('api-responses.json').then((fixtures) => {
        serverError = fixtures.serverError;
      });

      cy.resetDb();
      campaignBuilderPage.visit();
      cy.then(() => {
        cy.intercept(
          { method: 'POST', url: '/api/campaigns', times: 1 },
          { statusCode: 500, body: serverError },
        ).as('createFailure');
      });

      campaignBuilderPage.create(DRAFT);
      cy.wait('@createFailure').its('response.statusCode').should('eq', 500);

      campaignBuilderPage.expectErrorBanner('Campaign could not be created');
      campaignBuilderPage.retryCreate();

      flightSchedulerPage.expectTitle(DRAFT.name).expectStatus('draft');
    },
  );

  it(
    'ADQA-009: shows an empty state with retry when the screens request fails at the network layer',
    { tags: ['@regression'] },
    () => {
      cy.resetDb();
      cy.seedCampaign().then((campaign) => {
        cy.wrap(campaign.id).as('campaignId');
      });
      let failScreens = true;
      cy.intercept({ method: 'GET', url: '/api/screens' }, (request) => {
        if (failScreens) {
          request.destroy();
        } else {
          request.continue();
        }
      }).as('screensFailure');

      cy.get<string>('@campaignId').then((campaignId) => {
        flightSchedulerPage.open(campaignId);
      });
      cy.wait('@screensFailure');

      flightSchedulerPage.expectScreensEmpty();
      cy.then(() => {
        failScreens = false;
      });
      flightSchedulerPage.retryScreens().expectScreenOptions(6);
    },
  );

  it(
    'ADQA-010: surfaces a conflict message when publishing returns 409',
    { tags: ['@regression'] },
    () => {
      let conflict: unknown;
      cy.fixture('api-responses.json').then((fixtures) => {
        conflict = fixtures.conflict;
      });

      cy.resetDb();
      cy.then(() => {
        cy.intercept(
          { method: 'POST', url: '/api/campaigns/**/publish', times: 1 },
          { statusCode: 409, body: conflict },
        ).as('publishConflict');
      });

      approvalPage.visit('cmp_seed_approved').clickPublish();
      cy.wait('@publishConflict').its('response.statusCode').should('eq', 409);

      approvalPage
        .expectConflict('Cannot publish a campaign while it is in draft status')
        .expectStatus('approved');
    },
  );

  it(
    'shows a loading state and disables submit while a delayed create is in flight',
    { tags: ['@regression'] },
    () => {
      cy.fixture('campaign-detail.json').then((campaign) => {
        cy.resetDb();
        campaignBuilderPage.visit();
        cy.intercept({ method: 'POST', url: '/api/campaigns' }, (request) => {
          request.reply({ delay: 1200, statusCode: 201, body: campaign });
        }).as('slowCreate');

        campaignBuilderPage.fill(DRAFT).submit();
        campaignBuilderPage.expectLoading().expectSubmitDisabled();

        cy.wait('@slowCreate').its('response.statusCode').should('eq', 201);
      });
    },
  );
});
