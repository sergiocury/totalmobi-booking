import type { Metadata } from 'next';
import Link from 'next/link';

import { Button } from '@totalmobi/ui';

import { Cabecalho } from '@/components/landing/cabecalho';
import { DemoConversa } from '@/components/landing/demo-conversa';
import { DemoLinkPublico } from '@/components/landing/demo-link-publico';
import { Revelar } from '@/components/landing/revelar';

/**
 * A página pública do produto.
 *
 * DUAS MENSAGENS, E SÓ DUAS
 *
 * Quem chega aqui é dono de uma clínica, de um salão ou de um consultório — não
 * é programador. Tem de perceber duas coisas antes de sair:
 *
 * 1. **A marcação vive no site dele, com a marca dele.** Não é mais um portal
 *    para onde tem de mandar os clientes; é uma peça que encaixa no que já tem.
 * 2. **As marcações tratam-se sozinhas.** Uma pessoa escreve, a agenda
 *    responde, o horário fica reservado.
 *
 * Tudo o resto na página serve uma destas duas, ou sai.
 *
 * MOSTRAR EM VEZ DE AFIRMAR
 *
 * "IA de última geração" não convence ninguém que já viu a frase cem vezes. Uma
 * conversa a desmontar-se em serviço, dia e preferência, e um bloco a aparecer
 * no calendário, convence em oito segundos. Por isso a demonstração está no
 * hero e não numa secção lá em baixo.
 *
 * O QUE ESTA PÁGINA NÃO FAZ
 *
 * Não promete período de teste, porque não há nenhum configurado. Não mostra
 * preços, porque ainda não estão fechados. Não inventa testemunhos nem
 * logótipos de clientes. O apelo à ação é falar connosco — que é o que
 * realmente acontece a seguir.
 */

const URL_BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://booking.totalmobi.pt';

export const metadata: Metadata = {
  title: 'Totalmobi Booking — marcações por WhatsApp, website e IA',
  description:
    'Receba marcações pelo WhatsApp, pelo seu website ou pela sua própria página pública de agendamento. Automatize confirmações, lembretes e a gestão da agenda de toda a equipa.',
  alternates: { canonical: URL_BASE },
  // O layout põe o site inteiro fora dos motores de busca, e bem: o painel e as
  // páginas de marcação de cada cliente não têm nada que ser indexados. A
  // landing é a exceção, e tem de o dizer aqui.
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    locale: 'pt_PT',
    url: URL_BASE,
    siteName: 'Totalmobi Booking',
    title: 'Marcações por WhatsApp, website e link público',
    description:
      'Receba marcações onde os seus clientes já estão: WhatsApp, o seu website, ou um link que partilha no Instagram, no Google e onde quiser.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Totalmobi Booking',
    description: 'Marcações por WhatsApp, website e link público.',
  },
};

export default function LandingPage() {
  return (
    <>
      <Cabecalho />

      <main>
        <Hero />
        <WhiteLabel />
        <LinkPublico />
        <ComoFunciona />
        <Canais />
        <Demonstracao />
        <Capacidades />
        <Perguntas />
        <Contacto />
      </main>

      <Rodape />
    </>
  );
}

function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-5 pt-14 pb-20 sm:px-8 sm:pt-20">
      {/*
        O texto em cima, a demonstração em baixo e a ocupar tudo.

        A primeira versão punha o texto à esquerda e a demonstração à direita.
        Numa janela de 1280 px isso deixava a demonstração com 572 px, e as duas
        colunas dela — conversa e agenda — ficavam a 278 px cada: as bolhas
        partiam-se em três linhas e as horas do calendário encostavam ao nome.
        A peça mais importante da página era a mais espremida.

        Assim tem 1088 px, e as duas colunas ficam com 520 px — largura a sério
        para o que interessa mostrar.
      */}
      <Revelar className="mx-auto max-w-3xl text-center">
        <p className="mb-4 inline-flex items-center gap-2 rounded-(--radius-full) border border-(--line) bg-(--surface-sunken) px-3 py-1 text-(length:--text-sm) text-(--ink-muted)">
          WhatsApp · Website · Link público · IA
        </p>

        <h1 className="text-(length:--text-4xl) leading-(--leading-tight) font-semibold tracking-(--tracking-tighter) text-balance sm:text-(length:--text-5xl)">
          A sua agenda atende por si.
        </h1>

        <p className="mx-auto mt-5 max-w-2xl text-(length:--text-lg) leading-(--leading-normal) text-pretty text-(--ink-muted)">
          Marcações pelo <strong className="font-medium text-(--ink)">WhatsApp</strong>, pelo{' '}
          <strong className="font-medium text-(--ink)">seu website</strong> ou pela sua{' '}
          <strong className="font-medium text-(--ink)">própria página pública</strong>. O cliente
          escolhe o serviço, encontra um horário e confirma — mesmo quando não há ninguém para
          atender.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <a href="#contacto">Falar connosco</a>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <a href="#demonstracao">Ver a funcionar</a>
          </Button>
        </div>

        <p className="mt-5 text-(length:--text-sm) text-(--ink-subtle)">
          Funciona mesmo que não tenha website · Sem aplicações para o cliente instalar
        </p>
      </Revelar>

      <Revelar atraso={120} className="mt-14">
        <DemoConversa />
      </Revelar>
    </section>
  );
}

