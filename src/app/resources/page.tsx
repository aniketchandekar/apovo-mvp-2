'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { AppShell } from '@/components/dashboard/AppShell';
import { StartApplicationButton } from '@/components/application-agent/StartApplicationButton';
import { filterResources, getResourceCatalog, resourceCategories, type ResourceFilters } from '@/lib/resource-catalog';
import { ApplicationRecord, PatientProfile } from '@/lib/types';

const ELIGIBILITY_LABEL = {
  eligible: 'Yes, you appear eligible',
  not_eligible: 'No, based on your profile',
  needs_information: 'More information needed',
};

const ELIGIBILITY_FILTERS: Array<{ value: ResourceFilters['eligibility']; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'eligible', label: 'Eligible' },
  { value: 'not_eligible', label: 'Not eligible' },
  { value: 'needs_information', label: 'Needs information' },
];

export default function ResourcesPage() {
  const [patient, setPatient] = useState<PatientProfile | null>(null);
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [eligibility, setEligibility] = useState<ResourceFilters['eligibility']>('all');
  const [category, setCategory] = useState<ResourceFilters['category']>('all');

  const loadResource = useCallback(async () => {
    try {
      const response = await fetch('/api/dashboard', { cache: 'no-store' });
      if (!response.ok) throw new Error('Unable to load resource');
      const data = await response.json();
      setPatient(data.patient || null);
      setApplications(data.applications || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadResource().catch(console.error);
  }, [loadResource]);

  const patientName = patient?.first_name
    ? `${patient.first_name} ${patient.last_name || ''}`.trim()
    : 'Your profile';
  const profileReady = Boolean(patient?.consent_at);
  const profileInProgress = Boolean(patient) && !profileReady;

  const resources = useMemo(() => getResourceCatalog(patient), [patient]);
  const categories = useMemo(() => resourceCategories(resources), [resources]);
  const filtered = useMemo(
    () => filterResources(resources, { eligibility, category }),
    [resources, eligibility, category]
  );

  return (
    <AppShell patientName={patientName} careEmail={patient?.care_email} onRefreshData={loadResource}>
      {!profileReady && !loading ? (
        <div className="catalog-notice">
          <p>
            {profileInProgress
              ? 'Your profile is started. You can apply with Apovo anytime, or finish your care profile to refine matching.'
              : 'Resources are open to everyone. You can apply with Apovo for any program below or customize your care profile.'}
          </p>
          <Link href="/onboarding" className="minimal-btn minimal-btn-secondary">
            {profileInProgress ? 'Edit care profile' : 'Set up care profile'}
          </Link>
        </div>
      ) : null}

      <div className="resource-filters" aria-label="Resource filters">
        <div className="filter-group" role="group" aria-label="Filter by eligibility">
          <span className="filter-label">Eligibility</span>
          <div className="filter-options">
            {ELIGIBILITY_FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                data-active={eligibility === option.value}
                aria-pressed={eligibility === option.value}
                onClick={() => setEligibility(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-group" role="group" aria-label="Filter by category">
          <span className="filter-label">Category</span>
          <div className="filter-options">
            {(['all', ...categories] as const).map((option) => (
              <button
                key={option}
                type="button"
                data-active={category === option}
                aria-pressed={category === option}
                onClick={() => setCategory(option)}
              >
                {option === 'all' ? 'All' : option}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? <p>Loading resources…</p> : null}

      {!loading && filtered.length === 0 ? (
        <div className="empty-resources">
          <h2>No resources match these filters</h2>
          <p>Try a different eligibility or category filter.</p>
          <button type="button" className="minimal-btn minimal-btn-secondary" onClick={() => { setEligibility('all'); setCategory('all'); }}>
            Clear filters
          </button>
        </div>
      ) : null}

      <div className="resource-grid">
        {filtered.map((resource) => {
          const eligibilityStatus = resource.eligibility.status;
          const matchedApp = applications.find((a) => a.resource_id === resource.id);
          const applicationId = matchedApp?.id || `app_${resource.id}_${patient?.id || 'active'}`;
          return (
            <article className="resource-card" key={resource.id}>
              <div>
                <div className="resource-eyebrow">{resource.category}</div>
                <h1>{resource.name}</h1>

                <div className="resource-amount">
                  <span>Grant amount</span>
                  <strong>{resource.est_value || 'Amount varies'}</strong>
                </div>

                <p className="resource-description">{resource.description}</p>

                <div className="resource-eligibility">
                  <span>Eligible</span>
                  <strong data-status={eligibilityStatus}>{ELIGIBILITY_LABEL[eligibilityStatus]}</strong>
                </div>

                {eligibilityStatus === 'not_eligible' && (
                  <p className="ineligibility-hint">
                    Profile may not meet all screening criteria, but you can still apply with Apovo.
                  </p>
                )}
              </div>

              <div className="resource-actions">
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noreferrer"
                  className="minimal-btn minimal-btn-secondary"
                >
                  Apply Manually <ExternalLink size={15} />
                </a>
                <StartApplicationButton applicationId={applicationId} />
              </div>
            </article>
          );
        })}
      </div>

      <style jsx>{`
        .catalog-notice {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          padding: 14px 18px;
          margin-bottom: 20px;
          border: 1px solid var(--line);
          border-radius: 12px;
          background: var(--paper);
        }
        .catalog-notice p { margin: 0; color: var(--ink-muted); font-size: 0.88rem; line-height: 1.5; }
        .catalog-notice :global(a) { white-space: nowrap; text-decoration: none; }

        .resource-filters { display: grid; gap: 12px; margin-bottom: 22px; }
        .filter-group { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
        .filter-label { min-width: 74px; color: var(--ink-muted); font-size: 0.78rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
        .filter-options { display: flex; gap: 8px; flex-wrap: wrap; }
        .filter-options button {
          min-height: 32px;
          padding: 0 14px;
          border: 1px solid var(--line);
          border-radius: 999px;
          background: var(--paper);
          color: var(--ink-muted);
          font: inherit;
          font-size: 0.8rem;
          cursor: pointer;
        }
        .filter-options button[data-active='true'] { border-color: var(--rose); color: var(--rose); background: rgba(180, 82, 109, 0.07); }

        .empty-resources { padding: 48px 24px; text-align: center; border: 1px dashed var(--line); border-radius: 14px; }
        .empty-resources h2 { font-size: 1.1rem; margin-bottom: 8px; }
        .empty-resources p { color: var(--ink-muted); margin-bottom: 18px; }

        .resource-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 20px;
          min-height: 620px;
          align-items: start;
        }

        .resource-card {
          min-height: 440px;
          padding: 26px;
          border: 1px solid var(--line);
          border-radius: 14px;
          background: var(--paper);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 28px;
        }

        .resource-eyebrow {
          color: var(--rose);
          font-size: 0.76rem;
          font-weight: 700;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          margin-bottom: 10px;
        }

        h1 {
          margin: 0 0 24px;
          font-size: 1.55rem;
          line-height: 1.15;
          letter-spacing: -0.03em;
        }

        .resource-amount,
        .resource-eligibility {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 14px 0;
          border-top: 1px solid var(--line);
        }

        .resource-amount span,
        .resource-eligibility span {
          color: var(--ink-muted);
          font-size: 0.84rem;
        }

        .resource-amount strong,
        .resource-eligibility strong {
          font-size: 0.9rem;
          text-align: right;
        }

        .resource-eligibility strong[data-status='eligible'] { color: #177245; }
        .resource-eligibility strong[data-status='not_eligible'] { color: #a33a3a; }
        .resource-eligibility strong[data-status='needs_information'] { color: #8a5a12; }

        .ineligibility-hint {
          margin: 6px 0 0;
          font-size: 0.78rem;
          color: #a33a3a;
          line-height: 1.4;
          background: rgba(163, 58, 58, 0.06);
          padding: 6px 10px;
          border-radius: 6px;
        }

        .resource-description {
          color: var(--ink-muted);
          font-size: 0.94rem;
          line-height: 1.6;
          margin: 6px 0 10px;
        }

        .resource-actions { display: grid; gap: 10px; }
        .resource-actions :global(a),
        .resource-actions button {
          width: 100%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          min-height: 44px;
        }
        .profile-cta { text-decoration: none; text-align: center; font-size: 0.85rem; }

        @media (max-width: 980px) {
          .resource-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 660px) {
          .resource-grid { min-height: 0; grid-template-columns: 1fr; gap: 16px; }
          .catalog-notice { flex-direction: column; align-items: flex-start; }
          .catalog-notice :global(a) { width: 100%; }
          .filter-group { display: grid; gap: 7px; }
          .filter-options { margin-right: -20px; padding-right: 20px; flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; }
          .filter-options::-webkit-scrollbar { display: none; }
          .filter-options button { min-height: 44px; flex: 0 0 auto; }
          .resource-card { min-height: 0; padding: 20px; gap: 22px; }
          h1 { margin-bottom: 18px; font-size: 1.35rem; text-wrap: balance; }
          .resource-amount, .resource-eligibility { align-items: flex-start; }
          .resource-actions :global(a), .resource-actions button { min-height: 46px; }
        }
      `}</style>
    </AppShell>
  );
}
