# Deploy

> Do computador do Sérgio para `booking.totalmobi.pt`.
> Escrito a 2026-08-21. **Publicado a 2026-08-23** — o que está aqui foi feito.

---

## Está no ar

Verificado a 2026-08-23 em `booking.totalmobi.pt`: página pública 200, login
200, agendador 401 sem segredo, webhook 403 com token errado. O `pg_cron` corre
ao minuto (`job 2`) e um email de teste saiu pelo Brevo com id
`<202608231813…@smtp-relay.mailin.fr>`.

Os cinco passos abaixo ficam como registo de **como** se fez — e do que correu
mal pelo caminho, que é a parte que poupa tempo na próxima vez.

### Três coisas que só se descobrem a publicar

1. **`apps/web` tem de declarar o `typescript` e o `@types/node`.** Estavam só
   na raiz. Localmente o npm eleva-os e a resolução sobe a árvore; a Vercel
   instala **de dentro** de `apps/web` por causa do Root Directory, e aí não há
   árvore acima. O build morria em `Running TypeScript` com "do not have the
   required package(s) installed", e o sinal estava no número de pacotes:
   **434 na Vercel contra 471 a partir da raiz**.
2. **As variáveis de ambiente não se aplicam retroativamente.** Depois de as
   guardar é preciso um **Redeploy**; sem isso o build antigo continua a servir
   e as páginas dão 500.
3. **O Brevo bloqueia IPs desconhecidos** ao fim de 30 dias de uso a partir de
   IPs fixos. As funções da Vercel mudam de IP a cada invocação, por isso
   autorizar um não resolve — desativa-se o bloqueio, ou deixa-se o Brevo
   autorizar automaticamente. O primeiro envio falhou por isto, e o **backoff
   recuperou sozinho à terceira tentativa** depois de a definição mudar.

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

### Ligar um número de produção na Meta

O caminho no painel da Meta muda com frequência. Este foi verificado contra a
documentação em agosto de 2026, ao ligar o `+351928270391`.

**Dois valores diferentes chamam-se "token".** Confundi-los custa uma tarde:

| | O que é | De onde vem |
|---|---|---|
| *Verify token* | prova ao nosso servidor que quem chama é a Meta | **inventado por nós** — igual ao `WHATSAPP_VERIFY_TOKEN` |
| *Access token* | autoriza a app a enviar mensagens | utilizador de sistema no Business Manager |

**O access token permanente** — o do painel da app dura 24 h e está preso ao
número de teste, por isso não serve para produção:

1. `business.facebook.com/latest/settings` → **Utilizadores do sistema**
2. **Adicionar** → criar o utilizador
3. **Atribuir ativos**, os dois, com controlo total: a **app** (*Gerir app*) e a
   **conta WhatsApp Business** (*Gerir contas do WhatsApp Business*)
4. **Gerar token** → permissões `whatsapp_business_messaging`,
   `whatsapp_business_management`, `business_management` → validade **Nunca**

⚠️ **Sem o passo 3 o token sai na mesma** e falha depois, sem dizer porquê. É o
erro mais comum aqui.

**O webhook**, em *Configuração básica → Etapa 2*:

- URL de callback: `https://booking.totalmobi.pt/api/webhooks/whatsapp`
- Verificar token: o valor de `WHATSAPP_VERIFY_TOKEN` (tem de já estar no Vercel
  e publicado, senão a rota responde 503 e a verificação falha)
- Subscrever o campo **`messages`** — a URL fica verificada sem ele, e não chega
  mensagem nenhuma

⚠️ **Enquanto a app não estiver publicada**, a Meta só entrega webhooks de teste
enviados do próprio painel. Com token e webhook perfeitos, mensagens de clientes
reais não chegam. Parece avaria e é só falta de publicação.

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

- **Publicar a app da Meta.** Até lá só chegam webhooks de teste — ver a secção
  do WhatsApp acima.
- **Cancelar as subscrições Stripe de teste** antes de limpar os tenants, senão
  os eventos de renovação recriam as empresas.
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
