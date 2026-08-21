import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

import { cn } from './cn';

/**
 * Campo de formulário: etiqueta, input, ajuda e erro, ligados como devem ser.
 *
 * Existe como um componente só, e não como `<Label>` + `<Input>` soltos, porque
 * a ligação entre eles é a parte que se esquece. Um input sem `id` associado à
 * etiqueta é invisível para um leitor de ecrã, e uma mensagem de erro sem
 * `aria-describedby` nunca é lida — o utilizador ouve "campo inválido" e não
 * sabe porquê.
 *
 * Aqui os `id` são gerados e ligados automaticamente. Não há como esquecer.
 */

export interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  /** Esconde a etiqueta visualmente, mantendo-a para leitores de ecrã. */
  hideLabel?: boolean | undefined;
  trailing?: ReactNode | undefined;
}

export function Field({
  label,
  hint,
  error,
  hideLabel = false,
  trailing,
  className,
  required,
  ...props
}: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div className="w-full">
      <label
        htmlFor={id}
        className={cn(
          'mb-1.5 block text-(length:--text-sm) font-medium text-(--ink)',
          hideLabel && 'sr-only',
        )}
      >
        {label}
        {required ? (
          <span className="ml-0.5 text-(--danger)" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>

      <div className="relative">
        <input
          id={id}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={cn(
            'w-full rounded-(--radius-sm) border bg-(--surface) px-3.5 py-2.5',
            'text-(length:--text-base) text-(--ink) placeholder:text-(--ink-subtle)',
            'transition-colors duration-(--duration-fast)',
            'disabled:cursor-not-allowed disabled:opacity-55',
            error
              ? 'border-(--danger) focus-visible:outline-(--danger)'
              : 'border-(--line-strong) hover:border-(--ink-subtle)',
            trailing && 'pr-11',
            className,
          )}
          {...props}
        />
        {trailing ? (
          <div className="absolute inset-y-0 right-3 flex items-center text-(--ink-subtle)">
            {trailing}
          </div>
        ) : null}
      </div>

      {hint && !error ? (
        <p id={hintId} className="mt-1.5 text-(length:--text-sm) text-(--ink-muted)">
          {hint}
        </p>
      ) : null}

      {error ? (
        // `role="alert"` faz o leitor de ecrã anunciar o erro assim que aparece,
        // em vez de o utilizador ter de o procurar.
        <p id={errorId} role="alert" className="mt-1.5 text-(length:--text-sm) text-(--danger)">
          {error}
        </p>
      ) : null}
    </div>
  );
}
