-- =============================================================================
-- 0008 — Corrige o comentário de booking.current_tenant_ids()
-- Totalmobi Booking · Milestone 1
--
-- O comentário gravado pela 0004 dizia:
--
--     "Usar SEMPRE como (SELECT booking.current_tenant_ids()) nas políticas"
--
-- Falta-lhe o `::uuid[]`, e sem ele a política não compila: dá
-- `42883: operator does not exist: uuid = uuid[]`, porque o PostgreSQL lê
-- `ANY (subselect)` como a forma *subquery* em vez da forma *array*.
--
-- Quem lê o schema pelo dashboard ou por `\df+` vê este comentário e não o
-- ficheiro da migration. Deixá-lo errado é garantir que a próxima pessoa perde
-- o mesmo tempo que se perdeu a descobri-lo da primeira vez.
--
-- A 0004 não se edita — já foi aplicada. Corrige-se aqui.
-- =============================================================================

comment on function booking.current_tenant_ids() is
  'Tenants a que o utilizador da sessão pertence. Nas políticas usar SEMPRE a forma `x = any ((select booking.current_tenant_ids())::uuid[])`: o (select ...) faz o planeador avaliar uma só vez (InitPlan) e o ::uuid[] é obrigatório, senão dá 42883.';

comment on function booking.admin_tenant_ids() is
  'Tenants onde o utilizador é tenant_admin. Mesma forma de uso que current_tenant_ids(), incluindo o ::uuid[].';

comment on function booking.manager_tenant_ids() is
  'Tenants onde o utilizador é tenant_admin ou manager. Mesma forma de uso que current_tenant_ids(), incluindo o ::uuid[].';

comment on function booking.is_tenant_public(uuid) is
  'O tenant está visível publicamente? Existe para as políticas de `anon` e SÓ para essas. Numa política de `authenticated` mistura tenants — ver migration 0007, que tem uma guarda contra isso.';
