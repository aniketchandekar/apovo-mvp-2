export type DemoWorkflowPhase =
  | 'browser_live'
  | 'site_inspected'
  | 'source_ready'
  | 'filling_form'
  | 'generating_documents'
  | 'packet_ready'
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
    base64: string;
    byteLength: number;
    pageCount: number;
    sha256: string;
  };
}

export type EmitDemoWorkflowEvent = (event: DemoWorkflowEvent) => Promise<void>;
