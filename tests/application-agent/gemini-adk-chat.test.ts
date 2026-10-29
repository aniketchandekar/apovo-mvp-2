import assert from 'node:assert/strict';
import test from 'node:test';
import { ApovoStore } from '../../src/lib/store';
import {
  getGeminiApiKey,
  getGeminiModel,
  isGeminiConfigured,
} from '../../src/lib/integrations/gemini/config';
import { createApovoConciergeAgent } from '../../src/lib/integrations/gemini/agent';
import {
  getActivePatientTool,
  getGrantCatalogTool,
  getStartedGrantsTool,
  getPendingQuestionsTool,
} from '../../src/lib/integrations/gemini/tools';
import { askApovoConcierge, generateLocalConciergeReply } from '../../src/lib/integrations/gemini/chat-service';
import { parseInlineMarkdown, parseMarkdownBlocks } from '../../src/components/talk/FormattedMessage';

test('Gemini configuration defaults and environment overrides', () => {
  const originalKey = process.env.GEMINI_API_KEY;
  try {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_GENAI_API_KEY;
    delete process.env.GOOGLE_API_KEY;

    assert.equal(isGeminiConfigured(), false);
    assert.equal(getGeminiApiKey(), null);
    assert.equal(getGeminiModel(), 'gemini-3.7-flash');

    process.env.GEMINI_API_KEY = 'test-gemini-key-123';
    assert.equal(isGeminiConfigured(), true);
    assert.equal(getGeminiApiKey(), 'test-gemini-key-123');
    assert.equal(process.env.GOOGLE_GENAI_API_KEY, 'test-gemini-key-123');
  } finally {
    if (originalKey) {
      process.env.GEMINI_API_KEY = originalKey;
      process.env.GOOGLE_GENAI_API_KEY = originalKey;
    } else {
      delete process.env.GEMINI_API_KEY;
      delete process.env.GOOGLE_GENAI_API_KEY;
      delete process.env.GOOGLE_API_KEY;
    }
  }
});

test('builds Apovo Care Concierge agent using Google ADK LlmAgent', () => {
  const agent = createApovoConciergeAgent();
  assert.equal(agent.name, 'apovo_care_concierge');
  assert.equal(agent.model, 'gemini-3.7-flash');
  assert.ok(String(agent.instruction).includes('Apovo Care Concierge'));
  assert.ok(agent.tools && agent.tools.length >= 4);
});

test('Google ADK FunctionTools retrieve patient, catalog, and grants data', async () => {
  ApovoStore.setPatientPreset('jane-doe');
  const patient = ApovoStore.getActivePatient();
  assert.ok(patient);

  type CallableTool = {
    execute(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  };

  // Test getActivePatientTool
  const patientRes = await (getActivePatientTool as unknown as CallableTool).execute({});
  assert.equal(patientRes.name, 'Jane Doe');
  assert.ok(typeof patientRes.diagnosis === 'string' && patientRes.diagnosis.includes('Breast Cancer'));
  assert.ok(Array.isArray(patientRes.needs));

  // Test getGrantCatalogTool
  const catalogRes = await (getGrantCatalogTool as unknown as CallableTool).execute({});
  assert.equal(catalogRes.count, 5);
  const programs = catalogRes.programs as Array<{ id: string }>;
  assert.ok(programs.some((p) => p.id === 'remember-betty'));
  assert.ok(programs.some((p) => p.id === 'hope-copay'));

  // Test category filtering
  const filteredRes = await (getGrantCatalogTool as unknown as CallableTool).execute({ category: 'Transport' });
  assert.equal(filteredRes.count, 1);
  const filteredPrograms = filteredRes.programs as Array<{ id: string }>;
  assert.equal(filteredPrograms[0].id, 'transit-voucher');

  // Test getStartedGrantsTool
  const startedRes = await (getStartedGrantsTool as unknown as CallableTool).execute({});
  assert.equal(typeof startedRes.count, 'number');
  assert.ok(Array.isArray(startedRes.grants));

  // Test getPendingQuestionsTool
  const pendingRes = await (getPendingQuestionsTool as unknown as CallableTool).execute({});
  assert.equal(typeof pendingRes.totalPending, 'number');
  assert.ok(Array.isArray(pendingRes.questions));
});

test('askApovoConcierge provides compassionate assistance even without configured key', async () => {
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_GENAI_API_KEY;
  delete process.env.GOOGLE_API_KEY;

  const res = await askApovoConcierge({
    message: 'Can you summarize my started grants?',
    userId: 'test_user',
    sessionId: 'test_session',
  });

  assert.equal(res.source, 'local_concierge');
  assert.ok(res.reply.length > 20);
});

test('generateLocalConciergeReply provides varied, structured answers without repetitive boilerplate', () => {
  ApovoStore.setPatientPreset('jane-doe');
  const patient = ApovoStore.getActivePatient();
  assert.ok(patient);

  // Greetings
  const greeting = generateLocalConciergeReply('Hello Apovo', patient.id);
  assert.ok(greeting.includes('Jane'));
  assert.ok(greeting.includes('Care Concierge'));

  // Deadlines
  const deadlines = generateLocalConciergeReply('What are the deadlines and submission windows?', patient.id);
  assert.ok(deadlines.includes('Remember Betty'));
  assert.ok(deadlines.includes('1st through the 7th'));

  // How to apply
  const howTo = generateLocalConciergeReply('How do I apply for grants?', patient.id);
  assert.ok(howTo.includes('Simple Steps'));
  assert.ok(howTo.includes('Select a Program'));

  // Specific program
  const betty = generateLocalConciergeReply('Tell me about Remember Betty', patient.id);
  assert.ok(betty.includes('Remember Betty Foundation'));
  assert.ok(betty.includes('8 pages'));

  // Dynamic fallback
  const fallback = generateLocalConciergeReply('What should we do next?', patient.id);
  assert.ok(fallback.includes('Jane'));
  assert.ok(fallback.includes('explore') || fallback.includes('Ask'));
});

test('Markdown parser formats headings, lists, bold, and inlines cleanly', () => {
  const sampleMarkdown = `### Remember Betty Details
Here is your **grant status** with *important* notes:
• **Remember Betty**: Financial assistance
  • Deadline: 1st through 7th of the month
• **Hope Copay**: Up to $5,000

> "Compassionate care and support."

Visit [Apovo Resources](https://apovo.care) or check \`code\`.`;

  const blocks = parseMarkdownBlocks(sampleMarkdown);
  assert.equal(blocks[0].type, 'h3');
  assert.equal(blocks[0].text, 'Remember Betty Details');

  assert.equal(blocks[1].type, 'p');
  const inlineP = parseInlineMarkdown(blocks[1].text);
  assert.ok(inlineP.some((t) => t.type === 'bold' && t.text === 'grant status'));
  assert.ok(inlineP.some((t) => t.type === 'italic' && t.text === 'important'));

  assert.equal(blocks[2].type, 'list');
  if (blocks[2].type === 'list') {
    assert.equal(blocks[2].items.length, 3);
    assert.equal(blocks[2].items[0].level, 0);
    assert.equal(blocks[2].items[1].level, 1);
  }

  assert.equal(blocks[3].type, 'blockquote');
  assert.ok(blocks[3].text.includes('Compassionate care'));

  assert.equal(blocks[4].type, 'p');
  const inlineLink = parseInlineMarkdown(blocks[4].text);
  assert.ok(inlineLink.some((t) => t.type === 'link' && t.text === 'Apovo Resources'));
  assert.ok(inlineLink.some((t) => t.type === 'code' && t.text === 'code'));
});
