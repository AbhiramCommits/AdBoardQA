export interface CampaignDraft {
  name?: string;
  advertiser?: string;
  budgetDollars?: string | number;
  startDate?: string;
  endDate?: string;
}

type BuilderField = 'name' | 'advertiser' | 'budget' | 'startDate' | 'endDate';

const FIELD_SELECTORS: Record<BuilderField, string> = {
  name: '[data-cy="name-input"]',
  advertiser: '[data-cy="advertiser-input"]',
  budget: '[data-cy="budget-input"]',
  startDate: '[data-cy="start-date-input"]',
  endDate: '[data-cy="end-date-input"]',
};

/** Page object for the campaign builder form (step 1 of the flow). */
export class CampaignBuilderPage {
  visit(): this {
    cy.visit('/#/campaigns/new');
    cy.get('[data-cy="campaign-form"]').should('be.visible');
    return this;
  }

  fillField(field: BuilderField, value: string | number): this {
    cy.get(FIELD_SELECTORS[field]).clear().type(String(value));
    return this;
  }

  fill(draft: CampaignDraft): this {
    if (draft.name !== undefined) {
      this.fillField('name', draft.name);
    }
    if (draft.advertiser !== undefined) {
      this.fillField('advertiser', draft.advertiser);
    }
    if (draft.budgetDollars !== undefined) {
      this.fillField('budget', draft.budgetDollars);
    }
    if (draft.startDate !== undefined) {
      this.fillField('startDate', draft.startDate);
    }
    if (draft.endDate !== undefined) {
      this.fillField('endDate', draft.endDate);
    }
    return this;
  }

  clear(): this {
    cy.get('[data-cy="campaign-form"] input').clear();
    return this;
  }

  submit(): this {
    cy.get('[data-cy="create-campaign"]').click();
    return this;
  }

  create(draft: CampaignDraft): this {
    return this.fill(draft).submit();
  }

  expectFieldError(field: string, message: string): this {
    cy.expectFieldError(field, message);
    return this;
  }

  expectFormVisible(): this {
    cy.get('[data-cy="campaign-form"]').should('be.visible');
    return this;
  }

  expectNoFormError(): this {
    cy.get('[data-cy="form-error"]').should('not.be.visible');
    return this;
  }
}

export const campaignBuilderPage = new CampaignBuilderPage();
