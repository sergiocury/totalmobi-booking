-- =============================================================================
-- 0028 — WhatsApp: contas, webhooks e conversas
-- =============================================================================
--
-- A regra que domina este ficheiro: **o token de acesso de um cliente nunca
-- pode ser lido pela API.**
--
-- Um token da Meta permite enviar mensagens em nome da empresa — a qualquer
-- pessoa, com qualquer conteúdo. Quem o roubar não rouba dados: rouba a voz do
-- negócio. Por isso a `tenant_whatsapp_accounts` **não tem política de
-- `SELECT` para papel nenhum**, nem sequer para o dono da empresa. Com a RLS
-- ligada e forçada e sem política, a tabela é opaca a toda a gente exceto ao
-- `service_role`, que só é usado dentro do trabalhador.
--
-- O que a interface mostra — estado da ligação, número, qualidade — vem de uma
-- **vista** que não expõe a coluna do token.
--
-- E o token é cifrado antes de chegar aqui. Não é paranoia empilhada: um
-- `pg_dump` para depuração, uma cópia de segurança mal guardada ou um erro de
-- política futura deixam de ser catastróficos.
--
-- IDEMPOTÊNCIA DOS WEBHOOKS
--
-- A Meta reenvia o que não recebeu confirmação, e reenvia mais do que uma vez.
-- Um `INSERT` com índice único no id do evento é a diferença entre processar
-- uma marcação e processá-la três vezes.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A conta de WhatsApp de cada empresa
-- -----------------------------------------------------------------------------
create table if not exists booking.tenant_whatsapp_accounts (
  tenant_id             uuid primary key references booking.tenants(id) on delete cascade,

  waba_id               text not null,
  -- Único: é por aqui que o webhook descobre de que empresa é a mensagem. Duas
  -- empresas com o mesmo número seria impossível de desambiguar.
  phone_number_id       text not null unique,
  display_phone_number  text,
  business_id           text,

  -- Cifrado em AES-256-GCM do lado da aplicação. O `token_key_id` diz com que
  -- chave, para se poder rodar a chave sem reautenticar toda a gente.
  access_token_encrypted bytea,
  token_key_id          text,

  verified_name         text,
  status                text not null default 'pending'
                          check (status in ('pending','connected','suspended','error')),
  quality_rating        text,
  messaging_limit       text,

  webhook_verified_at   timestamptz,
  connected_at          timestamptz,
  last_error            text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create trigger tenant_whatsapp_accounts_touch before update
  on booking.tenant_whatsapp_accounts
  for each row execute function booking.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Eventos recebidos
-- -----------------------------------------------------------------------------
create table if not exists booking.webhook_events (
  id                 uuid primary key default gen_random_uuid(),
  provider           text not null,
  external_event_id  text not null,
  tenant_id          uuid references booking.tenants(id) on delete set null,

  payload            jsonb not null,
  signature_valid    boolean not null default false,
  status             booking.webhook_status not null default 'received',
  attempts           int not null default 0,

  received_at        timestamptz not null default now(),
  processed_at       timestamptz,
  error              text
);

-- **Isto é a idempotência.** A Meta reenvia; o índice recusa o duplicado.
create unique index if not exists webhook_events_provider_event_uk
  on booking.webhook_events (provider, external_event_id);

create index if not exists webhook_events_pendentes_idx
  on booking.webhook_events (received_at) where status = 'received';

-- -----------------------------------------------------------------------------
-- Conversas
-- -----------------------------------------------------------------------------
create table if not exists booking.conversations (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references booking.tenants(id) on delete cascade,
  customer_id      uuid references booking.customers(id) on delete set null,

  channel          booking.conversation_channel not null,
  /** O `wa_id` do contacto — o número em formato internacional sem `+`. */
  external_id      text not null,

  status           text not null default 'open' check (status in ('open','closed')),
  current_state    booking.conversation_state not null default 'NEW',

  -- O que a conversa já sabe: serviço escolhido, data, slots oferecidos. É o
  -- que permite saltar passos, e o que se volta a ler quando a pessoa responde
  -- três horas depois.
  context          jsonb not null default '{}'::jsonb,

  assigned_user_id uuid references auth.users(id) on delete set null,

  -- **A janela de 24 horas.** Fora dela só sai template aprovado. Guarda-se o
  -- instante da última mensagem *de entrada*, porque é essa que abre a janela —
  -- as nossas não a renovam.
  last_inbound_at  timestamptz,
  last_message_at  timestamptz,

  -- Quando um humano assume, o bot cala-se até esta hora. Um bot a responder
  -- por cima de uma pessoa é a pior experiência possível.
  bot_paused_until timestamptz,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists conversations_abertas_uk
  on booking.conversations (tenant_id, channel, external_id)
  where status = 'open';

create trigger conversations_touch before update on booking.conversations
  for each row execute function booking.touch_updated_at();

create table if not exists booking.conversation_messages (
  id                  uuid primary key default gen_random_uuid(),
  conversation_id     uuid not null references booking.conversations(id) on delete cascade,
  direction           booking.message_direction not null,

  -- Único: a Meta reenvia eventos, e sem isto a mesma mensagem apareceria duas
  -- vezes no histórico de quem está a atender.
  provider_message_id text unique,

  type                text not null default 'text'
                        check (type in ('text','interactive','audio','image','document','template','system')),
  text                text,
  structured_payload  jsonb,
  ai_intent           jsonb,

  status              text,
  sent_at             timestamptz,
  delivered_at        timestamptz,
  read_at             timestamptz,
  failed_at           timestamptz,
  error               text,

  created_at          timestamptz not null default now()
);

create index if not exists conversation_messages_conversa_idx
  on booking.conversation_messages (conversation_id, created_at);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table booking.tenant_whatsapp_accounts enable row level security;
alter table booking.tenant_whatsapp_accounts force  row level security;
alter table booking.webhook_events           enable row level security;
alter table booking.webhook_events           force  row level security;
alter table booking.conversations            enable row level security;
alter table booking.conversations            force  row level security;
alter table booking.conversation_messages    enable row level security;
alter table booking.conversation_messages    force  row level security;

-- `tenant_whatsapp_accounts`: **sem política nenhuma, de propósito.**
-- `webhook_events`: idem — é registo técnico com corpos de mensagens lá dentro.

drop policy if exists conversations_membro on booking.conversations;
create policy conversations_membro on booking.conversations
  for all to authenticated
  using (tenant_id = any ((select booking.current_tenant_ids())::uuid[]) or (select booking.is_platform_admin()))
  with check (tenant_id = any ((select booking.current_tenant_ids())::uuid[]) or (select booking.is_platform_admin()));

drop policy if exists conversation_messages_membro on booking.conversation_messages;
create policy conversation_messages_membro on booking.conversation_messages
  for all to authenticated
  using (exists (
    select 1 from booking.conversations c
    where c.id = conversation_messages.conversation_id
      and (c.tenant_id = any ((select booking.current_tenant_ids())::uuid[])
           or (select booking.is_platform_admin()))
  ))
  with check (exists (
    select 1 from booking.conversations c
    where c.id = conversation_messages.conversation_id
      and (c.tenant_id = any ((select booking.current_tenant_ids())::uuid[])
           or (select booking.is_platform_admin()))
  ));

grant all on booking.tenant_whatsapp_accounts to service_role;
grant all on booking.webhook_events           to service_role;
grant select, insert, update, delete on booking.conversations         to authenticated;
grant all    on booking.conversations         to service_role;
grant select, insert, update, delete on booking.conversation_messages to authenticated;
grant all    on booking.conversation_messages to service_role;

-- -----------------------------------------------------------------------------
-- O que a interface pode ver
-- -----------------------------------------------------------------------------
-- Vista com `security_invoker` e **sem a coluna do token**. É o que permite
-- mostrar o estado da ligação sem abrir a porta ao segredo.
create or replace view booking.whatsapp_connection_status
with (security_invoker = true) as
  select
    a.tenant_id,
    a.display_phone_number,
    a.verified_name,
    a.status,
    a.quality_rating,
    a.messaging_limit,
    a.webhook_verified_at,
    a.connected_at,
    a.last_error,
    (a.access_token_encrypted is not null) as tem_token
  from booking.tenant_whatsapp_accounts a
  where a.tenant_id = any ((select booking.current_tenant_ids())::uuid[])
     or (select booking.is_platform_admin());

grant select on booking.whatsapp_connection_status to authenticated, service_role;

comment on view booking.whatsapp_connection_status is
  'Estado da ligação ao WhatsApp, sem o token. A tabela de origem não tem política de SELECT para papel nenhum.';

-- -----------------------------------------------------------------------------
-- Resolver o tenant a partir do número
-- -----------------------------------------------------------------------------
-- O webhook chega sem saber de quem é. O `phone_number_id` é a chave.
create or replace function booking.tenant_by_phone_number_id(p_phone_number_id text)
returns uuid
language sql
stable
security definer
set search_path = booking, pg_catalog
as $$
  select tenant_id from booking.tenant_whatsapp_accounts
   where phone_number_id = p_phone_number_id and status = 'connected';
$$;

revoke execute on function booking.tenant_by_phone_number_id(text) from public;
grant  execute on function booking.tenant_by_phone_number_id(text) to service_role;

-- -----------------------------------------------------------------------------
-- Registar um evento, uma vez só
-- -----------------------------------------------------------------------------
-- Devolve `true` se este evento é novo. `false` significa "já foi processado" —
-- e é a resposta correta a um reenvio da Meta.
create or replace function booking.record_webhook_event(
  p_provider text,
  p_event_id text,
  p_tenant   uuid,
  p_payload  jsonb,
  p_signature_valid boolean
)
returns boolean
language plpgsql
security definer
set search_path = booking, pg_catalog
as $$
declare
  v_id uuid;
begin
  insert into booking.webhook_events
    (provider, external_event_id, tenant_id, payload, signature_valid, attempts)
  values (p_provider, p_event_id, p_tenant, p_payload, p_signature_valid, 1)
  on conflict (provider, external_event_id) do nothing
  returning id into v_id;

  return v_id is not null;
end;
$$;

revoke execute on function booking.record_webhook_event(text, text, uuid, jsonb, boolean) from public;
grant  execute on function booking.record_webhook_event(text, text, uuid, jsonb, boolean) to service_role;

-- -----------------------------------------------------------------------------
-- Guarda
-- -----------------------------------------------------------------------------
do $$
declare v_politicas text;
begin
  select string_agg(policyname, ', ') into v_politicas
  from pg_policies
  where schemaname = 'booking'
    and tablename in ('tenant_whatsapp_accounts', 'webhook_events');

  if v_politicas is not null then
    raise exception
      'tenant_whatsapp_accounts e webhook_events não podem ter políticas: o token e os corpos das mensagens só são acessíveis ao service_role. Encontradas: %',
      v_politicas;
  end if;
end;
$$;
