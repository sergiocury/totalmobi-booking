'use client';

import { useState } from 'react';

import { Card } from '@totalmobi/ui';

import {
  CalendarAdapter,
  type CalendarEvent,
  type CalendarView,
} from '@/components/calendar/adapter';
import { diasDesde, segundaFeiraDe } from '@/components/calendar/adapter/tempo';

/**
 * As duas vistas do calendário, com dados falsos.
 *
 * Está aqui pela mesma razão que o resto desta página: as grelhas são
 * componentes de produto e a única forma de as ver era entrar no painel de um
 * tenant com sessão iniciada. Uma vista que só se revê a partir de dados reais
 * é uma vista que ninguém revê.
 *
 * Os dados são inventados de propósito e cobrem os casos que costumam partir o
 * desenho: uma marcação de 15 minutos (o bloco mais pequeno que existe), uma
 * que atravessa a hora de almoço, uma cancelada — que se desenha esbatida e
 * tracejada — e um dia inteiro sem nada.
 */

const SEMANA = segundaFeiraDe(new Date().toISOString().slice(0, 10));
const DIAS = diasDesde(SEMANA, 7);

/** Instante local simplificado: esta página corre sempre no fuso de Lisboa. */
function em(dia: string, hora: number, minuto = 0): Date {
  return new Date(`${dia}T${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}:00`);
}

const EVENTOS: CalendarEvent[] = [
  {
    id: '1',
    start: em(DIAS[0]!, 9),
    end: em(DIAS[0]!, 9, 45),
    title: 'Marta Silva',
    subtitle: 'Limpeza dentária',
    resourceId: 'ana',
    color: '#0e7a84',
    status: 'confirmed',
    active: true,
  },
  {
    id: '2',
    start: em(DIAS[0]!, 11, 30),
    end: em(DIAS[0]!, 11, 45),
    title: 'João Pires',
    subtitle: 'Consulta rápida',
    resourceId: 'ana',
    color: '#0e7a84',
    status: 'pending',
    active: true,
  },
  {
    id: '3',
    start: em(DIAS[1]!, 12, 30),
    end: em(DIAS[1]!, 14),
    title: 'Rita Gomes',
    subtitle: 'Destartarização',
    resourceId: 'ana',
    color: '#b4530a',
    status: 'confirmed',
    active: true,
  },
  {
    id: '4',
    start: em(DIAS[2]!, 10),
    end: em(DIAS[2]!, 11),
    title: 'Carlos Nunes',
    subtitle: 'Cancelada pelo cliente',
    resourceId: 'ana',
    color: '#0e7a84',
    status: 'cancelled_customer',
    active: false,
  },
  {
    id: '5',
    start: em(DIAS[4]!, 16),
    end: em(DIAS[4]!, 17),
    title: 'Inês Faria',
    subtitle: 'Branqueamento',
    resourceId: 'ana',
    color: '#0e7a84',
    status: 'confirmed',
    active: true,
  },
  {
    id: '6',
    start: em(DIAS[0]!, 10),
    end: em(DIAS[0]!, 11),
    title: 'Pedro Lima',
    subtitle: 'Ortodontia',
    resourceId: 'joao',
    color: '#7c3aed',
    status: 'confirmed',
    active: true,
  },
];

const EQUIPA = [
  { id: 'ana', title: 'Ana Martins', color: '#0e7a84' },
  { id: 'joao', title: 'João Costa', color: '#7c3aed' },
];

export function CalendarioDemo() {
  const [vista, setVista] = useState<CalendarView>('semana');

  const eventos = vista === 'semana' ? EVENTOS.filter((e) => e.resourceId === 'ana') : EVENTOS;
  const colunas = vista === 'semana' ? [EQUIPA[0]!] : EQUIPA;

  return (
    <div>
      <div
        className="mb-4 flex w-fit overflow-hidden rounded-(--radius-sm) border border-(--line)"
        role="group"
        aria-label="Vista do calendário"
      >
        {(['dia', 'semana'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setVista(v)}
            aria-pressed={vista === v}
            className={
              vista === v
                ? 'flex min-h-11 items-center bg-(--brand) px-3 text-(length:--text-sm) font-medium text-(--brand-ink)'
                : 'flex min-h-11 items-center bg-(--surface) px-3 text-(length:--text-sm) text-(--ink-muted)'
            }
          >
            {v === 'dia' ? 'Dia' : 'Semana'}
          </button>
        ))}
      </div>

      <p className="mb-3 text-(length:--text-sm) text-(--ink-muted)">
        {vista === 'semana'
          ? 'Colunas são dias, de uma profissional de cada vez. Abaixo de 768 px torna-se uma lista agrupada por dia.'
          : 'Colunas são profissionais. Abaixo de 768 px torna-se uma lista de horas.'}
      </p>

      <Card className="overflow-hidden">
        <CalendarAdapter
          date={vista === 'semana' ? SEMANA : DIAS[0]!}
          timezone="Europe/Lisbon"
          view={vista}
          days={DIAS}
          events={eventos}
          resources={colunas}
          range={{ startMinute: 8 * 60, endMinute: 20 * 60, stepMinutes: 15 }}
        />
      </Card>
    </div>
  );
}
