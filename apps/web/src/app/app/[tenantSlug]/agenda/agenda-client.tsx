'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';

import { createBrowserClient } from '@totalmobi/database';
import { segundaFeiraDe } from '@totalmobi/shared';
import { Button, Card, cn, DialogContent, DialogRoot } from '@totalmobi/ui';

import {
  CalendarAdapter,
  type CalendarEvent,
  type CalendarView,
} from '@/components/calendar/adapter';

import {
  cancelarMarcacao,
  confirmarMarcacao,
  criarNaAgenda,
  moverMarcacao,
  recarregarDia,
  type MarcacaoDaAgenda,
} from './actions';

/**
 * A agenda do balcão.
 *
 * A pergunta que este ecrã responde em segundos é "como está o meu dia" — não
 * "que marcações existem". A diferença decide o que aparece primeiro: horas,
 * blocos e nomes; nunca uma tabela.
 *
 * O REALTIME NÃO APLICA EVENTOS À MÃO
 *
 * Quando chega um aviso de alteração, pede-se o dia outra vez. Tentar aplicar
 * cada `INSERT`/`UPDATE`/`DELETE` ao estado local parece mais eficiente e é uma
 * fonte inesgotável de dessincronização: basta um evento perdido durante uma
 * reconexão para o ecrã ficar a mentir até alguém carregar em F5. Um dia inteiro
 * são dezenas de linhas com projeção mínima — é barato.
 *
 * O indicador de "atualizado" é discreto de propósito. Uma agenda que pisca a
 * cada marcação nova é uma agenda que se deixa de olhar.
 */

const ESTADOS: Record<string, { rotulo: string; tom: string }> = {
  pending: { rotulo: 'Por confirmar', tom: 'text-(--warning)' },
  awaiting_confirmation: { rotulo: 'Aguarda confirmação', tom: 'text-(--warning)' },
  confirmed: { rotulo: 'Confirmada', tom: 'text-(--success)' },
  checked_in: { rotulo: 'Chegou', tom: 'text-(--success)' },
  in_progress: { rotulo: 'A decorrer', tom: 'text-(--success)' },
  completed: { rotulo: 'Concluída', tom: 'text-(--ink-muted)' },
  cancelled_customer: { rotulo: 'Cancelada pelo cliente', tom: 'text-(--danger)' },
  cancelled_business: { rotulo: 'Cancelada', tom: 'text-(--danger)' },
  no_show: { rotulo: 'Não compareceu', tom: 'text-(--danger)' },
  rescheduled: { rotulo: 'Remarcada', tom: 'text-(--ink-muted)' },
};

const ORIGENS: Record<string, string> = {
  public_web: 'Página pública',
  widget: 'Widget',
  whatsapp: 'WhatsApp',
  voice: 'Voz',
  admin: 'Balcão',
  api: 'API',
  import: 'Importação',
};

export interface Profissional {
  id: string;
  nome: string;
  cor: string | null;
}

export interface ServicoDaCasa {
  id: string;
  nome: string;
  duracao: number;
}

