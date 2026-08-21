'use client';

import { useEffect, useState, useTransition } from 'react';

import { Button, cn } from '@totalmobi/ui';

import { cancelar, confirmar, horasLivres, remarcar } from './actions';

/**
 * Confirmar, remarcar ou cancelar — sem conta.
 *
 * A REGRA QUE MOLDA O ECRÃ: NUNCA ESCONDER UMA OPÇÃO POR POLÍTICA
 *
 * Se faltam duas horas e a clínica exige vinte e quatro, o botão de cancelar
 * continua visível — desativado, com a razão escrita e o telefone ao lado. Uma
 * pessoa que não pode desmarcar online precisa de saber para onde ligar;
 * esconder o botão deixa-a a olhar para um ecrã sem saída, a pensar que a culpa
 * é do telemóvel dela.
 *
 * O .ICS É GERADO NO BROWSER
 *
 * São vinte linhas de texto. Um pedido ao servidor para o produzir seria uma
 * rota a mais, um tempo de espera a mais, e uma coisa a mais para correr mal
 * quando a rede está fraca — que é precisamente quando alguém está numa sala de
 * espera a tentar guardar a consulta seguinte no calendário.
 */

interface Detalhe {
  status: string;
  startAt: string;
  endAt: string;
  timezone: string;
  serviceName: string;
  durationMinutes: number;
  staffName: string | null;
  customerName: string;
  notes: string | null;
  price: number | null;
  currency: string | null;
  tenantName: string;
  locationName: string;
  locationAddress: string | null;
  locationPhone: string | null;
  locationEmail: string | null;
  canCancel: boolean;
  canReschedule: boolean;
  cancelMinHours: number;
  rescheduleMinHours: number;
  cancelDeadline: string;
  rescheduleDeadline: string;
  now: string;
  locationId: string;
  serviceId: string;
}

const ESTADOS: Record<string, { rotulo: string; tom: string; activa: boolean }> = {
  pending: { rotulo: 'Marcada', tom: 'text-(--ink)', activa: true },
  awaiting_confirmation: { rotulo: 'A aguardar confirmação', tom: 'text-(--warning)', activa: true },
  confirmed: { rotulo: 'Confirmada', tom: 'text-(--success)', activa: true },
  checked_in: { rotulo: 'Já chegou', tom: 'text-(--success)', activa: true },
  in_progress: { rotulo: 'A decorrer', tom: 'text-(--success)', activa: true },
  completed: { rotulo: 'Concluída', tom: 'text-(--ink-muted)', activa: false },
  cancelled_customer: { rotulo: 'Cancelada por si', tom: 'text-(--danger)', activa: false },
  cancelled_business: { rotulo: 'Cancelada pelo estabelecimento', tom: 'text-(--danger)', activa: false },
  no_show: { rotulo: 'Não compareceu', tom: 'text-(--danger)', activa: false },
  rescheduled: { rotulo: 'Remarcada', tom: 'text-(--ink-muted)', activa: false },
};

