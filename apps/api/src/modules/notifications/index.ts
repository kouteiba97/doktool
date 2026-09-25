// Public entry point of the notifications module (ADR-001). Other modules import from here only.
export { NotificationsModule } from './notifications.module.js';
export {
  NotificationsService,
  type NewNotification,
  type NotificationParams,
} from './notifications.service.js';
