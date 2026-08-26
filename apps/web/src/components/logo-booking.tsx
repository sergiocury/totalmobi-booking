import Image from 'next/image';

import { cn } from '@totalmobi/ui';

/**
 * O logótipo da plataforma.
 *
 * DUAS IMAGENS, E NÃO UMA COM FILTRO
 *
 * O "Booking" do logótipo é azul-marinho quase preto. Num tema escuro
 * desaparece, e não há filtro CSS que resolva isso sem estragar os azuis do
 * ícone — inverter torna-os laranja. São dois ficheiros, e o tema escolhe.
 *
 * A ESCOLHA É POR ATRIBUTO, NÃO POR MEDIA QUERY
 *
 * O tema deste produto vive em `data-theme` no `<html>`, posto por um script
 * bloqueante antes da primeira pintura — de propósito, para que alguém que
 * escolheu claro num sistema escuro veja claro. Um `<picture>` com
 * `prefers-color-scheme` ignoraria essa escolha e mostraria o logótipo errado a
 * essa pessoa.
 *
 * Daí as duas imagens no DOM e a troca em CSS. A escondida leva `aria-hidden`
 * para os leitores de ecrã não anunciarem a marca duas vezes.
 *
 * ONDE ESTE COMPONENTE **NÃO** SE USA
 *
 * Nas páginas das clínicas. Ali a marca é a **delas** — logótipo, cores e nome
 * próprios. Um produto white-label que assina as páginas dos clientes deixa de
 * ser white-label. Este logótipo é só para as superfícies da Totalmobi: a
 * landing, o registo e a entrada.
 */
export function LogoBooking({
  className,
  altura = 28,
  prioridade = false,
}: {
  className?: string | undefined;
  /** Altura em pixéis. A largura sai do rácio 299:96 do ficheiro. */
  altura?: number;
  /** No cabeçalho da landing vale a pena: é a primeira coisa que se vê. */
  prioridade?: boolean;
}) {
  const largura = Math.round((altura * 299) / 96);
  const comum = { width: largura, height: altura, priority: prioridade };

  return (
    <span className={cn('inline-flex shrink-0 items-center', className)}>
      <Image
        src="/logo-booking.png"
        alt="Totalmobi Booking"
        className="logo-tema-claro"
        {...comum}
      />
      <Image
        src="/logo-booking-escuro.png"
        alt=""
        aria-hidden
        className="logo-tema-escuro"
        {...comum}
      />
    </span>
  );
}
