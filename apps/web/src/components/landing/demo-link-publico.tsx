'use client';

import { useEffect, useState } from 'react';

import { cn } from '@totalmobi/ui';

/**
 * Da bio do Instagram à marcação feita.
 *
 * O QUE ESTA DEMONSTRAÇÃO TEM DE PROVAR
 *
 * Que **não é preciso ter website**. É a objeção mais comum de quem tem um
 * salão ou um consultório pequeno: *"eu não tenho site"*. A resposta não é um
 * parágrafo — é ver o link a sair de uma bio de Instagram e a acabar numa
 * marcação confirmada, sem passar por site nenhum.
 *
 * POR ISSO ESTÁ NUM TELEMÓVEL
 *
 * Quem vem do Instagram vem no telemóvel. Mostrar isto num ecrã de computador
 * seria contar a história no sítio errado. A moldura não é decoração: é a única
 * forma de dizer "isto acontece no telefone da tua cliente" sem escrever a
 * frase.
 *
 * O ecrã de perfil é genérico de propósito — um avatar, um nome, uma bio e um
 * link. Não copia marcas nem ativos de ninguém, e não precisa: o que interessa
 * é o link, e o link é nosso.
 */

type Passo = 'perfil' | 'servico' | 'profissional' | 'hora' | 'feito';

const SEQUENCIA: { passo: Passo; espera: number }[] = [
  { passo: 'perfil', espera: 2200 },
  { passo: 'servico', espera: 2000 },
  { passo: 'profissional', espera: 1800 },
  { passo: 'hora', espera: 2000 },
  { passo: 'feito', espera: 1600 },
];

const SERVICOS = ['Consulta de avaliação', 'Limpeza dentária', 'Branqueamento'];
const PROFISSIONAIS = ['Dra. Ana Martins', 'Dr. João Costa', 'Primeiro disponível'];
const HORAS = ['10:00', '11:30', '15:00', '16:30'];

