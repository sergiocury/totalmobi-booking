'use client';

import { useState, useTransition } from 'react';

import { featureLabel, type FeatureState } from '@totalmobi/shared';
import { Badge, Card, cn } from '@totalmobi/ui';

import { setTenantFeature } from '../actions';

/**
 * Interruptores de funcionalidade, com três estados e não dois.
 *
 * `Plano · Ligar · Desligar` em vez de um simples on/off. A diferença importa:
 * "desligado à mão" e "não vem no plano" produzem o mesmo resultado hoje mas
 * comportam-se de forma oposta amanhã — se a empresa subir de plano, o primeiro
 * continua desligado e o segundo passa a ligado.
 *
 * Um interruptor de dois estados obrigaria a escolher entre gravar sempre uma
 * sobreposição (e congelar a empresa no estado atual para sempre) ou nunca a
 * gravar (e não conseguir desligar nada). Nenhuma das duas serve.
 */

const OPCOES = [
  { value: null, label: 'Plano' },
  { value: true, label: 'Ligar' },
  { value: false, label: 'Desligar' },
] as const;

export function FeatureList({ tenantId, states }: { tenantId: string; states: FeatureState[] }) {
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [aMudar, setAMudar] = useState<string | null>(null);

  function mudar(key: string, valor: boolean | null) {
    setErro(null);
    setAMudar(key);
    startTransition(async () => {
      const resultado = await setTenantFeature(tenantId, key, valor);
      if (resultado.error) setErro(resultado.error);
      setAMudar(null);
    });
  }

  return (
    <>
      {erro ? (
        <p
          role="alert"
          className="mb-4 rounded-(--radius-md) border border-(--danger) bg-(--danger-soft) px-4 py-3 text-(length:--text-sm)"
        >
          {erro}
        </p>
      ) : null}

      <Card className="divide-y divide-(--line)">
        {states.map((state) => {
          const atual = state.source === 'plan' ? null : state.enabled;
          const aGuardar = pending && aMudar === state.key;

          return (
            <div
              key={state.key}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-6 py-4"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn('font-medium', !state.enabled && 'text-(--ink-muted)')}>
                    {featureLabel(state.key)}
                  </span>
                  {state.source === 'override_on' ? (
                    <Badge tone="brand">ligada à mão</Badge>
                  ) : null}
                  {state.source === 'override_off' ? (
                    <Badge tone="warning">desligada à mão</Badge>
                  ) : null}
                </div>
                <p className="mt-0.5 text-(length:--text-sm) text-(--ink-subtle)">
                  {state.inPlan ? 'Incluída no plano' : 'Fora do plano'}
                </p>
              </div>

              <fieldset
                disabled={aGuardar}
                className="inline-flex items-center gap-0.5 rounded-(--radius-full) border border-(--line) bg-(--surface-sunken) p-0.5 disabled:opacity-50"
              >
                <legend className="sr-only">{featureLabel(state.key)}</legend>
                {OPCOES.map((opcao) => {
                  const ativo = atual === opcao.value;
                  return (
                    <label
                      key={String(opcao.value)}
                      className={cn(
                        'inline-flex cursor-pointer items-center rounded-(--radius-full) px-3 py-1.5',
                        'text-(length:--text-sm) font-medium whitespace-nowrap',
                        'transition-colors duration-(--duration-fast)',
                        'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-(--focus-ring)',
                        ativo
                          ? 'bg-(--surface) text-(--ink) shadow-(--shadow-sm)'
                          : 'text-(--ink-muted) hover:text-(--ink)',
                      )}
                    >
                      <input
                        type="radio"
                        name={`f-${state.key}`}
                        checked={ativo}
                        onChange={() => mudar(state.key, opcao.value)}
                        className="sr-only"
                      />
                      {opcao.label}
                    </label>
                  );
                })}
              </fieldset>
            </div>
          );
        })}
      </Card>
    </>
  );
}
