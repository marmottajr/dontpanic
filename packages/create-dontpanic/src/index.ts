import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { intro, outro, text, confirm, spinner, note, log, isCancel, cancel } from '@clack/prompts';
import pc from 'picocolors';
import { buildEnv, copyTemplate, renameContainers } from './scaffold.js';

const here = dirname(fileURLToPath(import.meta.url));
const templateDir = resolve(here, '../template');

function isEmptyDir(dir: string): boolean {
  return !existsSync(dir) || readdirSync(dir).length === 0;
}

function run(cmd: string, args: string[], cwd: string): boolean {
  const res = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  return res.status === 0;
}

function bail<T>(value: T | symbol): T {
  if (isCancel(value)) {
    cancel("Cancelled. Don't Panic — nothing was changed.");
    process.exit(0);
  }
  return value as T;
}

async function main(): Promise<void> {
  console.log();
  intro(`${pc.green(pc.bold('DontPanic'))} ${pc.dim('· create-dontpanic')}`);

  if (!existsSync(templateDir)) {
    cancel('Template not found in the package. Run `pnpm build:template` before publishing.');
    process.exit(1);
  }

  const argDir = process.argv[2];
  const target = bail(
    argDir ??
      (await text({
        message: 'Where should the project be created?',
        placeholder: './my-app',
        defaultValue: './my-app',
      })),
  );
  const dest = resolve(process.cwd(), target);

  if (!isEmptyDir(dest)) {
    const go = bail(
      await confirm({
        message: `${pc.yellow(dest)} already exists and is not empty. Continue anyway?`,
        initialValue: false,
      }),
    );
    if (!go) {
      cancel("Ok, aborted. Don't Panic.");
      process.exit(0);
    }
  }

  // Industry standard (create-vite/next/astro): the name passed as an argument
  // becomes the project name without asking again. We only fall back to the
  // prompt in interactive mode (no argument) or when the derived name is invalid.
  const nameRe = /^[a-z0-9._-]+$/;
  const derivedName = basename(dest);
  const projectName =
    argDir && nameRe.test(derivedName)
      ? derivedName
      : bail(
          await text({
            message: 'Project name (package.json):',
            defaultValue: derivedName,
            placeholder: derivedName,
            validate: (v) =>
              v && nameRe.test(v) ? undefined : 'Use lowercase letters, numbers, ".", "_" or "-".',
          }),
        );

  const twoFactorRequired = bail(
    await confirm({
      message: '2FA required for all users?',
      initialValue: false,
    }),
  );

  const doInstall = bail(await confirm({ message: 'Run `pnpm install` now?', initialValue: true }));

  const doGit = bail(
    await confirm({ message: 'Initialize a git repository?', initialValue: true }),
  );

  const s = spinner();
  s.start('Assembling your DontPanic');
  copyTemplate(templateDir, dest);

  // Patch the root package.json name.
  const pkgPath = join(dest, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.name = projectName;
  pkg.version = '0.1.0';
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

  // .env from the template's .env.example, with rotated secrets.
  const examplePath = join(dest, '.env.example');
  if (existsSync(examplePath)) {
    writeFileSync(
      join(dest, '.env'),
      buildEnv(readFileSync(examplePath, 'utf8'), twoFactorRequired),
    );
  }

  // Containers named after the project (my-app-postgres, my-app-mailpit, …) so
  // they don't collide with other DontPanic apps on the same machine.
  for (const composeFile of ['docker-compose.yml', 'docker-compose.dev.yml']) {
    const composePath = join(dest, composeFile);
    if (existsSync(composePath)) {
      writeFileSync(composePath, renameContainers(readFileSync(composePath, 'utf8'), projectName));
    }
  }
  s.stop('Files in place.');

  if (doGit) {
    if (run('git', ['init', '-q'], dest)) {
      run('git', ['add', '-A'], dest);
      run('git', ['commit', '-q', '-m', 'chore: scaffold with create-dontpanic'], dest);
      log.success('Git repository initialized.');
    } else {
      log.warn('git not found — skipped repository initialization.');
    }
  }

  if (doInstall) {
    log.step('Installing dependencies with pnpm…');
    if (!run('pnpm', ['install'], dest)) {
      log.warn('`pnpm install` failed (is pnpm installed?). Run it manually later.');
    }
  }

  const steps = [
    pc.dim('# start the infra (postgres, redis, minio, mailpit)'),
    'docker compose up -d',
    doInstall ? '' : 'pnpm install',
    'pnpm --filter @dontpanic/shared build',
    'pnpm --filter @dontpanic/api db:migrate',
    'pnpm --filter @dontpanic/api db:seed',
    'pnpm dev',
  ]
    .filter(Boolean)
    .join('\n');

  note(`${pc.bold(`cd ${target}`)}\n${steps}`, 'Next steps (Web :4200 · API :4201)');

  outro(
    pc.green(
      "Done. Here I am, brain the size of a planet, and I handed you a boilerplate. Don't Panic.",
    ),
  );
}

main().catch((err) => {
  log.error(String(err?.stack ?? err));
  process.exit(1);
});
