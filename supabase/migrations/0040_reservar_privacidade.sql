-- 0040 — Reservar o slug `privacidade`
--
-- A página pública da política de privacidade vive em `/privacidade`. Sem esta
-- linha, uma empresa podia registar-se com esse identificador e o seu link
-- público passaria a colidir com a política da plataforma — a rota da app ganha,
-- e a empresa ficaria com uma página que nunca abre e nenhuma mensagem de erro
-- a explicar porquê.
--
-- O `SEGMENTOS_RESERVADOS` já protege o encaminhamento; isto protege o registo,
-- que é a outra metade do mesmo problema. Ver `tenant-resolution.ts`.

insert into booking.reserved_slugs (slug) values ('privacidade')
on conflict do nothing;
