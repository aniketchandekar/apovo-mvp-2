'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { ResourceProgram } from '@/lib/types';

interface InboxRevealProps {
  careEmail: string;
  matchedPrograms: ResourceProgram[];
  onStartApplying: () => void;
  loading?: boolean;
}

export function InboxReveal({
  careEmail,
  matchedPrograms,
  onStartApplying,
  loading = false,
}: InboxRevealProps) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    if (!careEmail) return;
    navigator.clipboard.writeText(careEmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="question-block"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '48px',
        alignItems: 'start',
      }}
    >
      <div>
        <h1 className="question-title">Your resource match is ready</h1>
        <p className="question-subtitle" style={{ marginBottom: '24px' }}>
          We found one published program and evaluated it using the information you provided.
        </p>

        {careEmail && <div
          style={{
            padding: '20px 22px',
            backgroundColor: 'var(--surface-soft)',
            border: '1px solid var(--line)',
            borderRadius: '8px',
            marginBottom: '28px',
          }}
        >
          <div style={{ fontSize: '0.84rem', color: 'var(--ink-muted)', marginBottom: '6px' }}>
            Dedicated care email
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                fontSize: '1.12rem',
                fontWeight: 500,
                color: 'var(--ink)',
                wordBreak: 'break-all',
              }}
            >
              {careEmail}
            </span>
            <button
              type="button"
              onClick={copyToClipboard}
              className="minimal-btn minimal-btn-secondary"
              style={{ padding: '7px 14px', minHeight: '34px', fontSize: '0.86rem' }}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>}

        <div
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '16 / 10',
            borderRadius: '8px',
            overflow: 'hidden',
            backgroundColor: 'var(--surface-soft)',
          }}
        >
          <Image
            src="https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1200&q=85"
            alt="Friends sharing a quiet, warm moment together"
            fill
            sizes="(max-width: 820px) 100vw, 440px"
            style={{ objectFit: 'cover' }}
          />
        </div>
      </div>

      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            paddingBottom: '14px',
            borderBottom: '1px solid var(--line)',
            marginBottom: '4px',
          }}
        >
          <h2 style={{ fontSize: '1.15rem', fontWeight: 500 }}>
            Verified resource ({matchedPrograms.length})
          </h2>
        </div>

        <div>
          {matchedPrograms.map((prog) => (
            <div
              key={prog.id}
              style={{
                padding: '18px 0',
                borderBottom: '1px solid var(--line)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  gap: '12px',
                  marginBottom: '6px',
                }}
              >
                <h3 style={{ fontSize: '1.02rem', fontWeight: 500, color: 'var(--ink)' }}>
                  {prog.name}
                </h3>
                <span style={{ fontSize: '0.92rem', fontWeight: 500, color: 'var(--rose)', whiteSpace: 'nowrap' }}>
                  {prog.est_value}
                </span>
              </div>
              <p style={{ fontSize: '0.92rem', color: 'var(--ink-muted)', marginBottom: '6px' }}>
                {prog.description}
              </p>
              <div style={{ fontSize: '0.82rem', color: 'var(--ink-muted)' }}>
                Typical turnaround: {prog.turnaround || '3–5 business days'}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: '28px' }}>
          <button
            type="button"
            onClick={onStartApplying}
            disabled={loading}
            className="minimal-btn minimal-btn-rose"
            style={{ width: '100%', padding: '15px 28px', fontSize: '1.02rem' }}
          >
            {loading ? 'Opening resource…' : 'Review eligibility'}
          </button>
        </div>
      </div>
    </div>
  );
}
