// Public entry point of the billing module (ADR-001). Other modules import from here only.
export { BillingModule } from './billing.module.js';
export {
  SubscriptionStatusService,
  type SubscriptionSnapshot,
} from './subscription-status.service.js';
