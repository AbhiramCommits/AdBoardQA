import type { CampaignStatus } from '../types';

export interface FlightDraft {
  screenId: string;
  startDate: string;
  endDate: string;
  dailyBudgetDollars: string | number;
}

/** Page object for the flight scheduler (step 2 of the flow). */
export class FlightSchedulerPage {
  visit(campaignId: string): this {
    cy.visit(`/#/campaigns/${campaignId}/flights`);
    cy.get('[data-cy="flight-form"]').should('be.visible');
    return this;
  }

  /** Navigate without assuming the page rendered successfully (resilience tests). */
  open(campaignId: string): this {
    cy.visit(`/#/campaigns/${campaignId}/flights`);
    return this;
  }

  expectScreensEmpty(): this {
    cy.get('[data-cy="screens-empty"]').should('be.visible');
    return this;
  }

  retryScreens(): this {
    cy.get('[data-cy="retry-screens"]').click();
    return this;
  }

  expectScreenOptions(count: number): this {
    cy.get('[data-cy="screen-select"] option').should('have.length', count + 1);
    return this;
  }

  expectTitle(title: string): this {
    cy.get('[data-cy="campaign-title"]').should('have.text', title);
    return this;
  }

  expectStatus(status: CampaignStatus): this {
    cy.get('[data-cy="campaign-status"]').should('have.attr', 'data-status', status);
    return this;
  }

  selectScreen(screenId: string): this {
    cy.get('[data-cy="screen-select"]').select(screenId);
    return this;
  }

  fillFlight(flight: FlightDraft): this {
    this.selectScreen(flight.screenId);
    cy.get('[data-cy="flight-start-input"]').clear().type(flight.startDate);
    cy.get('[data-cy="flight-end-input"]').clear().type(flight.endDate);
    cy.get('[data-cy="daily-budget-input"]')
      .clear()
      .type(String(flight.dailyBudgetDollars));
    return this;
  }

  addFlight(flight: FlightDraft): this {
    this.fillFlight(flight);
    cy.get('[data-cy="add-flight"]').click();
    return this;
  }

  row(screenName: string): Cypress.Chainable<JQuery<HTMLElement>> {
    return cy.contains('[data-cy="flight-row"]', screenName);
  }

  expectFlight(screenName: string): this {
    this.row(screenName).should('be.visible');
    return this;
  }

  expectFlightCount(count: number): this {
    cy.get('[data-cy="flight-row"]').should('have.length', count);
    return this;
  }

  expectNoFlights(): this {
    cy.get('[data-cy="no-flights"]').should('be.visible');
    return this;
  }

  expectTotalCost(amount: string): this {
    cy.get('[data-cy="total-cost"]').should('have.text', amount);
    return this;
  }

  expectRemainingBudget(amount: string): this {
    cy.get('[data-cy="remaining-budget"]').should('have.text', amount);
    return this;
  }

  expectImpressions(count: string): this {
    cy.get('[data-cy="total-impressions"]').should('have.text', count);
    return this;
  }

  expectFieldError(field: string, message: string): this {
    cy.expectFieldError(field, message);
    return this;
  }

  deleteFlight(screenName: string): this {
    this.row(screenName).find('[data-cy="delete-flight"]').click();
    return this;
  }

  continueToReview(): this {
    cy.get('[data-cy="go-review"]').click();
    return this;
  }
}

export const flightSchedulerPage = new FlightSchedulerPage();
