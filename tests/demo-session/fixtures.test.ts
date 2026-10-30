import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEMO_ACK_THREAD_ID,
  DEMO_TASK_ID,
  EMPTY_DEMO_UI_STATE,
  demoDashboardPayload,
  demoInboxPayload,
  demoTaskPayload,
} from '../../src/lib/demo-session/fixtures';
import { createDemoSession, signDemoSession } from '../../src/lib/demo-session/token';

test('keeps dashboard, tasks, inbox, and talk counts on one fixture', () => {
  const dashboard = demoDashboardPayload(EMPTY_DEMO_UI_STATE);
  const tasks = demoTaskPayload(EMPTY_DEMO_UI_STATE);
  const inbox = demoInboxPayload(EMPTY_DEMO_UI_STATE);

  assert.equal(dashboard.pendingItemsCount, tasks.counts.open);
  assert.equal(dashboard.unreadEmailsCount, inbox.counts.unread);
  assert.equal(dashboard.startedGrants[0].pendingQuestions[0].id, DEMO_TASK_ID);
  assert.equal(inbox.threads[0].thread_id, DEMO_ACK_THREAD_ID);
  assert.equal(dashboard.patient.care_email, inbox.care_email);
});

test('derives resolved, starred, read, sent, and draft state without external stores', () => {
  const ui = {
    ...EMPTY_DEMO_UI_STATE,
    answeredTaskIds: [DEMO_TASK_ID],
    starredThreadIds: [DEMO_ACK_THREAD_ID],
    readThreadIds: [DEMO_ACK_THREAD_ID],
    sentThreadIds: [DEMO_ACK_THREAD_ID],
    draft: {
      threadId: DEMO_ACK_THREAD_ID,
      to: 'grants@rememberbetty.com',
      subject: 'Synthetic follow-up',
      text: 'No external email is sent by this fixture.',
    },
  };
  const tasks = demoTaskPayload(ui);
  const inbox = demoInboxPayload(ui);
  assert.equal(tasks.counts.open, 0);
  assert.equal(tasks.counts.completed, 2);
  assert.equal(inbox.counts.starred, 1);
  assert.equal(inbox.counts.unread, 0);
  assert.equal(inbox.counts.sent, 1);
  assert.equal(inbox.counts.drafts, 1);
});

test('keeps the maximum bounded demo UI state within the signed cookie limit', () => {
  const session = createDemoSession();
  session.ui.draft = {
    threadId: DEMO_ACK_THREAD_ID,
    to: 'grants@rememberbetty.com',
    subject: 'S'.repeat(200),
    text: 'T'.repeat(600),
  };
  assert.doesNotThrow(() => signDemoSession(session, 's'.repeat(32)));
});
