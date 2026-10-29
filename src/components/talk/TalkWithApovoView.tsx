'use client';

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  ArrowRight,
  FileText,
  FolderHeart,
  HeartHandshake,
  HelpCircle,
  ListChecks,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react';
import { AppShell } from '@/components/dashboard/AppShell';
import { useDemoSession } from '@/components/demo/DemoSessionProvider';
import { getResourceCatalog } from '@/lib/resource-catalog';
import type { PatientProfile, PatientTaskType, StartedGrantSummary } from '@/lib/types';
import { FormattedMessage } from './FormattedMessage';

interface ChatMessage {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  timestamp: string;
  questionContext?: {
    id: string;
    grantName: string;
    title: string;
    why: string;
    type: PatientTaskType;
    options?: string[];
    run_id?: string;
  };
}

interface FlatPendingQuestion {
  id: string;
  grantName: string;
  applicationId: string;
  title: string;
  why: string;
  type: PatientTaskType;
  options?: string[];
  run_id?: string;
}

const SUGGESTED_PROMPTS = [
  {
    text: 'Walk me through my pending questions',
    label: 'Answer pending questions',
    description: 'Complete application questions together',
    icon: ListChecks,
  },
  {
    text: 'Summarize my started grants',
    label: 'Check my grant status',
    description: 'See progress across your applications',
    icon: FolderHeart,
  },
  {
    text: 'Help me draft my personal note',
    label: 'Draft a personal note',
    description: 'Create a thoughtful statement for applications',
    icon: FileText,
  },
  {
    text: 'Which grants am I eligible for?',
    label: 'Explore eligible grants',
    description: 'Find support matched to your care profile',
    icon: HeartHandshake,
  },
];

