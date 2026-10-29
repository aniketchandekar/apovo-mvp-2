'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { OnboardingShell } from '@/components/onboarding/OnboardingShell';
import { ChipGroup } from '@/components/onboarding/ChipGroup';
import { NeedCard, NeedItem } from '@/components/onboarding/NeedCard';
import { ConsentPanel } from '@/components/onboarding/ConsentPanel';
import { InboxReveal } from '@/components/onboarding/InboxReveal';
import { PatientProfile, ResourceProgram, ApplicationRecord } from '@/lib/types';

const SUPPORT_NEEDS: NeedItem[] = [
  { id: 'bills', title: 'Everyday bills and rent', subtitle: 'Emergency grants for housing, utilities, and groceries' },
  { id: 'transport', title: 'Rides to treatment', subtitle: 'Free transportation to and from appointments' },
  { id: 'cleaning', title: 'Home cleaning', subtitle: 'Residential cleaning sessions while you recover' },
  { id: 'meals', title: 'Meals and groceries', subtitle: 'Prepared meal delivery and food assistance' },
  { id: 'wigs', title: 'Wigs and comfort items', subtitle: 'Headwear, post-surgical garments, and personal care' },
  { id: 'lodging', title: 'Lodging near care', subtitle: 'Hotel and hospitality stays near your cancer center' },
  { id: 'meds', title: 'Prescription co-pays', subtitle: 'Direct relief for treatment and medication costs' },
];

const STAGE_OPTIONS = [
  { label: 'Stage 0', value: '0' },
  { label: 'Stage I', value: 'I' },
  { label: 'Stage II', value: 'II' },
  { label: 'Stage III', value: 'III' },
  { label: 'Stage IV', value: 'IV' },
  { label: 'Not sure', value: 'Not sure' },
];

