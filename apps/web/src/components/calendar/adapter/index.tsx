'use client';

import { useEffect, useState } from 'react';

import { AgendaVertical } from './agenda-vertical';
import { GrelhaDia } from './grelha-dia';
import { GrelhaSemana } from './grelha-semana';
import type { CalendarProps } from './types';

export type {
  CalendarEvent,
  CalendarProps,
  CalendarRange,
  CalendarResource,
  CalendarView,
} from './types';

/**
 * As contas de tempo **não se reexportam daqui**.
 *
 * Este ficheiro é `'use client'`. Tudo o que sai por ele fica marcado como
 * cliente, e uma página de servidor que o importasse rebentaria em execução com
 * "Attempted to call segundaFeiraDe() from the server". O `tsc` e o `next
 * build` deixam passar — é um erro de fronteira, não de tipos.
 *
 * Vivem em `@totalmobi/shared`, que não tem `'use client'` e por isso serve os
 * dois lados. O que fica aqui é só o desenho: ver `medidas.ts`.
 */

/**
 * O ponto de entrada do calendário.
 *
 * Escolhe a implementação por duas coisas: a **vista** que o utilizador pediu e
 * a **largura do ecrã**. É a única coisa que o resto da aplicação importa —
 * trocar as grelhas próprias por FullCalendar, ou por qualquer outra, é mudar
 * este ficheiro e mais nada.
 *
 * A troca por largura acontece a 768 px e é uma troca de **componente**, não de
 * folha de estilos: a agenda de telemóvel é outra peça, não a mesma com outro
 * CSS.
 *
 * NO TELEMÓVEL NÃO HÁ GRELHA DE SEMANA
 *
 * Sete colunas num ecrã de 375 px dão 50 px por dia. Não cabe uma hora, quanto
 * mais um nome. A semana no telemóvel é a mesma lista vertical, com as
 * marcações agrupadas por dia — a informação é a mesma, a forma é a que cabe.
 * É o raciocínio que decidiu a agenda de telemóvel no M10, aplicado outra vez.
 */
export function CalendarAdapter(props: CalendarProps) {
  const [estreito, setEstreito] = useState<boolean | null>(null);

  useEffect(() => {
    const consulta = window.matchMedia('(max-width: 767px)');
    const aplicar = () => setEstreito(consulta.matches);

    aplicar();
    consulta.addEventListener('change', aplicar);
    return () => consulta.removeEventListener('change', aplicar);
  }, []);

  // Antes de saber a largura não se desenha nenhuma das duas: pintar a grelha
  // do desktop e trocá-la logo a seguir seria um salto visível em cada
  // carregamento no telemóvel.
  if (estreito === null) {
    return <div className="h-96 animate-pulse rounded-(--radius-md) bg-(--surface-sunken)" />;
  }

  if (estreito) return <AgendaVertical {...props} />;

  return props.view === 'semana' ? <GrelhaSemana {...props} /> : <GrelhaDia {...props} />;
}
