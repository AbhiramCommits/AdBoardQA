import type { CampaignStatus } from '../types';

/** Page object for the approval / publish panel (steps 3 and 4 of the flow). */
export class ApprovalPage {
  visit(campaignId: string): this {
    cy.visit(`/#/campaigns/${campaignId}/review`);
    cy.get('[data-cy="approval-actions"]').should('be.visible');
    return this;
  }

  expectStatus(status: CampaignStatus): this {
    cy.get('[data-cy="campaign-status"]').should('have.attr', 'data-status', status);
    return this;
  }

  expectTitle(title: string): this {
    cy.get('[data-cy="campaign-title"]').should('have.text', title);
    return this;
  }

  clickSubmit(): this {
    cy.get('[data-cy="submit-approval"]').click();
    return this;
  }

  submitForApproval(): this {
    this.clickSubmit();
    this.expectStatus('pending_approval');
    return this;
  }

  typeReviewer(reviewer: string): this {
    cy.get('[data-cy="reviewer-input"]').clear().type(reviewer);
    return this;
  }

  clickApprove(): this {
    cy.get('[data-cy="approve"]').click();
    return this;
  }

  approve(reviewer?: string): this {
    if (reviewer) {
      this.typeReviewer(reviewer);
    }
    this.clickApprove();
    this.expectStatus('approved');
    return this;
  }

  typeRejectionReason(reason: string): this {
    cy.get('[data-cy="reject-reason"]').clear().type(reason);
    return this;
  }

  clickReject(): this {
    cy.get('[data-cy="reject"]').click();
    return this;
  }

  reject(reason: string, reviewer?: string): this {
    if (reviewer) {
      this.typeReviewer(reviewer);
    }
    this.typeRejectionReason(reason);
    this.clickReject();
    this.expectStatus('draft');
    return this;
  }

  expectRejection(reason: string): this {
    cy.get('[data-cy="last-rejection"]').should('contain.text', reason);
    return this;
  }

  publish(): this {
    cy.get('[data-cy="publish"]').click();
    this.expectStatus('live');
    return this;
  }

  expectLive(): this {
    cy.get('[data-cy="live-banner"]').should('contain.text', 'live');
    return this;
  }

  expectFieldError(field: string, message: string): this {
    cy.expectFieldError(field, message);
    return this;
  }
}

export const approvalPage = new ApprovalPage();
