'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';

import {
  diasDesde,
  instantToWallClock,
  periodsForDay,
  resolveDaySchedule,
  segundaFeiraDe,
  type ScheduleException,
  type WeeklyHours,
} from '@totalmobi/shared';
import { Badge, Button, DialogClose, DialogContent, DialogRoot, cn } from '@totalmobi/ui';

import { alterarDiaSo, definirHorarioAPartirDe } from './actions';

/**
 * As semanas seguintes, uma a seguir à outra.
 *
 * O PROBLEMA QUE ISTO RESOLVE
 *
 * O editor semanal diz o que é normal. Uma clínica que marca com dois meses de
 * antecedência não vive só do normal: a Ana faz o horário do costume esta
 * semana, está de férias daqui a duas, e a partir de outubro passa a trabalhar
 * às terças. Nada disso cabe numa grelha de sete dias sem data.
 *
 * A fita mostra o horário **efetivo** de cada dia — o padrão em vigor nessa
 * data, menos as ausências, menos as exceções. É o mesmo cálculo que o motor de
 * disponibilidade faz para decidir o que oferecer ao cliente, pela mesma função
 * (`resolveDaySchedule`). Não é uma segunda implementação: se a fita mostrar
 * uma hora, é essa hora que o cliente vai poder marcar.
 *
 * PORQUE É QUE OS DIAS IGUAIS SÃO ESBATIDOS
 *
 * Doze semanas de horários idênticos são doze cópias da mesma informação, e a
 * única coisa que interessa nelas é onde diferem. Os dias iguais ao padrão
 * ficam apagados; os alterados ganham contraste e uma etiqueta que diz porquê.
 * Quem procura "onde é que isto muda" encontra à primeira vista.
 */

const SEMANAS = 12;
const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

interface Periodo {
  startsAt: string;
  endsAt: string;
}

export interface AusenciaDaFita {
  startsAt: string;
  endsAt: string;
  kind: string;
}

export interface ExcecaoDaFita {
  date: string;
  kind: 'closed' | 'open';
  starts_at: string | null;
  ends_at: string | null;
  staff_id: string | null;
  scope_tenant: boolean;
  location_id: string | null;
}

type Motivo = 'ferias' | 'excecao' | null;

interface DiaDaFita {
  data: string;
  diaSemana: number;
  /** O que o padrão diz, sem exceções nem ausências. */
  base: Periodo[];
  /** O que vale mesmo nesse dia. */
  efetivo: Periodo[];
  alterado: boolean;
  motivo: Motivo;
}

/** `HH:mm–HH:mm`, ou um travessão quando não há nada. */
function resumir(periodos: Periodo[]): string {
  if (periodos.length === 0) return '—';
  return periodos.map((p) => `${p.startsAt}–${p.endsAt}`).join(', ');
}

function iguais(a: Periodo[], b: Periodo[]): boolean {
  return a.length === b.length && a.every((p, i) => p.startsAt === b[i]!.startsAt && p.endsAt === b[i]!.endsAt);
}

