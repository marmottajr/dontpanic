/** @type {import('jest').Config} */
module.exports = {
  rootDir: 'src',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*\\.spec\\.ts$',
  testEnvironment: 'node',
  transform: {
    // ts-jest compiles BOTH .ts (our code) and .js — the latter is needed to
    // down-level the ESM-only deps in the otplib chain (otplib + @otplib/* +
    // @scure/base are "type":"module" and ship native ESM that Node-Jest can't
    // require as-is). Compiling them to CJS via ts-jest keeps the otplib TOTP
    // path real in tests (no mocking of the crypto we want to exercise).
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        // tsconfig.jest.json extends tsconfig.json (decorators +
        // emitDecoratorMetadata), adds jest/node types + spec files, and turns
        // on allowJs so the whitelisted ESM otplib chain compiles to CJS.
        tsconfig: '<rootDir>/../tsconfig.jest.json',
        isolatedModules: false,
      },
    ],
  },
  // By default node_modules is NOT transformed. Whitelist the ESM-only otplib
  // dependency chain so ts-jest can compile it to CommonJS. pnpm nests a second
  // `/node_modules/` segment (…/.pnpm/@scure+base@x/node_modules/@scure/base),
  // so the negative lookahead must allow ANY path that contains one of these
  // package dirs anywhere — hence the `.*` before the package alternation.
  transformIgnorePatterns: ['/node_modules/(?!.*(otplib|@otplib|@scure|@noble))'],
  setupFiles: ['<rootDir>/../test/setup.ts'],
  collectCoverageFrom: [
    '**/*.ts',
    '!**/*.module.ts',
    '!**/*.spec.ts',
    '!main.ts',
    '!**/*.dto.ts',
    // HTTP controllers + the prisma lifecycle + the request-scoped param
    // decorator are the integration surface: they're driven end-to-end by the
    // e2e suite (test/auth.e2e-spec.ts against a real Postgres), not by these
    // infra-free units. Excluding them keeps the UNIT coverage number honest —
    // it reflects the business logic (services/guards/adapters/utils) the unit
    // suite actually exercises. (The e2e run covers the controllers for real.)
    '!**/*.controller.ts',
    '!**/current-user.decorator.ts',
    '!infra/prisma/prisma.service.ts',
  ],
  coverageDirectory: '../coverage',
  coverageReporters: ['text', 'text-summary'],
  // Strong floors at/below the achieved unit numbers (99.2/94.8/100/99.2 for
  // stmts/branches/funcs/lines over the unit-tested business-logic scope). A
  // few points of headroom keep CI deterministic without weakening the gate.
  coverageThreshold: {
    global: {
      statements: 97,
      branches: 92,
      functions: 100,
      lines: 97,
    },
  },
  clearMocks: true,
};
