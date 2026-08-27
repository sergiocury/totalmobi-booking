import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Card, PageHeader } from '@totalmobi/ui';

import { loadTenantPage } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ajuda' };

/**
 * A ajuda do painel.
 *
 * ESCRITA POR TAREFA, NÃO POR MENU
 *
 * Uma ajuda organizada como o menu é um índice, não uma ajuda: quem chega aqui
 * não quer saber o que a página de Horários faz, quer bloquear o Dr. Silva
 * durante duas semanas em setembro. As secções são perguntas reais, e cada uma
 * acaba num link para o sítio onde se faz.
 *
 * A ORDEM DE PRECEDÊNCIA É O CENTRO DISTO
 *
 * Tudo o resto se explica sozinho ao clicar. As exceções não: são quatro
 * mecanismos que se sobrepõem, e a regra que os ordena não se descobre a tentar
 * — descobre-se quando um cliente marca num feriado.
 *
 * O que está aqui é a mesma regra que o motor aplica, e que o `DATABASE.md`
 * documenta. Se um dia mudar lá, muda aqui: uma ajuda que descreve um
 * comportamento antigo é pior do que não existir, porque é acreditada.
 */
export default async function AjudaPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const context = await loadTenantPage(tenantSlug);

  if (!context) notFound();

  const url = (caminho: string) => `/app/${tenantSlug}${caminho}`;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 sm:py-14">
      <PageHeader
        title="Como funciona"
        description="O que cada página faz, e como bloquear horas sem partir a agenda."
      />

      {/* ── A ideia que explica tudo o resto ─────────────────────────────── */}
      <Card className="mb-8 px-6 py-6">
        <h2 className="text-(length:--text-lg) font-semibold tracking-(--tracking-tight)">
          De onde vêm as horas que o cliente vê
        </h2>

        <p className="mt-3 max-w-prose text-pretty text-(--ink-muted)">
          Uma hora só aparece na sua página pública quando <strong>tudo</strong> abaixo é
          verdade ao mesmo tempo. É por isso que uma agenda vazia quase nunca é uma avaria — é
          uma destas cinco coisas em falta.
        </p>

        <ol className="mt-5 space-y-2.5">
          {[
            ['A unidade está aberta', 'o horário de abertura da clínica nesse dia'],
            ['O profissional está a trabalhar', 'o horário dele, que pode ser mais curto'],
            ['Ele executa esse serviço', 'a ligação em Equipa → quem faz o quê'],
            ['A hora está livre', 'sem outra marcação por cima'],
            ['Não há nada a fechar o dia', 'feriado, férias ou exceção'],
          ].map(([titulo, detalhe], i) => (
            <li key={titulo} className="flex gap-3">
              <span
                aria-hidden
                className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-(--radius-full) bg-(--brand-soft) text-(length:--text-sm) font-medium text-(--brand)"
              >
                {i + 1}
              </span>
              <span className="min-w-0">
                <strong className="font-medium">{titulo}</strong>
                <span className="text-(--ink-muted)"> — {detalhe}</span>
              </span>
            </li>
          ))}
        </ol>

        <p className="mt-5 max-w-prose text-(length:--text-sm) text-pretty text-(--ink-subtle)">
          O horário da unidade e o do profissional cruzam-se: a clínica abre das 9h às 19h, a
          Dra. Ana trabalha das 9h às 13h — as horas dela acabam à uma.
        </p>
      </Card>

      {/* ── As quatro coisas diferentes que se confundem ──────────────────── */}
      <h2 className="mt-12 text-(length:--text-xl) font-semibold tracking-(--tracking-tight)">
        Bloquear horas: qual dos quatro usar
      </h2>

      <p className="mt-2 max-w-prose text-pretty text-(--ink-muted)">
        Estão todos em <strong>Horários</strong>, em separadores diferentes. Escolher o errado
        funciona à mesma na maioria dos dias e falha no dia que interessa.
      </p>

      <div className="mt-6 space-y-4">
        {[
          {
            titulo: 'A clínica fecha para toda a gente',
            quando: 'Feriado, obras, ponte, formação da equipa inteira.',
            onde: 'Horários → Exceções, com âmbito na empresa ou na unidade',
            tipo: 'Exceção "fechado"',
          },
          {
            titulo: 'Uma pessoa vai de férias',
            quando: 'Férias, baixa, licença — dias inteiros seguidos.',
            onde: 'Horários → Ausências',
            tipo: 'Ausência',
          },
          {
            titulo: 'Uma pessoa falta num dia só',
            quando: 'Consulta médica, formação, assunto pessoal.',
            onde: 'Horários → Exceções, com âmbito no profissional',
            tipo: 'Exceção "fechado"',
          },
          {
            titulo: 'Abre-se fora do horário normal',
            quando: 'Um sábado de campanha, um serão pontual.',
            onde: 'Horários → Exceções, do tipo "aberto"',
            tipo: 'Exceção "aberto"',
          },
        ].map((c) => (
          <Card key={c.titulo} className="px-6 py-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className="font-medium">{c.titulo}</h3>
              <span className="text-(length:--text-sm) text-(--brand)">{c.tipo}</span>
            </div>
            <p className="mt-1.5 text-(length:--text-sm) text-pretty text-(--ink-muted)">
              {c.quando}
            </p>
            <p className="mt-2 text-(length:--text-sm) text-(--ink-subtle)">{c.onde}</p>
          </Card>
        ))}
      </div>

      {/* ── A regra que não se descobre a tentar ──────────────────────────── */}
      <Card className="mt-8 border-(--brand) px-6 py-6">
        <h2 className="text-(length:--text-lg) font-semibold tracking-(--tracking-tight)">
          Quando dois se cruzam, qual ganha
        </h2>

        <p className="mt-3 max-w-prose text-pretty text-(--ink-muted)">
          Esta é a única regra do painel que vale a pena decorar. Aplica-se de cima para baixo:
          o primeiro que diga alguma coisa sobre o dia decide, e os de baixo já não são
          consultados.
        </p>

        <ol className="mt-5 space-y-3">
          {[
            ['Exceção "fechado"', 'ganha sempre, a tudo o resto'],
            ['Ausência', 'férias de uma pessoa'],
            ['Exceção "aberto"', 'abertura fora do horário normal'],
            ['Horário normal', 'unidade cruzada com a do profissional'],
          ].map(([nome, nota], i) => (
            <li key={nome} className="flex items-baseline gap-3">
              <span
                aria-hidden
                className="text-(length:--text-sm) tabular-nums text-(--ink-subtle)"
              >
                {i + 1}.
              </span>
              <span>
                <strong className="font-medium">{nome}</strong>
                <span className="text-(--ink-muted)"> — {nota}</span>
              </span>
            </li>
          ))}
        </ol>

        <div className="mt-6 rounded-(--radius-md) bg-(--surface-sunken) px-4 py-4">
          <p className="text-(length:--text-sm) font-medium">O engano mais comum</p>
          <p className="mt-1.5 max-w-prose text-(length:--text-sm) text-pretty text-(--ink-muted)">
            Marcar um feriado como fechado e depois criar uma abertura extraordinária no mesmo
            dia, à espera de abrir só umas horas. <strong>Não abre.</strong> O fechado ganha
            sempre. Para abrir num feriado, apague a exceção de fechado e crie só a de aberto.
          </p>
        </div>
      </Card>

      {/* ── O caso que aparece todas as semanas ───────────────────────────── */}
      <h2 className="mt-12 text-(length:--text-xl) font-semibold tracking-(--tracking-tight)">
        Alterar o horário de uma pessoa numa semana só
      </h2>

      <p className="mt-2 max-w-prose text-pretty text-(--ink-muted)">
        &quot;A Dra. Ana só vem de manhã na semana de 15 de setembro&quot; — sem lhe mexer no
        horário normal, que volta ao normal na semana seguinte.
      </p>

      <Card className="mt-6 px-6 py-6">
        <ol className="space-y-4">
          {[
            ['Abra Horários → Equipa', 'e escolha a pessoa na lista da esquerda.'],
            [
              'Role a fita das semanas para a direita',
              'Mostra doze semanas a partir desta. Cada uma repete o horário normal, e as que já foram alteradas vêm assinaladas.',
            ],
            [
              'Carregue no dia que quer mudar',
              'Altere as horas só nesse dia. O horário normal fica intacto.',
            ],
            [
              'Guarde',
              'O sistema calcula sozinho o que é preciso fechar e o que é preciso abrir para o dia ficar como pediu.',
            ],
          ].map(([titulo, detalhe], i) => (
            <li key={titulo} className="flex gap-4">
              <span
                aria-hidden
                className="flex size-7 shrink-0 items-center justify-center rounded-(--radius-full) border border-(--line-strong) text-(length:--text-sm) font-medium"
              >
                {i + 1}
              </span>
              <span className="min-w-0">
                <strong className="font-medium">{titulo}</strong>
                <span className="block text-(length:--text-sm) text-pretty text-(--ink-muted)">
                  {detalhe}
                </span>
              </span>
            </li>
          ))}
        </ol>

        <p className="mt-6 max-w-prose text-(length:--text-sm) text-pretty text-(--ink-subtle)">
          Para uma mudança permanente — &quot;a partir de outubro passo a trabalhar às
          sextas&quot; — use antes <strong>definir a partir de</strong>. O horário antigo fica
          guardado, e as marcações de setembro continuam a fazer sentido.
        </p>
      </Card>

      {/* ── O resto do painel ─────────────────────────────────────────────── */}
      <h2 className="mt-12 text-(length:--text-xl) font-semibold tracking-(--tracking-tight)">
        As outras páginas
      </h2>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {[
          ['/servicos', 'Serviços', 'O que se marca, quanto demora, quanto custa.'],
          ['/equipa', 'Equipa', 'Quem atende e que serviços faz. Sem a ligação, ninguém aparece.'],
          ['/agenda', 'Agenda', 'As marcações do dia e da semana. Arraste para mudar de hora.'],
          ['/horarios', 'Horários', 'Abertura, horários da equipa, exceções e ausências.'],
          ['/unidades', 'Unidades', 'Onde se atende, com morada e fuso horário.'],
          ['/relatorios', 'Relatórios', 'Marcações, faltas e receita por período.'],
          ['/automacoes', 'Automações', 'Lembretes e confirmações automáticas.'],
          ['/integracoes/whatsapp', 'WhatsApp', 'Ligar o número que atende as marcações.'],
          ['/simulador', 'Simulador', 'Experimentar a conversa do assistente sem mexer na agenda.'],
          ['/disponibilidade', 'Disponibilidade', 'Ver as horas livres como o cliente as vê.'],
        ].map(([caminho, nome, descricao]) => (
          <Link
            key={caminho}
            href={url(caminho!)}
            className="rounded-(--radius-md) border border-(--line) px-4 py-3.5 transition-colors duration-(--duration-fast) hover:bg-(--surface-sunken)"
          >
            <p className="font-medium">{nome}</p>
            <p className="mt-0.5 text-(length:--text-sm) text-pretty text-(--ink-muted)">
              {descricao}
            </p>
          </Link>
        ))}
      </div>

      {/* ── Onde as pessoas encalham ──────────────────────────────────────── */}
      <h2 className="mt-12 text-(length:--text-xl) font-semibold tracking-(--tracking-tight)">
        Se alguma coisa não aparece
      </h2>

      <div className="mt-6 space-y-4">
        {[
          {
            sintoma: 'A minha página diz que a marcação está indisponível',
            causa:
              'Falta um dos cinco requisitos do topo desta página. O Resumo diz qual — e leva-o lá.',
            para: '',
          },
          {
            sintoma: 'Um serviço não aparece na página pública',
            causa:
              'Ninguém está ligado a ele. Um serviço que ninguém executa não se mostra ao cliente, porque nunca teria horas.',
            para: '/equipa',
          },
          {
            sintoma: 'Uma pessoa não aparece para ser escolhida',
            causa:
              'Ou não executa o serviço escolhido, ou não tem horário, ou não aceita marcação online.',
            para: '/equipa',
          },
          {
            sintoma: 'Diz "fechado" num dia em que a clínica abre',
            causa:
              'Costuma ser o profissional sem horário nesse dia, não a unidade. Confirme os dois.',
            para: '/horarios',
          },
          {
            sintoma: 'As horas aparecem trocadas',
            causa:
              'O fuso horário está na unidade, não na empresa. Uma unidade com o fuso errado marca os clientes à hora errada.',
            para: '/unidades',
          },
        ].map((p) => (
          <Card key={p.sintoma} className="px-6 py-5">
            <h3 className="font-medium">{p.sintoma}</h3>
            <p className="mt-1.5 max-w-prose text-(length:--text-sm) text-pretty text-(--ink-muted)">
              {p.causa}
            </p>
            {p.para ? (
              <Link
                href={url(p.para)}
                className="mt-2 inline-block text-(length:--text-sm) text-(--brand) underline underline-offset-4"
              >
                Ir para lá →
              </Link>
            ) : null}
          </Card>
        ))}
      </div>

      <p className="mt-12 border-t border-(--line) pt-6 text-(length:--text-sm) text-pretty text-(--ink-subtle)">
        Não encontrou o que procurava? Escreva para{' '}
        <a
          href="mailto:booking@totalmobi.pt"
          className="text-(--brand) underline underline-offset-4"
        >
          booking@totalmobi.pt
        </a>
        .
      </p>
    </main>
  );
}
