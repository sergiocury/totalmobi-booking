'use client';

import { useEffect, useState } from 'react';

import { AgendaVertical } from './agenda-vertical';
import { GrelhaDia } from './grelha-dia';
import type { CalendarProps } from './types';

export type { CalendarEvent, CalendarProps, CalendarRange, CalendarResource } from './types';

/**
 * O ponto de entrada do calendário.
 *
 * Escolhe a implementação pela largura do ecrã, e é a única coisa que o resto
 * da aplicação importa. Trocar a grelha própria por FullCalendar — ou por
 * qualquer outra — é mudar este ficheiro e mais nada.
 *
 * A troca acontece a 768 px e é uma troca de **componente**, não de folha de
 * estilos: a agenda de telemóvel é outra peça, não a mesma com outro CSS.
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

  return estreito ? <AgendaVertical {...props} /> : <GrelhaDia {...props} />;
}
