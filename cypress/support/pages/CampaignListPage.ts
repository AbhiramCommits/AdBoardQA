import type { CampaignStatus } from '../types';

/**
 * Page object for the campaign list. All selectors live here so specs stay
 * declarative and survive markup changes.
 */
export class CampaignListPage {
  visit(): this {
    cy.visit('/#/campaigns');
    cy.get('[data-cy="campaign-row"]').should('have.length.at.least', 1);
    return this;
  }

  row(name: string): Cypress.Chainable<JQuery<HTMLElement>> {
    return cy.contains('[data-cy="campaign-row"]', name);
  }

  expectCampaign(name: string): this {
    this.row(name).should('be.visible');
    return this;
  }

  expectStatus(name: string, status: CampaignStatus): this {
    this.row(name)
      .find('[data-cy="campaign-status"]')
      .should('have.attr', 'data-status', status);
    return this;
  }

  expectCampaignCount(count: number): this {
    cy.get('[data-cy="campaign-row"]').should('have.length', count);
    return this;
  }

  openFlights(name: string): this {
    this.row(name).find('[data-cy="open-flights"]').click();
    return this;
  }

  openReview(name: string): this {
    this.row(name).find('[data-cy="open-review"]').click();
    return this;
  }

  startNewCampaign(): this {
    cy.get('[data-cy="new-campaign"]').click();
    return this;
  }
}

export const campaignListPage = new CampaignListPage();
