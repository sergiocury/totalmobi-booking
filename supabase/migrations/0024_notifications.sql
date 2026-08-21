-- =============================================================================
-- 0024 — A fila de notificações
-- =============================================================================
--
-- Uma marcação que não avisa ninguém é meia funcionalidade. Mas mandar o email
-- dentro da transação que cria a marcação seria pior do que não mandar:
--
--   • o `create_booking_atomic` passaria a depender de um servidor externo, e
--     uma indisponibilidade do provedor de email impediria de marcar;
--   • um `rollback` depois do envio deixaria a pessoa com um email de uma
--     marcação que não existe;
--   • e o tempo de resposta do caminho público passaria a incluir uma ida à
--     internet.
--
-- Por isso: a transação **planeia**, um trabalhador **envia**. É a diferença
-- entre marcar em 300 ms e marcar em três segundos.
--
-- O QUE TORNA ESTA FILA CORRETA
--
-- 1. **O índice único É a idempotência.** Planear duas vezes o mesmo lembrete
--    não cria dois jobs — o `on conflict do nothing` trata disso. Não há
--    verificação em código que possa falhar sob concorrência.
--
-- 2. **`for update skip locked`.** Dois trabalhadores em paralelo nunca apanham
--    o mesmo job. Sem isto, um pico de tráfego duplicava envios.
--
-- 3. **`locked_at` com prazo.** Um trabalhador que morra a meio deixa o job
--    preso para sempre se não houver forma de o recuperar. Ao fim de dez
--    minutos, volta à fila.
--
-- 4. **Backoff exponencial, cinco tentativas.** Um provedor em baixo não pode
--    ser martelado, e um erro permanente não pode ser tentado eternamente.
-- =============================================================================

do $$ begin
  create type booking.notification_rule_target as enum ('customer', 'staff', 'tenant');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- Regras: o que se envia, por onde, com que antecedência
-- -----------------------------------------------------------------------------
-- Tabela separada dos templates de propósito. Uma coisa é **quando** avisar
-- (calendário), outra é **o que dizer** (conteúdo). Misturá-las obrigaria a
-- duplicar horários por idioma e a duplicar textos por antecedência.
create table if not exists booking.notification_rules (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references booking.tenants(id) on delete cascade,

  type         booking.notification_type not null,
  channel      booking.notification_channel not null,
  target       booking.notification_rule_target not null default 'customer',

  -- Minutos **antes** do início da marcação. `0` = no momento do evento (é o
  -- caso da confirmação, que não tem "antes"). Positivo = antes.
  offset_minutes int not null default 0 check (offset_minutes between 0 and 43200),

  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint notification_rules_unicas unique (tenant_id, type, channel, offset_minutes)
);

create trigger notification_rules_touch before update on booking.notification_rules
  for each row execute function booking.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Templates: o conteúdo, com a marca de cada cliente
-- -----------------------------------------------------------------------------
create table if not exists booking.notification_templates (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references booking.tenants(id) on delete cascade,

  type        booking.notification_type not null,
  channel     booking.notification_channel not null,
  locale      text not null default 'pt-PT',

  subject     text,
  body        text not null,

  -- O nome do template aprovado na Meta, para o WhatsApp (M13). Fora da janela
  -- de 24 h só sai mensagem com template aprovado.
  provider_template_name text,
  provider_status        text,

  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- `tenant_id` nulo = template da plataforma, usado por quem não personalizou.
  -- É o que evita ter de semear seis linhas em cada empresa nova.
  constraint notification_templates_unicos unique nulls not distinct (tenant_id, type, channel, locale)
);

create trigger notification_templates_touch before update on booking.notification_templates
  for each row execute function booking.touch_updated_at();

