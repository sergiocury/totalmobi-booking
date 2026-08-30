-- 0041 — Confirmação e lembrete por WhatsApp para quem tem WhatsApp ligado
--
-- O QUE SE PARTIU
--
-- O assistente diz "Está marcado. Vai receber a confirmação por aqui." e nunca
-- chegava nada. A causa não estava no envio: **nenhum job era sequer criado**.
--
-- O `plan_notifications` percorre as `notification_rules` do tenant. Todas as
-- regras da Clínica Sorriso eram de canal `email`, e um cliente que marca pelo
-- WhatsApp tem telemóvel e não tem email — por isso todas as regras caíam no
--
--   if v_regra.channel = 'email' and v_b.email is null then continue; end if;
--
-- Zero jobs, zero confirmações, e uma promessa por cumprir a cada marcação.
--
-- PORQUE É QUE ISTO É UMA MIGRAÇÃO E NÃO UM VALOR POR OMISSÃO NO CÓDIGO
--
-- As regras são dados por empresa: cada uma decide o que envia e quando. O que
-- faltava era o arranque — quem liga o WhatsApp fica com as regras de email de
-- origem e mais nada. Isto acerta o que já existe; a criação de novas empresas
-- passa a herdar as mesmas regras pelo caminho normal do produto.
--
-- SÓ PARA QUEM TEM O CANAL LIGADO
--
-- Criar uma regra de WhatsApp numa empresa sem número ligado encheria a fila de
-- jobs que falham de certeza — exatamente o que o comentário do
-- `plan_notifications` diz para não fazer.

-- O `target` fica no valor por omissao da tabela (`customer`).
insert into booking.notification_rules (tenant_id, type, channel, offset_minutes)
select w.tenant_id, r.type, 'whatsapp'::booking.notification_channel, r.offset_minutes
  from booking.tenant_whatsapp_accounts w
  cross join (
    values
      ('booking_created'::booking.notification_type, 0),
      ('cancelled'::booking.notification_type,       0),
      -- Véspera, como a regra de email que já existia.
      ('reminder'::booking.notification_type,        1440)
  ) as r(type, offset_minutes)
 where w.status = 'connected'
on conflict (tenant_id, type, channel, offset_minutes) do nothing;
