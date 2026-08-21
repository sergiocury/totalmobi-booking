import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-8 px-6 py-16">
      <div className="space-y-4">
        <p className="text-sm font-medium tracking-widest text-(--color-ink-muted) uppercase">
          Totalmobi
        </p>
        <h1 className="text-5xl font-semibold tracking-tight text-balance">Booking</h1>
        <p className="max-w-prose text-lg text-pretty text-(--color-ink-muted)">
          Plataforma de agendamento omnichannel. Milestone 1 — fundação do monorepo e núcleo
          multi-tenant.
        </p>
      </div>

      <nav className="flex flex-wrap gap-3">
        <Link
          href="/status"
          className="rounded-full bg-(--color-brand) px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Verificar ligação
        </Link>
      </nav>

      <p className="text-sm text-(--color-ink-muted)">
        A página pública de marcação chega no Milestone 9; o painel, no Milestone 10.
      </p>
    </main>
  );
}
