'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';

import { createBrowserClient } from '@totalmobi/database';
import { Button, Card, cn } from '@totalmobi/ui';

import { CalendarAdapter, type CalendarEvent } from '@/components/calendar/adapter';

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
  equipa: Profissional[];
  servicos: ServicoDaCasa[];
  iniciais: MarcacaoDaAgenda[];
  podeGerir: boolean;
  abreMinuto: number;
  fechaMinuto: number;
  granularidade: number;
}) {
  const [marcacoes, setMarcacoes] = useState(iniciais);
  const [filtroStaff, setFiltroStaff] = useState<string | null>(null);
  const [aberta, setAberta] = useState<MarcacaoDaAgenda | null>(null);
  const [aCriar, setACriar] = useState<{ inicio: Date; staffId: string | null } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [atualizado, setAtualizado] = useState<Date | null>(null);
  const [, iniciar] = useTransition();

  // As marcações do servidor mandam sempre que a data muda.
  useEffect(() => {
    setMarcacoes(iniciais);
  }, [iniciais]);

  const limites = useMemo(() => {
    const inicio = new Date(`${data}T00:00:00Z`);
    const fim = new Date(inicio.getTime() + 36 * 3_600_000);
    return { inicio: inicio.toISOString(), fim: fim.toISOString() };
  }, [data]);

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

  const visiveis = filtroStaff
    ? marcacoes.filter((m) => m.staff_id === filtroStaff)
    : marcacoes;

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

  async function mover(id: string, novoInicio: Date, staffId: string | null): Promise<boolean> {
    setAviso(null);

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

  const porConfirmar = marcacoes.filter(
    (m) => m.status === 'pending' || m.status === 'awaiting_confirmation',
  ).length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <NavegarDia data={data} tenantSlug={tenantSlug} />

        <div className="ml-auto flex items-center gap-3 text-(length:--text-sm)">
          {porConfirmar > 0 ? (
            <span className="text-(--warning)">
              {porConfirmar} por confirmar
            </span>
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
          <Filtro activo={filtroStaff === null} onClick={() => setFiltroStaff(null)}>
            Todos
          </Filtro>
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
          events={eventos}
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
    </div>
  );
}

function NavegarDia({ data, tenantSlug }: { data: string; tenantSlug: string }) {
  const dia = new Date(`${data}T12:00:00Z`);
  const desloca = (dias: number) => {
    const d = new Date(dia);
    d.setDate(d.getDate() + dias);
    return `/app/${tenantSlug}/agenda?data=${d.toISOString().slice(0, 10)}`;
  };
  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex items-center gap-2">
      <a
        href={desloca(-1)}
        className="flex size-11 items-center justify-center rounded-(--radius-sm) border border-(--line) bg-(--surface)"
        aria-label="Dia anterior"
      >
        ‹
      </a>
      <a
        href={desloca(1)}
        className="flex size-11 items-center justify-center rounded-(--radius-sm) border border-(--line) bg-(--surface)"
        aria-label="Dia seguinte"
      >
        ›
      </a>
      {data !== hoje ? (
        <a
          href={`/app/${tenantSlug}/agenda`}
          className="flex min-h-11 items-center rounded-(--radius-sm) border border-(--line) bg-(--surface) px-3 text-(length:--text-sm)"
        >
          Hoje
        </a>
      ) : null}
      <p className="ml-1 font-medium">
        {new Intl.DateTimeFormat('pt-PT', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          timeZone: 'UTC',
        }).format(dia)}
      </p>
    </div>
  );
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
        activo ? 'border-(--brand) bg-(--brand-soft) font-medium' : 'border-(--line) bg-(--surface)',
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

  const porConfirmar =
    marcacao.status === 'pending' || marcacao.status === 'awaiting_confirmation';

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
                O motivo fica no histórico da marcação. É o que permite responder ao
                cliente meses depois.
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
