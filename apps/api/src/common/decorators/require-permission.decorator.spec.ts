import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import {
  PERMISSION_KEY,
  RequirePermission,
  type RequiredPermission,
} from './require-permission.decorator';

describe('@RequirePermission()', () => {
  it('stores the module on the handler, leaving the action to be inferred', () => {
    class Ctrl {
      @RequirePermission('users')
      list() {}
    }
    expect(Reflect.getMetadata(PERMISSION_KEY, Ctrl.prototype.list)).toEqual({
      module: 'users',
      action: undefined,
    });
  });

  it('stores an explicit action when the verb does not describe the operation', () => {
    class Ctrl {
      // A POST that only reads: "create" would be the wrong permission to ask for.
      @RequirePermission('audit', 'export')
      search() {}
    }
    expect(Reflect.getMetadata(PERMISSION_KEY, Ctrl.prototype.search)).toEqual({
      module: 'audit',
      action: 'export',
    });
  });

  it('marks a whole controller when applied to the class', () => {
    @RequirePermission('settings')
    class Ctrl {}
    expect(Reflect.getMetadata(PERMISSION_KEY, Ctrl)).toEqual({
      module: 'settings',
      action: undefined,
    });
  });

  it('leaves an undecorated handler with no permission metadata at all', () => {
    class Ctrl {
      health() {}
    }
    expect(Reflect.getMetadata(PERMISSION_KEY, Ctrl.prototype.health)).toBeUndefined();
  });

  it('lets the method override the class, which is what the guard reads', () => {
    @RequirePermission('users')
    class Ctrl {
      @RequirePermission('users', 'delete')
      remove() {}
      list() {}
    }
    const reflector = new Reflector();
    const targets = (handler: unknown) =>
      [handler, Ctrl] as Parameters<Reflector['getAllAndOverride']>[1];

    expect(
      reflector.getAllAndOverride<RequiredPermission>(
        PERMISSION_KEY,
        targets(Ctrl.prototype.remove),
      ),
    ).toEqual({ module: 'users', action: 'delete' });
    expect(
      reflector.getAllAndOverride<RequiredPermission>(PERMISSION_KEY, targets(Ctrl.prototype.list)),
    ).toEqual({ module: 'users', action: undefined });
  });
});
