import { ApiRequestError, api } from '../api';
import { dollarsToCents } from '../format';
import { clearFormError, errorMarkup, pageHeader, showFormError } from '../ui';

export async function renderCampaignBuilderPage(root: HTMLElement): Promise<void> {
  root.innerHTML = `
    ${pageHeader(
      'Step 1 of 4',
      'Build a campaign',
      'Set the advertiser, the media budget and the date window. Flights are scheduled next.',
    )}
    <form class="card form" data-cy="campaign-form" novalidate>
      <div class="field">
        <label for="campaign-name">Campaign name</label>
        <input id="campaign-name" name="name" data-cy="name-input" autocomplete="off" placeholder="Autumn runway push" />
      </div>
      <div class="field">
        <label for="advertiser">Advertiser</label>
        <input id="advertiser" name="advertiser" data-cy="advertiser-input" autocomplete="off" placeholder="Northwind Outdoor" />
      </div>
      <div class="field">
        <label for="budget">Budget (USD)</label>
        <input id="budget" name="budget" data-cy="budget-input" type="number" step="0.01" placeholder="25000.00" />
        <small class="muted">The sum of all flight budgets may not exceed this amount.</small>
      </div>
      <div class="grid-two">
        <div class="field">
          <label for="campaign-start">Start date</label>
          <input id="campaign-start" name="startDate" data-cy="start-date-input" type="date" />
        </div>
        <div class="field">
          <label for="campaign-end">End date</label>
          <input id="campaign-end" name="endDate" data-cy="end-date-input" type="date" />
        </div>
      </div>
      ${errorMarkup()}
      <div class="form-actions">
        <a class="ghost-button" href="#/campaigns" data-cy="cancel-campaign">Cancel</a>
        <button class="button" type="submit" data-cy="create-campaign">Create campaign</button>
      </div>
    </form>
  `;

  const form = root.querySelector<HTMLFormElement>('[data-cy="campaign-form"]');
  if (!form) {
    return;
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void submit();
  });

  async function submit(): Promise<void> {
    clearFormError(root);
    const data = new FormData(form as HTMLFormElement);
    const budgetValue = String(data.get('budget') ?? '');
    const payload = {
      name: String(data.get('name') ?? ''),
      advertiser: String(data.get('advertiser') ?? ''),
      budgetCents: dollarsToCents(budgetValue),
      startDate: String(data.get('startDate') ?? ''),
      endDate: String(data.get('endDate') ?? ''),
    };
    try {
      const campaign = await api.createCampaign(payload);
      window.location.hash = `#/campaigns/${campaign.id}/flights`;
    } catch (error) {
      if (error instanceof ApiRequestError) {
        showFormError(root, error.payload.message, error.payload.field);
      } else {
        showFormError(root, 'Campaign could not be created. Please try again.');
      }
    }
  }
}
