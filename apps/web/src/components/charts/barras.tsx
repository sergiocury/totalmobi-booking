'use client';

import { useId, useState } from 'react';

import { cn } from '@totalmobi/ui';

/**
 * Barras de série única.
 *
 * TRÊS DECISÕES, E NENHUMA É DE GOSTO
 *
 * 1. **Uma cor, não uma paleta.** Estes gráficos comparam magnitude, não
 *    distinguem identidades. Uma cor por barra faria o leitor procurar
 *    significado onde não há — e obrigaria a uma paleta categórica que teria de
 *    passar em testes de daltonismo para não dizer nada de útil.
 *
 * 2. **Sem legenda.** Há uma série só; o título já diz o que está desenhado.
 *    Uma caixa com um quadradinho repetiria o título e ocuparia espaço.
 *
 * 3. **Rótulos ao pé da barra, não em cima de todas.** Um número em cada barra
 *    é ruído que ninguém lê. O eixo e a tabela levam o resto.
 *
 * ACESSIBILIDADE POR CONSTRUÇÃO
 *
 * Cada barra é um `<li>` focável com `tabindex`, com o valor no texto acessível
 * — quem navega por teclado ou por leitor de ecrã ouve "Março, 142 marcações"
 * sem depender de ver a altura. E há sempre uma tabela por baixo, que é o que
 * torna o gráfico opcional em vez de obrigatório.
 */

export interface Ponto {
  rotulo: string;
  valor: number;
  /** Segundo valor, mostrado só na dica — nunca desenhado como barra. */
  detalhe?: string;
}

export function Barras({
  dados,
  titulo,
  sufixo = '',
  horizontal = false,
  altura = 200,
}: {
  dados: Ponto[];
  titulo: string;
  sufixo?: string;
  horizontal?: boolean;
  altura?: number;
}) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const id = useId();

  if (dados.length === 0) {
    return (
      <p className="py-10 text-center text-(length:--text-sm) text-(--ink-muted)">
        Sem dados neste período.
      </p>
    );
  }

  const maximo = Math.max(...dados.map((d) => d.valor), 1);
  // Arredondar o topo para um número redondo: um eixo que acaba em 137 obriga a
  // ler o número; um que acaba em 150 lê-se de relance.
  const topo = arredondarParaCima(maximo);

  const total = dados.reduce((s, d) => s + d.valor, 0);
  const maiorRotulo = dados.reduce((a, b) => (a.valor >= b.valor ? a : b));

  if (horizontal) {
    return (
      <figure aria-labelledby={`${id}-t`}>
        <figcaption id={`${id}-t`} className="sr-only">
          {titulo}
        </figcaption>

        <ul className="space-y-2">
          {dados.map((d, i) => (
            <li
              key={d.rotulo}
              tabIndex={0}
              // Sem isto, quem navega por teclado recebe o foco e **ouve
              // silêncio**: o rótulo e o valor estão em elementos separados, e
              // a barra em si não tem texto. Focável e mudo é pior do que não
              // focável.
              aria-label={`${d.rotulo}: ${d.valor.toLocaleString('pt-PT')}${sufixo}${d.detalhe ? `, ${d.detalhe}` : ''}`}
              onFocus={() => setAtivo(i)}
              onBlur={() => setAtivo(null)}
              onMouseEnter={() => setAtivo(i)}
              onMouseLeave={() => setAtivo(null)}
              // `min-h-11` = 44 px. Uma linha de 20 px é um alvo que ninguém
              // acerta com o polegar.
              className="grid min-h-11 grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 rounded-(--radius-sm) outline-none focus-visible:ring-2 focus-visible:ring-(--brand)"
            >
              <span className="truncate text-(length:--text-sm) text-(--ink-muted)" title={d.rotulo}>
                {d.rotulo}
              </span>

              <span className="relative h-4 rounded-(--radius-sm) bg-(--surface-sunken)">
                <span
                  className={cn(
                    'absolute inset-y-0 left-0 rounded-r-(--radius-sm) bg-(--brand) transition-opacity',
                    ativo !== null && ativo !== i && 'opacity-45',
                  )}
                  style={{ width: `${(d.valor / topo) * 100}%` }}
                />
              </span>

              <span className="tabular-nums text-(length:--text-sm) font-medium">
                {d.valor.toLocaleString('pt-PT')}
                {sufixo}
              </span>
            </li>
          ))}
        </ul>

        <Rodape total={total} maior={maiorRotulo} sufixo={sufixo} />
        <Tabela dados={dados} titulo={titulo} sufixo={sufixo} />
      </figure>
    );
  }

  return (
    <figure aria-labelledby={`${id}-t`}>
      <figcaption id={`${id}-t`} className="sr-only">
        {titulo}
      </figcaption>

      <div className="overflow-x-auto">
        {/* `items-end` e uma linha de base única: as barras crescem todas do
            mesmo sítio, que é o que torna as alturas comparáveis. */}
        <ul
          className="flex min-w-fit items-end gap-1 border-b border-(--line)"
          style={{ height: altura }}
        >
          {dados.map((d, i) => (
            <li
              key={d.rotulo}
              tabIndex={0}
              aria-label={`${d.rotulo}: ${d.valor.toLocaleString('pt-PT')}${sufixo}${d.detalhe ? `, ${d.detalhe}` : ''}`}
              onFocus={() => setAtivo(i)}
              onBlur={() => setAtivo(null)}
              onMouseEnter={() => setAtivo(i)}
              onMouseLeave={() => setAtivo(null)}
              className="group relative flex h-full min-w-9 flex-1 flex-col justify-end rounded-t-(--radius-sm) outline-none focus-visible:ring-2 focus-visible:ring-(--brand)"
            >
              {ativo === i ? (
                <span
                  role="status"
                  className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-(--radius-sm) bg-(--ink) px-2 py-1 text-(length:--text-sm) text-(--ink-inverted)"
                >
                  {d.rotulo}: {d.valor.toLocaleString('pt-PT')}
                  {sufixo}
                  {d.detalhe ? ` · ${d.detalhe}` : ''}
                </span>
              ) : null}

              <span
                className={cn(
                  // Cantos arredondados só em cima: a base fica quadrada,
                  // ancorada na linha de base.
                  'mx-auto w-full max-w-6 rounded-t-(--radius-sm) bg-(--brand) transition-opacity',
                  ativo !== null && ativo !== i && 'opacity-45',
                )}
                style={{ height: `${Math.max((d.valor / topo) * 100, d.valor > 0 ? 2 : 0)}%` }}
              />
            </li>
          ))}
        </ul>

        <ul className="flex min-w-fit gap-1" aria-hidden>
          {dados.map((d) => (
            <li
              key={d.rotulo}
              className="min-w-9 flex-1 pt-1.5 text-center text-(length:--text-sm) text-(--ink-subtle)"
            >
              {d.rotulo}
            </li>
          ))}
        </ul>
      </div>

      <Rodape total={total} maior={maiorRotulo} sufixo={sufixo} />
      <Tabela dados={dados} titulo={titulo} sufixo={sufixo} />
    </figure>
  );
}

