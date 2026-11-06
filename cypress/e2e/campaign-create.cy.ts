import { campaignBuilderPage } from '../support/pages/CampaignBuilderPage';
import { campaignListPage } from '../support/pages/CampaignListPage';
import { flightSchedulerPage } from '../support/pages/FlightSchedulerPage';

describe('Campaign creation', () => {
  beforeEach(() => {
    cy.resetDb();
    campaignListPage.visit();
  });

  it(
    'creates a campaign and opens the flight scheduler',
    { tags: ['@smoke'] },
    () => {
      cy.intercept('POST', '/api/campaigns').as('createCampaign');

      campaignListPage.startNewCampaign();
      campaignBuilderPage
        .expectFormVisible()
        .create({
          name: 'Harbor Light Summer Push',
          advertiser: 'Harbor Light',
          budgetDollars: '8000',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
        });

      cy.wait('@createCampaign').its('response.statusCode').should('eq', 201);
      flightSchedulerPage
        .expectTitle('Harbor Light Summer Push')
        .expectStatus('draft');

      campaignListPage
        .visit()
        .expectCampaign('Harbor Light Summer Push')
        .expectStatus('Harbor Light Summer Push', 'draft');
    },
  );

  it(
    'shows inline field errors for every required campaign field',
    { tags: ['@regression'] },
    () => {
      campaignListPage.startNewCampaign();

      campaignBuilderPage
        .expectFormVisible()
        .submit()
        .expectFieldError('name', 'Campaign name is required');

      campaignBuilderPage
        .fillField('name', 'Harbor Light Summer Push')
        .submit()
        .expectFieldError('advertiser', 'Advertiser is required');

      campaignBuilderPage
        .fillField('advertiser', 'Harbor Light')
        .submit()
        .expectFieldError('budgetCents', 'Budget must be a positive whole number of cents');

      campaignBuilderPage
        .fillField('budget', '8000')
        .submit()
        .expectFieldError('startDate', 'Dates must use YYYY-MM-DD');

      campaignBuilderPage
        .fillField('startDate', '2026-08-01')
        .submit()
        .expectFieldError('endDate', 'Dates must use YYYY-MM-DD');

      campaignBuilderPage
        .fillField('endDate', '2026-08-31')
        .submit();

      flightSchedulerPage.expectTitle('Harbor Light Summer Push');
    },
  );

  it(
    'rejects a campaign whose end date is before its start date',
    { tags: ['@regression'] },
    () => {
      campaignListPage.startNewCampaign();
      campaignBuilderPage
        .create({
          name: 'Backwards Window',
          advertiser: 'Time Travel Co',
          budgetDollars: '5000',
          startDate: '2026-08-31',
          endDate: '2026-08-01',
        })
        .expectFieldError('endDate', 'End date must be after start date');

      campaignBuilderPage.expectFormVisible();
      campaignListPage.visit().expectCampaignCount(4);
    },
  );

  it(
    'rejects a zero-dollar campaign budget',
    { tags: ['@regression'] },
    () => {
      campaignListPage.startNewCampaign();
      campaignBuilderPage
        .create({
          name: 'No Budget',
          advertiser: 'Empty Wallet',
          budgetDollars: '0',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
        })
        .expectFieldError('budgetCents', 'Budget must be a positive whole number of cents');
    },
  );
});
