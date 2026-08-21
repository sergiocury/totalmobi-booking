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
  archiveStaff,
  createStaff,
  setStaffService,
  updateStaff,
  type CatalogState,
} from '../actions';

interface Staff {
  id: string;
  full_name: string;
  job_title: string | null;
  email: string | null;
  calendar_color: string | null;
  is_active: boolean;
  accepts_online_booking: boolean;
  priority: number;
  sort_order: number;
}

interface Service {
  id: string;
  name: string;
  duration_minutes: number;
}

interface Link {
  staff_id: string;
  service_id: string;
}

const initial: CatalogState = {};

/** Cores sugeridas para o calendário: distinguíveis entre si e legíveis nos dois temas. */
const CORES = ['#0E7A84', '#B0446A', '#7A5AF8', '#B54708', '#067647', '#0B5FFF'];

export function TeamManager({
  tenantId,
  tenantSlug,
  staff,
  services,
  links,
  canManage,
}: {
  tenantId: string;
  tenantSlug: string;
  staff: Staff[];
  services: Service[];
  links: Link[];
  canManage: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [state, action, pending] = useActionState(
    createStaff.bind(null, tenantId, tenantSlug),
    initial,
  );
  const [erro, setErro] = useState<string | null>(null);
  const [aMudar, startTransition] = useTransition();

  useEffect(() => {
    if (state.ok) setAberto(false);
  }, [state.ok]);

  const porProfissional = new Map<string, Set<string>>();
  for (const link of links) {
    const conjunto = porProfissional.get(link.staff_id) ?? new Set<string>();
    conjunto.add(link.service_id);
    porProfissional.set(link.staff_id, conjunto);
  }

  function alternarServico(staffId: string, serviceId: string, ligado: boolean) {
    setErro(null);
    startTransition(async () => {
      const r = await setStaffService(tenantId, tenantSlug, staffId, serviceId, ligado);
      if (r.error) setErro(r.error);
    });
  }

  function alternarCampo(id: string, campo: 'isActive' | 'acceptsOnlineBooking', valor: boolean) {
    setErro(null);
    startTransition(async () => {
      const r = await updateStaff(tenantId, tenantSlug, id, { [campo]: valor });
      if (r.error) setErro(r.error);
    });
  }

  function arquivar(id: string) {
    setErro(null);
    startTransition(async () => {
      const r = await archiveStaff(tenantId, tenantSlug, id);
      if (r.error) setErro(r.error);
    });
  }

  return (
    <>
      {erro ? (
        <p
          role="alert"
          className="mb-4 rounded-(--radius-md) border border-(--danger) bg-(--danger-soft) px-4 py-3 text-(length:--text-sm)"
        >
          {erro}
        </p>
      ) : null}

      {canManage ? (
        <div className="mb-6 flex justify-end">
          <DialogRoot open={aberto} onOpenChange={setAberto}>
            <DialogTrigger asChild>
              <Button>Novo profissional</Button>
            </DialogTrigger>
            <DialogContent
              title="Novo profissional"
              description="Só o nome é obrigatório. Quem não tem conta continua a aparecer na agenda — o login é para quem gere, não para quem atende."
            >
              <form action={action} className="space-y-4">
                <Field label="Nome" name="fullName" placeholder="Ana Martins" required />
                <Field
                  label="Função"
                  name="jobTitle"
                  placeholder="Médica dentista"
                  hint="Aparece na página pública, junto ao nome."
                />
                <Field
                  label="Email"
                  name="email"
                  type="email"
                  placeholder="ana@clinicasorriso.pt"
                  hint="Interno. Não é mostrado ao cliente final."
                />

                <fieldset>
                  <legend className="mb-2 text-(length:--text-sm) font-medium">
                    Cor no calendário
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {CORES.map((cor, i) => (
                      <label
                        key={cor}
                        className="cursor-pointer rounded-(--radius-full) p-0.5 has-[:checked]:ring-2 has-[:checked]:ring-(--ink) has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-(--focus-ring)"
                      >
                        <input
                          type="radio"
                          name="calendarColor"
                          value={cor}
                          defaultChecked={i === 0}
                          className="sr-only"
                        />
                        <span
                          aria-hidden="true"
                          className="block size-7 rounded-(--radius-full)"
                          style={{ background: cor }}
                        />
                        <span className="sr-only">{cor}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <label className="flex items-start gap-2.5 text-(length:--text-sm)">
                  <input
                    type="checkbox"
                    name="acceptsOnlineBooking"
                    defaultChecked
                    className="mt-0.5 size-4"
                  />
                  <span>
                    Aceita marcação online
                    <span className="block text-(--ink-subtle)">
                      Se desligar, continua na agenda interna mas o cliente não o pode escolher.
                    </span>
                  </span>
                </label>

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
                    Adicionar
                  </Button>
                </div>
              </form>
            </DialogContent>
          </DialogRoot>
        </div>
      ) : null}

      {staff.length === 0 ? (
        <EmptyState
          title="Ainda não há ninguém na equipa"
          description={
            canManage
              ? 'Adicione o primeiro profissional. Sem equipa não há agenda — é quem atende que define as horas disponíveis.'
              : 'Quem gere a empresa ainda não configurou a equipa.'
          }
        />
      ) : (
        <ul className="space-y-3">
          {staff.map((pessoa) => {
            const feitos = porProfissional.get(pessoa.id) ?? new Set<string>();

            return (
              <li key={pessoa.id}>
                <Card className="px-6 py-5">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        aria-hidden="true"
                        className="mt-1 size-3.5 shrink-0 rounded-(--radius-full) border border-(--line)"
                        style={{ background: pessoa.calendar_color ?? 'var(--ink-subtle)' }}
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{pessoa.full_name}</span>
                          {!pessoa.is_active ? <Badge tone="neutral">Inativo</Badge> : null}
                          {pessoa.is_active && !pessoa.accepts_online_booking ? (
                            <Badge tone="warning">Só interno</Badge>
                          ) : null}
                        </div>
                        {pessoa.job_title ? (
                          <p className="mt-0.5 text-(length:--text-sm) text-(--ink-muted)">
                            {pessoa.job_title}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    {canManage ? (
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={aMudar}
                          onClick={() => alternarCampo(pessoa.id, 'isActive', !pessoa.is_active)}
                        >
                          {pessoa.is_active ? 'Desativar' : 'Ativar'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={aMudar}
                          onClick={() =>
                            alternarCampo(
                              pessoa.id,
                              'acceptsOnlineBooking',
                              !pessoa.accepts_online_booking,
                            )
                          }
                        >
                          {pessoa.accepts_online_booking ? 'Esconder do público' : 'Mostrar'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={aMudar}
                          onClick={() => arquivar(pessoa.id)}
                        >
                          Arquivar
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  {services.length > 0 ? (
                    <div className="mt-4 border-t border-(--line) pt-4">
                      <p className="mb-2.5 text-(length:--text-sm) text-(--ink-muted)">
                        Serviços que executa
                        {feitos.size === 0 ? (
                          <span className="text-(--warning)">
                            {' '}
                            — nenhum, por isso não aparece em marcação nenhuma
                          </span>
                        ) : null}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {services.map((service) => {
                          const ligado = feitos.has(service.id);
                          return (
                            <label
                              key={service.id}
                              className={cn(
                                'cursor-pointer rounded-(--radius-full) border px-3 py-1.5',
                                'text-(length:--text-sm) whitespace-nowrap',
                                'transition-colors duration-(--duration-fast)',
                                'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-(--focus-ring)',
                                !canManage && 'pointer-events-none',
                                ligado
                                  ? 'border-transparent bg-(--brand-soft) text-(--brand)'
                                  : 'border-(--line) text-(--ink-muted) hover:border-(--line-strong)',
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={ligado}
                                disabled={!canManage || aMudar}
                                onChange={() => alternarServico(pessoa.id, service.id, !ligado)}
                                className="sr-only"
                              />
                              {service.name}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