function dataLonga(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('pt-PT', {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function hora(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('pt-PT', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** `YYYY-MM-DD` de hoje mais um deslocamento. */
function diaEm(deslocamento: number) {
  const d = new Date();
  d.setDate(d.getDate() + deslocamento);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { iso, dia: d.getDate(), diaSemana: d.getDay(), mes: d.getMonth() };
}

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function Gestao({ token, marcacao }: { token: string; marcacao: Detalhe }) {
  const [estado, setEstado] = useState(marcacao.status);
  const [aRemarcar, setARemarcar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aEnviar, iniciar] = useTransition();

  const info = ESTADOS[estado] ?? { rotulo: estado, tom: '', activa: false };

  // O relógio vem do servidor. Um telemóvel com a hora errada não pode decidir
  // se o prazo de cancelamento já passou — e a base de dados vai recusar de
  // qualquer forma, o que daria um ecrã a dizer uma coisa e um erro a dizer
  // outra.
  const agora = new Date(marcacao.now);
  const prazoCancelar = new Date(marcacao.cancelDeadline);
  const prazoRemarcar = new Date(marcacao.rescheduleDeadline);

  const dentroDoPrazoCancelar = agora < prazoCancelar;
  const dentroDoPrazoRemarcar = agora < prazoRemarcar;

  const podeCancelar = info.activa && marcacao.canCancel && dentroDoPrazoCancelar;
  const podeRemarcar = info.activa && marcacao.canReschedule && dentroDoPrazoRemarcar;
  const porConfirmar = estado === 'awaiting_confirmation';

  function razaoDeNaoPoder(permitido: boolean, dentroDoPrazo: boolean, horas: number): string | null {
    if (!info.activa) return null;
    if (!permitido) return 'O estabelecimento não permite fazer isto online.';
    if (!dentroDoPrazo) {
      return `Só até ${horas} ${horas === 1 ? 'hora' : 'horas'} antes. Ligue para o estabelecimento.`;
    }
    return null;
  }

  function guardarNoCalendario() {
    const paraIcs = (iso: string) => new Date(iso).toISOString().replace(/[-:]|\.\d{3}/g, '');

    const linhas = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Totalmobi Booking//PT',
      'BEGIN:VEVENT',
      `UID:${token.slice(0, 24)}@totalmobi`,
      `DTSTAMP:${paraIcs(new Date().toISOString())}`,
      `DTSTART:${paraIcs(marcacao.startAt)}`,
      `DTEND:${paraIcs(marcacao.endAt)}`,
      `SUMMARY:${marcacao.serviceName} — ${marcacao.tenantName}`,
      `LOCATION:${[marcacao.locationName, marcacao.locationAddress].filter(Boolean).join(', ')}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ];

    const url = URL.createObjectURL(
      new Blob([linhas.join('\r\n')], { type: 'text/calendar;charset=utf-8' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'marcacao.ics';
    a.click();
    URL.revokeObjectURL(url);
  }

  if (aRemarcar) {
    return (
      <EscolherHora
        marcacao={marcacao}
        onVoltar={() => setARemarcar(false)}
        onEscolher={(iso) => {
          setErro(null);
          iniciar(async () => {
            const r = await remarcar(token, iso);
            if (r.erro) setErro(r.erro);
            else window.location.reload();
          });
        }}
        aEnviar={aEnviar}
        erro={erro}
      />
    );
  }

  return (
    <div>
      <p className="text-(length:--text-sm) text-(--ink-muted)">{marcacao.tenantName}</p>
      <h1 className="mt-1 text-(length:--text-xl) font-semibold">{marcacao.serviceName}</h1>
      <p className={cn('mt-1 text-(length:--text-sm)', info.tom)}>{info.rotulo}</p>

      <div className="mt-6 rounded-(--radius-md) border border-(--line) bg-(--surface) px-5 py-4">
        <p className="font-medium">{dataLonga(marcacao.startAt, marcacao.timezone)}</p>
        <p className="mt-0.5 text-(length:--text-sm) text-(--ink-muted)">
          até {hora(marcacao.endAt, marcacao.timezone)} · {marcacao.durationMinutes} min
          {marcacao.staffName ? ` · ${marcacao.staffName}` : ''}
        </p>

        <div className="mt-4 border-t border-(--line) pt-4 text-(length:--text-sm)">
          <p className="font-medium">{marcacao.locationName}</p>
          {marcacao.locationAddress ? (
            <p className="text-(--ink-muted)">{marcacao.locationAddress}</p>
          ) : null}
          {marcacao.locationPhone ? (
            <a
              href={`tel:${marcacao.locationPhone}`}
              className="mt-1 inline-block min-h-11 leading-[2.75rem] text-(--brand) underline"
            >
              {marcacao.locationPhone}
            </a>
          ) : null}
        </div>
      </div>

      {erro ? (
        <p role="alert" className="mt-4 text-(length:--text-sm) text-(--danger)">
          {erro}
        </p>
      ) : null}

      {info.activa ? (
        <div className="mt-6 space-y-3">
          {porConfirmar ? (
            <Button
              className="w-full"
              loading={aEnviar}
              onClick={() => {
                setErro(null);
                iniciar(async () => {
                  const r = await confirmar(token);
                  if (r.erro) setErro(r.erro);
                  else setEstado('confirmed');
                });
              }}
            >
              Confirmar que vou
            </Button>
          ) : null}

          <Button variant="ghost" className="w-full" onClick={guardarNoCalendario}>
            Guardar no calendário
          </Button>

          <Accao
            rotulo="Remarcar"
            activo={podeRemarcar}
            razao={razaoDeNaoPoder(marcacao.canReschedule, dentroDoPrazoRemarcar, marcacao.rescheduleMinHours)}
            telefone={marcacao.locationPhone}
            onClick={() => setARemarcar(true)}
          />

          <Cancelar
            activo={podeCancelar}
            razao={razaoDeNaoPoder(marcacao.canCancel, dentroDoPrazoCancelar, marcacao.cancelMinHours)}
            telefone={marcacao.locationPhone}
            aEnviar={aEnviar}
            onCancelar={(motivo) => {
              setErro(null);
              iniciar(async () => {
                const r = await cancelar(token, motivo);
                if (r.erro) setErro(r.erro);
                else setEstado('cancelled_customer');
              });
            }}
          />
        </div>
      ) : (
        <div className="mt-6">
          <p className="text-pretty text-(length:--text-sm) text-(--ink-muted)">
            Esta marcação já não está ativa. Para marcar de novo, contacte o
            estabelecimento.
          </p>
          {marcacao.locationPhone ? (
            <a
              href={`tel:${marcacao.locationPhone}`}
              className="mt-2 inline-flex min-h-11 items-center font-medium text-(--brand) underline"
            >
              {marcacao.locationPhone}
            </a>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Um botão que, quando não pode, continua lá e explica-se. */
function Accao({
  rotulo,
  activo,
  razao,
  telefone,
  onClick,
}: {
  rotulo: string;
  activo: boolean;
  razao: string | null;
  telefone: string | null;
  onClick: () => void;
}) {
  return (
    <div>
      <Button variant="ghost" className="w-full" disabled={!activo} onClick={onClick}>
        {rotulo}
      </Button>
      {!activo && razao ? (
        <div className="mt-1.5 text-center">
          <p className="text-(length:--text-sm) text-(--ink-muted)">{razao}</p>
          {/*
            O telefone em linha ficava com 18 px de altura — metade do mínimo
            tátil. É o alvo mais importante deste ecrã: quem não pode desmarcar
            online só tem esta saída, e provavelmente está com pressa.
          */}
          {telefone ? (
            <a
              href={`tel:${telefone}`}
              className="mt-1 inline-flex min-h-11 items-center px-3 font-medium text-(--brand) underline"
            >
              {telefone}
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Cancelar({
  activo,
  razao,
  telefone,
  aEnviar,
  onCancelar,
}: {
  activo: boolean;
  razao: string | null;
  telefone: string | null;
  aEnviar: boolean;
  onCancelar: (motivo: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState('');

  if (!activo) {
    return <Accao rotulo="Cancelar marcação" activo={false} razao={razao} telefone={telefone} onClick={() => {}} />;
  }

  if (!aberto) {
    return (
      <Button variant="ghost" className="w-full text-(--danger)" onClick={() => setAberto(true)}>
        Cancelar marcação
      </Button>
    );
  }

  return (
    <div className="rounded-(--radius-md) border border-(--line) px-4 py-4">
      <p className="text-(length:--text-sm) font-medium">Cancelar esta marcação?</p>
      <p className="mt-1 text-(length:--text-sm) text-(--ink-muted)">
        A hora fica logo livre para outra pessoa.
      </p>

      <input
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Motivo (opcional)"
        aria-label="Motivo do cancelamento"
        className="mt-3 min-h-11 w-full rounded-(--radius-sm) border border-(--line-strong) bg-(--surface) px-3 text-(length:--text-sm)"
      />

      <div className="mt-3 flex gap-3">
        <Button
          className="flex-1 text-(--danger)"
          variant="ghost"
          loading={aEnviar}
          onClick={() => onCancelar(motivo)}
        >
          Sim, cancelar
        </Button>
        <Button variant="ghost" onClick={() => setAberto(false)}>
          Manter
        </Button>
      </div>
    </div>
  );
}

function EscolherHora({
  marcacao,
  onVoltar,
  onEscolher,
  aEnviar,
  erro,
}: {
  marcacao: Detalhe;
  onVoltar: () => void;
  onEscolher: (iso: string) => void;
  aEnviar: boolean;
  erro: string | null;
}) {
  const [data, setData] = useState(() => diaEm(0).iso);
  const [slots, setSlots] = useState<{ iso: string; hora: string }[]>([]);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [aCarregar, setACarregar] = useState(false);

  const dias = Array.from({ length: 21 }, (_, i) => diaEm(i));

  useEffect(() => {
    let cancelado = false;
    setACarregar(true);
    setMotivo(null);

    horasLivres(marcacao.locationId, marcacao.serviceId, data)
      .then((r) => {
        if (cancelado) return;
        setSlots(r.slots ?? []);
        setMotivo(r.motivo ?? null);
      })
      .finally(() => {
        if (!cancelado) setACarregar(false);
      });

    return () => {
      cancelado = true;
    };
  }, [marcacao.locationId, marcacao.serviceId, data]);

  return (
    <div>
      <button
        type="button"
        onClick={onVoltar}
        className="min-h-11 text-(length:--text-sm) text-(--ink-muted)"
      >
        ‹ Voltar
      </button>

      <h1 className="mt-2 text-(length:--text-xl) font-semibold">Escolher outra hora</h1>
      <p className="mt-1 text-(length:--text-sm) text-(--ink-muted)">
        {marcacao.serviceName} · {marcacao.durationMinutes} min
      </p>

      <div className="-mx-5 mt-5 flex gap-2 overflow-x-auto px-5 pb-1" role="group" aria-label="Escolher o dia">
        {dias.map((d) => (
          <button
            key={d.iso}
            type="button"
            onClick={() => setData(d.iso)}
            aria-pressed={data === d.iso}
            className={cn(
              'flex min-h-16 w-16 shrink-0 flex-col items-center justify-center rounded-(--radius-md) border text-(length:--text-sm)',
              data === d.iso
                ? 'border-(--brand) bg-(--brand-soft) font-medium'
                : 'border-(--line) bg-(--surface)',
            )}
          >
            <span className="text-(--ink-muted)">{DIAS[d.diaSemana]}</span>
            <span className="text-(length:--text-lg) font-medium">{d.dia}</span>
            <span className="text-(--ink-subtle)">{MESES[d.mes]}</span>
          </button>
        ))}
      </div>

      {erro ? (
        <p role="alert" className="mt-4 text-(length:--text-sm) text-(--danger)">
          {erro}
        </p>
      ) : null}

      <div className="mt-5">
        {aCarregar ? (
          <p className="text-(length:--text-sm) text-(--ink-muted)" role="status">
            A procurar horas livres…
          </p>
        ) : slots.length === 0 ? (
          <p className="text-(length:--text-sm) text-(--ink-muted)">
            {motivo ?? 'Sem horas disponíveis neste dia.'}
          </p>
        ) : (
          <ul className="grid grid-cols-3 gap-2">
            {slots.map((s) => (
              <li key={s.iso}>
                <button
                  type="button"
                  disabled={aEnviar}
                  onClick={() => onEscolher(s.iso)}
                  className="min-h-11 w-full rounded-(--radius-sm) border border-(--line) bg-(--surface) text-(length:--text-sm) hover:border-(--brand)"
                >
                  {s.hora}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
