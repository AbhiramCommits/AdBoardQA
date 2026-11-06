import { statusLabel, type CampaignStatus } from './api';

export function statusBadge(status: CampaignStatus, extraAttributes = ''): string {
  return `<span class="badge badge-${status}" data-status="${status}" ${extraAttributes}>${statusLabel(
    status,
  )}</span>`;
}

export function pageHeader(eyebrow: string, title: string, subtitle: string): string {
  return `
    <section class="page-head">
      <p class="eyebrow">${eyebrow}</p>
      <h1>${title}</h1>
      <p class="lede">${subtitle}</p>
    </section>
  `;
}

export function errorMarkup(): string {
  return '<p class="form-error" data-cy="form-error" hidden></p>';
}

export function showFormError(root: ParentNode, message: string, field?: string): void {
  const element = root.querySelector<HTMLElement>('[data-cy="form-error"]');
  if (!element) {
    return;
  }
  element.hidden = false;
  element.textContent = message;
  if (field) {
    element.dataset['field'] = field;
  } else {
    delete element.dataset['field'];
  }
}

export function clearFormError(root: ParentNode): void {
  const element = root.querySelector<HTMLElement>('[data-cy="form-error"]');
  if (element) {
    element.hidden = true;
    element.textContent = '';
    delete element.dataset['field'];
  }
}

export function loadingMarkup(message = 'Loading…'): string {
  return `<p class="muted" data-cy="loading">${message}</p>`;
}
