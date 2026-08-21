# Totalmobi Booking — Product Requirements

> Documento vivo. Versão 1.0 — 2026-08-17.
> Proprietário do produto: **Totalmobi**. Responsável técnico: Sérgio Cury.

---

## 1. Sumário executivo

**Totalmobi Booking** é um SaaS multi-tenant, white-label, de agendamento
omnichannel. Uma única instalação serve centenas de empresas de qualquer
segmento baseado em serviço + tempo (clínicas, barbearias, estética, spas,
veterinários, personal trainers, oficinas, consultores).

A proposta de valor tem três pernas:

1. **O consumidor marca em menos de um minuto, sem criar conta.**
2. **O empresário percebe a agenda do dia em segundos.**
3. **O WhatsApp é um canal de marcação a sério** — API oficial da Meta,
   conversa natural, com o motor de regras no backend e não no chatbot.

O que nos diferencia de Calendly/Fresha/SimplyBook não é o calendário — é a
conversa. O calendário é a mesa de apostas; o WhatsApp com linguagem natural
e, mais tarde, voz, é a aposta.

---

## 2. Non-goals (o que este produto **não** é)

Explicitar isto agora evita meio ano de âmbito a alastrar.

| Não é | Porquê |
|---|---|
| Prontuário clínico / EMR | Dados de saúde são categoria especial no RGPD (art. 9.º). Guardar sintomas ou diagnósticos aqui multiplicaria a superfície de compliance por dez. Ver [SECURITY.md](SECURITY.md#8-rgpd). |
| Faturação / POS / stock | Mercado saturado e verticalizado. Integramos, não substituímos. |
| Folha de salários / RH | Fora do domínio. |
| Marketing automation / campanhas de massa | O `NotificationEngine` é transacional. Campanhas promocionais em WhatsApp queimam o número na Meta. |
| Rede social de profissionais / marketplace | Somos infraestrutura da empresa cliente, não um agregador que lhe rouba o cliente final. |
| Videoconsulta | Integrar link externo (Meet/Zoom) sim; construir WebRTC de vídeo não. |

---

## 3. Personas

### 3.1 Sofia — consumidora final
34 anos, marca do telemóvel, entre reuniões. **Não vai criar conta.** Se lhe
pedirem palavra-passe, desiste e liga para a concorrência.
- Quer: escolher, ver horas, confirmar. Três ecrãs, no máximo.
- Odeia: calendários gigantes em mobile, formulários com 9 campos, "aguarde
  confirmação" sem prazo.
- Sucesso: marcação concluída em **< 60 s** e < 6 toques.

### 3.2 Rita — rececionista (utilizador mais intenso do sistema)
Passa 8 h por dia no painel. É ela que decide se o produto renova.
- Quer: ver o dia todo de uma vez, arrastar marcações, criar uma marcação em
  15 segundos enquanto tem o cliente ao telefone.
- Odeia: recarregar a página, perder o que estava a escrever, "o sistema não
  deixa" sem explicar porquê.
- Sucesso: criar marcação manual em **< 15 s**; zero recargas manuais graças
  ao Realtime.

### 3.3 Dr. João — profissional
Quer ver só a agenda dele, no telemóvel, entre atendimentos.
- Sucesso: abrir a app e ver o próximo cliente em **< 3 s**.

### 3.4 Marta — dona do negócio (quem assina o contrato)
- Quer: saber quanto faturou, quantos faltaram, se vale a pena o plano Premium.
- Sucesso: percebe o KPI do mês sem pedir ajuda a ninguém.

### 3.5 Totalmobi — super admin
- Quer: dar de alta um cliente novo em **< 10 min** sem tocar em SQL, ver a
  saúde das integrações WhatsApp de todos os tenants num ecrã.

---

## 4. Jornadas críticas

### J1 — Marcação pública (web)
`escolher serviço → profissional ou "qualquer" → dia → hora → nome + telemóvel → confirmado`

Regras:
- Sem conta, sem palavra-passe. Só nome + telemóvel (+ email opcional
  conforme configuração do tenant).
- A página **nunca** mostra um mês inteiro de calendário em mobile. Mostra uma
  fita horizontal de dias e uma grelha de horas.
- Consentimento RGPD explícito e granular: lembretes ≠ marketing.

### J2 — Marcação por WhatsApp
Conversa livre; o sistema extrai intenção e devolve botões sempre que possível.
O LLM **nunca** escreve na base de dados — ver [ARCHITECTURE.md](ARCHITECTURE.md#8-o-chatbot-e-a-fronteira-de-autoridade).

### J3 — Remarcação e cancelamento pelo cliente
Por WhatsApp ou por link tokenizado (email/SMS). Sujeito à política do tenant
(`reschedule_min_hours`, `cancellation_min_hours`), validada **no backend**.

### J4 — Dia de trabalho da Rita
Calendário multi-recurso, drag & drop com revalidação atómica, criação manual
em drawer, override de regras com permissão e registo em audit log.

### J5 — Onboarding de um tenant novo
Super admin cria o tenant → convite ao `tenant_admin` → wizard: identidade
visual, unidade, serviços, equipa, horários → página pública no ar.
Meta: **< 30 min do zero ao primeiro link partilhável**, sem WhatsApp.
O WhatsApp é um passo posterior e opcional (Embedded Signup).

---

## 5. Requisitos funcionais por área

### 5.1 Multi-tenancy
- `FR-MT-1` Todo o dado de negócio pertence a exatamente um `tenant_id`.
- `FR-MT-2` O isolamento é imposto pelo PostgreSQL (RLS), nunca por filtros de
  frontend nem por `WHERE tenant_id` escrito à mão na aplicação.
- `FR-MT-3` Um tenant pode ter N unidades (`locations`); a unidade é a fronteira
  operacional (fuso horário, morada, telefone).
- `FR-MT-4` Suspender um tenant desliga o acesso ao painel **e** a página
  pública, mas não apaga dados.
- `FR-MT-5` O super admin pode entrar no painel de um tenant (impersonation).
  Toda a sessão impersonada fica marcada no audit log.

### 5.2 Disponibilidade
- `FR-AV-1` Existe **um** `AvailabilityEngine`, executado no servidor, usado
  por todos os canais.
- `FR-AV-2` Considera: horário da unidade, horário do profissional, exceções,
  férias, bloqueios, duração do serviço, buffers, marcações existentes,
  capacidade, antecedência mínima/máxima, fuso horário.
- `FR-AV-3` A disponibilidade apresentada é uma **sugestão, nunca uma reserva**.
  É sempre revalidada no momento da criação.
- `FR-AV-4` Suporta as cinco jornadas de escolha (serviço→staff, staff→serviço,
  serviço→primeiro disponível, data→quem está livre, "qualquer profissional").

### 5.3 Marcações
- `FR-BK-1` A criação é atómica numa única transação PostgreSQL.
- `FR-BK-2` Sobreposição do mesmo recurso é impossível **por constraint da base
  de dados**, não por verificação aplicacional.
- `FR-BK-3` O histórico nunca se perde: remarcar cria uma marcação nova ligada
  à antiga (`rescheduled_from_id`) e regista o evento.
- `FR-BK-4` Toda a marcação tem origem (`source`) rastreável: `public_web`,
  `whatsapp`, `admin`, `widget`, `api`, `voice`.
- `FR-BK-5` Idempotência na criação: um `idempotency_key` do cliente impede
  marcações duplicadas por duplo-clique ou retry de webhook.

### 5.4 Comunicação
- `FR-CM-1` WhatsApp através da **Cloud API oficial da Meta**. Nunca automação
  sobre WhatsApp Web — é violação dos ToS e o número acaba banido.
- `FR-CM-2` Onboarding do número do cliente por **Embedded Signup**; a Totalmobi
  nunca pede credenciais Meta ao cliente por email/telefone.
- `FR-CM-3` Notificações são jobs persistidos com idempotência; nunca timers de
  browser.
- `FR-CM-4` O cliente final pode confirmar/cancelar/remarcar a partir da própria
  notificação.

### 5.5 Painel
- `FR-AD-1` Calendário dia/semana/mês/agenda + vista por profissional (colunas).
- `FR-AD-2` Drag & drop e resize com revalidação e audit log.
- `FR-AD-3` Realtime: o que a Rita faz aparece no ecrã do Dr. João sem F5.
- `FR-AD-4` Mobile não é o desktop encolhido — é uma agenda vertical desenhada
  de raiz.

### 5.6 White-label
- `FR-WL-1` Logo, cores, tipografia, raio, favicon, textos, domínio próprio.
- `FR-WL-2` O sistema **recusa** combinações que quebrem o contraste WCAG AA e
  propõe a mais próxima que passa. A marca do cliente não pode tornar o produto
  inacessível — e a responsabilidade legal de acessibilidade é nossa também.

---

## 6. Requisitos não-funcionais

| Área | Alvo | Como se mede |
|---|---|---|
| Disponibilidade de slots (p95) | < 400 ms | traço servidor, 14 dias, 1 profissional |
| Criação de marcação (p95) | < 700 ms | inclui a transação atómica |
| Página pública LCP (4G, mid-tier Android) | < 2,0 s | Lighthouse CI |
| Painel — carregar semana com 500 marcações | < 1,5 s | — |
| Concorrência | 20 pedidos simultâneos ao mesmo slot ⇒ **exatamente 1** sucesso | teste automatizado obrigatório |
| Acessibilidade | WCAG 2.2 AA | axe-core em CI + revisão manual de teclado |
| Idiomas no arranque | pt-PT, pt-BR, en | zero strings hardcoded em componentes |
| Isolamento | 0 fugas entre tenants | suite de testes RLS obrigatória |

---

## 7. Âmbito por fase

### MVP 1 — "A agenda funciona" (objetivo: primeiro cliente pagante)
Multi-tenancy · Auth · Empresas · Unidades · Serviços · Profissionais ·
Horários · AvailabilityEngine · BookingEngine atómico · Calendário admin ·
Página pública · Cancelamento · Remarcação · Email · WhatsApp (notificações +
chatbot textual) · Lembretes.

**Critério de saída:** a Clínica Sorriso Lisboa (tenant demo) opera uma semana
inteira sem intervenção manual em SQL.

### MVP 2 — "A operação escala"
Inbox e handoff humano · IA mais fina · Waitlist · Relatórios · Pagamentos
(sinal) · Multi-unidade avançada · Recursos (salas/equipamentos) · Widget
embebido · Painel super admin completo.

### MVP 3 — "A conversa fala"
Chatbot por voz · WhatsApp Calling API · Instagram/Messenger · Recorrência ·
API pública documentada · Funcionalidades enterprise (SSO, SLA, exportações).

---

## 8. Métricas de sucesso do produto

**Ativação:** % de tenants que publicam a página pública em ≤ 7 dias (alvo: 80%).
**Adoção do canal:** % de marcações vindas de WhatsApp ao fim de 60 dias (alvo: 40%).
**Autonomia do bot:** % de conversas concluídas sem handoff humano (alvo: 70%).
**Qualidade operacional:** taxa de no-show antes vs. depois dos lembretes.
**Retenção:** churn mensal de tenants < 3%.
**Saúde técnica:** 0 incidentes de double booking; 0 incidentes de fuga entre tenants.

---

## 9. Decisões de produto já tomadas

| # | Decisão | Razão |
|---|---|---|
| PD-1 | O cliente final **não tem conta** no MVP | Fricção é o maior assassino de conversão nesta categoria. Links tokenizados resolvem 95% dos casos. |
| PD-2 | Schema `booking` dentro do projeto Supabase existente (`ulpsaxhocvezcohbndpz`) | Decisão do Sérgio. Isola do CMS `public.tot_*` sem custo de projeto novo. Ver a análise de risco em [ARCHITECTURE.md](ARCHITECTURE.md#4-onde-vive-a-base-de-dados). |
| PD-3 | Um número WhatsApp **por tenant** | Partilhar número entre clientes destrói o white-label e cria responsabilidade cruzada. |
| PD-4 | Regras de negócio nunca vivem no prompt do LLM | Um prompt não é auditável nem testável. Ver [ARCHITECTURE.md](ARCHITECTURE.md#8-o-chatbot-e-a-fronteira-de-autoridade). |
| PD-5 | Sem dados clínicos | Ver secção 2. |
| PD-6 | Fuso horário na **unidade**, não no tenant | Uma rede pode ter Lisboa e São Paulo. |
| PD-7 | Capacidade e recursos no schema desde o dia 1, mesmo sem UI | Acrescentar `capacity` a uma tabela de marcações com dados reais é uma migração dolorosa. O custo agora é uma coluna. |

---

## 10. Riscos de produto

| Risco | Impacto | Mitigação |
|---|---|---|
| Aprovação de templates WhatsApp pela Meta demora ou é recusada | Bloqueia lembretes, que são metade do valor | Submeter templates no onboarding, não à véspera. Fallback por email sempre ativo. |
| Custo por conversa WhatsApp corrói a margem | Margem negativa em tenants de alto volume | Medir custo/tenant desde o MVP 1; plano com limite de conversas incluídas. |
| O bot marca coisas erradas e o cliente perde confiança | Churn imediato | Confirmação explícita antes de escrever; handoff humano fácil; o bot nunca inventa disponibilidade. |
| Tenant grande quer prontuário e empurra o âmbito | Perda de foco | Non-goal explícito e escrito no contrato. |
| Licença Premium do FullCalendar | Custo recorrente + lock-in | `CalendarAdapter` obrigatório desde o dia 1. Ver [ARCHITECTURE.md](ARCHITECTURE.md#7-calendário). |
