'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';

import { Button, cn } from '@totalmobi/ui';

import { marcar, obterHorarios, type SlotPublico } from './actions';

/**
 * O fluxo de marcação.
 *
 * Cinco passos, todos num ecrã de telemóvel, sem navegação entre páginas: cada
 * mudança de rota é uma oportunidade de perder quem está a marcar.
 *
 * A CONTAGEM DE TOQUES
 *
 *   serviço (1) → profissional já vem em "qualquer" → dia (2) → hora (3)
 *   → escrever nome e telemóvel → confirmar (4)
 *
 * Quatro toques mais a escrita. O passo do profissional só custa um toque a
 * quem tem preferência — que é a minoria.
 *
 * A HORA OCUPADA ENTRETANTO NÃO É UM ERRO
 *
 * É uma corrida perdida por segundos, e acontece mesmo: foi para isso que o M8
 * levou vinte pedidos em paralelo. Quando acontece, volta-se à grelha com as
 * horas atualizadas e uma frase que explica. Mostrar "erro ao marcar" faria
 * parecer avaria o que é funcionamento normal.
 */

interface Servico {
  id: string;
  nome: string;
  descricao: string | null;
  duracao: number;
  preco: number | null;
  moeda: string | null;
}

interface Profissional {
  id: string;
  nome: string;
  cargo: string | null;
  foto: string | null;
  servicos: string[];
}

const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

/** `YYYY-MM-DD` a partir de um deslocamento em dias a contar de hoje. */
function diaEm(deslocamento: number): { iso: string; diaSemana: number; dia: number; mes: number } {
  const d = new Date();
  d.setDate(d.getDate() + deslocamento);

  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { iso, diaSemana: d.getDay(), dia: d.getDate(), mes: d.getMonth() };
}

function precoFormatado(preco: number | null, moeda: string | null): string | null {
  if (preco === null) return null;

  try {
    return new Intl.NumberFormat('pt-PT', {
      style: 'currency',
      currency: moeda ?? 'EUR',
      maximumFractionDigits: 2,
    }).format(preco);
  } catch {
    return `${preco}`;
  }
}

