import './styles.css';
import { currentUser } from './api';
import { renderApprovalPage } from './pages/ApprovalPage';
import { renderCampaignBuilderPage } from './pages/CampaignBuilderPage';
import { renderCampaignListPage } from './pages/CampaignListPage';
import { renderFlightSchedulerPage } from './pages/FlightSchedulerPage';

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }
  return element;
}

const root = requireElement<HTMLElement>('#app');
requireElement<HTMLElement>('[data-cy="current-user"]').textContent = currentUser();

async function render(): Promise<void> {
  const hash = window.location.hash || '#/campaigns';
  // Each navigation renders into a fresh view. A page whose fetches resolve
  // after the user has already navigated away writes into its own detached
  // view instead of overwriting the page that is now on screen.
  const view = document.createElement('div');
  root.replaceChildren(view);
  view.innerHTML = '<p class="muted" data-cy="loading">Loading…</p>';

  const flightMatch = /^#\/campaigns\/([^/]+)\/flights$/.exec(hash);
  const reviewMatch = /^#\/campaigns\/([^/]+)\/review$/.exec(hash);

  if (hash === '#/campaigns/new') {
    await renderCampaignBuilderPage(view);
    return;
  }
  if (flightMatch?.[1]) {
    await renderFlightSchedulerPage(view, decodeURIComponent(flightMatch[1]));
    return;
  }
  if (reviewMatch?.[1]) {
    await renderApprovalPage(view, decodeURIComponent(reviewMatch[1]));
    return;
  }
  await renderCampaignListPage(view);
}

window.addEventListener('hashchange', () => {
  void render();
});

void render();
