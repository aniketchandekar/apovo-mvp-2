import { InMemoryRunner } from '@google/adk';
import { ApovoStore } from '../../store';
import { getResourceCatalog } from '../../resource-catalog';
import { getGeminiApiKey, getGeminiModel } from './config';
import { createApovoConciergeAgent } from './agent';

export interface ChatServiceResponse {
  reply: string;
  source: 'gemini_adk' | 'local_concierge';
  model?: string;
  error?: string;
}

// Map of sessionId -> runner instance to preserve memory within server lifecycle
const runnerMap = new Map<string, InMemoryRunner>();

function getOrCreateRunner(sessionId: string): InMemoryRunner {
  let runner = runnerMap.get(sessionId);
  if (!runner) {
    const agent = createApovoConciergeAgent();
    runner = new InMemoryRunner({
      agent,
      appName: 'apovo_concierge',
    });
    runnerMap.set(sessionId, runner);
  }
  return runner;
}

/**
 * Intelligent local concierge fallback when Gemini API key is not configured or offline.
 * Provides rich, empathetic, and intent-aware responses with proper Markdown formatting.
 */
export function generateLocalConciergeReply(userMessage: string, patientId?: string): string {
  const lower = userMessage.toLowerCase().trim();
  const patient = patientId ? ApovoStore.getPatient(patientId) : ApovoStore.getActivePatient();
  const startedGrants = patient ? ApovoStore.getStartedGrantsSummary(patient.id) : [];
  const firstName = patient?.first_name || 'there';

  // 1. Warm Greetings
  if (
    lower === 'hi' ||
    lower === 'hello' ||
    lower === 'hey' ||
    lower.startsWith('hello') ||
    lower.startsWith('hi ') ||
    lower.startsWith('hey ') ||
    lower.includes('good morning') ||
    lower.includes('good afternoon') ||
    lower.includes('good evening')
  ) {
    if (startedGrants.length > 0) {
      const pendingCount = startedGrants.reduce((s, g) => s + g.pendingQuestionsCount, 0);
      return `Hello ${firstName}! Warm welcome back to Apovo.\n\nYou currently have **${startedGrants.length} started grant(s)** with **${pendingCount} pending item(s)**. I'm here to assist you with answering questions, checking deadlines, or reviewing your application documents.\n\nHow can I help you today?`;
    }
    return `Hello ${firstName}! Warm welcome to Apovo. I'm your Care Concierge, here to support your breast cancer journey by helping you explore financial aid, transportation, home care assistance, and grant applications.\n\nWhat would you like to explore today?`;
  }

  // 2. Pending Questions / Walkthrough
  if (lower.includes('pending') || lower.includes('question') || lower.includes('walk me through')) {
    const totalPending = startedGrants.reduce((sum, g) => sum + g.pendingQuestionsCount, 0);
    if (totalPending > 0) {
      const details = startedGrants
        .filter((g) => g.pendingQuestionsCount > 0)
        .map((g) => `• **${g.application.resource.name}**: ${g.pendingQuestionsCount} question(s) open`)
        .join('\n');
      return `You currently have **${totalPending} pending question(s)** across your started grants:\n\n${details}\n\nYou can answer them directly in our chat, through the **Pending Items** tab, or inside your **Application Workspace**.`;
    }
    return `Great news, ${firstName}! All your active grant questions are fully answered. Your application packets are up to date. You can review your completed packets in the **Started Grants** section.`;
  }

  // 3. Status / Active Grant Progress
  if (lower.includes('status') || lower.includes('started') || lower.includes('summarize') || lower.includes('progress')) {
    if (startedGrants.length === 0) {
      return `You haven't started any grant applications yet, ${firstName}.\n\nTo begin, head over to **My Resources**, find a program that fits your needs (such as Remember Betty or Hope Copay), and select **Apply with Apovo**. I'll walk you through every step!`;
    }
    const lines = startedGrants.map(
      (g) =>
        `• **${g.application.resource.name}** (${g.application.resource.est_value})\n  - Phase: *${g.latestRun?.current_phase || g.application.state}*\n  - Questions: ${g.answeredQuestionsCount} answered, ${g.pendingQuestionsCount} pending`
    );
    return `### Your Active Grants Summary\n\n${lines.join('\n\n')}\n\nLet me know if you would like to work on any of these applications or draft your personal note!`;
  }

  // 4. Specific Program Details
  if (lower.includes('remember betty') || lower.includes('betty')) {
    return `### Remember Betty Foundation\n\n• **Category**: Financial Assistance\n• **Focus**: Direct financial support for everyday living expenses (rent, utilities, groceries) for breast cancer patients and survivors.\n• **Submission Window**: Applications are accepted exclusively from the **1st through the 7th of each month**.\n• **Required Documents**: Completed application form, doctor's diagnosis confirmation letter, and a heartfelt personal note.\n• **Packet Limit**: Maximum 8 pages sent via fax or mail.\n\nWould you like help drafting your personal note for Remember Betty?`;
  }

  if (lower.includes('hope') || lower.includes('copay') || lower.includes('medication')) {
    return `### Hope Oncology Copay Assistance Fund\n\n• **Category**: Financial & Medication Assistance\n• **Estimated Value**: Up to **$5,000 / year**\n• **Focus**: Relieving out-of-pocket prescription costs, co-pays, and specialty oncology medication expenses.\n• **Requirements**: Current oncology prescription or treatment summary and insurance card.\n\nWould you like to start this application in **My Resources**?`;
  }

  if (lower.includes('transit') || lower.includes('transport') || lower.includes('rides') || lower.includes('uber') || lower.includes('lyft')) {
    return `### Regional Transit Care Assistance\n\n• **Category**: Transportation\n• **Estimated Value**: Free transit passes & rideshare credits\n• **Focus**: Ensuring safe, reliable travel to and from cancer treatment appointments, scans, and oncology visits.\n• **Requirements**: Verification of appointment dates from your treatment center.\n\nWould you like to apply for transit vouchers?`;
  }

  if (lower.includes('clean') || lower.includes('house') || lower.includes('home care')) {
    return `### Cleaning For A Reason / Home Care\n\n• **Category**: Home Cleaning\n• **Estimated Value**: 2 to 4 free residential home cleanings\n• **Focus**: Providing professional home cleaning so cancer patients can rest and recover in a sanitized, stress-free home environment.\n• **Requirements**: Doctor's note confirming active cancer care.\n\nWould you like to explore home cleaning support?`;
  }

  // 5. Personal Note Drafting
  if (lower.includes('personal') || lower.includes('note') || lower.includes('statement') || lower.includes('draft') || lower.includes('letter')) {
    const name = patient?.first_name ? `${patient.first_name} ${patient.last_name || ''}`.trim() : 'Applicant';
    const diag = patient?.diagnosis || 'breast cancer';
    const stage = patient?.stage ? ` (${patient.stage})` : '';
    return `### Personal Statement Draft\n\nHere is a warm, authentic personal statement tailored for your application:\n\n> "My name is ${name}, and I am currently undergoing care for ${diag}${stage}. Navigating daily treatments alongside ongoing living expenses has placed significant financial strain on my household. Receiving grant support would provide vital relief, allowing me to focus on my health and recovery. Thank you wholeheartedly for your kindness and consideration."\n\nFeel free to adjust any wording so it speaks in your true voice!`;
  }

  // 6. Eligibility & Catalog
  if (lower.includes('eligible') || lower.includes('which grant') || lower.includes('catalog') || lower.includes('list') || lower.includes('programs')) {
    const catalog = getResourceCatalog(patient);
    const eligible = catalog.filter((r) => r.eligibility.status === 'eligible');
    const items = catalog.map(
      (r) =>
        `• **${r.name}** (${r.category} · ${r.est_value})\n  *Status*: ${r.eligibility.status.replace('_', ' ')} — ${r.eligibility.explanation}`
    );
    return `### Curated Grant Catalog\n\nYou have **${catalog.length} curated programs** in your catalog (${eligible.length} currently screened as eligible):\n\n${items.join('\n\n')}\n\n*Note: In Apovo, advisory criteria never prevent you from submitting an application.*`;
  }

  // 7. Deadlines & Timing
  if (lower.includes('deadline') || lower.includes('date') || lower.includes('timing') || lower.includes('window') || lower.includes('when')) {
    return `### Grant Submission Timing & Deadlines\n\n• **Remember Betty Foundation**: Accepts applications only during the **1st through the 7th of each month**. Early preparation of your diagnosis letter and personal note is key!\n• **Hope Copay Assistance**: Rolling submission throughout the calendar year while funds remain available.\n• **Regional Transit & Cleaning**: Rolling enrollment based on current treatment schedules.\n\nWould you like to prepare your documents ahead of the next window?`;
  }

  // 8. How to apply / How it works
  if (
    lower.includes('how to apply') ||
    lower.includes('how do i apply') ||
    lower.includes('how can i apply') ||
    lower.includes('how does') ||
    lower.includes('get started') ||
    lower.includes('step')
  ) {
    return `### How Apovo Works in 3 Simple Steps\n\n1. **Select a Program**: Browse your curated grant directory in **My Resources** and click *Apply with Apovo*.\n2. **Answer Simple Questions**: Answer quick questions right here in chat or your workspace. Apovo fills in the standard forms automatically.\n3. **Packet Assembly & Submission**: Apovo compiles your application form, diagnosis letter, and personal note into a compliant packet and faxes or delivers it directly to the foundation.\n\nWhich program would you like to explore first?`;
  }

  // 9. Clinical / Medical questions boundary
  if (lower.includes('treatment') || lower.includes('chemo') || lower.includes('radiation') || lower.includes('medicine') || lower.includes('pain') || lower.includes('side effect')) {
    return `I hear you, and navigating treatment can feel overwhelming. While I am here to help you navigate financial aid, grants, and practical support, I cannot provide clinical medical advice.\n\nPlease discuss any treatment options, medications, or side effects directly with your oncologist, oncology nurse, or care team. If you need financial assistance with co-pays or transportation to your appointments, I'm right here to help you apply!`;
  }

  // 10. Default dynamic fallback
  const suggestions = [
    `• Ask *"What grants am I eligible for?"* to explore matched assistance\n• Ask *"Summarize my started grants"* to review active applications\n• Ask *"Help me draft my personal note"* for application statements\n• Ask *"When is the Remember Betty deadline?"* for timing details`,
    `• Ask *"Walk me through my pending questions"* to complete open items\n• Ask *"How does Apovo work?"* for an overview of the process\n• Ask *"Tell me about Hope Copay"* or *"Tell me about transit assistance"* for program specifics`,
  ];
  const suggestionBlock = suggestions[Math.floor(Math.random() * suggestions.length)];

  return `I'm here to support your breast cancer journey and guide you through grant applications, transportation aid, and care navigation, ${firstName}.\n\nHere are a few things we can do together right now:\n\n${suggestionBlock}\n\nWhat would you like to focus on?`;
}

