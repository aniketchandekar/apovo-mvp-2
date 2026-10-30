export type DemoWorkflowPhase =
  | 'browser_live'
  | 'site_inspected'
  | 'source_ready'
  | 'filling_form'
  | 'generating_documents'
  | 'packet_ready'
  | 'packet_ready_no_delivery'
  | 'awaiting_approval'
  | 'sending_email'
  | 'email_sent'
  | 'delivery_uncertain'
  | 'failed';

export interface DemoWorkflowEvent {
  phase: DemoWorkflowPhase;
  message: string;
  liveViewUrl?: string;
  packet?: {
    artifactId: string;
    byteLength: number;
    pageCount: number;
    sha256: string;
  };
}

export interface DemoPacketArtifact {
  artifactId: string;
  base64: string;
  byteLength: number;
  pageCount: number;
  sha256: string;
}

export const DEMO_PACKET_STREAM = 'packet';

export function demoPacketArtifactId(sha256: string) {
  return `packet_${sha256}`;
}

export type EmitDemoWorkflowEvent = (event: DemoWorkflowEvent) => Promise<void>;
