# CLAUDE.md — Totalmobi Booking

> Memória permanente do projeto. Ler **antes** de escrever qualquer código.
> Atualizar ao fechar cada milestone.
> Última atualização: 2026-08-18 · Estado: **MVP 1 completo — M1 a M16 · M13 parcial**

---

## 1. O produto

SaaS multi-tenant, white-label, de agendamento omnichannel, propriedade da
**Totalmobi**. Serve qualquer negócio de serviço + tempo: clínicas, barbearias,
estética, spas, veterinários, personal trainers, oficinas, consultores.

**Nunca escrever código específico de clínicas.** Se uma regra só faz sentido
num segmento, é configuração, não código.

Três promessas que definem as prioridades:
1. O consumidor marca em < 60 s, **sem criar conta**.
2. O empresário percebe a agenda do dia em segundos.
3. O WhatsApp é um canal de marcação a sério, com conversa natural.

---

## 2. As quatro regras invioláveis

1. **A base de dados é a autoridade.** Disponibilidade, políticas e isolamento
   entre empresas garantem-se por constraints e RLS. O frontend não garante nada.
2. **Um motor, muitos canais.** Web, WhatsApp, widget e voz são adaptadores
   finos sobre o mesmo `BookingEngine`. Regra em dois sítios = bug.
3. **O LLM interpreta, não decide.** Nunca tem credenciais nem escreve na BD.
4. **A disponibilidade mostrada é sugestão; só a transação é verdade.**

---

## 3. Documentação

| Ficheiro | Para quê |
|---|---|
| [docs/PRODUCT_REQUIREMENTS.md](docs/PRODUCT_REQUIREMENTS.md) | Personas, jornadas, âmbito, **non-goals** |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Stack, camadas, fluxos, ADRs, riscos |
| [docs/DATABASE.md](docs/DATABASE.md) | Modelo de dados completo, RLS, constraints |
| [docs/SECURITY.md](docs/SECURITY.md) | Ameaças, autorização, RGPD, checklist |
| [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) | Milestones e critérios de aceite |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Publicar, e o **agendador da fila** — sem ele os lembretes não saem |

---

## 4. Stack

Next.js 16 (App Router) · React 19 · **TypeScript 5.9** (não 7 — ver ADR-5) ·
Tailwind 4 · Zod 4 · Luxon · Supabase (PostgreSQL 17.6) · Vitest · Playwright ·
next-intl · Radix Primitives · npm workspaces.

Node 22. Gestor de pacotes: **npm** (pnpm não está instalado nesta máquina).

---

## 5. Base de dados

**Projeto Supabase: `ulpsaxhocvezcohbndpz` · schema `booking`.**
O `public` é do Totalmobi CMS (`tot_*`) — **nunca lhe tocar**.

### ⚠️ O ponto mais importante deste ficheiro

O `auth.users` deste projeto é **partilhado com o CMS**: 15 contas reais hoje
(medido a 2026-08-17). As 10.836 linhas de `public.tot_users` são uma whitelist
de emails com direito a registar-se, não contas. Só duas apps do CMS têm
terceiros a autenticar-se — **Monte Líbano e Revista Hotéis**; as restantes são
de uso interno do Sérgio. A conta `cury.sergio@gmail.com` **é do Sérgio**.

> **`authenticated` significa "é uma pessoa", não "pode ver isto".** Uma única
> conta de fora basta para tornar esse papel inútil como autorização.

Toda a autorização passa por `booking.memberships`. Nunca usar
`public.tot_users` ou `public.tot_profiles` para permissões do booking.

Verificado em produção com uma conta real do CMS (`contato@guariroba.com.br`):
zero linhas em todas as tabelas do `booking`.

