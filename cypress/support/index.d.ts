import type { Campaign, CampaignPayload, FlightPayload, Role } from './types';

declare global {
  namespace Cypress {
    interface Chainable {
      resetDb(): Chainable<{ ok: boolean; screens: number; campaigns: number }>;
      seedCampaign(payload?: Partial<CampaignPayload>): Chainable<Campaign>;
      apiCreateCampaign(payload?: Partial<CampaignPayload>): Chainable<Campaign>;
      apiAddFlight(campaignId: string, payload: FlightPayload): Chainable<Campaign>;
      loginAs(role: Role): Chainable<void>;
      expectFieldError(field: string, message: string): Chainable<JQuery<HTMLElement>>;
    }

    interface TestConfigOverrides {
      tags?: string | string[];
    }

    interface SuiteConfigOverrides {
      tags?: string | string[];
    }
  }
}

export {};
