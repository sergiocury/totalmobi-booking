'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';

import { slugify, totalBlockedMinutes } from '@totalmobi/shared';
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
} from '@totalmobi/ui';

import { archiveService, createService, updateService, type CatalogState } from '../actions';

interface Service {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  price: number | null;
  currency: string | null;
  capacity: number;
  is_active: boolean;
  bookable_online: boolean;
  requires_confirmation: boolean;
  sort_order: number;
}

const initial: CatalogState = {};

function formatarPreco(price: number | null, currency: string | null): string {
  if (price == null) return 'sem preço';
  return `${price.toFixed(2)} ${currency ?? 'EUR'}`;
}

export function ServicesManager({
  tenantId,
  tenantSlug,
  services,
  canManage,
}: {
  tenantId: string;
  tenantSlug: string;
  services: Service[];
  canManage: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [state, action, pending] = useActionState(
    createService.bind(null, tenantId, tenantSlug),
    initial,
  );
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aMudar, startTransition] = useTransition();

  useEffect(() => {
    if (state.ok) {
      setAberto(false);
      setNome('');
    }
  }, [state.ok]);

  function alternar(id: string, campo: 'is_active' | 'bookable_online', valor: boolean) {
    setErro(null);
    startTransition(async () => {
      const chave = campo === 'is_active' ? 'isActive' : 'bookableOnline';
      const r = await updateService(tenantId, tenantSlug, id, { [chave]: valor });
      if (r.error) setErro(r.error);
    });
  }

  function arquivar(id: string) {
    setErro(null);
    startTransition(async () => {
      const r = await archiveService(tenantId, tenantSlug, id);
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
              <Button>Novo serviço</Button>
            </DialogTrigger>
            <DialogContent
              title="Novo serviço"
              description="A duração é o tempo com o cliente. Os buffers são o tempo antes e depois em que o profissional continua ocupado — preparar, limpar, escrever notas."
              className="sm:max-w-lg"
            >
              <form action={action} className="space-y-4">
                <Field
                  label="Nome"
                  name="name"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Limpeza dentária"
                  hint={nome ? `identificador: ${slugify(nome)}` : undefined}
                  required
                />

                <div className="grid gap-4 sm:grid-cols-3">
                  <Field
                    label="Duração (min)"
                    name="durationMinutes"
                    type="number"
                    min={5}
                    max={1440}
                    defaultValue={30}
                    required
                  />
                  <Field
                    label="Buffer antes"
                    name="bufferBeforeMinutes"
                    type="number"
                    min={0}
                    max={240}
                    defaultValue={0}
                  />
                  <Field
                    label="Buffer depois"
                    name="bufferAfterMinutes"
                    type="number"
                    min={0}
                    max={240}
                    defaultValue={0}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Preço (EUR)"
                    name="price"
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="65.00"
                    hint="Deixe vazio se ainda não souber."
                  />
                  <Field
                    label="Vagas por sessão"
                    name="capacity"
                    type="number"
                    min={1}
                    defaultValue={1}
                    hint="1 = individual. Acima é aula ou workshop."
                  />
                </div>

                <label className="flex items-start gap-2.5 text-(length:--text-sm)">
                  <input
                    type="checkbox"
                    name="bookableOnline"
                    defaultChecked
                    className="mt-0.5 size-4"
                  />
                  <span>
                    Disponível para marcação online
                    <span className="block text-(--ink-subtle)">
                      Se desligar, o serviço existe na agenda mas não aparece ao cliente.
                    </span>
                  </span>
                </label>

                <label className="flex items-start gap-2.5 text-(length:--text-sm)">
                  <input type="checkbox" name="requiresConfirmation" className="mt-0.5 size-4" />
                  <span>
                    Precisa de confirmação
                    <span className="block text-(--ink-subtle)">
                      A marcação fica pendente até alguém da equipa a aceitar.
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
                    Criar serviço
                  </Button>
                </div>
              </form>
            </DialogContent>
          </DialogRoot>
        </div>
      ) : null}

      {services.length === 0 ? (
        <EmptyState
          title="Ainda não há serviços"
          description={
            canManage
              ? 'Crie o primeiro. Sem serviços, não há nada que o cliente possa marcar.'
              : 'Quem gere a empresa ainda não configurou o catálogo.'
          }
        />
      ) : (
        <ul className="space-y-3">
          {services.map((service) => {
            const bloqueado = totalBlockedMinutes(
              service.duration_minutes,
              service.buffer_before_minutes,
              service.buffer_after_minutes,
            );
            const temBuffer = bloqueado !== service.duration_minutes;

            return (
              <li key={service.id}>
                <Card className="px-6 py-5">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{service.name}</span>
                        {!service.is_active ? <Badge tone="neutral">Inativo</Badge> : null}
                        {service.is_active && !service.bookable_online ? (
                          <Badge tone="warning">Só interno</Badge>
                        ) : null}
                        {service.requires_confirmation ? (
                          <Badge tone="brand">Confirma</Badge>
                        ) : null}
                        {service.capacity > 1 ? (
                          <Badge tone="brand">{service.capacity} vagas</Badge>
                        ) : null}
                      </div>

                      <p className="mt-1 text-(length:--text-sm) text-(--ink-muted)">
                        {service.duration_minutes} min
                        {temBuffer ? ` (${bloqueado} min na agenda)` : ''} ·{' '}
                        {formatarPreco(service.price, service.currency)}
                      </p>

                      {service.description ? (
                        <p className="mt-1.5 max-w-prose text-(length:--text-sm) text-pretty text-(--ink-subtle)">
                          {service.description}
                        </p>
                      ) : null}
                    </div>

                    {canManage ? (
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={aMudar}
                          onClick={() => alternar(service.id, 'is_active', !service.is_active)}
                        >
                          {service.is_active ? 'Desativar' : 'Ativar'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={aMudar}
                          onClick={() =>
                            alternar(service.id, 'bookable_online', !service.bookable_online)
                          }
                        >
                          {service.bookable_online ? 'Esconder do público' : 'Mostrar ao público'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={aMudar}
                          onClick={() => arquivar(service.id)}
                        >
                          Arquivar
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {services.length > 0 && canManage ? (
        <p className="mt-6 max-w-prose text-(length:--text-sm) text-pretty text-(--ink-subtle)">
          Arquivar não apaga: o serviço sai das listas mas as marcações antigas continuam a
          fazer sentido.
        </p>
      ) : null}
    </>
  );
}
