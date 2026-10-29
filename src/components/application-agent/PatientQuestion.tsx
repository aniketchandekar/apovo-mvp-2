'use client';

import { useState } from 'react';
import type { RequiredInput } from '@/lib/application-agent/types';
import { useRequiredInputs } from './useRequiredInputs';

export function PatientQuestion({
  runId,
  onCompleted,
}: {
  runId: string;
  onCompleted: () => Promise<void> | void;
}) {
  const { current, total, answeredCount, error, busy, answer, upload } = useRequiredInputs(runId, true);

  if (!current) return null;

  return (
    <section className="patient-question" aria-labelledby="question-heading">
      <div className="question-progress">Your answers · {answeredCount} of {total} complete</div>
      <h3 id="question-heading">{current.prompt}</h3>
      <p className="question-reason">{current.reason}</p>
      <QuestionForm
        key={current.id}
        input={current}
        busy={busy}
        isLast={total - answeredCount === 1}
        answer={answer}
        upload={upload}
        onCompleted={onCompleted}
      />
      {error ? <p role="alert" className="question-error">{error}</p> : null}

      <style jsx>{`
        .patient-question { display: grid; gap: 10px; margin-bottom: 24px; padding: 16px; border: 1px solid #e3d3d9; border-radius: 10px; background: #fff; }
        .question-progress { font-size: .68rem; color: #8d8985; text-transform: uppercase; letter-spacing: .05em; }
        h3 { font-size: .9rem; line-height: 1.4; margin: 0; }
        .question-reason { font-size: .76rem; color: #6f6b67; line-height: 1.45; margin: 0; }
        .question-error { margin: 0; color: #8d302f; font-size: .78rem; }
      `}</style>
    </section>
  );
}

function QuestionForm({
  input,
  busy,
  isLast,
  answer,
  upload,
  onCompleted,
}: {
  input: RequiredInput;
  busy: boolean;
  isLast: boolean;
  answer: (input: RequiredInput, value: string) => Promise<boolean>;
  upload: (input: RequiredInput, file: File) => Promise<boolean>;
  onCompleted: () => Promise<void> | void;
}) {
  const [value, setValue] = useState('');
  const [file, setFile] = useState<File | null>(null);

  async function submit(override?: string) {
    const saved = input.input_type === 'file'
      ? file ? await upload(input, file) : false
      : await answer(input, override ?? value);
    if (saved && isLast) await onCompleted();
  }

  return (
    <>
      {input.input_type === 'choice' ? (
        <div className="choice-row">
          {input.options?.map((option) => (
            <button key={option} type="button" disabled={busy} onClick={() => void submit(option)}>
              {option}
            </button>
          ))}
        </div>
      ) : input.input_type === 'file' ? (
        <input
          type="file"
          accept="application/pdf,.pdf"
          aria-label="Diagnosis letter PDF"
          onChange={(event) => setFile(event.target.files?.[0] || null)}
        />
      ) : input.input_type === 'personal_note' ? (
        <textarea
          rows={6}
          value={value}
          maxLength={5000}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Write in your own words. Only you can approve what is included."
        />
      ) : (
        <input
          type={input.input_type === 'date' ? 'date' : input.input_type === 'sensitive_text' ? 'password' : 'text'}
          value={value}
          inputMode={input.input_type === 'sensitive_text' ? 'numeric' : undefined}
          maxLength={input.input_type === 'sensitive_text' ? 4 : undefined}
          autoComplete="off"
          onChange={(event) => setValue(event.target.value)}
        />
      )}

      {input.input_type !== 'choice' ? (
        <button type="button" className="answer-submit" disabled={busy || (input.input_type === 'file' ? !file : false)} onClick={() => void submit()}>
          {busy ? 'Saving…' : input.input_type === 'file' ? 'Upload PDF' : 'Save answer'}
        </button>
      ) : null}

      <style jsx>{`
        .choice-row { display: flex; gap: 8px; }
        input[type='text'], input[type='password'], input[type='date'], textarea { width: 100%; padding: 9px 10px; border: 1px solid #d8d4cf; border-radius: 6px; font: inherit; font-size: .84rem; background: #fff; box-sizing: border-box; }
        textarea { resize: vertical; }
        input[type='file'] { font-size: .78rem; }
        .choice-row button, .answer-submit { min-height: 44px; padding: 0 16px; border: 1px solid #b4526d; border-radius: 6px; background: #b4526d; color: #fff; font: inherit; font-size: .8rem; cursor: pointer; width: fit-content; }
        .choice-row button { background: #fff; color: #b4526d; }
        button:disabled { opacity: .55; cursor: wait; }
      `}</style>
    </>
  );
}
