import { cpSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

// Reverse of the dot-less renames applied in scripts/build-template.mjs:
// npm strips a literal `.gitignore` and always excludes `.npmrc` from tarballs,
// so they travel dot-less inside the template and are restored on scaffold.
export const RESTORE_DOTFILES: Record<string, string> = {
  gitignore: '.gitignore',
  npmrc: '.npmrc',
};

/** Recursive copy of the bundled template, restoring the dot-less dotfiles. */
export function copyTemplate(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src)) {
    const from = join(src, name);
    const to = join(dest, RESTORE_DOTFILES[name] ?? name);
    if (statSync(from).isDirectory()) copyTemplate(from, to);
    else cpSync(from, to);
  }
}

export function secret(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Rewrites `container_name: dontpanic-*` to use the project name, avoiding
 * container collisions between different apps on the same machine (Docker
 * requires a unique container_name per daemon).
 */
export function renameContainers(content: string, projectName: string): string {
  return content.replace(/container_name: dontpanic-/g, `container_name: ${projectName}-`);
}

/** Replace `KEY=...` in-place, or append it if the key is absent. */
export function setEnv(content: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  return re.test(content) ? content.replace(re, line) : `${content}\n${line}\n`;
}

/** .env from .env.example, with fresh secrets so two installs never share keys. */
export function buildEnv(example: string, twoFactorRequired: boolean): string {
  let env = example;
  env = setEnv(env, 'JWT_ACCESS_SECRET', secret());
  env = setEnv(env, 'JWT_REFRESH_SECRET', secret());
  env = setEnv(env, 'CSRF_SECRET', secret());
  env = setEnv(env, 'TWO_FACTOR_REQUIRED', String(twoFactorRequired));
  return env;
}
