import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { loadEnv } from './config/env.js';

const env = loadEnv(process.env);
const app = await NestFactory.create(AppModule.forRoot(env));
configureApp(app, env);
await app.listen(env.PORT);
new Logger('Bootstrap').log(`DokTool API listening on port ${env.PORT} (${env.NODE_ENV})`);
