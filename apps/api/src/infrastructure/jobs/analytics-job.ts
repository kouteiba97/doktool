// Contract of the server-side analytics events queue: billing publishes, analytics consumes
// (the analytics module depends on access, which depends on billing, so billing cannot call it).

export const ANALYTICS_SERVER_EVENT_JOB = 'analytics.server-event';

export interface ServerAnalyticsEvent extends Record<string, unknown> {
  type: 'SUBSCRIPTION_STARTED' | 'SUBSCRIPTION_RENEWED';
  userId: string;
  occurredAt: string;
  planCode: string;
  planVersion: number;
}
