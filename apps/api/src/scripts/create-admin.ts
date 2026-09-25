// Creates an admin account from the command line. The first Super Admin can only be created here.
//
//   npm run admin:create -w @doktool/api -- --email doctor@example.dz --name "Dr Amina B." [--preset SUPER_ADMIN]
//
// A random password is generated and printed once. At first sign-in the admin enrols TOTP.
import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { loadEnv } from '../config/env.js';
import { AdminAccountsService, PRESETS, type Preset } from '../modules/admin-auth/index.js';

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    name: { type: 'string' },
    preset: { type: 'string', default: 'SUPER_ADMIN' },
  },
});

const presets = Object.keys(PRESETS) as Preset[];
if (!values.email || !values.name || !presets.includes(values.preset as Preset)) {
  console.error(
    `Usage: --email <e-mail> --name "<full name>" [--preset ${presets.join('|')}] (default SUPER_ADMIN)`,
  );
  process.exit(2);
}

const env = { ...loadEnv(process.env), JOBS_ENABLED: false };
const app = await NestFactory.createApplicationContext(AppModule.forRoot(env), {
  logger: ['error'],
});
try {
  const password = randomBytes(18).toString('base64url');
  const { id } = await app.get(AdminAccountsService).create({
    email: values.email,
    fullName: values.name,
    password,
    preset: values.preset as Preset,
    grantedById: null,
  });
  console.log(`Admin ${values.email} created (${values.preset}, id ${id}).`);
  console.log(`One-time password (store it now, it is not shown again): ${password}`);
  console.log('At first sign-in Admin Web asks to enrol an authenticator app (TOTP).');
} finally {
  await app.close();
}
