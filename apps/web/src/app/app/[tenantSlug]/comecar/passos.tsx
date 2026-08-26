'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { Button, Field } from '@totalmobi/ui';

import { createService, createStaff } from '../actions';
import {
  criarUnidade,
  horarioParaEquipaToda,
  ligarServicos,
  type EstadoDoPasso,
} from './actions';

/**
 * Os formulários do assistente.
 *
 * CADA PASSO É UM FORMULÁRIO DE SERVIDOR, NÃO UM ESTADO NO CLIENTE
 *
 * Não há máquina de estados nem passo guardado em memória. Quem decide em que
 * passo se está é o servidor, a partir do que existe na base — a mesma
 * `preparacao()` que a página pública usa. Consequência prática: o assistente é
 * retomável. Fecha-se o browser a meio, volta-se dias depois, e continua onde
 * ficou, porque «onde ficou» é uma pergunta sobre os dados e não sobre a sessão.
 *
 * Também não há botão «anterior». Nenhum passo desfaz o anterior: cada um
 * acrescenta uma coisa que fica. Quem quiser mudar o que já criou usa a página
 * própria, que faz muito mais do que isto — o assistente serve para chegar à
 * primeira marcação, não para gerir a clínica para sempre.
 */

const erroDeEstilo =
  'rounded-(--radius-md) border border-(--danger) bg-(--danger-soft) px-4 py-3 text-(length:--text-sm)';

/**
 * O que já foi criado, mais a porta de saída.
 *
 * Os passos de serviços e de equipa aceitam vários, e a versão anterior não o
 * dizia: criava-se um e a página saltava para o passo seguinte no mesmo
 * instante, como se um fosse o máximo. Quem ia escrever o segundo via o
 * formulário desaparecer.
 *
 * Agora a lista do que já existe fica à vista e é preciso dizer «Continuar»
 * para avançar. O botão só aparece quando há pelo menos um — antes disso não há
 * para onde ir.
 */
function JaCriados({
  itens,
  rotulo,
  tenantSlug,
}: {
  itens: string[];
  rotulo: string;
  tenantSlug: string;
}) {
  if (itens.length === 0) return null;

  return (
    <div className="mt-6 border-t border-(--line) pt-5">
      <p className="text-(length:--text-sm) font-medium text-(--ink-muted)">
        {itens.length} {itens.length === 1 ? rotulo : `${rotulo}s`} — pode acrescentar mais
      </p>

      <ul className="mt-2.5 flex flex-wrap gap-2">
        {itens.map((nome) => (
          <li
            key={nome}
            className="rounded-(--radius-full) bg-(--surface-sunken) px-3 py-1.5 text-(length:--text-sm)"
          >
            {nome}
          </li>
        ))}
      </ul>

      <Link
        href={`/app/${tenantSlug}/comecar`}
        className="mt-5 inline-flex min-h-11 items-center rounded-(--radius-full) bg-(--brand) px-5 font-medium text-(--brand-ink)"
      >
        Continuar →
      </Link>
    </div>
  );
}

function Erro({ estado }: { estado: EstadoDoPasso }) {
  if (!estado.error) return null;
  return (
    <p role="alert" className={erroDeEstilo}>
      {estado.error}
    </p>
  );
}

/**
 * Fusos.
 *
 * Uma lista curta em vez das ~400 do IANA. O produto vende-se em Portugal, e um
 * seletor com quatrocentas entradas é mais fácil de errar do que de acertar. O
 * schema valida contra o servidor de qualquer maneira, por isso a lista curta
 * não abre buraco nenhum — só encurta o caminho de quem está no caso normal.
 */
const FUSOS = [
  { valor: 'Europe/Lisbon', rotulo: 'Portugal continental (Europe/Lisbon)' },
  { valor: 'Atlantic/Madeira', rotulo: 'Madeira (Atlantic/Madeira)' },
  { valor: 'Atlantic/Azores', rotulo: 'Açores (Atlantic/Azores)' },
  { valor: 'Europe/Madrid', rotulo: 'Espanha (Europe/Madrid)' },
  { valor: 'Europe/London', rotulo: 'Reino Unido (Europe/London)' },
  { valor: 'America/Sao_Paulo', rotulo: 'Brasil — São Paulo (America/Sao_Paulo)' },
];

