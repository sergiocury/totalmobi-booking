'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '@totalmobi/ui';

/**
 * A conversa que se torna uma marcação.
 *
 * É a peça mais importante da página. Quem chega não sabe o que o produto faz,
 * e nenhum parágrafo explica isto tão depressa como ver acontecer: chega uma
 * mensagem, a agenda é consultada, aparece um bloco no calendário.
 *
 * SIMULAÇÃO DETERMINISTA, E DITA COMO TAL
 *
 * Não chama modelo nenhum. É uma máquina de estados com um guião fixo, e a
 * etiqueta em cima diz **Demonstração**. Três razões, por ordem de importância:
 *
 * 1. **Honestidade.** Uma demonstração que finge ser a IA real é uma mentira
 *    pequena que se descobre no primeiro teste sério.
 * 2. **Custo e abuso.** Um endpoint de LLM aberto a cada visitante anónimo é
 *    uma fatura e uma porta de injeção de prompts.
 * 3. **Fiabilidade.** Uma landing não pode depender da latência de um terceiro
 *    para a sua peça de conversão.
 *
 * O guião está separado da apresentação, por isso ligar isto a um endpoint real
 * um dia é trocar a fonte dos passos — não reescrever o componente.
 *
 * O RITMO É A MENSAGEM
 *
 * As pausas são deliberadas e curtas. Uma conversa que demora oito segundos a
 * chegar ao fim perde metade das pessoas; uma que despacha tudo em meio segundo
 * não se lê. O "está a escrever" existe porque é o que torna a pausa legível
 * como resposta em vez de lentidão.
 */

interface Passo {
  /** Quem fala. `sistema` são os cartões de estado, não bolhas. */
  de: 'cliente' | 'ia' | 'sistema';
  texto?: string;
  /** Milissegundos a esperar **antes** deste passo. */
  espera: number;
  /** Mostra os três pontos durante esta espera. */
  aEscrever?: boolean;
  /** As horas oferecidas, desenhadas como botões. */
  horas?: string[];
  /** Marca a hora escolhida e desenha o bloco no calendário. */
  confirma?: boolean;
  /** O que a IA extraiu da frase, mostrado como etiquetas. */
  extraiu?: { rotulo: string; valor: string }[];
}

const GUIAO: Passo[] = [
  {
    de: 'cliente',
    texto: 'Olá, queria marcar uma limpeza para sexta à tarde.',
    espera: 700,
  },
  {
    de: 'sistema',
    espera: 900,
    aEscrever: true,
    extraiu: [
      { rotulo: 'Serviço', valor: 'Limpeza dentária' },
      { rotulo: 'Dia', valor: 'sexta-feira' },
      { rotulo: 'Preferência', valor: 'depois das 14h' },
    ],
  },
  {
    de: 'ia',
    texto: 'Claro. Deixe-me ver a agenda da sexta-feira.',
    espera: 800,
    aEscrever: true,
  },
  {
    de: 'ia',
    texto: 'Tenho três horários livres:',
    espera: 1100,
    aEscrever: true,
    horas: ['15:00', '16:30', '18:00'],
  },
  { de: 'cliente', texto: '16:30', espera: 1400 },
  {
    de: 'ia',
    texto:
      'Marcado ✓\nLimpeza dentária · sexta-feira às 16:30\nDra. Ana Martins\nEnviei-lhe a confirmação.',
    espera: 900,
    aEscrever: true,
    confirma: true,
  },
];

/** Os passos acumulados até um dado índice, para desenhar o histórico. */
function ate(indice: number): Passo[] {
  return GUIAO.slice(0, indice + 1);
}

