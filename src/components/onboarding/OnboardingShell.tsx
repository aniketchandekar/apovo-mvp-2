'use client';

import React from 'react';
import Link from 'next/link';

interface OnboardingShellProps {
  currentStep: number;
  totalSteps?: number;
  stepTitle?: string;
  onBack?: () => void;
  children: React.ReactNode;
}

export function OnboardingShell({
  currentStep,
  totalSteps = 8,
  onBack,
  children,
}: OnboardingShellProps) {
  const isQuestionStep = currentStep >= 1 && currentStep <= totalSteps;
  const isWideStep = currentStep === 0 || currentStep > totalSteps;
  const progressPercent = Math.min(100, Math.max(0, (currentStep / totalSteps) * 100));

  return (
    <div className="onboarding-shell">
      {currentStep > 0 && (
        <div
          className="onboarding-progress-track"
          role="progressbar"
          aria-valuenow={Math.min(currentStep, totalSteps)}
          aria-valuemin={0}
          aria-valuemax={totalSteps}
          aria-label="Onboarding progress"
        >
          <div
            className="onboarding-progress-bar"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      <header className="onboarding-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <Link href="/" className="minimal-wordmark">
            apovo
          </Link>
          {onBack && currentStep > 0 && (
            <button
              type="button"
              onClick={onBack}
              className="minimal-btn minimal-btn-ghost"
              aria-label="Go back to previous question"
            >
              ← Back
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          {isQuestionStep && (
            <span
              style={{
                fontSize: '0.9rem',
                color: 'var(--ink-muted)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {currentStep} / {totalSteps}
            </span>
          )}
        </div>
      </header>

      <div className={`onboarding-stage ${isWideStep ? 'onboarding-stage-wide' : ''}`}>
        {children}
      </div>
    </div>
  );
}
