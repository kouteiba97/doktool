import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/** Global module exposing the single PrismaService to every module. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
