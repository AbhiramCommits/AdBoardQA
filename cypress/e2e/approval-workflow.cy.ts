import { approvalPage } from '../support/pages/ApprovalPage';
import type { Campaign } from '../support/types';

const FLIGHT = {
  screenId: 'scr_mall_01',
  startDate: '2026-08-05',
  endDate: '2026-08-09',
  dailyBudgetCents: 40000,
};

describe('Approval workflow', () => {
  beforeEach(() => {
    cy.resetDb();
    cy.seedCampaign().then((campaign) => {
      cy.apiAddFlight(campaign.id, FLIGHT);
      cy.wrap(campaign).as('campaign');
    });
  });

  it(
    'submits and approves a campaign as a reviewer',
    { tags: ['@smoke'] },
    () => {
      cy.get<Campaign>('@campaign').then((campaign) => {
        approvalPage
          .visit(campaign.id)
          .expectStatus('draft')
          .submitForApproval()
          .approve();

        cy.request(`/api/campaigns/${campaign.id}`)
          .its('body.status')
          .should('eq', 'approved');
      });
    },
  );

  it(
    'rejects with a reason and returns the campaign to draft',
    { tags: ['@regression'] },
    () => {
      cy.get<Campaign>('@campaign').then((campaign) => {
        approvalPage
          .visit(campaign.id)
          .submitForApproval()
          .reject('Budget is too high for the Q3 window')
          .expectRejection('Budget is too high for the Q3 window');

        cy.request(`/api/campaigns/${campaign.id}`).then((response) => {
          expect(response.body.status).to.eq('draft');
          expect(response.body.lastRejection.reason).to.eq(
            'Budget is too high for the Q3 window',
          );
          expect(response.body.lastRejection.reviewer).to.eq('reviewer@adboard.test');
        });
      });
    },
  );

  it(
    'rejects a missing rejection reason with a field error',
    { tags: ['@regression'] },
    () => {
      cy.get<Campaign>('@campaign').then((campaign) => {
        approvalPage
          .visit(campaign.id)
          .submitForApproval()
          .clickReject()
          .expectFieldError('reason', 'A rejection reason is required')
          .expectStatus('pending_approval');
      });
    },
  );

  it(
    'requires a reviewer header to approve',
    { tags: ['@regression'] },
    () => {
      cy.get<Campaign>('@campaign').then((campaign) => {
        cy.request({
          method: 'POST',
          url: `/api/campaigns/${campaign.id}/submit`,
        }).its('status').should('eq', 200);

        cy.request({
          method: 'POST',
          url: `/api/campaigns/${campaign.id}/approve`,
          body: {},
          failOnStatusCode: false,
        }).then((response) => {
          expect(response.status).to.eq(422);
          expect(response.body.error.code).to.eq('REVIEWER_REQUIRED');
          expect(response.body.error.field).to.eq('reviewer');
        });
      });
    },
  );

  it(
    'cannot submit a campaign with no flights',
    { tags: ['@regression'] },
    () => {
      approvalPage
        .visit('cmp_seed_draft')
        .clickSubmit()
        .expectFieldError('flights', 'Add at least one flight before submitting for approval')
        .expectStatus('draft');
    },
  );

  it(
    'publishes an approved campaign to live',
    { tags: ['@regression'] },
    () => {
      approvalPage
        .visit('cmp_seed_approved')
        .expectStatus('approved')
        .publish()
        .expectLive();

      cy.request('/api/campaigns/cmp_seed_approved')
        .its('body.status')
        .should('eq', 'live');
    },
  );

  it(
    'refuses every illegal status transition with 409',
    { tags: ['@regression'] },
    () => {
      const illegalTransitions: Array<[string, string]> = [
        ['cmp_seed_draft', 'approve'],
        ['cmp_seed_draft', 'reject'],
        ['cmp_seed_draft', 'publish'],
        ['cmp_seed_pending', 'submit'],
        ['cmp_seed_pending', 'publish'],
        ['cmp_seed_approved', 'submit'],
        ['cmp_seed_approved', 'approve'],
        ['cmp_seed_approved', 'reject'],
        ['cmp_seed_live', 'submit'],
        ['cmp_seed_live', 'approve'],
        ['cmp_seed_live', 'reject'],
        ['cmp_seed_live', 'publish'],
      ];

      for (const [campaignId, event] of illegalTransitions) {
        cy.request({
          method: 'POST',
          url: `/api/campaigns/${campaignId}/${event}`,
          body: { reason: 'attempted illegal transition' },
          failOnStatusCode: false,
        }).then((response) => {
          expect(response.status, `${campaignId} ${event}`).to.eq(409);
          expect(response.body.error.code).to.eq('INVALID_TRANSITION');
        });
      }

      cy.request('/api/campaigns/cmp_seed_draft').its('body.status').should('eq', 'draft');
      cy.request('/api/campaigns/cmp_seed_pending')
        .its('body.status')
        .should('eq', 'pending_approval');
      cy.request('/api/campaigns/cmp_seed_approved')
        .its('body.status')
        .should('eq', 'approved');
      cy.request('/api/campaigns/cmp_seed_live').its('body.status').should('eq', 'live');
    },
  );
});
