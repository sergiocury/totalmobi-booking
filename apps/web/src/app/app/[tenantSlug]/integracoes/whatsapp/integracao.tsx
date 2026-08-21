'use client';

import { useState, useTransition } from 'react';

import { Button, Card, cn } from '@totalmobi/ui';

import { desligarConta, ligarConta } from './actions';

/**
 * O estado da ligação, e como mudá-lo.
 *
 * O ecrã distingue com clareza dois caminhos que não são equivalentes:
 *
 *  • **o do cliente** — pela Meta, sem partilhar credenciais connosco. É o
 *    correto, e ainda não está construído.
 *  • **o da Totalmobi** — colar um token, só para o nosso número de
 *    demonstração.
 *
 * Não esconder o segundo nem o disfarçar de primeiro: um dono de clínica que
 * veja uma caixa a pedir o token do WhatsApp dele deve perceber, sem ler as
 * letras pequenas, que aquilo não é para ele.
 */

interface EstadoLigacao {
  display_phone_number: string | null;
  verified_name: string | null;
  status: string | null;
  quality_rating: string | null;
  messaging_limit: string | null;
  connected_at: string | null;
  last_error: string | null;
  tem_token: boolean | null;
}

interface Conversa {
  id: string;
  external_id: string;
  status: string;
  current_state: string;
  last_inbound_at: string | null;
  last_message_at: string | null;
}

const ESTADOS: Record<string, { rotulo: string; tom: string }> = {
  connected: { rotulo: 'Ligado', tom: 'text-(--success)' },
  pending: { rotulo: 'Por concluir', tom: 'text-(--warning)' },
  suspended: { rotulo: 'Suspenso pela Meta', tom: 'text-(--danger)' },
  error: { rotulo: 'Com erro', tom: 'text-(--danger)' },
};

/** A janela de 24 h, vista do lado de cá. */
function janela(ultimaEntrada: string | null): { aberta: boolean; texto: string } {
  if (!ultimaEntrada) {
    return { aberta: false, texto: 'Sem mensagem do cliente — só sai template aprovado' };
  }

  const restam = 24 * 60 - Math.floor((Date.now() - new Date(ultimaEntrada).getTime()) / 60_000);

  if (restam <= 0) {
    return { aberta: false, texto: 'Janela fechada — só sai template aprovado' };
  }

  const horas = Math.floor(restam / 60);
  return {
    aberta: true,
    texto: horas > 0 ? `Janela aberta, faltam ${horas} h` : `Janela aberta, faltam ${restam} min`,
  };
}

