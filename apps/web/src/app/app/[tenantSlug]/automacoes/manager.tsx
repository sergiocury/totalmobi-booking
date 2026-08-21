'use client';

import { useState, useTransition } from 'react';

import { Button, Card, cn } from '@totalmobi/ui';

import {
  acrescentarLembrete,
  alterarAntecedencia,
  alternarRegra,
  prever,
  removerRegra,
} from './actions';

/**
 * Ver e afinar o que sai.
 *
 * A antecedência é um seletor com valores redondos, não uma caixa de minutos.
 * Ninguém quer um lembrete "1437 minutos antes" — quer "um dia antes". Dar um
 * campo livre é convidar ao erro sem ganhar nada.
 */

interface Regra {
  id: string;
  type: string;
  channel: string;
  offset_minutes: number;
  is_active: boolean;
}

interface Envio {
  id: string;
  type: string;
  channel: string;
  status: string;
  scheduled_for: string;
  sent_at: string | null;
  attempts: number;
  error: string | null;
}

const TIPOS: Record<string, { nome: string; explica: string; temAntecedencia: boolean }> = {
  booking_created: {
    nome: 'Marcação registada',
    explica: 'Enviado assim que o cliente marca, com o link para gerir.',
    temAntecedencia: false,
  },
  booking_confirmed: {
    nome: 'Marcação confirmada',
    explica: 'Enviado quando a empresa confirma uma marcação pendente.',
    temAntecedencia: false,
  },
  reminder: {
    nome: 'Lembrete',
    explica: 'O aviso antes da hora. É o que mais reduz faltas.',
    temAntecedencia: true,
  },
  cancelled: {
    nome: 'Cancelamento',
    explica: 'Confirma ao cliente que a marcação ficou cancelada.',
    temAntecedencia: false,
  },
  rescheduled: {
    nome: 'Alteração de hora',
    explica: 'Avisa quando a marcação muda de dia ou de hora.',
    temAntecedencia: false,
  },
  no_show_followup: {
    nome: 'Seguimento de falta',
    explica:
      'Enviado DEPOIS da hora, a quem não apareceu. É o único aviso em que a antecedência conta para a frente.',
    temAntecedencia: true,
  },
};

const ANTECEDENCIAS = [
  { minutos: 120, rotulo: '2 horas antes' },
  { minutos: 240, rotulo: '4 horas antes' },
  { minutos: 720, rotulo: '12 horas antes' },
  { minutos: 1440, rotulo: '24 horas antes' },
  { minutos: 2880, rotulo: '48 horas antes' },
  { minutos: 4320, rotulo: '72 horas antes' },
  { minutos: 10080, rotulo: '1 semana antes' },
];

/**
 * Os que se acrescentam com um toque.
 *
 * 72 h para reorganizar o dia, 24 h para lembrar, 2 h para apanhar quem se
 * esqueceu. É a combinação que os três momentos de uma marcação pedem — e
 * chegam: um quarto lembrete deixa de avisar e passa a incomodar.
 */
const SUGESTOES = [
  { minutos: 4320, rotulo: '72 h' },
  { minutos: 2880, rotulo: '48 h' },
  { minutos: 1440, rotulo: '24 h' },
  { minutos: 720, rotulo: '12 h' },
  { minutos: 120, rotulo: '2 h' },
];

const ESTADOS: Record<string, { rotulo: string; tom: string }> = {
  pending: { rotulo: 'Por enviar', tom: 'text-(--ink-muted)' },
  processing: { rotulo: 'A enviar', tom: 'text-(--ink-muted)' },
  sent: { rotulo: 'Enviado', tom: 'text-(--success)' },
  delivered: { rotulo: 'Entregue', tom: 'text-(--success)' },
  read: { rotulo: 'Lido', tom: 'text-(--success)' },
  failed: { rotulo: 'Falhou', tom: 'text-(--danger)' },
  cancelled: { rotulo: 'Cancelado', tom: 'text-(--ink-subtle)' },
};

