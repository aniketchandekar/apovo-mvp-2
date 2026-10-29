import { GoogleGenAI, Type } from '@google/genai';
import { getGeminiApiKey, getGeminiModel } from './config';

export interface IntegrationTestEmailContext {
  testRunId: string;
  attachmentFilenames: string[];
}

export interface ComposedIntegrationTestEmail {
  subject: string;
  text: string;
  model: string;
  source: 'gemini';
}

interface GeminiEmailResponse {
  text?: string;
}

type GenerateEmailContent = (request: {
  model: string;
  contents: string;
  config: {
    responseMimeType: string;
    responseSchema: {
      type: Type;
      properties: Record<string, { type: Type }>;
      required: string[];
      propertyOrdering: string[];
    };
    temperature: number;
  };
}) => Promise<GeminiEmailResponse>;

export class EmailComposerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailComposerError';
  }
}

function validatedDraft(responseText: string | undefined, context: IntegrationTestEmailContext) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText || '');
  } catch {
    throw new EmailComposerError('Gemini returned an unreadable email draft.');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new EmailComposerError('Gemini returned an invalid email draft.');
  }

  const subject = 'subject' in parsed && typeof parsed.subject === 'string' ? parsed.subject.trim() : '';
  const text = 'text' in parsed && typeof parsed.text === 'string' ? parsed.text.trim() : '';
  if (!subject || subject.length > 160 || !text || text.length > 19_000 || /[\0\r]/.test(subject)) {
    throw new EmailComposerError('Gemini returned an incomplete or oversized email draft.');
  }
  if (context.attachmentFilenames.some((filename) => !text.includes(filename))) {
    throw new EmailComposerError('Gemini did not identify every test attachment.');
  }

  return { subject, text };
}

export async function composeIntegrationTestEmail(
  context: IntegrationTestEmailContext,
  generateContent?: GenerateEmailContent
): Promise<ComposedIntegrationTestEmail> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new EmailComposerError('Gemini is not configured for the email integration test.');
  }
  if (!context.testRunId.trim() || context.attachmentFilenames.length === 0) {
    throw new EmailComposerError('The email integration test context is incomplete.');
  }

  const model = getGeminiModel();
  const ai = new GoogleGenAI({ apiKey });
  const generate = generateContent || ((request: Parameters<GenerateEmailContent>[0]) => ai.models.generateContent(request));
  const prompt = `Write a concise, professional email for an Apovo software integration test.
Use a warm but direct tone and plain text only.
The email must explicitly name every attached file: ${context.attachmentFilenames.join(', ')}.
Explain that the attachments are synthetic PDFs containing no patient data and that this test checks Gemini drafting plus AgentMail delivery.
Do not request any action, money, medical information, or reply.
Do not address or mention Remember Betty as a recipient.
Do not claim that a grant application was submitted.
Return JSON with a subject and a complete email body.

Synthetic test run ID: ${context.testRunId}`;

  const response = await generate({
    model,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          subject: { type: Type.STRING },
          text: { type: Type.STRING },
        },
        required: ['subject', 'text'],
        propertyOrdering: ['subject', 'text'],
      },
      temperature: 0.4,
    },
  });
  const draft = validatedDraft(response.text, context);

  return {
    subject: `[Apovo Test] ${draft.subject}`.slice(0, 200),
    text: `${draft.text}\n\nTest run ID: ${context.testRunId}\nNo grant application was submitted.`,
    model,
    source: 'gemini',
  };
}
