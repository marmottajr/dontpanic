import { config } from 'dotenv';

// Imported first in main.ts, before anything that reads process.env at module
// load: Sentry in ./instrument and TRUST_PROXY in the Fastify adapter both run
// before @nestjs/config has had a chance to load the file. Same paths as
// ConfigModule's envFilePath, so both see identical values. Real environment
// variables always win — dotenv never overwrites what the process already has.
config({ path: ['../../.env', '.env'], quiet: true });