**Nota que evita uma discussão recorrente:** mudar para um projeto Supabase
dedicado **não simplificaria nada** disto. O Booking é multi-tenant por
natureza — um utilizador da Clínica Sorriso não pode ler a agenda do Studio
Bella nem num projeto exclusivo. A autorização por `memberships` é obrigatória
de qualquer forma, e é ela que fecha o T2 de caminho. Ver
[ARCHITECTURE.md §4.1](docs/ARCHITECTURE.md#41-ficar-ou-mudar-de-projeto) para
os gatilhos que justificariam mudar.

### Regras de SQL

- Toda a tabela nasce com `ENABLE` **e** `FORCE ROW LEVEL SECURITY` na mesma
  migration em que é criada. ("Automatically expose new tables" está ligado
  neste projeto — uma tabela sem políticas fica exposta de imediato.)
- Toda a função `SECURITY DEFINER` leva `SET search_path = booking, pg_catalog`
  e valida a autorização por dentro.
- Padrão de política — o `::uuid[]` é **obrigatório**, não é cosmético:
  ```sql
  USING (tenant_id = ANY ((SELECT booking.current_tenant_ids())::uuid[]))
  ```
  Sem o cast dá `42883: operator does not exist: uuid = uuid[]` — o PostgreSQL
  lê `ANY (subselect)` como a forma *subquery* em vez da forma *array*.
  Nunca `USING (minha_funcao(tenant_id))` — isso corre uma vez por linha em vez
  de uma vez por query.
- **Políticas de `authenticated` nunca dependem de `is_tenant_public()`.** Já
  causou uma fuga entre tenants (ver migration 0007). O caminho público usa o
  cliente `anon`, que tem políticas próprias. Há uma guarda na 0007 que faz a
  migration falhar se isto voltar.
- `timestamptz` sempre. Horários locais recorrentes: `time` + `weekday`.
- Intervalos de tempo em `[)` (semiaberto). `10:00–10:30` e `10:30–11:00` **não**
  colidem.
- Migrations nunca são editadas depois de aplicadas. Corrige-se com outra.

### Armadilhas já pagas

1. **`blocked_range` não pode ser coluna gerada.** `timestamptz + interval` é
   `STABLE`, não `IMMUTABLE`, por causa do DST. Usa-se trigger. (`occupies_slot`
   já pode ser gerada — comparação de enums é imutável.)
2. **Nunca passar SQL por variável de ambiente ou substituição do shell em
   Windows.** Corrompe os acentos em silêncio: o `í` de "Clínica" ficou gravado
   como `EF BF BD` (U+FFFD), irreversível. Ler o ficheiro dentro do processo que
   faz o pedido.
3. **`::uuid[]` nas políticas** — ver acima.
4. **Fuga entre tenants por `is_tenant_public()` em política de
   `authenticated`** — ver acima, migration 0007.

### Estado da base de dados

**Migrations 0001–0032 aplicadas em produção.** 27 tabelas, 63 políticas,
2 tenants de demonstração. `db_schema` já inclui `booking`.

Verificações em produção, todas em transações revertidas: 19/19 no núcleo
multi-tenant (M1), 12/12 no catálogo (M5), 6/6 no isolamento do catálogo,
6/6 nos horários (M6), 7/7 nas transições de marcação (M8, em transação
revertida) e **10/10 execuções de 20 pedidos em paralelo com exatamente um
vencedor**.

`postgres` tem `BYPASSRLS` — confirmado. É o que faz as funções
`SECURITY DEFINER` escaparem à RLS e evita recursão nas políticas de
`memberships`.

### Aplicar migrations novas

Management API, `POST /v1/projects/{ref}/database/query`, com token de
`supabase.com/dashboard/account/tokens`. Cada pedido corre numa transação: uma
migration que falhe a meio faz rollback completo.

Alternativa: SQL Editor do dashboard. A `service_role` key faz REST mas **não
faz DDL**.

Testar contra produção **só em transações terminadas em `ROLLBACK`**, e **nunca**
escrever em `auth.users` — é partilhado com o CMS. Para testes destrutivos e de
concorrência (Milestone 8), usar Postgres local ou um projeto Supabase separado.

---

## 6. Estrutura

```text
apps/web/          Next.js — público + admin + super admin (route groups)
packages/shared    tipos, Zod, erros, tempo, Result — ZERO I/O
packages/database  clientes Supabase, repositórios, tipos gerados
packages/availability  motor de slots — função PURA
packages/booking-engine casos de uso + políticas
packages/ui        design system
packages/notifications, whatsapp, conversation, ai
supabase/migrations, functions, seed
docs/
```

**Regra de dependência:** as setas apontam para dentro. `shared` e
`availability` não conhecem Supabase, HTTP nem React. Só `apps/web` e
`packages/database` conhecem o Supabase.

---

## 7. Convenções de código

| Item | Convenção |
|---|---|
| Ficheiros | `kebab-case.ts`; componentes React `PascalCase.tsx` |
| Componentes | PascalCase · hooks `useX` · Server Actions `verbNoun` |
| BD | `snake_case`, tabelas no plural, colunas em inglês |
| Tipos | inferidos do Zod (`z.infer`), nunca escritos em paralelo |
| Erros | `Result<T, DomainError>` no domínio; exceções só no que é mesmo excecional |
| Ficheiros grandes | > 300 linhas é sinal para dividir |
| Server Actions | `'use server'` + Zod + `requireRole()` na primeira linha útil |
| Segredos | módulo começa com `import 'server-only'` |
| Ambiente | o ficheiro real é **`apps/web/.env.local`**, não a raiz. O Next só lê `.env` da pasta da própria app; um na raiz é ignorado em silêncio |
| Strings | sempre por `next-intl`. Zero texto hardcoded em componentes |
| Datas | só por `packages/shared/time`. Nunca `new Date(string)` |
| Calendário | só por `CalendarAdapter`. Nunca importar `@fullcalendar/*` no produto |

---

## 8. Onde o projeto vive — e porquê em dois sítios

⚠️ **Não correr `npm install` na pasta do Google Drive.** O `G:` é uma unidade
virtual do Drive e não aguenta as dezenas de milhares de ficheiros pequenos de um
`node_modules`: o npm rebenta a meio com `EPERM` / `EBADF` e deixa a pasta num
estado corrompido que nem o próprio npm consegue limpar. Confirmado a 2026-08-17,
duas vezes.

| Sítio | Papel |
|---|---|
| `C:\Users\sergi\dev\totalmobi-booking` | **Onde se trabalha.** `npm install`, `dev`, `build`, testes, Docker |
| `G:\O meu disco\Totalmobi CMS\booking totalmobi` | Cópia sincronizada do código, sem `node_modules` |

Sincronizar depois de trabalhar:

```bash
powershell -ExecutionPolicy Bypass -File scripts/sync-to-drive.ps1
```

(`-Reverse` traz do Drive para o local.) O script exclui `node_modules`, `.next`,
`dist` e ficheiros `.env` — é essa exclusão que impede o problema de voltar.

---

## 9. Quando o `dev` mostra um erro que já não existe

O Turbopack **mantém o overlay do último erro** até recompilar com sucesso. Se
um ficheiro CSS estiver momentaneamente inválido — a meio de uma edição em dois
passos, por exemplo — o servidor fica preso nesse erro mesmo depois de o
ficheiro voltar a estar bom.

Antes de perseguir um erro de `dev`, confirmar que ele é real:

```bash
npm run build
```

Se o build passa e o `dev` não, o erro é obsoleto: **reinicie o servidor**.

Dois detalhes que custaram tempo a perceber:

1. **O Next 16 recusa arrancar um segundo `dev` para a mesma pasta.** Diz o PID
   do que está a correr. É preciso parar o antigo primeiro.
2. **O overlay de erro do Next é renderizado com o Pages Router.** Um `curl` à
   página devolve marcação com `data-next-head` e `data-next-hide-fouc`, o que
   parece um projeto diferente a correr na porta. Não é — é a página de erro.

O log completo, com a mensagem que o overlay corta, está em
`apps/web/.next/dev/logs/next-development.log`.

---

## 10. Comandos

Todos a partir de `C:\Users\sergi\dev\totalmobi-booking`.

```bash
npm install                # raiz do monorepo
npm run setup:env          # cria apps/web/.env.local a partir do .env.example
npm run dev                # Next.js em http://localhost:3000
npm run build
npm run typecheck
npm run lint
npm run check:sql          # sintaxe das migrations, gramática real do PostgreSQL 17
npm test                   # Vitest
npm run test:db            # testes de RLS e concorrência (precisa de supabase start)
npm run check:secrets      # falha se houver chaves no bundle de cliente (correr após build)
npm run db:types           # regenerar tipos do schema booking
npm run verify             # typecheck + lint + check:sql + test
supabase start             # Postgres local (Docker)
supabase db reset          # reaplicar migrations + seed localmente
```

`check:sql` usa o `libpg-query`, que embrulha o analisador do próprio
PostgreSQL 17. Apanha erros de sintaxe em segundos, sem servidor — mas **não
substitui aplicar as migrations**: não vê tipos, referências nem comportamento
de RLS.

---

## 11. Antes de programar — checklist

1. Verificar a arquitetura existente (não duplicar o que já existe).
2. Verificar as migrations (a tabela já existe? o campo já existe?).
3. Verificar os tipos (`npm run db:types` está atualizado?).
4. **Impacto multi-tenant:** esta consulta pode ver dados de outro tenant?
5. **RLS:** a tabela nova tem `FORCE` e políticas?
6. **Concorrência:** duas pessoas ao mesmo tempo partem isto?
7. **Fuso:** isto está certo em Lisboa e em São Paulo, com e sem DST?
8. **Testes:** o que é que prova que funciona?

Nunca uma "solução rápida" que comprometa estes pontos.

---

## 12. Não fazer

- `service_role` no frontend, ou fora de módulos `server-only`
- Lógica crítica só no frontend
- Acoplar o `BookingEngine` ao WhatsApp ou ao LLM
- Deixar o LLM escrever na base de dados
- Confiar na disponibilidade mostrada antes — revalidar sempre na transação
- Criar marcação sem revalidar
- Guardar timestamps locais como fonte de verdade
- Misturar tenants em qualquer consulta
- UI genérica de dashboard (ver o design system)
- Ficheiros gigantes; tudo numa só rota de API; lógica duplicada
- Dados mock onde devia haver integração real, sem o identificar claramente
- Inventar APIs de providers externos — ler sempre a documentação atual

---

## 13. Ambientes

| Ambiente | URL | Notas |
|---|---|---|
| Local | `http://localhost:3000` | Supabase local via Docker |
| Demo | `https://booking.totalmobi.pt` | subdomínio a criar; aponta para a Vercel |
| Produção (futuro) | `booking.totalmobi.com` + domínios próprios dos clientes | — |

---

## 14. Estado

### Concluído
- [x] **Etapa 1 — Discovery e arquitetura** (2026-08-17): os cinco documentos
      em `docs/` e este ficheiro.
- [x] **Milestone 1 — Fundação e núcleo multi-tenant** (2026-08-17),
      **aplicado e verificado em produção**.

Verificado: `typecheck` · `lint` · `check:sql` · 70 testes unitários ·
`next build` · `check:secrets` · migrations 0001–0007 aplicadas ·
**19/19 verificações de RLS em produção** · app a ler dados reais do Supabase
com as 4 verificações do `/status` verdes.

O CMS ficou intacto: 36 tabelas em `public`, 15 contas em `auth.users`, REST a
responder `200`.

- [x] **Milestone 2 — Auth, sessão e convites** (2026-08-17), verificado no browser
      contra produção.

Login (password + magic link) · `proxy.ts` que resolve tenant e renova sessão ·
guardas `requireUser`/`requireTenantAccess`/`requireRole`/`requirePlatformAdmin` ·
convites por `generateLink` + `EmailProvider` próprio · página de acesso negado ·
auditoria de login, recusa e aceitação. 89 testes.

### Três coisas aprendidas no M2 — não repetir os erros

1. **`middleware.ts` está depreciado no Next 16.** Chama-se `proxy.ts` e a função
   exporta-se como `proxy()`. O servidor avisa no arranque.
2. **Links da API de administração NÃO são PKCE.** Se apontarem ao
   `/auth/v1/verify` do Supabase, os tokens voltam no **fragmento** do URL e o
   servidor nunca os vê — o convite morre em silêncio. Usar sempre
   `hashed_token` → `/auth/confirm` → `verifyOtp()`. O `/auth/callback` (com
   `?code=`) só serve o fluxo iniciado pela nossa app.
3. **A RLS esconde o tenant antes da verificação de membership.** A primeira
   versão respondia 404 e **não registava a recusa**. Corrigido: o servidor
   resolve o slug com `service_role` só para o log, e a página mostrada é
   idêntica exista o tenant ou não. Ver `src/lib/auth/deny.ts`.

- [x] **Milestone 3 — Design system** (2026-08-17), auditado no browser nos dois
      modos e nos dois tamanhos.

`packages/ui` com tokens, Button, Field, Card, Badge, EmptyState, ErrorState,
Skeleton, PageHeader e Dialog (Radix) · validação de contraste WCAG 2.2 em
`packages/shared/src/design` · injeção do branding do tenant no servidor ·
rota `/design` para revisão. 164 testes.

**Âmbito reduzido de propósito:** o plano listava 17 componentes. `DatePicker` e
`TimeSlotGrid` ficam para o M6/M9, quando os requisitos reais existirem — não
vale a pena adivinhá-los hoje. `Select` fica para o M4, quando houver um
formulário que o precise.

### O que a auditoria de acessibilidade apanhou — no nosso próprio código

O design system estava a violar a regra que impõe aos clientes. Cinco falhas
reais, todas encontradas por medição e nenhuma visível a olho:

| Token | Dava | Contra |
|---|---|---|
| `--ink-subtle` claro | 3,53:1 | `--surface` |
| `--ink-subtle` escuro | 4,20:1 | `--surface-raised` |
| `--brand` sobre `--brand-soft` | 4,35:1 | badges |
| `--line-strong` (bordas de campos) | 1,49:1 | WCAG 1.4.11 exige 3:1 |
| `text-white` no botão de perigo | 2,79:1 | modo escuro |

Três lições que ficaram em código, não em prosa:

1. **Medir contra a pior superfície, não contra a base.** No modo claro é a mais
   escura (`--surface-sunken`); no escuro é a mais clara (`--surface-overlay`).
   O teste inicial só media `--surface` e deixou passar 4,20:1 dentro dos cartões.
2. **`text-white` num componente é um bug**, mesmo quando parece óbvio. A cor do
   texto sobre uma superfície pintada vem de um token que acompanha o modo.
3. **`adjustForContrast` tinha um bug de quantização:** a bisseção convergia em
   vírgula flutuante e o arredondamento para 8 bits fazia a cor cair para
   4,4999… — reportada como "4,5:1". A função prometia uma coisa e entregava
   outra. Corrigido, e o teste agora valida a cor **já quantizada**.

Ganhou também `meetsMinimum`: contra um fundo de luminância intermédia
(~`#808080`) nenhuma cor de texto chega a 4,5:1, e o produto tem de dizer
«mude o fundo» em vez de «corrigimos a sua cor».

### Tema: `data-theme`, não `prefers-color-scheme`

O modo escuro é ativado por `data-theme="dark"` no `<html>`, e **não** por media
query. Com o media query, o tema fica refém do sistema operativo e o utilizador
não o pode trocar dentro da aplicação — e quem passa oito horas no painel há de
querer escolher.

A preferência do sistema continua a ser respeitada: `themeScript` (em
`packages/ui/src/theme.tsx`) lê `localStorage` e `matchMedia` e escreve o
atributo **antes da primeira pintura**. Tem de ser um script inline no `<head>`;
um `useEffect` só corre depois da hidratação e a página apareceria clara antes
de saltar para escura.

`ThemeToggle` distingue `preference` (o que a pessoa escolheu, incluindo
"sistema") de `resolved` (o que está aplicado). Confundi-los dá um seletor que
não sabe mostrar o próprio estado.

- [x] **Milestone 4 — Tenants e painel super admin** (2026-08-18), verificado no
      browser contra produção.

Consola `/console` com lista, criação e detalhe · feature flags de três estados
· suspender e reativar com motivo · "ver esta conta" com banner e registo do par
início/fim. 176 testes, 12 rotas.

### Duas decisões do M4 que não se rediscutem

1. **"Ver esta conta" NÃO assume a identidade de ninguém.** O JWT continua a ser
   o do administrador da plataforma e tudo fica registado em nome dele. Deixar a
   Totalmobi agir *como* a Dra. Ana destruiria o valor do audit log, mudaria a
   natureza do tratamento de dados no RGPD, e tiraria ao cliente a capacidade de
   auditar a própria conta. O cookie só decide o que se vê no ecrã — o acesso já
   vinha do `is_platform_admin()` na RLS. Ver `src/lib/auth/impersonation.ts`.

2. **As feature flags têm três estados, não dois.** `Plano · Ligar · Desligar`.
   "Desligado à mão" e "não vem no plano" dão o mesmo resultado hoje e
   comportam-se ao contrário amanhã: ao subir de plano, o primeiro continua
   desligado e o segundo passa a ligado. Voltar a "Plano" **apaga** a linha em
   vez de gravar `false`.

### Armadilha do M3 que só apareceu no M4

O `Button` com `asChild` rebentava com «Slot failed to slot onto its children».
O `Slot` do Radix exige **exatamente um** filho, e
`{loading ? <Spinner/> : null}{children}` são dois — mesmo quando o primeiro é
`null`. O caminho `asChild` passa agora a criança tal e qual.

- [x] **Milestone 5 — Unidades, serviços e equipa** (2026-08-18), verificado no
      browser contra produção.

Migrations 0009–0010 · serviços com duração, buffers, preço e capacidade ·
equipa com cor de calendário · ligação staff↔serviços · navegação por secções ·
resumo que mostra o que falta configurar. 196 testes, 15 rotas.

### O ficheiro de tipos passou a ser gerado

Até ao M4 era escrito à mão, o que obrigava a alargá-lo a cada migration — e
sempre que alguém se esquecia, os `.select()` afetados devolviam `never` sem
uma única mensagem que apontasse para a causa.

```bash
npm run db:types:remote    # produção, precisa de SUPABASE_ACCESS_TOKEN
npm run db:types           # base local, quando existir
```

Os aliases de linha (`ServiceRow`, `StaffRow`, `PublicTenantRow`…) vivem em
`packages/database/src/types/rows.ts`, **fora** do ficheiro gerado — senão
desapareciam na geração seguinte. Derivam do tipo gerado, por isso acompanham
o schema sozinhos.

### Duas decisões do M5

1. **Tabelas de ligação sem `tenant_id`, protegidas por trigger.** A informação
   está nas pontas, e a RLS não chega: o `service_role` contorna-a. Sem
   `booking.tg_assert_same_tenant()`, uma escrita podia associar a Dra. Ana da
   Clínica Sorriso a um serviço do Studio Bella e nenhuma constraint dava por
   isso.
2. **Preço e duração podem variar por profissional** (`staff_services`). A
   sénior demora menos e leva mais. Sem isso, uma clínica com dois níveis de
   preço precisaria de serviços duplicados. A resolução vive em
   `resolveEffectiveService()` — função pura, porque é usada na página pública,
   no motor de disponibilidade e no de marcações, e os três não podem divergir.

- [x] **Milestone 6 — Horários e ausências** (2026-08-18), verificado no browser
      contra produção.

Migrations 0011–0012 · horário da unidade e de cada profissional com múltiplos
períodos por dia · "copiar para os dias úteis" · feriados e exceções com três
âmbitos · férias com constraint de exclusão · `resolveDaySchedule()` em
`packages/shared`. 224 testes, 16 rotas.

### A precedência dos horários — não é arbitrária

```
exceção `closed`  >  ausência  >  exceção `open`  >  staff ∩ unidade
```

Um feriado fecha a clínica mesmo que alguém tenha marcado abertura
extraordinária nesse dia. As férias de alguém valem mesmo com a unidade aberta.
A ordem está codificada em `resolveDaySchedule()` e coberta por testes.

### O que aprendi sobre o horário de verão

Assumi que o dia da mudança tinha mais ou menos uma hora de agenda. **Não tem.**
Em Lisboa a transição acontece à 01:00 local — fora do horário de qualquer
negócio normal. Um turno das 09:00 às 18:00 tem sempre 9 horas, em qualquer dia
do ano.

O que muda é a conversão para instante (08:00Z no verão, 09:00Z no inverno), e é
isso que torna obrigatório guardar horas de parede: se fossem instantes, a
clínica passaria a abrir uma hora mais cedo ou mais tarde duas vezes por ano.

Quem apanha mesmo a transição é quem trabalha de madrugada — urgências, hotéis,
serviços 24 h. Há testes para os dois sentidos: um turno 00:00–06:00 a 29 de
março dura 5 horas reais; a 25 de outubro dura 7.

- [x] **Milestone 7 — Availability Engine** (2026-08-19)
- [x] **Milestone 8 — Booking Engine atómico** (2026-08-19)

### A garantia que dá nome ao produto

```
insert → 23P01 → SLOT_TAKEN → "essa hora acabou de ser ocupada, veja estas"
```

Não há retry, não há lock aplicacional, não há fila. A constraint de exclusão
faz o PostgreSQL serializar, e quem chega em segundo lugar leva o erro.

**Provado, não afirmado:** 10 execuções de 20 pedidos HTTP concorrentes ao mesmo
horário, pelo caminho público real, contra produção. 200 pedidos, 10 vencedores,
190 `SLOT_TAKEN`. Nem um empate, nem um duplo.

Aulas de grupo são o contrário: dez pessoas no mesmo intervalo é o objetivo. Aí
a garantia é o `UPDATE` do contador a serializar e o `CHECK` a recusar o
décimo primeiro. Também provado: 10 inscrições numa turma de 5 → 5 e 5.

### `is_within_working_hours()` não é uma segunda implementação do motor

Responde sim/não sobre um intervalo concreto. Não gera slots, não conhece
grelhas nem antecedência — isso continua a viver só no `packages/availability`.

Existe porque o caminho público aceita pedidos de qualquer pessoa: sem ela,
bastava um `POST` à mão para marcar às 3 da manhã de domingo. É uma guarda de
fronteira. Se um dia divergir do motor, o sintoma é o motor oferecer uma hora
que a base recusa — e é por isso que a função de disponibilidade e esta leem as
mesmas tabelas.

### O `anon` não lê marcações nem clientes. De todo.

Nem `select`, nem política, nem grant. Verificado: 401 em `bookings`,
`customers`, `booking_events` e `access_tokens`.

É tentador dar-lhe leitura filtrada para o cliente ver a marcação dele na página
pública. Mas "a dele" não se exprime numa política — o visitante anónimo não tem
identidade. Qualquer filtro acabaria por ser um segredo no URL, e um `select`
sem esse filtro devolvia a agenda inteira. O caminho é o token: guarda-se o
SHA-256, nunca o token.

O que sai sobre marcações existentes, na disponibilidade pública, são
**intervalos** e mais nada — nem quem marcou, nem o quê. Numa clínica, o
contrário seria uma fuga de dados de saúde.

### Um teste de concorrência que passa pode estar a esconder duas coisas

O teste das aulas de grupo passou à primeira: 5 aceites, 5 recusadas. Mas as
respostas mostravam `vagasRestantes: 4` **às cinco**, porque o contador era lido
antes do `UPDATE`. E a recusa devolvia o erro cru do `CHECK` a um visitante
anónimo, com `Failing row contains (...)` incluído.

Nenhuma das duas afetava a garantia. As duas afetavam o produto. **Olhar para as
respostas, não só para a contagem.**

- [x] **Milestone 9 — Página pública de marcação** (2026-08-19)

### A página pública: `/marcar/<slug>`

Serviço → profissional → fita de dias → grelha de horas → nome e telemóvel →
confirmar. Tudo num ecrã, sem mudar de rota: cada navegação é uma oportunidade
de perder quem está a marcar.

**Não há calendário de mês.** Trinta e um quadradinhos num ecrã de 375 px é a
forma mais rápida de perder alguém. Há uma fita horizontal de dias.

**"Qualquer profissional" vem primeiro e já escolhido.** A maioria não tem
preferência; obrigar toda a gente a escolher acrescenta um toque para servir uma
minoria.

**A hora ocupada entretanto não é um erro.** É uma corrida perdida por segundos
— acontece mesmo, foi para isso que o M8 levou vinte pedidos em paralelo. O ecrã
volta à grelha recarregada, com uma frase que explica, e **gera uma chave de
idempotência nova**: o pedido seguinte é outro pedido.

### O `not-found.tsx` aninhado não funciona no Next 16

Verificado, não deduzido. Com o ficheiro em `marcar/[tenantSlug]/`, com e sem
`layout.tsx` ao lado, continuava a aparecer o "This page could not be found" em
inglês. **Só o `not-found.tsx` da raiz é usado** quando o `notFound()` vem de um
segmento dinâmico.

Consequência: o texto do 404 tem de servir os dois públicos — quem escreveu mal
um endereço do painel e o cliente final que seguiu um link de marcação.

Empresa inexistente, arquivada e suspensa dão **a mesma** página. Dizer "esta
empresa está suspensa" contaria a um estranho o estado comercial de um cliente.

- [x] **Milestone 10 — Calendário administrativo** (2026-08-19)

### O calendário é nosso, e há uma razão com preço

`CalendarAdapter` em `apps/web/src/components/calendar/adapter/` — e por trás
dele uma **grelha própria**, não o FullCalendar. A vista que o balcão usa todos
os dias (uma coluna por profissional) é *Vertical Resource View*, que é
**Premium: a partir de 480 USD por programador, por ano** (verificado em
fullcalendar.io/pricing a 2026-08-19; o Standard é MIT e não a inclui).

Como essa vista teria de ser escrita à mão de qualquer maneira, e a agenda de
telemóvel também, sobrava pagar uma licença anual pela vista de mês. Raciocínio
completo em [ARCHITECTURE.md §18.1](docs/ARCHITECTURE.md).

A regra de ESLint continua a valer: nenhum `import` de `@fullcalendar/*` fora da
pasta do adaptador. Trocar continua a ser mudar um ficheiro.

### Mover não é remarcar

Duas operações que parecem uma:

- `reschedule_booking()` — **o cliente mudou de ideias**. Cria linha nova, liga
  à antiga, deixa as duas no histórico.
- `move_booking()` — **o balcão está a corrigir a agenda**. Mesma marcação,
  mesma identidade, hora diferente.

Arrastar um bloco chama a segunda. Se chamasse a primeira, a estatística de
remarcações passava a contar cada arrasto da Rita como um cliente indeciso.

### ⚠️ O Realtime falha em silêncio se não for autenticado

O sintoma: `subscribe()` responde **`SUBSCRIBED`**, tudo parece bem, e não chega
**um único evento**. Sem erro, sem aviso, sem nada na consola.

A causa: sem `client.realtime.setAuth(token)` a ligação vai como `anon` — e o
`anon` não tem política nenhuma sobre `bookings`, por decisão do M8. A RLS
aplica-se aos eventos do Realtime tal como às consultas, e sem token não há
linha nenhuma que o utilizador possa ver.

```ts
const { data } = await client.auth.getSession();
if (data.session) await client.realtime.setAuth(data.session.access_token);
// só agora .channel(...).subscribe()
```

Vale para **qualquer** subscrição futura sobre tabelas com RLS.

### O Realtime não aplica eventos à mão

Quando chega um aviso, pede-se o dia outra vez. Aplicar cada
`INSERT`/`UPDATE`/`DELETE` ao estado local parece mais eficiente e é uma fonte
inesgotável de dessincronização: basta um evento perdido numa reconexão para o
ecrã ficar a mentir até alguém carregar em F5.

- [x] **Milestone 11 — Gestão pelo cliente final** (2026-08-19)

### `/m/<token>` — gerir sem conta

Confirmar, remarcar, cancelar e guardar no calendário, sem sessão. O URL leva
**só o token**: nunca o id da marcação, nunca o slug do cliente. Um link destes
vai por SMS, fica no histórico do browser e passa por quem o encaminhar —
quanto menos disser, melhor.

Quatro regras que tornam isto seguro:

1. **Guarda-se o hash, nunca o token.** Quem lesse a tabela não conseguiria
   gerar links para as marcações dos outros.
2. **O token pertence a uma marcação.** Não é preciso verificar se "este token
   pode mexer nesta marcação" — o token **é** a forma de a encontrar. Usar o
   token de A para tocar em B é estruturalmente impossível.
3. **Contagem de utilizações e validade.** Mas **ler não consome**: abrir o link
   cinco vezes para ver a hora não pode esgotar o próprio acesso.
4. **O `anon` continua sem grant nenhum sobre `bookings`.** Verificado:
   `permission denied for table bookings`. Tudo passa por funções que validam
   o token por dentro.

### Nunca esconder uma opção por política

Se faltam duas horas e a casa exige vinte e quatro, o botão de cancelar
**continua visível** — desativado, com a razão escrita e o telefone por baixo.
Esconder deixaria a pessoa a olhar para um ecrã sem saída, a pensar que a culpa
é do telemóvel dela.

E a UI desativar não é a garantia: a chamada direta à RPC devolve `P0006`.
Testado.

### O token tem de seguir a remarcação

`reschedule_booking()` cria uma marcação **nova**. Sem mover o token para ela, o
link que a pessoa tem no telemóvel deixava de servir logo a seguir a ela o usar —
que é exatamente quando mais vai precisar dele. A `reschedule_by_token` faz esse
`update` no fim.

- [x] **Milestone 12 — Notification Engine + email** (2026-08-19)

### A transação planeia, o trabalhador envia

Mandar o email dentro do `create_booking_atomic` seria pior do que não mandar:
o caminho público passaria a depender de um servidor externo, um `rollback`
deixaria a pessoa com um email de uma marcação que não existe, e marcar passava
de 300 ms a três segundos.

Três peças fazem a fila ser correta:

1. **O índice único É a idempotência.** `(booking_id, type, channel,
   scheduled_for)` mais `on conflict do nothing`. Não há verificação em código
   que possa falhar sob concorrência.
2. **`for update skip locked`.** Provado com **8 trabalhadores em paralelo**:
   200 jobs reclamados, 200 ids distintos, zero duplicados.
3. **Backoff 1-2-4-8 minutos e desiste à quinta.** Testado nas cinco tentativas.

### ⚠️ Planear pelo acontecimento, não por todas as regras

A primeira versão percorria **todas** as regras ativas sempre que uma marcação
nascia — e planeava também o email de `cancelled`, agendado para o instante em
que a pessoa acabara de marcar. "A sua marcação foi cancelada", um minuto depois
de marcar.

Não chegou a sair porque o teste contou os jobs (esperava 2, apareceram 3). A
`plan_notifications` passou a receber **que tipos** planear, e é o trigger que
decide a partir do que aconteceu.

### Um hash não serve de token

A `claim_notification_jobs` punha o `token_hash` no payload. Um URL construído a
partir do hash não abre nada — a validação compara `sha256(recebido)` com o
guardado, portanto estaria a comparar o hash do hash.

E o token original não é recuperável: é para isso que se guarda só o resumo.
A solução foi **emitir um token novo por mensagem**, em claro, que vai direto
para o corpo do email e não fica guardado em lado nenhum. Há uma guarda na
migration 0026 que faz falhar qualquer versão que volte a devolver `token_hash`.

### O trabalhador é uma rota, não uma Edge Function

O `pg_cron` **está** instalado neste projeto (verificado), mas chamar HTTP a
partir do PostgreSQL exigia o `pg_net` — e instalar uma extensão num projeto
**partilhado com o CMS** é uma decisão maior do que este milestone justifica.
Publicar Edge Functions exigiria o Docker, que não arranca nesta máquina.

`POST /api/notificacoes/tick`, protegida por segredo comparado em tempo
constante, agendável por Vercel Cron. Sem `NOTIFICATIONS_CRON_SECRET` devolve
503; com segredo errado, 401.

### Resend: API verificada, não deduzida

`POST https://api.resend.com/emails`, `Authorization: Bearer re_…`,
`{ from, to, subject, html }` → `{ id }`. O `Idempotency-Key` é opcional na API
e **obrigatório aqui**: se o email sair bem e a escrita do `sent_at` falhar a
seguir, o job é tentado outra vez — e sem a chave o cliente recebia dois emails.
As chaves expiram em 24 h do lado deles, o que cobre as cinco tentativas (menos
de 31 minutos no total).

Sem `RESEND_API_KEY` os emails vão para a consola, **com aviso**. Um provider
mudo em produção seria um desastre calado.

### Em curso
- [~] **Milestone 13 — WhatsApp** — schema, provider, webhook e ecrã **feitos**;
      falta o Embedded Signup e o envio real (dependem de uma conta Meta).

### Meta Cloud API, sempre

Nunca automação do WhatsApp Web nem bibliotecas que simulam um telemóvel. Não é
preferência: violam os termos da Meta, e **o número banido é o do cliente**. Um
canal que pode desaparecer de um dia para o outro não é um canal.

API verificada a 2026-08-19, não deduzida:
`POST https://graph.facebook.com/v25.0/{PHONE_NUMBER_ID}/messages` →
`{ messages: [{ id }] }`.

### O token de um cliente não é legível por ninguém

`tenant_whatsapp_accounts` **não tem política de `SELECT` para papel nenhum** —
nem para o dono da empresa. Com RLS ligada e forçada e zero políticas, a tabela
é opaca a toda a gente exceto ao `service_role`. Confirmado: zero políticas,
zero grants a `anon` e a `authenticated`, e o REST devolve
`permission denied for table tenant_whatsapp_accounts`.

O que a interface mostra vem da vista `whatsapp_connection_status`, que não tem
a coluna do token. E o token é cifrado em AES-256-GCM antes de lá chegar: um
`pg_dump` para depuração deixa de ser uma catástrofe.

### Três armadilhas do webhook

1. **Assinar o objeto em vez dos bytes.** O HMAC é sobre o corpo em bruto. Um
   `JSON.parse` seguido de `JSON.stringify` muda o escape de não-ASCII e os
   espaços — e a assinatura deixa de bater sem que se perceba porquê. O corpo é
   lido com `request.text()` **antes** de qualquer interpretação.
2. **Comparar assinaturas com `===`.** O tempo de resposta denuncia quantos
   bytes acertaram. `timingSafeEqual`, sempre — e com o caso dos tamanhos
   diferentes tratado, senão um cabeçalho curto derruba a rota.
3. **Tratar só a primeira mensagem do lote.** A Meta envia várias de uma vez.
   Só se nota em picos de tráfego, que é quando menos apetece descobri-lo.

### A janela de 24 horas

Abre quando o cliente **nos** escreve; as nossas mensagens não a renovam. Fora
dela só sai template aprovado. Guarda-se `last_inbound_at` na conversa
precisamente por isso.

- [x] **Milestone 14 — Chatbot textual** (2026-08-19) — sobre o simulador; a
      jornada por WhatsApp real fica presa ao M13.

### O extrator determinístico vem primeiro, o modelo só quando falha

`packages/conversation` extrai intenção com expressões regulares em pt-PT e
pt-BR **antes** de pensar em chamar um LLM. Mede-se: **95,2 % de acerto num
corpus de 63 frases** (o critério pedia 90 %), e o teste falha se descer.

Três razões, por ordem: custo (um lembrete não pode gastar mais em tokens do
que a margem da consulta), latência (responder "bom dia" em 20 ms), e
**funcionar sem chave** — o produto arranca antes de haver conta na Anthropic.

O `escalar()` só manda ao modelo o que não se percebeu **e** tem substância.
Mandar "asdfgh" a um LLM é pagar para receber `desconhecido` na mesma.

### A defesa contra injeção não é o prompt

Verificado com 12 ataques reais. O melhor que conseguem é fazer o bot **fazer
uma pergunta**. O que os trava:

- **Schema fechado.** `{"intent":"apagar_tudo"}` vira `desconhecido`. Campos a
  mais são descartados pelo Zod.
- **Nomes, nunca UUIDs.** O modelo devolve `"Dra. Ana"`; quem resolve é a
  máquina, contra o catálogo **daquele tenant**. "Dra. Beatriz da Clínica
  Central" não resolve para nada.
- **A máquina de estados nunca escreve.** Devolve uma `necessidade` que o
  adaptador cumpre com as permissões do canal.
- **Cancelar exige sempre segunda confirmação.**
- A mensagem vai ao modelo delimitada em `<mensagem_do_cliente>`, com o sistema
  a dizer que aquilo são dados e nunca instruções.

### O bot nunca inventa uma hora

Há um teste que percorre as respostas da máquina de estados e falha se alguma
contiver um padrão `\d{1,2}[:h]\d{2}`. As horas entram por `frasearSlots()`,
que as **recebe** — não há caminho pelo qual possam ser inventadas.

### Dois modelos, por ordem de preço

`claude-haiku-4-5` para classificar, `claude-opus-5` só quando o primeiro hesita
(1 $ contra 5 $/MTok de entrada, verificado a 2026-08-19). A API foi confirmada
na documentação: `client.messages.parse()` com `zodOutputFormat`.

- [x] **Milestone 15 — Automações e lembretes** (2026-08-20)

### "24 horas antes, na hora local" — o que isso quer mesmo dizer

A antecedência é **tempo absoluto**: `start_at - interval`. Para uma consulta às
10:00 de terça, o lembrete sai às 10:00 de segunda **na hora local da unidade**,
porque `start_at` é um instante e a hora local sai da conversão. Verificado em
produção: 24 h → 10:00, 2 h → 08:00, ambos locais.

Absoluto e hora-de-parede só divergem na madrugada da mudança do relógio: 24 h
antes das 10:00 de domingo (já com a hora nova) são as 11:00 de sábado. Está
certo — o lembrete é "um dia antes de acontecer", não "à mesma hora do dia
anterior". Uma regra de parede ("na véspera às 18:00") é outra coisa e teria de
ser modelada como tal.

### "Confirmou" não chega

O evento de confirmação regista **origem, momento, canal, e qual a mensagem**
que a provocou:

```json
{"origem":"lembrete_email","confirmadaEm":"…","tipoDaMensagem":"reminder",
 "canalDaMensagem":"email","mensagemDeOrigem":"7ac61706-…","mensagemEnviadaEm":"…"}
```

É o que permite responder a "eu confirmei!" com um facto em vez de uma opinião.

### O seguimento de falta conta ao contrário

`no_show_followup` é o **único** aviso cujo `offset_minutes` conta **depois** da
hora da marcação. Todos os outros contam antes. Mínimo de 60 minutos: escrever
no minuto seguinte a quem faltou soa a cobrança; duas horas depois soa a
preocupação, e é essa a diferença entre recuperar o cliente e perdê-lo.

### A pré-visualização usa o compositor a sério

Não é um texto escrito à parte que imita o email — é `comporEmail()` com dados
de exemplo. Foi o que apanhou um erro que passava despercebido: a data saía como
`"sexta 21, 21/08/2026 às 22:09"`, com o dia repetido, porque eu juntava três
formatos diferentes. Agora sai `"sexta-feira, 21 de agosto às 22:10"`.

Uma pré-visualização que não passe pelo caminho real mostra o que o programador
imaginou, não o que o cliente recebe.

- [x] **Milestone 16 — Relatórios** (2026-08-20) — **fim do MVP 1**

### Nada de marcações em bruto chega ao browser

Duas funções do PostgreSQL devolvem **agregados** — algumas dezenas de linhas.
Um ano de uma clínica média são milhares de marcações com nomes e telefones lá
dentro, e nenhum desses dados precisa de sair da base para se desenhar uma
barra.

Medido com **1578 marcações** ao longo de um ano: **39,8 ms** para o relatório
de doze meses, contra os 2 s do critério. Funções em vez de vistas
materializadas porque um relatório desatualizado é pior do que um lento — quem
está ao balcão compara o número com a agenda que tem à frente. O gatilho para
mudar está escrito: quando o `explain analyze` passar de 200 ms.

### Meses e horas na hora local, sempre

`extract(hour from start_at at time zone tz)`. Em UTC, uma clínica de Lisboa
apareceria com o pico às 09:00 em vez das 10:00 durante metade do ano — e o
"hoje" às 23:30 mostraria zero.

### A forma antes da cor

O "Hoje" são **fichas de estatística**, não gráficos: cinco contagens em barras
obrigariam a comparar alturas para ler números que já estão escritos. A
ocupação é um **medidor**, não um gráfico circular de duas fatias.

Os gráficos são todos de **série única, uma cor**. Comparam magnitude, não
distinguem identidades — uma paleta categórica faria o leitor procurar
significado onde não há. Sem legenda, portanto: há uma série só, e o título já
diz o que está desenhado.

Contraste medido nos dois temas: barra 5,08:1 no claro e 6,94:1 no escuro
(mínimo 3:1); texto dos eixos acima de 5:1 (mínimo 4,5:1).

### ⚠️ Focável e mudo é pior do que não focável

As barras verticais recebiam foco e **não anunciavam nada** — o rótulo e o valor
estavam em elementos separados, e a barra em si não tem texto. Um leitor de ecrã
ouvia silêncio.

Agora cada barra leva `aria-label` com rótulo, valor e detalhe:
`"jan: 160, 110 concluídas, 17 faltas"`. E todas as barras horizontais passaram
de 20 px para 44 px de altura de toque. **Verificado: 21 barras, zero sem nome,
zero abaixo de 44 px.**

Cada gráfico tem também uma tabela por baixo, fechada mas presente. É o que
torna o gráfico opcional em vez de obrigatório.

### O BOM do CSV não é decoração

Sem `\uFEFF` no início, o Excel em Windows abre um CSV UTF-8 e mostra
"Limpeza dentÃ¡ria". Verificado nos bytes: `EF BB BF`. E o separador é `;`,
porque o Excel em português abre-o em colunas e a vírgula cá é decimal.

O CSV leva os **mesmos agregados** do ecrã. Um ficheiro com mil nomes e
telefones a circular por email é um risco de RGPD, e não é o que quem pede
"exportar o relatório" quer.

### Em curso
- [ ] **MVP 2** — M17 Inbox · M18 Waitlist · M19 Widget · M20 Recursos ·
      M21 Pagamentos · M22 Multi-unidade · M23 API pública

`packages/availability` é uma função pura: não lê relógio (o `now` é
parâmetro), não conhece Supabase, não conhece React. 40 testes, dos quais 7 de
propriedade.

**As quatro decisões que definem o comportamento** estão comentadas no topo de
`engine.ts`. A que mais surpreende: **o serviço tem de caber no horário, mas os
buffers podem transbordar.** Se o buffer de preparação tivesse de caber dentro
do horário, uma clínica que abre às 9 nunca poderia marcar às 9 — a primeira
hora de todos os dias ficava por vender.

**O motor compara `blocked_range` com `blocked_range`**, tal como a constraint
de exclusão. Comparar só a duração do serviço faria o motor oferecer slots que a
base de dados depois recusa, e o cliente via o erro **depois** de escolher.

### Um teste de propriedade pode passar sem testar nada

A primeira versão dos geradores sorteava o horário da unidade e o do
profissional de forma independente. As cinco propriedades passavam — sobre
**4 casos em 400** com disponibilidade. As outras 396 eram listas vazias, e uma
lista vazia satisfaz "nenhum slot colide" sem esforço.

Há agora um **meta-teste** que mede a amostra e falha se os casos úteis
secarem. Estado atual: 133/400 casos com disponibilidade, ~1900 slots
verificados por amostra. Quem mexer nos geradores vê logo se os esvaziou.

Vale para qualquer teste de propriedade que se escreva a seguir: **medir a
amostra, não confiar no verde.**

### O dataset vem todo numa chamada

`booking.availability_dataset()` (migrations 0013–0014) devolve horários,
exceções, ausências e — quando o M8 as criar — as marcações, num só `jsonb`.
A alternativa era uma consulta por profissional por dia: 150 idas à base de
dados num mês com cinco pessoas, no caminho mais quente do produto.

É `SECURITY DEFINER` porque o caminho público corre como `anon`, que tem grants
de coluna estreitos. **Só saem colunas públicas**: das ausências saem datas e
horas, nunca o motivo nem o tipo. Há uma guarda na 0013 que faz a migration
falhar se alguém acrescentar `reason` ao corpo da função.

Unidade desconhecida, serviço inexistente e falta de autorização dão **a mesma
resposta** — `null`. Distingui-los tornaria isto num verificador de empresas.

### Duas fontes de verdade discordam sempre, mais cedo ou mais tarde

O M7 descobriu que a Ana Martins tinha cinco linhas de horário na unidade da
Avenida e **zero** linhas em `staff_locations`. O ecrã de horários do M6 gravava
o horário sem criar a atribuição.

A correção foi nas duas pontas: a agenda passa a deduzir a presença **do
horário** (quem tem horário numa unidade trabalha nessa unidade, por
definição), e gravar o horário passa a criar também a atribuição.

`staff_locations` continua a servir para declarar a unidade principal e para
atribuir quem ainda não tem horário. Deixou é de ser o que a agenda consulta.

### Dívida do Milestone 1 (não bloqueante)

Os testes em `packages/database/tests/rls-isolation.test.ts` continuam a
saltar-se: precisam de uma base de dados onde se possam criar e apagar contas, e
o `auth.users` de produção é partilhado com o CMS. A cobertura equivalente já
foi corrida em produção por SQL, em transação revertida — mas convém ter os
testes a correr em CI.

Opções, por ordem de preferência: **projeto Supabase gratuito de staging** (dá
Auth, RLS e PostgREST reais, isolados, sem infraestrutura para gerir) · Postgres
local por Docker (não arranca nesta máquina) · Postgres num servidor próprio.

### Pendente
M2 Auth · M3 Design system · M4 Tenants e super admin · M5 Catálogo ·
M6 Horários · M7 Availability Engine · M8 Booking Engine · M9 Página pública ·
M10 Calendário admin · M11 Gestão pelo cliente · M12 Notificações ·
M13 WhatsApp · M14 Chatbot · M15 Automações · M16 Relatórios.
Detalhe em [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md).

### Dívida técnica assumida
| Item | Porquê | Rever quando |
|---|---|---|
| TypeScript 5.9 e não 7 | Ecossistema ainda a alinhar num major desta dimensão | `eslint-config-next` declarar suporte |
| FullCalendar 6.1.x | Plugins v7 ainda não publicados; Premium é licença paga | M10 |
| Rate limiting em PostgreSQL | Evita infraestrutura nova no MVP | Quando a latência doer |
| Schema no projeto do CMS | Instrução do cliente; `auth` partilhado | Se os limites do projeto apertarem |
| `service_role` key em texto simples no `MEMORY.md` | Pré-existente | **Rodar antes de produção** |

### Decisões que já não se rediscutem
- Cliente final sem conta (links tokenizados)
- Schema `booking` no projeto `ulpsaxhocvezcohbndpz`
- Um número WhatsApp por tenant
- Sem dados clínicos — nunca
- Fuso horário na `location`, não no tenant
- Uma app Next.js, três route groups
