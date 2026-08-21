'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';

import {
  Badge,
  Button,
  Card,
  DialogClose,
  DialogContent,
  DialogRoot,
  DialogTrigger,
  EmptyState,
  Field,
  cn,
} from '@totalmobi/ui';

import {
  createException,
  createTimeOff,
  deleteException,
  deleteTimeOff,
  setLocationHours,
  setStaffHours,
  type ScheduleState,
} from './actions';
import { WeekEditor, type DiaSemana } from './week-editor';

interface Location {
  id: string;
  name: string;
  timezone: string;
}
interface Staff {
  id: string;
  full_name: string;
  calendar_color: string | null;
}
interface LocationHour {
  location_id: string;
  weekday: number;
  opens_at: string;
  closes_at: string;
}
interface StaffHour {
  staff_id: string;
  location_id: string;
  weekday: number;
  starts_at: string;
  ends_at: string;
}
interface Exception {
  id: string;
  date: string;
  kind: string;
  starts_at: string | null;
  ends_at: string | null;
  reason: string | null;
  scope_tenant: boolean;
  location_id: string | null;
  staff_id: string | null;
}
interface TimeOffRow {
  id: string;
  staff_id: string;
  starts_at: string;
  ends_at: string;
  kind: string;
  reason: string | null;
}

const initial: ScheduleState = {};

const TIPO_AUSENCIA: Record<string, string> = {
  vacation: 'Férias',
  sick_leave: 'Baixa médica',
  holiday: 'Feriado',
  block: 'Bloqueio',
  training: 'Formação',
  other: 'Outro',
};

/** `HH:mm:ss` da base de dados → `HH:mm` para o input. */
const hhmm = (t: string) => t.slice(0, 5);

function agrupar(
  linhas: { weekday: number; startsAt: string; endsAt: string }[],
): DiaSemana[] {
  const porDia = new Map<number, { startsAt: string; endsAt: string }[]>();
  for (const l of linhas) {
    const lista = porDia.get(l.weekday) ?? [];
    lista.push({ startsAt: l.startsAt, endsAt: l.endsAt });
    porDia.set(l.weekday, lista);
  }
  return [...porDia.entries()].map(([weekday, periods]) => ({ weekday, periods }));
}