export function Marcacao({
  locationId,
  timezone,
  maxAdvanceDays,
  headline,
  servicos,
  equipa,
}: {
  locationId: string;
  timezone: string;
  maxAdvanceDays: number;
  headline: string | null;
  servicos: Servico[];
  equipa: Profissional[];
}) {
  const [servicoId, setServicoId] = useState<string | null>(
    servicos.length === 1 ? servicos[0]!.id : null,
  );
  const [staffId, setStaffId] = useState<string | null>(null);
  const [data, setData] = useState<string>(() => diaEm(0).iso);
  const [slot, setSlot] = useState<SlotPublico | null>(null);

  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [lembretes, setLembretes] = useState(false);

  const [horarios, setHorarios] = useState<SlotPublico[]>([]);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [aCarregar, setACarregar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<{ token?: string | undefined; status: string } | null>(null);
  const [aEnviar, iniciarEnvio] = useTransition();

  const servico = servicos.find((s) => s.id === servicoId) ?? null;

  // A chave de idempotência nasce **antes** do envio e vive enquanto a escolha
  // não muda. Se a rede falhar a meio e a pessoa carregar outra vez, o servidor
  // reconhece o pedido e devolve a mesma marcação em vez de criar outra.
  const chave = useRef<string>(crypto.randomUUID());

  const dias = useMemo(
    () => Array.from({ length: Math.min(maxAdvanceDays, 30) }, (_, i) => diaEm(i)),
    [maxAdvanceDays],
  );

  const equipaDoServico = useMemo(
    () => (servicoId ? equipa.filter((p) => p.servicos.includes(servicoId)) : []),
    [equipa, servicoId],
  );

  useEffect(() => {
    if (!servicoId) return;

    let cancelado = false;
    setACarregar(true);
    setSlot(null);
    setMotivo(null);

    obterHorarios(locationId, servicoId, data, staffId ?? undefined)
      .then((r) => {
        if (cancelado) return;
        setHorarios(r.slots ?? []);
        setMotivo(r.motivo ?? r.erro ?? null);
      })
      .finally(() => {
        if (!cancelado) setACarregar(false);
      });

    // Cancelar evita a corrida de quem toca em três dias seguidos e recebe as
    // respostas fora de ordem — o clássico "escolhi quarta e apareceram as
    // horas de terça".
    return () => {
      cancelado = true;
    };
  }, [locationId, servicoId, data, staffId]);

  function confirmar() {
    if (!servicoId || !slot) return;

    setErro(null);
    iniciarEnvio(async () => {
      const r = await marcar({
        locationId,
        serviceId: servicoId,
        ...(staffId ? { staffId } : {}),
        startAt: slot.iso,
        nome,
        telefone,
        aceitaLembretes: lembretes,
        idempotencyKey: chave.current,
      });

      if (r.ok) {
        setFeito({ token: r.ok.accessToken, status: r.ok.status });
        return;
      }

      setErro(r.erro ?? 'Não foi possível marcar.');

      if (r.horaOcupada) {
        // Voltar à grelha, com as horas recarregadas e uma chave nova: o
        // pedido seguinte é outro pedido.
        setSlot(null);
        chave.current = crypto.randomUUID();
        const atual = await obterHorarios(locationId, servicoId, data, staffId ?? undefined);
        setHorarios(atual.slots ?? []);
        // O motivo também: sem isto, um dia que ficou sem vagas mostrava o texto
        // genérico em vez de dizer o que aconteceu.
        setMotivo(atual.motivo ?? null);
      }
    });
  }

  if (feito) {
    return <Confirmado status={feito.status} token={feito.token} />;
  }

  return (
    <div className="space-y-7">
      {headline ? <h1 className="text-(length:--text-xl) font-semibold">{headline}</h1> : null}

      {/* 1. Serviço */}
      <Seccao numero={1} titulo="O que precisa">
        <div className="grid gap-2">
          {servicos.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setServicoId(s.id);
                setStaffId(null);
                setSlot(null);
              }}
              aria-pressed={servicoId === s.id}
              className={cn(
                'flex min-h-11 w-full items-start justify-between gap-4 rounded-(--radius-md) border px-4 py-3 text-left transition-colors',
                servicoId === s.id
                  ? 'border-(--brand) bg-(--brand-soft)'
                  : 'border-(--line) bg-(--surface) hover:border-(--line-strong)',
              )}
            >
              <span className="min-w-0">
                <span className="block font-medium">{s.nome}</span>
                {s.descricao ? (
                  <span className="mt-0.5 block text-(length:--text-sm) text-(--ink-muted)">
                    {s.descricao}
                  </span>
                ) : null}
                <span className="mt-1 block text-(length:--text-sm) text-(--ink-subtle)">
                  {s.duracao} min
                </span>
              </span>
              {precoFormatado(s.preco, s.moeda) ? (
                <span className="shrink-0 font-medium">{precoFormatado(s.preco, s.moeda)}</span>
              ) : null}
            </button>
          ))}
        </div>
      </Seccao>

      {/* 2. Profissional — "qualquer" primeiro e já escolhido */}
      {servicoId && equipaDoServico.length > 1 ? (
        <Seccao numero={2} titulo="Com quem">
          <div className="flex flex-wrap gap-2">
            <Escolha
              activo={staffId === null}
              onClick={() => {
                setStaffId(null);
                setSlot(null);
              }}
            >
              Qualquer profissional
            </Escolha>
            {equipaDoServico.map((p) => (
              <Escolha
                key={p.id}
                activo={staffId === p.id}
                onClick={() => {
                  setStaffId(p.id);
                  setSlot(null);
                }}
              >
                {p.nome}
              </Escolha>
            ))}
          </div>
        </Seccao>
      ) : null}

      {/* 3. Dia — fita horizontal, nunca calendário de mês */}
      {servicoId ? (
        <Seccao numero={equipaDoServico.length > 1 ? 3 : 2} titulo="Quando">
          <div
            className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1"
            role="group"
            aria-label="Escolher o dia"
          >
            {dias.map((d) => (
              <button
                key={d.iso}
                type="button"
                onClick={() => {
                  setData(d.iso);
                  setSlot(null);
                }}
                aria-pressed={data === d.iso}
                className={cn(
                  'flex min-h-16 w-16 shrink-0 flex-col items-center justify-center rounded-(--radius-md) border text-(length:--text-sm) transition-colors',
                  data === d.iso
                    ? 'border-(--brand) bg-(--brand-soft) font-medium'
                    : 'border-(--line) bg-(--surface)',
                )}
              >
                <span className="text-(--ink-muted)">{DIAS_CURTOS[d.diaSemana]}</span>
                <span className="text-(length:--text-lg) font-medium">{d.dia}</span>
                <span className="text-(--ink-subtle)">{MESES[d.mes]}</span>
              </button>
            ))}
          </div>
        </Seccao>
      ) : null}

      {/* 4. Hora */}
      {servicoId ? (
        <Seccao numero={equipaDoServico.length > 1 ? 4 : 3} titulo="A que horas">
          {aCarregar ? (
            <p className="text-(length:--text-sm) text-(--ink-muted)" role="status">
              A procurar horas livres…
            </p>
          ) : horarios.length === 0 ? (
            <p className="text-(length:--text-sm) text-(--ink-muted)">
              {motivo ?? 'Sem horas disponíveis neste dia.'}
            </p>
          ) : (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {horarios.map((h) => (
                <li key={h.iso}>
                  <button
                    type="button"
                    onClick={() => setSlot(h)}
                    aria-pressed={slot?.iso === h.iso}
                    className={cn(
                      'min-h-11 w-full rounded-(--radius-sm) border text-(length:--text-sm) transition-colors',
                      slot?.iso === h.iso
                        ? 'border-(--brand) bg-(--brand-solid) font-medium text-(--brand-ink)'
                        : 'border-(--line) bg-(--surface) hover:border-(--line-strong)',
                    )}
                  >
                    {h.hora}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-(length:--text-sm) text-(--ink-subtle)">Horas de {timezone}.</p>
        </Seccao>
      ) : null}

      {/* 5. Contactos */}
      {slot ? (
        <Seccao numero={equipaDoServico.length > 1 ? 5 : 4} titulo="Os seus dados">
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-(length:--text-sm) text-(--ink-muted)">Nome</span>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                autoComplete="given-name"
                enterKeyHint="next"
                className="min-h-11 w-full rounded-(--radius-sm) border border-(--line-strong) bg-(--surface) px-3"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-(length:--text-sm) text-(--ink-muted)">
                Telemóvel
              </span>
              <input
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                // `tel` abre o teclado numérico no telemóvel. Num formulário de
                // marcação isso vale mais do que qualquer validação bonita.
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                enterKeyHint="done"
                placeholder="912 345 678"
                className="min-h-11 w-full rounded-(--radius-sm) border border-(--line-strong) bg-(--surface) px-3"
              />
            </label>

            {/*
              Duas coisas diferentes, duas caixas diferentes — e nenhuma
              pré-selecionada. Juntar lembretes e promoções numa só é a forma
              mais comum de obter consentimento que não vale nada.
            */}
            <label className="flex items-start gap-3 pt-1">
              <input
                type="checkbox"
                checked={lembretes}
                onChange={(e) => setLembretes(e.target.checked)}
                className="mt-0.5 size-5 shrink-0"
              />
              <span className="text-(length:--text-sm) text-(--ink-muted)">
                Quero receber o lembrete desta marcação por mensagem.
              </span>
            </label>
          </div>
        </Seccao>
      ) : null}

      {erro ? (
        <p role="alert" className="text-(length:--text-sm) text-(--danger)">
          {erro}
        </p>
      ) : null}

      {/* A barra fixa mantém o botão ao alcance do polegar. */}
      {slot ? (
        <div className="fixed inset-x-0 bottom-0 border-t border-(--line) bg-(--surface) px-5 py-3">
          <div className="mx-auto flex max-w-2xl items-center gap-4">
            <div className="min-w-0 flex-1 text-(length:--text-sm)">
              <p className="truncate font-medium">
                {servico?.nome} · {slot.hora}
              </p>
              <p className="truncate text-(--ink-muted)">
                {new Date(slot.iso).toLocaleDateString('pt-PT', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  timeZone: timezone,
                })}
              </p>
            </div>
            <Button
              onClick={confirmar}
              loading={aEnviar}
              disabled={nome.trim().length < 2 || telefone.trim().length < 6}
            >
              Confirmar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Seccao({
  numero,
  titulo,
  children,
}: {
  numero: number;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 font-medium">
        <span
          aria-hidden
          className="flex size-6 items-center justify-center rounded-full bg-(--brand-soft) text-(length:--text-sm) text-(--brand)"
        >
          {numero}
        </span>
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function Escolha({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={cn(
        'min-h-11 rounded-(--radius-full) border px-4 text-(length:--text-sm) transition-colors',
        activo
          ? 'border-(--brand) bg-(--brand-soft) font-medium'
          : 'border-(--line) bg-(--surface)',
      )}
    >
      {children}
    </button>
  );
}

function Confirmado({ status, token }: { status: string; token?: string | undefined }) {
  const porConfirmar = status === 'awaiting_confirmation';

  return (
    <div className="rounded-(--radius-md) border border-(--line) bg-(--surface) px-5 py-8 text-center">
      <p className="text-(length:--text-lg) font-semibold">
        {porConfirmar ? 'Pedido enviado' : 'Marcação feita'}
      </p>
      <p className="mx-auto mt-2 max-w-prose text-(length:--text-sm) text-pretty text-(--ink-muted)">
        {porConfirmar
          ? 'Vamos confirmar a sua marcação e avisá-lo por mensagem.'
          : 'Vai receber a confirmação por mensagem.'}
      </p>

      {token ? (
        <div className="mt-6">
          <a
            href={`/m/${token}`}
            className="inline-flex min-h-11 items-center rounded-(--radius-sm) border border-(--line-strong) px-4 text-(length:--text-sm) font-medium"
          >
            Ver ou alterar esta marcação
          </a>
          <p className="mt-2 text-(length:--text-sm) text-(--ink-subtle)">
            Guarde este link. É por aqui que confirma, remarca ou cancela — sem
            criar conta.
          </p>
        </div>
      ) : null}
    </div>
  );
}
