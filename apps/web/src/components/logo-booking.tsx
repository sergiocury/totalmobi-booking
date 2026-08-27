import Image from 'next/image';

import { cn } from '@totalmobi/ui';

/**
 * O logótipo da plataforma.
 *
 * OS TAMANHOS VÊM DA FOLHA DE MARCA, E ELA CONTRADIZ-SE UM POUCO
 *
 * A folha (`marca_booking.png`) dá, por tipo de ecrã, uma gama de largura **e**
 * uma de altura:
 *
 *   desktop  180-220 largura · 36-48 altura
 *   tablet   160-190 largura · 32-42 altura
 *   telemóvel 135-160 largura · 28-36 altura
 *
 * O desenho tem rácio 3,78:1 — medido no ficheiro, não estimado. A 48 px de
 * altura dá 181 de largura; a 36 dá 136. Ou seja, as duas gamas de cada linha
 * **só se encontram no extremo**: a altura máxima é que produz a largura
 * mínima. Escolheram-se esses pontos de encontro — 48, 42 e 36 — que é a única
 * leitura em que nenhuma das duas regras é violada.
 *
 * DUAS IMAGENS, E NÃO UMA COM FILTRO
 *
 * A folha traz uma versão para fundo claro e outra para fundo escuro, com o
 * "Booking" branco. Não há filtro CSS que transforme uma na outra sem estragar
 * o turquesa do ícone — inverter torna-o laranja.
 *
 * A ESCOLHA É POR ATRIBUTO, NÃO POR MEDIA QUERY
 *
 * O tema deste produto vive em `data-theme` no `<html>`, posto por um script
 * bloqueante antes da primeira pintura — para que alguém que escolheu claro num
 * sistema escuro veja claro. Um `<picture>` com `prefers-color-scheme`
 * ignoraria essa escolha e mostraria o logótipo errado a essa pessoa.
 *
 * ONDE ESTE COMPONENTE **NÃO** SE USA
 *
 * Nas páginas das clínicas. Ali a marca é a **delas**. Um produto white-label
 * que assina as páginas dos clientes deixa de ser white-label.
 */

/** Medido no ficheiro, com o alfa a definir a caixa: 726 × 192. */
const RACIO = 726 / 192;

/** A altura de desktop da folha de marca. É a intrínseca; o CSS reduz nos ecrãs pequenos. */
const ALTURA_BASE = 48;

export function LogoBooking({
  className,
  altura = ALTURA_BASE,
  prioridade = false,
}: {
  /**
   * Classes aplicadas às **imagens**, não ao invólucro — é onde a altura manda.
   * Para variar por ecrã use sempre `w-auto` a par da altura, senão o Next
   * avisa que o CSS contradiz as dimensões declaradas.
   */
  className?: string | undefined;
  altura?: number;
  /** No cabeçalho vale a pena: é a primeira coisa que se vê. */
  prioridade?: boolean;
}) {
  const comum = {
    width: Math.round(altura * RACIO),
    height: altura,
    priority: prioridade,
  };

  return (
    <span className="inline-flex shrink-0 items-center">
      <Image
        src="/logo-booking.png"
        alt="Totalmobi Booking"
        className={cn('logo-tema-claro', className)}
        {...comum}
      />
      <Image
        src="/logo-booking-escuro.png"
        alt=""
        aria-hidden
        className={cn('logo-tema-escuro', className)}
        {...comum}
      />
    </span>
  );
}
