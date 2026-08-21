import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from './cn';

/**
 * Superfícies e estados vazios.
 *
 * Os três estados — carregar, vazio, erro — são componentes de primeira classe
 * e não uma reflexão tardia. É requisito da definição de "concluído" de cada
 * milestone, e é o que separa um produto de um protótipo: a diferença entre
 * "ainda não tem clientes" e um ecrã em branco que parece avariado.
 */

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-(--radius-lg) border border-(--line) bg-(--surface-raised)',
        className,
      )}
      {...props}
    />
  );
}

/** Cartão clicável: usar com `asChild` num `<Link>`, nunca com `onClick` numa `div`. */
export function InteractiveCard({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-(--radius-lg) border border-(--line) bg-(--surface-raised)',
        'transition-colors duration-(--duration-fast) ease-(--ease-out-soft)',
        'hover:border-(--line-strong) hover:bg-(--surface-sunken)',
        className,
      )}
      {...props}
    />
  );
}

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-(--surface-sunken) text-(--ink-muted) border-(--line)',
  brand: 'bg-(--brand-soft) text-(--brand) border-transparent',
  success: 'bg-(--success-soft) text-(--success) border-transparent',
  warning: 'bg-(--warning-soft) text-(--warning) border-transparent',
  danger: 'bg-(--danger-soft) text-(--danger) border-transparent',
};

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-(--radius-full) border px-2.5 py-0.5',
        'text-(length:--text-xs) font-medium whitespace-nowrap',
        BADGE_TONES[tone],
        className,
      )}
      {...props}
    />
  );
}

export interface EmptyStateProps {
  title: string;
  description?: string | undefined;
  /** Sempre que possível, um estado vazio deve oferecer o passo seguinte. */
  action?: ReactNode | undefined;
  icon?: ReactNode | undefined;
}

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div className="rounded-(--radius-lg) border border-dashed border-(--line-strong) px-6 py-14 text-center">
      {icon ? <div className="mb-4 flex justify-center text-(--ink-subtle)">{icon}</div> : null}
      <h3 className="text-(length:--text-lg) font-medium text-(--ink)">{title}</h3>
      {description ? (
        <p className="mx-auto mt-2 max-w-sm text-pretty text-(--ink-muted)">{description}</p>
      ) : null}
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}

export interface ErrorStateProps {
  title?: string | undefined;
  description?: string | undefined;
  action?: ReactNode | undefined;
}

export function ErrorState({
  title = 'Algo correu mal',
  description = 'Não foi possível carregar esta informação. Tente novamente daqui a pouco.',
  action,
}: ErrorStateProps) {
  return (
    <div
      // `role="alert"` porque um erro tem de ser anunciado, não descoberto.
      role="alert"
      className="rounded-(--radius-lg) border border-(--danger) bg-(--danger-soft) px-6 py-8 text-center"
    >
      <h3 className="text-(length:--text-lg) font-medium text-(--ink)">{title}</h3>
      <p className="mx-auto mt-2 max-w-sm text-pretty text-(--ink-muted)">{description}</p>
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}

/**
 * Esqueleto de carregamento.
 *
 * `aria-hidden` de propósito: um leitor de ecrã não deve anunciar formas. Quem
 * comunica o carregamento é o `aria-busy` da região que o contém.
 */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-(--radius-sm) bg-(--surface-sunken)', className)}
      {...props}
    />
  );
}

/** Cabeçalho de página: título, descrição e ações, com espaçamento consistente. */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  // O ` | undefined` explícito é obrigatório com `exactOptionalPropertyTypes`:
  // sem ele, passar uma expressão que possa dar `undefined` não compila, e o
  // chamador acaba a escrever ternários só para satisfazer o tipo.
  description?: string | undefined;
  actions?: ReactNode | undefined;
  eyebrow?: string | undefined;
}) {
  return (
    <header className="mb-10 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-2 text-(length:--text-xs) font-medium tracking-[0.14em] text-(--ink-subtle) uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-(length:--text-3xl) leading-(--leading-tight) font-semibold tracking-(--tracking-tight) text-balance text-(--ink)">
          {title}
        </h1>
        {description ? (
          <p className="mt-2.5 max-w-prose text-pretty text-(--ink-muted)">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-3">{actions}</div> : null}
    </header>
  );
}
