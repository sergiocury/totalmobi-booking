'use client';

import { useRef, useState } from 'react';

import { cn } from '@totalmobi/ui';

import { diaLocal, diasDesde, etiquetaHora, instanteDe, minutosDoDia } from '@totalmobi/shared';

import { PX_POR_MINUTO } from './medidas';
import type { CalendarProps } from './types';
import { usarArrasto } from './usar-arrasto';

/**
 * A semana de uma profissional.
 *
 * PORQUE É QUE NÃO SÃO TODAS AO MESMO TEMPO
 *
 * A grelha do dia dá uma coluna a cada profissional. Multiplicar isso por sete
 * dias daria trinta e cinco colunas — a 40 px cada, que é menos do que uma hora
 * escrita. A alternativa, empilhar toda a gente na mesma coluna do dia,
 * transforma a semana numa mancha onde não se distingue quem é quem a partir da
 * terceira pessoa.
 *
 * A pergunta que esta vista responde é outra e é concreta: **"quando é que a
 * Ana tem espaço na quinta?"**. Essa pergunta é sempre sobre uma pessoa. Quem
 * quer o retrato do negócio inteiro tem o dia, onde ele cabe.
 *
 * O QUE MUDA EM RELAÇÃO AO DIA
 *
 * Arrastar passa a mover **no tempo e no dia** ao mesmo tempo: a coluna de
 * destino é uma data, não uma pessoa. A profissional mantém-se — é a mesma em
 * todas as colunas, por isso o `resourceId` do bloco vai como está.
 */
