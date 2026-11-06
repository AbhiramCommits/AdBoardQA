import { approvalPage } from '../support/pages/ApprovalPage';
import { campaignBuilderPage } from '../support/pages/CampaignBuilderPage';
import { flightSchedulerPage } from '../support/pages/FlightSchedulerPage';
import type { Campaign } from '../support/types';

const BASE_FLIGHT = {
  screenId: 'scr_mall_01',
  startDate: '2026-08-05',
  endDate: '2026-08-09',
  dailyBudgetCents: 40000,
};

describe('Exploratory defect regressions', () => {
  beforeEach(() => {
    cy.resetDb();
  });

  it(
    'ADQA-001: rejects a negative daily flight budget',
    { tags: ['@regression'] },
    () => {
      cy.seedCampaign().then((campaign) => {
        flightSchedulerPage
          .visit(campaign.id)
          .addFlight({
            screenId: 'scr_airport_01',
            startDate: '2026-08-03',
            endDate: '2026-08-10',
            dailyBudgetDollars: '-500',
          })
          .expectFieldError('dailyBudgetCents', 'positive whole number of cents')
          .expectFlightCount(0);
      });
    },
  );

  it(
    'ADQA-002: accepts a same-day flight',
    { tags: ['@regression'] },
    () => {
      cy.seedCampaign().then((campaign) => {
        flightSchedulerPage
          .visit(campaign.id)
          .addFlight({
            screenId: 'scr_airport_01',
            startDate: '2026-08-05',
            endDate: '2026-08-05',
            dailyBudgetDollars: '100',
          })
          .expectFlight('Skyline Arrivals')
          .expectFlightCount(1)
          .expectFlightCost('Skyline Arrivals', '$100.00')
          .expectTotalCost('$100.00');
      });
    },
  );

  it(
    'ADQA-003: accepts adjacent, non-overlapping flights on one screen',
    { tags: ['@regression'] },
    () => {
      cy.seedCampaign().then((campaign) => {
        flightSchedulerPage
          .visit(campaign.id)
          .addFlight({
            screenId: 'scr_airport_01',
            startDate: '2026-08-03',
            endDate: '2026-08-10',
            dailyBudgetDollars: '100',
          })
          .addFlight({
            screenId: 'scr_airport_01',
            startDate: '2026-08-11',
            endDate: '2026-08-15',
            dailyBudgetDollars: '100',
          })
          .expectFlightCount(2);
      });
    },
  );

  it(
    'ADQA-004: rejects a 300-character campaign name',
    { tags: ['@regression'] },
    () => {
      campaignBuilderPage.visit().create({
        name: 'N'.repeat(300),
        advertiser: 'Long Name Co',
        budgetDollars: '8000',
        startDate: '2026-08-01',
        endDate: '2026-08-31',
      });

      campaignBuilderPage.expectFieldError('name', '120 characters or fewer');
    },
  );

  it(
    'ADQA-005: double-clicking create sends exactly one POST',
    { tags: ['@regression'] },
    () => {
      let createCalls = 0;
      cy.fixture('campaign-detail.json').then((campaign) => {
        campaignBuilderPage.visit();
        cy.intercept({ method: 'POST', url: '/api/campaigns' }, (request) => {
          createCalls += 1;
          request.reply({ delay: 600, statusCode: 201, body: campaign });
        }).as('slowCreate');

        campaignBuilderPage
          .fill({
            name: 'Double Click Campaign',
            advertiser: 'Click Co',
            budgetDollars: '8000',
            startDate: '2026-08-01',
            endDate: '2026-08-31',
          })
          .doubleClickCreate();

        cy.wait('@slowCreate');
        cy.then(() => {
          expect(createCalls).to.eq(1);
        });
      });
    },
  );

  it(
    'ADQA-006: refuses to delete a flight after approval or publish',
    { tags: ['@regression'] },
    () => {
      for (const campaignId of ['cmp_seed_approved', 'cmp_seed_live']) {
        cy.request(`/api/campaigns/${campaignId}`).then((response) => {
          const flightId = response.body.flights[0].id as string;
          cy.request({
            method: 'DELETE',
            url: `/api/campaigns/${campaignId}/flights/${flightId}`,
            failOnStatusCode: false,
          }).then((deleteResponse) => {
            expect(deleteResponse.status).to.eq(409);
            expect(deleteResponse.body.error.code).to.eq('CAMPAIGN_LOCKED');
            cy.request(`/api/campaigns/${campaignId}`)
              .its('body.flights')
              .should('have.length', 1);
          });
        });
      }
    },
  );

  it(
    'ADQA-007: shows cent-accurate flight costs and totals',
    { tags: ['@regression'] },
    () => {
      cy.seedCampaign({ name: 'Cent Precision', budgetCents: 800000 }).then((campaign) => {
        cy.apiAddFlight(campaign.id, {
          screenId: 'scr_airport_01',
          startDate: '2026-08-03',
          endDate: '2026-08-05',
          dailyBudgetCents: 10001,
        });

        flightSchedulerPage
          .visit(campaign.id)
          .expectFlightCost('Skyline Arrivals', '$300.03')
          .expectTotalCost('$300.03')
          .expectRemainingBudget('$7,699.97');
      });
    },
  );

  it(
    'ADQA-011: refuses a reviewer approving their own campaign',
    { tags: ['@regression'] },
    () => {
      cy.seedCampaign().then((campaign) => {
        cy.apiAddFlight(campaign.id, BASE_FLIGHT);

        approvalPage
          .visit(campaign.id)
          .submitForApproval()
          .typeReviewer('planner@adboard.test')
          .clickApprove();

        approvalPage
          .expectConflict('cannot approve campaigns they created')
          .expectStatus('pending_approval');

        cy.request(`/api/campaigns/${campaign.id}`)
          .its('body.status')
          .should('eq', 'pending_approval');
      });
    },
  );
});