export function DemoConversa({ compacto = false }: { compacto?: boolean }) {
  const [indice, setIndice] = useState(-1);
  const [aEscrever, setAEscrever] = useState(false);
  const [terminou, setTerminou] = useState(false);
  const [arrancou, setArrancou] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const fimDaConversa = useRef<HTMLDivElement>(null);

  /**
   * Só começa quando estiver à vista.
   *
   * Uma animação que corre no fundo da página termina sem ninguém a ver, e a
   * pessoa chega a um resultado já feito sem perceber como lá foi parar.
   */
  useEffect(() => {
    const no = raiz.current;
    if (!no) return;

    const caixa = no.getBoundingClientRect();
    if (caixa.top < window.innerHeight) {
      setArrancou(true);
      return;
    }

    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          setArrancou(true);
          observador.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    observador.observe(no);
    return () => observador.disconnect();
  }, []);

  useEffect(() => {
    if (!arrancou || terminou) return;

    const proximo = indice + 1;
    if (proximo >= GUIAO.length) {
      setTerminou(true);
      return;
    }

    const passo = GUIAO[proximo]!;
    let timerDoTexto: number | undefined;

    if (passo.aEscrever) {
      setAEscrever(true);
      // Os pontos ocupam a espera; a bolha entra quando eles saem.
      timerDoTexto = window.setTimeout(() => setAEscrever(false), passo.espera - 120);
    }

    const timer = window.setTimeout(() => {
      setAEscrever(false);
      setIndice(proximo);
    }, passo.espera);

    return () => {
      window.clearTimeout(timer);
      if (timerDoTexto) window.clearTimeout(timerDoTexto);
    };
  }, [arrancou, indice, terminou]);

  // Rolar a conversa para o fim sem arrastar a página inteira: `block: nearest`
  // mexe só no contentor que tem overflow.
  useEffect(() => {
    fimDaConversa.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [indice, aEscrever]);

  const passos = indice >= 0 ? ate(indice) : [];
  const confirmada = passos.some((p) => p.confirma);
  const horaEscolhida = passos.some((p) => p.de === 'cliente' && p.texto === '16:30');

  function recomecar() {
    setIndice(-1);
    setAEscrever(false);
    setTerminou(false);
  }

  return (
    <div
      ref={raiz}
      className={cn(
        'grid gap-4',
        compacto ? 'lg:grid-cols-1' : 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]',
      )}
    >
      <Conversa
        passos={passos}
        aEscrever={aEscrever}
        terminou={terminou}
        onRecomecar={recomecar}
        fimRef={fimDaConversa}
      />

      {!compacto ? <Agenda confirmada={confirmada} aDestacar={horaEscolhida} /> : null}
    </div>
  );
}

