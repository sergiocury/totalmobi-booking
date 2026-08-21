# Deploy

> Do computador do Sérgio para `booking.totalmobi.pt`.
> Escrito a 2026-08-21, com o MVP 1 completo e por publicar.

---

## O que está feito e o que falta

O código está pronto. O que falta é ligá-lo ao mundo, e são cinco coisas — todas
fora do editor:

1. Repositório no GitHub
2. Projeto na Vercel, com as variáveis de ambiente
3. O subdomínio a apontar para lá
4. **O agendador da fila** — sem ele os lembretes não saem
5. Chave do Brevo, para os emails saírem mesmo

---

## 1. Repositório

O projeto vive em `C:\Users\sergi\dev\totalmobi-booking`. A cópia no Google
Drive é **espelho, nunca origem** — o `sync-to-drive.ps1` sobrepõe-a a cada
execução.

O `.gitignore` já cobre `.env*` (exceto o `.env.example`), o `node_modules` e o
`.next`. Confirmado com `git check-ignore`: nenhum segredo entra.

```bash
git remote add origin git@github.com:<utilizador>/totalmobi-booking.git
git push -u origin master
```

---

## 2. Vercel

**Importar o repositório** e, nas definições do projeto:

| Definição | Valor |
|---|---|
| Framework | Next.js (deteta sozinho) |
| **Root Directory** | `apps/web` |
| Install Command | por omissão — a Vercel percebe workspaces npm a partir da raiz |

### Variáveis de ambiente

Copiar do `apps/web/.env.local`. As que **têm** de lá estar:

```
NEXT_PUBLIC_APP_URL=https://booking.totalmobi.pt
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NOTIFICATIONS_CRON_SECRET
WHATSAPP_APP_SECRET
WHATSAPP_VERIFY_TOKEN
WHATSAPP_TOKEN_KEY
WHATSAPP_TOKEN_KEY_ID
EMAIL_FROM            ← ex.: marcacoes@totalmobi.pt
BREVO_API_KEY         ← do painel do Brevo (xkeysib-…)
```

⚠️ **O `NEXT_PUBLIC_APP_URL` tem de ser o URL final.** É a partir dele que se
constrói o link `/m/<token>` que vai nos emails. Com o valor errado, os clientes
recebem lembretes com links que não abrem.

⚠️ **A `WHATSAPP_TOKEN_KEY` tem de ser a mesma que cifrou os tokens.** Se for
gerada uma chave nova, os tokens guardados deixam de decifrar e o WhatsApp
deixa de enviar — sem erro visível até alguém tentar.

### Redirects do Supabase

Acrescentar `https://booking.totalmobi.pt/**` à lista de redirects permitidos no
painel do Supabase (Authentication → URL Configuration). É **aditivo** e não
afeta o CMS — mas sem isso os links de convite e de login não funcionam em
produção.

---

## 3. O subdomínio

`booking.totalmobi.pt` → Vercel, pelos registos que ela indicar. A propagação
demora até algumas horas.

---

## 4. O agendador da fila ⚠️

**É o passo que mais custa esquecer.** Sem ele, `notification_jobs` enche-se de
linhas `pending` e nenhum lembrete sai. Não há erro; simplesmente não acontece
nada.

### Porque não é o cron da Vercel

Verificado na documentação a 2026-08-21: no plano **Hobby** os crons correm
**uma vez por dia**, com ±59 min de imprecisão, e uma expressão mais frequente
**faz falhar o deploy**. Um lembrete de duas horas antes ficaria inútil.

O plano Pro faz ao minuto e custa ~20 USD/mês. É uma opção legítima; só não é a
mais barata nem a mais direta.

### O que usamos: `pg_cron` dentro do Supabase

Já estava instalado neste projeto. O `pg_net` foi acrescentado pela migration
`0032` — é aditivo, e há uma guarda que faz a migration falhar se o job do CMS
(`al_daily_obligations`) desaparecer.

Depois do deploy, correr **uma vez**:

```sql
select booking.agendar_notificacoes(
  'https://booking.totalmobi.pt/api/notificacoes/tick',
  '<o valor de NOTIFICATIONS_CRON_SECRET>'
);
```

O segredo entra por argumento e **não está em migration nenhuma** — um segredo
no git fica no git para sempre, mesmo depois de apagado.

