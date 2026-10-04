import { Global, Module } from '@nestjs/common';
import { MessageDelivery } from './message-delivery.js';
import { ServerMessages } from './server-messages.js';
import { InfobipSms } from './sms/infobip.sms.js';
import { TwilioSms } from './sms/twilio.sms.js';

@Global()
@Module({
  providers: [MessageDelivery, ServerMessages, TwilioSms, InfobipSms],
  exports: [MessageDelivery, ServerMessages],
})
export class MessagingModule {}