export function AutomacoesManager({
  tenantId,
  tenantSlug,
  regras,
  envios,
  podeGerir,
}: {
  tenantId: string;
  tenantSlug: string;
  regras: Regra[];
  envios: Envio[];
  podeGerir: boolean;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [previsao, setPrevisao] = useState<{
    tipo: string;
    assunto?: string;
    corpo?: string;
  } | null>(null);
  const [aTrabalhar, iniciar] = useTransition();

  const quando = (iso: string) =>
    new Intl.DateTimeFormat('pt-PT', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));

  return (
    <div className="mt-8 space-y-10">
      {erro ? (
        <p role="alert" className="text-(length:--text-sm) text-(--danger)">
          {erro}
        </p>
      ) : null}

      <section>
        <h2 className="mb-3 font-medium">O que é enviado</h2>

        <Card className="divide-y divide-(--line)">
          {regras.length === 0 ? (
            <p className="px-5 py-6 text-(length:--text-sm) text-(--ink-muted)">
              Ainda não há regras configuradas.
            </p>
          ) : (
            regras.map((regra) => {
              const tipo = TIPOS[regra.type] ?? {
                nome: regra.type,
                explica: '',
                temAntecedencia: false,
              };

              return (
                <div key={regra.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className={cn('font-medium', !regra.is_active && 'text-(--ink-subtle)')}>
                      {tipo.nome}
                    </p>
                    <p className="mt-0.5 text-(length:--text-sm) text-(--ink-muted)">
                      {tipo.explica}
                    </p>

                    {tipo.temAntecedencia ? (
                      <label className="mt-3 block">
                        <span className="mb-1 block text-(length:--text-sm) text-(--ink-muted)">
                          Antecedência
                        </span>
                        <select
                          value={regra.offset_minutes}
                          disabled={!podeGerir || !regra.is_active}
                          onChange={(e) => {
                            const minutos = Number(e.target.value);
                            setErro(null);
                            iniciar(async () => {
                              const r = await alterarAntecedencia(
                                tenantId,
                                tenantSlug,
                                regra.id,
                                minutos,
                              );
                              if (r.erro) setErro(r.erro);
                            });
                          }}
                          className="min-h-11 rounded-(--radius-sm) border border-(--line-strong) bg-(--surface) px-3 text-(length:--text-sm)"
                        >
                          {ANTECEDENCIAS.map((a) => (
                            <option key={a.minutos} value={a.minutos}>
                              {a.rotulo}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setErro(null);
                        iniciar(async () => {
                          const r = await prever(tenantId, regra.type);
                          if (r.erro) setErro(r.erro);
                          else
                            setPrevisao({
                              tipo: regra.type,
                              ...(r.assunto ? { assunto: r.assunto } : {}),
                              ...(r.corpo ? { corpo: r.corpo } : {}),
                            });
                        });
                      }}
                      className="min-h-11 text-(length:--text-sm) text-(--brand) underline"
                    >
                      Pré-visualizar
                    </button>

                    {regra.type === 'reminder' && podeGerir ? (
                      <button
                        type="button"
                        onClick={() => {
                          setErro(null);
                          iniciar(async () => {
                            const r = await removerRegra(tenantId, tenantSlug, regra.id);
                            if (r.erro) setErro(r.erro);
                          });
                        }}
                        className="min-h-11 text-(length:--text-sm) text-(--ink-subtle) underline"
                      >
                        Remover
                      </button>
                    ) : null}
                  </div>

                  <label className="flex min-h-11 shrink-0 items-center gap-2 text-(length:--text-sm)">
                    <input
                      type="checkbox"
                      checked={regra.is_active}
                      disabled={!podeGerir}
                      onChange={(e) => {
                        const activa = e.target.checked;
                        setErro(null);
                        iniciar(async () => {
                          const r = await alternarRegra(tenantId, tenantSlug, regra.id, activa);
                          if (r.erro) setErro(r.erro);
                        });
                      }}
                      className="size-5"
                    />
                    {regra.is_active ? 'Ativo' : 'Desligado'}
                  </label>
                </div>
              );
            })
          )}
        </Card>

        {podeGerir ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-(length:--text-sm) text-(--ink-muted)">
              Acrescentar lembrete:
            </span>
            {SUGESTOES.filter(
              (sug) => !regras.some((r) => r.type === 'reminder' && r.offset_minutes === sug.minutos),
            ).map((sug) => (
              <button
                key={sug.minutos}
                type="button"
                disabled={aTrabalhar}
                onClick={() => {
                  setErro(null);
                  iniciar(async () => {
                    const r = await acrescentarLembrete(tenantId, tenantSlug, sug.minutos);
                    if (r.erro) setErro(r.erro);
                  });
                }}
                className="min-h-11 rounded-(--radius-full) border border-(--line-strong) px-3 text-(length:--text-sm)"
              >
                + {sug.rotulo}
              </button>
            ))}
          </div>
        ) : null}

        <p className="mt-3 max-w-prose text-(length:--text-sm) text-pretty text-(--ink-subtle)">
          Os lembretes reduzem faltas, mas há um limite. Dois ou três chegam:
          um a preparar, um a lembrar, e quando muito um à última hora. A partir
          daí deixam de avisar e passam a incomodar — e o cliente que marca os
          seus emails como spam deixa de receber também o que interessa.
        </p>
      </section>

      {previsao ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6"
          onClick={() => setPrevisao(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Pré-visualização da mensagem"
            className="w-full max-w-lg rounded-t-(--radius-lg) bg-(--surface) p-6 sm:rounded-(--radius-lg)"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-(length:--text-sm) text-(--ink-muted)">
              {TIPOS[previsao.tipo]?.nome ?? previsao.tipo} · como o cliente recebe
            </p>

            <p className="mt-3 font-medium">{previsao.assunto}</p>

            <pre className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-(--radius-sm) bg-(--surface-sunken) p-4 font-sans text-(length:--text-sm)">
              {previsao.corpo}
            </pre>

            <p className="mt-3 text-(length:--text-sm) text-(--ink-subtle)">
              Dados de exemplo, mas pelo mesmo compositor que envia a sério — o que
              vê aqui é o que sai.
            </p>

            <Button variant="ghost" className="mt-4 w-full" onClick={() => setPrevisao(null)}>
              Fechar
            </Button>
          </div>
        </div>
      ) : null}

      <section>
        <h2 className="mb-3 font-medium">Últimos envios</h2>

        <Card className="overflow-x-auto">
          {envios.length === 0 ? (
            <p className="px-5 py-6 text-(length:--text-sm) text-(--ink-muted)">
              Ainda não saiu nada.
            </p>
          ) : (
            <table className="w-full text-(length:--text-sm)">
              <thead className="border-b border-(--line) text-left text-(--ink-muted)">
                <tr>
                  <th className="px-5 py-3 font-medium">Mensagem</th>
                  <th className="px-5 py-3 font-medium">Estado</th>
                  <th className="px-5 py-3 font-medium">Agendado</th>
                  <th className="px-5 py-3 font-medium">Enviado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--line)">
                {envios.map((envio) => {
                  const estado = ESTADOS[envio.status] ?? { rotulo: envio.status, tom: '' };
                  return (
                    <tr key={envio.id}>
                      <td className="px-5 py-3">
                        {TIPOS[envio.type]?.nome ?? envio.type}
                        {envio.attempts > 1 ? (
                          <span className="ml-2 text-(--ink-subtle)">
                            {envio.attempts} tentativas
                          </span>
                        ) : null}
                        {envio.error ? (
                          <span className="mt-0.5 block max-w-xs truncate text-(--danger)">
                            {envio.error}
                          </span>
                        ) : null}
                      </td>
                      <td className={cn('px-5 py-3', estado.tom)}>{estado.rotulo}</td>
                      <td className="px-5 py-3 text-(--ink-muted)">
                        {quando(envio.scheduled_for)}
                      </td>
                      <td className="px-5 py-3 text-(--ink-muted)">
                        {envio.sent_at ? quando(envio.sent_at) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </section>
    </div>
  );
}
