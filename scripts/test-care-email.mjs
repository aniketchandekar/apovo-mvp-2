const baseUrl = (process.env.APOVO_TEST_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const response = await fetch(`${baseUrl}/api/test-care-email`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    confirmation: 'SEND_TO_NICOLE',
    recipient: 'nicole.wu.mail@gmail.com',
  }),
});
const payload = await response.json().catch(() => ({ error: 'The test route returned no JSON.' }));
if (!response.ok) {
  console.error(`Email integration test failed (${response.status}): ${payload.error || 'Unknown error'}`);
  process.exit(1);
}

console.log(`Recipient: ${payload.recipient}`);
console.log(`Gemini: ${payload.model} (${payload.source})`);
console.log(`Draft: ${payload.draftId}`);
console.log(`Message: ${payload.messageId}`);
console.log(`Thread: ${payload.threadId}`);
console.log(`Test run: ${payload.testRunId}`);
console.log(`Local inbox record saved: ${payload.localRecordSaved}`);
console.log(`\nSubject: ${payload.subject}\n\n${payload.text}`);
console.log('\nAttachments verified in AgentMail:');
for (const attachment of payload.attachments || []) {
  console.log(`- ${attachment.filename}: ${attachment.size} bytes, SHA-256 ${attachment.sha256}`);
}