-- -----------------------------------------------------------------------------
-- A fila
-- -----------------------------------------------------------------------------
create table if not exists booking.notification_jobs (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references booking.tenants(id) on delete cascade,
  booking_id    uuid references booking.bookings(id) on delete cascade,
  customer_id   uuid references booking.customers(id) on delete cascade,

  channel       booking.notification_channel not null,
  type          booking.notification_type not null,

  scheduled_for timestamptz not null,
  status        booking.notification_status not null default 'pending',

  attempts      int not null default 0,
  last_attempt_at timestamptz,
  sent_at       timestamptz,
  provider_message_id text,
  error         text,

  -- Tudo o que o trabalhador precisa para compor a mensagem sem voltar a
  -- consultar meia dúzia de tabelas — e sem correr o risco de a marcação ter
  -- mudado entretanto e o email sair com dados de agora em vez de dados de
  -- então.
  payload       jsonb not null default '{}'::jsonb,

  locked_at     timestamptz,
  locked_by     text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- **Este índice é a idempotência.** Planear duas vezes não duplica.
create unique index if not exists notification_jobs_dedupe_uk
  on booking.notification_jobs (booking_id, type, channel, scheduled_for)
  where booking_id is not null;

-- O índice que o trabalhador usa a cada minuto. Parcial: a fila cresce para
-- sempre, mas a parte pendente é sempre pequena.
create index if not exists notification_jobs_due_idx
  on booking.notification_jobs (scheduled_for)
  where status = 'pending';

create index if not exists notification_jobs_booking_idx
  on booking.notification_jobs (booking_id);

create trigger notification_jobs_touch before update on booking.notification_jobs
  for each row execute function booking.touch_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table booking.notification_rules     enable row level security;
alter table booking.notification_rules     force  row level security;
alter table booking.notification_templates enable row level security;
alter table booking.notification_templates force  row level security;
alter table booking.notification_jobs      enable row level security;
alter table booking.notification_jobs      force  row level security;

drop policy if exists notification_rules_manager on booking.notification_rules;
create policy notification_rules_manager on booking.notification_rules
  for all to authenticated
  using (tenant_id = any ((select booking.manager_tenant_ids())::uuid[]) or (select booking.is_platform_admin()))
  with check (tenant_id = any ((select booking.manager_tenant_ids())::uuid[]) or (select booking.is_platform_admin()));

drop policy if exists notification_templates_manager on booking.notification_templates;
create policy notification_templates_manager on booking.notification_templates
  for all to authenticated
  using (tenant_id = any ((select booking.manager_tenant_ids())::uuid[]) or (select booking.is_platform_admin()))
  with check (tenant_id = any ((select booking.manager_tenant_ids())::uuid[]) or (select booking.is_platform_admin()));

-- Os templates da plataforma (tenant_id nulo) são legíveis por qualquer membro:
-- é o que permite pré-visualizar o que sai por omissão.
drop policy if exists notification_templates_platform_read on booking.notification_templates;
create policy notification_templates_platform_read on booking.notification_templates
  for select to authenticated
  using (tenant_id is null);

-- O log de envios é de leitura. Escrever é do trabalhador, com `service_role`.
drop policy if exists notification_jobs_read on booking.notification_jobs;
create policy notification_jobs_read on booking.notification_jobs
  for select to authenticated
  using (tenant_id = any ((select booking.manager_tenant_ids())::uuid[]) or (select booking.is_platform_admin()));

grant select, insert, update, delete on booking.notification_rules     to authenticated;
grant all    on booking.notification_rules     to service_role;
grant select, insert, update, delete on booking.notification_templates to authenticated;
grant all    on booking.notification_templates to service_role;
grant select on booking.notification_jobs                              to authenticated;
grant all    on booking.notification_jobs                              to service_role;

-- -----------------------------------------------------------------------------
-- Planear
-- -----------------------------------------------------------------------------
-- Chamada por trigger. Lê as regras do tenant e insere um job por regra.
--
-- **A antecedência é em tempo absoluto.** "24 horas antes" quer dizer 24 horas
-- antes de o acontecimento acontecer, mesmo que o relógio mude pelo meio — o
-- que dá 23 ou 25 horas de parede duas vezes por ano. É o correto para um
-- lembrete: a pessoa quer ser avisada um dia antes, não "à mesma hora do dia
-- anterior". Uma regra de hora de parede (ex.: "na véspera às 18:00") é outra
-- coisa e teria de ser modelada como tal.
create or replace function booking.plan_notifications(p_booking_id uuid)
returns int
language plpgsql
security definer
set search_path = booking, pg_catalog
as $$
declare
  v_b       record;
  v_regra   record;
  v_quando  timestamptz;
  v_criados int := 0;
begin
  select b.*, c.email, c.phone_e164, c.first_name, c.locale
    into v_b
    from booking.bookings b
    join booking.customers c on c.id = b.customer_id
   where b.id = p_booking_id;

  if not found or not v_b.occupies_slot then
    return 0;
  end if;

  for v_regra in
    select * from booking.notification_rules
     where tenant_id = v_b.tenant_id and is_active
  loop
    -- Sem contacto no canal, não há job. Criar um job que vai falhar de certeza
    -- só enche o log de erros que ninguém pode resolver.
    if v_regra.channel = 'email' and v_b.email is null then continue; end if;
    if v_regra.channel in ('whatsapp', 'sms') and v_b.phone_e164 is null then continue; end if;

    v_quando := case
      when v_regra.offset_minutes = 0 then now()
      else v_b.start_at - make_interval(mins => v_regra.offset_minutes)
    end;

    -- Um lembrete cuja hora já passou não se envia com atraso: a marcação é
    -- daqui a duas horas e o lembrete era para 24 h antes. Enviá-lo agora
    -- diria "lembrete: amanhã" sobre uma consulta de hoje.
    if v_quando < now() - interval '5 minutes' then continue; end if;

    insert into booking.notification_jobs
      (tenant_id, booking_id, customer_id, channel, type, scheduled_for, payload)
    values (
      v_b.tenant_id, p_booking_id, v_b.customer_id, v_regra.channel, v_regra.type, v_quando,
      jsonb_build_object(
        'locale', coalesce(v_b.locale, 'pt-PT'),
        'target', v_regra.target
      )
    )
    on conflict do nothing;

    if found then v_criados := v_criados + 1; end if;
  end loop;

  return v_criados;
end;
$$;

-- -----------------------------------------------------------------------------
-- Cancelar em cascata
-- -----------------------------------------------------------------------------
-- Uma marcação cancelada não pode continuar a mandar lembretes. É o erro que
-- mais depressa faz um cliente perder a confiança no sistema: "cancelei e
-- continuam a mandar-me mensagens".
create or replace function booking.tg_bookings_notifications()
returns trigger
language plpgsql
security definer
set search_path = booking, pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    perform booking.plan_notifications(new.id);
    return new;
  end if;

  -- Deixou de ocupar slot: cancelada, remarcada, não compareceu.
  if old.occupies_slot and not new.occupies_slot then
    update booking.notification_jobs
       set status = 'cancelled', error = 'marcação em ' || new.status::text
     where booking_id = new.id and status = 'pending';
    return new;
  end if;

  -- Mudou de hora: os lembretes antigos apontam para a hora errada.
  if new.start_at is distinct from old.start_at then
    update booking.notification_jobs
       set status = 'cancelled', error = 'marcação movida'
     where booking_id = new.id and status = 'pending';

    perform booking.plan_notifications(new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_notifications on booking.bookings;
create trigger bookings_notifications
  after insert or update of status, start_at on booking.bookings
  for each row execute function booking.tg_bookings_notifications();

-- -----------------------------------------------------------------------------
-- O trabalhador
-- -----------------------------------------------------------------------------
-- Reclama até `p_limit` jobs vencidos e devolve tudo o que é preciso para os
-- compor. `skip locked` é o que faz dois trabalhadores em paralelo nunca
-- apanharem o mesmo.
create or replace function booking.claim_notification_jobs(
  p_worker text,
  p_limit  int default 25
)
returns jsonb
language plpgsql
security definer
set search_path = booking, pg_catalog
as $$
declare
  v_jobs jsonb;
begin
  with reclamados as (
    select j.id
      from booking.notification_jobs j
     where j.status = 'pending'
       and j.scheduled_for <= now()
       -- Um trabalhador que morra a meio deixaria o job preso para sempre.
       -- Dez minutos depois, volta à fila.
       and (j.locked_at is null or j.locked_at < now() - interval '10 minutes')
     order by j.scheduled_for
     limit p_limit
     for update skip locked
  ),
  marcados as (
    update booking.notification_jobs j
       set locked_at = now(), locked_by = p_worker, attempts = j.attempts + 1,
           last_attempt_at = now()
      from reclamados r
     where j.id = r.id
     returning j.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'jobId',        m.id,
    'channel',      m.channel,
    'type',         m.type,
    'attempts',     m.attempts,
    'locale',       coalesce(m.payload->>'locale', 'pt-PT'),

    'to',           case when m.channel = 'email' then c.email else c.phone_e164 end,
    'customerName', c.first_name,

    'tenantName',   t.display_name,
    'brandColor',   br.primary_color,
    'logoUrl',      br.logo_url,

    'serviceName',  sv.name,
    'startAt',      b.start_at,
    'endAt',        b.end_at,
    'timezone',     b.timezone,
    'staffName',    st.full_name,
    'locationName', l.name,
    'locationAddress', concat_ws(', ', l.address_line1, l.city),
    'locationPhone', l.phone_e164,

    -- O link de gestão vai no email. É o que fecha o ciclo do M11: a pessoa
    -- recebe a confirmação e tem ali o botão para remarcar.
    'manageToken',  (select at.token_hash from booking.access_tokens at
                      where at.booking_id = b.id and at.purpose = 'manage_booking' limit 1),

    'template',     (
      select jsonb_build_object('subject', tp.subject, 'body', tp.body)
      from booking.notification_templates tp
      where tp.type = m.type and tp.channel = m.channel and tp.is_active
        and (tp.tenant_id = m.tenant_id or tp.tenant_id is null)
      -- O template do tenant ganha ao da plataforma.
      order by tp.tenant_id nulls last
      limit 1
    )
  )), '[]'::jsonb)
  into v_jobs
  from marcados m
  left join booking.bookings   b  on b.id  = m.booking_id
  left join booking.customers  c  on c.id  = m.customer_id
  left join booking.tenants    t  on t.id  = m.tenant_id
  left join booking.tenant_branding br on br.tenant_id = m.tenant_id
  left join booking.services   sv on sv.id = b.service_id
  left join booking.staff      st on st.id = b.staff_id
  left join booking.locations  l  on l.id  = b.location_id;

  return v_jobs;
