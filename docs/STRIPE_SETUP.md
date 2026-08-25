# Stripe

> Subscrições do Totalmobi Booking. Escrito a 2026-08-25, com o SDK oficial
> `stripe@22.5.0` — MIT, zero dependências.

---

## O que está feito e o que falta

| | |
|---|---|
| Tabelas `tenant_subscriptions` e `stripe_webhook_events` | ✅ aplicadas |
| `POST /api/stripe/checkout` | ✅ |
| `POST /api/stripe/webhook` | ✅ |
| Os seis `price_id` de teste | ✅ configurados |
| `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET` | ❌ **em falta** |
| Registo self-serve e ligação ao onboarding | ❌ |

**Nada disto foi testado contra o Stripe a sério.** Sem a chave secreta não é
possível criar uma sessão nem receber um evento. O que está verificado é a
lógica pura — dez testes — e que nenhum segredo chega ao browser.

---

## Os produtos e os preços

Criados na conta Totalmobi, em **modo de teste**. O anual são dez mensalidades:
doze meses ao preço de dez.

| Plano | Mensal | Anual |
|---|---|---|
| Essencial | 29 € | 290 € |
| Profissional | 49 € | 490 € |
| IA | 79 € | 790 € |

Os `price_id` estão no `.env.example`. **Não são segredos** — podem estar no
repositório e podem aparecer numa página. O que é segredo é a chave secreta e o
segredo de assinatura.

O modo real terá outros identificadores. A troca faz-se no ambiente, nunca no
código.

---

## O que falta configurar

Duas variáveis, na Vercel e localmente:

```
STRIPE_SECRET_KEY=sk_test_…
STRIPE_WEBHOOK_SECRET=whsec_…
```

O `whsec_` só existe depois de criar o endpoint no painel do Stripe, a apontar
para:

```
https://booking.totalmobi.pt/api/stripe/webhook
```

Os eventos a subscrever são os que o endpoint trata:

```
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.paid
invoice.payment_failed
```

Qualquer outro evento é registado como `ignored` e não faz mal nenhum — mas
subscrever só estes poupa entregas.

Para testar localmente, o Stripe tem uma CLI que reencaminha os eventos para
`localhost` e imprime um `whsec_` próprio dessa sessão. Ver a documentação
oficial atual: os comandos mudam.

---

## As três decisões que sustentam isto

### O browser nunca envia um preço

A rota de checkout aceita **o código do plano e a periodicidade** — nunca um
`price_id`, um valor ou uma moeda. Se aceitasse, qualquer pessoa subscrevia o
plano de IA ao preço de um cêntimo: bastava abrir as ferramentas do browser e
trocar um campo. Do lado do Stripe esse pedido seria perfeitamente válido.

Há um teste que falha no dia em que alguém acrescentar um parâmetro de `priceId`
"só para o caso de".

### A subscrição nasce do webhook, nunca da página de sucesso

O browser chegar a `/subscricao/obrigado` não prova pagamento nenhum — qualquer
pessoa consegue abrir esse endereço. A ativação depende do evento com assinatura
verificada, e só dele.

### A idempotência é uma chave primária, não um `if`

O Stripe reenvia eventos quando não recebe resposta a tempo, e pode entregar o
mesmo evento mais do que uma vez mesmo quando corre tudo bem. O `insert` em
`stripe_webhook_events` tem o id do evento como chave primária: a segunda
entrega falha na base de dados e nunca chega ao processamento.

Uma verificação em código é uma verificação que alguém esquece numa ramificação
nova.

---

## Detalhes que custaram tempo a acertar

**A assinatura verifica-se sobre o corpo em bruto.** `request.text()` e nunca
`request.json()` — a assinatura é calculada sobre os bytes exatos que o Stripe
enviou, e reserializar muda a ordem das chaves ou o escape de um acento. O mesmo
erro já tinha aparecido no webhook do WhatsApp deste projeto.

**`current_period_start` está no item, não na subscrição.** Mudou de sítio numa
versão recente da API. Confirmado nos tipos do SDK instalado, não de memória.

**O `stripe` está declarado em `apps/web/package.json`, não na raiz.** A Vercel
instala de dentro de `apps/web` por causa do Root Directory, e não sobe a
árvore. Foi assim que o `@types/node` e o `vitest` partiram publicações antes.

**A lógica de preços vive em `packages/shared`.** Escrevi-a primeiro em
`apps/web/src/lib/stripe/` com o teste ao lado, e isso parte a publicação pela
mesma razão. A saída não foi declarar o `vitest` na app: foi separar a lógica do
acesso ao ambiente. A função recebe **como ler uma variável**, o que a torna
testável sem mexer no `process.env` — e o que fica na app é uma casca de três
linhas.

---

## O IVA está por decidir

Um SaaS vendido em Portugal emite com IVA, e a empresas de outros países da UE
com número de contribuinte aplica-se autoliquidação. A rota de checkout já
recolhe morada de faturação e número de contribuinte, mas **não há regime fiscal
configurado**. É uma decisão de contabilidade, não de programação, e tem de
estar tomada antes de sair do modo de teste.

---

## Quando o painel do Stripe mostra 500

As entregas falhadas trazem o corpo da resposta. Desde `1f68242` esse corpo
inclui o código do Postgres:

```json
{ "erro": "erro interno", "codigo": "42501" }
```

| Código | O que é | O que fazer |
|---|---|---|
| `42501` | Falta um grant à tabela | Ver a `0035` e o teste-guarda das migrations |
| `42P01` | A tabela não existe | A migration não chegou a esta base |
| `23503` | Chave estrangeira | Os metadados apontam para algo que já não existe |
| *sem código* | Falhou depois do registo | A linha em `stripe_webhook_events` tem o `error` |

Um **400** em vez de 500 é outra coisa: assinatura inválida, quase sempre um
`whsec_` que pertence a outro endpoint.

O Stripe reenvia as entregas falhadas sozinho. Também se reenvia à mão, em
**Webhooks → o destino → Entregas de eventos**.

## Nunca

- Escrever chaves neste ficheiro ou em qualquer outro do repositório.
- Ativar uma subscrição a partir de um parâmetro do URL.
- Aceitar um `price_id` vindo do browser.
- Escrever os `price_id` numa migration: fixaria o modo de teste para sempre.
