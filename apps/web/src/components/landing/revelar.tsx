'use client';

import { useEffect, useState } from 'react';

import { cn } from '@totalmobi/ui';

/**
 * Aparecer ao entrar no ecrã.
 *
 * `IntersectionObserver` e não um listener de scroll: o observer só corre
 * quando o browser decide, fora da thread do scroll. Um `onScroll` a medir
 * posições em cada frame é a forma mais comum de tornar uma landing lenta
 * exatamente no momento em que a pessoa está a rolar.
 *
 * `once` por omissão. Um elemento que reaparece sempre que se rola para cima e
 * para baixo passa de simpático a irritante à terceira vez — e quem rola para
 * trás normalmente está à procura de uma coisa que já viu.
 *
 * Sem JavaScript o conteúdo aparece à mesma: o estado inicial invisível é
 * anulado por `@media (scripting: none)` no `globals.css`. Uma landing que
 * depende de JavaScript para mostrar texto é uma landing que não é indexada.
 */
export function Revelar({
  children,
  className,
  atraso = 0,
  as: Tag = 'div',
}: {
  children: React.ReactNode;
  className?: string;
  /** Milissegundos. Para escalonar irmãos sem escrever CSS para cada um. */
  atraso?: number;
  as?: 'div' | 'section' | 'li' | 'article';
}) {
  /**
   * Um callback ref e não `useRef`.
   *
   * O `as` deixa este componente ser `div`, `section`, `li` ou `article`, e um
   * `Ref` tipado para um deles não serve aos outros — o TypeScript recusa a
   * interseção. Guardar o nó em estado aceita qualquer elemento e ainda dispara
   * o efeito no momento em que ele existe, sem depender da ordem dos renders.
   */
  const [no, setNo] = useState<HTMLElement | null>(null);
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    if (!no) return;

    // Já está à vista no primeiro render — acima da dobra. Não vale a pena
    // esperar por um evento que já aconteceu.
    const caixa = no.getBoundingClientRect();
    if (caixa.top < window.innerHeight) {
      setVisivel(true);
      return;
    }

    const observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (entrada.isIntersecting) {
            setVisivel(true);
            observador.disconnect();
          }
        }
      },
      // Dispara um pouco antes de entrar: a animação começa fora do ecrã e a
      // pessoa vê o fim dela, não o princípio.
      { rootMargin: '0px 0px -10% 0px', threshold: 0.05 },
    );

    observador.observe(no);
    return () => observador.disconnect();
  }, [no]);

  return (
    <Tag
      ref={setNo}
      className={cn('revelar', visivel && 'visivel', className)}
      style={atraso ? { transitionDelay: `${atraso}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