export function SchedulesManager({
  tenantId,
  tenantSlug,
  locations,
  staff,
  locationHours,
  staffHours,
  exceptions,
  timeOff,
  canManage,
}: {
  tenantId: string;
  tenantSlug: string;
  locations: Location[];
  staff: Staff[];
  locationHours: LocationHour[];
  staffHours: StaffHour[];
  exceptions: Exception[];
  timeOff: TimeOffRow[];
  canManage: boolean;
}) {
  const [locationId, setLocationId] = useState(locations[0]!.id);
  const [staffId, setStaffId] = useState<string | null>(staff[0]?.id ?? null);
  const [erro, setErro] = useState<string | null>(null);
  const [aRemover, startTransition] = useTransition();

  const unidade = locations.find((l) => l.id === locationId)!;

  const horarioUnidade = agrupar(
    locationHours
      .filter((h) => h.location_id === locationId)
      .map((h) => ({ weekday: h.weekday, startsAt: hhmm(h.opens_at), endsAt: hhmm(h.closes_at) })),
  );

  const horarioStaff = agrupar(
    staffHours
      .filter((h) => h.staff_id === staffId && h.location_id === locationId)
      .map((h) => ({ weekday: h.weekday, startsAt: hhmm(h.starts_at), endsAt: hhmm(h.ends_at) })),
  );

  const nomeStaff = (id: string) => staff.find((s) => s.id === id)?.full_name ?? 'desconhecido';

  function remover(fn: () => Promise<ScheduleState>) {
    setErro(null);
    startTransition(async () => {
      const r = await fn();
      if (r.error) setErro(r.error);
    });
  }

  return (
    <div className="space-y-14">
      {erro ? (
        <p
          role="alert"
          className="rounded-(--radius-md) border border-(--danger) bg-(--danger-soft) px-4 py-3 text-(length:--text-sm)"
        >
          {erro}
        </p>
      ) : null}

      {locations.length > 1 ? (
        <div>
          <label
            htmlFor="unidade"
            className="mb-1.5 block text-(length:--text-sm) font-medium"
          >
            Unidade
          </label>
          <select
            id="unidade"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="rounded-(--radius-sm) border border-(--line-strong) bg-(--surface) px-3 py-2 text-(length:--text-base)"
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <section>
        <h2 className="mb-1 text-(length:--text-xl) font-semibold tracking-(--tracking-tight)">
          Horário da {unidade.name}
        </h2>
        <p className="mb-5 text-(length:--text-sm) text-(--ink-subtle)">
          Fuso horário: {unidade.timezone}
        </p>

        <WeekEditor
          initial={horarioUnidade}
          hint="As horas são locais desta unidade. Guardadas assim, continuam certas depois da mudança da hora — se fossem guardadas como instantes, a unidade passaria a abrir uma hora mais cedo ou mais tarde duas vezes por ano."
          onSave={(dias) => setLocationHours(tenantId, tenantSlug, locationId, dias)}
          saveLabel="Guardar horário da unidade"
        />
      </section>

      <section>
        <h2 className="mb-1 text-(length:--text-xl) font-semibold tracking-(--tracking-tight)">
          Horário de cada profissional
        </h2>
        <p className="mb-5 max-w-prose text-(length:--text-sm) text-pretty text-(--ink-muted)">
          O horário do profissional é cruzado com o da unidade — quem diz que trabalha até às 20h
          numa clínica que fecha às 19h, atende até às 19h.
        </p>

        {staff.length === 0 ? (
          <EmptyState
            title="Ainda não há ninguém na equipa"
            description="Adicione profissionais para lhes dar horário."
          />
        ) : (
          <>
            <div className="mb-5 flex flex-wrap gap-2">
              {staff.map((pessoa) => (
                <button
                  key={pessoa.id}
                  type="button"
                  onClick={() => setStaffId(pessoa.id)}
                  aria-pressed={staffId === pessoa.id}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-(--radius-full) border px-3.5 py-1.5',
                    'text-(length:--text-sm) font-medium whitespace-nowrap',
                    'transition-colors duration-(--duration-fast)',
                    staffId === pessoa.id
                      ? 'border-transparent bg-(--brand-soft) text-(--brand)'
                      : 'border-(--line) text-(--ink-muted) hover:border-(--line-strong)',
                  )}
                >
                  <span
                    aria-hidden
                    className="size-2.5 rounded-(--radius-full)"
                    style={{ background: pessoa.calendar_color ?? 'currentColor' }}
                  />
                  {pessoa.full_name}
                </button>
              ))}
            </div>

            {staffId ? (
              <WeekEditor
                key={`${staffId}-${locationId}`}
                initial={horarioStaff}
                onSave={(dias) => setStaffHours(tenantId, tenantSlug, staffId, locationId, dias)}
                saveLabel={`Guardar horário de ${nomeStaff(staffId).split(' ')[0]}`}
              />
            ) : null}
          </>
        )}
      </section>

      <ExceptionsSection
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        locations={locations}
        staff={staff}
        exceptions={exceptions}
        canManage={canManage}
        onDelete={(id) => remover(() => deleteException(tenantId, tenantSlug, id))}
        busy={aRemover}
      />

      <TimeOffSection
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        staff={staff}
        timeOff={timeOff}
        canManage={canManage}
        onDelete={(id) => remover(() => deleteTimeOff(tenantId, tenantSlug, id))}
        busy={aRemover}
      />
    </div>
  );
}

