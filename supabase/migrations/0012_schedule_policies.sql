-- =============================================================================
-- 0012 — Políticas RLS dos horários
-- Totalmobi Booking · Milestone 6
--
-- O QUE A `anon` PRECISA, E PORQUÊ
--
-- A página pública tem de mostrar horas livres, e para as calcular precisa dos
-- horários e do que os bloqueia. Sem isso, o cliente escolheria uma hora em que
-- ninguém trabalha e só descobria no fim.
--
-- Mas há um limite: a `anon` vê **quando** o profissional não está disponível,
-- nunca **porquê**. Saber que a Dra. Ana está de baixa médica de 3 a 17 de
-- março é informação de saúde de uma pessoa concreta — categoria especial do
-- RGPD, e nada que o cliente precise para marcar. Por isso `kind` e `reason`
-- de `staff_time_off` ficam fora do grant de coluna.
--
-- QUEM EDITA
--
-- Horários são operação corrente: o `manager` chega. Mas um `staff` pode gerir
-- as SUAS próprias ausências — pedir férias não devia obrigar a incomodar a
-- chefia. Alterar horários de trabalho, esse, continua a ser do gestor.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Função de apoio: a que tenant pertence esta unidade?
-- -----------------------------------------------------------------------------
create or replace function booking.location_tenant(p_location uuid)
returns uuid
language sql
stable
security definer
set search_path = booking, pg_catalog
as $$
  select tenant_id from booking.locations where id = p_location;
$$;

grant execute on function booking.location_tenant(uuid) to anon, authenticated, service_role;

-- O `staff_id` do membership de quem está autenticado. É o que permite a um
-- profissional gerir as suas próprias ausências sem lhe dar acesso às dos
-- colegas.
create or replace function booking.current_staff_ids()
returns uuid[]
language sql
stable
security definer
set search_path = booking, pg_catalog
as $$
  select coalesce(array_agg(staff_id), '{}'::uuid[])
  from booking.memberships
  where user_id = auth.uid()
    and staff_id is not null
    and archived_at is null
    and accepted_at is not null;
$$;

grant execute on function booking.current_staff_ids() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Horário da unidade
-- -----------------------------------------------------------------------------

grant select on booking.location_business_hours to anon;
grant select, insert, update, delete on booking.location_business_hours to authenticated;
grant all on booking.location_business_hours to service_role;

create policy location_hours_public_read on booking.location_business_hours
  for select to anon
  using ((select booking.is_tenant_public((select booking.location_tenant(location_id)))));

create policy location_hours_member_read on booking.location_business_hours
  for select to authenticated
  using (
    (select booking.location_tenant(location_id)) = any ((select booking.current_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  );

create policy location_hours_manager_write on booking.location_business_hours
  for all to authenticated
  using (
    (select booking.location_tenant(location_id)) = any ((select booking.manager_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  )
  with check (
    (select booking.location_tenant(location_id)) = any ((select booking.manager_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  );

-- -----------------------------------------------------------------------------
-- Horário do profissional
-- -----------------------------------------------------------------------------

grant select on booking.staff_working_hours to anon;
grant select, insert, update, delete on booking.staff_working_hours to authenticated;
grant all on booking.staff_working_hours to service_role;

create policy staff_hours_public_read on booking.staff_working_hours
  for select to anon
  using ((select booking.is_tenant_public((select booking.staff_tenant(staff_id)))));

create policy staff_hours_member_read on booking.staff_working_hours
  for select to authenticated
  using (
    (select booking.staff_tenant(staff_id)) = any ((select booking.current_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  );

create policy staff_hours_manager_write on booking.staff_working_hours
  for all to authenticated
  using (
    (select booking.staff_tenant(staff_id)) = any ((select booking.manager_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  )
  with check (
    (select booking.staff_tenant(staff_id)) = any ((select booking.manager_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  );

-- -----------------------------------------------------------------------------
-- Exceções
-- -----------------------------------------------------------------------------
-- `reason` fica fora do grant da `anon`: "encerrado para funeral do sócio" não
-- é para o cliente ler. Ele precisa de saber que está fechado, não porquê.

grant select (id, tenant_id, scope_tenant, location_id, staff_id, date, kind, starts_at, ends_at)
  on booking.schedule_exceptions to anon;

grant select, insert, update, delete on booking.schedule_exceptions to authenticated;
grant all on booking.schedule_exceptions to service_role;

create policy schedule_exceptions_public_read on booking.schedule_exceptions
  for select to anon
  using ((select booking.is_tenant_public(tenant_id)));

create policy schedule_exceptions_member_read on booking.schedule_exceptions
  for select to authenticated
  using (
    tenant_id = any ((select booking.current_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  );

create policy schedule_exceptions_manager_write on booking.schedule_exceptions
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
-- Ausências
-- -----------------------------------------------------------------------------
-- A `anon` vê QUANDO, nunca PORQUÊ. `kind` e `reason` ficam de fora: uma baixa
-- médica é informação de saúde de uma pessoa concreta — art. 9.º do RGPD — e o
-- cliente não precisa dela para marcar.

grant select (id, staff_id, starts_at, ends_at, is_all_day)
  on booking.staff_time_off to anon;

grant select, insert, update, delete on booking.staff_time_off to authenticated;
grant all on booking.staff_time_off to service_role;

create policy time_off_public_read on booking.staff_time_off
  for select to anon
  using ((select booking.is_tenant_public((select booking.staff_tenant(staff_id)))));

create policy time_off_member_read on booking.staff_time_off
  for select to authenticated
  using (
    (select booking.staff_tenant(staff_id)) = any ((select booking.current_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  );

create policy time_off_manager_write on booking.staff_time_off
  for all to authenticated
  using (
    (select booking.staff_tenant(staff_id)) = any ((select booking.manager_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  )
  with check (
    (select booking.staff_tenant(staff_id)) = any ((select booking.manager_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  );

-- Um profissional gere as SUAS ausências. Pedir férias não devia obrigar a
-- incomodar a chefia — e o registo continua a dizer quem as criou.
create policy time_off_own_write on booking.staff_time_off
  for all to authenticated
  using (staff_id = any ((select booking.current_staff_ids())::uuid[]))
  with check (staff_id = any ((select booking.current_staff_ids())::uuid[]));

-- =============================================================================
-- Verificações
-- =============================================================================

do $$
declare v text;
begin
  select string_agg(c.relname, ', ') into v
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'booking' and c.relkind = 'r'
    and (not c.relrowsecurity or not c.relforcerowsecurity);
  if v is not null then raise exception 'Tabelas sem RLS forçada: %', v; end if;
end $$;

do $$
declare v text;
begin
  select string_agg(policyname, ', ') into v
  from pg_policies
  where schemaname = 'booking'
    and 'authenticated' = any (roles)
    and coalesce(qual, '') like '%is_tenant_public%';

  if v is not null then
    raise exception
      'Política de `authenticated` a usar is_tenant_public(): %. Ver migration 0007.', v;
  end if;

  raise notice 'Horários: RLS aplicada';
end $$;
