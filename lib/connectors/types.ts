export type ConnectorState = 'connected' | 'not_configured' | 'error';

export type ConnectorKind =
  | 'email'
  | 'calendar'
  | 'slack'
  | 'payments'
  | 'notion'
  | 'brain'
  | 'social'
  | 'crm'
  | 'ads'
  | 'creative'
  | 'knowledge'
  | 'local'
  | 'orchestration'
  // Added for the keyless public sources in lib/connectors/free-apis.ts, which
  // are data feeds rather than systems the operator owns.
  | 'analytics';

export type ConnectorStatus = {
  id: string;
  name: string;
  kind: ConnectorKind;
  state: ConnectorState;
  detail: string;
  meta?: Record<string, string | number>;
};
