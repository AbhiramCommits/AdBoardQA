import { api, statusLabel } from '../api';
import { escapeHtml, formatCents, formatNumber } from '../format';
import { loadingMarkup, pageHeader } from '../ui';

export async function renderCampaignListPage(root: HTMLElement): Promise<void> {
  const header = pageHeader(
    'Media operations',
    'Campaigns',
    'Plan, book and clear DOOH campaigns across airports, malls and gyms.',
  );

  const load = async (): Promise<void> => {
    root.innerHTML = `${header}${loadingMarkup('Loading campaigns…')}`;
    try {
      const { campaigns } = await api.listCampaigns();
      const rows = campaigns
        .map(
          (campaign) => `
            <tr data-cy="campaign-row" data-campaign-id="${escapeHtml(campaign.id)}" data-status="${campaign.status}">
              <td>
                <strong data-cy="campaign-name">${escapeHtml(campaign.name)}</strong>
                <small>${escapeHtml(campaign.advertiser)}</small>
              </td>
              <td>
                <span class="badge badge-${campaign.status}" data-cy="campaign-status" data-status="${campaign.status}">${statusLabel(
                  campaign.status,
                )}</span>
              </td>
              <td>${escapeHtml(campaign.startDate)} → ${escapeHtml(campaign.endDate)}</td>
              <td>${formatCents(campaign.bookedBudgetCents)} <small>of ${formatCents(campaign.budgetCents)}</small></td>
              <td>${campaign.flightCount}</td>
              <td class="row-actions">
                <a data-cy="open-flights" href="#/campaigns/${encodeURIComponent(campaign.id)}/flights">Schedule</a>
                <a data-cy="open-review" href="#/campaigns/${encodeURIComponent(campaign.id)}/review">Review</a>
              </td>
            </tr>
          `,
        )
        .join('');

      root.innerHTML = `
        ${header}
        <div class="toolbar">
          <p class="muted">${formatNumber(campaigns.length)} campaigns</p>
          <a class="button" href="#/campaigns/new" data-cy="new-campaign">+ New campaign</a>
        </div>
        <div class="card table-card">
          <table>
            <thead>
              <tr><th>Campaign</th><th>Status</th><th>Window</th><th>Booked</th><th>Flights</th><th></th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;
    } catch {
      root.innerHTML = `
        ${header}
        <div class="card">
          <p data-cy="list-error">Campaigns could not be loaded.</p>
          <button class="button" data-cy="retry-list" type="button">Retry</button>
        </div>
      `;
      root.querySelector('[data-cy="retry-list"]')?.addEventListener('click', () => {
        void load();
      });
    }
  };

  await load();
}