end;
$$;

-- -----------------------------------------------------------------------------
-- Fechar o job
-- -----------------------------------------------------------------------------
create or replace function booking.complete_notification_job(
  p_job_id uuid,
  p_provider_message_id text default null
)
returns void
language sql
security definer
set search_path = booking, pg_catalog
as $$
  update booking.notification_jobs
     set status = 'sent', sent_at = now(), provider_message_id = p_provider_message_id,
         locked_at = null, locked_by = null, error = null
   where id = p_job_id;
$$;

-- Falhar não é perder. O job volta à fila com espera crescente até à quinta
-- tentativa: 1, 2, 4, 8 e 16 minutos.
create or replace function booking.fail_notification_job(
  p_job_id uuid,
  p_error  text
)
returns void
language plpgsql
security definer
set search_path = booking, pg_catalog
as $$
declare
  v_tentativas int;
begin
  select attempts into v_tentativas from booking.notification_jobs where id = p_job_id;

  if v_tentativas >= 5 then
    update booking.notification_jobs
       set status = 'failed', error = p_error, locked_at = null, locked_by = null
     where id = p_job_id;
  else
    update booking.notification_jobs
       set status = 'pending',
           error = p_error,
           scheduled_for = now() + make_interval(mins => power(2, v_tentativas - 1)::int),
           locked_at = null,
           locked_by = null
     where id = p_job_id;
  end if;
end;
$$;

revoke execute on function booking.plan_notifications(uuid) from public;
revoke execute on function booking.claim_notification_jobs(text, int) from public;
revoke execute on function booking.complete_notification_job(uuid, text) from public;
revoke execute on function booking.fail_notification_job(uuid, text) from public;

grant execute on function booking.claim_notification_jobs(text, int)      to service_role;
grant execute on function booking.complete_notification_job(uuid, text)   to service_role;
grant execute on function booking.fail_notification_job(uuid, text)       to service_role;

comment on table booking.notification_jobs is
  'Fila de envios. O índice único (booking_id, type, channel, scheduled_for) É a idempotência.';
comment on function booking.claim_notification_jobs(text, int) is
  'Reclama jobs vencidos com FOR UPDATE SKIP LOCKED. Dois trabalhadores em paralelo nunca apanham o mesmo.';
