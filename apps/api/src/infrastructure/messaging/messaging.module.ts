import { Global, Module } from '@nestjs/common';
import { MessageDelivery } from './message-delivery.js';
import { ServerMessages } from './server-messages.js';

@Global()
@Module({
  providers: [MessageDelivery, ServerMessages],
  exports: [MessageDelivery, ServerMessages],
})
export class MessagingModule {}