/**
 * O white label.
 *
 * É o argumento que distingue isto de qualquer portal de marcações, e por isso
 * vem antes de tudo o resto. A diferença explica-se numa frase: nos portais, o
 * cliente passa a ser do portal; aqui, o cliente continua a ser da clínica.
 */
function WhiteLabel() {
  const cartoes = [
    {
      titulo: 'Encaixa no site que já tem',
      texto:
        'Um botão no seu site abre a marcação. WordPress, Wix, Squarespace, Webflow ou feito à medida — não é preciso refazer nada.',
    },
    {
      titulo: 'Com o seu logótipo e as suas cores',
      texto:
        'A cor da marca entra no sistema e é validada contra as normas de contraste antes de ser usada. Fica com a sua identidade e continua legível para toda a gente.',
    },
    {
      titulo: 'Um link só seu para partilhar',
      // A versão anterior prometia marcacoes.aminhaclinica.pt — domínio próprio,
      // que não está implementado. Uma promessa que o produto não cumpre é pior
      // do que uma funcionalidade a menos: descobre-se na primeira reunião.
      texto:
        'booking.totalmobi.pt/aminhaclinica — para pôr na bio do Instagram, no botão do Facebook ou na sua assinatura de email. A página é sua; o endereço é nosso, e isso vê-se só no link.',
    },
  ];

  return (
    <section id="white-label" className="border-y border-(--line) bg-(--surface-sunken)">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <Revelar>
          <h2 className="max-w-2xl text-(length:--text-3xl) leading-(--leading-tight) font-semibold tracking-(--tracking-tight) text-balance">
            É a sua marca. Onde quer que o cliente marque.
          </h2>
          <p className="mt-4 max-w-prose text-(length:--text-lg) text-pretty text-(--ink-muted)">
            A página de marcação tem o seu logótipo, as suas cores, os seus serviços e a sua equipa.
            Ninguém vê um catálogo de concorrentes nem é convidado a marcar noutro sítio — quem
            marca fica com a impressão de que fez tudo consigo, porque fez.
          </p>
        </Revelar>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {cartoes.map((c, i) => (
            <Revelar key={c.titulo} as="article" atraso={i * 80}>
              <div className="h-full rounded-(--radius-lg) border border-(--line) bg-(--surface) px-6 py-6">
                <h3 className="font-medium">{c.titulo}</h3>
                <p className="mt-2 text-pretty text-(--ink-muted)">{c.texto}</p>
              </div>
            </Revelar>
          ))}
        </div>

        <Revelar atraso={240}>
          <div className="mt-10 overflow-hidden rounded-(--radius-lg) border border-(--line) bg-(--surface) shadow-(--shadow-sm)">
            <div className="flex items-center gap-2 border-b border-(--line) bg-(--surface-sunken) px-4 py-2.5">
              <span aria-hidden className="flex gap-1.5">
                <span className="size-2.5 rounded-(--radius-full) bg-(--line-strong)" />
                <span className="size-2.5 rounded-(--radius-full) bg-(--line-strong)" />
                <span className="size-2.5 rounded-(--radius-full) bg-(--line-strong)" />
              </span>
              <span className="ml-2 truncate rounded-(--radius-sm) bg-(--surface) px-3 py-1 text-(length:--text-sm) text-(--ink-subtle)">
                www.aminhaclinica.pt
              </span>
            </div>
            <div className="flex flex-col items-center gap-4 px-6 py-14 text-center">
              <p className="text-(length:--text-xl) font-semibold tracking-(--tracking-tight)">
                Clínica Sorriso
              </p>
              <p className="max-w-md text-pretty text-(--ink-muted)">
                O seu site, tal como está hoje. A única diferença é este botão.
              </p>
              <span className="inline-flex min-h-11 items-center rounded-(--radius-full) bg-(--brand) px-6 font-medium text-(--brand-ink) shadow-(--shadow-sm)">
                Marcar consulta
              </span>
            </div>
          </div>
        </Revelar>
      </div>
    </section>
  );
}

