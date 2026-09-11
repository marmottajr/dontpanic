import 'reflect-metadata';
import { IS_PUBLIC_KEY, Public } from './public.decorator';
import { ROLES_KEY, Roles } from './roles.decorator';
import { SENSITIVE_THROTTLE_KEY, SensitiveThrottle } from './sensitive-throttle.decorator';
import { REQUIRE_CAPTCHA_KEY, RequireCaptcha } from './require-captcha.decorator';

describe('@Public()', () => {
  it('sets the isPublic metadata flag to true on the handler', () => {
    class Ctrl {
      @Public()
      handler() {}
    }
    const meta = Reflect.getMetadata(IS_PUBLIC_KEY, Ctrl.prototype.handler);
    expect(meta).toBe(true);
  });
});

describe('@Roles()', () => {
  it('stores the required roles list', () => {
    class Ctrl {
      @Roles('ADMIN', 'USER')
      handler() {}
    }
    const meta = Reflect.getMetadata(ROLES_KEY, Ctrl.prototype.handler);
    expect(meta).toEqual(['ADMIN', 'USER']);
  });

  it('stores an empty array when called with no roles', () => {
    class Ctrl {
      @Roles()
      handler() {}
    }
    expect(Reflect.getMetadata(ROLES_KEY, Ctrl.prototype.handler)).toEqual([]);
  });
});

describe('@SensitiveThrottle()', () => {
  it('flags the handler so the guard picks the tight budget', () => {
    class Ctrl {
      @SensitiveThrottle()
      handler() {}
    }
    expect(Reflect.getMetadata(SENSITIVE_THROTTLE_KEY, Ctrl.prototype.handler)).toBe(true);
  });

  it('leaves untagged handlers on the default budget', () => {
    class Ctrl {
      handler() {}
    }
    expect(Reflect.getMetadata(SENSITIVE_THROTTLE_KEY, Ctrl.prototype.handler)).toBeUndefined();
  });
});

describe('@RequireCaptcha()', () => {
  it('stores the action name the provider must match', () => {
    class Ctrl {
      @RequireCaptcha('login')
      handler() {}
    }
    expect(Reflect.getMetadata(REQUIRE_CAPTCHA_KEY, Ctrl.prototype.handler)).toBe('login');
  });
});