export function AgendaClient({
  tenantId,
  tenantSlug,
  locationId,
  timezone,
  data,
  vista,
  diasDaSemana,
  profissionalPedido,
  equipa,
  servicos,
  iniciais,
  podeGerir,
  abreMinuto,
  fechaMinuto,
  granularidade,
}: {
  tenantId: string;
  tenantSlug: string;
  locationId: string;
  timezone: string;
  data: string;
  vista: CalendarView;
  diasDaSemana: string[];
  profissionalPedido: string | null;
  equipa: Profissional[];
  servicos: ServicoDaCasa[];
  iniciais: MarcacaoDaAgenda[];
  podeGerir: boolean;
  abreMinuto: number;
  fechaMinuto: number;
  granularidade: number;
}) {
  const [marcacoes, setMarcacoes] = useState(iniciais);

  /**
   * O filtro de profissional tem significados diferentes nas duas vistas.
   *
   * No dia é um filtro de verdade: `null` mostra toda a gente, cada uma na sua
   * coluna. Na semana **não pode ser `null`** — as colunas são dias, e sem
   * escolher uma pessoa a grelha empilhava a equipa toda na mesma coluna, que é
   * exatamente a mancha ilegível que esta vista existe para evitar.
   *
   * Por isso a semana começa na profissional que vier no URL, ou na primeira.
   */
  const [filtroStaff, setFiltroStaff] = useState<string | null>(
    vista === 'semana' ? (profissionalPedido ?? equipa[0]?.id ?? null) : profissionalPedido,
  );
  const [aberta, setAberta] = useState<MarcacaoDaAgenda | null>(null);
  const [aCriar, setACriar] = useState<{ inicio: Date; staffId: string | null } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [atualizado, setAtualizado] = useState<Date | null>(null);
  const [, iniciar] = useTransition();

  // As marcações do servidor mandam sempre que a data muda.
  useEffect(() => {
    setMarcacoes(iniciais);
  }, [iniciais]);

  // Tem de ser o mesmo intervalo que a página pediu ao servidor. Se divergirem,
  // o recarregamento do Realtime devolve menos dias do que estão desenhados e a
  // semana encolhe sozinha à primeira alteração.
  const limites = useMemo(() => {
    const dias = vista === 'semana' ? 7 : 1;
    const inicio = new Date(new Date(`${data}T00:00:00Z`).getTime() - 12 * 3_600_000);
    const fim = new Date(inicio.getTime() + (dias * 24 + 48) * 3_600_000);
    return { inicio: inicio.toISOString(), fim: fim.toISOString() };
  }, [data, vista]);

  const recarregar = useCallback(async () => {
    const r = await recarregarDia(tenantId, locationId, limites.inicio, limites.fim);
    if (r.marcacoes) {
      setMarcacoes(r.marcacoes);
      setAtualizado(new Date());
    }
  }, [tenantId, locationId, limites]);

  useEffect(() => {
    const client = createBrowserClient();
    let canal: ReturnType<typeof client.channel> | null = null;
    let vivo = true;

    /**
     * O Realtime tem de ser autenticado **antes** de subscrever.
     *
     * Sem `setAuth`, a ligação vai como `anon` — e o `anon` não tem política
     * nenhuma sobre `bookings`, por decisão do M8. O resultado é a pior espécie
     * de avaria: a subscrição responde `SUBSCRIBED`, tudo parece bem, e não
     * chega **um único evento**. Nem erro, nem aviso.
     *
     * Custou uma hora a perceber. A RLS aplica-se aos eventos do Realtime tal
     * como às consultas, e sem token não há linha nenhuma que o utilizador
     * possa ver.
     */
    void (async () => {
      const { data } = await client.auth.getSession();
      if (!vivo) return;

      const token = data.session?.access_token;
      if (token) await client.realtime.setAuth(token);

      canal = client
        .channel(`agenda:${locationId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'booking',
            table: 'bookings',
            filter: `location_id=eq.${locationId}`,
          },
          () => {
            void recarregar();
          },
        )
        .subscribe();
    })();

    return () => {
      vivo = false;
      if (canal) void client.removeChannel(canal);
    };
  }, [locationId, recarregar]);

  const visiveis = filtroStaff ? marcacoes.filter((m) => m.staff_id === filtroStaff) : marcacoes;

  const eventos: CalendarEvent[] = visiveis.map((m) => ({
    id: m.id,
    start: new Date(m.start_at),
    end: new Date(m.end_at),
    title: m.customer_name,
    subtitle: m.service_name,
    resourceId: m.staff_id,
    color: m.service_color ?? m.staff_color,
    status: m.status,
    active: m.occupies_slot,
  }));

  const colunas = (filtroStaff ? equipa.filter((p) => p.id === filtroStaff) : equipa).map((p) => ({
    id: p.id,
    title: p.nome,
    color: p.cor,
  }));

  // Na semana, as marcações das outras pessoas não têm coluna onde aparecer.
  // Mostrá-las na mesma seria dizer que a Ana está ocupada quando quem está é o
  // João.
  const [movimento, setMovimento] = useState<{
    id: string;
    novoInicio: Date;
    staffId: string | null;
    resolver: (ok: boolean) => void;
    titulo: string;
    de: Date | null;
  } | null>(null);

  const eventosVisiveis =
    vista === 'semana' && filtroStaff
      ? eventos.filter((e) => e.resourceId === filtroStaff)
      : eventos;

  /*
   * Mover pergunta primeiro.
   *
   * O limiar de arrasto acabou com os cliques que moviam marcacoes sozinhos,
   * mas nao com o resto: um dedo que escorrega num ecra tatil, um rato que
   * salta, um toque com o polegar enquanto se rola a agenda. Ao balcao, com
   * pessoas a atender, isso acontece.
   *
   * E desde que existe a regra `rescheduled`, mover **avisa o cliente**: um
   * arrasto acidental manda-lhe uma mensagem a dizer que a hora mudou. Nao ha
   * como desfazer uma mensagem enviada — e por isso a confirmacao vem **antes**
   * da escrita, e nao um "anular" depois.
   *
   * Nada acontece enquanto a pergunta estiver no ecra. A promessa so resolve
   * quando alguem responde.
   */
  async function mover(id: string, novoInicio: Date, staffId: string | null): Promise<boolean> {
    setAviso(null);

    const evento = eventos.find((e) => e.id === id);

    const confirmado = await new Promise<boolean>((resolver) => {
      setMovimento({
        id,
        novoInicio,
        staffId,
        resolver,
        titulo: evento?.title ?? 'a marcacao',
        de: evento ? evento.start : null,
      });
    });

    setMovimento(null);
    if (!confirmado) return false;

    const r = await moverMarcacao(tenantId, tenantSlug, id, novoInicio.toISOString(), staffId);

    if (r.erro) {
      setAviso(r.erro);
      // `false` faz o calendário repor o bloco onde estava. A base de dados
      // recusou, e o ecrã tem de refletir a base de dados, não a intenção.
      return false;
    }

    await recarregar();
    return true;
  }

  // Conta o que está à vista. Dizer "3 por confirmar" numa semana filtrada por
  // uma pessoa, e depois só mostrar uma, é o ecrã a contradizer-se.
  const idsVisiveis = new Set(eventosVisiveis.map((e) => e.id));
  const porConfirmar = marcacoes.filter(
    (m) =>
      idsVisiveis.has(m.id) && (m.status === 'pending' || m.status === 'awaiting_confirmation'),
  ).length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <NavegarPeriodo
          data={data}
          vista={vista}
          tenantSlug={tenantSlug}
          profissional={filtroStaff}
        />

        <AlternarVista
          data={data}
          vista={vista}
          tenantSlug={tenantSlug}
          profissional={filtroStaff}
        />

        <div className="ml-auto flex items-center gap-3 text-(length:--text-sm)">
          {porConfirmar > 0 ? (
            <span className="text-(--warning)">{porConfirmar} por confirmar</span>
          ) : null}
          {atualizado ? (
            <span className="text-(--ink-subtle)" role="status">
              Atualizado às{' '}
              {new Intl.DateTimeFormat('pt-PT', {
                timeZone: timezone,
                hour: '2-digit',
                minute: '2-digit',
              }).format(atualizado)}
            </span>
          ) : null}
        </div>
      </div>

      {equipa.length > 1 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {/* "Todos" não existe na semana: as colunas são dias, e sem uma
              pessoa escolhida não há grelha que se leia. */}
          {vista === 'dia' ? (
            <Filtro activo={filtroStaff === null} onClick={() => setFiltroStaff(null)}>
              Todos
            </Filtro>
          ) : null}
          {equipa.map((p) => (
            <Filtro
              key={p.id}
              activo={filtroStaff === p.id}
              onClick={() => setFiltroStaff(p.id)}
              cor={p.cor}
            >
              {p.nome}
            </Filtro>
          ))}
        </div>
      ) : null}

      {aviso ? (
        <p role="alert" className="mb-3 text-(length:--text-sm) text-(--danger)">
          {aviso}
        </p>
      ) : null}

      <Card className="overflow-hidden">
        <CalendarAdapter
          date={data}
          timezone={timezone}
          view={vista}
          days={diasDaSemana}
          events={eventosVisiveis}
          resources={colunas}
          range={{ startMinute: abreMinuto, endMinute: fechaMinuto, stepMinutes: granularidade }}
          onEventClick={(id) => setAberta(marcacoes.find((m) => m.id === id) ?? null)}
          onEmptyClick={(inicio, staffId) => setACriar({ inicio, staffId })}
          {...(podeGerir ? { onEventMove: mover } : {})}
        />
      </Card>

      {aCriar && servicos.length > 0 ? (
        <Criar
          inicio={aCriar.inicio}
          staffId={aCriar.staffId}
          servicos={servicos}
          equipa={equipa}
          timezone={timezone}
          onFechar={() => setACriar(null)}
          onCriar={(entrada) => {
            iniciar(async () => {
              const r = await criarNaAgenda(tenantId, tenantSlug, {
                locationId,
                serviceId: entrada.serviceId,
                staffId: entrada.staffId,
                inicio: aCriar.inicio.toISOString(),
                nome: entrada.nome,
                telefone: entrada.telefone,
              });

              if (r.erro) setAviso(r.erro);
              else await recarregar();
              setACriar(null);
            });
          }}
        />
      ) : null}

      {aberta ? (
        <Detalhe
          marcacao={aberta}
          timezone={timezone}
          podeGerir={podeGerir}
          onFechar={() => setAberta(null)}
          onConfirmar={() => {
            iniciar(async () => {
              const r = await confirmarMarcacao(tenantId, tenantSlug, aberta.id);
              if (r.erro) setAviso(r.erro);
              else await recarregar();
              setAberta(null);
            });
          }}
          onCancelar={(motivo) => {
            iniciar(async () => {
              const r = await cancelarMarcacao(tenantId, tenantSlug, aberta.id, motivo);
              if (r.erro) setAviso(r.erro);
              else await recarregar();
              setAberta(null);
            });
          }}
        />
      ) : null}

      {movimento ? (
        <DialogRoot open onOpenChange={() => movimento.resolver(false)}>
          <DialogContent
            title="Mover esta marcação?"
            description="O cliente recebe um aviso com a hora nova."
          >
            <p className="text-pretty">
              <strong className="font-medium text-(--ink)">{movimento.titulo}</strong>
              {movimento.de ? (
                <>
                  {' '}
                  passa de{' '}
                  <strong className="font-medium text-(--ink)">
                    {horaLegivel(movimento.de, timezone)}
                  </strong>{' '}
                  para{' '}
                </>
              ) : (
                ' passa para '
              )}
              <strong className="font-medium text-(--ink)">
                {horaLegivel(movimento.novoInicio, timezone)}
              </strong>
              .
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => movimento.resolver(false)}>
                Não mover
              </Button>
              <Button onClick={() => movimento.resolver(true)}>Mover</Button>
            </div>
          </DialogContent>
        </DialogRoot>
      ) : null}
    </div>
  );
}

/**
 * O dia e a hora, para caber na pergunta de confirmação.
 *
 * Com o dia da semana por extenso: um arrasto que atravessa colunas muda o dia,
 * e é precisamente esse o engano que mais custa — ver só "15:30" não deixa
 * ninguém reparar que passou de domingo para segunda.
 */
function horaLegivel(instante: Date, timezone: string): string {
  return new Intl.DateTimeFormat('pt-PT', {
    timeZone: timezone,
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(instante);
}

/**
 * Andar para trás e para a frente.
 *
 * O passo é o tamanho do que está à vista: um dia na vista de dia, sete na de
 * semana. Um botão que anda um dia numa vista de semana obrigaria a sete
 * cliques para mudar de semana, e a vista mudaria por baixo do cursor a meio.
 *
 * São `<a>` e não botões porque o período vive no URL. Isso torna a agenda de
 * uma quinta-feira uma coisa que se envia a um colega, e faz o botão "para
 * trás" do browser fazer o que se espera.
 */
function NavegarPeriodo({
  data,
  vista,
  tenantSlug,
  profissional,
}: {
  data: string;
  vista: CalendarView;
  tenantSlug: string;
  profissional: string | null;
}) {
  const passo = vista === 'semana' ? 7 : 1;
  const dia = new Date(`${data}T12:00:00Z`);

  const desloca = (dias: number) => {
    const d = new Date(dia);
    d.setUTCDate(d.getUTCDate() + dias);
    return urlDaAgenda(tenantSlug, d.toISOString().slice(0, 10), vista, profissional);
  };

  const hoje = new Date().toISOString().slice(0, 10);
  const noPeriodoDeHoje =
    vista === 'semana' ? segundaFeiraDe(hoje) === segundaFeiraDe(data) : data === hoje;

  const fimDaSemana = new Date(dia);
  fimDaSemana.setUTCDate(fimDaSemana.getUTCDate() + 6);

  return (
    <div className="flex items-center gap-2">
      <a
        href={desloca(-passo)}
        className="flex size-11 items-center justify-center rounded-(--radius-sm) border border-(--line) bg-(--surface)"
        aria-label={vista === 'semana' ? 'Semana anterior' : 'Dia anterior'}
      >
        ‹
      </a>
      <a
        href={desloca(passo)}
        className="flex size-11 items-center justify-center rounded-(--radius-sm) border border-(--line) bg-(--surface)"
        aria-label={vista === 'semana' ? 'Semana seguinte' : 'Dia seguinte'}
      >
        ›
      </a>
      {!noPeriodoDeHoje ? (
        <a
          href={urlDaAgenda(tenantSlug, null, vista, profissional)}
          className="flex min-h-11 items-center rounded-(--radius-sm) border border-(--line) bg-(--surface) px-3 text-(length:--text-sm)"
        >
          Hoje
        </a>
      ) : null}
      <p className="ml-1 font-medium first-letter:uppercase">
        {vista === 'semana' ? intervalo(dia, fimDaSemana) : porExtenso(dia)}
      </p>
    </div>
  );
}

/**
 * Dia ou semana.
 *
 * Dois links, não um `<select>`: são duas opções e ambas cabem no ecrã. E como
 * são links, a escolha fica no URL — quem trabalha sempre à semana marca-a nos
 * favoritos e é lá que aterra.
 */
function AlternarVista({
  data,
  vista,
  tenantSlug,
  profissional,
}: {
  data: string;
  vista: CalendarView;
  tenantSlug: string;
  profissional: string | null;
}) {
  const opcoes: { chave: CalendarView; rotulo: string }[] = [
    { chave: 'dia', rotulo: 'Dia' },
    { chave: 'semana', rotulo: 'Semana' },
  ];

  return (
    <div
      className="flex overflow-hidden rounded-(--radius-sm) border border-(--line)"
      role="group"
      aria-label="Vista da agenda"
    >
      {opcoes.map((o) => (
        <a
          key={o.chave}
          href={urlDaAgenda(tenantSlug, data, o.chave, profissional)}
          aria-current={vista === o.chave ? 'page' : undefined}
          className={cn(
            'flex min-h-11 items-center px-3 text-(length:--text-sm)',
            vista === o.chave
              ? 'bg-(--brand) font-medium text-(--brand-ink)'
              : 'bg-(--surface) text-(--ink-muted)',
          )}
        >
          {o.rotulo}
        </a>
      ))}
    </div>
  );
}

/**
 * O URL da agenda.
 *
 * Um sítio só a construí-lo. A profissional viaja no URL para que trocar de
 * vista não a perca — mudar de "semana da Ana" para o dia e voltar deve trazer
 * a Ana de volta, não a primeira da lista.
 */
function urlDaAgenda(
  tenantSlug: string,
  data: string | null,
  vista: CalendarView,
  profissional: string | null,
): string {
  const q = new URLSearchParams();
  if (data) q.set('data', data);
  if (vista === 'semana') q.set('vista', 'semana');
  if (profissional) q.set('profissional', profissional);

  const cauda = q.toString();
  return `/app/${tenantSlug}/agenda${cauda ? `?${cauda}` : ''}`;
}

function porExtenso(d: Date): string {
  return new Intl.DateTimeFormat('pt-PT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(d);
}

/**
 * "24–30 de agosto", ou "29 de setembro – 5 de outubro" quando a semana muda de
 * mês. Repetir o mês nos dois lados quando é o mesmo é ruído.
 */
function intervalo(de: Date, ate: Date): string {
  const mes = (d: Date) =>
    new Intl.DateTimeFormat('pt-PT', { month: 'long', timeZone: 'UTC' }).format(d);

  const mesmoMes = de.getUTCMonth() === ate.getUTCMonth();

  return mesmoMes
    ? `${de.getUTCDate()}–${ate.getUTCDate()} de ${mes(de)}`
    : `${de.getUTCDate()} de ${mes(de)} – ${ate.getUTCDate()} de ${mes(ate)}`;
}

function Filtro({
  activo,
  onClick,
  cor,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  cor?: string | null;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={cn(
        'flex min-h-11 items-center gap-2 rounded-(--radius-full) border px-4 text-(length:--text-sm)',
        activo
          ? 'border-(--brand) bg-(--brand-soft) font-medium'
          : 'border-(--line) bg-(--surface)',
      )}
    >
      {cor ? (
        <span aria-hidden className="size-2.5 rounded-full" style={{ background: cor }} />
      ) : null}
      {children}
    </button>
  );
}

function Detalhe({
  marcacao,
  timezone,
  podeGerir,
  onFechar,
  onConfirmar,
  onCancelar,
}: {
  marcacao: MarcacaoDaAgenda;
  timezone: string;
  podeGerir: boolean;
  onFechar: () => void;
  onConfirmar: () => void;
  onCancelar: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState('');
  const estado = ESTADOS[marcacao.status] ?? { rotulo: marcacao.status, tom: '' };

  const hora = (iso: string) =>
    new Intl.DateTimeFormat('pt-PT', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));

  const porConfirmar = marcacao.status === 'pending' || marcacao.status === 'awaiting_confirmation';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
      onClick={onFechar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Marcação de ${marcacao.customer_name}`}
        className="w-full max-w-md rounded-t-(--radius-lg) bg-(--surface) p-6 sm:rounded-(--radius-lg)"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-(length:--text-lg) font-semibold">{marcacao.customer_name}</p>
        <p className={cn('mt-0.5 text-(length:--text-sm)', estado.tom)}>{estado.rotulo}</p>

        <dl className="mt-4 space-y-1.5 text-(length:--text-sm)">
          <Linha termo="Serviço">{marcacao.service_name}</Linha>
          <Linha termo="Hora">
            {hora(marcacao.start_at)}–{hora(marcacao.end_at)}
          </Linha>
          {marcacao.staff_name ? <Linha termo="Com">{marcacao.staff_name}</Linha> : null}
          {marcacao.customer_phone ? (
            <Linha termo="Telefone">
              <a href={`tel:${marcacao.customer_phone}`} className="text-(--brand) underline">
                {marcacao.customer_phone}
              </a>
            </Linha>
          ) : null}
          <Linha termo="Origem">{ORIGENS[marcacao.source] ?? marcacao.source}</Linha>
          {marcacao.notes ? <Linha termo="Nota do cliente">{marcacao.notes}</Linha> : null}
        </dl>

        {podeGerir && marcacao.occupies_slot ? (
          <div className="mt-6 space-y-3">
            {porConfirmar ? (
              <Button onClick={onConfirmar} className="w-full">
                Confirmar marcação
              </Button>
            ) : null}

            <div className="space-y-2">
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Motivo do cancelamento"
                aria-label="Motivo do cancelamento"
                className="min-h-11 w-full rounded-(--radius-sm) border border-(--line-strong) bg-(--surface) px-3 text-(length:--text-sm)"
              />
              <Button
                variant="ghost"
                onClick={() => onCancelar(motivo)}
                disabled={motivo.trim().length < 3}
                className="w-full text-(--danger)"
              >
                Cancelar marcação
              </Button>
              <p className="text-(length:--text-sm) text-(--ink-subtle)">
                O motivo fica no histórico da marcação. É o que permite responder ao cliente meses
                depois.
              </p>
            </div>
          </div>
        ) : null}

        <Button variant="ghost" onClick={onFechar} className="mt-4 w-full">
          Fechar
        </Button>
      </div>
    </div>
  );
}

function Linha({ termo, children }: { termo: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 text-(--ink-muted)">{termo}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

/**
 * Criar uma marcação ao balcão.
 *
 * A hora e o profissional vêm do sítio onde a Rita carregou — é isso que torna
 * isto rápido. Sobra escolher o serviço e escrever o nome e o número: um toque
 * e duas linhas de texto, com o telefone a abrir teclado numérico.
 *
 * Não há campo de data nem de hora. Se estiverem errados, fecha-se e carrega-se
 * no sítio certo — mais depressa do que corrigir dois seletores.
 */
function Criar({
  inicio,
  staffId,
  servicos,
  equipa,
  timezone,
  onFechar,
  onCriar,
}: {
  inicio: Date;
  staffId: string | null;
  servicos: ServicoDaCasa[];
  equipa: Profissional[];
  timezone: string;
  onFechar: () => void;
  onCriar: (entrada: {
    serviceId: string;
    staffId: string | null;
    nome: string;
    telefone: string;
  }) => void;
}) {
  const [serviceId, setServiceId] = useState(servicos[0]!.id);
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');

  const profissional = equipa.find((p) => p.id === staffId);

  const quando = new Intl.DateTimeFormat('pt-PT', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(inicio);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6"
      onClick={onFechar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Nova marcação"
        className="w-full max-w-md rounded-t-(--radius-lg) bg-(--surface) p-6 sm:rounded-(--radius-lg)"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-(length:--text-lg) font-semibold">Nova marcação</p>
        <p className="mt-0.5 text-(length:--text-sm) text-(--ink-muted)">
          {quando}
          {profissional ? ` · ${profissional.nome}` : ''}
        </p>

        <div className="mt-5 space-y-3">
          <label className="block">
            <span className="mb-1 block text-(length:--text-sm) text-(--ink-muted)">Serviço</span>
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              className="min-h-11 w-full rounded-(--radius-sm) border border-(--line-strong) bg-(--surface) px-3"
            >
              {servicos.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome} · {s.duracao} min
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-(length:--text-sm) text-(--ink-muted)">Cliente</span>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="min-h-11 w-full rounded-(--radius-sm) border border-(--line-strong) bg-(--surface) px-3"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-(length:--text-sm) text-(--ink-muted)">Telemóvel</span>
            <input
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              type="tel"
              inputMode="tel"
              placeholder="912 345 678"
              className="min-h-11 w-full rounded-(--radius-sm) border border-(--line-strong) bg-(--surface) px-3"
            />
          </label>
        </div>

        <div className="mt-5 flex gap-3">
          <Button
            onClick={() => onCriar({ serviceId, staffId, nome, telefone })}
            disabled={nome.trim().length < 2 || telefone.trim().length < 6}
            className="flex-1"
          >
            Marcar
          </Button>
          <Button variant="ghost" onClick={onFechar}>
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}
