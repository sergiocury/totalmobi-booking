'use client';

import { cn } from '@totalmobi/ui';

import type { CalendarProps } from './types';

/**
 * A agenda de telemóvel.
 *
 * **Não é a grelha do desktop encolhida.** Cinco colunas de profissionais num
 * ecrã de 375 px dão colunas de 60 px, onde não cabe um nome nem uma hora — e o
 * resultado é um calendário que se vê com dois dedos a fazer zoom, que é o
 * mesmo que dizer um calendário que não se usa.
 *
 * Em vez disso: uma lista vertical por hora, com o profissional escrito dentro
 * de cada bloco em vez de implícito na coluna. A informação é a mesma; a forma
 * é a que cabe.
 *
 * Também não há arrasto. Arrastar num ecrã tátil compete com o scroll, e uma
 * marcação movida por engano com o polegar é pior do que um toque a mais.
 */
export function AgendaVertical({ timezone, events, onEventClick }: CalendarProps) {
  const ordenados = [...events].sort((a, b) => a.start.getTime() - b.start.getTime());

  if (ordenados.length === 0) {
    return (
      <p className="py-10 text-center text-(length:--text-sm) text-(--ink-muted)">
        Nada marcado neste dia.
      </p>
    );
  }

  const hora = (d: Date) =>
    new Intl.DateTimeFormat('pt-PT', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d);

  return (
    <ul className="divide-y divide-(--line)">
      {ordenados.map((evento) => (
        <li key={evento.id}>
          <button
            type="button"
            onClick={() => onEventClick?.(evento.id)}
            className={cn(
              'flex min-h-14 w-full items-start gap-3 px-1 py-3 text-left',
              !evento.active && 'opacity-60',
            )}
          >
            <span className="w-12 shrink-0 pt-0.5 text-(length:--text-sm) tabular-nums text-(--ink-muted)">
              {hora(evento.start)}
            </span>

            <span
              aria-hidden
              className="mt-1 h-8 w-1 shrink-0 rounded-full"
              style={{ background: evento.color ?? 'var(--line-strong)' }}
            />

            <span className="min-w-0 flex-1">
              <span className={cn('block truncate font-medium', !evento.active && 'line-through')}>
                {evento.title}
              </span>
              {evento.subtitle ? (
                <span className="block truncate text-(length:--text-sm) text-(--ink-muted)">
                  {evento.subtitle}
                </span>
              ) : null}
              <span className="block text-(length:--text-sm) text-(--ink-subtle)">
                até {hora(evento.end)}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
