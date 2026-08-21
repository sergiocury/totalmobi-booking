# Totalmobi Booking

SaaS multi-tenant, white-label, de agendamento omnichannel. Propriedade da
**Totalmobi**.

Uma instalação serve centenas de empresas de qualquer segmento baseado em
serviço + tempo: clínicas, barbearias, estética, spas, veterinários, personal
trainers, oficinas, consultores. O consumidor marca em menos de um minuto, sem
criar conta, pela web ou por WhatsApp.

**Estado: Milestone 1 concluído** — fundação e núcleo multi-tenant, aplicado e
verificado em produção (projeto `ulpsaxhocvezcohbndpz`, schema `booking`).

---

## Começar

⚠️ **Não correr `npm install` na pasta do Google Drive.** O `G:` é uma unidade
virtual que não aguenta um `node_modules` e deixa a pasta corrompida. Trabalhar
em `C:\Users\sergi\dev\totalmobi-booking` e sincronizar com
`scripts/sync-to-drive.ps1`.

```bash
npm install
npm run setup:env              # cria apps/web/.env.local — preencher
npm run dev                    # http://localhost:3000
```

`http://localhost:3000/status` mostra o que está ligado e o que falta.

## Verificar

```bash
npm run verify
```

Corre `typecheck` + `lint` + `check:sql` + `test`.

Os testes de RLS (`npm run test:db`) precisam de uma base de dados onde se
possam criar e apagar contas, e saltam-se sozinhos sem ela — com aviso na
consola, nunca em silêncio. **Não apontar para produção:** o `auth.users` é
partilhado com o Totalmobi CMS.

```bash
supabase start
supabase status -o env         # exportar SUPABASE_TEST_URL / _ANON_KEY / _SERVICE_KEY
npm run test:db
```

## Documentação

| Documento | Para quê |
|---|---|
| [CLAUDE.md](CLAUDE.md) | **Ler primeiro.** Regras do projeto, convenções, armadilhas já pagas |
| [docs/PRODUCT_REQUIREMENTS.md](docs/PRODUCT_REQUIREMENTS.md) | Personas, jornadas, âmbito, non-goals |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Stack, camadas, fluxos, ADRs, riscos |
| [docs/DATABASE.md](docs/DATABASE.md) | Modelo de dados, RLS, constraints |
| [docs/SECURITY.md](docs/SECURITY.md) | Ameaças, autorização, RGPD |
| [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) | Milestones e critérios de aceite |

## Estrutura

```text
apps/web/               Next.js 16 — público + admin + super admin
packages/shared/        tipos, Zod, erros, tempo — zero I/O
packages/database/      clientes Supabase, repositórios, tipos
supabase/migrations/    SQL versionado do schema `booking`
docs/
```

## As quatro regras

1. **A base de dados é a autoridade.** Disponibilidade, políticas e isolamento
   entre empresas garantem-se por constraints e RLS, não pelo frontend.
2. **Um motor, muitos canais.** Web, WhatsApp, widget e voz são adaptadores
   finos sobre o mesmo `BookingEngine`.
3. **O LLM interpreta, não decide.** Nunca tem credenciais nem escreve na BD.
4. **A disponibilidade mostrada é sugestão; só a transação é verdade.**

---

Proprietário: Totalmobi · Responsável técnico: Sérgio Cury
