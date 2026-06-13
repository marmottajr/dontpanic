/**
 * @dontpanic/shared — the single source of truth for API contracts.
 * Both the NestJS API and the Next.js web app import these Zod schemas and
 * inferred types, so the contract can never silently drift between the two.
 */
export * from './common';
export * from './auth';
export * from './user';