const TREATMENT_STATUS_OPTIONS = [
  { label: 'In treatment', value: 'In treatment' },
  { label: 'Planning or starting treatment soon', value: 'Planning treatment' },
  { label: 'Finished treatment in the last 12 months', value: 'Finished in last 12 mo' },
  { label: 'In remission / survivorship', value: 'Survivor / In remission' },
];

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialStepParam = parseInt(searchParams.get('step') || '0', 10);

  const [step, setStep] = useState(
    !Number.isNaN(initialStepParam) && searchParams.get('step')
      ? initialStepParam
      : 0
  );
  const [patientId, setPatientId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [careEmail, setCareEmail] = useState('');
  const [matchedPrograms, setMatchedPrograms] = useState<ResourceProgram[]>([]);

  // Reduced onboarding fields; omitted optional-for-onboarding fields keep neutral defaults
  const [formData, setFormData] = useState<Partial<PatientProfile>>(() => ({
          first_name: '',
          last_name: '',
          preferred_name: '',
          dob: '',
          phone: '',
          address_street: '',
          address_city: '',
          address_state: '',
          address_zip: '',
          personal_email: '',
          diagnosis: 'Breast Cancer',
          stage: '',
          treatment_status: '',
          treatment_types: [],
          oncologist_name: '',
          clinic_name: '',
          insurance: 'Private',
          needs: [],
          household_size: 1,
          monthly_income_band: '',
          employment_status: '',
        }));

  const saveDraft = (updated: Partial<PatientProfile>, id?: string, nextStep?: number) => {
    try {
      localStorage.setItem(
        'apovo_onboarding_draft',
        JSON.stringify({
          data: updated,
          patientId: id ?? patientId,
          careEmail,
          step: nextStep ?? step,
        })
      );
    } catch {
      // ignore storage errors
    }
  };

  // Restore an existing patient-entered draft.
  useEffect(() => {
    try {
      const saved = localStorage.getItem('apovo_onboarding_draft');
      if (saved) {
        const parsed = JSON.parse(saved);
        setTimeout(() => {
          if (parsed.data) {
            setFormData((prev) => ({ ...prev, ...parsed.data }));
          }
          if (parsed.patientId) setPatientId(parsed.patientId);
          if (parsed.careEmail) setCareEmail(parsed.careEmail);
        }, 0);
      }
    } catch {
      // ignore
    }
  }, []);

  const updateField = (key: keyof PatientProfile, val: unknown) => {
    setFormData((prev) => {
      const next = { ...prev, [key]: val };
      saveDraft(next);
      return next;
    });
  };

  const syncPatientRecord = async (payload: Partial<PatientProfile>) => {
    try {
      if (patientId) {
        await fetch(`/api/patients/${patientId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        return patientId;
      } else {
        const res = await fetch('/api/patients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.patient?.id) {
          setPatientId(data.patient.id);
          saveDraft(payload, data.patient.id);
          return data.patient.id as string;
        }
      }
    } catch (err) {
      console.error(err);
    }
    return patientId;
  };

  // Step 1: Legal Name (creates the in-progress patient record)
  const canContinueName = Boolean(formData.first_name?.trim() && formData.last_name?.trim());
  const handleNameNext = async () => {
    if (!canContinueName || loading) return;
    setLoading(true);
    await syncPatientRecord(formData);
    setLoading(false);
    setStep(2);
  };

  // Step 2: Date of Birth
  const canContinueDob = Boolean(formData.dob?.trim());
  const handleDobNext = () => {
    if (!canContinueDob) return;
    setStep(3);
  };

  // Step 3: Phone Number
  const canContinuePhone = Boolean(formData.phone?.trim());
  const handlePhoneNext = () => {
    if (!canContinuePhone) return;
    setStep(4);
  };

  // Step 4: ZIP Code (saves initial patient record)
  const canContinueZip = Boolean(formData.address_zip?.trim());
  const handleZipNext = async () => {
    if (!canContinueZip || loading) return;
    setLoading(true);
    await syncPatientRecord(formData);
    setLoading(false);
    setStep(5);
  };

  // Step 5: Cancer Stage (single-choice auto-advance)
  const handleStageSelect = (val: string | string[]) => {
    const stageVal = typeof val === 'string' ? val : val[0] || '';
    const nextData = { ...formData, stage: stageVal };
    setFormData(nextData);
    saveDraft(nextData, undefined, 6);
    if (patientId) {
      fetch(`/api/patients/${patientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: stageVal }),
      }).catch(console.error);
    }
    setStep(6);
  };

  // Step 6: Treatment Status (single-choice auto-advance)
  const handleTreatmentStatusSelect = (val: string | string[]) => {
    const statusVal = typeof val === 'string' ? val : val[0] || '';
    const nextData = { ...formData, treatment_status: statusVal };
    setFormData(nextData);
    saveDraft(nextData, undefined, 7);
    if (patientId) {
      fetch(`/api/patients/${patientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ treatment_status: statusVal }),
      }).catch(console.error);
    }
    setStep(7);
  };

  // Step 7: Support Needs (multi-choice with explicit Continue)
  const canContinueNeeds = (formData.needs?.length || 0) > 0;
  const handleNeedsNext = () => {
    if (!canContinueNeeds) return;
    if (patientId) {
      fetch(`/api/patients/${patientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ needs: formData.needs }),
      }).catch(console.error);
    }
    setStep(8);
  };

  // Step 8: Consent & Signature -> Provision Inbox & Match Programs
  const handleConsentAgree = async (signature: string) => {
    setLoading(true);
    try {
      const activeId = await syncPatientRecord(formData);
      if (!activeId) throw new Error('Could not create patient profile');

      await fetch(`/api/patients/${activeId}/consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature, version: 'v1.0' }),
      });

      const matchRes = await fetch(`/api/patients/${activeId}/match`, {
        method: 'POST',
      });
      const matchData = await matchRes.json();
      if (matchData.applications) {
        setMatchedPrograms(matchData.applications.map((a: ApplicationRecord) => a.resource));
      }

      setStep(9);
    } catch (err) {
      console.error(err);
      setStep(9);
    } finally {
      setLoading(false);
    }
  };

  // Step 9: Navigate to Dashboard
  const handleStartApplying = () => {
    router.push('/dashboard?first=1');
  };

  return (
    <OnboardingShell
      currentStep={step}
      totalSteps={8}
      onBack={() => setStep((s) => Math.max(0, s - 1))}
    >
      {/* ================= 1. WELCOME ================= */}
      {step === 0 && (
        <div
          className="question-block"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '48px',
            alignItems: 'center',
          }}
        >
          <div>
            <h1 className="question-title" style={{ fontSize: 'clamp(2rem, 4vw, 2.85rem)', marginBottom: '16px' }}>
              Let&apos;s find support that fits your care.
            </h1>
            <p className="question-subtitle" style={{ marginBottom: '28px' }}>
              We will ask a few short questions to match you with breast cancer grants and practical help. It takes about two minutes, and nothing is ever submitted without your approval.
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="minimal-btn minimal-btn-rose"
                style={{ padding: '14px 28px' }}
              >
                Begin
              </button>
            </div>
          </div>

          <div
            style={{
              position: 'relative',
              width: '100%',
              aspectRatio: '4 / 3',
              borderRadius: '8px',
              overflow: 'hidden',
              backgroundColor: 'var(--surface-soft)',
            }}
          >
            <Image
              src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=1200&q=85"
              alt="Warm portrait of a woman in natural light"
              fill
              priority
              sizes="(max-width: 820px) 100vw, 440px"
              style={{ objectFit: 'cover' }}
            />
          </div>
        </div>
      )}

      {/* ================= 2. LEGAL FIRST & LAST NAME ================= */}
      {step === 1 && (
        <div className="question-block">
          <h1 className="question-title">What is your legal name?</h1>
          <p className="question-subtitle">
            Foundations use your legal name when issuing grant checks and verifying eligibility.
          </p>

          <div
            style={{
              width: '100%',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '16px',
            }}
          >
            <div>
              <label className="minimal-field-label" htmlFor="firstName">
                First name
              </label>
              <input
                id="firstName"
                type="text"
                className="minimal-input"
                placeholder="First name"
                autoFocus
                value={formData.first_name || ''}
                onChange={(e) => updateField('first_name', e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleNameNext();
                  }
                }}
              />
            </div>

            <div>
              <label className="minimal-field-label" htmlFor="lastName">
                Last name
              </label>
              <input
                id="lastName"
                type="text"
                className="minimal-input"
                placeholder="Garcia"
                value={formData.last_name || ''}
                onChange={(e) => updateField('last_name', e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleNameNext();
                  }
                }}
              />
            </div>
          </div>

          <div className="question-actions">
            <button
              type="button"
              onClick={handleNameNext}
              disabled={!canContinueName || loading}
              className="minimal-btn minimal-btn-primary"
            >
              {loading ? 'Saving…' : 'Continue'}
            </button>
            <span className="enter-hint">Press Enter</span>
          </div>
        </div>
      )}

      {/* ================= 3. DATE OF BIRTH ================= */}
      {step === 2 && (
        <div className="question-block">
          <label htmlFor="dobInput">
            <h1 className="question-title">What is your date of birth?</h1>
          </label>
          <p className="question-subtitle">
            Several financial assistance funds have age-specific eligibility criteria.
          </p>

          <input
            id="dobInput"
            type="date"
            className="minimal-input"
            style={{ maxWidth: '320px' }}
            autoFocus
            value={formData.dob || ''}
            onChange={(e) => updateField('dob', e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleDobNext();
              }
            }}
          />

          <div className="question-actions">
            <button
              type="button"
              onClick={handleDobNext}
              disabled={!canContinueDob}
              className="minimal-btn minimal-btn-primary"
            >
              Continue
            </button>
            <span className="enter-hint">Press Enter</span>
          </div>
        </div>
      )}

      {/* ================= 4. PHONE NUMBER ================= */}
      {step === 3 && (
        <div className="question-block">
          <label htmlFor="phoneInput">
            <h1 className="question-title">What is the best phone number to reach you?</h1>
          </label>
          <p className="question-subtitle">
            Used only when a program or local service needs to confirm a delivery, ride, or appointment.
          </p>

          <input
            id="phoneInput"
            type="tel"
            className="minimal-input"
            style={{ maxWidth: '360px' }}
            placeholder="(512) 555-0194"
            autoFocus
            value={formData.phone || ''}
            onChange={(e) => updateField('phone', e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handlePhoneNext();
              }
            }}
          />

          <div className="question-actions">
            <button
              type="button"
              onClick={handlePhoneNext}
              disabled={!canContinuePhone}
              className="minimal-btn minimal-btn-primary"
            >
              Continue
            </button>
            <span className="enter-hint">Press Enter</span>
          </div>
        </div>
      )}

      {/* ================= 5. ZIP CODE ================= */}
      {step === 4 && (
        <div className="question-block">
          <label htmlFor="zipInput">
            <h1 className="question-title">What is your ZIP code?</h1>
          </label>
          <p className="question-subtitle">
            We use your ZIP code to find regional grants, rides, and home support available in your area.
          </p>

          <input
            id="zipInput"
            type="text"
            inputMode="numeric"
            className="minimal-input"
            style={{ maxWidth: '220px' }}
            placeholder="78741"
            autoFocus
            value={formData.address_zip || ''}
            onChange={(e) => updateField('address_zip', e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleZipNext();
              }
            }}
          />

          <div className="question-actions">
            <button
              type="button"
              onClick={handleZipNext}
              disabled={!canContinueZip || loading}
              className="minimal-btn minimal-btn-primary"
            >
              {loading ? 'Saving…' : 'Continue'}
            </button>
            <span className="enter-hint">Press Enter</span>
          </div>
        </div>
      )}

      {/* ================= 6. CANCER STAGE ================= */}
      {step === 5 && (
        <div className="question-block">
          <h1 className="question-title">What stage is your diagnosis?</h1>
          <p className="question-subtitle">
            Some endowments are reserved for specific stages. Choosing &ldquo;Not sure&rdquo; is completely fine.
          </p>

          <ChipGroup
            name="Cancer stage"
            options={STAGE_OPTIONS}
            value={formData.stage || ''}
            onChange={handleStageSelect}
          />
        </div>
      )}

      {/* ================= 7. TREATMENT STATUS ================= */}
      {step === 6 && (
        <div className="question-block">
          <h1 className="question-title">Where are you in treatment right now?</h1>
          <p className="question-subtitle">
            This helps us prioritize programs for active treatment or recovery.
          </p>

          <ChipGroup
            name="Treatment status"
            options={TREATMENT_STATUS_OPTIONS}
            value={formData.treatment_status || ''}
            onChange={handleTreatmentStatusSelect}
          />
        </div>
      )}

      {/* ================= 8. SUPPORT NEEDS ================= */}
      {step === 7 && (
        <div
          className="question-block"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canContinueNeeds) {
              e.preventDefault();
              handleNeedsNext();
            }
          }}
        >
          <h1 className="question-title">What kind of support would help most?</h1>
          <p className="question-subtitle">
            Choose as many as you like. We will match programs across everything you select.
          </p>

          <div className="choice-list" role="group" aria-label="Support needs">
            {SUPPORT_NEEDS.map((item) => (
              <NeedCard
                key={item.id}
                item={item}
                selected={(formData.needs || []).includes(item.id)}
                onToggle={(id) => {
                  const current = formData.needs || [];
                  const updated = current.includes(id)
                    ? current.filter((x) => x !== id)
                    : [...current, id];
                  updateField('needs', updated);
                }}
              />
            ))}
          </div>

          <div className="question-actions">
            <button
              type="button"
              onClick={handleNeedsNext}
              disabled={!canContinueNeeds}
              className="minimal-btn minimal-btn-primary"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* ================= 9. CONSENT & SIGNATURE ================= */}
      {step === 8 && (
        <ConsentPanel
          patientName={`${formData.first_name || ''} ${formData.last_name || ''}`.trim()}
          onAgree={handleConsentAgree}
          loading={loading}
        />
      )}

      {/* ================= 10. COMPLETION ================= */}
      {step === 9 && (
        <InboxReveal
          careEmail={careEmail}
          matchedPrograms={matchedPrograms}
          onStartApplying={handleStartApplying}
          loading={loading}
        />
      )}
    </OnboardingShell>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="onboarding-shell" style={{ alignItems: 'center', justifyContent: 'center' }}>
          Loading…
        </div>
      }
    >
      <OnboardingContent />
    </Suspense>
  );
}
