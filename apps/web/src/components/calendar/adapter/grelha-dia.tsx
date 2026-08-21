'use client';

import { useRef, useState } from 'react';

import { cn } from '@totalmobi/ui';

import type { CalendarProps } from './types';

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
 */

const PX_POR_MINUTO = 1.4;

function minutosDoDia(d: Date, timezone: string): number {
  const partes = new Intl.DateTimeFormat('pt-PT', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const h = Number(partes.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(partes.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

function etiquetaHora(minuto: number): string {
  return `${String(Math.floor(minuto / 60)).padStart(2, '0')}:${String(minuto % 60).padStart(2, '0')}`;
}

/** Instante correspondente a um minuto local do dia mostrado. */
function instanteDe(date: string, minuto: number, timezone: string): Date {
  const hh = String(Math.floor(minuto / 60)).padStart(2, '0');
  const mm = String(minuto % 60).padStart(2, '0');

  // Descobrir o desvio do fuso nesse dia comparando o instante interpretado
  // como UTC com o que o fuso mostra. Duas passagens chegam para acertar,
  // mesmo no dia em que o relógio salta.
  let palpite = new Date(`${date}T${hh}:${mm}:00Z`);
  for (let i = 0; i < 2; i += 1) {
    const desvio = minutosDoDia(palpite, timezone) - minuto;
    if (desvio === 0) break;
    palpite = new Date(palpite.getTime() - desvio * 60_000);
  }
  return palpite;
}

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
  const [aArrastar, setAArrastar] = useState<{ id: string; minuto: number; coluna: string | null } | null>(
    null,
  );
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
    if (!aArrastar || !onEventMove) return;

    const minuto = minutoDoRato(clientY);
    const evento = events.find((e) => e.id === aArrastar.id);
    setAArrastar(null);

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
                  onPointerUp={(e) => {
                    void largar(e.clientY, coluna.id === '__sem__' ? null : coluna.id);
                  }}
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

                    return (
                      <button
                        key={evento.id}
                        type="button"
                        onClick={() => onEventClick?.(evento.id)}
                        onPointerDown={(e) => {
                          if (!onEventMove) return;
                          e.currentTarget.releasePointerCapture?.(e.pointerId);
                          setAArrastar({ id: evento.id, minuto: inicio, coluna: evento.resourceId });
                        }}
                        className={cn(
                          'absolute inset-x-1 overflow-hidden rounded-(--radius-sm) border px-2 py-1 text-left text-(length:--text-sm) transition-opacity',
                          evento.active
                            ? 'border-(--line-strong) bg-(--surface)'
                            : 'border-dashed border-(--line) bg-(--surface-sunken) opacity-60',
                          aArrastar?.id === evento.id && 'ring-2 ring-(--brand)',
                          aGuardar === evento.id && 'animate-pulse',
                        )}
                        style={{
                          top: (inicio - range.startMinute) * PX_POR_MINUTO,
                          height: duracao * PX_POR_MINUTO - 2,
                          borderLeft: evento.color ? `3px solid ${evento.color}` : undefined,
                        }}
                        title={`${etiquetaHora(inicio)}–${etiquetaHora(fim)} · ${evento.title}`}
                      >
                        <span className="block truncate font-medium">{evento.title}</span>
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
