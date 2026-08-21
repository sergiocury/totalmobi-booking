'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState } from 'react';

import { Button, Card, Field } from '@totalmobi/ui';

import { createTenant, type ActionState } from '../actions';

const SEGMENTOS = [
  ['dental', 'Clínica dentária'],
  ['medical', 'Clínica médica'],
  ['psychology', 'Psicologia'],
  ['physiotherapy', 'Fisioterapia'],
  ['veterinary', 'Veterinária'],
  ['hair_salon', 'Cabeleireiro'],
  ['barbershop', 'Barbearia'],
  ['aesthetics', 'Estética'],
  ['spa', 'Spa'],
  ['massage', 'Massagens'],
  ['fitness', 'Personal training'],
  ['automotive', 'Oficina'],
  ['consulting', 'Consultoria'],
  ['technical_services', 'Serviços técnicos'],
  ['other', 'Outro'],
] as const;

interface Plan {
  code: string;
  name: string;
  monthly_price: number;
  currency: string;
}

const initial: ActionState = {};

/** `Clínica Sorriso Lisboa` → `clinica-sorriso-lisboa`. */
function sugerirSlug(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

export function NewTenantForm({ plans }: { plans: Plan[] }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(createTenant, initial);

  const [nome, setNome] = useState('');
  const [slug, setSlug] = useState('');
  // Enquanto ninguém tocar no identificador, ele segue o nome. Assim que for
  // editado à mão, deixa de ser sobreposto — senão o campo apagava o que a
  // pessoa acabou de escrever.
  const [slugTocado, setSlugTocado] = useState(false);

  useEffect(() => {
    if (state.ok && state.tenantId) {
      router.push(`/console/${state.tenantId}`);
    }
  }, [state.ok, state.tenantId, router]);

  const slugFinal = slugTocado ? slug : sugerirSlug(nome);

  return (
    <form action={action} className="mt-8 space-y-6">
      <Card className="space-y-5 p-7">
        <Field
          label="Nome da empresa"
          name="displayName"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Clínica Sorriso Lisboa"
          hint="É o nome que o cliente final vê ao marcar."
          required
        />

        <Field
          label="Identificador no URL"
          name="slug"
          value={slugFinal}
          onChange={(e) => {
            setSlugTocado(true);
            setSlug(e.target.value);
          }}
          placeholder="clinica-sorriso"
          hint={
            slugFinal
              ? `booking.totalmobi.pt/${slugFinal}`
              : 'Só minúsculas, números e hífenes.'
          }
          required
        />

        <Field
          label="Email de contacto"
          name="email"
          type="email"
          placeholder="geral@clinicasorriso.pt"
          required
        />

        <div>
          <label
            htmlFor="segment"
            className="mb-1.5 block text-(length:--text-sm) font-medium text-(--ink)"
          >
            Segmento
          </label>
          <select
            id="segment"
            name="segment"
            defaultValue="other"
            className="w-full rounded-(--radius-sm) border border-(--line-strong) bg-(--surface) px-3.5 py-2.5 text-(length:--text-base) text-(--ink)"
          >
            {SEGMENTOS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-(length:--text-sm) text-(--ink-muted)">
            Serve para métricas e para os dados de exemplo. Não muda o comportamento do produto.
          </p>
        </div>

        <div>
          <label
            htmlFor="planCode"
            className="mb-1.5 block text-(length:--text-sm) font-medium text-(--ink)"
          >
            Plano
          </label>
          <select
            id="planCode"
            name="planCode"
            defaultValue="basic"
            className="w-full rounded-(--radius-sm) border border-(--line-strong) bg-(--surface) px-3.5 py-2.5 text-(length:--text-base) text-(--ink)"
          >
            {plans.map((plan) => (
              <option key={plan.code} value={plan.code}>
                {plan.name} — {plan.monthly_price.toFixed(2)} {plan.currency}/mês
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="defaultTimezone"
            className="mb-1.5 block text-(length:--text-sm) font-medium text-(--ink)"
          >
            Fuso horário
          </label>
          <select
            id="defaultTimezone"
            name="defaultTimezone"
            defaultValue="Europe/Lisbon"
            className="w-full rounded-(--radius-sm) border border-(--line-strong) bg-(--surface) px-3.5 py-2.5 text-(length:--text-base) text-(--ink)"
          >
            <option value="Europe/Lisbon">Lisboa (Europe/Lisbon)</option>
            <option value="Atlantic/Madeira">Madeira (Atlantic/Madeira)</option>
            <option value="Atlantic/Azores">Açores (Atlantic/Azores)</option>
            <option value="America/Sao_Paulo">São Paulo (America/Sao_Paulo)</option>
          </select>
          <p className="mt-1.5 text-(length:--text-sm) text-(--ink-muted)">
            Valor por omissão para as unidades. Cada unidade tem o seu.
          </p>
        </div>
      </Card>

      {state.error ? (
        <p
          role="alert"
          className="rounded-(--radius-md) border border-(--danger) bg-(--danger-soft) px-4 py-3 text-(length:--text-sm)"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" loading={pending}>
          {pending ? 'A criar…' : 'Criar empresa'}
        </Button>
        <Button asChild variant="ghost">
          <a href="/console">Cancelar</a>
        </Button>
      </div>
    </form>
  );
}
