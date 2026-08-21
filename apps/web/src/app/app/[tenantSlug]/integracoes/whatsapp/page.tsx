import { notFound } from 'next/navigation';

import { Card, PageHeader } from '@totalmobi/ui';

import { loadTenantPage } from '@/lib/tenant-context';

import { Integracao } from './integracao';

export const metadata = { title: 'WhatsApp' };
export const dynamic = 'force-dynamic';

/**
 * Estado da ligação ao WhatsApp.
 *
 * Lê da **vista** `whatsapp_connection_status`, não da tabela. A tabela não tem
 * política de `SELECT` para papel nenhum — nem para o dono da empresa — porque
 * guarda o token de acesso, e um token da Meta permite falar em nome do
 * negócio. A vista mostra tudo menos isso.
 */
export default async function WhatsAppPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const context = await loadTenantPage(tenantSlug);

  if (!context) notFound();

  const { data: estado } = await context.client
    .from('whatsapp_connection_status')
    .select('*')
    .eq('tenant_id', context.tenantId)
    .maybeSingle();

  const { data: conversas } = await context.client
    .from('conversations')
    .select('id, external_id, status, current_state, last_inbound_at, last_message_at')
    .eq('tenant_id', context.tenantId)
    .eq('channel', 'whatsapp')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(10);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 sm:py-14">
      <PageHeader
        title="WhatsApp"
        description="O canal onde os seus clientes já falam todos os dias."
      />

      <Integracao
        tenantId={context.tenantId}
        tenantSlug={tenantSlug}
        estado={estado}
        conversas={conversas ?? []}
        ehAdminDaPlataforma={context.isPlatformAdmin}
      />

      <Card className="mt-8 px-5 py-4">
        <h2 className="font-medium">Porque é que isto passa pela Meta</h2>
        <p className="mt-2 max-w-prose text-pretty text-(length:--text-sm) text-(--ink-muted)">
          O Totalmobi usa a <strong>Cloud API oficial da Meta</strong>. Nunca
          automação do WhatsApp Web nem bibliotecas que simulam um telemóvel:
          essas violam os termos da Meta e o número que é banido é o do seu
          negócio, não o nosso. Um canal que pode desaparecer de um dia para o
          outro não é um canal.
        </p>
      </Card>
    </main>
  );
}