export function FitaSemanas({
  tenantId,
  tenantSlug,
  staffId,
  staffNome,
  locationId,
  timezone,
  locationHours,
  staffHours,
  excecoes,
  ausencias,
  canManage,
}: {
  tenantId: string;
  tenantSlug: string;
  staffId: string;
  staffNome: string;
  locationId: string;
  timezone: string;
  locationHours: WeeklyHours[];
  staffHours: WeeklyHours[];
  excecoes: ExcecaoDaFita[];
  ausencias: AusenciaDaFita[];
  canManage: boolean;
}) {
  const [semana, setSemana] = useState(0);
  const [aEditar, setAEditar] = useState<DiaDaFita | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aGuardar, iniciar] = useTransition();

  const primeiraSegunda = segundaFeiraDe(new Date().toISOString().slice(0, 10));

  const ausenciasComoDatas = useMemo(
    () => ausencias.map((a) => ({ startsAt: new Date(a.startsAt), endsAt: new Date(a.endsAt) })),
    [ausencias],
  );

  /**
   * O estado de um dia.
   *
   * Uma função só, usada pela grelha e pela barra de doze semanas. Estavam
   * separadas e discordavam: a barra contava os dias **tocados** por uma
   * ausência e a grelha os dias **diferentes do normal**. Um sábado dentro das
   * férias, que já não tinha horário, contava para uma e não para a outra — a
   * barra dizia 6 e a semana dizia 5. Duas definições da mesma palavra é uma a
   * mais.
   */
  const calcularDia = useCallback(
    (data: string): DiaDaFita => {
      // As exceções que valem para este profissional neste dia: as do tenant,
      // as da unidade, e as dele. As de outra pessoa não contam.
      const doDia: ScheduleException[] = excecoes
        .filter(
          (e) =>
            e.date === data &&
            (e.scope_tenant ||
              (e.staff_id === null && e.location_id === locationId) ||
              e.staff_id === staffId),
        )
        .map((e) => ({
          date: e.date,
          kind: e.kind,
          startsAt: e.starts_at,
          endsAt: e.ends_at,
        }));

      const paraHoras = (r: { windows: readonly { start: Date; end: Date }[] }): Periodo[] =>
        r.windows.map((w) => ({
          startsAt: instantToWallClock(w.start, timezone).time,
          endsAt: instantToWallClock(w.end, timezone).time,
        }));

      const efetivo = paraHoras(
        resolveDaySchedule({
          date: data,
          timezone,
          locationHours,
          staffHours,
          exceptions: doDia,
          timeOff: ausenciasComoDatas,
        }),
      );

      // O base é o padrão em vigor nessa data — já respeita `valid_from`, por
      // isso uma semana depois de uma mudança de padrão mostra o padrão novo
      // como "normal", que é o que é.
      const base = paraHoras(
        resolveDaySchedule({
          date: data,
          timezone,
          locationHours,
          staffHours,
          exceptions: [],
          timeOff: [],
        }),
      );

      const alterado = !iguais(base, efetivo);
      const temAusencia = ausenciasComoDatas.some(
        (a) =>
          a.startsAt <= new Date(`${data}T23:59:59`) && a.endsAt >= new Date(`${data}T00:00:00`),
      );

      return {
        data,
        diaSemana: new Date(`${data}T12:00:00Z`).getUTCDay(),
        base,
        efetivo,
        alterado,
        motivo: !alterado ? null : temAusencia ? 'ferias' : 'excecao',
      };
    },
    [excecoes, ausenciasComoDatas, locationHours, staffHours, timezone, locationId, staffId],
  );

  const dias = useMemo(() => {
    const inicio = diasDesde(primeiraSegunda, SEMANAS * 7)[semana * 7]!;
    return diasDesde(inicio, 7).map(calcularDia);
  }, [semana, primeiraSegunda, calcularDia]);

  const rotuloSemana = () => {
    const de = dias[0]!.data;
    const ate = dias[6]!.data;
    const mes = (d: string) =>
      new Intl.DateTimeFormat('pt-PT', { month: 'long', timeZone: 'UTC' }).format(
        new Date(`${d}T12:00:00Z`),
      );
    const dia = (d: string) => Number(d.slice(8, 10));

    return mes(de) === mes(ate)
      ? `${dia(de)}–${dia(ate)} de ${mes(de)}`
      : `${dia(de)} de ${mes(de)} – ${dia(ate)} de ${mes(ate)}`;
  };

  const alteradosNaSemana = dias.filter((d) => d.alterado).length;

  /**
   * Quantos dias alterados tem cada uma das doze semanas.
   *
   * Navegar semana a semana responde a "como é a semana de 7 de setembro". Não
   * responde a "onde é que isto muda", que é a pergunta de quem está a planear
   * — e obrigava a doze cliques para descobrir. Esta barra responde de relance,
   * e cada marca leva lá diretamente.
   */
  const resumoDasSemanas = useMemo(() => {
    const todos = diasDesde(primeiraSegunda, SEMANAS * 7);

    return Array.from(
      { length: SEMANAS },
      (_, w) => todos.slice(w * 7, w * 7 + 7).filter((data) => calcularDia(data).alterado).length,
    );
  }, [primeiraSegunda, calcularDia]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={semana === 0}
          onClick={() => setSemana(semana - 1)}
        >
          ‹ Anterior
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={semana >= SEMANAS - 1}
          onClick={() => setSemana(semana + 1)}
        >
          Seguinte ›
        </Button>
        {semana !== 0 ? (
          <Button size="sm" variant="ghost" onClick={() => setSemana(0)}>
            Esta semana
          </Button>
        ) : null}

        <p className="ml-1 font-medium first-letter:uppercase">{rotuloSemana()}</p>

        {semana === 0 ? (
          <Badge tone="neutral">Esta semana</Badge>
        ) : (
          <span className="text-(length:--text-sm) text-(--ink-subtle)">
            daqui a {semana} {semana === 1 ? 'semana' : 'semanas'}
          </span>
        )}

        {alteradosNaSemana > 0 ? (
          <Badge tone="warning">
            {alteradosNaSemana} {alteradosNaSemana === 1 ? 'dia alterado' : 'dias alterados'}
          </Badge>
        ) : null}
      </div>

      {erro ? (
        <p
          role="alert"
          className="mb-3 rounded-(--radius-md) border border-(--danger) bg-(--danger-soft) px-4 py-2.5 text-(length:--text-sm)"
        >
          {erro}
        </p>
      ) : null}

      <div className="mb-3 overflow-x-auto">
        <ul className="flex min-w-fit gap-1" aria-label="Doze semanas, com os dias alterados">
          {resumoDasSemanas.map((alterados, w) => (
            <li key={w}>
              <button
                type="button"
                onClick={() => setSemana(w)}
                aria-current={semana === w ? 'true' : undefined}
                title={
                  alterados === 0
                    ? 'Semana normal'
                    : `${alterados} ${alterados === 1 ? 'dia alterado' : 'dias alterados'}`
                }
                className={cn(
                  'flex h-11 w-9 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-(--radius-sm) border text-(length:--text-xs)',
                  'transition-[background-color,border-color] duration-(--duration-fast)',
                  semana === w
                    ? 'border-(--brand) bg-(--brand-soft) font-medium text-(--brand)'
                    : 'border-(--line) text-(--ink-subtle) hover:border-(--line-strong)',
                )}
              >
                <span className="tabular-nums">{w === 0 ? 'esta' : `+${w}`}</span>
                {/* Um ponto por dia alterado seria ruído; um só, com o número,
                    diz o mesmo e cabe em 36 px. */}
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-(--radius-full)',
                    alterados > 0 ? 'bg-(--warning)' : 'bg-transparent',
                  )}
                  aria-hidden
                />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {dias.map((dia) => {
          const conteudo = (
            <>
              <span className="flex items-baseline gap-2">
                <span className="text-(length:--text-sm) text-(--ink-muted)">
                  {DIAS_CURTOS[dia.diaSemana]}
                </span>
                <span className="font-medium tabular-nums">{Number(dia.data.slice(8, 10))}</span>
                {dia.alterado ? (
                  <span className="ml-auto text-(length:--text-xs) text-(--warning)">
                    {dia.motivo === 'ferias' ? 'ausência' : 'alterado'}
                  </span>
                ) : null}
              </span>
              <span
                className={cn(
                  'mt-1 block tabular-nums',
                  dia.alterado ? 'text-(--ink)' : 'text-(--ink-subtle)',
                )}
              >
                {resumir(dia.efetivo)}
              </span>
              {dia.alterado && dia.base.length > 0 ? (
                <span className="mt-0.5 block text-(length:--text-xs) text-(--ink-subtle) line-through">
                  {resumir(dia.base)}
                </span>
              ) : null}
            </>
          );

          return (
            <li key={dia.data}>
              {canManage ? (
                <button
                  type="button"
                  onClick={() => {
                    setErro(null);
                    setAEditar(dia);
                  }}
                  className={cn(
                    'flex min-h-20 w-full cursor-pointer flex-col rounded-(--radius-md) border px-3 py-2.5 text-left text-(length:--text-sm)',
                    'transition-[background-color,border-color,transform] duration-(--duration-fast) ease-(--ease-out-soft)',
                    'active:scale-[0.98]',
                    dia.alterado
                      ? 'border-(--warning) bg-(--warning-soft)'
                      : 'border-(--line) bg-(--surface) hover:border-(--line-strong)',
                  )}
                >
                  {conteudo}
                </button>
              ) : (
                <div
                  className={cn(
                    'flex min-h-20 flex-col rounded-(--radius-md) border px-3 py-2.5 text-(length:--text-sm)',
                    dia.alterado
                      ? 'border-(--warning) bg-(--warning-soft)'
                      : 'border-(--line) bg-(--surface)',
                  )}
                >
                  {conteudo}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-(length:--text-sm) text-(--ink-subtle)">
        Os dias em cinzento seguem o horário normal. Só os alterados estão em destaque.
      </p>

      {aEditar ? (
        <EditarDia
          dia={aEditar}
          staffNome={staffNome}
          aGuardar={aGuardar}
          onFechar={() => setAEditar(null)}
          onGuardar={(desejado, ambito) => {
            setErro(null);
            iniciar(async () => {
              const r =
                ambito === 'so-hoje'
                  ? await alterarDiaSo(tenantId, tenantSlug, staffId, locationId, {
                      date: aEditar.data,
                      base: aEditar.base,
                      desejado,
                    })
                  : await definirHorarioAPartirDe(tenantId, tenantSlug, staffId, locationId, {
                      from: aEditar.data,
                      dias: padraoComDiaSubstituido(
                        staffHours,
                        locationHours,
                        aEditar,
                        desejado,
                      ),
                    });

              if (r.error) setErro(r.error);
              else setAEditar(null);
            });
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * O padrão semanal com um dia trocado.
 *
 * "A partir desta semana, sempre" toma o padrão em vigor e substitui **só** o
 * dia da semana que está a ser editado. Os outros seis mantêm-se — mudar a
 * quinta-feira não é razão para reescrever a segunda.
 */
function padraoComDiaSubstituido(
  staffHours: WeeklyHours[],
  locationHours: WeeklyHours[],
  dia: DiaDaFita,
  desejado: Periodo[],
): { weekday: number; periods: Periodo[] }[] {
  const saida: { weekday: number; periods: Periodo[] }[] = [];

  for (let weekday = 0; weekday < 7; weekday += 1) {
    if (weekday === dia.diaSemana) {
      saida.push({ weekday, periods: desejado });
      continue;
    }
    // O padrão dos outros dias lê-se na data equivalente desta semana, para
    // que uma mudança de padrão já em vigor seja respeitada.
    const deslocamento = weekday - dia.diaSemana;
    const d = new Date(`${dia.data}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + deslocamento);
    const data = d.toISOString().slice(0, 10);

    const doStaff = periodsForDay(staffHours, data);
    const daUnidade = periodsForDay(locationHours, data);
    // Guarda-se o horário do profissional, não a interseção: a interseção com a
    // unidade é trabalho do motor, e gravá-la aqui congelaria o horário da
    // unidade dentro do do profissional.
    if (doStaff.length > 0 && daUnidade.length > 0) {
      saida.push({ weekday, periods: doStaff });
    }
  }

  return saida.filter((d) => d.periods.length > 0);
}

function EditarDia({
  dia,
  staffNome,
  aGuardar,
  onFechar,
  onGuardar,
}: {
  dia: DiaDaFita;
  staffNome: string;
  aGuardar: boolean;
  onFechar: () => void;
  onGuardar: (desejado: Periodo[], ambito: 'so-hoje' | 'daqui-em-diante') => void;
}) {
  const [periodos, setPeriodos] = useState<Periodo[]>(() =>
    dia.efetivo.map((p) => ({ ...p })),
  );
  const [ambito, setAmbito] = useState<'so-hoje' | 'daqui-em-diante'>('so-hoje');

  const porExtenso = new Intl.DateTimeFormat('pt-PT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${dia.data}T12:00:00Z`));

  const invalido = periodos.some((p) => !p.startsAt || !p.endsAt || p.startsAt >= p.endsAt);

  return (
    <DialogRoot open onOpenChange={onFechar}>
      <DialogContent
        title={`Alterar ${porExtenso}`}
        description={`${staffNome} · horário normal ${resumir(dia.base)}`}
      >
        <div className="space-y-2">
          {periodos.map((p, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input
                type="time"
                value={p.startsAt}
                onChange={(e) =>
                  setPeriodos(periodos.map((x, j) => (i === j ? { ...x, startsAt: e.target.value } : x)))
                }
                aria-label={`Início do período ${i + 1}`}
                className="min-h-11 rounded-(--radius-sm) border border-(--line-strong) bg-(--surface) px-2"
              />
              <span aria-hidden className="text-(--ink-subtle)">
                até
              </span>
              <input
                type="time"
                value={p.endsAt}
                onChange={(e) =>
                  setPeriodos(periodos.map((x, j) => (i === j ? { ...x, endsAt: e.target.value } : x)))
                }
                aria-label={`Fim do período ${i + 1}`}
                className="min-h-11 rounded-(--radius-sm) border border-(--line-strong) bg-(--surface) px-2"
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setPeriodos(periodos.filter((_, j) => j !== i))}
              >
                Remover
              </Button>
            </div>
          ))}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              size="sm"
              variant="secondary"
              disabled={periodos.length >= 6}
              onClick={() => setPeriodos([...periodos, { startsAt: '09:00', endsAt: '18:00' }])}
            >
              Acrescentar período
            </Button>
            {periodos.length > 0 ? (
              <Button size="sm" variant="ghost" onClick={() => setPeriodos([])}>
                Não trabalha neste dia
              </Button>
            ) : null}
          </div>

          {periodos.length === 0 ? (
            <p className="text-(length:--text-sm) text-(--warning)">
              Fica sem horário neste dia — não aparecerá em marcação nenhuma.
            </p>
          ) : null}
        </div>

        {/*
          A pergunta que decide o que se grava. Sem ela, "só desta vez" e
          "mudei de horário" ficavam indistinguíveis — e são coisas
          completamente diferentes seis semanas depois.
        */}
        <fieldset className="mt-5">
          <legend className="mb-2 text-(length:--text-sm) font-medium">Aplicar a</legend>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-(--radius-sm) px-1 py-1.5">
            <input
              type="radio"
              name="ambito"
              checked={ambito === 'so-hoje'}
              onChange={() => setAmbito('so-hoje')}
              className="mt-1 size-4"
            />
            <span className="text-(length:--text-sm)">
              Só neste dia
              <span className="block text-(--ink-subtle)">
                Grava uma exceção para {dia.data.split('-').reverse().join('/')}. O horário normal
                fica como está.
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-(--radius-sm) px-1 py-1.5">
            <input
              type="radio"
              name="ambito"
              checked={ambito === 'daqui-em-diante'}
              onChange={() => setAmbito('daqui-em-diante')}
              className="mt-1 size-4"
            />
            <span className="text-(length:--text-sm)">
              A partir deste dia, sempre
              <span className="block text-(--ink-subtle)">
                Passa a ser o horário normal às {DIAS_CURTOS[dia.diaSemana]}. O anterior fica
                guardado, com fim na véspera.
              </span>
            </span>
          </label>
        </fieldset>

        <div className="mt-6 flex justify-end gap-3">
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Cancelar
            </Button>
          </DialogClose>
          <Button
            type="button"
            loading={aGuardar}
            disabled={invalido}
            onClick={() => onGuardar(periodos, ambito)}
          >
            Guardar
          </Button>
        </div>
      </DialogContent>
    </DialogRoot>
  );
}