export function TalkWithApovoView() {
  const demoSession = useDemoSession();
  const chatInstanceId = useId();
  const [patient, setPatient] = useState<PatientProfile | null>(null);
  const [startedGrants, setStartedGrants] = useState<StartedGrantSummary[]>([]);
  const [pendingItemsCount, setPendingItemsCount] = useState<number>(0);
  const [unreadEmailsCount, setUnreadEmailsCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [geminiConfigured, setGeminiConfigured] = useState<boolean>(false);
  const [geminiModel, setGeminiModel] = useState<string>('gemini-3.7-flash');
  const [sessionId, setSessionId] = useState<string>(`session_chat_${chatInstanceId}`);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [activeQuestion, setActiveQuestion] = useState<FlatPendingQuestion | null>(null);
  const messagesStreamRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const initializedGreeting = useRef<boolean>(false);

  const handleResetChat = () => {
    const newSessionId = `session_chat_${Date.now()}`;
    setSessionId(newSessionId);
    setActiveQuestion(null);
    const firstName = patient?.first_name || 'there';
    const totalPending = startedGrants.reduce((sum, g) => sum + g.pendingQuestionsCount, 0);
    const intro =
      startedGrants.length > 0
        ? `Hi ${firstName}, I'm your Apovo Care Concierge. You currently have ${startedGrants.length} ${
            startedGrants.length === 1 ? 'grant started' : 'grants started'
          } with Apovo and ${totalPending} ${
            totalPending === 1 ? 'question pending' : 'questions pending'
          }. We can answer your pending questions right here in chat, draft your personal note, or check your grant eligibility.`
        : `Hi ${firstName}, I'm your Apovo Care Concierge. You haven't started an application run yet, but I can help you explore eligible grants, prepare your personal statement, or answer any questions about how Apovo works.`;

    setMessages([
      {
        id: `msg_welcome_${Date.now()}`,
        role: 'assistant',
        text: intro,
        timestamp: 'Just now',
      },
    ]);
  };

  const loadContext = useCallback(async () => {
    try {
      const response = await fetch('/api/dashboard', { cache: 'no-store' });
      if (!response.ok) throw new Error('Unable to load concierge context');
      const data = await response.json();
      const loadedPatient: PatientProfile | null = data.patient || null;
      const loadedGrants: StartedGrantSummary[] = Array.isArray(data.startedGrants)
        ? data.startedGrants
        : [];
      setPatient(loadedPatient);
      setStartedGrants(loadedGrants);
      setPendingItemsCount(typeof data.pendingItemsCount === 'number' ? data.pendingItemsCount : 0);
      setUnreadEmailsCount(typeof data.unreadEmailsCount === 'number' ? data.unreadEmailsCount : 0);

      try {
        const chatStatusRes = await fetch('/api/chat', { cache: 'no-store' });
        if (chatStatusRes.ok) {
          const chatStatus = await chatStatusRes.json();
          setGeminiConfigured(Boolean(chatStatus.configured));
          if (chatStatus.model) setGeminiModel(chatStatus.model);
        }
      } catch {
        // Non-blocking
      }

      if (!initializedGreeting.current) {
        initializedGreeting.current = true;
        const firstName = loadedPatient?.first_name || 'there';
        const totalPending = loadedGrants.reduce(
          (sum, g) => sum + g.pendingQuestionsCount,
          0
        );
        const intro =
          loadedGrants.length > 0
            ? `Hi ${firstName}, I'm your Apovo Care Concierge. You currently have ${loadedGrants.length} ${
                loadedGrants.length === 1 ? 'grant started' : 'grants started'
              } with Apovo and ${totalPending} ${
                totalPending === 1 ? 'question pending' : 'questions pending'
              }. We can answer your pending questions right here in chat, draft your personal note, or check your grant eligibility.`
            : `Hi ${firstName}, I'm your Apovo Care Concierge. You haven't started an application run yet, but I can help you explore eligible grants, prepare your personal statement, or answer any questions about how Apovo works.`;

        setMessages([
          {
            id: 'msg_welcome',
            role: 'assistant',
            text: intro,
            timestamp: 'Just now',
          },
        ]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadContext().catch(console.error);
  }, [loadContext]);

  useEffect(() => {
    const stream = messagesStreamRef.current;
    if (stream) stream.scrollTo({ top: stream.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const answerablePendingQuestions = useMemo<FlatPendingQuestion[]>(() => {
    const list: FlatPendingQuestion[] = [];
    for (const grant of startedGrants) {
      for (const q of grant.pendingQuestions) {
        if (q.type !== 'file') {
          list.push({
            id: q.id,
            grantName: grant.application.resource.name,
            applicationId: grant.application.id,
            title: q.title,
            why: q.why,
            type: q.type,
            options: q.options,
            run_id: q.run_id,
          });
        }
      }
    }
    return list;
  }, [startedGrants]);

  const appendMessage = (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    setMessages((prev) => [
      ...prev,
      {
        ...msg,
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  const promptQuestionInChat = (q: FlatPendingQuestion) => {
    setActiveQuestion(q);
    appendMessage({
      role: 'assistant',
      text: `For **${q.grantName}**:\n${q.title}\n\n*Why this is needed:* ${q.why}`,
      questionContext: {
        id: q.id,
        grantName: q.grantName,
        title: q.title,
        why: q.why,
        type: q.type,
        options: q.options,
        run_id: q.run_id,
      },
    });
  };

  const submitAnswerForActiveQuestion = async (answerText: string) => {
    if (!activeQuestion) return;
    const currentQ = activeQuestion;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(currentQ.id)}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answer: answerText,
          value: answerText,
          run_id: currentQ.run_id,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        appendMessage({
          role: 'assistant',
          text: `${payload.error || 'That answer could not be saved.'} Please try entering your response again.`,
        });
        return;
      }

      setActiveQuestion(null);
      await loadContext();

      const remaining = answerablePendingQuestions.filter((item) => item.id !== currentQ.id);
      if (remaining.length > 0) {
        const nextQ = remaining[0];
        appendMessage({
          role: 'assistant',
          text: `Saved your answer for **${currentQ.grantName}**!\n\nYou have ${remaining.length} ${
            remaining.length === 1 ? 'question' : 'questions'
          } remaining across your started grants.\n\nNext question available:\n• **${nextQ.grantName}**: ${nextQ.title}`,
          questionContext: {
            id: nextQ.id,
            grantName: nextQ.grantName,
            title: nextQ.title,
            why: nextQ.why,
            type: nextQ.type,
            options: ['Answer next question'],
            run_id: nextQ.run_id,
          },
        });
      } else {
        appendMessage({
          role: 'assistant',
          text: `Saved your answer for **${currentQ.grantName}**! All text and choice questions in chat are now complete. If a document upload (such as a diagnosis confirmation letter) is still needed, you can upload it in **Pending items** or your **Application Workspace**.`,
        });
      }
    } catch {
      appendMessage({
        role: 'assistant',
        text: 'I ran into a connection issue saving that answer. Please try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const generateConciergeReply = (userText: string) => {
    const lower = userText.toLowerCase().trim();
    const firstName = patient?.first_name || 'there';

    // 1. Greetings
    if (
      lower === 'hi' ||
      lower === 'hello' ||
      lower === 'hey' ||
      lower.startsWith('hello') ||
      lower.startsWith('hi ') ||
      lower.startsWith('hey ') ||
      lower.includes('good morning') ||
      lower.includes('good afternoon')
    ) {
      if (startedGrants.length > 0) {
        const totalPending = startedGrants.reduce((s, g) => s + g.pendingQuestionsCount, 0);
        appendMessage({
          role: 'assistant',
          text: `Hello ${firstName}! Warm welcome back to Apovo.\n\nYou currently have **${startedGrants.length} started grant(s)** with **${totalPending} pending item(s)**. I can help you answer application questions, draft your personal note, or review deadlines. How can I assist you today?`,
        });
      } else {
        appendMessage({
          role: 'assistant',
          text: `Hello ${firstName}! Warm welcome to Apovo. I'm your Care Concierge, here to assist with breast cancer grant navigation, financial aid, transportation, and home care support. How can I help today?`,
        });
      }
      return;
    }

    // 2. Pending Questions
    if (
      lower.includes('pending') ||
      lower.includes('question') ||
      lower.includes('walk me through')
    ) {
      if (answerablePendingQuestions.length > 0) {
        promptQuestionInChat(answerablePendingQuestions[0]);
        return;
      }
      const totalOpen = startedGrants.reduce((sum, g) => sum + g.pendingQuestionsCount, 0);
      if (totalOpen > 0) {
        appendMessage({
          role: 'assistant',
          text: `You have **${totalOpen} file upload item(s)** waiting in your queue (such as a signed diagnosis confirmation PDF). You can upload that file directly in the **Pending items** tab or inside your **Application Workspace**.`,
        });
        return;
      }
      appendMessage({
        role: 'assistant',
        text:
          startedGrants.length > 0
            ? 'All your active grant questions are completely up to date! You have 0 pending items right now.'
            : 'You do not have any pending questions right now. Start an application in **My Resources** and I can walk you through every required question.',
      });
      return;
    }

    // 3. Status
    if (lower.includes('status') || lower.includes('started') || lower.includes('summarize')) {
      if (startedGrants.length === 0) {
        appendMessage({
          role: 'assistant',
          text: 'You have not started any grant applications yet. Visit **My Resources** and click **Apply with Apovo** on any program to begin.',
        });
        return;
      }
      const lines = startedGrants.map(
        (g) =>
          `• **${g.application.resource.name}** (${g.application.resource.est_value})\n  - Progress: ${g.answeredQuestionsCount} of ${g.totalQuestionsCount} questions answered (${g.pendingQuestionsCount} pending)`
      );
      appendMessage({
        role: 'assistant',
        text: `### Active Grants Summary\n\n${lines.join('\n\n')}\n\nWould you like to go through any pending questions together?`,
      });
      return;
    }

    // 4. Specific Programs
    if (lower.includes('remember betty') || lower.includes('betty')) {
      appendMessage({
        role: 'assistant',
        text: `### Remember Betty Foundation\n\n• **Category**: Financial Assistance for daily living expenses (rent, utilities, food).\n• **Submission Window**: Applications are accepted exclusively from the **1st through the 7th of each month**.\n• **Required Documents**: Application form, doctor's diagnosis confirmation letter, and a personal note.\n• **Packet Limit**: Maximum 8 pages sent via fax or mail.\n\nWould you like help drafting your personal note?`,
      });
      return;
    }

    if (lower.includes('hope') || lower.includes('copay')) {
      appendMessage({
        role: 'assistant',
        text: `### Hope Oncology Copay Assistance Fund\n\n• **Category**: Prescription & Oncology Copay Relief (up to **$5,000 / year**).\n• **Requirements**: Current oncology prescription or treatment summary and insurance card.\n\nWould you like to start this application in **My Resources**?`,
      });
      return;
    }

    // 5. Personal Note
    if (lower.includes('personal') || lower.includes('note') || lower.includes('statement') || lower.includes('draft')) {
      const name = patient?.first_name ? `${patient.first_name} ${patient.last_name || ''}`.trim() : 'Applicant';
      const diag = patient?.diagnosis || 'breast cancer';
      const draftNote = `My name is ${name}, and I am currently navigating treatment for ${diag}. Balancing ongoing medical care with everyday household expenses has created financial strain for my family. Receiving support from this grant would provide meaningful relief so I can focus on my treatment and recovery. Thank you sincerely for considering my application.`;
      const noteQuestion = answerablePendingQuestions.find((q) => q.type === 'personal_note');

      appendMessage({
        role: 'assistant',
        text: `### Personal Statement Draft\n\nHere is a warm, truthful personal statement draft tailored to your profile:\n\n> "${draftNote}"\n\n${
          noteQuestion
            ? 'I have selected your open Personal Note question below — click "Use this draft" or reply with edits to save it.'
            : 'You can copy or customize this note whenever an application asks for a personal statement.'
        }`,
        questionContext: noteQuestion
          ? {
              id: noteQuestion.id,
              grantName: noteQuestion.grantName,
              title: noteQuestion.title,
              why: noteQuestion.why,
              type: noteQuestion.type,
              options: [draftNote],
              run_id: noteQuestion.run_id,
            }
          : undefined,
      });
      if (noteQuestion) {
        setActiveQuestion(noteQuestion);
      }
      return;
    }

    // 6. Eligibility
    if (lower.includes('eligible') || lower.includes('eligibility') || lower.includes('which grant')) {
      const catalog = getResourceCatalog(patient);
      const eligibleList = catalog.filter((r) => r.eligibility.status === 'eligible');
      const needsInfoList = catalog.filter((r) => r.eligibility.status === 'needs_information');
      const summary =
        eligibleList.length > 0
          ? `### Matched Programs\n\nBased on your care profile, you appear eligible for **${eligibleList.length}** programs:\n\n${eligibleList
              .map((r) => `• **${r.name}** (${r.category} · ${r.est_value})`)
              .join('\n')}\n\n*Note: In Apovo, advisory criteria never block you from submitting an application.*`
          : `We have **${catalog.length}** curated programs in your catalog (${needsInfoList.length} need a few profile details to confirm screening). You can start any of them in **My Resources**.`;
      appendMessage({
        role: 'assistant',
        text: summary,
      });
      return;
    }

    // 7. Deadlines
    if (lower.includes('deadline') || lower.includes('timing') || lower.includes('date') || lower.includes('window')) {
      appendMessage({
        role: 'assistant',
        text: `### Application Timing & Deadlines\n\n• **Remember Betty Foundation**: Accepts applications only from the **1st through the 7th of each month**.\n• **Hope Copay Assistance**: Rolling submission throughout the calendar year while funds remain available.\n• **Regional Transit & Cleaning**: Rolling enrollment based on current treatment schedules.`,
      });
      return;
    }

    // 8. Default dynamic response
    appendMessage({
      role: 'assistant',
      text: `I'm here to support your breast cancer care journey and grant applications, ${firstName}.\n\nYou can ask me to:\n• *"Walk me through my pending questions"*\n• *"Summarize my started grants"*\n• *"Help me draft my personal note"*\n• *"Which grants am I eligible for?"*\n• *"Tell me about Remember Betty Foundation"*`,
    });
  };

  const askConciergeApi = async (userText: string, sessionId: string) => {
    setSubmitting(true);
    try {
      const res = await fetch(demoSession.available ? '/api/demo/chat' : '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          demoSession.available ? { message: userText } : { message: userText, sessionId }
        ),
      });
      const data = await res.json();
      if (data.session && demoSession.available) {
        demoSession.syncSession(data.session);
      }
      if (res.ok && data.reply) {
        appendMessage({
          role: 'assistant',
          text: data.reply,
        });
        if (typeof data.configured === 'boolean') {
          setGeminiConfigured(data.configured);
        }
        if (data.model) {
          setGeminiModel(data.model);
        }
      } else if (demoSession.available) {
        appendMessage({
          role: 'assistant',
          text: data.error || 'The protected AI demo could not answer this turn.',
        });
      } else {
        generateConciergeReply(userText);
      }
    } catch (err) {
      console.error('[TalkWithApovo] Error calling chat API:', err);
      if (demoSession.available) {
        appendMessage({
          role: 'assistant',
          text: 'The protected AI demo could not connect. Your session remains limited; please try again.',
        });
      } else {
        generateConciergeReply(userText);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSend = async (customText?: string) => {
    const text = (customText ?? inputValue).trim();
    if (!text || submitting) return;

    if (!customText) {
      setInputValue('');
    }

    appendMessage({
      role: 'user',
      text: activeQuestion?.type === 'sensitive_text' ? '••••' : text,
    });

    if (text === 'Answer next question' && answerablePendingQuestions.length > 0) {
      promptQuestionInChat(answerablePendingQuestions[0]);
      return;
    }

    if (activeQuestion) {
      const lower = text.toLowerCase();
      if (lower === 'skip' || lower === 'cancel') {
        setActiveQuestion(null);
        appendMessage({
          role: 'assistant',
          text: 'No problem — we paused that question for now. Let me know what you would like to do next.',
        });
        return;
      }

      // Check if user is asking the concierge for help/clarification rather than submitting an answer
      const isQuestionQuery =
        text.endsWith('?') ||
        lower.startsWith('what ') ||
        lower.startsWith('why ') ||
        lower.startsWith('how ') ||
        lower.startsWith('can you ') ||
        lower.startsWith('could you ') ||
        lower.startsWith('explain ') ||
        lower.startsWith('is this ') ||
        lower.startsWith('does this ') ||
        lower.includes("don't understand") ||
        lower.includes('dont understand') ||
        lower.includes('not sure');

      if (isQuestionQuery) {
        const currentQ = activeQuestion;
        await askConciergeApi(
          `Regarding the question "${currentQ.title}" for "${currentQ.grantName}": ${text}`,
          sessionId
        );
        return;
      }

      await submitAnswerForActiveQuestion(text);
      return;
    }

    const lower = text.toLowerCase();
    if (
      (lower.includes('pending') || lower.includes('walk me through')) &&
      answerablePendingQuestions.length > 0
    ) {
      promptQuestionInChat(answerablePendingQuestions[0]);
      return;
    }

    await askConciergeApi(text, sessionId);
  };

  const patientName = patient?.first_name
    ? `${patient.first_name} ${patient.last_name || ''}`.trim()
    : 'Your profile';

  return (
    <AppShell
      patientName={patientName}
      careEmail={patient?.care_email}
      openTasksCount={pendingItemsCount}
      unreadEmailsCount={unreadEmailsCount}
      onRefreshData={() => void loadContext()}
    >
      <div className="talk-layout">
        <section className="chat-column" aria-label="Talk with Apovo conversation">
          <div className="chat-header-bar">
            <div className="header-meta">
              <h1 className="header-title">Talk with Apovo</h1>
              <span className="header-desc">Empathetic care navigation & grant assistance</span>
            </div>
            <div className="header-status">
              <span
                className={`engine-pill ${geminiConfigured ? 'active' : 'pending'}`}
                title={
                  geminiConfigured
                    ? `Powered by Google ADK & ${geminiModel}`
                    : 'Set GEMINI_API_KEY in .env.local to activate dynamic reasoning with Gemini'
                }
              >
                <Sparkles size={13} />
                {geminiConfigured ? `Gemini (Google ADK)` : 'Google ADK · Set GEMINI_API_KEY'}
              </span>
              {demoSession.available && demoSession.session ? (
                <span className="engine-pill active" title="AI turns remaining in this 15-minute demo session">
                  {demoSession.session.remaining.chatTurns} AI turns left
                </span>
              ) : null}
              <button
                type="button"
                className="reset-chat-btn"
                onClick={handleResetChat}
                title="Start a fresh conversation"
                aria-label="Start a fresh conversation"
              >
                <RotateCcw size={13} />
                <span>New Chat</span>
              </button>
            </div>
          </div>

          <div className="messages-stream" aria-live="polite" ref={messagesStreamRef}>
            <div className="messages-container">
              {loading ? (
                <div className="loading-state">
                  <Sparkles size={22} />
                  <span>Connecting to your Apovo Care Concierge…</span>
                </div>
              ) : (
                messages.map((msg) => (
                  <React.Fragment key={msg.id}>
                    <article className={`message-row ${msg.role}`}>
                      {msg.role === 'assistant' && (
                        <div className="message-avatar" aria-hidden="true">
                          <Sparkles size={16} />
                        </div>
                      )}
                      <div className="message-content">
                        {msg.role === 'assistant' && (
                          <div className="message-meta">
                            <strong>Apovo</strong>
                            <span>{msg.timestamp}</span>
                          </div>
                        )}
                        <div className="message-bubble">
                          <div className="message-text">
                            <FormattedMessage text={msg.text} />
                          </div>

                          {msg.questionContext?.options && msg.questionContext.options.length > 0 && (
                            <div className="inline-options">
                              {msg.questionContext.options.map((opt) => (
                                <button
                                  key={opt}
                                  type="button"
                                  className="option-btn"
                                  disabled={submitting || activeQuestion?.id !== msg.questionContext?.id}
                                  onClick={() => void handleSend(opt)}
                                >
                                  {opt.length > 60 ? 'Use this draft' : opt}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </article>

                    {msg.id === 'msg_welcome' && messages.length === 1 && (
                      <div className="prompt-grid" aria-label="Suggested conversation starters">
                        {SUGGESTED_PROMPTS.map((prompt) => {
                          const Icon = prompt.icon;
                          return (
                            <button
                              key={prompt.text}
                              type="button"
                              className="prompt-card"
                              onClick={() => {
                                setActiveQuestion(null);
                                void handleSend(prompt.text);
                              }}
                              disabled={submitting}
                            >
                              <span className="prompt-icon"><Icon size={18} /></span>
                              <span className="prompt-copy">
                                <strong>{prompt.label}</strong>
                                <span>{prompt.description}</span>
                              </span>
                              <ArrowRight size={15} className="prompt-arrow" />
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </React.Fragment>
                ))
              )}
              {submitting && !activeQuestion && (
                <article className="message-row assistant typing-row">
                  <div className="message-avatar" aria-hidden="true">
                    <Sparkles size={16} />
                  </div>
                  <div className="message-content">
                    <div className="message-meta">
                      <strong>Apovo</strong>
                      <span>{geminiConfigured ? 'Thinking with Gemini…' : 'Thinking…'}</span>
                    </div>
                    <div className="message-bubble typing-bubble">
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </div>
                  </div>
                </article>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <div className="composer-area">
            {activeQuestion && (
              <div className="active-question-banner">
                <div className="active-question-info">
                  <span className="question-tag">Answering for {activeQuestion.grantName}</span>
                  <strong className="question-title">{activeQuestion.title}</strong>
                </div>
                <div className="question-banner-actions">
                  <button
                    type="button"
                    className="banner-action-btn ask-btn"
                    onClick={() => {
                      const q = activeQuestion;
                      setActiveQuestion(null);
                      void handleSend(
                        `Can you explain what "${q.title}" for ${q.grantName} is asking and what I need to provide?`
                      );
                    }}
                    title="Ask the concierge for help understanding this question"
                  >
                    <HelpCircle size={13} />
                    <span>Ask Apovo</span>
                  </button>
                  <button
                    type="button"
                    className="banner-action-btn cancel-btn"
                    onClick={() => {
                      setActiveQuestion(null);
                      appendMessage({
                        role: 'assistant',
                        text: 'Paused answering that question. Let me know what else you would like to work on!',
                      });
                    }}
                    aria-label="Skip answering this question"
                    title="Skip question"
                  >
                    <X size={13} />
                    <span>Skip</span>
                  </button>
                </div>
              </div>
            )}

            <form
              className="chat-composer"
              onSubmit={(e) => {
                e.preventDefault();
                void handleSend();
              }}
            >
              <textarea
                rows={1}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder={
                  activeQuestion
                    ? `Answer “${activeQuestion.title}”`
                    : 'Message Apovo'
                }
                maxLength={demoSession.available ? 2_000 : undefined}
                disabled={
                  submitting ||
                  (demoSession.available &&
                    (!demoSession.session?.active || demoSession.session.remaining.chatTurns <= 0))
                }
                aria-label="Message Apovo"
              />
              <button
                type="submit"
                className="send-btn"
                disabled={
                  !inputValue.trim() ||
                  submitting ||
                  (demoSession.available &&
                    (!demoSession.session?.active || demoSession.session.remaining.chatTurns <= 0))
                }
                aria-label={submitting ? 'Saving answer' : activeQuestion ? 'Save answer' : 'Send message'}
                title={activeQuestion ? 'Save answer' : 'Send message'}
              >
                <ArrowUp size={19} strokeWidth={2.2} />
              </button>
            </form>
            <p className="composer-note">
              {demoSession.available
                ? 'Synthetic demo only. AI can make mistakes; do not enter real information.'
                : 'Apovo can make mistakes. Check important application details.'}
            </p>
          </div>
        </section>
      </div>

      <style jsx>{`
        .talk-layout { min-width: 0; }
        .chat-column {
          height: calc(100dvh - 164px);
          min-height: 640px;
          min-width: 0;
          display: flex;
          flex-direction: column;
          background: var(--paper);
          overflow: hidden;
        }
        .chat-header-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 28px;
          border-bottom: 1px solid var(--line);
          background: var(--paper);
          flex-shrink: 0;
        }
        .header-meta {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .header-title {
          margin: 0;
          font-size: 1.05rem;
          font-weight: 700;
          color: var(--ink);
          letter-spacing: -0.01em;
        }
        .header-desc {
          font-size: 0.78rem;
          color: var(--ink-muted);
        }
        .header-status {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .reset-chat-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 5px 11px;
          border-radius: 999px;
          font-size: 0.72rem;
          font-weight: 600;
          background: var(--surface-soft);
          color: var(--ink-muted);
          border: 1px solid var(--line);
          cursor: pointer;
          transition: all 150ms ease;
        }
        .reset-chat-btn:hover {
          background: rgba(180, 82, 109, 0.08);
          color: var(--rose);
          border-color: rgba(180, 82, 109, 0.3);
        }
        .engine-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 11px;
          border-radius: 999px;
          font-size: 0.72rem;
          font-weight: 600;
          letter-spacing: 0.01em;
          transition: all 150ms ease;
        }
        .engine-pill.active {
          background: rgba(180, 82, 109, 0.1);
          color: var(--rose);
          border: 1px solid rgba(180, 82, 109, 0.25);
        }
        .engine-pill.pending {
          background: var(--surface-soft);
          color: var(--ink-muted);
          border: 1px solid var(--line);
        }
        .messages-stream { flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: thin; }
        .messages-container { width: min(100%, 790px); margin: 0 auto; padding: 36px 24px 28px; }
        .loading-state {
          min-height: 280px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          color: var(--ink-muted);
          font-size: 0.9rem;
        }
        .loading-state :global(svg) { color: var(--rose); }
        .message-row { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 28px; }
        .message-row.user { justify-content: flex-end; margin-top: 32px; margin-bottom: 32px; }
        .message-avatar {
          width: 30px;
          height: 30px;
          margin-top: 1px;
          border: 1px solid rgba(180, 82, 109, 0.24);
          border-radius: 50%;
          display: grid;
          place-items: center;
          flex-shrink: 0;
          background: rgba(180, 82, 109, 0.07);
          color: var(--rose);
        }
        .message-content { min-width: 0; flex: 1; }
        .message-row.user .message-content { flex: 0 1 auto; max-width: 82%; }
        .message-meta {
          min-height: 30px;
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--ink-muted);
          font-size: 0.72rem;
        }
        .message-meta strong { color: var(--ink); font-size: 0.84rem; font-weight: 650; }
        .message-bubble { min-width: 0; }
        .message-row.user .message-bubble {
          padding: 11px 16px;
          border: 1px solid rgba(180, 82, 109, 0.12);
          border-radius: 20px 20px 5px 20px;
          background: rgba(180, 82, 109, 0.09);
        }
        .message-text :global(.formatted-message) {
          color: var(--ink);
          font-size: 0.93rem;
          line-height: 1.68;
        }
        .message-text :global(.msg-paragraph) {
          margin: 0 0 10px;
          overflow-wrap: anywhere;
        }
        .message-text :global(.msg-paragraph:last-child) {
          margin-bottom: 0;
        }
        .message-text :global(.msg-h1) {
          font-size: 1.15rem;
          font-weight: 750;
          margin: 14px 0 8px;
          color: var(--ink);
        }
        .message-text :global(.msg-h2) {
          font-size: 1.05rem;
          font-weight: 700;
          margin: 12px 0 6px;
          color: var(--ink);
        }
        .message-text :global(.msg-h3) {
          font-size: 0.96rem;
          font-weight: 650;
          margin: 10px 0 6px;
          color: var(--ink);
        }
        .message-text :global(.msg-list) {
          margin: 6px 0 12px;
          padding-left: 20px;
        }
        .message-text :global(.msg-list.unordered) {
          list-style-type: disc;
        }
        .message-text :global(.msg-list.ordered) {
          list-style-type: decimal;
        }
        .message-text :global(.msg-list-item) {
          margin-bottom: 5px;
          line-height: 1.6;
        }
        .message-text :global(.msg-list-item:last-child) {
          margin-bottom: 0;
        }
        .message-text :global(.msg-blockquote) {
          margin: 10px 0;
          padding: 8px 14px;
          border-left: 3px solid var(--rose);
          background: rgba(180, 82, 109, 0.05);
          border-radius: 0 8px 8px 0;
          font-style: italic;
          color: var(--ink);
        }
        .message-text :global(.msg-inline-code) {
          padding: 2px 5px;
          background: rgba(0, 0, 0, 0.05);
          border-radius: 4px;
          font-size: 0.85em;
          font-family: monospace;
        }
        .message-text :global(.msg-codeblock) {
          margin: 10px 0;
          padding: 12px;
          background: var(--surface-soft);
          border-radius: 8px;
          overflow-x: auto;
          font-size: 0.85em;
          font-family: monospace;
        }
        .message-text :global(.msg-link) {
          color: var(--rose);
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .message-text :global(strong) {
          font-weight: 650;
          color: var(--ink);
        }
        .inline-options { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
        .option-btn {
          padding: 8px 14px;
          border: 1px solid rgba(180, 82, 109, 0.45);
          border-radius: 999px;
          background: var(--paper);
          color: var(--rose);
          font: inherit;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
        }
        .option-btn:hover:not(:disabled) { background: rgba(180, 82, 109, 0.07); }
        .option-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .prompt-grid {
          margin: -8px 0 30px 42px;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .prompt-card {
          min-height: 86px;
          padding: 15px;
          border: 1px solid var(--line);
          border-radius: 14px;
          display: flex;
          align-items: center;
          gap: 11px;
          background: var(--paper);
          color: var(--ink);
          font: inherit;
          text-align: left;
          cursor: pointer;
          transition: border-color 150ms ease, background 150ms ease;
        }
        .prompt-card:hover:not(:disabled) {
          border-color: rgba(180, 82, 109, 0.4);
          background: rgba(180, 82, 109, 0.035);
        }
        .prompt-card:disabled { opacity: 0.55; cursor: wait; }
        .prompt-icon {
          width: 34px;
          height: 34px;
          border-radius: 10px;
          display: grid;
          place-items: center;
          flex-shrink: 0;
          background: var(--surface-soft);
          color: var(--rose);
        }
        .prompt-copy { min-width: 0; display: flex; flex: 1; flex-direction: column; gap: 4px; }
        .prompt-copy strong { font-size: 0.83rem; font-weight: 650; }
        .prompt-copy > span { color: var(--ink-muted); font-size: 0.73rem; line-height: 1.4; }
        .prompt-arrow { flex-shrink: 0; color: var(--ink-muted); }
        .composer-area { width: min(100%, 790px); margin: 0 auto; padding: 10px 24px 0; flex-shrink: 0; }
        .active-question-banner {
          margin-bottom: 9px;
          padding: 10px 14px;
          border: 1px solid rgba(180, 82, 109, 0.22);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          background: rgba(180, 82, 109, 0.06);
        }
        .active-question-info {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .question-tag {
          color: var(--rose);
          font-size: 0.72rem;
          font-weight: 650;
        }
        .question-title {
          overflow: hidden;
          color: var(--ink);
          font-size: 0.83rem;
          font-weight: 600;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .question-banner-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }
        .banner-action-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 5px 11px;
          border-radius: 999px;
          font-size: 0.74rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 140ms ease;
        }
        .banner-action-btn.ask-btn {
          background: var(--paper);
          color: var(--rose);
          border: 1px solid rgba(180, 82, 109, 0.35);
        }
        .banner-action-btn.ask-btn:hover {
          background: rgba(180, 82, 109, 0.08);
        }
        .banner-action-btn.cancel-btn {
          background: transparent;
          color: var(--ink-muted);
          border: 1px solid var(--line);
        }
        .banner-action-btn.cancel-btn:hover {
          background: var(--paper);
          color: var(--ink);
        }
        .chat-composer {
          min-height: 58px;
          border: 1px solid var(--line);
          border-radius: 26px;
          position: relative;
          background: var(--paper);
          box-shadow: 0 5px 24px rgba(55, 35, 42, 0.07);
          transition: border-color 150ms ease, box-shadow 150ms ease;
        }
        .chat-composer:focus-within {
          border-color: rgba(180, 82, 109, 0.5);
          box-shadow: 0 5px 24px rgba(55, 35, 42, 0.07), 0 0 0 3px rgba(180, 82, 109, 0.08);
        }
        .chat-composer textarea {
          width: 100%;
          min-height: 56px;
          max-height: 150px;
          padding: 17px 58px 15px 20px;
          border: 0;
          border-radius: inherit;
          display: block;
          resize: none;
          overflow-y: auto;
          field-sizing: content;
          background: transparent;
          color: var(--ink);
          font: inherit;
          font-size: 0.93rem;
          line-height: 1.5;
        }
        .chat-composer textarea:focus { outline: none; }
        .chat-composer textarea::placeholder { color: var(--ink-muted); opacity: 0.8; }
        .send-btn {
          width: 36px;
          height: 36px;
          padding: 0;
          border: 0;
          border-radius: 50%;
          display: grid;
          place-items: center;
          position: absolute;
          right: 10px;
          bottom: 10px;
          background: var(--rose);
          color: var(--paper);
          cursor: pointer;
        }
        .send-btn:hover:not(:disabled) { filter: brightness(0.94); }
        .send-btn:disabled { background: var(--surface-soft); color: var(--ink-muted); cursor: not-allowed; opacity: 0.7; }
        .composer-note { margin: 8px 0 0; color: var(--ink-muted); font-size: 0.68rem; text-align: center; }
        .typing-bubble {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 10px 16px;
          border-radius: 18px;
          background: rgba(180, 82, 109, 0.06);
          border: 1px solid rgba(180, 82, 109, 0.15);
        }
        .typing-dot {
          width: 6px;
          height: 6px;
          background: var(--rose);
          border-radius: 50%;
          animation: typingPulse 1.4s infinite ease-in-out both;
        }
        .typing-dot:nth-child(1) { animation-delay: -0.32s; }
        .typing-dot:nth-child(2) { animation-delay: -0.16s; }
        @keyframes typingPulse {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
        .prompt-card:focus-visible, .option-btn:focus-visible, .cancel-question-btn:focus-visible,
        .send-btn:focus-visible { outline: 2px solid var(--rose); outline-offset: 3px; }
        @media (max-width: 1180px) {
          .messages-container, .composer-area { padding-inline: 12px; }
          .prompt-copy > span { display: none; }
          .prompt-card { min-height: 62px; }
        }
        @media (max-width: 980px) {
          .chat-column { height: auto; min-height: calc(100dvh - 150px); overflow: visible; }
          .messages-stream { overflow: visible; }
          .messages-container { padding-top: 30px; }
          .composer-area { padding-bottom: 10px; }
        }
        @media (max-width: 620px) {
          .messages-container { padding: 24px 0; }
          .message-row { gap: 9px; }
          .message-row.user .message-content { max-width: 90%; }
          .message-text p { font-size: 0.9rem; }
          .prompt-grid { margin-left: 0; grid-template-columns: 1fr; }
          .prompt-copy > span { display: block; }
          .composer-area { padding-inline: 0; }
        }
        @media (max-width: 860px) {
          .talk-layout { margin: -24px -20px 0; }
          .chat-column { height: calc(100dvh - 60px - 92px - env(safe-area-inset-bottom)); min-height: 480px; overflow: hidden; }
          .chat-header-bar { padding: 12px 16px; }
          .header-desc, .engine-pill { display: none; }
          .reset-chat-btn { min-width: 44px; min-height: 44px; justify-content: center; }
          .reset-chat-btn span { display: none; }
          .messages-stream { overflow-y: auto; overscroll-behavior: contain; }
          .messages-container { padding: 22px 16px; }
          .composer-area { padding: 8px 12px 10px; background: var(--paper); border-top: 1px solid var(--line); }
          .chat-composer textarea { font-size: 16px; }
          .send-btn { width: 44px; height: 44px; right: 7px; bottom: 7px; }
          .chat-composer textarea { padding-right: 58px; }
          .composer-note { margin-top: 6px; }
          .active-question-banner { align-items: flex-start; flex-direction: column; }
          .question-banner-actions { width: 100%; }
          .banner-action-btn { min-height: 44px; flex: 1; justify-content: center; }
        }
        @media (prefers-reduced-motion: reduce) {
          .prompt-card, .chat-composer { transition: none; }
        }
      `}</style>
    </AppShell>
  );
}
