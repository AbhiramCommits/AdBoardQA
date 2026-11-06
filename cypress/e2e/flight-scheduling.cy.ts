import { flightSchedulerPage } from '../support/pages/FlightSchedulerPage';

describe('Flight scheduling', () => {
  beforeEach(() => {
    cy.resetDb();
    cy.seedCampaign().then((campaign) => {
      cy.wrap(campaign.id).as('campaignId');
    });
  });

  it(
    'books a flight and computes cost and impressions',
    { tags: ['@smoke'] },
    () => {
      cy.get<string>('@campaignId').then((campaignId) => {
        flightSchedulerPage
          .visit(campaignId)
          .expectStatus('draft')
          .addFlight({
            screenId: 'scr_airport_01',
            startDate: '2026-08-03',
            endDate: '2026-08-10',
            dailyBudgetDollars: '450',
          })
          .expectFlight('Skyline Arrivals')
          .expectFlightCount(1)
          .expectTotalCost('$3,600.00')
          .expectRemainingBudget('$4,400.00')
          .expectImpressions('336,000');
      });
    },
  );

  it(
    'rejects a flight that overflows the campaign budget',
    { tags: ['@regression'] },
    () => {
      cy.get<string>('@campaignId').then((campaignId) => {
        flightSchedulerPage
          .visit(campaignId)
          .addFlight({
            screenId: 'scr_mall_01',
            startDate: '2026-08-03',
            endDate: '2026-08-31',
            dailyBudgetDollars: '2000',
          })
          .expectFieldError(
            'dailyBudgetCents',
            'exceeds the remaining campaign budget',
          )
          .expectFlightCount(0)
          .expectNoFlights();
      });
    },
  );

  it(
    'rejects overlapping dates for the same screen and campaign',
    { tags: ['@regression'] },
    () => {
      cy.get<string>('@campaignId').then((campaignId) => {
        flightSchedulerPage
          .visit(campaignId)
          .addFlight({
            screenId: 'scr_airport_01',
            startDate: '2026-08-03',
            endDate: '2026-08-10',
            dailyBudgetDollars: '450',
          })
          .expectFlightCount(1)
          .addFlight({
            screenId: 'scr_airport_01',
            startDate: '2026-08-05',
            endDate: '2026-08-12',
            dailyBudgetDollars: '300',
          })
          .expectFieldError('startDate', 'already booked on overlapping dates')
          .expectFlightCount(1);
      });
    },
  );

  it(
    'deletes a flight and recomputes the totals',
    { tags: ['@regression'] },
    () => {
      cy.get<string>('@campaignId').then((campaignId) => {
        flightSchedulerPage
          .visit(campaignId)
          .addFlight({
            screenId: 'scr_airport_01',
            startDate: '2026-08-03',
            endDate: '2026-08-10',
            dailyBudgetDollars: '450',
          })
          .addFlight({
            screenId: 'scr_mall_01',
            startDate: '2026-08-12',
            endDate: '2026-08-15',
            dailyBudgetDollars: '500',
          })
          .expectFlightCount(2)
          .expectTotalCost('$5,600.00')
          .expectRemainingBudget('$2,400.00')
          .deleteFlight('Skyline Arrivals')
          .expectFlightCount(1)
          .expectTotalCost('$2,000.00')
          .expectRemainingBudget('$6,000.00')
          .expectImpressions('232,000');
      });
    },
  );
});
