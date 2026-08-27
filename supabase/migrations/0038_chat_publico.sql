-- =============================================================================
-- 0038 — Saber, do lado de fora, se uma empresa tem assistente na página
-- =============================================================================
-- A página pública corre com o cliente **anónimo**, de propósito: é a forma de
-- garantir que só mostra o que um visitante pode ver. Mas precisa de decidir se
-- desenha o botão "Prefere escrever?", e isso depende de uma funcionalidade.
--
-- `plan_features` é legível por `anon`; `tenant_features` **não é**, e não deve
-- passar a ser — é lá que vivem as sobreposições comerciais de cada cliente, e
-- expô-las diria a qualquer pessoa o que cada empresa tem contratado.
--
-- Daí esta função, que responde a uma pergunta só e devolve um booleano.
-- `SECURITY DEFINER` para poder cruzar as duas tabelas; sem parâmetro de
-- funcionalidade para não virar um oráculo genérico sobre o que cada empresa
-- tem. A resposta já é visível do lado de fora de qualquer maneira: o botão
-- aparece ou não aparece.
-- =============================================================================

create or replace function booking.chat_publico_ativo(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = booking, public
as $$
  select exists (
    select 1
    from booking.tenants t
    where t.id = p_tenant
      and t.status = 'active'
      and t.archived_at is null
      and (
        -- A sobreposição do cliente ganha ao plano, nos dois sentidos: pode
        -- ligar o que o plano não dá, e desligar o que o plano dá.
        coalesce(
          (select tf.enabled
             from booking.tenant_features tf
            where tf.tenant_id = t.id and tf.feature_key = 'chatbot_ai'),
          (select true
             from booking.plan_features pf
            where pf.plan_code = t.plan_code and pf.feature_key = 'chatbot_ai'),
          false
        )
      )
  );
$$;

comment on function booking.chat_publico_ativo(uuid) is
  'A página pública desta empresa mostra o assistente? Booleano, para o cliente anónimo.';

revoke all on function booking.chat_publico_ativo(uuid) from public;
grant execute on function booking.chat_publico_ativo(uuid) to anon, authenticated, service_role;
