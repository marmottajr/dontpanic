import { SkipTwoFactorGate, SKIP_2FA_GATE_KEY } from './skip-two-factor-gate.decorator';

describe('SkipTwoFactorGate', () => {
  it('is a decorator factory exposing the metadata key', () => {
    expect(SKIP_2FA_GATE_KEY).toBe('skipTwoFactorGate');
    expect(typeof SkipTwoFactorGate()).toBe('function');
  });
});
