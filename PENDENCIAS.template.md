# Pendências

> Template. Copie para `PENDENCIAS.md` (que fica no `.gitignore` se você preferir mantê-lo local)
> e vá preenchendo. As três seções existem porque cada tipo de pendência precisa de uma decisão
> diferente: uma exige migration, outra exige alguém escolher, e a terceira exige alguém conferir
> antes de virar a chave.

---

## Exigem alteração de schema

Coisas que não dá para fazer sem uma migration. Liste o que falta no modelo de dados, não a tela
que vai consumir.

- [ ] …

---

## Decisões que continuam em aberto

Um item aqui **não é uma tarefa** — é uma bifurcação em que as duas saídas custam coisas
diferentes. Escreva as duas opções e o que cada uma custa; quem decide precisa disso, não de um
resumo. Termine com "precisa de arbitragem".

- [ ] **…**
      Opção A: … — custa …
      Opção B: … — custa …
      Precisa de arbitragem.

---

## Antes de ir para produção

Checklist herdado do boilerplate. Nenhum destes é opcional; risque conforme confirmar.

- [ ] **Trocar as senhas do seed.** `admin@dontpanic.dev` e `superadmin@dontpanic.dev` nascem com
      `DontPanic42!`. Em produção, ou troque, ou não rode o seed.
- [ ] **Confirmar que `DATABASE_URL` aponta para a role restrita** (`dontpanic_app`), e que o dono
      do banco está só em `DATABASE_ADMIN_URL`. Um superuser ignora RLS e o isolamento entre
      empresas vira decoração — a API recusa subir se detectar, mas confira antes do deploy.
- [ ] **Definir `TRUST_PROXY` e `CLIENT_IP_TRUSTED_HOPS` para a hospedagem real.** O default é
      restritivo de propósito; errado para mais, o rate limit vira burlável. Veja a tabela por
      plataforma no `.env.example`.
- [ ] **Ligar o captcha** (`CAPTCHA_DRIVER` + chaves), nos dois lados — API e `NEXT_PUBLIC_*`.
- [ ] **Gerar segredos novos** para `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` e `CSRF_SECRET`.
      Nunca os do `.env.example`.
- [ ] **Preencher os dados do operador** em `components/legal/company.ts` e revisar termos e
      política de privacidade. Enquanto `OPERATOR_INCOMPLETE` estiver ligado, as páginas mostram
      um aviso de "não publique assim".
- [ ] **Revisar as rotas com `@SystemScope()`.** Cada uma é uma exceção ao isolamento por tenant.
      Hoje só as de autenticação têm; se apareceu outra, entenda por quê.
- [ ] **Configurar `SENTRY_DSN`** (API e web) ou assumir conscientemente ficar sem observabilidade.
- [ ] **Zerar a dívida de lint** — `pnpm lint` sem warnings, não só sem erros.
- [ ] **Conferir `pnpm audit --audit-level high`** verde, e que nenhum `override` no
      `pnpm-workspace.yaml` está escondendo um advisory que já tem correção no pai.
