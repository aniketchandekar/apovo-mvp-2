import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apovo-inbox-filtering-'));
process.env.APOVO_DATA_DIR = testDataDir;

test.after(() => {
  fs.rmSync(testDataDir, { recursive: true, force: true });
});

test('inbox filter excludes sent letters and shows inbound communications', async () => {
  const { ApovoStore } = await import('../../src/lib/store');

  const patient = ApovoStore.createPatient({
    first_name: 'Elena',
    last_name: 'Morales',
    care_email: 'elena.morales@agentmail.to',
    agentmail_inbox_id: 'elena.morales@agentmail.to',
  });

  // 1. Inbound letter received from a foundation
  ApovoStore.saveEmail({
    patient_id: patient.id,
    program_name: 'Remember Betty',
    thread_id: 'thread_inbound_1',
    message_id: 'msg_inbound_1',
    direction: 'inbound',
    from: 'grants@rememberbetty.com',
    to: patient.care_email,
    subject: 'Application under review',
    body_text: 'Thank you for your application, it has been received.',
    classification: 'confirmation',
    unread: true,
  });

  // 2. Outbound sent letter (e.g. follow-up letter or inquiry sent by agent)
  ApovoStore.saveEmail({
    patient_id: patient.id,
    program_name: 'Pink Aid',
    thread_id: 'thread_outbound_only',
    message_id: 'msg_outbound_1',
    direction: 'outbound',
    from: patient.care_email,
    to: 'grants@pinkaid.org',
    subject: 'Application Status Inquiry — Elena Morales',
    body_text: 'Hello Pink Aid Team, I am writing to check on the status of my application.',
    classification: 'pending',
    delivery_status: 'sent',
    unread: false,
  });

  // 3. Test 'inbox' filter (first tab / default filter):
  // Must include inbound thread, must NOT include the sent letter!
  const inboxThreads = ApovoStore.getThreads(patient.id, 'inbox');
  assert.equal(inboxThreads.length, 1);
  assert.equal(inboxThreads[0].thread_id, 'thread_inbound_1');
  assert.equal(inboxThreads[0].latest.direction, 'inbound');

  // 4. Test 'sent' filter:
  // Must include the outbound sent letter!
  const sentThreads = ApovoStore.getThreads(patient.id, 'sent');
  assert.equal(sentThreads.length, 1);
  assert.equal(sentThreads[0].thread_id, 'thread_outbound_only');
  assert.equal(sentThreads[0].latest.direction, 'outbound');

  // 5. Test default parameter:
  // Calling getThreads() with no filter argument defaults to 'inbox' (no sent letters)
  const defaultThreads = ApovoStore.getThreads(patient.id);
  assert.equal(defaultThreads.length, 1);
  assert.equal(defaultThreads[0].thread_id, 'thread_inbound_1');

  // 6. Test replying to an inbound email:
  // When a reply is sent to an inbound thread, it remains in the inbox as an active communication
  // and is also included in 'sent'.
  ApovoStore.saveEmail({
    patient_id: patient.id,
    program_name: 'Remember Betty',
    thread_id: 'thread_inbound_1',
    message_id: 'msg_outbound_reply_1',
    direction: 'outbound',
    from: patient.care_email,
    to: 'grants@rememberbetty.com',
    subject: 'Re: Application under review',
    body_text: 'Thank you for the update! Here is the additional info requested.',
    classification: 'pending',
    delivery_status: 'sent',
    unread: false,
  });

  const updatedInboxThreads = ApovoStore.getThreads(patient.id, 'inbox');
  assert.equal(updatedInboxThreads.length, 1);
  assert.equal(updatedInboxThreads[0].thread_id, 'thread_inbound_1');
  assert.equal(updatedInboxThreads[0].hasInbound, true);
  assert.equal(updatedInboxThreads[0].hasOutbound, true);

  const updatedSentThreads = ApovoStore.getThreads(patient.id, 'sent');
  assert.equal(updatedSentThreads.length, 2); // Both the sent letter and the reply
});
