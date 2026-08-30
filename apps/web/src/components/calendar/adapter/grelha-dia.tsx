'use client';

import { useRef, useState } from 'react';

import { cn } from '@totalmobi/ui';

import { etiquetaHora, instanteDe, minutosDoDia } from '@totalmobi/shared';

import { PX_POR_MINUTO } from './medidas';
import type { CalendarProps } from './types';
import { estadoVisual } from './estado-visual';
import { usarArrasto } from './usar-arrasto';

/**
 * A grelha do dia, com uma coluna por profissional.
 *
 * Escrita de raiz em vez de comprada. O raciocínio está em `ARCHITECTURE.md`;
 * em duas linhas: esta vista é Premium no FullCalendar (480 USD por
 * programador, por ano) e é a única do produto que o Standard não cobre —
 * pagar uma licença anual por uma grelha de CSS que se escreve numa tarde não
 * se justificava.
 *
 * COMO É QUE UM BLOCO SABE ONDE FICAR
 *
 * Não há posicionamento por linha de tabela. Cada bloco é absoluto dentro da
 * coluna, com `top` e `height` calculados a partir dos minutos. É o que permite
 * uma consulta das 10:07 às 10:52 aparecer exatamente aí, em vez de ser
 * arredondada ao slot mais próximo — e marcações com horas partidas existem,
 * porque a agenda também se enche à mão.
 *
 * O ARRASTO REVERTE
 *
 * `onEventMove` devolve uma promessa de booleano. Enquanto ela não resolve, o
 * bloco fica onde o rato o largou; se vier `false`, salta para trás. Isto não é
 * cosmético: a base de dados é a autoridade, e ela pode recusar — outra pessoa
 * pode ter marcado ali nos segundos em que este ecrã esteve a olhar para uma
 * fotografia antiga.
 *
 * As contas de fuso horário vivem em `tempo.ts`, partilhadas com a grelha da
 * semana. Duas cópias da mesma correção de horário de verão seria uma cópia a
 * mais.
 */

export function GrelhaDia({
  date,
  timezone,
  events,
  resources,
  range,
  onEmptyClick,
  onEventClick,
  onEventMove,
}: CalendarProps) {
  const arrasto = usarArrasto<{ id: string; minuto: number; coluna: string | null }>();
  const aArrastar = arrasto.ativo;
  const [aGuardar, setAGuardar] = useState<string | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);

  const totalMinutos = range.endMinute - range.startMinute;
  const alturaTotal = totalMinutos * PX_POR_MINUTO;

  const linhas: number[] = [];
  for (let m = range.startMinute; m <= range.endMinute; m += 60) linhas.push(m);

  const colunas = resources.length > 0 ? resources : [{ id: '__sem__', title: 'Agenda' }];

  function minutoDoRato(clientY: number): number {
    const caixa = areaRef.current?.getBoundingClientRect();
    if (!caixa) return range.startMinute;

    const bruto = range.startMinute + (clientY - caixa.top) / PX_POR_MINUTO;
    // Encaixe na grelha: ninguém quer uma consulta às 10:03.
    const encaixado = Math.round(bruto / range.stepMinutes) * range.stepMinutes;
    return Math.min(Math.max(encaixado, range.startMinute), range.endMinute - range.stepMinutes);
  }

  async function largar(clientY: number, colunaId: string | null) {
    // Sem arrasto ativo isto foi um clique — e um clique abre, não move.
    if (!aArrastar || !onEventMove) {
      arrasto.terminar();
      return;
    }

    const minuto = minutoDoRato(clientY);
    const evento = events.find((e) => e.id === aArrastar.id);
    arrasto.terminar();

    if (!evento) return;

    const inicioAtual = minutosDoDia(evento.start, timezone);
    if (minuto === inicioAtual && colunaId === evento.resourceId) return;

    setAGuardar(evento.id);
    await onEventMove(evento.id, instanteDe(date, minuto, timezone), colunaId);
    setAGuardar(null);
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-fit">
        {/* Régua das horas */}
        <div className="sticky left-0 z-10 w-14 shrink-0 bg-(--surface-sunken)">
          <div className="h-9" />
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
          {colunas.map((coluna) => {
            const doProfissional = events.filter((e) =>
              coluna.id === '__sem__' ? true : e.resourceId === coluna.id,
            );

            return (
              <div key={coluna.id} className="min-w-40 flex-1 border-l border-(--line)">
                <div className="flex h-9 items-center gap-2 border-b border-(--line) px-2">
                  {coluna.color ? (
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: coluna.color }}
                    />
                  ) : null}
                  <span className="truncate text-(length:--text-sm) font-medium">
                    {coluna.title}
                  </span>
                </div>

                <div
                  ref={coluna.id === colunas[0]!.id ? areaRef : undefined}
                  className="relative"
                  style={{ height: alturaTotal }}
                  onPointerMove={(e) => arrasto.mover(e)}
                  onPointerUp={(e) => {
                    void largar(e.clientY, coluna.id === '__sem__' ? null : coluna.id);
                  }}
                  onPointerLeave={() => arrasto.terminar()}
                  onClick={(e) => {
                    if (aArrastar || !onEmptyClick) return;
                    // Só o fundo cria. Um clique num bloco é para o abrir.
                    if (e.target !== e.currentTarget) return;
                    onEmptyClick(
                      instanteDe(date, minutoDoRato(e.clientY), timezone),
                      coluna.id === '__sem__' ? null : coluna.id,
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

                  {doProfissional.map((evento) => {
                    const inicio = minutosDoDia(evento.start, timezone);
                    const fim = minutosDoDia(evento.end, timezone);
                    const duracao = Math.max(fim - inicio, range.stepMinutes);
                    const estado = estadoVisual(evento.status, evento.active);

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
                          arrasto.comecar(e, {
                            id: evento.id,
                            minuto: inicio,
                            coluna: evento.resourceId,
                          });
                        }}
                        className={cn(
                          'absolute inset-x-1 overflow-hidden rounded-(--radius-sm) border px-2 py-1 text-left text-(length:--text-sm) transition-opacity',
                          estado.classes,
                          aArrastar?.id === evento.id && 'ring-2 ring-(--brand)',
                          aGuardar === evento.id && 'animate-pulse',
                        )}
                        style={{
                          top: (inicio - range.startMinute) * PX_POR_MINUTO,
                          height: duracao * PX_POR_MINUTO - 2,
                          borderLeft: evento.color ? `3px solid ${evento.color}` : undefined,
                        }}
                        title={`${etiquetaHora(inicio)}–${etiquetaHora(fim)} · ${evento.title} · ${estado.etiqueta}`}
                      >
                        <span className="block truncate font-medium">
                          {estado.marca}
                          {evento.title}
                        </span>
                        {duracao >= 30 && evento.subtitle ? (
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
