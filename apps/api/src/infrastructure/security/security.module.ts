import { Global, Module } from '@nestjs/common';
import { DemoTokens } from './demo-tokens.js';
import { UserAuthGuard } from './user-auth.guard.js';
import { UserTokens } from './user-tokens.js';
import { ViewerAuthGuard } from './viewer-auth.guard.js';

@Global()
@Module({
  providers: [UserTokens, DemoTokens, UserAuthGuard, ViewerAuthGuard],
  exports: [UserTokens, DemoTokens, UserAuthGuard, ViewerAuthGuard],
})
export class SecurityModule {}
