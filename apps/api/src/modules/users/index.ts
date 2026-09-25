// Public entry point of the users module (ADR-001). Other modules import from here only.
export { UsersModule } from './users.module.js';
export { UsersService, type SignInCandidate } from './users.service.js';
export { parseIdentifier, type Identifier } from './identifier.js';