function Conversa({
  passos,
  aEscrever,
  terminou,
  onRecomecar,
  fimRef,
}: {
  passos: Passo[];
  aEscrever: boolean;
  terminou: boolean;
  onRecomecar: () => void;
  fimRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="overflow-hidden rounded-(--radius-lg) border border-(--line) bg-(--surface) shadow-(--shadow-md)">
      <div className="flex items-center gap-3 border-b border-(--line) bg-(--surface-sunken) px-4 py-3">
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-(--radius-full) bg-(--brand) text-(length:--text-sm) font-semibold text-(--brand-ink)"
        >
          CS
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">Clínica Sorriso</span>
          <span className="block text-(length:--text-xs) text-(--ink-subtle)">
            responde normalmente em segundos
          </span>
        </span>
        {/* Dizer que é uma simulação, e dizê-lo onde se vê. */}
        <span className="shrink-0 rounded-(--radius-full) border border-(--line-strong) px-2 py-0.5 text-(length:--text-xs) text-(--ink-muted)">
          Demonstração
        </span>
      </div>

      <div
        className="flex h-96 flex-col gap-2.5 overflow-y-auto px-4 py-4"
        role="log"
        aria-live="polite"
        aria-label="Conversa de demonstração"
      >
        {passos.map((passo, i) =>
          passo.de === 'sistema' ? (
            <Extracao key={i} etiquetas={passo.extraiu ?? []} />
          ) : (
            <Bolha key={i} passo={passo} />
          ),
        )}

        {aEscrever ? <AEscrever /> : null}
        <div ref={fimRef} />
      </div>

      {terminou ? (
        <div className="flex items-center justify-between gap-3 border-t border-(--line) px-4 py-2.5">
          <p className="text-(length:--text-sm) text-(--ink-muted)">
            Do &ldquo;olá&rdquo; à marcação feita, sem ninguém atender.
          </p>
          <button
            type="button"
            onClick={onRecomecar}
            className="min-h-11 shrink-0 cursor-pointer px-2 text-(length:--text-sm) text-(--brand) underline underline-offset-4"
          >
            Ver outra vez
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Bolha({ passo }: { passo: Passo }) {
  const doCliente = passo.de === 'cliente';

  return (
    <div className={cn('bolha flex', doCliente ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-(--radius-md) px-3.5 py-2.5 text-(length:--text-sm) whitespace-pre-line',
          doCliente
            ? 'bg-(--brand) text-(--brand-ink)'
            : 'border border-(--line) bg-(--surface-sunken) text-(--ink)',
        )}
      >
        {passo.texto}

        {passo.horas ? (
          <span className="mt-2.5 flex flex-wrap gap-1.5">
            {passo.horas.map((hora) => (
              <span
                key={hora}
                className={cn(
                  'rounded-(--radius-full) border px-2.5 py-1 text-(length:--text-sm) tabular-nums',
                  hora === '16:30'
                    ? 'border-(--brand) bg-(--brand-soft) font-medium text-(--brand)'
                    : 'border-(--line-strong) text-(--ink-muted)',
                )}
              >
                {hora}
              </span>
            ))}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * O que a IA percebeu.
 *
 * É aqui que a palavra "IA" deixa de ser uma alegação. Em vez de dizer que
 * compreende linguagem natural, mostra-se a frase desmontada nos três campos que
 * a agenda precisa — que é literalmente o trabalho que faz.
 */
function Extracao({ etiquetas }: { etiquetas: { rotulo: string; valor: string }[] }) {
  if (etiquetas.length === 0) return null;

  return (
    <div className="bolha rounded-(--radius-md) border border-dashed border-(--line-strong) bg-(--surface) px-3.5 py-2.5">
      <p className="mb-2 text-(length:--text-xs) tracking-wide text-(--ink-subtle) uppercase">
        A interpretar o pedido
      </p>
      <dl className="space-y-1">
        {etiquetas.map((e) => (
          <div key={e.rotulo} className="flex gap-2 text-(length:--text-sm)">
            <dt className="w-24 shrink-0 text-(--ink-subtle)">{e.rotulo}</dt>
            <dd className="min-w-0 font-medium">{e.valor}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function AEscrever() {
  return (
    <div className="bolha flex justify-start">
      <div className="flex items-center gap-1 rounded-(--radius-md) border border-(--line) bg-(--surface-sunken) px-3.5 py-3">
        <span className="sr-only">A escrever…</span>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            aria-hidden
            className="pontinho size-1.5 rounded-(--radius-full) bg-(--ink-subtle)"
          />
        ))}
      </div>
    </div>
  );
}

/**
 * A agenda do outro lado.
 *
 * O ponto da secção inteira: a conversa e o calendário são a mesma coisa vista
 * de dois lados. Enquanto o cliente escreve, o horário das 16:30 está livre;
 * quando ele escolhe, deixa de estar — e ninguém do lado da clínica tocou em
 * nada.
 */
function Agenda({ confirmada, aDestacar }: { confirmada: boolean; aDestacar: boolean }) {
  const horas = useMemo(() => ['14:00', '15:00', '16:00', '16:30', '17:00', '18:00'], []);

  return (
    <div className="overflow-hidden rounded-(--radius-lg) border border-(--line) bg-(--surface) shadow-(--shadow-md)">
      <div className="flex items-center justify-between gap-3 border-b border-(--line) bg-(--surface-sunken) px-4 py-3">
        <span>
          <span className="block font-medium">Dra. Ana Martins</span>
          <span className="block text-(length:--text-xs) text-(--ink-subtle)">
            sexta-feira · agenda da clínica
          </span>
        </span>
        {confirmada ? (
          <span className="shrink-0 rounded-(--radius-full) bg-(--success-soft) px-2.5 py-1 text-(length:--text-xs) font-medium text-(--success)">
            Marcação criada
          </span>
        ) : null}
      </div>

      <ul className="h-96 divide-y divide-(--line) overflow-y-auto">
        {horas.map((hora) => {
          const eOAlvo = hora === '16:30';

          return (
            <li key={hora} className="flex min-h-14 items-center gap-3 px-4 py-2">
              <span className="w-12 shrink-0 text-(length:--text-sm) tabular-nums text-(--ink-subtle)">
                {hora}
              </span>

              {eOAlvo && confirmada ? (
                <span className="marcacao-nova min-w-0 flex-1 rounded-(--radius-sm) border-l-[3px] border-(--brand) bg-(--brand-soft) px-3 py-2">
                  <span className="block truncate text-(length:--text-sm) font-medium">
                    Maria Silva
                  </span>
                  <span className="block truncate text-(length:--text-sm) text-(--ink-muted)">
                    Limpeza dentária · 16:30–17:15
                  </span>
                </span>
              ) : (
                <span
                  className={cn(
                    'min-w-0 flex-1 rounded-(--radius-sm) border border-dashed px-3 py-2 text-(length:--text-sm) transition-colors duration-(--duration-base)',
                    eOAlvo && aDestacar
                      ? 'border-(--brand) text-(--brand)'
                      : 'border-(--line) text-(--ink-subtle)',
                  )}
                >
                  livre
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
