import Link from 'next/link';

import { createServiceClient } from '@totalmobi/database/server';
import { PageHeader } from '@totalmobi/ui';

import { NewTenantForm } from './form';

export const metadata = { title: 'Nova empresa' };
export const dynamic = 'force-dynamic';

export default async function NewTenantPage() {
  const client = createServiceClient();
  const { data: plans } = await client
    .from('plans')
    .select('code, name, monthly_price, currency')
    .order('sort_order');

  return (
    <main className="mx-auto max-w-xl px-6 py-12 sm:py-16">
      <Link href="/console" className="text-(length:--text-sm) text-(--ink-muted) hover:underline">
        ← Empresas
      </Link>

      <div className="mt-6">
        <PageHeader
          title="Nova empresa"
          description="Nasce em período de teste. O identificador entra no URL público e não se muda depois sem partir as ligações já partilhadas."
        />
      </div>

      <NewTenantForm plans={plans ?? []} />
    </main>
  );
}
