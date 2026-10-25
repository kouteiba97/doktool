import { Global, Module } from '@nestjs/common';
import { PasswordHasher } from './password-hasher.js';

/** Global module that gives every module the password hasher. */
@Global()
@Module({
  providers: [PasswordHasher],
  exports: [PasswordHasher],
})
export class CryptoModule {}
