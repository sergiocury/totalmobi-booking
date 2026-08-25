'use client';

import { useState } from 'react';

import { PLANOS, mesesPoupados, temAnual, type Plano } from '@totalmobi/shared';
import { Button, cn } from '@totalmobi/ui';

/**
 * Os preços.
 *
 * Lê tudo de `@totalmobi/shared` — nomes, valores, capacidades e destaques. Não
 * há um número escrito neste ficheiro, de propósito: um preço dentro de um
 * componente é um preço que alguém esquece quando a área comercial muda de
 * ideias, e ficam dois valores diferentes na mesma página.
 *
 * O APELO À AÇÃO LEVA MESMO A ALGUM LADO
 *
 * Enquanto não havia registo nem checkout, este botão dizia "Falar connosco" —
 * um botão que promete começar e abre um formulário de contacto é pior do que um
 * botão honesto. Agora leva ao registo, com o plano e a periodicidade escolhidos
 * a viajarem no endereço.
 *
 * "Falar connosco primeiro" fica por baixo, em texto. Há quem queira perguntar
 * antes de pagar, e tirar-lhes essa hipótese não converte ninguém — afasta.
 *
 * O DESTAQUE DO PLANO RECOMENDADO É UM CONTORNO, NÃO UMA COR
 *
 * Um cartão pintado de cor de marca ao lado de dois cinzentos grita, e num
 * produto white-label a cor de marca ainda por cima muda de cliente para
 * cliente. Um contorno e uma etiqueta chegam para dizer qual é.
 */

const EMAIL = 'booking@totalmobi.pt';

export function Precos() {
  const [anual, setAnual] = useState(false);
  const anualDisponivel = temAnual();

  return (
    <section id="precos" className="border-y border-(--line) bg-(--surface-sunken)">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-(length:--text-3xl) leading-(--leading-tight) font-semibold tracking-(--tracking-tight) text-balance">
            Escolha o plano certo para o seu negócio.
          </h2>
          <p className="mt-4 text-(length:--text-lg) text-pretty text-(--ink-muted)">
            Comece pelo essencial e acrescente automação e inteligência artificial quando precisar.
          </p>

          {anualDisponivel ? (
            <div
              role="group"
              aria-label="Periodicidade"
              className="mt-8 inline-flex overflow-hidden rounded-(--radius-full) border border-(--line) bg-(--surface)"
            >
              {[
                { valor: false, rotulo: 'Mensal' },
                { valor: true, rotulo: 'Anual' },
              ].map((opcao) => (
                <button
                  key={opcao.rotulo}
                  type="button"
                  onClick={() => setAnual(opcao.valor)}
                  aria-pressed={anual === opcao.valor}
                  className={cn(
                    'flex min-h-11 cursor-pointer items-center gap-2 px-5 text-(length:--text-sm)',
                    'transition-[background-color,color] duration-(--duration-fast) ease-(--ease-out-soft)',
                    anual === opcao.valor
                      ? 'bg-(--brand) font-medium text-(--brand-ink)'
                      : 'text-(--ink-muted) hover:text-(--ink)',
                  )}
                >
                  {opcao.rotulo}
                  {opcao.valor ? (
                    <span
                      className={cn(
                        'rounded-(--radius-full) px-2 py-0.5 text-(length:--text-xs)',
                        anual ? 'bg-(--brand-ink)/20' : 'bg-(--success-soft) text-(--success)',
                      )}
                    >
                      2 meses grátis
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-12 grid items-start gap-5 lg:grid-cols-3">
          {PLANOS.map((plano) => (
            <Cartao key={plano.codigo} plano={plano} anual={anual} />
          ))}
        </div>

        <p className="mt-10 text-center text-(length:--text-sm) text-(--ink-subtle)">
          IVA incluído — é este o valor que paga. A página pública de marcação está incluída em
          todos os planos.
        </p>
      </div>
    </section>
  );
}

function Cartao({ plano, anual }: { plano: Plano; anual: boolean }) {
  const preco = anual && plano.precoAnual !== null ? plano.precoAnual : plano.precoMensal;
  const periodo = anual ? '/ano' : '/mês';
  const poupanca = mesesPoupados(plano);

  return (
    <article
      className={cn(
        'flex h-full flex-col rounded-(--radius-lg) border bg-(--surface) px-6 py-7',
        plano.recomendado
          ? 'border-(--brand) shadow-(--shadow-md) lg:-mt-3 lg:pb-9'
          : 'border-(--line)',
      )}
    >
      <div className="flex items-center gap-3">
        <h3 className="text-(length:--text-xl) font-semibold tracking-(--tracking-tight)">
          {plano.nome}
        </h3>
        {plano.recomendado ? (
          <span className="rounded-(--radius-full) bg-(--brand-soft) px-2.5 py-1 text-(length:--text-xs) font-medium text-(--brand)">
            Mais escolhido
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-pretty text-(--ink-muted)">{plano.promessa}</p>

      <p className="mt-6 flex items-baseline gap-1.5">
        <span className="text-(length:--text-4xl) font-semibold tracking-(--tracking-tighter) tabular-nums">
          {preco} €
        </span>
        <span className="text-(--ink-muted)">{periodo}</span>
      </p>

      <p className="mt-1 min-h-5 text-(length:--text-sm) text-(--ink-subtle)">
        {anual && poupanca ? `${plano.precoMensal} €/mês, pago de uma vez` : ' '}
      </p>

      {/*
        Agora leva mesmo a algum lado. Enquanto não havia registo nem checkout,
        este botão dizia "Falar connosco" — um botão que promete começar e abre
        um formulário de contacto é pior do que um botão honesto.
      */}
      <Button
        asChild
        size="lg"
        variant={plano.recomendado ? 'primary' : 'secondary'}
        className="mt-6 w-full"
      >
        <a href={`/registo?plano=${plano.codigo}&periodo=${anual ? 'year' : 'month'}`}>
          Começar agora
        </a>
      </Button>

      <a
        href={`mailto:${EMAIL}?subject=${encodeURIComponent(`Totalmobi Booking — plano ${plano.nome}`)}`}
        className="mt-2.5 block text-center text-(length:--text-sm) text-(--ink-muted) underline underline-offset-4"
      >
        Falar connosco primeiro
      </a>

      <ul className="mt-7 space-y-2.5 text-(length:--text-sm)">
        {plano.destaques.map((d) => (
          <li key={d} className="flex gap-2.5">
            <span aria-hidden className="mt-0.5 shrink-0 text-(--brand)">
              ✓
            </span>
            <span className="text-pretty text-(--ink-muted)">{d}</span>
          </li>
        ))}
      </ul>

      {plano.aindaNao?.length ? (
        <ul className="mt-5 space-y-2 border-t border-(--line) pt-5 text-(length:--text-sm)">
          {plano.aindaNao.map((a) => (
            <li key={a} className="flex gap-2.5">
              <span aria-hidden className="mt-0.5 shrink-0 text-(--ink-subtle)">
                ·
              </span>
              <span className="text-pretty text-(--ink-subtle)">{a}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
