import 'server-only';
import type { PatientProfile } from '../../types';
import { ApplicationRunError } from '../../application-agent/errors';
import { AgentMailError, createCareInbox, type AgentMailInboxIdentity } from './client';

export async function provisionPatientInbox(patient: PatientProfile): Promise<AgentMailInboxIdentity> {
  const configuredInbox = process.env.AGENTMAIL_INBOX_ID?.trim();
  if (configuredInbox) {
    return { inboxId: configuredInbox, email: configuredInbox };
  }

  const clean = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
  const baseUsername =
    [clean(patient.first_name), clean(patient.last_name)].filter(Boolean).join('.') || 'apovo-patient';
  const displayName = `${patient.first_name} ${patient.last_name} (Care Concierge)`.trim();
  const clientId = `apovo-patient-${patient.id}`;

  try {
    return await createCareInbox({ username: baseUsername, displayName, clientId });
  } catch (error) {
    if (error instanceof AgentMailError && error.code === 'missing_permission') {
      throw new ApplicationRunError(
        'CONFIGURATION_MISSING',
        'This AgentMail key cannot create new inboxes. Set AGENTMAIL_INBOX_ID to an existing inbox address.'
      );
    }
    if (error instanceof AgentMailError && (error.status === 403 || error.status === 409)) {
      return createCareInbox({
        username: `${baseUsername}-${patient.id.slice(-6)}`,
        displayName,
        clientId,
      });
    }
    throw error;
  }
}