export async function askApovoConcierge(params: {
  message: string;
  userId?: string;
  sessionId?: string;
}): Promise<ChatServiceResponse> {
  const { message, userId = 'default_patient', sessionId = 'default_session' } = params;
  const apiKey = getGeminiApiKey();

  if (!apiKey) {
    return {
      reply: generateLocalConciergeReply(message, userId),
      source: 'local_concierge',
      model: 'local-concierge',
    };
  }

  try {
    const runner = getOrCreateRunner(sessionId);

    // Ensure session exists in the runner's session service
    const existingSession = await runner.sessionService.getSession({
      appName: 'apovo_concierge',
      userId,
      sessionId,
    });
    if (!existingSession) {
      await runner.sessionService.createSession({
        appName: 'apovo_concierge',
        userId,
        sessionId,
      });
    }

    const eventStream = runner.runAsync({
      userId,
      sessionId,
      newMessage: {
        role: 'user',
        parts: [{ text: message }],
      },
    });

    let collectedText = '';
    let errorMessage: string | undefined;

    for await (const event of eventStream) {
      if (event.errorMessage) {
        errorMessage = event.errorMessage;
      }
      if (event.content?.parts) {
        for (const part of event.content.parts) {
          if (part.text) {
            collectedText += part.text;
          }
        }
      }
    }

    if (errorMessage && !collectedText.trim()) {
      console.warn('[Apovo Chat] Google ADK returned an error event:', errorMessage);
      return {
        reply: `${generateLocalConciergeReply(message, userId)}\n\n*(Google ADK notice: ${errorMessage})*`,
        source: 'local_concierge',
        error: errorMessage,
      };
    }

    if (!collectedText.trim()) {
      return {
        reply: generateLocalConciergeReply(message, userId),
        source: 'local_concierge',
      };
    }

    return {
      reply: collectedText.trim(),
      source: 'gemini_adk',
      model: getGeminiModel(),
    };
  } catch (error) {
    const messageStr = error instanceof Error ? error.message : String(error);
    console.error('[Apovo Chat] Error running Google ADK agent:', messageStr);

    return {
      reply: `${generateLocalConciergeReply(message, userId)}\n\n*(Care Concierge fallback — Gemini connection error: ${messageStr})*`,
      source: 'local_concierge',
      error: messageStr,
    };
  }
}
