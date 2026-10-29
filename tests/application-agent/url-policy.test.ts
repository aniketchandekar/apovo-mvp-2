import assert from 'node:assert/strict';
import test from 'node:test';
import { ApplicationRunError } from '../../src/lib/application-agent/errors';
import {
  selectRememberBettyApplicationLink,
  validateRememberBettyApplicationUrl,
} from '../../src/lib/integrations/browserbase/url-policy';

test('accepts the reviewed PDF hosts over HTTPS', () => {
  assert.equal(
    validateRememberBettyApplicationUrl(
      'https://static1.squarespace.com/static/application.pdf#page=1'
    ).toString(),
    'https://static1.squarespace.com/static/application.pdf'
  );
});

test('rejects non-PDF, insecure, and unapproved links', () => {
  const rejected = [
    'https://www.rememberbetty.com/online-form',
    'http://static1.squarespace.com/application.pdf',
    'https://example.com/application.pdf',
    'javascript:alert(1)',
  ];

  for (const href of rejected) {
    assert.throws(
      () => validateRememberBettyApplicationUrl(href),
      (error: unknown) =>
        error instanceof ApplicationRunError && error.code === 'APPLICATION_LINK_REJECTED'
    );
  }
});

test('accepts the current Remember Betty application link', () => {
  assert.equal(
    validateRememberBettyApplicationUrl(
      '/s/APPLICATION-FOR-ASSISTANCE-FORM-9-9-24.pdf'
    ).toString(),
    'https://www.rememberbetty.com/s/APPLICATION-FOR-ASSISTANCE-FORM-9-9-24.pdf'
  );
});

test('selects a visible validated application PDF from page anchors', () => {
  const selected = selectRememberBettyApplicationLink([
    { href: 'https://www.givesignup.org/donate', label: 'Donate', visible: true },
    {
      href: 'https://static1.squarespace.com/static/old-form.pdf',
      label: 'Archived document',
      visible: false,
    },
    {
      href: '/s/APPLICATION-FOR-ASSISTANCE-FORM-9-9-24.pdf',
      label: 'Application',
      visible: true,
    },
  ]);

  assert.equal(
    selected?.applicationUrl.toString(),
    'https://www.rememberbetty.com/s/APPLICATION-FOR-ASSISTANCE-FORM-9-9-24.pdf'
  );
  assert.equal(selected?.label, 'Application');
});
