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
      <div class="error-banner" data-cy="error-banner" hidden>
        <p data-cy="error-banner-message">Campaign could not be created.</p>
        <button class="ghost-button" type="button" data-cy="retry-create">Retry</button>
      </div>
      <p class="muted" data-cy="form-loading" hidden>Creating campaign…</p>
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

  const submitButton = root.querySelector<HTMLButtonElement>(
    '[data-cy="create-campaign"]',
  );
  const loading = root.querySelector<HTMLElement>('[data-cy="form-loading"]');
  const banner = root.querySelector<HTMLElement>('[data-cy="error-banner"]');
  const bannerMessage = root.querySelector<HTMLElement>(
    '[data-cy="error-banner-message"]',
  );
  let inFlight = false;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void submit();
  });

  root.querySelector('[data-cy="retry-create"]')?.addEventListener('click', () => {
    void submit();
  });

  function setBusy(busy: boolean): void {
    if (submitButton) {
      submitButton.disabled = busy;
      submitButton.textContent = busy ? 'Creating…' : 'Create campaign';
    }
    if (loading) {
      loading.hidden = !busy;
    }
  }

  function hideBanner(): void {
    if (banner) {
      banner.hidden = true;
    }
  }

  function showBanner(message: string): void {
    if (bannerMessage) {
      bannerMessage.textContent = message;
    }
    if (banner) {
      banner.hidden = false;
    }
  }

  async function submit(): Promise<void> {
    if (inFlight) {
      return;
    }
    inFlight = true;
    clearFormError(root);
    hideBanner();
    setBusy(true);

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
      if (error instanceof ApiRequestError && error.status < 500) {
        showFormError(root, error.payload.message, error.payload.field);
      } else {
        showBanner(
          'Campaign could not be created. The server did not respond as expected — retry when the connection is healthy.',
        );
      }
    } finally {
      inFlight = false;
      setBusy(false);
    }
  }
}
