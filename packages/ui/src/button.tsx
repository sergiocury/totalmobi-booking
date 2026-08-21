import { Slot } from '@radix-ui/react-slot';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from './cn';

/**
 * Botão.
 *
 * `asChild` permite pintar um `<Link>` como botão sem aninhar um `<a>` dentro
 * de um `<button>` — que é HTML inválido e confunde leitores de ecrã, além de
 * partir a navegação por teclado.
 *
 * Todas as variantes têm ≥ 44 px de altura efetiva nos tamanhos `md` e `lg`,
 * que é o alvo tátil mínimo recomendado. O `sm` fica abaixo e por isso está
 * reservado a ações secundárias em barras de ferramentas, nunca a ações
 * primárias.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  // A cor da marca do tenant, com o texto calculado para contrastar com ela.
  primary:
    'bg-(--brand) text-(--brand-ink) hover:bg-(--brand-hover) active:scale-[0.985] shadow-(--shadow-sm)',
  secondary:
    'bg-(--surface) text-(--ink) border border-(--line-strong) hover:bg-(--surface-sunken) active:scale-[0.985]',
  ghost: 'text-(--ink-muted) hover:bg-(--surface-sunken) hover:text-(--ink)',
  // `text-white` aqui dava 2,79:1 no modo escuro, onde o --danger é claro.
  // A cor do texto tem de vir de um token que acompanha o modo.
  danger: 'bg-(--danger) text-(--danger-ink) hover:brightness-110 active:scale-[0.985]',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-(length:--text-sm) gap-1.5',
  md: 'h-11 px-5 text-(length:--text-base) gap-2',
  lg: 'h-13 px-7 text-(length:--text-lg) gap-2.5',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
  loading?: boolean;
  children?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  asChild = false,
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot : 'button';

  const classes = cn(
    'inline-flex items-center justify-center rounded-(--radius-full) font-medium whitespace-nowrap',
    'transition-[background-color,transform,opacity] duration-(--duration-fast) ease-(--ease-out-soft)',
    'disabled:pointer-events-none disabled:opacity-45',
    VARIANTS[variant],
    SIZES[size],
    className,
  );

  // Com `asChild`, o `Slot` do Radix exige **exatamente um** filho — e
  // `{loading ? <Spinner/> : null}{children}` são dois, mesmo quando o primeiro
  // é `null`. Rebentava com "Slot failed to slot onto its children", em tempo
  // de execução e só nas páginas que usassem `asChild`.
  //
  // Um botão que embrulha um `<Link>` também não tem estado de carregamento
  // para mostrar: a navegação é do router, não uma ação nossa. Por isso o
  // caminho `asChild` passa a criança tal e qual.
  if (asChild) {
    return (
      <Component className={classes} {...props}>
        {children}
      </Component>
    );
  }

  return (
    <button
      // `aria-busy` diz a um leitor de ecrã que a ação está em curso. Sem isto,
      // quem não vê o texto mudar não percebe que já clicou.
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={classes}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-4 shrink-0 animate-spin"
      fill="none"
    >
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path
        d="M14.5 8A6.5 6.5 0 0 0 8 1.5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