/**
 * O link público.
 *
 * PORQUE É QUE ISTO É UMA SECÇÃO E NÃO UMA LINHA
 *
 * A objeção mais comum de um salão ou de um consultório pequeno é *"eu não
 * tenho site"*. Enquanto a proposta for "integramos no seu website", metade do
 * mercado ouve "isto não é para mim" e fecha a página.
 *
 * O link resolve isso, e resolve-o melhor do que um site: quem vem do Instagram
 * ou do Google já está a um toque de distância. Por isso vem cedo, com uma
 * demonstração própria, e não como um item numa lista de funcionalidades.
 *
 * O QR não está aqui. Partilhar o link num QR é possível — qualquer ferramenta
 * o faz — mas o produto não o gera, e listá-lo ao lado das outras opções leria-se
 * como se gerasse.
 */
function LinkPublico() {
  const sitios = [
    { onde: 'Instagram', como: 'Na bio: «Marque a sua consulta ↓»' },
    { onde: 'Facebook', como: 'No botão «Marcar agora» da página' },
    { onde: 'Google', como: 'Como link de marcação no perfil da empresa' },
    { onde: 'WhatsApp', como: 'Enviado numa conversa, quando alguém pergunta' },
    { onde: 'Email', como: 'Na assinatura, em todas as mensagens que envia' },
    { onde: 'Campanhas', como: 'Em anúncios, stories e emails promocionais' },
  ];

  return (
    <section id="link-publico" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
      <Revelar className="mx-auto max-w-3xl text-center">
        <h2 className="text-(length:--text-3xl) leading-(--leading-tight) font-semibold tracking-(--tracking-tight) text-balance">
          Um link para receber marcações em qualquer lugar.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-(length:--text-lg) text-pretty text-(--ink-muted)">
          Criamos-lhe uma página pública de marcação. Partilhe o endereço onde quiser — e quem o
          abrir marca sem sair de lá.
        </p>

        <p className="mt-6 inline-flex max-w-full items-center gap-2 overflow-hidden rounded-(--radius-full) border border-(--brand) bg-(--brand-soft) px-4 py-2">
          <span className="truncate font-medium text-(--brand)">
            booking.totalmobi.pt/clinica-sorriso
          </span>
        </p>
      </Revelar>

      <div className="mt-14 grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <Revelar>
          <DemoLinkPublico />
        </Revelar>

        <Revelar atraso={100}>
          <ul className="divide-y divide-(--line) border-y border-(--line)">
            {sitios.map((s) => (
              <li key={s.onde} className="flex flex-wrap gap-x-4 gap-y-1 py-3.5">
                <span className="w-28 shrink-0 font-medium">{s.onde}</span>
                <span className="min-w-0 flex-1 text-pretty text-(--ink-muted)">{s.como}</span>
              </li>
            ))}
          </ul>

          <p className="mt-8 text-(length:--text-xl) leading-(--leading-snug) font-semibold tracking-(--tracking-tight) text-balance">
            Se consegue partilhar um link, consegue receber uma marcação.
          </p>
        </Revelar>
      </div>
    </section>
  );
}

