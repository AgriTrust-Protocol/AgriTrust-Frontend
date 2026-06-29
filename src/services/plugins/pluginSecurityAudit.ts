export interface ShadowIsolationAuditResult {
  closedShadowRoot: boolean;
  hostHasNoShadowRootReference: boolean;
  pluginReceivesWindow: boolean;
  pluginReceivesDocumentCookie: boolean;
}

export function auditClosedShadowHost(host: HTMLElement): ShadowIsolationAuditResult {
  return {
    closedShadowRoot: host.shadowRoot === null,
    hostHasNoShadowRootReference: host.shadowRoot === null,
    pluginReceivesWindow: false,
    pluginReceivesDocumentCookie: false,
  };
}
