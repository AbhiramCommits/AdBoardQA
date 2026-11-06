import {
  ApiRequestError,
  api,
  currentReviewer,
  setCurrentReviewer,
  statusLabel,
  type Campaign,
  type Screen,
} from '../api';
import { escapeHtml, formatCents, formatNumber } from '../format';
import {
  clearFormError,
  errorMarkup,
  loadingMarkup,
  pageHeader,
  showFormError,
} from '../ui';

interface ApprovalState {
  campaign: Campaign;
  screens: Screen[];
}

export async function renderApprovalPage(
  root: HTMLElement,
  campaignId: string,
): Promise<void> {
  const header = pageHeader(
    'Step 3 of 4',
    'Review and release',
    'Submit the plan, clear it with a reviewer, then publish it to the DOOH network.',
  );

  root.innerHTML = `${header}${loadingMarkup('Loading approval workspace…')}`;

  let state: ApprovalState;
  try {
    const [campaign, screensResponse] = await Promise.all([
      api.getCampaign(campaignId),
      api.listScreens(),
    ]);
    state = { campaign, screens: screensResponse.screens };
  } catch {
    root.innerHTML = `${header}<div class="card"><p data-cy="load-error">The approval workspace could not be loaded.</p></div>`;
    return;
  }

  const paint = (): void => {
    const { campaign } = state;
    const screenById = new Map(state.screens.map((screen) => [screen.id, screen]));
    const metricsById = new Map(campaign.flightMetrics.map((metric) => [metric.flightId, metric]));

    const flightRows = campaign.flights
      .map((flight) => {
        const screen = screenById.get(flight.screenId);
        const metric = metricsById.get(flight.id);
        return `
          <tr data-cy="review-flight-row" data-flight-id="${escapeHtml(flight.id)}">
            <td>${escapeHtml(screen?.name ?? flight.screenId)}</td>
            <td>${escapeHtml(flight.startDate)} → ${escapeHtml(flight.endDate)}</td>
            <td>${metric?.days ?? 0}</td>
            <td>${formatCents(metric?.costCents ?? 0)}</td>
            <td>${formatNumber(metric?.impressions ?? 0)}</td>
          </tr>
        `;
      })
      .join('');

    let actions = '';
    if (campaign.status === 'draft') {
      actions = `
        <h3>Submit for approval</h3>
        <p class="muted">Submitting locks flight edits until a reviewer rejects the plan.</p>
        <button class="button" type="button" data-cy="submit-approval">Submit for approval</button>
      `;
    } else if (campaign.status === 'pending_approval') {
      actions = `
        <h3>Reviewer decision</h3>
        <div class="field">
          <label for="reviewer">Reviewer email</label>
          <input id="reviewer" data-cy="reviewer-input" type="email" value="${escapeHtml(
            currentReviewer(),
          )}" />
        </div>
        <div class="actions-row">
          <button class="button" type="button" data-cy="approve">Approve campaign</button>
          <button class="danger-button" type="button" data-cy="reject">Reject</button>
        </div>
        <div class="field">
          <label for="reject-reason">Rejection reason</label>
          <textarea id="reject-reason" data-cy="reject-reason" rows="2" placeholder="What needs to change?"></textarea>
        </div>
      `;
    } else if (campaign.status === 'approved') {
      actions = `
        <h3>Ready to release</h3>
        <p class="muted">Publishing moves the campaign to the live DOOH network.</p>
        <button class="button" type="button" data-cy="publish">Publish campaign</button>
      `;
    } else {
      actions = `
        <h3>Campaign is live</h3>
        <p data-cy="live-banner">This campaign is live on the DOOH network.</p>
        <p class="muted">Published ${escapeHtml(campaign.publishedAt ?? '')}</p>
      `;
    }

    root.innerHTML = `
      ${header}
      <div class="flow-head">
        <div>
          <p class="eyebrow">${escapeHtml(campaign.advertiser)}</p>
          <h2 data-cy="campaign-title">${escapeHtml(campaign.name)}</h2>
          <p class="muted">${escapeHtml(campaign.startDate)} → ${escapeHtml(campaign.endDate)} · budget ${formatCents(
            campaign.budgetCents,
          )} · created by ${escapeHtml(campaign.createdBy)}</p>
        </div>
        <span class="badge badge-${campaign.status}" data-cy="campaign-status" data-status="${campaign.status}">${statusLabel(
          campaign.status,
        )}</span>
      </div>

      ${
        campaign.lastRejection
          ? `<div class="notice" data-cy="last-rejection">Rejected by ${escapeHtml(
              campaign.lastRejection.reviewer,
            )}: ${escapeHtml(campaign.lastRejection.reason)}</div>`
          : ''
      }

      <div class="split">
        <div class="card">
          <h3>Plan</h3>
          <div class="table-card">
            <table>
              <thead><tr><th>Screen</th><th>Dates</th><th>Days</th><th>Cost</th><th>Impressions</th></tr></thead>
              <tbody>${
                flightRows ||
                '<tr><td colspan="5" class="muted" data-cy="review-no-flights">No flights booked.</td></tr>'
              }</tbody>
            </table>
          </div>
        </div>
        <aside class="card totals" data-cy="totals-panel">
          <h3>Totals</h3>
          <dl>
            <div><dt>Flights</dt><dd data-cy="flight-count">${campaign.totals.flightCount}</dd></div>
            <div><dt>Booked</dt><dd data-cy="total-cost">${formatCents(
              campaign.totals.bookedBudgetCents,
            )}</dd></div>
            <div><dt>Remaining</dt><dd data-cy="remaining-budget">${formatCents(
              campaign.totals.remainingBudgetCents,
            )}</dd></div>
            <div><dt>Impressions</dt><dd data-cy="total-impressions">${formatNumber(
              campaign.totals.totalImpressions,
            )}</dd></div>
          </dl>
        </aside>
      </div>

      <div class="card" data-cy="approval-actions">
        ${actions}
        ${errorMarkup()}
        <p class="form-error" data-cy="conflict-message" hidden></p>
        <div class="actions-bar">
          <a class="ghost-button" href="#/campaigns/${encodeURIComponent(campaign.id)}/flights" data-cy="back-to-flights">Back to flights</a>
          <a class="ghost-button" href="#/campaigns">All campaigns</a>
        </div>
      </div>
    `;

    bindActions();
  };

  function showConflict(message: string): void {
    const element = root.querySelector<HTMLElement>('[data-cy="conflict-message"]');
    if (element) {
      element.hidden = false;
      element.textContent = message;
    }
  }

  function clearConflict(): void {
    const element = root.querySelector<HTMLElement>('[data-cy="conflict-message"]');
    if (element) {
      element.hidden = true;
      element.textContent = '';
    }
  }

  function handleError(error: unknown): void {
    if (error instanceof ApiRequestError) {
      if (error.status === 409) {
        clearFormError(root);
        showConflict(error.payload.message);
        return;
      }
      showFormError(root, error.payload.message, error.payload.field);
    } else {
      showFormError(root, 'The action could not be completed. Please try again.');
    }
  }

  async function perform(action: () => Promise<Campaign>): Promise<void> {
    clearFormError(root);
    clearConflict();
    try {
      const campaign = await action();
      state = { ...state, campaign };
      paint();
    } catch (error) {
      handleError(error);
    }
  }

  function bindActions(): void {
    const id = state.campaign.id;
    root.querySelector('[data-cy="submit-approval"]')?.addEventListener('click', () => {
      void perform(() => api.submit(id));
    });
    root.querySelector('[data-cy="approve"]')?.addEventListener('click', () => {
      const reviewer = root.querySelector<HTMLInputElement>('[data-cy="reviewer-input"]')?.value ?? '';
      setCurrentReviewer(reviewer);
      void perform(() => api.approve(id, reviewer));
    });
    root.querySelector('[data-cy="reject"]')?.addEventListener('click', () => {
      const reviewer = root.querySelector<HTMLInputElement>('[data-cy="reviewer-input"]')?.value ?? '';
      const reason = root.querySelector<HTMLTextAreaElement>('[data-cy="reject-reason"]')?.value ?? '';
      setCurrentReviewer(reviewer);
      void perform(() => api.reject(id, reason, reviewer));
    });
    root.querySelector('[data-cy="publish"]')?.addEventListener('click', () => {
      void perform(() => api.publish(id));
    });
  }

  paint();
}
