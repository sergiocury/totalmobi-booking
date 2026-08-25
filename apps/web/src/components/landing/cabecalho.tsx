'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Button, cn } from '@totalmobi/ui';

const SECCOES = [
  { href: '#link-publico', rotulo: 'Link público' },
  { href: '#como-funciona', rotulo: 'Como funciona' },
  { href: '#demonstracao', rotulo: 'Demonstração' },
  { href: '#perguntas', rotulo: 'Perguntas' },
];

/**
 * A navegação da landing.
 *
 * Fica colada ao topo e ganha fundo desfocado depois do primeiro scroll — antes
 * disso é transparente, para o hero começar no topo do ecrã sem uma barra a
 * cortá-lo.
 *
 * O menu de telemóvel é um `<dialog>` nativo e não uma `<div>` com `role`. Sai
 * de graça o fecho com Escape, o foco preso lá dentro e o resto da página
 * marcada como inerte — três coisas que quase sempre faltam num menu feito à
 * mão, e que só se notam quando alguém navega por teclado.
 */
export function Cabecalho() {
  const [rolou, setRolou] = useState(false);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    const aoRolar = () => setRolou(window.scrollY > 8);
    aoRolar();
    // `passive`: este listener nunca chama `preventDefault`, e dizê-lo deixa o
    // browser rolar sem esperar por ele.
    window.addEventListener('scroll', aoRolar, { passive: true });
    return () => window.removeEventListener('scroll', aoRolar);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-(--duration-base) ease-(--ease-out-soft)',
        rolou
          ? 'border-b border-(--line) bg-(--surface)/80 backdrop-blur-md'
          : 'border-b border-transparent',
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5 sm:px-8">
        <Link href="/" className="flex shrink-0 items-baseline gap-1.5">
          <span className="text-(length:--text-lg) font-semibold tracking-(--tracking-tight)">
            Totalmobi
          </span>
          <span className="text-(length:--text-lg) text-(--brand)">Booking</span>
        </Link>

        <nav aria-label="Secções" className="ml-auto hidden items-center gap-1 md:flex">
          {SECCOES.map((s) => (
            <a
              key={s.href}
              href={s.href}
              className="flex min-h-11 items-center rounded-(--radius-sm) px-3 text-(length:--text-sm) text-(--ink-muted) transition-colors duration-(--duration-fast) hover:bg-(--surface-sunken) hover:text-(--ink)"
            >
              {s.rotulo}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <Link
            href="/login"
            className="hidden min-h-11 items-center rounded-(--radius-sm) px-3 text-(length:--text-sm) text-(--ink-muted) transition-colors duration-(--duration-fast) hover:text-(--ink) sm:flex"
          >
            Entrar
          </Link>
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <a href="#contacto">Falar connosco</a>
          </Button>

          <button
            type="button"
            onClick={() => setAberto(true)}
            aria-label="Abrir menu"
            className="flex size-11 cursor-pointer items-center justify-center rounded-(--radius-sm) border border-(--line) md:hidden"
          >
            <span aria-hidden className="flex flex-col gap-1">
              <span className="block h-0.5 w-4 bg-(--ink)" />
              <span className="block h-0.5 w-4 bg-(--ink)" />
            </span>
          </button>
        </div>
      </div>

      {aberto ? <MenuTelemovel onFechar={() => setAberto(false)} /> : null}
    </header>
  );
}

function MenuTelemovel({ onFechar }: { onFechar: () => void }) {
  const [ref, setRef] = useState<HTMLDialogElement | null>(null);

  useEffect(() => {
    // `showModal` e não o atributo `open`: é o que ativa o foco preso, o
    // `::backdrop` e o fecho por Escape.
    ref?.showModal();
  }, [ref]);

  return (
    <dialog
      ref={setRef}
      onClose={onFechar}
      className="m-0 h-dvh max-h-none w-full max-w-none bg-(--surface) p-0 text-(--ink) backdrop:bg-(--ink)/40"
    >
      <div className="flex h-16 items-center justify-between px-5">
        <span className="text-(length:--text-lg) font-semibold">Menu</span>
        <button
          type="button"
          onClick={() => ref?.close()}
          aria-label="Fechar menu"
          className="flex size-11 cursor-pointer items-center justify-center rounded-(--radius-sm) border border-(--line) text-(length:--text-lg)"
        >
          ×
        </button>
      </div>

      <nav aria-label="Secções" className="flex flex-col px-5 py-4">
        {SECCOES.map((s) => (
          <a
            key={s.href}
            href={s.href}
            onClick={() => ref?.close()}
            className="flex min-h-14 items-center border-b border-(--line) text-(length:--text-lg)"
          >
            {s.rotulo}
          </a>
        ))}
        <Link
          href="/login"
          className="flex min-h-14 items-center border-b border-(--line) text-(length:--text-lg)"
        >
          Entrar
        </Link>
      </nav>

      <div className="px-5 pt-2">
        <Button asChild size="lg" className="w-full">
          <a href="#contacto" onClick={() => ref?.close()}>
            Falar connosco
          </a>
        </Button>
      </div>
    </dialog>
  );
}
