'use client';

import { useCallback, useRef, useState } from 'react';

import { ultrapassouLimiar } from '@totalmobi/shared';

/**
 * O estado de um arrasto na agenda.
 *
 * A **regra** — a partir de que distância um movimento deixa de ser um clique —
 * vive em `@totalmobi/shared`, com testes. Aqui fica só a ligação ao React.
 * Ver a nota em `ultrapassouLimiar` sobre as marcações que foram movidas em
 * produção por quem julgava estar apenas a clicar.
 */

export interface Arrasto<T> {
  /** O que se está a arrastar, ou `null` enquanto for só um clique. */
  readonly ativo: T | null;
  /** No `pointerdown` do bloco. Ainda não é um arrasto. */
  readonly comecar: (e: { clientX: number; clientY: number }, carga: T) => void;
  /** No `pointermove` da área. É aqui que um clique passa a arrasto. */
  readonly mover: (e: { clientX: number; clientY: number }) => void;
  /** Depois de largar, ou ao cancelar. */
  readonly terminar: () => void;
}

export function usarArrasto<T>(): Arrasto<T> {
  const [ativo, setAtivo] = useState<T | null>(null);

  /*
   * Numa ref e não em estado.
   *
   * O `pointermove` dispara dezenas de vezes por segundo; guardar a origem em
   * estado provocaria um render por cada movimento do rato sobre a agenda,
   * mesmo quando ainda não há arrasto nenhum.
   */
  const origem = useRef<{ x: number; y: number; carga: T } | null>(null);

  const comecar = useCallback((e: { clientX: number; clientY: number }, carga: T) => {
    origem.current = { x: e.clientX, y: e.clientY, carga };
  }, []);

  const mover = useCallback((e: { clientX: number; clientY: number }) => {
    const o = origem.current;
    if (!o) return;

    if (!ultrapassouLimiar({ clientX: o.x, clientY: o.y }, e)) return;

    setAtivo((atual) => atual ?? o.carga);
  }, []);

  const terminar = useCallback(() => {
    origem.current = null;
    setAtivo(null);
  }, []);

  return { ativo, comecar, mover, terminar };
}