export function GrelhaSemana({
  date,
  timezone,
  events,
  resources,
  range,
  days,
  onEmptyClick,
  onEventClick,
  onEventMove,
}: CalendarProps) {
  const arrasto = usarArrasto<string>();
  const aArrastar = arrasto.ativo;
  const [aGuardar, setAGuardar] = useState<string | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);

  const totalMinutos = range.endMinute - range.startMinute;
  const alturaTotal = totalMinutos * PX_POR_MINUTO;

  const linhas: number[] = [];
  for (let m = range.startMinute; m <= range.endMinute; m += 60) linhas.push(m);

  const colunas = days && days.length > 0 ? days : diasDesde(date, 7);

  // Na semana há uma profissional só. Se a página não escolheu nenhuma, os
  // blocos não ficam sem dono nem desaparecem — desenham-se à mesma, que é
  // melhor do que um ecrã vazio sem explicação.
  const profissional = resources[0] ?? null;
  const hoje = diaLocal(new Date(), timezone);

  function minutoDoRato(clientY: number): number {
    const caixa = areaRef.current?.getBoundingClientRect();
    if (!caixa) return range.startMinute;

    const bruto = range.startMinute + (clientY - caixa.top) / PX_POR_MINUTO;
    const encaixado = Math.round(bruto / range.stepMinutes) * range.stepMinutes;
    return Math.min(Math.max(encaixado, range.startMinute), range.endMinute - range.stepMinutes);
  }

  async function largar(clientY: number, dia: string) {
    // Sem arrasto ativo isto foi um clique — e um clique abre, não move.
    if (!aArrastar || !onEventMove) {
      arrasto.terminar();
      return;
    }

    const minuto = minutoDoRato(clientY);
    const evento = events.find((e) => e.id === aArrastar);
    arrasto.terminar();

    if (!evento) return;

    const mesmoDia = diaLocal(evento.start, timezone) === dia;
    const mesmaHora = minutosDoDia(evento.start, timezone) === minuto;
    if (mesmoDia && mesmaHora) return;

    setAGuardar(evento.id);
    await onEventMove(evento.id, instanteDe(dia, minuto, timezone), evento.resourceId);
    setAGuardar(null);
  }

  // Três letras, não o `weekday: 'short'` do Intl: em pt-PT esse devolve
  // "segunda", que numa coluna de 96 px é cortado a meio e fica igual a
  // "segunda-feira" truncada. "seg" cabe e lê-se.
  const nomeDoDia = (dia: string) =>
    new Intl.DateTimeFormat('pt-PT', { weekday: 'short', timeZone: 'UTC' })
      .format(new Date(`${dia}T12:00:00Z`))
      .replace('.', '')
      .slice(0, 3);

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-fit">
        {/* Régua das horas */}
        <div className="sticky left-0 z-10 w-14 shrink-0 bg-(--surface-sunken)">
          <div className="h-11" />
          <div className="relative" style={{ height: alturaTotal }}>
            {linhas.map((m) => (
              <span
                key={m}
                className="absolute right-2 -translate-y-1/2 text-(length:--text-sm) text-(--ink-subtle)"
                style={{ top: (m - range.startMinute) * PX_POR_MINUTO }}
              >
                {etiquetaHora(m)}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-1">
          {colunas.map((dia) => {
            const doDia = events.filter((e) => diaLocal(e.start, timezone) === dia);
            const eHoje = dia === hoje;

            return (
              <div key={dia} className="min-w-24 flex-1 border-l border-(--line)">
                <div
                  className={cn(
                    'flex h-11 flex-col justify-center border-b border-(--line) px-2',
                    eHoje && 'bg-(--surface-sunken)',
                  )}
                >
                  <span className="truncate text-(length:--text-sm) text-(--ink-muted)">
                    {nomeDoDia(dia)}
                  </span>
                  <span
                    className={cn(
                      'text-(length:--text-sm) tabular-nums',
                      eHoje ? 'font-semibold text-(--brand)' : 'font-medium',
                    )}
                  >
                    {Number(dia.slice(8, 10))}
                  </span>
                </div>

                <div
                  ref={dia === colunas[0] ? areaRef : undefined}
                  className="relative"
                  style={{ height: alturaTotal }}
                  onPointerMove={(e) => arrasto.mover(e)}
                  onPointerUp={(e) => {
                    void largar(e.clientY, dia);
                  }}
                  onPointerLeave={() => arrasto.terminar()}
                  onClick={(e) => {
                    if (aArrastar || !onEmptyClick) return;
                    // Só o fundo cria. Um clique num bloco é para o abrir.
                    if (e.target !== e.currentTarget) return;
                    onEmptyClick(
                      instanteDe(dia, minutoDoRato(e.clientY), timezone),
                      profissional?.id ?? null,
                    );
                  }}
                >
                  {linhas.map((m) => (
                    <div
                      key={m}
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 border-t border-(--line)"
                      style={{ top: (m - range.startMinute) * PX_POR_MINUTO }}
                    />
                  ))}

                  {doDia.map((evento) => {
                    const inicio = minutosDoDia(evento.start, timezone);
                    const fim = minutosDoDia(evento.end, timezone);
                    const duracao = Math.max(fim - inicio, range.stepMinutes);

                    return (
                      <button
                        key={evento.id}
                        type="button"
                        onClick={() => onEventClick?.(evento.id)}
                        onPointerDown={(e) => {
                          if (!onEventMove) return;
                          e.currentTarget.releasePointerCapture?.(e.pointerId);
                          // Ainda não é um arrasto: só passa a sê-lo se o rato
                          // andar. Ver `usarArrasto`.
                          arrasto.comecar(e, evento.id);
                        }}
                        className={cn(
                          'absolute inset-x-0.5 overflow-hidden rounded-(--radius-sm) border px-1.5 py-0.5 text-left text-(length:--text-sm) transition-opacity',
                          evento.active
                            ? 'border-(--line-strong) bg-(--surface)'
                            : 'border-dashed border-(--line) bg-(--surface-sunken) opacity-60',
                          aArrastar === evento.id && 'ring-2 ring-(--brand)',
                          aGuardar === evento.id && 'animate-pulse',
                        )}
                        style={{
                          top: (inicio - range.startMinute) * PX_POR_MINUTO,
                          height: duracao * PX_POR_MINUTO - 2,
                          borderLeft: evento.color ? `3px solid ${evento.color}` : undefined,
                        }}
                        // A coluna é estreita e o texto é cortado quase sempre.
                        // O `title` devolve a informação completa sem obrigar a
                        // abrir a marcação.
                        title={`${etiquetaHora(inicio)}–${etiquetaHora(fim)} · ${evento.title}${evento.subtitle ? ` · ${evento.subtitle}` : ''}`}
                      >
                        <span className="block truncate tabular-nums text-(--ink-muted)">
                          {etiquetaHora(inicio)}
                        </span>
                        <span className="block truncate font-medium">{evento.title}</span>
                        {duracao >= 45 && evento.subtitle ? (
                          <span className="block truncate text-(--ink-muted)">
                            {evento.subtitle}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
