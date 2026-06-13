import 'reflect-metadata';
import { IS_PUBLIC_KEY, Public } from './public.decorator';
import { ROLES_KEY, Roles } from './roles.decorator';

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
