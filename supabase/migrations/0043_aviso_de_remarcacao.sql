-- 0043 — Uma remarcação avisa que foi alterada, não que foi criada
--
-- O QUE ESTAVA ERRADO
--
-- Mudar a hora pelo WhatsApp mandava ao cliente "a sua marcação está
-- confirmada", com a hora nova. Não é falso — a marcação existe e está mesmo
-- confirmada — mas responde à pergunta errada: quem pediu para mudar quer
-- saber que **mudou**, e recebe uma mensagem indistinguível da de uma marcação
-- nova. Numa caixa de entrada com as duas, não se percebe qual é qual.
--
-- PORQUE É QUE ACONTECIA
--
-- O `reschedule_booking` não altera a marcação: marca a antiga como
-- `rescheduled` e **insere uma linha nova**. Para o gatilho isso é um INSERT
-- como outro qualquer, e planeava `booking_created`.
--
-- A regra `rescheduled` da 0042 só disparava pelo outro caminho — arrastar na
-- agenda, que faz UPDATE do `start_at`. Existia e quase nunca corria.
--
-- COMO SE DISTINGUE
--
-- A linha nova guarda `rescheduled_from_id` a apontar para a que substituiu.
-- É o sinal que já lá estava, e que ninguém lia.

create or replace function booking.tg_bookings_notifications()
returns trigger
language plpgsql
security definer
set search_path = booking, pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    -- Nascida de uma remarcação, ou nova de raiz.
    perform booking.plan_notifications(
      new.id,
      case
        when new.rescheduled_from_id is not null
          then array['rescheduled','reminder']::booking.notification_type[]
        else array['booking_created','reminder']::booking.notification_type[]
      end);
    return new;
  end if;

  -- Deixou de ocupar a agenda. `rescheduled` tem aviso próprio, mais abaixo:
  -- dizer "cancelada" a quem só mudou de hora seria assustar sem motivo.
  if old.occupies_slot and not new.occupies_slot then
    update booking.notification_jobs
       set status = 'cancelled', error = 'marcação em ' || new.status::text
     where booking_id = new.id and status = 'pending';

    if new.status::text like 'cancelled%' then
      perform booking.plan_notifications(
        new.id, array['cancelled']::booking.notification_type[]);
    end if;

    return new;
  end if;

  if new.status = 'confirmed' and old.status is distinct from new.status then
    perform booking.plan_notifications(
      new.id, array['booking_confirmed']::booking.notification_type[]);
  end if;

  -- Mudou de hora: os lembretes antigos apontam para a hora errada.
  if new.start_at is distinct from old.start_at then
    update booking.notification_jobs
       set status = 'cancelled', error = 'marcação movida'
     where booking_id = new.id and status = 'pending' and type = 'reminder';

    perform booking.plan_notifications(
      new.id, array['rescheduled','reminder']::booking.notification_type[]);
  end if;

  return new;
end;
$$;
