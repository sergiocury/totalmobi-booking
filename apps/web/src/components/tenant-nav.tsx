'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@totalmobi/ui';

/**
 * Navegação do painel de uma empresa.
 *
 * Só mostra o que existe. As secções por construir não aparecem cinzentas nem
 * com "em breve": um menu cheio de becos sem saída faz o produto parecer
 * inacabado a quem o está a avaliar. Vão sendo acrescentadas à medida que os
 * milestones fecham.
 */

const SECOES = [
  { href: '', label: 'Resumo' },
  { href: '/servicos', label: 'Serviços' },
  { href: '/equipa', label: 'Equipa' },
  { href: '/agenda', label: 'Agenda' },
  { href: '/relatorios', label: 'Relatórios' },
  { href: '/horarios', label: 'Horários' },
  { href: '/automacoes', label: 'Automações' },
  { href: '/integracoes/whatsapp', label: 'WhatsApp' },
  { href: '/simulador', label: 'Simulador' },
  { href: '/disponibilidade', label: 'Disponibilidade' },
  { href: '/unidades', label: 'Unidades' },
] as const;

export function TenantNav({
  tenantSlug,
  displayName,
  role,
}: {
  tenantSlug: string;
  displayName: string;
  role: string | null;
}) {
  const pathname = usePathname();
  const base = `/app/${tenantSlug}`;

  return (
    <header className="border-b border-(--line) bg-(--surface-sunken)">
      <div className="mx-auto max-w-4xl px-6">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
          <div className="flex min-w-0 items-baseline gap-3">
            <Link
              href={base}
              className="truncate font-semibold tracking-(--tracking-tight)"
            >
              {displayName}
            </Link>
            <span className="text-(length:--text-sm) text-(--ink-subtle)">
              {role ?? 'plataforma'}
            </span>
          </div>
          <Link
            href="/app"
            className="text-(length:--text-sm) text-(--ink-muted) hover:text-(--ink) hover:underline"
          >
            Mudar de empresa
          </Link>
        </div>

        <nav aria-label="Secções da empresa" className="-mb-px flex gap-1 overflow-x-auto">
          {SECOES.map((secao) => {
            const href = `${base}${secao.href}`;
            // O resumo só está ativo em correspondência exata, senão ficaria
            // sempre aceso — é prefixo de todas as outras secções.
            const ativo = secao.href === '' ? pathname === href : pathname.startsWith(href);

            return (
              <Link
                key={secao.href}
                href={href}
                aria-current={ativo ? 'page' : undefined}
                className={cn(
                  'border-b-2 px-3 py-2.5 text-(length:--text-sm) font-medium whitespace-nowrap',
                  'transition-colors duration-(--duration-fast)',
                  ativo
                    ? 'border-(--brand) text-(--ink)'
                    : 'border-transparent text-(--ink-muted) hover:text-(--ink)',
                )}
              >
                {secao.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