export function DemoLinkPublico() {
  const [indice, setIndice] = useState(0);
  const [arrancou, setArrancou] = useState(false);
  const [no, setNo] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!no) return;
    if (no.getBoundingClientRect().top < window.innerHeight) {
      setArrancou(true);
      return;
    }
    const observador = new IntersectionObserver(
      (e) => {
        if (e.some((x) => x.isIntersecting)) {
          setArrancou(true);
          observador.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    observador.observe(no);
    return () => observador.disconnect();
  }, [no]);

  useEffect(() => {
    if (!arrancou || indice >= SEQUENCIA.length - 1) return;
    const t = window.setTimeout(() => setIndice(indice + 1), SEQUENCIA[indice]!.espera);
    return () => window.clearTimeout(t);
  }, [arrancou, indice]);

  const passo = SEQUENCIA[indice]!.passo;
  const terminou = indice === SEQUENCIA.length - 1;

  return (
    <div ref={setNo} className="flex flex-col items-center">
      {/* A moldura. Bordas grossas e cantos muito redondos chegam para ler
          "telemóvel" — não é preciso desenhar um aparelho concreto. */}
      <div className="w-full max-w-[19rem] rounded-[2.25rem] border-8 border-(--ink) bg-(--ink) shadow-(--shadow-lg)">
        <div className="relative h-[34rem] overflow-hidden rounded-[1.6rem] bg-(--surface)">
          {passo === 'perfil' ? <Perfil /> : <PaginaDeMarcacao passo={passo} />}
        </div>
      </div>

      <div className="mt-4 flex min-h-11 items-center gap-3 text-(length:--text-sm) text-(--ink-muted)">
        <span aria-live="polite">
          {passo === 'perfil'
            ? 'A cliente vê o link na bio.'
            : passo === 'feito'
              ? 'Marcado — e a clínica não tem website.'
              : 'Na página de marcação da clínica.'}
        </span>
        {terminou ? (
          <button
            type="button"
            onClick={() => setIndice(0)}
            className="cursor-pointer text-(--brand) underline underline-offset-4"
          >
            Ver outra vez
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Perfil() {
  return (
    <div className="bolha flex h-full flex-col px-5 pt-8">
      <div className="flex items-center gap-4">
        <span
          aria-hidden
          className="flex size-16 shrink-0 items-center justify-center rounded-(--radius-full) bg-(--brand-soft) text-(length:--text-lg) font-semibold text-(--brand)"
        >
          CS
        </span>
        <div className="min-w-0">
          <p className="font-semibold">Clínica Sorriso</p>
          <p className="text-(length:--text-sm) text-(--ink-subtle)">Medicina dentária · Lisboa</p>
        </div>
      </div>

      <p className="mt-4 text-(length:--text-sm) text-pretty">
        Cuidamos do seu sorriso.
        <br />
        Marque a sua consulta ↓
      </p>

      {/* O link, e um toque a acontecer nele. É o momento da história. */}
      <div className="relative mt-3">
        <span className="block truncate rounded-(--radius-sm) border border-(--line) bg-(--surface-sunken) px-3 py-2 text-(length:--text-sm) text-(--brand)">
          booking.totalmobi.pt/clinica-sorriso
        </span>
        <span
          aria-hidden
          className="pontinho absolute -right-1 -bottom-2 size-7 rounded-(--radius-full) border-2 border-(--ink) bg-(--ink)/10"
        />
      </div>

      <div className="mt-6 grid grid-cols-3 gap-1">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            aria-hidden
            className="aspect-square rounded-(--radius-xs) bg-(--surface-sunken)"
          />
        ))}
      </div>
    </div>
  );
}

function PaginaDeMarcacao({ passo }: { passo: Passo }) {
  return (
    <div className="bolha flex h-full flex-col">
      {/* O cabeçalho com a marca da clínica. É o white label a ver-se. */}
      <div className="flex items-center gap-2.5 border-b border-(--line) bg-(--brand-soft) px-4 py-3">
        <span
          aria-hidden
          className="flex size-7 items-center justify-center rounded-(--radius-full) bg-(--brand) text-(length:--text-xs) font-semibold text-(--brand-ink)"
        >
          CS
        </span>
        <span className="text-(length:--text-sm) font-medium text-(--brand)">Clínica Sorriso</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {passo === 'feito' ? (
          <Confirmado />
        ) : (
          <>
            <Escolha
              titulo="O que pretende marcar?"
              opcoes={SERVICOS}
              escolhida={passo === 'servico' ? null : 'Limpeza dentária'}
              ativa={passo === 'servico'}
            />

            {passo !== 'servico' ? (
              <Escolha
                titulo="Com quem?"
                opcoes={PROFISSIONAIS}
                escolhida={passo === 'profissional' ? null : 'Dra. Ana Martins'}
                ativa={passo === 'profissional'}
                className="mt-5"
              />
            ) : null}

            {passo === 'hora' ? (
              <div className="mt-5">
                <p className="mb-2 text-(length:--text-sm) font-medium">Escolha um horário</p>
                <div className="grid grid-cols-2 gap-2">
                  {HORAS.map((h) => (
                    <span
                      key={h}
                      className={cn(
                        'rounded-(--radius-sm) border px-3 py-2 text-center text-(length:--text-sm) tabular-nums',
                        h === '16:30'
                          ? 'border-(--brand) bg-(--brand) font-medium text-(--brand-ink)'
                          : 'border-(--line) text-(--ink-muted)',
                      )}
                    >
                      {h}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function Escolha({
  titulo,
  opcoes,
  escolhida,
  ativa,
  className,
}: {
  titulo: string;
  opcoes: string[];
  escolhida: string | null;
  ativa: boolean;
  className?: string;
}) {
  // Depois de escolher, os outros saem. Numa página de marcação real também
  // saem — e mostrar tudo para sempre faria o ecrã crescer sem parar.
  const visiveis = escolhida ? [escolhida] : opcoes;

  return (
    <div className={className}>
      <p className="mb-2 text-(length:--text-sm) font-medium">{titulo}</p>
      <div className="space-y-1.5">
        {visiveis.map((o) => (
          <span
            key={o}
            className={cn(
              'block rounded-(--radius-sm) border px-3 py-2 text-(length:--text-sm)',
              escolhida === o
                ? 'border-(--brand) bg-(--brand-soft) font-medium text-(--brand)'
                : ativa
                  ? 'border-(--line) text-(--ink)'
                  : 'border-(--line) text-(--ink-muted)',
            )}
          >
            {o}
          </span>
        ))}
      </div>
    </div>
  );
}

function Confirmado() {
  return (
    <div className="marcacao-nova flex h-full flex-col items-center justify-center text-center">
      <span
        aria-hidden
        className="flex size-14 items-center justify-center rounded-(--radius-full) bg-(--success-soft) text-(length:--text-2xl) text-(--success)"
      >
        ✓
      </span>
      <p className="mt-4 text-(length:--text-lg) font-semibold">Marcação confirmada</p>
      <p className="mt-2 text-(length:--text-sm) text-pretty text-(--ink-muted)">
        Limpeza dentária
        <br />
        sexta-feira às 16:30
        <br />
        Dra. Ana Martins
      </p>
      <p className="mt-4 text-(length:--text-sm) text-(--ink-subtle)">
        Recebe a confirmação e o lembrete.
      </p>
    </div>
  );
}
