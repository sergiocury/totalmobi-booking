-- 0042 — Avisar quando a marcação é confirmada, e quando é movida
--
-- O QUE FALTAVA
--
-- Confirmar uma marcação no painel não avisava ninguém. O gatilho
-- `tg_bookings_notifications` já planeia `booking_confirmed` na transição de
-- estado — e planeava contra uma lista de regras onde esse tipo não existia,
-- em canal nenhum. Zero jobs, zero avisos, e do lado do cliente a última
-- mensagem continuava a ser "vai receber a confirmação por aqui".
--
-- O mesmo vale para `rescheduled`: mover uma marcação na agenda cancela os
-- lembretes antigos e planeia um aviso que também não tinha regra. Quem fosse
-- movido de hora não era informado — que é pior do que não mover.
--
-- PORQUE É QUE OS DOIS CANAIS PODEM ENTRAR
--
-- Ao contrário da 0041, aqui há templates de email para ambos os tipos
-- (`booking_confirmed` e `rescheduled`, ambos globais e em pt-PT). Criar a
-- regra de email sem template daria jobs a falhar com "faltam dados"; com
-- template, funcionam.
--
-- O email só entra em empresas que **já** usam email. Uma empresa que desligou
-- os avisos por email não os quer de volta por causa de uma migração.

-- WhatsApp: só para quem tem o canal ligado. Ver a nota da 0041.
insert into booking.notification_rules (tenant_id, type, channel, offset_minutes)
select w.tenant_id, r.type, 'whatsapp'::booking.notification_channel, 0
  from booking.tenant_whatsapp_accounts w
  cross join (
    values
      ('booking_confirmed'::booking.notification_type),
      ('rescheduled'::booking.notification_type)
  ) as r(type)
 where w.status = 'connected'
on conflict (tenant_id, type, channel, offset_minutes) do nothing;

-- Email: só para quem já tem alguma regra de email ativa.
insert into booking.notification_rules (tenant_id, type, channel, offset_minutes)
select distinct nr.tenant_id, r.type, 'email'::booking.notification_channel, 0
  from booking.notification_rules nr
  cross join (
    values
      ('booking_confirmed'::booking.notification_type),
      ('rescheduled'::booking.notification_type)
  ) as r(type)
 where nr.channel = 'email' and nr.is_active
on conflict (tenant_id, type, channel, offset_minutes) do nothing;
