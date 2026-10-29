import { ApplicationRunError } from '../../application-agent/errors';

export const REMEMBER_BETTY_ASSISTANCE_URL =
  'https://www.rememberbetty.com/apply-for-assistance';

const ALLOWED_APPLICATION_HOSTS = new Set([
  'rememberbetty.com',
  'www.rememberbetty.com',
  'static1.squarespace.com',
]);

export interface ApplicationLinkCandidate {
  href: string;
  label: string;
  visible?: boolean;
}

export interface ValidatedApplicationLink {
  applicationUrl: URL;
  label: string;
}

export function validateRememberBettyApplicationUrl(href: string): URL {
  let applicationUrl: URL;
  try {
    applicationUrl = new URL(href, REMEMBER_BETTY_ASSISTANCE_URL);
  } catch {
    throw new ApplicationRunError(
      'APPLICATION_LINK_REJECTED',
      'The application link is not a valid URL.'
    );
  }

  if (
    applicationUrl.protocol !== 'https:' ||
    !ALLOWED_APPLICATION_HOSTS.has(applicationUrl.hostname) ||
    !applicationUrl.pathname.toLowerCase().endsWith('.pdf')
  ) {
    throw new ApplicationRunError(
      'APPLICATION_LINK_REJECTED',
      'The current application link needs manual review.'
    );
  }

  applicationUrl.hash = '';
  return applicationUrl;
}

export function selectRememberBettyApplicationLink(
  candidates: readonly ApplicationLinkCandidate[]
): ValidatedApplicationLink | null {
  let selected: (ValidatedApplicationLink & { score: number }) | null = null;

  for (const candidate of candidates) {
    let applicationUrl: URL;
    try {
      applicationUrl = validateRememberBettyApplicationUrl(candidate.href);
    } catch (error) {
      if (error instanceof ApplicationRunError) continue;
      throw error;
    }

    const label = candidate.label.trim() || 'Application';
    const searchable = `${label} ${applicationUrl.pathname}`.toLowerCase();
    const score =
      (candidate.visible === false ? 0 : 4) +
      (searchable.includes('application') ? 3 : 0) +
      (searchable.includes('assistance') ? 2 : 0);

    if (!selected || score > selected.score) {
      selected = { applicationUrl, label, score };
    }
  }

  if (!selected) return null;
  return { applicationUrl: selected.applicationUrl, label: selected.label };
}
