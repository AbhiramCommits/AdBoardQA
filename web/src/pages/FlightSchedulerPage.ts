import {
  ApiRequestError,
  api,
  statusLabel,
  type Campaign,
  type Screen,
} from '../api';
import { dollarsToCents, escapeHtml, formatCents, formatNumber } from '../format';
import {
  clearFormError,
  errorMarkup,
  loadingMarkup,
  pageHeader,
  showFormError,
} from '../ui';

interface SchedulerState {
  campaign: Campaign;
  screens: Screen[];
}

export async function renderFlightSchedulerPage(
  root: HTMLElement,
  campaignId: string,
): Promise<void> {
  const header = pageHeader(
    'Step 2 of 4',
    'Schedule flights',
    'Book screens inside the campaign window. A screen cannot be double-booked on this campaign.',
  );

  let state: SchedulerState | null = null;

  const paint = (): void => {
    if (!state) {
      return;
    }
    const { campaign, screens } = state;
    const screenById = new Map(screens.map((screen) => [screen.id, screen]));
    const metricsById = new Map(campaign.flightMetrics.map((metric) => [metric.flightId, metric]));

    const rows = campaign.flights
      .map((flight) => {
        const screen = screenById.get(flight.screenId);
        const metric = metricsById.get(flight.id);
        return `
          <tr data-cy="flight-row" data-flight-id="${escapeHtml(flight.id)}" data-screen-id="${escapeHtml(
            flight.screenId,
          )}">
            <td data-cy="flight-screen">${escapeHtml(screen?.name ?? flight.screenId)}</td>
            <td>${escapeHtml(flight.startDate)} → ${escapeHtml(flight.endDate)}</td>
            <td>${metric?.days ?? 0} days</td>
            <td>${formatCents(flight.dailyBudgetCents)}/day</td>
            <td data-cy="flight-cost">${formatCents(metric?.costCents ?? 0)}</td>
            <td data-cy="flight-impressions">${formatNumber(metric?.impressions ?? 0)}</td>
            <td>
              <button class="link-button danger" type="button" data-cy="delete-flight">Remove</button>
            </td>
          </tr>
        `;
      })
      .join('');

    const options = screens
      .map(
        (screen) =>
          `<option value="${escapeHtml(screen.id)}">${escapeHtml(screen.name)} · ${screen.venue} · ${formatNumber(
            screen.dailyImpressions,
          )} impressions/day</option>`,
      )
      .join('');

    root.innerHTML = `
      ${header}
      <div class="flow-head">
        <div>
          <p class="eyebrow">${escapeHtml(campaign.advertiser)}</p>
          <h2 data-cy="campaign-title">${escapeHtml(campaign.name)}</h2>
          <p class="muted">${escapeHtml(campaign.startDate)} → ${escapeHtml(campaign.endDate)} · budget ${formatCents(
            campaign.budgetCents,
          )}</p>
        </div>
        <span class="badge badge-${campaign.status}" data-cy="campaign-status" data-status="${campaign.status}">${statusLabel(
          campaign.status,
        )}</span>
      </div>

      <div class="split">
        <form class="card form" data-cy="flight-form" novalidate>
          <h3>Add a flight</h3>
          <div class="field">
            <label for="screen">Screen</label>
            <select id="screen" name="screenId" data-cy="screen-select">
              <option value="">Choose a screen…</option>
              ${options}
            </select>
          </div>
          <div class="grid-two">
            <div class="field">
              <label for="flight-start">Start date</label>
              <input id="flight-start" name="startDate" data-cy="flight-start-input" type="date" value="${escapeHtml(
                campaign.startDate,
              )}" />
            </div>
            <div class="field">
              <label for="flight-end">End date</label>
              <input id="flight-end" name="endDate" data-cy="flight-end-input" type="date" value="${escapeHtml(
                campaign.endDate,
              )}" />
            </div>
          </div>
          <div class="field">
            <label for="daily-budget">Daily budget (USD)</label>
            <input id="daily-budget" name="dailyBudget" data-cy="daily-budget-input" type="number" step="0.01" placeholder="450.00" />
          </div>
          ${errorMarkup()}
          <button class="button" type="submit" data-cy="add-flight">Add flight</button>
        </form>

        <aside class="card totals" data-cy="totals-panel">
          <h3>Campaign totals</h3>
          <dl>
            <div><dt>Flights</dt><dd data-cy="flight-count">${campaign.totals.flightCount}</dd></div>
            <div><dt>Booked budget</dt><dd data-cy="total-cost">${formatCents(
              campaign.totals.bookedBudgetCents,
            )}</dd></div>
            <div><dt>Remaining</dt><dd data-cy="remaining-budget">${formatCents(
              campaign.totals.remainingBudgetCents,
            )}</dd></div>
            <div><dt>Impressions</dt><dd data-cy="total-impressions">${formatNumber(
              campaign.totals.totalImpressions,
            )}</dd></div>
            <div><dt>Blended CPM</dt><dd data-cy="average-cpm">${formatCents(
              campaign.totals.averageCpmCents,
            )}</dd></div>
          </dl>
        </aside>
      </div>

      <div class="card table-card">
        <table>
          <thead>
            <tr><th>Screen</th><th>Dates</th><th>Length</th><th>Daily budget</th><th>Flight cost</th><th>Impressions</th><th></th></tr>
          </thead>
          <tbody>
            ${
              rows ||
              '<tr><td colspan="7" class="muted" data-cy="no-flights">No flights booked yet.</td></tr>'
            }
          </tbody>
        </table>
      </div>

      <div class="actions-bar">
        <a class="ghost-button" href="#/campaigns">Back to campaigns</a>
        <a class="button" href="#/campaigns/${encodeURIComponent(campaign.id)}/review" data-cy="go-review">Continue to review</a>
      </div>
    `;

    const form = root.querySelector<HTMLFormElement>('[data-cy="flight-form"]');
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      void addFlight(form);
    });

    root.querySelectorAll<HTMLButtonElement>('[data-cy="delete-flight"]').forEach((button) => {
      button.addEventListener('click', () => {
        const row = button.closest<HTMLElement>('[data-cy="flight-row"]');
        const flightId = row?.dataset['flightId'];
        if (flightId) {
          void deleteFlight(flightId);
        }
      });
    });
  };

  async function load(): Promise<void> {
    root.innerHTML = `${header}${loadingMarkup('Loading campaign and screens…')}`;

    let campaign: Campaign;
    try {
      campaign = await api.getCampaign(campaignId);
    } catch {
      root.innerHTML = `${header}<div class="card"><p data-cy="load-error">The campaign could not be loaded.</p><a class="ghost-button" href="#/campaigns">Back to campaigns</a></div>`;
      return;
    }

    let screens: Screen[];
    try {
      const response = await api.listScreens();
      screens = response.screens;
    } catch {
      root.innerHTML = `
        ${header}
        <div class="card empty-state" data-cy="screens-error">
          <h3>Screens are unavailable</h3>
          <p data-cy="screens-empty">The screen catalogue could not be loaded. Check the connection and try again.</p>
          <button class="button" type="button" data-cy="retry-screens">Retry screens</button>
        </div>
      `;
      root.querySelector('[data-cy="retry-screens"]')?.addEventListener('click', () => {
        void load();
      });
      return;
    }

    state = { campaign, screens };
    paint();
  }

  async function addFlight(form: HTMLFormElement): Promise<void> {
    if (!state) {
      return;
    }
    clearFormError(root);
    const data = new FormData(form);
    try {
      const updated = await api.addFlight(state.campaign.id, {
        screenId: String(data.get('screenId') ?? ''),
        startDate: String(data.get('startDate') ?? ''),
        endDate: String(data.get('endDate') ?? ''),
        dailyBudgetCents: dollarsToCents(String(data.get('dailyBudget') ?? '')),
      });
      state = { ...state, campaign: updated };
      paint();
    } catch (error) {
      if (error instanceof ApiRequestError) {
        showFormError(root, error.payload.message, error.payload.field);
      } else {
        showFormError(root, 'Flight could not be added. Please try again.');
      }
    }
  }

  async function deleteFlight(flightId: string): Promise<void> {
    if (!state) {
      return;
    }
    clearFormError(root);
    try {
      const result = await api.deleteFlight(state.campaign.id, flightId);
      state = { ...state, campaign: result.campaign };
      paint();
    } catch (error) {
      if (error instanceof ApiRequestError) {
        showFormError(root, error.payload.message, error.payload.field);
      } else {
        showFormError(root, 'Flight could not be removed. Please try again.');
      }
    }
  }

  await load();
}
