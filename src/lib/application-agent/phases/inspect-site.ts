import 'server-only';
import { ApplicationRunError } from '../errors';
import type { BrowserAutomationSession } from '../../integrations/browserbase/types';
import {
  type ApplicationLinkCandidate,
  REMEMBER_BETTY_ASSISTANCE_URL,
  selectRememberBettyApplicationLink,
} from '../../integrations/browserbase/url-policy';

export async function inspectRememberBettySite(
  session: BrowserAutomationSession
): Promise<{ applicationUrl: string; label: string }> {
  const pages = await session.browser.context.pages();
  const page = pages[0] || (await session.browser.context.newPage());
  await page.goto(REMEMBER_BETTY_ASSISTANCE_URL);

  const candidates = await page.evaluate<ApplicationLinkCandidate[]>(() =>
    Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]')).map((anchor) => ({
      href: anchor.href,
      label: (anchor.innerText || anchor.textContent || '').trim(),
      visible: Boolean(
        anchor.offsetWidth || anchor.offsetHeight || anchor.getClientRects().length
      ),
    }))
  );
  const selected = selectRememberBettyApplicationLink(candidates);
  if (selected) {
    return {
      applicationUrl: selected.applicationUrl.toString(),
      label: selected.label,
    };
  }

  throw new ApplicationRunError(
    'APPLICATION_LINK_NOT_FOUND',
    'The current application link could not be found.',
    true
  );
}