function ExceptionsSection({
  tenantId,
  tenantSlug,
  locations,
  staff,
  exceptions,
  canManage,
  onDelete,
  busy,
}: {
  tenantId: string;
  tenantSlug: string;
  locations: Location[];
  staff: Staff[];
  exceptions: Exception[];
  canManage: boolean;
  onDelete: (id: string) => void;
  busy: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [scope, setScope] = useState<'tenant' | 'location' | 'staff'>('tenant');
  const [kind, setKind] = useState<'closed' | 'open'>('closed');
  const [state, action, pending] = useActionState(
    createException.bind(null, tenantId, tenantSlug),
    initial,
  );

  useEffect(() => {
    if (state.ok) setAberto(false);
  }, [state.ok]);

  return (
    <section>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-(length:--text-xl) font-semibold tracking-(--tracking-tight)">
            Feriados e exceções
          </h2>
          <p className="mt-1 max-w-prose text-(length:--text-sm) text-pretty text-(--ink-muted)">
            Um fecho ganha sempre — mesmo a uma abertura extraordinária marcada para o mesmo dia.
          </p>
        </div>

        {canManage ? (
          <DialogRoot open={aberto} onOpenChange={setAberto}>
            <DialogTrigger asChild>
              <Button variant="secondary">Nova exceção</Button>
            </DialogTrigger>
            <DialogContent title="Nova exceção" description="Um fecho extraordinário ou uma abertura fora do horário normal.">
              <form action={action} className="space-y-4">
                <fieldset>
                  <legend className="mb-2 text-(length:--text-sm) font-medium">Aplica-se a</legend>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        ['tenant', 'Toda a empresa'],
                        ['location', 'Uma unidade'],
                        ['staff', 'Um profissional'],
                      ] as const
                    ).map(([valor, texto]) => (
                      <label
                        key={valor}
                        className={cn(
                          'cursor-pointer rounded-(--radius-full) border px-3.5 py-1.5 text-(length:--text-sm)',
                          'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-(--focus-ring)',
                          scope === valor
                            ? 'border-transparent bg-(--brand-soft) text-(--brand)'
                            : 'border-(--line) text-(--ink-muted)',
                        )}
                      >
                        <input
                          type="radio"
                          name="scope"
                          value={valor}
                          checked={scope === valor}
                          onChange={() => setScope(valor)}
                          className="sr-only"
                        />
                        {texto}
                      </label>
                    ))}
                  </div>
                </fieldset>

                {scope !== 'tenant' ? (
                  <div>
                    <label
                      htmlFor="targetId"
                      className="mb-1.5 block text-(length:--text-sm) font-medium"
                    >
                      {scope === 'location' ? 'Unidade' : 'Profissional'}
                    </label>
                    <select
                      id="targetId"
                      name="targetId"
                      required
                      className="w-full rounded-(--radius-sm) border border-(--line-strong) bg-(--surface) px-3 py-2.5"
                    >
                      {(scope === 'location' ? locations : staff).map((item) => (
                        <option key={item.id} value={item.id}>
                          {'name' in item ? item.name : item.full_name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                <Field label="Data" name="date" type="date" required />

                <fieldset>
                  <legend className="mb-2 text-(length:--text-sm) font-medium">Tipo</legend>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        ['closed', 'Fechado'],
                        ['open', 'Abertura extraordinária'],
                      ] as const
                    ).map(([valor, texto]) => (
                      <label
                        key={valor}
                        className={cn(
                          'cursor-pointer rounded-(--radius-full) border px-3.5 py-1.5 text-(length:--text-sm)',
                          kind === valor
                            ? 'border-transparent bg-(--brand-soft) text-(--brand)'
                            : 'border-(--line) text-(--ink-muted)',
                        )}
                      >
                        <input
                          type="radio"
                          name="kind"
                          value={valor}
                          checked={kind === valor}
                          onChange={() => setKind(valor)}
                          className="sr-only"
                        />
                        {texto}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Das"
                    name="startsAt"
                    type="time"
                    required={kind === 'open'}
                    hint={kind === 'closed' ? 'Vazio = dia inteiro' : 'Obrigatório'}
                  />
                  <Field label="Até" name="endsAt" type="time" required={kind === 'open'} />
                </div>

                <Field label="Motivo" name="reason" placeholder="Feriado municipal" />

                {state.error ? (
                  <p role="alert" className="text-(length:--text-sm) text-(--danger)">
                    {state.error}
                  </p>
                ) : null}

                <div className="flex justify-end gap-3 pt-2">
                  <DialogClose asChild>
                    <Button type="button" variant="secondary">
                      Cancelar
                    </Button>
                  </DialogClose>
                  <Button type="submit" loading={pending}>
                    Guardar
                  </Button>
                </div>
              </form>
            </DialogContent>
          </DialogRoot>
        ) : null}
      </div>

      {exceptions.length === 0 ? (
        <EmptyState
          title="Nenhuma exceção marcada"
          description="Feriados, fechos e aberturas extraordinárias aparecem aqui."
        />
      ) : (
        <ul className="space-y-2">
          {exceptions.map((e) => (
            <li key={e.id}>
              <Card className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge tone={e.kind === 'closed' ? 'danger' : 'success'}>
                    {e.kind === 'closed' ? 'Fechado' : 'Aberto'}
                  </Badge>
                  <span className="font-medium">{e.date}</span>
                  <span className="text-(length:--text-sm) text-(--ink-muted)">
                    {e.starts_at ? `${hhmm(e.starts_at)}–${hhmm(e.ends_at ?? '')}` : 'dia inteiro'}
                    {' · '}
                    {e.scope_tenant
                      ? 'toda a empresa'
                      : e.location_id
                        ? locations.find((l) => l.id === e.location_id)?.name ?? 'unidade'
                        : staff.find((s) => s.id === e.staff_id)?.full_name ?? 'profissional'}
                  </span>
                  {e.reason ? (
                    <span className="text-(length:--text-sm) text-(--ink-subtle)">{e.reason}</span>
                  ) : null}
                </div>
                {canManage ? (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDelete(e.id)}>
                    Remover
                  </Button>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TimeOffSection({
  tenantId,
  tenantSlug,
  staff,
  timeOff,
  canManage,
  onDelete,
  busy,
}: {
  tenantId: string;
  tenantSlug: string;
  staff: Staff[];
  timeOff: TimeOffRow[];
  canManage: boolean;
  onDelete: (id: string) => void;
  busy: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [state, action, pending] = useActionState(
    createTimeOff.bind(null, tenantId, tenantSlug),
    initial,
  );

  useEffect(() => {
    if (state.ok) setAberto(false);
  }, [state.ok]);

  const formatar = (iso: string) =>
    new Date(iso).toLocaleString('pt-PT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <section>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-(length:--text-xl) font-semibold tracking-(--tracking-tight)">
            Férias e ausências
          </h2>
          <p className="mt-1 max-w-prose text-(length:--text-sm) text-pretty text-(--ink-muted)">
            Valem mesmo com a unidade aberta. Duas ausências sobrepostas da mesma pessoa são
            recusadas pela base de dados.
          </p>
        </div>

        {canManage && staff.length > 0 ? (
          <DialogRoot open={aberto} onOpenChange={setAberto}>
            <DialogTrigger asChild>
              <Button variant="secondary">Nova ausência</Button>
            </DialogTrigger>
            <DialogContent title="Nova ausência" description="Férias, baixa, formação ou um bloqueio pontual.">
              <form action={action} className="space-y-4">
                <div>
                  <label
                    htmlFor="staffId"
                    className="mb-1.5 block text-(length:--text-sm) font-medium"
                  >
                    Profissional
                  </label>
                  <select
                    id="staffId"
                    name="staffId"
                    required
                    className="w-full rounded-(--radius-sm) border border-(--line-strong) bg-(--surface) px-3 py-2.5"
                  >
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.full_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Início" name="startsAt" type="datetime-local" required />
                  <Field label="Fim" name="endsAt" type="datetime-local" required />
                </div>

                <div>
                  <label htmlFor="kind" className="mb-1.5 block text-(length:--text-sm) font-medium">
                    Tipo
                  </label>
                  <select
                    id="kind"
                    name="kind"
                    className="w-full rounded-(--radius-sm) border border-(--line-strong) bg-(--surface) px-3 py-2.5"
                  >
                    {Object.entries(TIPO_AUSENCIA).map(([valor, texto]) => (
                      <option key={valor} value={valor}>
                        {texto}
                      </option>
                    ))}
                  </select>
                </div>

                <Field
                  label="Nota"
                  name="reason"
                  hint="Não é mostrada ao cliente nem guardada no registo de auditoria."
                />

                {state.error ? (
                  <p role="alert" className="text-(length:--text-sm) text-(--danger)">
                    {state.error}
                  </p>
                ) : null}

                <div className="flex justify-end gap-3 pt-2">
                  <DialogClose asChild>
                    <Button type="button" variant="secondary">
                      Cancelar
                    </Button>
                  </DialogClose>
                  <Button type="submit" loading={pending}>
                    Guardar
                  </Button>
                </div>
              </form>
            </DialogContent>
          </DialogRoot>
        ) : null}
      </div>

      {timeOff.length === 0 ? (
        <EmptyState
          title="Nenhuma ausência registada"
          description="Férias, baixas e bloqueios futuros aparecem aqui."
        />
      ) : (
        <ul className="space-y-2">
          {timeOff.map((a) => (
            <li key={a.id}>
              <Card className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge tone="warning">{TIPO_AUSENCIA[a.kind] ?? a.kind}</Badge>
                  <span className="font-medium">
                    {staff.find((s) => s.id === a.staff_id)?.full_name ?? 'desconhecido'}
                  </span>
                  <span className="text-(length:--text-sm) text-(--ink-muted)">
                    {formatar(a.starts_at)} → {formatar(a.ends_at)}
                  </span>
                </div>
                {canManage ? (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDelete(a.id)}>
                    Remover
                  </Button>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