/**
 * O único rótulo direto que o gráfico tem.
 *
 * Assinala o extremo — que é a coisa que o leitor procura — e o total. Marcar
 * todas as barras seria devolver a tabela em forma de desenho.
 */
function Rodape({ total, maior, sufixo }: { total: number; maior: Ponto; sufixo: string }) {
  return (
    <p className="mt-3 text-(length:--text-sm) text-(--ink-muted)">
      Total {total.toLocaleString('pt-PT')}
      {sufixo} · máximo em <strong className="font-medium text-(--ink)">{maior.rotulo}</strong> com{' '}
      {maior.valor.toLocaleString('pt-PT')}
      {sufixo}
    </p>
  );
}

/**
 * A tabela.
 *
 * Fechada por omissão, mas presente sempre. É o que garante que a informação
 * não está refém do gráfico: quem usa leitor de ecrã, quem imprime, e quem
 * simplesmente quer o número exato têm todos por onde ir.
 */
function Tabela({ dados, titulo, sufixo }: { dados: Ponto[]; titulo: string; sufixo: string }) {
  return (
    <details className="mt-3">
      <summary className="min-h-11 cursor-pointer text-(length:--text-sm) text-(--ink-muted)">
        Ver como tabela
      </summary>

      <table className="mt-2 w-full text-(length:--text-sm)">
        <caption className="sr-only">{titulo}</caption>
        <thead className="border-b border-(--line) text-left text-(--ink-muted)">
          <tr>
            <th scope="col" className="py-1.5 font-medium">
              Categoria
            </th>
            <th scope="col" className="py-1.5 text-right font-medium">
              Valor
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-(--line)">
          {dados.map((d) => (
            <tr key={d.rotulo}>
              <th scope="row" className="py-1.5 text-left font-normal">
                {d.rotulo}
              </th>
              <td className="py-1.5 text-right tabular-nums">
                {d.valor.toLocaleString('pt-PT')}
                {sufixo}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function arredondarParaCima(n: number): number {
  if (n <= 5) return 5;
  const magnitude = 10 ** Math.floor(Math.log10(n));
  return Math.ceil(n / (magnitude / 2)) * (magnitude / 2);
}