function ComoFunciona() {
  const passos = [
    {
      n: '01',
      titulo: 'O cliente escreve',
      texto:
        '«Queria marcar uma limpeza para sexta à tarde.» Em linguagem normal, pelo WhatsApp ou pelo seu site. Sem formulários e sem criar conta.',
    },
    {
      n: '02',
      titulo: 'A IA percebe o pedido',
      texto:
        'Identifica o serviço, o dia, a preferência de hora e o profissional, se tiver sido pedido. Se faltar alguma coisa, pergunta.',
    },
    {
      n: '03',
      titulo: 'A agenda é consultada a sério',
      texto:
        'Antes de oferecer horas, o sistema olha para a agenda real — quem trabalha, quem está de férias, o que já está marcado. Nunca oferece uma hora que não existe.',
    },
    {
      n: '04',
      titulo: 'A marcação fica feita',
      texto:
        'O horário é reservado no momento, o cliente recebe a confirmação e o lembrete chega antes da consulta. Tudo aparece na sua agenda.',
    },
  ];

  return (
    <section id="como-funciona" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
      <Revelar>
        <h2 className="max-w-2xl text-(length:--text-3xl) leading-(--leading-tight) font-semibold tracking-(--tracking-tight) text-balance">
          Do WhatsApp à agenda em segundos.
        </h2>
      </Revelar>

      <ol className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2">
        {passos.map((p, i) => (
          <Revelar key={p.n} as="li" atraso={i * 80}>
            <div className="flex gap-5">
              <span
                aria-hidden
                className="text-(length:--text-2xl) font-semibold tabular-nums text-(--line-strong)"
              >
                {p.n}
              </span>
              <div className="min-w-0">
                <h3 className="text-(length:--text-lg) font-medium">{p.titulo}</h3>
                <p className="mt-2 text-pretty text-(--ink-muted)">{p.texto}</p>
              </div>
            </div>
          </Revelar>
        ))}
      </ol>
    </section>
  );
}

