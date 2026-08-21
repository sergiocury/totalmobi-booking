import type { Metadata } from 'next';

import { createAnonClient } from '@totalmobi/database';

import { Gestao } from './gestao';

/**
 * A marcação, vista por quem a fez.
 *
 * O URL leva **só o token**. Nunca o id da marcação, nunca o slug do cliente,
 * nunca um número sequencial. Um URL destes vai por SMS e por WhatsApp, fica no
 * histórico do browser e nos registos de quem o encaminhar — quanto menos
 * disser, melhor.
 *
 * A página não é indexável, e isso não é uma formalidade: um motor de busca a
 * seguir um link partilhado consumiria utilizações do token e poria o conteúdo
 * a caminho de um índice público.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'A sua marcação',
  robots: { index: false, follow: false, nocache: true },
};

interface DetalheMarcacao {
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

export default async function PaginaDaMarcacao({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const client = createAnonClient();

  const { data } = await client.rpc('booking_by_token', { p_token: token });
  const marcacao = data as unknown as DetalheMarcacao | null;

  if (!marcacao) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="text-(length:--text-xl) font-semibold">Link já não válido</h1>
        <p className="mt-3 text-pretty text-(--ink-muted)">
          Este link expirou, já foi usado demasiadas vezes, ou não corresponde a
          nenhuma marcação. Se precisa de alterar alguma coisa, contacte
          diretamente o estabelecimento.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-5 py-8">
      <Gestao token={token} marcacao={marcacao} />
    </main>
  );
}
