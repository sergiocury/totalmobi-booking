-- =============================================================================
-- 0037 — A cor por omissão passa a ser o turquesa da marca
-- =============================================================================
-- O Sérgio fixou o turquesa da Totalmobi Booking em `#0098AB` (2026-08-27), e
-- entregou a folha de marca com o logótipo já nessa cor. A cor por omissão das
-- empresas novas passa a acompanhá-la.
--
-- ISTO SUBSTITUI A `0036`, QUE NUNCA CHEGOU A CORRER
--
-- A `0036` punha `#3358D4` — um azul escolhido quando a marca ainda era azul.
-- Não se reescreve uma migration já publicada, por isso esta vem por cima e
-- trata os três valores possíveis: o original `#0B5FFF`, o `#3358D4` da 0036
-- (caso ela tenha corrido algures) e nada mais. Correr as duas por ordem ou só
-- esta dá o mesmo resultado.
--
-- SOBRE O CONTRASTE, QUE NÃO É PROBLEMA MAS CONVÉM ESTAR ESCRITO
--
-- `#0098AB` tem 3,45:1 contra branco — abaixo dos 4,5:1 que a WCAG pede para
-- texto normal. Isso **não** é um defeito desta migration: o `resolveBranding`
-- separa os dois usos, e é para isto que existe.
--
--   `--brand-solid`  a cor tal como é, para preenchimentos
--   `--brand`        escurecida por `adjustForContrast()` até dar 4,5:1
--   `--brand-ink`    calculada por `readableTextOn()`, nunca assumida
--
-- É a mesma correção que o `tokens.css` já documenta ter aplicado a si próprio
-- depois de uma auditoria — o token da landing é `#0e7a84`, que é este turquesa
-- escurecido até ser legível.
--
-- Só se atualizam as empresas que ainda estão num valor por omissão. Quem
-- escolheu a sua cor fica com ela: mudar a marca de um cliente por causa de uma
-- migration seria um abuso.
-- =============================================================================

alter table booking.tenant_branding
  alter column primary_color set default '#0098AB';

update booking.tenant_branding
set primary_color = '#0098AB',
    updated_at = now()
where primary_color in ('#0B5FFF', '#3358D4');
