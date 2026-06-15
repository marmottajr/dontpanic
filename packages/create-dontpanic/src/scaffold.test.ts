import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildEnv, copyTemplate, renameContainers, setEnv } from './scaffold.js';

const created: string[] = [];
function tmp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'create-dontpanic-'));
  created.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('copyTemplate', () => {
  it('restores dot-less dotfiles and copies the tree recursively', () => {
    const src = tmp();
    writeFileSync(join(src, 'gitignore'), 'node_modules\n');
    writeFileSync(join(src, 'npmrc'), 'auto-install-peers=true\n');
    writeFileSync(join(src, '.env.example'), 'A=1\n');
    mkdirSync(join(src, 'apps', 'api'), { recursive: true });
    writeFileSync(join(src, 'apps', 'api', 'main.ts'), 'export {};\n');

    const dest = join(tmp(), 'out');
    copyTemplate(src, dest);

    expect(existsSync(join(dest, '.gitignore'))).toBe(true);
    expect(existsSync(join(dest, '.npmrc'))).toBe(true);
    expect(existsSync(join(dest, 'gitignore'))).toBe(false); // not the dot-less form
    expect(existsSync(join(dest, '.env.example'))).toBe(true);
    expect(readFileSync(join(dest, 'apps', 'api', 'main.ts'), 'utf8')).toContain('export');
  });
});

describe('renameContainers', () => {
  it('troca o prefixo dontpanic- pelo nome do projeto em todos os container_name', () => {
    const yml = [
      '  postgres:',
      '    container_name: dontpanic-postgres',
      '  mailpit:',
      '    container_name: dontpanic-mailpit',
    ].join('\n');
    const out = renameContainers(yml, 'my-app');
    expect(out).toContain('container_name: my-app-postgres');
    expect(out).toContain('container_name: my-app-mailpit');
    expect(out).not.toContain('dontpanic-');
  });

  it('does not touch other occurrences of dontpanic (db, bucket, credentials)', () => {
    const yml = [
      '    container_name: dontpanic-postgres',
      '    environment:',
      '      POSTGRES_USER: dontpanic',
      '      POSTGRES_DB: dontpanic',
    ].join('\n');
    const out = renameContainers(yml, 'my-app');
    expect(out).toContain('container_name: my-app-postgres');
    expect(out).toContain('POSTGRES_USER: dontpanic'); // credentials intact
    expect(out).toContain('POSTGRES_DB: dontpanic');
  });
});

describe('setEnv', () => {
  it('replaces an existing key in place', () => {
    expect(setEnv('FOO=old\nBAR=2', 'FOO', 'new')).toBe('FOO=new\nBAR=2');
  });

  it('appends a key that is absent', () => {
    expect(setEnv('BAR=2', 'FOO', 'new')).toBe('BAR=2\nFOO=new\n');
  });
});

describe('buildEnv', () => {
  const example = [
    'JWT_ACCESS_SECRET=dev-access-secret-change-me',
    'JWT_REFRESH_SECRET=dev-refresh-secret-change-me',
    'CSRF_SECRET=dev-csrf-secret-change-me',
    'TWO_FACTOR_REQUIRED=false',
  ].join('\n');

  it('rotates every secret away from the placeholders', () => {
    const env = buildEnv(example, false);
    expect(env).not.toContain('change-me');
    for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'CSRF_SECRET']) {
      const value = env.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1] ?? '';
      expect(value).toMatch(/^[0-9a-f]{64}$/); // 32 random bytes as hex
    }
  });

  it('generates a fresh secret on each call', () => {
    const a = buildEnv(example, false).match(/^CSRF_SECRET=(.*)$/m)?.[1];
    const b = buildEnv(example, false).match(/^CSRF_SECRET=(.*)$/m)?.[1];
    expect(a).not.toBe(b);
  });

  it('reflects the 2FA-required choice', () => {
    expect(buildEnv(example, true)).toContain('TWO_FACTOR_REQUIRED=true');
    expect(buildEnv(example, false)).toContain('TWO_FACTOR_REQUIRED=false');
  });
});
