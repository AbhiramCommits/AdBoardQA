import { approvalPage } from '../support/pages/ApprovalPage';
import { campaignBuilderPage } from '../support/pages/CampaignBuilderPage';
import { campaignListPage } from '../support/pages/CampaignListPage';
import { flightSchedulerPage } from '../support/pages/FlightSchedulerPage';

const CAMPAIGN_NAME = 'End-to-End DOOH Launch';

describe('End-to-end publish journey', () => {
  it(
    'walks create, schedule, approve and publish to a live campaign',
    { tags: ['@smoke'] },
    () => {
      cy.resetDb();
      campaignListPage.visit().startNewCampaign();

      cy.intercept('POST', '/api/campaigns').as('createCampaign');
      campaignBuilderPage.create({
        name: CAMPAIGN_NAME,
        advertiser: 'Meridian Mobility',
        budgetDollars: '8000',
        startDate: '2026-08-01',
        endDate: '2026-08-31',
      });

      cy.wait('@createCampaign').then(({ response }) => {
        expect(response?.statusCode).to.eq(201);
        cy.wrap(response?.body.id as string).as('campaignId');
      });

      flightSchedulerPage
        .expectTitle(CAMPAIGN_NAME)
        .expectStatus('draft')
        .addFlight({
          screenId: 'scr_airport_01',
          startDate: '2026-08-03',
          endDate: '2026-08-10',
          dailyBudgetDollars: '450',
        })
        .expectFlightCount(1)
        .expectTotalCost('$3,600.00')
        .continueToReview();

      approvalPage
        .expectStatus('draft')
        .submitForApproval()
        .approve('reviewer@adboard.test')
        .publish()
        .expectStatus('live')
        .expectLive();

      cy.get<string>('@campaignId').then((campaignId) => {
        cy.request(`/api/campaigns/${campaignId}`).then((response) => {
          expect(response.status).to.eq(200);
          expect(response.body.status).to.eq('live');
          expect(response.body.flights).to.have.length(1);
          expect(response.body.totals.bookedBudgetCents).to.eq(360000);
          expect(response.body.publishedAt).to.be.a('string');
        });
      });

      campaignListPage
        .visit()
        .expectCampaign(CAMPAIGN_NAME)
        .expectStatus(CAMPAIGN_NAME, 'live');
    },
  );
});
