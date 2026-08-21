-- =============================================================================
-- 0016 — RLS das marcações e dos clientes
-- =============================================================================
--
-- A decisão que domina este ficheiro: **o `anon` não lê marcações nem clientes.
-- De todo.**
--
-- É tentador dar-lhe leitura filtrada — "só as suas" — para o cliente poder ver
-- a marcação na página pública. Mas "as suas" não se consegue exprimir numa
-- política: o visitante anónimo não tem identidade. Qualquer filtro acabaria
-- por ser um segredo partilhado no URL, e um `select` sem esse filtro devolvia
-- a agenda inteira.
--
-- O caminho é outro: tudo o que o cliente faz sem conta passa por funções
-- `SECURITY DEFINER` que recebem um token, validam-no e devolvem só a linha
-- dele. Ver 0017.
--
-- A SEGUNDA DECISÃO: QUEM É `staff` NÃO VÊ A CLÍNICA TODA
--
-- Um fisioterapeuta numa clínica com oito profissionais não tem razão para ler
-- a lista de clientes dos colegas. Vê a agenda dele. `tenant_admin` e `manager`
-- veem tudo.
--
-- Isto não é paranoia: é a diferença entre uma fuga de dados custar uma conta e
-- custar a base de clientes inteira.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Clientes
-- -----------------------------------------------------------------------------
drop policy if exists customers_manager_all on booking.customers;
create policy customers_manager_all on booking.customers
  for all to authenticated
  using (
    tenant_id = any ((select booking.manager_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  )
  with check (
    tenant_id = any ((select booking.manager_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  );

-- Quem é `staff` vê apenas os clientes que tem em agenda. Não é uma lista de
-- contactos da empresa; é o contexto de quem vai atender.
drop policy if exists customers_staff_read on booking.customers;
create policy customers_staff_read on booking.customers
  for select to authenticated
  using (
    exists (
      select 1 from booking.bookings b
      where b.customer_id = customers.id
        and b.staff_id = any ((select booking.current_staff_ids())::uuid[])
    )
  );

drop policy if exists consents_manager_all on booking.customer_consents;
create policy consents_manager_all on booking.customer_consents
  for all to authenticated
  using (
    exists (
      select 1 from booking.customers c
      where c.id = customer_consents.customer_id
        and c.tenant_id = any ((select booking.manager_tenant_ids())::uuid[])
    )
    or (select booking.is_platform_admin())
  )
  with check (
    exists (
      select 1 from booking.customers c
      where c.id = customer_consents.customer_id
        and c.tenant_id = any ((select booking.manager_tenant_ids())::uuid[])
    )
    or (select booking.is_platform_admin())
  );

-- -----------------------------------------------------------------------------
-- Marcações
-- -----------------------------------------------------------------------------
drop policy if exists bookings_manager_all on booking.bookings;
create policy bookings_manager_all on booking.bookings
  for all to authenticated
  using (
    tenant_id = any ((select booking.manager_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  )
  with check (
    tenant_id = any ((select booking.manager_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  );

-- O profissional vê e atualiza a agenda dele. Não apaga: cancelar é uma
-- transição de estado com registo, não um `delete`.
drop policy if exists bookings_staff_read on booking.bookings;
create policy bookings_staff_read on booking.bookings
  for select to authenticated
  using (staff_id = any ((select booking.current_staff_ids())::uuid[]));

drop policy if exists bookings_staff_update on booking.bookings;
create policy bookings_staff_update on booking.bookings
  for update to authenticated
  using (staff_id = any ((select booking.current_staff_ids())::uuid[]))
  with check (staff_id = any ((select booking.current_staff_ids())::uuid[]));

-- -----------------------------------------------------------------------------
-- Histórico
-- -----------------------------------------------------------------------------
-- Só de leitura, e só para quem gere. Escreve-se por função, nunca à mão: um
-- histórico que a aplicação pode reescrever não é histórico.
drop policy if exists booking_events_read on booking.booking_events;
create policy booking_events_read on booking.booking_events
  for select to authenticated
  using (
    tenant_id = any ((select booking.manager_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
    or exists (
      select 1 from booking.bookings b
      where b.id = booking_events.booking_id
        and b.staff_id = any ((select booking.current_staff_ids())::uuid[])
    )
  );

-- -----------------------------------------------------------------------------
-- Sessões de grupo
-- -----------------------------------------------------------------------------
-- Estas **são** públicas: o horário das aulas é informação de montra. O que
-- não é público é quem se inscreveu — isso está em `bookings`.
drop policy if exists group_sessions_public_read on booking.group_sessions;
create policy group_sessions_public_read on booking.group_sessions
  for select to anon
  using (booking.is_tenant_public(tenant_id) and not is_cancelled);

drop policy if exists group_sessions_member_read on booking.group_sessions;
create policy group_sessions_member_read on booking.group_sessions
  for select to authenticated
  using (
    tenant_id = any ((select booking.current_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  );

drop policy if exists group_sessions_manager_write on booking.group_sessions;
create policy group_sessions_manager_write on booking.group_sessions
  for all to authenticated
  using (
    tenant_id = any ((select booking.manager_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  )
  with check (
    tenant_id = any ((select booking.manager_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  );

-- -----------------------------------------------------------------------------
-- Tokens de acesso
-- -----------------------------------------------------------------------------
-- Ninguém lê esta tabela pela API. Nem o `anon`, nem o `authenticated`. Só as
-- funções `SECURITY DEFINER` que validam o token, e o `service_role`.
--
-- Sem políticas de leitura, com a RLS ligada e forçada, a tabela é opaca — e é
-- assim que tem de ser: quem conseguisse ler os hashes conseguiria atacá-los
-- offline.

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
-- O `anon` não recebe nada em `customers`, `bookings`, `booking_events` nem
-- `access_tokens`. Nem `select`. As políticas acima já o excluíam; o grant em
-- falta é a segunda fechadura.
grant select, insert, update, delete on booking.customers         to authenticated;
grant all    on booking.customers         to service_role;

grant select, insert, update, delete on booking.customer_consents to authenticated;
grant all    on booking.customer_consents to service_role;

grant select, insert, update, delete on booking.bookings          to authenticated;
grant all    on booking.bookings          to service_role;

grant select on booking.booking_events                            to authenticated;
grant all    on booking.booking_events                            to service_role;

-- Da sessão de grupo, o `anon` vê o horário e as vagas. Nada mais.
grant select (id, tenant_id, location_id, service_id, staff_id, start_at, end_at,
              capacity, booked_count, is_cancelled)
  on booking.group_sessions to anon;
grant select, insert, update, delete on booking.group_sessions    to authenticated;
grant all    on booking.group_sessions                            to service_role;

grant all    on booking.access_tokens                             to service_role;

-- -----------------------------------------------------------------------------
-- Guardas
-- -----------------------------------------------------------------------------
do $$
declare
  v_fuga text;
  v_sem_rls text;
begin
  -- 1. Nenhuma política de `anon` sobre marcações ou clientes. Nunca.
  select string_agg(schemaname || '.' || tablename || ' → ' || policyname, ', ')
    into v_fuga
  from pg_policies
  where schemaname = 'booking'
    and tablename in ('bookings','customers','customer_consents','booking_events','access_tokens')
    and 'anon' = any (roles);

  if v_fuga is not null then
    raise exception 'O anon não pode ter políticas sobre marcações ou clientes: %', v_fuga;
  end if;

  -- 2. Toda a tabela nova tem RLS ligada **e** forçada.
  select string_agg(c.relname, ', ') into v_sem_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'booking'
    and c.relkind = 'r'
    and (not c.relrowsecurity or not c.relforcerowsecurity);

  if v_sem_rls is not null then
    raise exception 'Tabelas sem RLS ligada e forçada: %', v_sem_rls;
  end if;
end;
$$;
