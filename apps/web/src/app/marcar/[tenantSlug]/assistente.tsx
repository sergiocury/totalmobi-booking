'use client';

import { useEffect, useRef, useState, useTransition } from 'react';

import { falarComAssistente, type TurnoPublico } from './assistente-actions';

/**
 * O assistente, na página da clínica.
 *
 * POR OMISSÃO ESTÁ FECHADO
 *
 * Os passos continuam a ser o caminho principal: quatro toques, sem escrever
 * nada, que é o que converte melhor em telemóvel. Isto é a porta para quem
 * prefere escrever — e para quem chega vindo da landing, onde viu exatamente
 * esta conversa como demonstração.
 *
 * QUANDO A CONVERSA ACHA A HORA, SAI DE CENA
 *
 * Não pede nome nem telemóvel: entrega a escolha ao formulário e fecha-se. É a
 * divisão que evita ter duas recolhas de consentimento no mesmo produto — e a
 * segunda seria sempre a que ficava por atualizar.
 */
export function Assistente({
  tenantSlug,
  onEscolha,
}: {
  tenantSlug: string;
  onEscolha: (escolha: NonNullable<TurnoPublico['escolha']>) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [conversaId, setConversaId] = useState<string | undefined>();
  const [linhas, setLinhas] = useState<{ de: 'pessoa' | 'bot'; texto: string }[]>([]);
  const [opcoes, setOpcoes] = useState<string[]>([]);
  const [rascunho, setRascunho] = useState('');
  const [aPensar, comecar] = useTransition();

  const fim = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);

  // Rola a caixa, e só a caixa. `scrollIntoView` subiria pela página inteira —
  // foi o que fez a landing saltar para o meio, e a lição vale aqui.
  useEffect(() => {
    const caixa = fim.current?.parentElement;
    if (!caixa) return;
    caixa.scrollTo({ top: caixa.scrollHeight, behavior: 'smooth' });
  }, [linhas, aPensar]);

  useEffect(() => {
    if (aberto) campo.current?.focus();
  }, [aberto]);

  function enviar(texto: string) {
    const limpo = texto.trim();
    if (!limpo || aPensar) return;

    setLinhas((l) => [...l, { de: 'pessoa', texto: limpo }]);
    setRascunho('');
    setOpcoes([]);

    comecar(async () => {
      const r = await falarComAssistente({ tenantSlug, mensagem: limpo, conversaId });

      if (r.erro) {
        setLinhas((l) => [...l, { de: 'bot', texto: r.erro! }]);
        return;
      }

      setConversaId(r.conversaId);
      setLinhas((l) => [...l, { de: 'bot', texto: r.texto }]);
      setOpcoes(r.opcoes ?? []);

      if (r.escolha) {
        onEscolha(r.escolha);
        // Um instante para se ler a última frase antes de o painel fechar.
        setTimeout(() => setAberto(false), 1200);
      }
    });
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => {
          setAberto(true);
          if (linhas.length === 0) {
            setLinhas([
              {
                de: 'bot',
                texto: 'Olá. Diga-me o que precisa e quando lhe dá jeito — eu procuro a hora.',
              },
            ]);
          }
        }}
        className="flex w-full min-h-12 items-center justify-center gap-2 rounded-(--radius-md) border border-(--line-strong) px-5 text-(length:--text-sm) font-medium transition-colors duration-(--duration-fast) hover:bg-(--surface)"
      >
        <span aria-hidden>💬</span>
        Prefere escrever? Fale com o assistente
      </button>
    );
  }

  return (
    <section
      aria-label="Assistente"
      className="overflow-hidden rounded-(--radius-md) border border-(--line) bg-(--surface)"
    >
      <div className="flex items-center justify-between border-b border-(--line) px-4 py-3">
        <p className="text-(length:--text-sm) font-medium">Assistente</p>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="min-h-9 cursor-pointer px-2 text-(length:--text-sm) text-(--ink-muted) hover:text-(--ink)"
        >
          Fechar
        </button>
      </div>

      <div
        className="flex max-h-80 flex-col gap-2.5 overflow-y-auto px-4 py-4"
        role="log"
        aria-live="polite"
      >
        {linhas.map((l, i) => (
          <p
            key={i}
            className={
              l.de === 'pessoa'
                ? 'ml-auto max-w-[85%] rounded-(--radius-md) bg-(--brand-soft) px-3.5 py-2 text-(length:--text-sm)'
                : 'mr-auto max-w-[85%] rounded-(--radius-md) bg-(--surface-sunken) px-3.5 py-2 text-(length:--text-sm) whitespace-pre-line'
            }
          >
            {l.texto}
          </p>
        ))}

        {aPensar ? (
          <p className="mr-auto text-(length:--text-sm) text-(--ink-subtle)">a escrever…</p>
        ) : null}

        <div ref={fim} />
      </div>

      {opcoes.length > 0 ? (
        <div className="flex flex-wrap gap-2 border-t border-(--line) px-4 py-3">
          {opcoes.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => enviar(o)}
              className="min-h-9 cursor-pointer rounded-(--radius-full) border border-(--line-strong) px-3.5 text-(length:--text-sm) hover:bg-(--surface-sunken)"
            >
              {o}
            </button>
          ))}
        </div>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          enviar(rascunho);
        }}
        className="flex gap-2 border-t border-(--line) px-4 py-3"
      >
        <input
          ref={campo}
          value={rascunho}
          onChange={(e) => setRascunho(e.target.value)}
          maxLength={500}
          placeholder="Queria marcar uma limpeza na sexta…"
          aria-label="Mensagem"
          className="min-h-11 flex-1 rounded-(--radius-sm) border border-(--line-strong) bg-(--surface) px-3 text-(length:--text-sm)"
        />
        <button
          type="submit"
          disabled={aPensar || !rascunho.trim()}
          className="min-h-11 cursor-pointer rounded-(--radius-sm) bg-(--brand-solid) px-4 text-(length:--text-sm) font-medium text-(--brand-ink) disabled:opacity-50"
        >
          Enviar
        </button>
      </form>
    </section>
  );
}
