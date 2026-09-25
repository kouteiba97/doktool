import { Global, Module } from '@nestjs/common';
import { UserAuthGuard } from './user-auth.guard.js';
import { UserTokens } from './user-tokens.js';

@Global()
@Module({
  providers: [UserTokens, UserAuthGuard],
  exports: [UserTokens, UserAuthGuard],
})
export class SecurityModule {}