export function PassoUnidade({ tenantId, tenantSlug }: { tenantId: string; tenantSlug: string }) {
  const [estado, acao, aEnviar] = useActionState(
    criarUnidade.bind(null, tenantId, tenantSlug),
    {} as EstadoDoPasso,
  );

  return (
    <form action={acao} className="space-y-4">
      <Field
        label="Nome da unidade"
        name="name"
        required
        minLength={2}
        placeholder="Clínica do Rossio"
        hint="Se só tem um espaço, o nome da clínica serve."
      />

      <div>
        <label
          htmlFor="timezone"
          className="block text-(length:--text-sm) font-medium text-(--ink-muted)"
        >
          Fuso horário
        </label>
        <select
          id="timezone"
          name="timezone"
          defaultValue="Europe/Lisbon"
          className="mt-1.5 min-h-11 w-full rounded-(--radius-md) border border-(--line-strong) bg-(--surface) px-3"
        >
          {FUSOS.map((f) => (
            <option key={f.valor} value={f.valor}>
              {f.rotulo}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-(length:--text-sm) text-(--ink-subtle)">
          É daqui que saem as horas que o cliente vê. Enganar-se aqui marca consultas à hora
          errada.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Morada (opcional)" name="addressLine1" placeholder="Rua Augusta, 100" />
        <Field label="Localidade (opcional)" name="city" placeholder="Lisboa" />
      </div>

      <Erro estado={estado} />

      <Button type="submit" size="lg" loading={aEnviar}>
        Criar unidade
      </Button>
    </form>
  );
}

export function PassoServico({
  tenantId,
  tenantSlug,
  jaCriados,
}: {
  tenantId: string;
  tenantSlug: string;
  jaCriados: string[];
}) {
  const [estado, acao, aEnviar] = useActionState(
    createService.bind(null, tenantId, tenantSlug),
    {} as EstadoDoPasso,
  );

  return (
    <form action={acao} className="space-y-4">
      {/*
        Sem isto o serviço nasce com `bookable_online = false` — a ação lê a
        presença do campo, e um campo ausente é um «não». A página pública só
        conta serviços marcáveis, por isso o assistente ficaria preso no passo
        seguinte a olhar para um serviço que existe e não conta.
      */}
      <input type="hidden" name="bookableOnline" value="on" />

      <Field
        label="Nome do serviço"
        name="name"
        required
        placeholder="Consulta de avaliação"
        hint="Acrescente quantos quiser — fica nesta página até dizer que chega."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Duração"
          name="durationMinutes"
          type="number"
          required
          min={5}
          max={1440}
          step={5}
          defaultValue={30}
          hint="Em minutos."
        />
        <Field
          label="Preço (opcional)"
          name="price"
          type="number"
          min={0}
          step="0.01"
          placeholder="65.00"
          hint="Em euros. Deixe vazio para não mostrar."
        />
      </div>

      <Erro estado={estado} />

      <Button type="submit" size="lg" loading={aEnviar}>
        {jaCriados.length === 0 ? 'Criar serviço' : 'Acrescentar mais um'}
      </Button>

      <JaCriados itens={jaCriados} rotulo="serviço" tenantSlug={tenantSlug} />
    </form>
  );
}

export function PassoEquipa({
  tenantId,
  tenantSlug,
  jaCriados,
}: {
  tenantId: string;
  tenantSlug: string;
  jaCriados: string[];
}) {
  const [estado, acao, aEnviar] = useActionState(
    createStaff.bind(null, tenantId, tenantSlug),
    {} as EstadoDoPasso,
  );

  return (
    <form action={acao} className="space-y-4">
      {/* `accepts_online_booking` tem de vir marcado: uma pessoa criada pelo
          assistente é, por definição, alguém que se quer que receba marcações.
          Criá-la desligada faria o passo seguinte parecer avariado. */}
      <input type="hidden" name="acceptsOnlineBooking" value="on" />

      <Field
        label="Nome"
        name="fullName"
        required
        placeholder="Ana Martins"
        hint="Pode ser o seu. Acrescente a equipa toda aqui, uma pessoa de cada vez."
      />
      <Field label="Função (opcional)" name="jobTitle" placeholder="Médica dentista" />

      <Erro estado={estado} />

      <Button type="submit" size="lg" loading={aEnviar}>
        {jaCriados.length === 0 ? 'Adicionar à equipa' : 'Acrescentar mais uma pessoa'}
      </Button>

      <JaCriados itens={jaCriados} rotulo="pessoa" tenantSlug={tenantSlug} />
    </form>
  );
}

export function PassoLigacoes({
  tenantId,
  tenantSlug,
  equipa,
  servicos,
}: {
  tenantId: string;
  tenantSlug: string;
  equipa: { id: string; full_name: string }[];
  servicos: { id: string; name: string }[];
}) {
  const [estado, acao, aEnviar] = useActionState(
    ligarServicos.bind(null, tenantId, tenantSlug),
    {} as EstadoDoPasso,
  );

  return (
    <form action={acao} className="space-y-5">
      <div className="space-y-4">
        {equipa.map((pessoa) => (
          <fieldset key={pessoa.id} className="rounded-(--radius-md) border border-(--line) p-4">
            <legend className="px-1.5 font-medium">{pessoa.full_name}</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2.5">
              {servicos.map((servico) => (
                <label key={servico.id} className="flex cursor-pointer items-center gap-2">
                  {/* Tudo pré-marcado: numa clínica pequena toda a gente faz
                      tudo, e desmarcar duas caixas é mais rápido do que marcar
                      oito. */}
                  <input
                    type="checkbox"
                    name={`lig-${pessoa.id}-${servico.id}`}
                    defaultChecked
                    className="size-4 accent-(--brand)"
                  />
                  <span className="text-(length:--text-sm)">{servico.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      <Erro estado={estado} />

      <Button type="submit" size="lg" loading={aEnviar}>
        Guardar
      </Button>
    </form>
  );
}

const DIAS = [
  { valor: 1, rotulo: 'Seg' },
  { valor: 2, rotulo: 'Ter' },
  { valor: 3, rotulo: 'Qua' },
  { valor: 4, rotulo: 'Qui' },
  { valor: 5, rotulo: 'Sex' },
];

export function PassoHorarios({
  tenantId,
  tenantSlug,
  locationId,
  quantos,
}: {
  tenantId: string;
  tenantSlug: string;
  locationId: string;
  quantos: number;
}) {
  const [estado, acao, aEnviar] = useActionState(
    horarioParaEquipaToda.bind(null, tenantId, tenantSlug),
    {} as EstadoDoPasso,
  );

  return (
    <form action={acao} className="space-y-5">
      <input type="hidden" name="locationId" value={locationId} />

      <fieldset>
        <legend className="text-(length:--text-sm) font-medium text-(--ink-muted)">
          Dias de trabalho
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {DIAS.map((dia) => (
            <label
              key={dia.valor}
              className="flex cursor-pointer items-center gap-2 rounded-(--radius-full) border border-(--line-strong) px-3.5 py-2"
            >
              <input
                type="checkbox"
                name={`dia-${dia.valor}`}
                defaultChecked
                className="size-4 accent-(--brand)"
              />
              <span className="text-(length:--text-sm)">{dia.rotulo}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid max-w-sm gap-4 sm:grid-cols-2">
        <Field label="Abre às" name="abre" type="time" required defaultValue="09:00" />
        <Field label="Fecha às" name="fecha" type="time" required defaultValue="18:00" />
      </div>

      <p className="text-(length:--text-sm) text-pretty text-(--ink-muted)">
        Aplica-se {quantos === 1 ? 'à pessoa que criou' : `às ${quantos} pessoas da equipa`}. Horas
        de almoço, folgas e horários diferentes por pessoa ficam para a página de horários — esta
        parte serve só para abrir a agenda.
      </p>

      <Erro estado={estado} />

      <Button type="submit" size="lg" loading={aEnviar}>
        Guardar horário
      </Button>
    </form>
  );
}
