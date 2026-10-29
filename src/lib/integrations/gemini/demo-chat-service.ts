import { GoogleGenAI } from '@google/genai';
import { getGeminiApiKey, getGeminiModel } from './config';

interface GenerateDemoContentInput {
  model: string;
  contents: string;
  config: {
    temperature: number;
    maxOutputTokens: number;
  };
}

type GenerateDemoContent = (
  input: GenerateDemoContentInput
) => Promise<{ text?: string }>;

export interface DemoChatResult {
  reply: string;
  source: 'gemini';
  model?: string;
}

export class DemoChatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DemoChatError';
  }
}

export async function askSyntheticDemoConcierge(
  message: string,
  generateContent?: GenerateDemoContent
): Promise<DemoChatResult> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new DemoChatError('Gemini is not configured for the protected demo.');

  const cleanMessage = message.trim();
  if (!cleanMessage || cleanMessage.length > 2_000) {
    throw new DemoChatError('The demo message must contain 1 to 2,000 characters.');
  }

  const model = getGeminiModel();
  const ai = new GoogleGenAI({ apiKey });
  const generate =
    generateContent ||
    ((input: GenerateDemoContentInput) => ai.models.generateContent(input));
  const response = await generate({
    model,
    contents: [
      'You are Apovo, a concise and compassionate care-navigation demo assistant.',
      'This is an invite-only synthetic demonstration. Never request or imply that the user should provide real personal, medical, financial, or identifying information.',
      'Discuss only the fictional Remember Betty application demonstration, available assistance categories, and how Apovo uses AI to prepare a test-only packet.',
      'Do not provide clinical advice. Do not claim that anything has been submitted to a foundation.',
      'The fictional applicant is Ava Testperson and every document is visibly marked synthetic.',
      '',
      `Reviewer message: ${cleanMessage}`,
    ].join('\n'),
    config: {
      temperature: 0.4,
      maxOutputTokens: 900,
    },
  });
  const reply = response.text?.trim() || '';
  if (!reply || reply.length > 8_000) {
    throw new DemoChatError('Gemini returned an empty or oversized demo response.');
  }
  return { reply, source: 'gemini', model };
}
