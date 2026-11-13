import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { loadEnv } from './config/env.js';

// Server entry point: read and check the environment, build the Nest application, apply the shared
// HTTP settings, then listen on PORT.
const env = loadEnv(process.env);
const app = await NestFactory.create(AppModule.forRoot(env));
configureApp(app, env);
await app.listen(env.PORT);
new Logger('Bootstrap').log(`DokTool API listening on port ${env.PORT} (${env.NODE_ENV})`);
