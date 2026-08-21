-- =============================================================================
-- 0029 — O tenant de um webhook pode ser desconhecido
-- =============================================================================
--
-- A `record_webhook_event` da 0028 exigia o `p_tenant`. Mas o caso mais comum
-- de um evento **sem** tenant é precisamente o que interessa registar: uma
-- mensagem para um `phone_number_id` que ainda não está ligado a nenhuma
-- empresa — porque a ligação falhou a meio, porque o número mudou de conta, ou
-- porque alguém apontou o webhook para o sítio errado.
--
-- Perder esses eventos seria perder exatamente o rasto de que se precisa para
-- perceber o que correu mal. O parâmetro passa a ter `default null`.
-- =============================================================================

create or replace function booking.record_webhook_event(
  p_provider text,
  p_event_id text,
  p_payload  jsonb,
  p_signature_valid boolean,
  p_tenant   uuid default null
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

-- A assinatura antiga tinha os parâmetros por outra ordem; fica sem uso.
drop function if exists booking.record_webhook_event(text, text, uuid, jsonb, boolean);

revoke execute on function booking.record_webhook_event(text, text, jsonb, boolean, uuid) from public;
grant  execute on function booking.record_webhook_event(text, text, jsonb, boolean, uuid) to service_role;
