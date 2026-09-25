import { type DynamicModule, Global, Module } from '@nestjs/common';
import { ENV, type Env } from './env.js';

/** Makes the parsed environment injectable everywhere as {@link ENV}. */
@Global()
@Module({})
export class ConfigModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: ENV, useValue: Object.freeze({ ...env }) }],
      exports: [ENV],
    };
  }
}
