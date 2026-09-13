/** @type {import('jest').Config} */
module.exports = {
  rootDir: 'src',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*\\.spec\\.ts$',
  testEnvironment: 'node',
  transform: {
    // Only our own TypeScript. Node 24 requires ESM natively, so the ESM-only
    // otplib chain (otplib + @otplib/* + @scure/base) loads as-is — no
    // down-levelling to CommonJS, and node_modules stays untransformed.
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/../tsconfig.jest.json',
        isolatedModules: false,
      },
    ],
  },
  setupFiles: ['<rootDir>/../test/setup.ts'],
  collectCoverageFrom: [
    '**/*.ts',
    '!**/*.module.ts',
    '!**/*.spec.ts',
    // Bootstrap side-effect modules: they run before the Nest app exists and
    // have no seam a unit test could hold on to.
    '!main.ts',
    '!load-env.ts',
    '!instrument.ts',
    '!**/*.dto.ts',
    // HTTP controllers + the request-scoped param decorator are the
    // integration surface: they're driven end-to-end by the e2e suite
    // (test/auth.e2e-spec.ts against a real Postgres), not by these infra-free
    // units. Excluding them keeps the UNIT coverage number honest — it
    // reflects the business logic (services/guards/adapters/utils) the unit
    // suite actually exercises. (The e2e run covers the controllers for real.)
    // PrismaService is NOT excluded: it stopped being lifecycle glue when
    // tenant isolation moved into it (withScope/asSystem/atomic/db), and that
    // logic is unit-tested in infra/prisma/prisma.service.spec.ts.
    '!**/*.controller.ts',
    '!**/current-user.decorator.ts',
  ],
  coverageDirectory: '../coverage',
  coverageReporters: ['text', 'text-summary'],
  // Strong floors BELOW the achieved unit numbers (~99/95/100/99 for
  // stmts/branches/funcs/lines over the unit-tested business-logic scope). The
  // headroom is the point: a floor set exactly at what the repo happens to
  // score today is a floor that fails on the next contributor's first pull
  // request, for a function they did cover but which dropped the ratio.
  //
  // `functions` used to sit at 100 with no headroom at all, so ANY newly
  // discovered uncovered function turned `pnpm test` red — and the fix people
  // reach for under that pressure is lowering the gate, not writing the test.
  // 98 still means essentially every function is exercised while leaving room
  // for one to slip through and be caught in review instead of by a red build.
  coverageThreshold: {
    global: {
      statements: 97,
      branches: 92,
      functions: 98,
      lines: 97,
    },
  },
  clearMocks: true,
};
