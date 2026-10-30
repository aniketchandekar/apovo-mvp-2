import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEMO_ACK_THREAD_ID,
  DEMO_TASK_ID,
  demoDraft,
  demoTasks,
} from '../../src/lib/demo-session/fixtures';
import {
  appendUnique,
  updateDemoUiState,
  without,
} from '../../src/lib/demo-session/state';
import {
  createDemoSession,
  signDemoSession,
  verifyDemoSession,
} from '../../src/lib/demo-session/token';

const SECRET = 'demo-state-test-secret-that-is-long-enough';

function roundTrip<T extends ReturnType<typeof createDemoSession>>(session: T) {
  return verifyDemoSession(signDemoSession(session, SECRET), SECRET);
}

test('answers a synthetic task and persists its status in the signed session', () => {
  const next = updateDemoUiState(createDemoSession(), (ui) => ({
    ...ui,
    answeredTaskIds: appendUnique(ui.answeredTaskIds, DEMO_TASK_ID),
    skippedTaskIds: without(ui.skippedTaskIds, DEMO_TASK_ID),
  }));
  const restored = roundTrip(next);
  assert.deepEqual(restored.ui.answeredTaskIds, [DEMO_TASK_ID]);
  assert.equal(demoTasks(restored.ui)[0].status, 'answered');
});

test('persists synthetic inbox state without an external store', () => {
  const next = updateDemoUiState(createDemoSession(), (ui) => ({
    ...ui,
    starredThreadIds: appendUnique(ui.starredThreadIds, DEMO_ACK_THREAD_ID),
    readThreadIds: appendUnique(ui.readThreadIds, DEMO_ACK_THREAD_ID),
    draft: {
      threadId: DEMO_ACK_THREAD_ID,
      to: 'grants@rememberbetty.com',
      subject: 'Demo subject',
      text: 'Demo message',
    },
  }));
  const restored = roundTrip(next);
  assert.deepEqual(restored.ui.starredThreadIds, [DEMO_ACK_THREAD_ID]);
  assert.deepEqual(restored.ui.readThreadIds, [DEMO_ACK_THREAD_ID]);
  assert.equal(demoDraft(restored.ui)?.text, 'Demo message');
});

test('unique state transitions are idempotent', () => {
  const once = appendUnique([], DEMO_TASK_ID);
  const twice = appendUnique(once, DEMO_TASK_ID);
  assert.deepEqual(twice, once);
  assert.deepEqual(without(without(twice, DEMO_TASK_ID), DEMO_TASK_ID), []);
});
