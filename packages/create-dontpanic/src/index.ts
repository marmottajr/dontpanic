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
    cancel("Cancelado. Don't Panic — nada foi alterado.");
    process.exit(0);
  }
  return value as T;
}

async function main(): Promise<void> {
  console.log();
  intro(`${pc.green(pc.bold('DontPanic'))} ${pc.dim('· create-dontpanic')}`);

  if (!existsSync(templateDir)) {
    cancel('Template não encontrado no pacote. Rode `pnpm build:template` antes de publicar.');
    process.exit(1);
  }

  const argDir = process.argv[2];
  const target = bail(
    argDir ??
      (await text({
        message: 'Onde criar o projeto?',
        placeholder: './minha-app',
        defaultValue: './minha-app',
      })),
  );
  const dest = resolve(process.cwd(), target);

  if (!isEmptyDir(dest)) {
    const go = bail(
      await confirm({
        message: `${pc.yellow(dest)} já existe e não está vazio. Continuar mesmo assim?`,
        initialValue: false,
      }),
    );
    if (!go) {
      cancel("Ok, abortado. Don't Panic.");
      process.exit(0);
    }
  }

  // Padrão de mercado (create-vite/next/astro): o nome passado por argumento já
  // vira o nome do projeto, sem reperguntar. Só caímos no prompt no modo
  // interativo (sem argumento) ou quando o nome derivado é inválido.
  const nameRe = /^[a-z0-9._-]+$/;
  const derivedName = basename(dest);
  const projectName =
    argDir && nameRe.test(derivedName)
      ? derivedName
      : bail(
          await text({
            message: 'Nome do projeto (package.json):',
            defaultValue: derivedName,
            placeholder: derivedName,
            validate: (v) =>
              v && nameRe.test(v) ? undefined : 'Use minúsculas, números, ".", "_" ou "-".',
          }),
        );

  const twoFactorRequired = bail(
    await confirm({
      message: '2FA obrigatório para todos os usuários?',
      initialValue: false,
    }),
  );

  const doInstall = bail(
    await confirm({ message: 'Rodar `pnpm install` agora?', initialValue: true }),
  );

  const doGit = bail(
    await confirm({ message: 'Inicializar um repositório git?', initialValue: true }),
  );

  const s = spinner();
  s.start('Montando seu DontPanic');
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

  // Containers com o nome do projeto (my-app-postgres, my-app-mailpit, …) para
  // não colidir com outros apps DontPanic na mesma máquina.
  for (const composeFile of ['docker-compose.yml', 'docker-compose.dev.yml']) {
    const composePath = join(dest, composeFile);
    if (existsSync(composePath)) {
      writeFileSync(composePath, renameContainers(readFileSync(composePath, 'utf8'), projectName));
    }
  }
  s.stop('Arquivos no lugar.');

  if (doGit) {
    if (run('git', ['init', '-q'], dest)) {
      run('git', ['add', '-A'], dest);
      run('git', ['commit', '-q', '-m', 'chore: scaffold with create-dontpanic'], dest);
      log.success('Repositório git inicializado.');
    } else {
      log.warn('git não encontrado — pulei a inicialização do repositório.');
    }
  }

  if (doInstall) {
    log.step('Instalando dependências com pnpm…');
    if (!run('pnpm', ['install'], dest)) {
      log.warn('`pnpm install` falhou (pnpm instalado?). Rode manualmente depois.');
    }
  }

  const steps = [
    pc.dim('# suba a infra (postgres, redis, minio, mailpit)'),
    'docker compose up -d',
    doInstall ? '' : 'pnpm install',
    'pnpm --filter @dontpanic/shared build',
    'pnpm --filter @dontpanic/api db:migrate',
    'pnpm --filter @dontpanic/api db:seed',
    'pnpm dev',
  ]
    .filter(Boolean)
    .join('\n');

  note(`${pc.bold(`cd ${target}`)}\n${steps}`, 'Próximos passos (Web :4200 · API :4201)');

  outro(
    pc.green(
      "Pronto. Aqui estou eu, cérebro do tamanho de um planeta, e te entreguei um boilerplate. Don't Panic.",
    ),
  );
}

main().catch((err) => {
  log.error(String(err?.stack ?? err));
  process.exit(1);
});