export function Integracao({
  tenantId,
  tenantSlug,
  estado,
  conversas,
  ehAdminDaPlataforma,
}: {
  tenantId: string;
  tenantSlug: string;
  estado: EstadoLigacao | null;
  conversas: Conversa[];
  ehAdminDaPlataforma: boolean;
}) {
  const [wabaId, setWabaId] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [token, setToken] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aEnviar, iniciar] = useTransition();

  const info = estado?.status ? (ESTADOS[estado.status] ?? { rotulo: estado.status, tom: '' }) : null;

  return (
    <div className="mt-8 space-y-8">
      {erro ? (
        <p role="alert" className="text-(length:--text-sm) text-(--danger)">
          {erro}
        </p>
      ) : null}

      <Card className="px-5 py-4">
        {estado ? (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <p className="font-medium">
                {estado.verified_name ?? estado.display_phone_number ?? 'Conta ligada'}
              </p>
              <p className={cn('text-(length:--text-sm)', info?.tom)}>{info?.rotulo}</p>
            </div>

            <dl className="mt-3 grid gap-x-8 gap-y-1.5 text-(length:--text-sm) sm:grid-cols-2">
              {estado.display_phone_number ? (
                <Linha termo="Número">{estado.display_phone_number}</Linha>
              ) : null}
              {estado.quality_rating ? (
                <Linha termo="Qualidade">{estado.quality_rating}</Linha>
              ) : null}
              {estado.messaging_limit ? (
                <Linha termo="Limite">{estado.messaging_limit}</Linha>
              ) : null}
              <Linha termo="Credenciais">
                {estado.tem_token ? 'Guardadas e cifradas' : 'Em falta'}
              </Linha>
            </dl>

            {estado.last_error ? (
              <p className="mt-3 text-(length:--text-sm) text-(--danger)">{estado.last_error}</p>
            ) : null}

            <Button
              variant="ghost"
              className="mt-4"
              loading={aEnviar}
              onClick={() => {
                setErro(null);
                iniciar(async () => {
                  const r = await desligarConta(tenantId, tenantSlug);
                  if (r.erro) setErro(r.erro);
                });
              }}
            >
              Desligar
            </Button>
          </>
        ) : (
          <>
            <p className="font-medium">Ainda não está ligado</p>
            <p className="mt-2 max-w-prose text-pretty text-(length:--text-sm) text-(--ink-muted)">
              A ligação faz-se pela Meta: autentica-se na janela deles e as
              credenciais ficam entre si e a Meta — a Totalmobi nunca as vê.
              Esse passo ainda não está disponível.
            </p>
          </>
        )}
      </Card>

      {ehAdminDaPlataforma && !estado ? (
        <Card className="border-(--warning) px-5 py-4">
          <p className="font-medium">Ligação manual — só Totalmobi</p>
          <p className="mt-1 max-w-prose text-pretty text-(length:--text-sm) text-(--ink-muted)">
            Caminho interino para o número de demonstração. Não deve ser usado
            com clientes: pedir o token a um cliente é exatamente o que o
            Embedded Signup existe para evitar.
          </p>

          <div className="mt-4 space-y-3">
            <Campo rotulo="WABA ID" valor={wabaId} onChange={setWabaId} />
            <Campo rotulo="Phone Number ID" valor={phoneNumberId} onChange={setPhoneNumberId} />
            <Campo rotulo="Token de acesso" valor={token} onChange={setToken} segredo />
          </div>

          <Button
            className="mt-4"
            loading={aEnviar}
            disabled={!wabaId || !phoneNumberId || token.length < 20}
            onClick={() => {
              setErro(null);
              iniciar(async () => {
                const r = await ligarConta(tenantId, tenantSlug, {
                  wabaId,
                  phoneNumberId,
                  accessToken: token,
                });
                if (r.erro) setErro(r.erro);
                else setToken('');
              });
            }}
          >
            Ligar
          </Button>
        </Card>
      ) : null}

      <section>
        <h2 className="mb-3 font-medium">Conversas recentes</h2>

        <Card className="divide-y divide-(--line)">
          {conversas.length === 0 ? (
            <p className="px-5 py-6 text-(length:--text-sm) text-(--ink-muted)">
              Ainda não há conversas.
            </p>
          ) : (
            conversas.map((c) => {
              const j = janela(c.last_inbound_at);
              return (
                <div key={c.id} className="flex flex-wrap items-baseline gap-x-4 px-5 py-3">
                  <span className="font-medium">+{c.external_id}</span>
                  <span className="text-(length:--text-sm) text-(--ink-muted)">
                    {c.current_state}
                  </span>
                  <span
                    className={cn(
                      'ml-auto text-(length:--text-sm)',
                      j.aberta ? 'text-(--success)' : 'text-(--ink-subtle)',
                    )}
                  >
                    {j.texto}
                  </span>
                </div>
              );
            })
          )}
        </Card>
      </section>
    </div>
  );
}

function Linha({ termo, children }: { termo: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="text-(--ink-muted)">{termo}:</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Campo({
  rotulo,
  valor,
  onChange,
  segredo,
}: {
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  segredo?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-(length:--text-sm) text-(--ink-muted)">{rotulo}</span>
      <input
        // `password` mesmo num ecrã de administração: evita que o token fique
        // legível numa partilha de ecrã ou numa captura para suporte.
        type={segredo ? 'password' : 'text'}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        className="min-h-11 w-full rounded-(--radius-sm) border border-(--line-strong) bg-(--surface) px-3 font-mono text-(length:--text-sm)"
      />
    </label>
  );
}
