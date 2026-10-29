'use client';

import React, { useState } from 'react';

interface ConsentPanelProps {
  patientName: string;
  onAgree: (signature: string) => void;
  loading?: boolean;
}

export function ConsentPanel({ patientName, onAgree, loading = false }: ConsentPanelProps) {
  const [isChecked, setIsChecked] = useState(false);
  const [typedSignature, setTypedSignature] = useState('');

  const trimmedPatient = patientName.trim().toLowerCase();
  const trimmedSignature = typedSignature.trim().toLowerCase();

  const isSignatureValid =
    typedSignature.trim().length >= 3 &&
    (trimmedPatient === '' ||
      trimmedSignature === trimmedPatient ||
      trimmedSignature.includes(trimmedPatient.split(' ')[0]));

  const canSubmit = isChecked && isSignatureValid;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && canSubmit && !loading) {
      e.preventDefault();
      onAgree(typedSignature.trim());
    }
  };

  return (
    <div className="question-block">
      <h1 className="question-title">Permission to act on your behalf</h1>
      <p className="question-subtitle">
        Because assistance programs correspond directly with patients, Apovo acts as your authorized care representative.
      </p>

      <div
        style={{
          width: '100%',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '20px',
          padding: '22px 24px',
          backgroundColor: 'var(--surface-soft)',
          border: '1px solid var(--line)',
          borderRadius: '8px',
          marginBottom: '24px',
        }}
      >
        <div>
          <h2 style={{ fontSize: '0.98rem', fontWeight: 500, marginBottom: '10px', color: 'var(--ink)' }}>
            What Apovo will do
          </h2>
          <ul
            style={{
              listStyle: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              fontSize: '0.92rem',
              color: 'var(--ink-muted)',
              lineHeight: 1.5,
            }}
          >
            <li>Create a dedicated care email address in your name</li>
            <li>Prepare grant and support forms from your profile</li>
            <li>Follow up with foundations until a decision arrives</li>
          </ul>
        </div>

        <div>
          <h2 style={{ fontSize: '0.98rem', fontWeight: 500, marginBottom: '10px', color: 'var(--ink)' }}>
            What Apovo will never do
          </h2>
          <ul
            style={{
              listStyle: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              fontSize: '0.92rem',
              color: 'var(--ink-muted)',
              lineHeight: 1.5,
            }}
          >
            <li>Never submit an application without your review and approval</li>
            <li>Never sign medical releases or declarations without you</li>
            <li>Never share details beyond what a program asks for</li>
          </ul>
        </div>
      </div>

      <label
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '14px',
          padding: '16px 18px',
          backgroundColor: 'var(--surface-soft)',
          border: `1px solid ${isChecked ? 'var(--rose)' : 'var(--line)'}`,
          borderRadius: '8px',
          cursor: 'pointer',
          marginBottom: '22px',
        }}
      >
        <input
          type="checkbox"
          checked={isChecked}
          onChange={(e) => setIsChecked(e.target.checked)}
          style={{
            width: '18px',
            height: '18px',
            marginTop: '3px',
            accentColor: 'var(--rose)',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: '0.95rem', color: 'var(--ink)', lineHeight: 1.5 }}>
          I authorize Apovo to evaluate eligibility and prepare application materials. Nothing may be sent without my explicit approval and a confirmed delivery method.
        </span>
      </label>

      <div style={{ width: '100%' }}>
        <label className="minimal-field-label" htmlFor="signatureInput">
          Full legal name signature {patientName.trim() ? `(${patientName.trim()})` : ''}
        </label>
        <input
          id="signatureInput"
          type="text"
          className="minimal-input"
          placeholder={patientName.trim() || 'Your full legal name'}
          value={typedSignature}
          onChange={(e) => setTypedSignature(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>

      <div className="question-actions">
        <button
          type="button"
          onClick={() => onAgree(typedSignature.trim())}
          disabled={!canSubmit || loading}
          className="minimal-btn minimal-btn-rose"
        >
          {loading ? 'Preparing your care inbox…' : 'Agree and continue'}
        </button>
        {canSubmit && !loading && <span className="enter-hint">Press Enter</span>}
      </div>
    </div>
  );
}
