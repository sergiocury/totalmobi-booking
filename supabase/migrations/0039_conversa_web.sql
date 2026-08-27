-- =============================================================================
-- 0039 — A conversa da página pública, sem dar a tabela ao anónimo
-- =============================================================================
-- O assistente da página pública corre com o cliente anónimo e precisa de
-- guardar estado entre mensagens. `booking.conversations` não tem — nem deve
-- ter — grants para `anon`.
--
-- PORQUE É QUE NÃO SE RESOLVE COM UMA POLÍTICA DE RLS
--
-- Uma política precisa de saber de quem é a linha. Aqui não há sessão: o
-- visitante é anónimo por definição. A política possível seria
-- `using (channel = 'web_chat')`, e isso deixaria **qualquer pessoa ler todas
-- as conversas de todas as empresas** — o que se falou, que serviço, que dia.
--
-- Por isso a escrita passa por funções, que é o mesmo padrão do
-- `availability_dataset` e do `create_booking_atomic`: o anónimo recebe
-- `execute`, nunca acesso à tabela, e as regras vivem dentro da função.
--
-- O que estas garantem, e uma política solta não garantiria:
--
--   · só o canal `web_chat` — nunca se toca numa conversa de WhatsApp
--   · só empresas ativas e não arquivadas
--   · a conversa tem de pertencer à empresa que a pede, senão não existe
--
-- Esse último ponto é o que impede alguém de adivinhar um id e reescrever o
-- estado da conversa de outra empresa.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Abrir ou retomar
-- -----------------------------------------------------------------------------
create or replace function booking.conversa_web_abrir(
  p_tenant uuid,
  p_id     uuid default null
)
returns table (id uuid, current_state booking.conversation_state, context jsonb)
language plpgsql
volatile
security definer
set search_path = booking, public
as $$
declare
  v_id uuid;
begin
  -- Uma empresa suspensa não conversa com ninguém: deixar de o fazer é metade
  -- do efeito de a suspender.
  if not exists (
    select 1 from booking.tenants t
     where t.id = p_tenant and t.status = 'active' and t.archived_at is null
  ) then
    return;
  end if;

  if p_id is not null then
    select c.id into v_id
      from booking.conversations c
     where c.id = p_id
       and c.tenant_id = p_tenant
       and c.channel = 'web_chat';
  end if;

  if v_id is null then
    insert into booking.conversations
      (tenant_id, channel, external_id, current_state, context, last_inbound_at)
    values
      (p_tenant, 'web_chat', gen_random_uuid()::text, 'NEW', '{}'::jsonb, now())
    returning conversations.id into v_id;
  else
    update booking.conversations c
       set last_inbound_at = now(), updated_at = now()
     where c.id = v_id;
  end if;

  return query
    select c.id, c.current_state, c.context
      from booking.conversations c
     where c.id = v_id;
end;
$$;

comment on function booking.conversa_web_abrir(uuid, uuid) is
  'Abre ou retoma a conversa web de um visitante anónimo. Só canal web_chat.';

-- -----------------------------------------------------------------------------
-- Guardar o turno
-- -----------------------------------------------------------------------------
-- Guarda o estado **e** as duas mensagens. Sem elas a caixa de entrada do
-- painel mostrava metade da conversa, e uma queixa de cliente não teria como
-- ser verificada.
create or replace function booking.conversa_web_guardar(
  p_id       uuid,
  p_tenant   uuid,
  p_estado   booking.conversation_state,
  p_contexto jsonb,
  p_pergunta text,
  p_resposta text
)
returns void
language plpgsql
volatile
security definer
set search_path = booking, public
as $$
begin
  update booking.conversations c
     set current_state   = p_estado,
         context         = p_contexto,
         last_message_at = now(),
         updated_at      = now()
   where c.id = p_id
     and c.tenant_id = p_tenant
     and c.channel = 'web_chat';

  -- Não encontrou: id errado, empresa errada, ou uma tentativa de tocar numa
  -- conversa de outro canal. Sai sem escrever mensagem nenhuma.
  if not found then
    return;
  end if;

  insert into booking.conversation_messages (conversation_id, direction, type, text, status)
  values (p_id, 'inbound',  'text', left(p_pergunta, 2000), 'received'),
         (p_id, 'outbound', 'text', left(p_resposta, 2000), 'sent');
end;
$$;

comment on function booking.conversa_web_guardar(uuid, uuid, booking.conversation_state, jsonb, text, text) is
  'Grava o turno da conversa web: estado, contexto e o par de mensagens.';

revoke all on function booking.conversa_web_abrir(uuid, uuid) from public;
revoke all on function booking.conversa_web_guardar(uuid, uuid, booking.conversation_state, jsonb, text, text) from public;

grant execute on function booking.conversa_web_abrir(uuid, uuid)
  to anon, authenticated, service_role;
grant execute on function booking.conversa_web_guardar(uuid, uuid, booking.conversation_state, jsonb, text, text)
  to anon, authenticated, service_role;