### Confirmar que está a correr

```sql
select jsonb_pretty(booking.estado_do_agendador());
```

Responde a três perguntas de uma vez: está agendado, as últimas cinco corridas
falharam?, e quantos avisos estão à espera. **Vale a pena olhar para isto no dia
seguinte ao deploy** — `fila.atrasados` acima de zero significa que alguma coisa
não está a drenar.

---

## 5. Email — Brevo

Sem chave de fornecedor, os emails vão para a consola do servidor em vez do
destinatário. Com aviso, mas ninguém os recebe.

**Usa-se o Brevo**, porque o `totalmobi.pt` **já lá está verificado** e a
funcionar noutros projetos do Sérgio:

```
v=spf1 +a +mx +ip4:… include:relay.thundermail.uk include:spf.brevo.com ~all
brevo1._domainkey.totalmobi.pt  CNAME  b1.totalmobi-pt.dkim.brevo.com
brevo2._domainkey.totalmobi.pt  CNAME  b2.totalmobi-pt.dkim.brevo.com
_dmarc.totalmobi.pt             TXT    v=DMARC1; p=none; rua=…@dmarc.brevo.com
```

**Não é preciso mexer no DNS.** Só duas variáveis:

```
EMAIL_FROM=marcacoes@totalmobi.pt
BREVO_API_KEY=xkeysib-…
```

### Porque não o Resend

Tentou-se. O Resend exige um **TXT** em `resend._domainkey.<domínio>`, e o
painel do one.com recusa-o com "Ocorreu um erro inesperado" e uma referência
opaca — em `booking.totalmobi.pt` e também em `totalmobi.pt`.

O padrão do que o painel aceita e recusa é claro:

| Registo | Forma | Resultado |
|---|---|---|
| `_dmarc.totalmobi.pt` | TXT, underscore na 1.ª etiqueta | ✅ existe |
| `brevo1._domainkey.totalmobi.pt` | CNAME, underscore no meio | ✅ existe |
| `resend._domainkey.totalmobi.pt` | **TXT, underscore no meio** | ❌ erro |

É um defeito do painel do one.com, não uma configuração errada. O
`ResendEmailProvider` fica no código e funciona — basta pôr `RESEND_API_KEY` e
`EMAIL_PROVIDER=resend` no dia em que o DNS mudar de casa ou o suporte deles
resolver.

### O que se perde ao usar o Brevo

O Resend garante idempotência por `Idempotency-Key`: se o envio correr bem e a
escrita do `sent_at` falhar logo a seguir, a repetição não manda o email duas
vezes. **O Brevo não documenta essa garantia.**

A proteção principal mantém-se — o índice único em `notification_jobs` impede o
mesmo aviso de ser planeado duas vezes. O que se perde é a rede de segurança
para uma falha rara e estreita. Fica registado por ser uma diferença real.

### Reputação

O correio da empresa e os emails de marcações passam a sair do mesmo domínio. O
Brevo e o Resend recomendam separar por subdomínio, e é reversível quando
quiser — mas exige o registo DKIM que o painel hoje não aceita.

---

## O que fica por fazer depois

- **Rodar a `service_role` key.** Está em texto simples no ficheiro de memória
  desde o M1. Antes de haver clientes reais.
- **Números de produção da Meta**, para fechar o M13 — ver
  [[whatsapp-duas-apps-mesma-waba]] sobre a colisão com o TeeWinner.
- **Projeto Supabase de staging**, para os testes destrutivos e de concorrência
  que hoje não se podem correr contra produção.

---

## Verificar que o deploy está bom

Por esta ordem, e cada um responde a uma coisa diferente:

| O quê | Onde | O que confirma |
|---|---|---|
| `/marcar/clinica-sorriso` | browser | a página pública serve e tem a marca certa |
| Marcar uma consulta a sério | browser | o motor, a transação e o token de gestão |
| O link `/m/<token>` da confirmação | browser | a gestão sem conta |
| `booking.estado_do_agendador()` | SQL | o cron está a correr e a fila drena |
| O email chegou | caixa de correio | o Brevo e o domínio verificado |
| `/api/webhooks/whatsapp?hub.mode=…` | curl | o webhook responde ao desafio da Meta |
