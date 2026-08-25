-- =============================================================================
-- 0035 — Privilégios das tabelas de subscrição
-- =============================================================================
-- A migration 0034 criou `stripe_webhook_events` e `tenant_subscriptions` e deu
-- um único grant: `select` a `authenticated`. Faltou o `service_role`.
--
-- A `0001` avisa: "Sem privilégios por omissão para objetos futuros: cada tabela
-- nova tem de receber grants explícitos". A regra estava escrita, e a 0034
-- passou-lhe ao lado.
--
-- COMO ISTO SE MANIFESTOU
--
-- O webhook do Stripe entrega, a assinatura é válida, e o primeiro insert em
-- `stripe_webhook_events` devolve 42501 — permission denied. O código só sabe
-- distinguir 23505 (repetido, responde 200); tudo o resto é 500. Resultado: o
-- Stripe via 500 em todos os eventos, ninguém era processado, e a tabela ficava
-- vazia porque a escrita nela era precisamente o que falhava.
--
-- O RLS não protege nada sem privilégios por baixo: uma política só é consultada
-- depois de a role ter direito à tabela. `service_role` ignora RLS, mas não
-- ignora `grant`.
-- =============================================================================

-- Só o servidor escreve aqui. Nem `anon` nem `authenticated` têm que ver
-- registos de webhook — são o diário interno de uma integração.
grant all on booking.stripe_webhook_events to service_role;

-- O `select` a `authenticated` já foi dado na 0034, com a política de RLS que o
-- limita à empresa de quem pergunta. Falta quem escreve.
grant all on booking.tenant_subscriptions to service_role;
