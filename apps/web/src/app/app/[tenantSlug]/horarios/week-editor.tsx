'use client';

import { useState, useTransition } from 'react';

import { WEEKDAY_LABELS } from '@totalmobi/shared';
import { Button, Card, cn } from '@totalmobi/ui';

export interface Periodo {
  startsAt: string;
  endsAt: string;
}

export interface DiaSemana {
  weekday: number;
  periods: Periodo[];
}

/**
 * Editor de horário semanal.
 *
 * TRÊS DECISÕES DE INTERFACE
 *
 * 1. **Vários períodos por dia são de primeira classe**, não uma opção
 *    escondida. O fecho para almoço é o caso mais comum de todos — um editor
 *    com um só par de horas por dia não serve para metade dos negócios.
 *
 * 2. **"Copiar para os outros dias" existe porque ninguém quer escrever sete
 *    vezes o mesmo.** É a diferença entre configurar em dois minutos ou em
 *    dez, e dez minutos de digitação repetitiva é onde as pessoas desistem.
 *
 * 3. **A ordem começa na segunda-feira**, não no domingo. Os dados usam
 *    `0 = domingo` para bater com o `EXTRACT(DOW)` do PostgreSQL, mas ninguém
 *    pensa na semana assim.
 */

const ORDEM_VISUAL = [1, 2, 3, 4, 5, 6, 0];

const PADRAO: Periodo = { startsAt: '09:00', endsAt: '18:00' };

export function WeekEditor({
  initial,
  onSave,
  saveLabel = 'Guardar horário',
  hint,
}: {
  initial: DiaSemana[];
  onSave: (dias: DiaSemana[]) => Promise<{ error?: string; ok?: boolean }>;
  saveLabel?: string;
  hint?: string;
}) {
  const [dias, setDias] = useState<DiaSemana[]>(() => {
    const porDia = new Map(initial.map((d) => [d.weekday, d.periods]));
    return ORDEM_VISUAL.map((weekday) => ({
      weekday,
      periods: (porDia.get(weekday) ?? []).map((p) => ({ ...p })),
    }));
  });

  const [erro, setErro] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [aGuardar, startTransition] = useTransition();

  function mexer(fn: (atual: DiaSemana[]) => DiaSemana[]) {
    setErro(null);
    setGuardado(false);
    setDias(fn);
  }

  function acrescentar(weekday: number) {
    mexer((atual) =>
      atual.map((d) => {
        if (d.weekday !== weekday) return d;
        const ultimo = d.periods[d.periods.length - 1];
        // Um segundo período começa uma hora depois do fim do anterior — o
        // almoço típico. Poupa dois campos ao caso mais comum.
        const novo: Periodo = ultimo
          ? { startsAt: somarHora(ultimo.endsAt, 1), endsAt: somarHora(ultimo.endsAt, 5) }
          : { ...PADRAO };
        return { ...d, periods: [...d.periods, novo] };
      }),
    );
  }

  function remover(weekday: number, indice: number) {
    mexer((atual) =>
      atual.map((d) =>
        d.weekday === weekday ? { ...d, periods: d.periods.filter((_, i) => i !== indice) } : d,
      ),
    );
  }

  function alterar(weekday: number, indice: number, campo: keyof Periodo, valor: string) {
    mexer((atual) =>
      atual.map((d) =>
        d.weekday === weekday
          ? {
              ...d,
              periods: d.periods.map((p, i) => (i === indice ? { ...p, [campo]: valor } : p)),
            }
          : d,
      ),
    );
  }

  function copiarParaDiasUteis(weekday: number) {
    const origem = dias.find((d) => d.weekday === weekday)?.periods ?? [];
    mexer((atual) =>
      atual.map((d) =>
        d.weekday >= 1 && d.weekday <= 5
          ? { ...d, periods: origem.map((p) => ({ ...p })) }
          : d,
      ),
    );
  }

  function guardar() {
    setErro(null);
    startTransition(async () => {
      const r = await onSave(dias);
      if (r.error) setErro(r.error);
      else setGuardado(true);
    });
  }

  const totalPeriodos = dias.reduce((s, d) => s + d.periods.length, 0);

  return (
    <div>
      {hint ? (
        <p className="mb-5 max-w-prose text-(length:--text-sm) text-pretty text-(--ink-muted)">
          {hint}
        </p>
      ) : null}

      <Card className="divide-y divide-(--line)">
        {dias.map((dia) => (
          <div key={dia.weekday} className="flex flex-wrap items-start gap-x-4 gap-y-3 px-5 py-4">
            <div className="w-24 shrink-0 pt-2">
              <span className="font-medium">{WEEKDAY_LABELS[dia.weekday]}</span>
            </div>

            <div className="min-w-0 flex-1 space-y-2">
              {dia.periods.length === 0 ? (
                <p className="py-2 text-(length:--text-sm) text-(--ink-subtle)">Fechado</p>
              ) : (
                dia.periods.map((periodo, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <input
                      type="time"
                      value={periodo.startsAt}
                      onChange={(e) => alterar(dia.weekday, i, 'startsAt', e.target.value)}
                      aria-label={`Início do período ${i + 1} de ${WEEKDAY_LABELS[dia.weekday]}`}
                      className="rounded-(--radius-sm) border border-(--line-strong) bg-(--surface) px-2.5 py-1.5 text-(length:--text-sm)"
                    />
                    <span aria-hidden className="text-(--ink-subtle)">
                      –
                    </span>
                    <input
                      type="time"
                      value={periodo.endsAt}
                      onChange={(e) => alterar(dia.weekday, i, 'endsAt', e.target.value)}
                      aria-label={`Fim do período ${i + 1} de ${WEEKDAY_LABELS[dia.weekday]}`}
                      className="rounded-(--radius-sm) border border-(--line-strong) bg-(--surface) px-2.5 py-1.5 text-(length:--text-sm)"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => remover(dia.weekday, i)}
                      aria-label={`Remover o período ${periodo.startsAt}–${periodo.endsAt} de ${WEEKDAY_LABELS[dia.weekday]}`}
                    >
                      Remover
                    </Button>
                  </div>
                ))
              )}
            </div>

            <div className="flex shrink-0 flex-wrap gap-1">
              <Button size="sm" variant="ghost" onClick={() => acrescentar(dia.weekday)}>
                + Período
              </Button>
              {dia.periods.length > 0 && dia.weekday >= 1 && dia.weekday <= 5 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copiarParaDiasUteis(dia.weekday)}
                  title="Aplicar este horário de segunda a sexta"
                >
                  Copiar p/ úteis
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </Card>

      {erro ? (
        <p role="alert" className="mt-4 text-(length:--text-sm) text-(--danger)">
          {erro}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <Button onClick={guardar} loading={aGuardar}>
          {saveLabel}
        </Button>
        <span
          className={cn(
            'text-(length:--text-sm)',
            guardado ? 'text-(--success)' : 'text-(--ink-subtle)',
          )}
          role={guardado ? 'status' : undefined}
        >
          {guardado
            ? 'Guardado.'
            : `${totalPeriodos} ${totalPeriodos === 1 ? 'período' : 'períodos'} na semana`}
        </span>
      </div>
    </div>
  );
}

/** Soma horas a `HH:mm`, sem passar da meia-noite. */
function somarHora(hora: string, horas: number): string {
  const [h, m] = hora.split(':').map(Number);
  const total = Math.min((h ?? 0) + horas, 23);
  return `${String(total).padStart(2, '0')}:${String(m ?? 0).padStart(2, '0')}`;
}
