-- =============================================================================
-- 0010 — Políticas RLS do catálogo
-- Totalmobi Booking · Milestone 5
--
-- Regras já estabelecidas e que continuam a valer (ver 0006 e 0007):
--
-- · `x = any ((select booking.f())::uuid[])` — o cast é obrigatório e a forma
--   `(select …)` é o que faz a função correr uma vez por query, não por linha.
-- · **Nunca `is_tenant_public()` numa política de `authenticated`.** Já causou
--   uma fuga entre tenants. O caminho público usa o cliente `anon`.
--
-- O QUE A `anon` PODE VER, E PORQUÊ
--
-- A página pública de marcação precisa do catálogo para funcionar: sem
-- serviços e sem profissionais não há o que escolher. Mas só vê o que é para
-- ser escolhido — `is_active` e `bookable_online`. Um serviço desligado, um
-- profissional que não aceita marcação online, ou seja o que for arquivado,
-- não existe para quem está de fora.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Categorias
-- -----------------------------------------------------------------------------

grant select on booking.service_categories to anon;
grant select, insert, update, delete on booking.service_categories to authenticated;
grant all on booking.service_categories to service_role;

create policy service_categories_public_read on booking.service_categories
  for select to anon
  using (archived_at is null and (select booking.is_tenant_public(tenant_id)));

create policy service_categories_member_read on booking.service_categories
  for select to authenticated
  using (
    tenant_id = any ((select booking.current_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  );

create policy service_categories_manager_write on booking.service_categories
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
-- Serviços
-- -----------------------------------------------------------------------------

grant select on booking.services to anon;
grant select, insert, update, delete on booking.services to authenticated;
grant all on booking.services to service_role;

create policy services_public_read on booking.services
  for select to anon
  using (
    archived_at is null
    and is_active
    and bookable_online
    and (select booking.is_tenant_public(tenant_id))
  );

create policy services_member_read on booking.services
  for select to authenticated
  using (
    tenant_id = any ((select booking.current_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  );

-- Gerir o catálogo é operação corrente: o `manager` chega. Não faz sentido
-- obrigar a chamar o dono para mudar o preço de um corte de cabelo.
create policy services_manager_write on booking.services
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
-- Profissionais
-- -----------------------------------------------------------------------------
-- A `anon` recebe SELECT só nas colunas que a página pública mostra. O email e
-- o telefone do profissional não são para o cliente final — são dados de
-- contacto interno, e a marcação faz-se sem eles.

grant select (
  id, tenant_id, full_name, photo_url, job_title, bio,
  is_active, accepts_online_booking, calendar_color, priority, sort_order, archived_at
) on booking.staff to anon;

grant select, insert, update, delete on booking.staff to authenticated;
grant all on booking.staff to service_role;

create policy staff_public_read on booking.staff
  for select to anon
  using (
    archived_at is null
    and is_active
    and accepts_online_booking
    and (select booking.is_tenant_public(tenant_id))
  );

create policy staff_member_read on booking.staff
  for select to authenticated
  using (
    tenant_id = any ((select booking.current_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  );

create policy staff_manager_write on booking.staff
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
-- Ligações
-- -----------------------------------------------------------------------------
-- Estas tabelas não têm `tenant_id`. A política tem de o ir buscar à ponta, e
-- por isso usa uma função `SECURITY DEFINER` em vez de um `EXISTS` sobre
-- `booking.staff` — que voltaria a passar pela RLS de `staff` e daria uma
-- cadeia de políticas a avaliar políticas.

create or replace function booking.staff_tenant(p_staff uuid)
returns uuid
language sql
stable
security definer
set search_path = booking, pg_catalog
as $$
  select tenant_id from booking.staff where id = p_staff;
$$;

grant execute on function booking.staff_tenant(uuid) to anon, authenticated, service_role;

grant select on booking.staff_services to anon;
grant select, insert, update, delete on booking.staff_services to authenticated;
grant all on booking.staff_services to service_role;

create policy staff_services_public_read on booking.staff_services
  for select to anon
  using (is_active and (select booking.is_tenant_public((select booking.staff_tenant(staff_id)))));

create policy staff_services_member_read on booking.staff_services
  for select to authenticated
  using (
    (select booking.staff_tenant(staff_id)) = any ((select booking.current_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  );

create policy staff_services_manager_write on booking.staff_services
  for all to authenticated
  using (
    (select booking.staff_tenant(staff_id)) = any ((select booking.manager_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  )
  with check (
    (select booking.staff_tenant(staff_id)) = any ((select booking.manager_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  );

grant select on booking.staff_locations to anon;
grant select, insert, update, delete on booking.staff_locations to authenticated;
grant all on booking.staff_locations to service_role;

create policy staff_locations_public_read on booking.staff_locations
  for select to anon
  using ((select booking.is_tenant_public((select booking.staff_tenant(staff_id)))));

create policy staff_locations_member_read on booking.staff_locations
  for select to authenticated
  using (
    (select booking.staff_tenant(staff_id)) = any ((select booking.current_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  );

create policy staff_locations_manager_write on booking.staff_locations
  for all to authenticated
  using (
    (select booking.staff_tenant(staff_id)) = any ((select booking.manager_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  )
  with check (
    (select booking.staff_tenant(staff_id)) = any ((select booking.manager_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  );

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

-- A guarda da 0007, agora que há mais políticas de `authenticated` para vigiar.
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
      'Política de `authenticated` a usar is_tenant_public(): %. Mistura tenants no painel — ver migration 0007.', v;
  end if;

  raise notice 'Catálogo: RLS aplicada, nenhuma política de authenticated depende do caminho público';
end $$;
