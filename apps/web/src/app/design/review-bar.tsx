'use client';

import { useState, type ReactNode } from 'react';

import { ThemeToggle, cn } from '@totalmobi/ui';

/**
 * Barra de revisão da página /design.
 *
 * Existe para não obrigar ninguém a mexer nas definições do Windows nem a
 * abrir as ferramentas de programador só para ver o produto noutro tema ou
 * noutra largura. Foi um pedido concreto: no computador do Sérgio, o `F12`
 * está tomado pela captura de ecrã e o `Ctrl+Shift+P` abre a impressora.
 *
 * A largura é aplicada a um contentor, não à janela. Não substitui um teste
 * real em telemóvel — media queries baseadas em `viewport` continuam a ler a
 * janela toda — mas mostra como os componentes se comportam quando o espaço
 * aperta, que é o que interessa numa revisão de design.
 */

const LARGURAS = [
  { value: 0, label: 'Total', hint: 'largura da página' },
  { value: 375, label: '375', hint: 'telemóvel' },
  { value: 768, label: '768', hint: 'tablet' },
  { value: 1024, label: '1024', hint: 'portátil' },
] as const;

export function ReviewBar({ children }: { children: ReactNode }) {
  const [width, setWidth] = useState<number>(0);

  return (
    <>
      <div className="sticky top-0 z-40 -mx-6 mb-10 border-b border-(--line) bg-(--surface)/85 px-6 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ThemeToggle />

          <fieldset className="inline-flex items-center gap-0.5 rounded-(--radius-full) border border-(--line) bg-(--surface-sunken) p-0.5">
            <legend className="sr-only">Largura de pré-visualização</legend>
            {LARGURAS.map((item) => {
              const active = width === item.value;
              return (
                <label
                  key={item.value}
                  title={item.hint}
                  className={cn(
                    'inline-flex cursor-pointer items-center rounded-(--radius-full) px-3 py-1.5',
                    'text-(length:--text-sm) font-medium whitespace-nowrap',
                    'transition-colors duration-(--duration-fast)',
                    'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-(--focus-ring)',
                    active
                      ? 'bg-(--surface) text-(--ink) shadow-(--shadow-sm)'
                      : 'text-(--ink-muted) hover:text-(--ink)',
                  )}
                >
                  <input
                    type="radio"
                    name="largura"
                    value={item.value}
                    checked={active}
                    onChange={() => setWidth(item.value)}
                    className="sr-only"
                  />
                  {item.label}
                  <span className="sr-only"> — {item.hint}</span>
                </label>
              );
            })}
          </fieldset>
        </div>
      </div>

      <div
        className={cn('mx-auto transition-[max-width] duration-(--duration-base)', width > 0 && 'border-x border-dashed border-(--line-strong) px-4')}
        style={width > 0 ? { maxWidth: `${width}px` } : undefined}
      >
        {width > 0 ? (
          <p className="mb-6 text-center text-(length:--text-xs) text-(--ink-subtle)">
            Pré-visualização a {width} px
          </p>
        ) : null}
        {children}
      </div>
    </>
  );
}