function Canais() {
  const canais = [
    {
      nome: 'WhatsApp',
      texto: 'O cliente conversa naturalmente e pode marcar, alterar ou cancelar.',
    },
    { nome: 'Website', texto: 'A marcação integrada no site que já tem, sem o refazer.' },
    {
      nome: 'Link público',
      texto: 'A sua página de marcação, para partilhar no Instagram, no Google ou onde quiser.',
    },
    { nome: 'Receção', texto: 'A equipa cria e altera marcações na mesma agenda.' },
  ];

  return (
    <section className="border-y border-(--line) bg-(--surface-sunken)">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <Revelar>
          <h2 className="max-w-2xl text-(length:--text-3xl) leading-(--leading-tight) font-semibold tracking-(--tracking-tight) text-balance">
            Uma agenda. Todos os canais.
          </h2>
          <p className="mt-4 max-w-prose text-(length:--text-lg) text-pretty text-(--ink-muted)">
            Não interessa onde a marcação começa. Todas chegam à mesma agenda — e é por isso que
            duas pessoas nunca ficam com o mesmo horário.
          </p>
        </Revelar>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {canais.map((c, i) => (
            <Revelar key={c.nome} atraso={i * 70}>
              <div className="h-full rounded-(--radius-lg) border border-(--line) bg-(--surface) px-5 py-5">
                <h3 className="font-medium">{c.nome}</h3>
                <p className="mt-1.5 text-(length:--text-sm) text-pretty text-(--ink-muted)">
                  {c.texto}
                </p>
              </div>
            </Revelar>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * A demonstração, outra vez.
 *
 * Repete o componente do hero de propósito. Quem chegou aqui a rolar já a viu
 * uma vez, distraidamente; agora tem contexto para a ver a sério, e o botão
 * "ver outra vez" está mesmo por baixo.
 */
function Demonstracao() {
  const setores = [
    'Clínicas dentárias',
    'Clínicas médicas',
    'Fisioterapia',
    'Psicologia',
    'Estética',
    'Cabeleireiros',
    'Barbearias',
    'Veterinários',
    'Personal trainers',
    'Consultórios',
  ];

  return (
    <section id="demonstracao" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
      <Revelar>
        <h2 className="max-w-2xl text-(length:--text-3xl) leading-(--leading-tight) font-semibold tracking-(--tracking-tight) text-balance">
          Veja uma marcação a acontecer.
        </h2>
        <p className="mt-4 max-w-prose text-(length:--text-lg) text-pretty text-(--ink-muted)">
          É uma simulação — não está a falar com uma clínica real. Mas é exatamente esta a sequência
          que acontece quando um cliente seu escreve.
        </p>
      </Revelar>

      <Revelar atraso={100}>
        <div className="mt-10">
          <DemoConversa />
        </div>
      </Revelar>

      <Revelar atraso={160}>
        <div className="mt-16">
          <h3 className="text-(length:--text-xl) font-semibold tracking-(--tracking-tight)">
            Feito para quem trabalha com agenda.
          </h3>
          <p className="mt-2 max-w-prose text-pretty text-(--ink-muted)">
            Os serviços, as durações, os preços e as regras são seus. O sistema não sabe o que é uma
            limpeza dentária nem um corte de cabelo — sabe o que você configurar.
          </p>

          <ul className="mt-6 flex flex-wrap gap-2">
            {setores.map((s) => (
              <li
                key={s}
                className="rounded-(--radius-full) border border-(--line) bg-(--surface) px-3.5 py-1.5 text-(length:--text-sm) text-(--ink-muted)"
              >
                {s}
              </li>
            ))}
          </ul>
        </div>
      </Revelar>
    </section>
  );
}

function Capacidades() {
  const grandes = [
    {
      titulo: 'Marcações a qualquer hora',
      texto:
        'Boa parte das marcações online acontece fora do horário de expediente. Deixar de as perder costuma ser o primeiro ganho.',
    },
    {
      titulo: 'Nunca dois clientes na mesma hora',
      texto:
        'A reserva do horário é garantida pela base de dados, não pelo ecrã. Se dois pedidos chegarem ao mesmo tempo, um fica com a hora e o outro recebe alternativas.',
    },
    {
      titulo: 'Lembretes automáticos',
      texto:
        'Por WhatsApp e email, antes da consulta, com botões para confirmar ou remarcar. Menos faltas sem ninguém ter de telefonar.',
    },
    {
      titulo: 'O cliente altera sozinho',
      texto:
        'Cancelar e remarcar dentro das regras que definir — até quantas horas antes, quem pode, em que serviços.',
    },
    {
      titulo: 'Cada profissional com o seu horário',
      texto:
        'Horários diferentes por unidade, férias, folgas e alterações pontuais. Quem não está, não aparece.',
    },
    {
      titulo: 'Várias unidades, uma conta',
      texto:
        'Cada unidade com o seu horário e a sua equipa, tudo debaixo da mesma marca e da mesma gestão.',
    },
  ];

  const pequenas = [
    'serviços com durações e preços próprios',
    'intervalos entre marcações',
    'confirmação obrigatória em serviços longos',
    'histórico por cliente',
    'relatórios',
    'widget para o site',
    'modo escuro',
    'pensado primeiro para telemóvel',
  ];

  return (
    <section className="border-y border-(--line) bg-(--surface-sunken)">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <Revelar>
          <h2 className="max-w-2xl text-(length:--text-3xl) leading-(--leading-tight) font-semibold tracking-(--tracking-tight) text-balance">
            O que deixa de ter de fazer à mão.
          </h2>
        </Revelar>

        <div className="mt-12 grid gap-x-8 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
          {grandes.map((c, i) => (
            <Revelar key={c.titulo} as="article" atraso={(i % 3) * 70}>
              <h3 className="text-(length:--text-lg) font-medium">{c.titulo}</h3>
              <p className="mt-2 text-pretty text-(--ink-muted)">{c.texto}</p>
            </Revelar>
          ))}
        </div>

        <Revelar atraso={120}>
          <ul className="mt-14 flex flex-wrap gap-x-6 gap-y-2 border-t border-(--line) pt-8 text-(length:--text-sm) text-(--ink-muted)">
            {pequenas.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Revelar>
      </div>
    </section>
  );
}

function Perguntas() {
  const perguntas = [
    {
      p: 'Preciso de ter website?',
      r: 'Não. Criamos uma página pública de marcação com a sua marca, no endereço booking.totalmobi.pt/aminhaempresa. Pode usá-la sozinha, sem site nenhum.',
    },
    {
      p: 'Posso divulgar a página de marcações no Instagram?',
      r: 'Sim. O endereço pode ir para a bio do Instagram, para o botão do Facebook, para o perfil de empresa do Google, para uma conversa de WhatsApp, para a assinatura de email ou para uma campanha. Onde conseguir partilhar um link, consegue receber marcações.',
    },
    {
      p: 'O endereço fica com a minha marca?',
      r: 'A página fica: logótipo, cores, serviços e equipa são seus. O endereço é booking.totalmobi.pt seguido do nome da sua empresa — um domínio próprio, como marcacoes.aminhaclinica.pt, ainda não está disponível.',
    },
    {
      p: 'Tenho de mudar de site?',
      r: 'Não. O Totalmobi Booking encaixa no site que já tem — basta acrescentar um botão ou um endereço de marcação. Se não tiver site, damos-lhe uma página de marcação com a sua marca.',
    },
    {
      p: 'O meu cliente tem de instalar alguma aplicação?',
      r: 'Não, e não precisa de criar conta nenhuma. Marca pelo WhatsApp ou pelo seu site, e depois altera a marcação por um link que recebe.',
    },
    {
      p: 'Posso usar o meu logótipo e as minhas cores?',
      r: 'Sim. A cor da marca é validada contra as normas de contraste antes de ser aplicada, para que o resultado continue legível para toda a gente.',
    },
    {
      p: 'Como é que o sistema sabe quando cada profissional trabalha?',
      r: 'Define o horário de cada pessoa, por unidade. Depois pode marcar férias, folgas e alterações pontuais — por exemplo, «nesta quinta sai às 16h» — sem mexer no horário normal.',
    },
    {
      p: 'E se dois clientes tentarem a mesma hora ao mesmo tempo?',
      r: 'Só um fica com ela. A reserva é garantida pela base de dados, não pelo ecrã, e ao outro são oferecidas alternativas de imediato.',
    },
    {
      p: 'O cliente pode cancelar ou remarcar?',
      r: 'Sim, dentro das regras que definir — até quantas horas antes da consulta, e em que serviços.',
    },
    {
      p: 'Funciona com vários profissionais e várias unidades?',
      r: 'Sim. Cada profissional tem os seus serviços e horários, e cada unidade o seu horário de funcionamento.',
    },
    {
      p: 'A IA pode inventar uma hora que não existe?',
      r: 'Não. A IA interpreta o pedido, mas nunca decide a disponibilidade: as horas vêm sempre da agenda real, e a marcação é criada pelo sistema, não pelo modelo.',
    },
  ];

  return (
    <section id="perguntas" className="mx-auto max-w-3xl px-5 py-20 sm:px-8 sm:py-28">
      <Revelar>
        <h2 className="text-(length:--text-3xl) leading-(--leading-tight) font-semibold tracking-(--tracking-tight) text-balance">
          Perguntas frequentes
        </h2>
      </Revelar>

      <div className="mt-10 divide-y divide-(--line) border-y border-(--line)">
        {perguntas.map((q, i) => (
          <Revelar key={q.p} atraso={Math.min(i, 4) * 50}>
            <details className="group">
              <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-4 py-4 font-medium">
                {q.p}
                <span
                  aria-hidden
                  className="shrink-0 text-(length:--text-xl) text-(--ink-subtle) transition-transform duration-(--duration-fast) group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="pb-5 text-pretty text-(--ink-muted)">{q.r}</p>
            </details>
          </Revelar>
        ))}
      </div>
    </section>
  );
}

function Contacto() {
  return (
    <section id="contacto" className="border-t border-(--line) bg-(--surface-sunken)">
      <div className="mx-auto max-w-3xl px-5 py-24 text-center sm:px-8 sm:py-32">
        <Revelar>
          <h2 className="text-(length:--text-3xl) leading-(--leading-tight) font-semibold tracking-(--tracking-tight) text-balance sm:text-(length:--text-4xl)">
            A sua agenda pode começar a trabalhar por si.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-(length:--text-lg) text-pretty text-(--ink-muted)">
            Receba marcações pelo WhatsApp, pelo seu website ou pelo seu próprio link público — a
            qualquer hora. Diga-nos como funciona o seu negócio e mostramos-lhe o sistema a correr
            com os seus serviços e a sua marca.
          </p>

          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <a href="mailto:booking@totalmobi.pt?subject=Totalmobi%20Booking">Falar connosco</a>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <a href="#demonstracao">Ver a demonstração</a>
            </Button>
          </div>

          <p className="mt-6 text-(length:--text-sm) text-(--ink-subtle)">booking@totalmobi.pt</p>
        </Revelar>
      </div>
    </section>
  );
}

function Rodape() {
  return (
    <footer className="border-t border-(--line)">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-10 text-(length:--text-sm) text-(--ink-muted) sm:px-8">
        <p>
          <span className="font-medium text-(--ink)">Totalmobi Booking</span> · uma plataforma
          Totalmobi
        </p>

        <nav aria-label="Rodapé" className="flex flex-wrap gap-x-6 gap-y-2">
          <a href="#como-funciona" className="hover:text-(--ink)">
            Como funciona
          </a>
          <a href="#white-label" className="hover:text-(--ink)">
            A sua marca
          </a>
          <a href="#link-publico" className="hover:text-(--ink)">
            Link público
          </a>
          <a href="#perguntas" className="hover:text-(--ink)">
            Perguntas
          </a>
          <Link href="/login" className="hover:text-(--ink)">
            Entrar
          </Link>
        </nav>
      </div>
    </footer>
  );
}
