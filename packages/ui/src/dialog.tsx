'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

import { cn } from './cn';

/**
 * Diálogo modal.
 *
 * Assenta nas primitivas do Radix e não em `<dialog>` cru nem numa `div` com
 * `position: fixed`. O que o Radix trata e que quase sempre se faz mal à mão:
 * prender o foco dentro do diálogo, devolvê-lo ao elemento que o abriu,
 * fechar no `Esc`, marcar o resto da página como inerte para leitores de ecrã,
 * e impedir o `scroll` por baixo.
 *
 * O `Title` é obrigatório na API do Radix. Se um diálogo não devesse ter título
 * visível, usa-se `VisuallyHidden` — nunca se omite, senão fica um modal que
 * um leitor de ecrã anuncia sem dizer do que se trata.
 */

export const DialogRoot = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

export interface DialogProps {
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function DialogContent({ title, description, children, footer, className }: DialogProps) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay
        className={cn(
          'fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px]',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
        )}
      />
      <RadixDialog.Content
        className={cn(
          'fixed z-50 flex flex-col gap-5 bg-(--surface-overlay) shadow-(--shadow-lg)',
          // Em mobile sobe do fundo e ocupa a largura toda; em desktop é uma
          // caixa centrada. São dois gestos diferentes porque são dois
          // contextos diferentes — não é o mesmo modal encolhido.
          'inset-x-0 bottom-0 rounded-t-(--radius-xl) p-6',
          'sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-md',
          'sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-(--radius-xl) sm:p-7',
          className,
        )}
      >
        <div>
          <RadixDialog.Title className="text-(length:--text-xl) leading-(--leading-snug) font-semibold tracking-(--tracking-tight) text-(--ink)">
            {title}
          </RadixDialog.Title>
          {description ? (
            <RadixDialog.Description className="mt-2 text-pretty text-(--ink-muted)">
              {description}
            </RadixDialog.Description>
          ) : null}
        </div>

        {children}

        {footer ? <div className="flex flex-wrap justify-end gap-3">{footer}</div> : null}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
