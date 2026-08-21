'use client';

import { useEffect, useState } from 'react';

import { adjustForContrast, checkContrast, contrastLevel, readableTextOn } from '@totalmobi/shared';
import { Badge } from '@totalmobi/ui';

/**
 * Demonstração da validação de contraste.
 *
 * É um componente de cliente e não de servidor porque tem de calcular contra a
 * superfície **realmente em uso**. A primeira versão comparava tudo com
 * `#FFFFFF` fixo, o que ficava errado no modo escuro — logo na secção cujo
 * propósito é provar que a validação funciona. Uma demonstração que mente
 * sobre a própria funcionalidade é pior do que não a ter.
 */

const MARCAS = [
  { name: 'Clínica Sorriso', color: '#0E7C86' },
  { name: 'Studio Bella', color: '#B0446A' },
  { name: 'Marca amarela (problemática)', color: '#FFE14D' },
  { name: 'Verde-água claro', color: '#7FFFD4' },
];

/** Normaliza `rgb(…)` ou `#abc` para `#RRGGBB`. */
function toHex(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('#')) {
    return trimmed.length === 4
      ? `#${trimmed
          .slice(1)
          .split('')
          .map((c) => c + c)
          .join('')}`
      : trimmed;
  }
  const parts = trimmed.match(/\d+/g);
  if (!parts || parts.length < 3) return '#FFFFFF';
  return `#${parts
    .slice(0, 3)
    .map((n) => Number(n).toString(16).padStart(2, '0'))
    .join('')}`.toUpperCase();
}

export function ContrastDemo() {
  const [surface, setSurface] = useState('#FFFFFF');

  useEffect(() => {
    const read = () => {
      const value = getComputedStyle(document.documentElement).getPropertyValue('--surface');
      setSurface(toHex(value));
    };

    read();

    // Reagir à troca de tema na barra de revisão, sem recarregar.
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <p className="mb-5 max-w-prose text-pretty text-(--ink-muted)">
        A cor da marca do cliente nunca é usada em bruto. Se não atingir 4,5:1 sobre o fundo, a
        plataforma propõe a cor mais próxima que atinge — mantendo o matiz, para a marca continuar
        reconhecível. Os valores abaixo são calculados contra o fundo em uso agora ({surface}).
      </p>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-(length:--text-sm)">
          <caption className="sr-only">
            Cores de marca, o contraste que dão sobre o fundo atual, e a correção aplicada
          </caption>
          <thead>
            <tr className="border-b border-(--line) text-left">
              <th scope="col" className="py-2.5 pr-4 font-medium">Marca</th>
              <th scope="col" className="py-2.5 pr-4 font-medium">Escolhida</th>
              <th scope="col" className="py-2.5 pr-4 font-medium">Rácio</th>
              <th scope="col" className="py-2.5 pr-4 font-medium">Usada</th>
              <th scope="col" className="py-2.5 font-medium">Botão</th>
            </tr>
          </thead>
          <tbody>
            {MARCAS.map((item) => {
              const original = checkContrast(item.color, surface)!;
              const adjusted = adjustForContrast(item.color, surface, 4.5)!;
              const ink = readableTextOn(item.color)!;

              return (
                <tr key={item.color} className="border-b border-(--line)">
                  <th scope="row" className="py-3 pr-4 text-left font-normal">
                    {item.name}
                  </th>
                  <td className="py-3 pr-4">
                    <span className="inline-flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="size-4 shrink-0 rounded-full border border-(--line)"
                        style={{ background: item.color }}
                      />
                      <code className="text-(length:--text-xs)">{item.color}</code>
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <Badge tone={original.passes ? 'success' : 'danger'}>
                      {original.ratio.toFixed(2)}:1 · {contrastLevel(original.ratio)}
                    </Badge>
                  </td>
                  <td className="py-3 pr-4">
                    <span className="inline-flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="size-4 shrink-0 rounded-full border border-(--line)"
                        style={{ background: adjusted.color }}
                      />
                      <code className="text-(length:--text-xs)">{adjusted.color}</code>
                    </span>
                    {adjusted.adjusted ? (
                      <span className="mt-1 block text-(length:--text-2xs) text-(--ink-subtle)">
                        {adjusted.meetsMinimum
                          ? `corrigida (${adjusted.ratio.toFixed(2)}:1)`
                          : 'este fundo não permite texto legível'}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-3">
                    {/* O texto dentro do botão é calculado, não assumido:
                        uma marca clara precisa de preto, uma escura de branco. */}
                    <span
                      className="inline-flex h-9 items-center rounded-(--radius-full) px-4 text-(length:--text-sm) font-medium"
                      style={{ background: item.color, color: ink }}
                    >
                      Confirmar
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
