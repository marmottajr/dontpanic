// Generates ./template from the monorepo root: a clean copy of the boilerplate,
// minus build artifacts, secrets, git history and the installer itself.
//
// npm has two well-known gotchas when publishing a template inside a package:
//   1. it strips/never delivers a literal `.gitignore`, and
//   2. it always excludes `.npmrc` from the tarball.
// So we rename those dotfiles to their dot-less form here; the CLI restores
// them on scaffold. See restoreDotfiles() in src/index.ts.

import { cpSync, mkdirSync, rmSync, readdirSync, statSync, renameSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const pkgDir = resolve(scriptDir, '..'); // packages/create-dontpanic
const repoRoot = resolve(scriptDir, '../../..'); // monorepo root
const templateDir = join(pkgDir, 'template');

// Directory/file names skipped anywhere in the tree.
const SKIP_NAMES = new Set([
  'node_modules',
  '.git',
  '.next',
  '.turbo',
  'dist',
  'out',
  'coverage',
  '.pnpm-store',
  'storybook-static',
  'playwright-report',
  'test-results',
  '.DS_Store',
  '.env', // secrets — only .env.example travels
  '.env.local',
  // No lockfile: the dev machine's locked integrities can drift from what the
  // registry serves on a fresh box (ERR_PNPM_TARBALL_INTEGRITY). Scaffolders
  // (create-next-app/vite) ship lockfile-less so the user resolves clean.
  'pnpm-lock.yaml',
]);

const SKIP_SUFFIXES = ['.tsbuildinfo', '.log'];

// Dotfiles npm mangles → shipped dot-less, restored by the CLI.
const DOTFILE_RENAMES = { '.gitignore': 'gitignore', '.npmrc': 'npmrc' };

function shouldSkip(name, abs) {
  if (SKIP_NAMES.has(name)) return true;
  if (SKIP_SUFFIXES.some((s) => name.endsWith(s))) return true;
  if (abs === pkgDir) return true; // never copy the installer into its own template
  return false;
}

function copyDir(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src)) {
    const abs = join(src, name);
    if (shouldSkip(name, abs)) continue;
    const renamed = DOTFILE_RENAMES[name] ?? name;
    const destPath = join(dest, renamed);
    if (statSync(abs).isDirectory()) {
      copyDir(abs, destPath);
    } else {
      cpSync(abs, destPath);
    }
  }
}

rmSync(templateDir, { recursive: true, force: true });
copyDir(repoRoot, templateDir);

const count = readdirSync(templateDir).length;
console.log(
  `✓ template generated from ${basename(repoRoot)} → template/ (${count} top-level entries)`,
);
