'use client';

import { useActionState, useEffect, useMemo, useState, useTransition } from 'react';

import {
  Badge,
  Button,
  Card,
  DialogClose,
  DialogContent,
  DialogRoot,
  DialogTrigger,
  EmptyState,
  Field,
  cn,
} from '@totalmobi/ui';

import {
  archiveStaff,
  createStaff,
  setStaffService,
  updateStaff,
  type CatalogState,
} from '../actions';

/**
 * A equipa.
 *
 * PORQUE É QUE ISTO DEIXOU DE SER UMA LISTA DE CARTÕES
 *
 * Era um `<ul>` com um cartão por pessoa e, dentro de cada cartão, um botão por
 * serviço. Numa clínica com 50 profissionais e 20 serviços isso dava **nove mil
 * píxeis de altura e mil caixas no DOM** — dez ecrãs de scroll para encontrar
 * alguém, e nenhuma forma de procurar. Não era feio: era inutilizável à escala
 * a que este produto se vende.
 *
 * Passa a tabela, uma linha por pessoa, com os serviços atrás de um contador em
 * vez de espalhados pela linha. Três decisões sustentam isto:
 *
 * 1. **Pesquisa e filtros no cliente.** São 50 linhas, não 50 000: filtrar no
 *    browser responde a cada tecla sem ir ao servidor. No dia em que uma cadeia
 *    tiver 500 profissionais isto passa a `.range()` no servidor, e a interface
 *    não muda.
 *
 * 2. **Seleção múltipla com barra de ações.** Desativar doze pessoas em
 *    dezembro eram trinta e seis cliques. Passam a três.
 *
 * 3. **Paginação a 25, não virtualização.** A regra habitual manda virtualizar
 *    acima de 50 itens, mas uma lista virtual parte o Ctrl+F do browser e a
 *    impressão. Vinte e cinco linhas de tabela não custam nada a desenhar; o
 *    que custava era o cartão com vinte botões lá dentro.
 *
 * NO TELEMÓVEL NÃO HÁ TABELA
 *
 * Seis colunas em 375 px não se leem. Abaixo de 768 px volta a ser lista — mas
 * já com a pesquisa e os filtros, que é o que faltava. Mesmo raciocínio da
 * agenda: outra peça, não a mesma encolhida.
 */

interface Staff {
  id: string;
  full_name: string;
  job_title: string | null;
  email: string | null;
  calendar_color: string | null;
  is_active: boolean;
  accepts_online_booking: boolean;
  priority: number;
  sort_order: number;
}

interface Service {
  id: string;
  name: string;
  duration_minutes: number;
}

interface Link {
  staff_id: string;
  service_id: string;
}

const initial: CatalogState = {};

/** Cores sugeridas para o calendário: distinguíveis entre si e legíveis nos dois temas. */
const CORES = ['#0E7A84', '#B0446A', '#7A5AF8', '#B54708', '#067647', '#0B5FFF'];

const POR_PAGINA = 25;

type Filtro = 'todos' | 'ativos' | 'inativos' | 'ocultos' | 'sem-servicos';

const FILTROS: { chave: Filtro; rotulo: string }[] = [
  { chave: 'todos', rotulo: 'Todos' },
  { chave: 'ativos', rotulo: 'Ativos' },
  { chave: 'inativos', rotulo: 'Inativos' },
  { chave: 'ocultos', rotulo: 'Só internos' },
  // O filtro que resolve o erro de configuração mais chato de encontrar: quem
  // não faz serviço nenhum não aparece em marcação nenhuma, e ninguém repara.
  { chave: 'sem-servicos', rotulo: 'Sem serviços' },
];

/** Sem acentos e em minúsculas: procurar "jose" tem de encontrar "José". */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function contarFiltro(
  chave: Filtro,
  staff: Staff[],
  porProfissional: Map<string, Set<string>>,
): number {
  if (chave === 'todos') return staff.length;
  return staff.filter((p) => {
    if (chave === 'ativos') return p.is_active;
    if (chave === 'inativos') return !p.is_active;
    if (chave === 'ocultos') return p.is_active && !p.accepts_online_booking;
    return (porProfissional.get(p.id)?.size ?? 0) === 0;
  }).length;
}

export function TeamManager({
  tenantId,
  tenantSlug,
  staff,
  services,
  links,
  canManage,
}: {
  tenantId: string;
  tenantSlug: string;
  staff: Staff[];
  services: Service[];
  links: Link[];
  canManage: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [state, action, pending] = useActionState(
    createStaff.bind(null, tenantId, tenantSlug),
    initial,
  );
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [aMudar, startTransition] = useTransition();

  const [procura, setProcura] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [ascendente, setAscendente] = useState(true);
  const [pagina, setPagina] = useState(0);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [servicosDe, setServicosDe] = useState<string | null>(null);
  const [aEditar, setAEditar] = useState<string | null>(null);

  useEffect(() => {
    if (state.ok) setAberto(false);
  }, [state.ok]);

  const porProfissional = useMemo(() => {
    const mapa = new Map<string, Set<string>>();
    for (const link of links) {
      const conjunto = mapa.get(link.staff_id) ?? new Set<string>();
      conjunto.add(link.service_id);
      mapa.set(link.staff_id, conjunto);
    }
    return mapa;
  }, [links]);

  const filtrados = useMemo(() => {
    const termo = normalizar(procura.trim());

    const lista = staff.filter((p) => {
      if (termo) {
        const alvo = normalizar(`${p.full_name} ${p.job_title ?? ''} ${p.email ?? ''}`);
        if (!alvo.includes(termo)) return false;
      }
      switch (filtro) {
        case 'ativos':
          return p.is_active;
        case 'inativos':
          return !p.is_active;
        case 'ocultos':
          return p.is_active && !p.accepts_online_booking;
        case 'sem-servicos':
          return (porProfissional.get(p.id)?.size ?? 0) === 0;
        default:
          return true;
      }
    });

    return lista.sort((a, b) => {
      const r = a.full_name.localeCompare(b.full_name, 'pt-PT');
      return ascendente ? r : -r;
    });
  }, [staff, procura, filtro, ascendente, porProfissional]);

  // Mudar de filtro com a página 3 aberta deixava um ecrã vazio sem explicação.
  useEffect(() => {
    setPagina(0);
  }, [procura, filtro]);

  const paginas = Math.max(Math.ceil(filtrados.length / POR_PAGINA), 1);
  const paginaSegura = Math.min(pagina, paginas - 1);
  const visiveis = filtrados.slice(paginaSegura * POR_PAGINA, (paginaSegura + 1) * POR_PAGINA);

  // A seleção só age sobre o que está à vista. Marcar tudo, mudar de filtro e
  // arquivar pessoas que já não estavam no ecrã é um desastre silencioso.
  const idsVisiveis = visiveis.map((p) => p.id);
  const selecaoAtiva = idsVisiveis.filter((id) => selecionados.has(id));
  const todosMarcados = idsVisiveis.length > 0 && selecaoAtiva.length === idsVisiveis.length;

  function alternarSelecao(id: string) {
    setSelecionados((antes) => {
      const novo = new Set(antes);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function alternarTodos() {
    setSelecionados((antes) => {
      const novo = new Set(antes);
      if (todosMarcados) idsVisiveis.forEach((id) => novo.delete(id));
      else idsVisiveis.forEach((id) => novo.add(id));
      return novo;
    });
  }

  function alternarServico(staffId: string, serviceId: string, ligado: boolean) {
    setErro(null);
    startTransition(async () => {
      const r = await setStaffService(tenantId, tenantSlug, staffId, serviceId, ligado);
      if (r.error) setErro(r.error);
    });
  }

  function alternarCampo(id: string, campo: 'isActive' | 'acceptsOnlineBooking', valor: boolean) {
    setErro(null);
    startTransition(async () => {
      const r = await updateStaff(tenantId, tenantSlug, id, { [campo]: valor });
      if (r.error) setErro(r.error);
    });
  }

  /**
   * Gravar as alteracoes de um profissional.
   *
   * O QUE FALTAVA
   *
   * O `updateStaff` do servidor sempre aceitou nome, funcao, email, telefone e
   * cor. A interface so lhe chamava para ligar e desligar interruptores — nao
   * havia forma nenhuma de corrigir um nome mal escrito sem apagar a pessoa e
   * criar outra, o que levava a agenda dela atras.
   */
  function guardarEdicao(id: string, patch: Record<string, unknown>) {
    setErro(null);
    startTransition(async () => {
      const r = await updateStaff(tenantId, tenantSlug, id, patch);
      if (r.error) setErro(r.error);
      else setAEditar(null);
    });
  }

  function arquivar(id: string) {
    setErro(null);
    startTransition(async () => {
      const r = await archiveStaff(tenantId, tenantSlug, id);
      if (r.error) setErro(r.error);
    });
  }

  /**
   * As ações em massa.
   *
   * Sequenciais e não em paralelo: cada uma escreve na mesma tabela e o
   * servidor revalida o caminho a seguir a cada uma. Doze pedidos ao mesmo
   * tempo seriam doze revalidações a competir.
   *
   * Se uma falhar, as outras continuam e o número de falhas é dito em voz alta.
   * Parar a meio deixava metade da equipa alterada sem ninguém saber qual.
   */
  function emMassa(o_que: 'ativar' | 'desativar' | 'esconder' | 'mostrar' | 'arquivar') {
    const alvos = [...selecaoAtiva];
    if (alvos.length === 0) return;

    setErro(null);
    setAviso(null);

    startTransition(async () => {
      let falhas = 0;
      for (const id of alvos) {
        const r =
          o_que === 'arquivar'
            ? await archiveStaff(tenantId, tenantSlug, id)
            : await updateStaff(tenantId, tenantSlug, id, {
                ...(o_que === 'ativar' ? { isActive: true } : {}),
                ...(o_que === 'desativar' ? { isActive: false } : {}),
                ...(o_que === 'esconder' ? { acceptsOnlineBooking: false } : {}),
                ...(o_que === 'mostrar' ? { acceptsOnlineBooking: true } : {}),
              });
        if (r.error) falhas += 1;
      }

      setSelecionados(new Set());
      setAviso(
        falhas === 0
          ? `${alvos.length} ${alvos.length === 1 ? 'profissional alterado' : 'profissionais alterados'}.`
          : `${alvos.length - falhas} de ${alvos.length} alterados. ${falhas} falharam.`,
      );
    });
  }

  const pessoaDosServicos = staff.find((p) => p.id === servicosDe) ?? null;
  const pessoaEmEdicao = staff.find((p) => p.id === aEditar) ?? null;

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

      {/* `role="status"` e não `alert`: é confirmação, não problema. Anuncia-se
          sem interromper o que estiver a ser lido. */}
      {aviso ? (
        <p
          role="status"
          className="mb-4 rounded-(--radius-md) border border-(--line) bg-(--surface-sunken) px-4 py-3 text-(length:--text-sm)"
        >
          {aviso}
        </p>
      ) : null}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <Field
            label="Procurar na equipa"
            hideLabel
            type="search"
            placeholder="Procurar por nome, função ou email"
            value={procura}
            onChange={(e) => setProcura(e.target.value)}
          />
        </div>

        {canManage ? (
          <DialogRoot open={aberto} onOpenChange={setAberto}>
            <DialogTrigger asChild>
              <Button>Novo profissional</Button>
            </DialogTrigger>
            <DialogContent
              title="Novo profissional"
              description="Só o nome é obrigatório. Quem não tem conta continua a aparecer na agenda — o login é para quem gere, não para quem atende."
            >
              <form action={action} className="space-y-4">
                <Field label="Nome" name="fullName" placeholder="Ana Martins" required />
                <Field
                  label="Função"
                  name="jobTitle"
                  placeholder="Médica dentista"
                  hint="Aparece na página pública, junto ao nome."
                />
                <Field
                  label="Email"
                  name="email"
                  type="email"
                  placeholder="ana@clinicasorriso.pt"
                  hint="Interno. Não é mostrado ao cliente final."
                />

                <fieldset>
                  <legend className="mb-2 text-(length:--text-sm) font-medium">
                    Cor no calendário
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {CORES.map((cor, i) => (
                      <label
                        key={cor}
                        className="cursor-pointer rounded-(--radius-full) p-0.5 has-[:checked]:ring-2 has-[:checked]:ring-(--ink) has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-(--focus-ring)"
                      >
                        <input
                          type="radio"
                          name="calendarColor"
                          value={cor}
                          defaultChecked={i === 0}
                          className="sr-only"
                        />
                        <span
                          aria-hidden="true"
                          className="block size-7 rounded-(--radius-full)"
                          style={{ background: cor }}
                        />
                        <span className="sr-only">{cor}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <label className="flex items-start gap-2.5 text-(length:--text-sm)">
                  <input
                    type="checkbox"
                    name="acceptsOnlineBooking"
                    defaultChecked
                    className="mt-0.5 size-4"
                  />
                  <span>
                    Aceita marcação online
                    <span className="block text-(--ink-subtle)">
                      Se desligar, continua na agenda interna mas o cliente não o pode escolher.
                    </span>
                  </span>
                </label>

                {state.error ? (
                  <p role="alert" className="text-(length:--text-sm) text-(--danger)">
                    {state.error}
                  </p>
                ) : null}

                <div className="flex justify-end gap-3 pt-2">
                  <DialogClose asChild>
                    <Button type="button" variant="secondary">
                      Cancelar
                    </Button>
                  </DialogClose>
                  <Button type="submit" loading={pending}>
                    Adicionar
                  </Button>
                </div>
              </form>
            </DialogContent>
          </DialogRoot>
        ) : null}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTROS.map((f) => {
          const quantos = contarFiltro(f.chave, staff, porProfissional);

          // Um filtro vazio não se esconde: some-se e a pessoa pergunta-se para
          // onde foi. Fica visível, com o zero à vista.
          return (
            <button
              key={f.chave}
              type="button"
              onClick={() => setFiltro(f.chave)}
              aria-pressed={filtro === f.chave}
              className={cn(
                'flex min-h-11 cursor-pointer items-center gap-2 rounded-(--radius-full) border px-3.5 text-(length:--text-sm)',
                'transition-[background-color,border-color,transform] duration-(--duration-fast) ease-(--ease-out-soft)',
                'active:scale-[0.97]',
                filtro === f.chave
                  ? 'border-(--brand) bg-(--brand-soft) font-medium text-(--brand)'
                  : 'border-(--line) text-(--ink-muted) hover:border-(--line-strong)',
                f.chave === 'sem-servicos' &&
                  quantos > 0 &&
                  filtro !== f.chave &&
                  'text-(--warning)',
              )}
            >
              {f.rotulo}
              <span className="tabular-nums opacity-70">{quantos}</span>
            </button>
          );
        })}
      </div>

      {canManage && selecaoAtiva.length > 0 ? (
        <div
          role="status"
          className="mb-3 flex flex-wrap items-center gap-2 rounded-(--radius-md) border border-(--brand) bg-(--brand-soft) px-4 py-2.5"
        >
          <span className="text-(length:--text-sm) font-medium text-(--brand)">
            {selecaoAtiva.length} selecionado{selecaoAtiva.length === 1 ? '' : 's'}
          </span>
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              disabled={aMudar}
              onClick={() => emMassa('ativar')}
            >
              Ativar
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={aMudar}
              onClick={() => emMassa('desativar')}
            >
              Desativar
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={aMudar}
              onClick={() => emMassa('esconder')}
            >
              Esconder do público
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={aMudar}
              onClick={() => emMassa('mostrar')}
            >
              Mostrar
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={aMudar}
              onClick={() => emMassa('arquivar')}
            >
              Arquivar
            </Button>
          </div>
          <button
            type="button"
            onClick={() => setSelecionados(new Set())}
            className="ml-auto min-h-11 cursor-pointer px-2 text-(length:--text-sm) text-(--ink-muted) underline underline-offset-4"
          >
            Limpar
          </button>
        </div>
      ) : null}

      {staff.length === 0 ? (
        <EmptyState
          title="Ainda não há ninguém na equipa"
          description={
            canManage
              ? 'Adicione o primeiro profissional. Sem equipa não há agenda — é quem atende que define as horas disponíveis.'
              : 'Quem gere a empresa ainda não configurou a equipa.'
          }
        />
      ) : filtrados.length === 0 ? (
        /* Um ecrã em branco faz a pessoa pensar que os dados desapareceram. */
        <EmptyState
          title="Nada corresponde a esta procura"
          description={
            procura
              ? `Ninguém com "${procura}". Experimente parte do nome, ou limpe os filtros.`
              : 'Nenhum profissional neste filtro. Experimente "Todos".'
          }
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setProcura('');
                setFiltro('todos');
              }}
            >
              Limpar procura e filtros
            </Button>
          }
        />
      ) : (
        <>
          <TabelaEquipa
            visiveis={visiveis}
            servicos={services}
            porProfissional={porProfissional}
            canManage={canManage}
            aMudar={aMudar}
            selecionados={selecionados}
            todosMarcados={todosMarcados}
            ascendente={ascendente}
            onOrdenar={() => setAscendente((v) => !v)}
            onAlternarSelecao={alternarSelecao}
            onAlternarTodos={alternarTodos}
            onAlternarCampo={alternarCampo}
            onArquivar={arquivar}
            onVerServicos={setServicosDe}
            onEditar={setAEditar}
          />

          <ListaEquipa
            visiveis={visiveis}
            porProfissional={porProfissional}
            canManage={canManage}
            aMudar={aMudar}
            onAlternarCampo={alternarCampo}
            onVerServicos={setServicosDe}
            onEditar={setAEditar}
          />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-(length:--text-sm) text-(--ink-muted)">
            <p role="status">
              {filtrados.length} {filtrados.length === 1 ? 'pessoa' : 'pessoas'}
              {filtrados.length !== staff.length ? ` de ${staff.length}` : ''}
              {paginas > 1
                ? ` · a mostrar ${paginaSegura * POR_PAGINA + 1}–${paginaSegura * POR_PAGINA + visiveis.length}`
                : ''}
            </p>

            {paginas > 1 ? (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={paginaSegura === 0}
                  onClick={() => setPagina(paginaSegura - 1)}
                >
                  Anterior
                </Button>
                <span className="tabular-nums">
                  {paginaSegura + 1} / {paginas}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={paginaSegura >= paginas - 1}
                  onClick={() => setPagina(paginaSegura + 1)}
                >
                  Seguinte
                </Button>
              </div>
            ) : null}
          </div>
        </>
      )}

      {pessoaEmEdicao ? (
        <DialogRoot open onOpenChange={() => setAEditar(null)}>
          <DialogContent
            title={`Editar ${pessoaEmEdicao.full_name}`}
            description="O nome e a função aparecem na página pública. O email é interno."
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const dados = new FormData(e.currentTarget);
                const texto = (campo: string) => String(dados.get(campo) ?? '').trim();

                /*
                 * Campos vazios viajam como `null`, não como `''`.
                 *
                 * O servidor guarda o que recebe: uma string vazia num email
                 * ficaria na base como email vazio em vez de ausente, e depois
                 * aparece como um contacto que existe e não serve.
                 */
                guardarEdicao(pessoaEmEdicao.id, {
                  fullName: texto('fullName'),
                  jobTitle: texto('jobTitle') || null,
                  email: texto('email') || null,
                  calendarColor: texto('calendarColor') || null,
                });
              }}
              className="space-y-4"
            >
              <Field
                label="Nome"
                name="fullName"
                defaultValue={pessoaEmEdicao.full_name}
                required
              />
              <Field
                label="Função"
                name="jobTitle"
                defaultValue={pessoaEmEdicao.job_title ?? ''}
                placeholder="Médica dentista"
                hint="Aparece na página pública, junto ao nome."
              />
              <Field
                label="Email"
                name="email"
                type="email"
                defaultValue={pessoaEmEdicao.email ?? ''}
                hint="Interno. Não é mostrado ao cliente final."
              />

              <fieldset>
                <legend className="mb-2 text-(length:--text-sm) font-medium">
                  Cor no calendário
                </legend>
                <div className="flex flex-wrap gap-2">
                  {CORES.map((cor) => (
                    <label
                      key={cor}
                      className="cursor-pointer rounded-(--radius-full) p-0.5 has-[:checked]:ring-2 has-[:checked]:ring-(--ink) has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-(--focus-ring)"
                    >
                      <input
                        type="radio"
                        name="calendarColor"
                        value={cor}
                        defaultChecked={
                          (pessoaEmEdicao.calendar_color ?? '').toUpperCase() === cor.toUpperCase()
                        }
                        className="sr-only"
                      />
                      <span
                        aria-hidden="true"
                        className="block size-7 rounded-(--radius-full)"
                        style={{ background: cor }}
                      />
                      <span className="sr-only">{cor}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {/*
               * A ponte para os serviços.
               *
               * Quem abre "Editar" quer muitas vezes é dizer o que a pessoa
               * faz — e essa lista vive noutra caixa, alcançável só por um
               * link discreto na tabela. Sem esta ponte, o caminho existe e
               * não se encontra, que na prática é o mesmo que não existir.
               */}
              <button
                type="button"
                onClick={() => {
                  const id = pessoaEmEdicao.id;
                  setAEditar(null);
                  setServicosDe(id);
                }}
                className="min-h-11 cursor-pointer text-(length:--text-sm) text-(--brand) underline underline-offset-4"
              >
                Serviços que {pessoaEmEdicao.full_name.split(' ')[0]} faz
                {(porProfissional.get(pessoaEmEdicao.id)?.size ?? 0) === 0
                  ? ' — nenhum ligado'
                  : ` — ${porProfissional.get(pessoaEmEdicao.id)?.size}`}
              </button>

              <div className="flex justify-end gap-3 pt-2">
                <DialogClose asChild>
                  <Button type="button" variant="secondary">
                    Cancelar
                  </Button>
                </DialogClose>
                <Button type="submit" loading={aMudar}>
                  Guardar
                </Button>
              </div>
            </form>
          </DialogContent>
        </DialogRoot>
      ) : null}

      {pessoaDosServicos ? (
        <DialogRoot open onOpenChange={() => setServicosDe(null)}>
          <DialogContent
            title={`Serviços de ${pessoaDosServicos.full_name}`}
            description="Só aparece em marcações dos serviços ligados aqui."
          >
            <div className="flex flex-wrap gap-2">
              {services.length === 0 ? (
                <p className="text-(length:--text-sm) text-(--ink-muted)">
                  Ainda não há serviços. Crie-os primeiro na página Serviços.
                </p>
              ) : (
                services.map((service) => {
                  const ligado =
                    porProfissional.get(pessoaDosServicos.id)?.has(service.id) ?? false;
                  return (
                    <label
                      key={service.id}
                      className={cn(
                        'cursor-pointer rounded-(--radius-full) border px-3 py-1.5',
                        'text-(length:--text-sm) whitespace-nowrap',
                        'transition-colors duration-(--duration-fast)',
                        'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-(--focus-ring)',
                        !canManage && 'pointer-events-none',
                        ligado
                          ? 'border-transparent bg-(--brand-soft) text-(--brand)'
                          : 'border-(--line) text-(--ink-muted) hover:border-(--line-strong)',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={ligado}
                        disabled={!canManage || aMudar}
                        onChange={() => alternarServico(pessoaDosServicos.id, service.id, !ligado)}
                        className="sr-only"
                      />
                      {service.name}
                    </label>
                  );
                })
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  Fechar
                </Button>
              </DialogClose>
            </div>
          </DialogContent>
        </DialogRoot>
      ) : null}
    </>
  );
}

/** A tabela do computador. Escondida abaixo de 768 px. */
function TabelaEquipa({
  visiveis,
  servicos,
  porProfissional,
  canManage,
  aMudar,
  selecionados,
  todosMarcados,
  ascendente,
  onOrdenar,
  onAlternarSelecao,
  onAlternarTodos,
  onAlternarCampo,
  onArquivar,
  onVerServicos,
  onEditar,
}: {
  visiveis: Staff[];
  servicos: Service[];
  porProfissional: Map<string, Set<string>>;
  canManage: boolean;
  aMudar: boolean;
  selecionados: Set<string>;
  todosMarcados: boolean;
  ascendente: boolean;
  onOrdenar: () => void;
  onAlternarSelecao: (id: string) => void;
  onAlternarTodos: () => void;
  onAlternarCampo: (id: string, campo: 'isActive' | 'acceptsOnlineBooking', valor: boolean) => void;
  onArquivar: (id: string) => void;
  onVerServicos: (id: string) => void;
  onEditar: (id: string) => void;
}) {
  return (
    <Card className="hidden overflow-hidden p-0 md:block">
      {/* Sem isto, uma tabela larga empurra a página inteira para o lado. */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-(length:--text-sm)">
          <caption className="sr-only">Profissionais da equipa</caption>
          <thead>
            {/* Cabeçalho colado ao topo: com 25 linhas, saber que coluna se está
                a ler não pode depender de rolar para trás. */}
            <tr className="sticky top-0 z-10 bg-(--surface-sunken) text-left">
              {canManage ? (
                <th scope="col" className="w-11 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={todosMarcados}
                    onChange={onAlternarTodos}
                    aria-label="Selecionar todos nesta página"
                    className="size-4 cursor-pointer"
                  />
                </th>
              ) : null}

              <th scope="col" className="px-3 py-2.5 font-medium">
                <button
                  type="button"
                  onClick={onOrdenar}
                  className="inline-flex cursor-pointer items-center gap-1.5"
                  aria-label={`Ordenar por nome, ${ascendente ? 'decrescente' : 'crescente'}`}
                >
                  Nome
                  <span aria-hidden className="text-(--ink-subtle)">
                    {ascendente ? '↑' : '↓'}
                  </span>
                </button>
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                Função
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                Serviços
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                Estado
              </th>
              {canManage ? (
                <th scope="col" className="px-3 py-2.5 text-right font-medium">
                  Ações
                </th>
              ) : null}
            </tr>
          </thead>

          <tbody className="divide-y divide-(--line)">
            {visiveis.map((pessoa) => {
              const quantos = porProfissional.get(pessoa.id)?.size ?? 0;
              const marcado = selecionados.has(pessoa.id);

              return (
                <tr
                  key={pessoa.id}
                  className={cn(
                    'transition-colors duration-(--duration-fast)',
                    marcado ? 'bg-(--brand-soft)' : 'hover:bg-(--surface-sunken)',
                  )}
                >
                  {canManage ? (
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={() => onAlternarSelecao(pessoa.id)}
                        aria-label={`Selecionar ${pessoa.full_name}`}
                        className="size-4 cursor-pointer"
                      />
                    </td>
                  ) : null}

                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    <span className="flex min-h-11 items-center gap-2.5">
                      <span
                        aria-hidden="true"
                        className="size-3 shrink-0 rounded-(--radius-full) border border-(--line)"
                        style={{ background: pessoa.calendar_color ?? 'var(--ink-subtle)' }}
                      />
                      {canManage ? (
                        <button
                          type="button"
                          onClick={() => onEditar(pessoa.id)}
                          className="cursor-pointer rounded-(--radius-sm) text-left font-medium underline decoration-transparent underline-offset-4 transition-colors duration-(--duration-fast) hover:decoration-current"
                        >
                          {pessoa.full_name}
                        </button>
                      ) : (
                        <span className="font-medium">{pessoa.full_name}</span>
                      )}
                    </span>
                  </th>

                  <td className="px-3 py-2 text-(--ink-muted)">{pessoa.job_title ?? '—'}</td>

                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => onVerServicos(pessoa.id)}
                      className={cn(
                        'min-h-11 cursor-pointer rounded-(--radius-sm) px-2 text-left tabular-nums underline underline-offset-4',
                        quantos === 0 ? 'text-(--warning)' : 'text-(--ink-muted)',
                      )}
                    >
                      {quantos === 0 ? 'nenhum' : `${quantos} de ${servicos.length}`}
                    </button>
                  </td>

                  <td className="px-3 py-2">
                    {!pessoa.is_active ? (
                      <Badge tone="neutral">Inativo</Badge>
                    ) : !pessoa.accepts_online_booking ? (
                      <Badge tone="warning">Só interno</Badge>
                    ) : (
                      <span className="text-(--ink-muted)">Ativo</span>
                    )}
                  </td>

                  {canManage ? (
                    <td className="px-3 py-2">
                      <span className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={aMudar}
                          onClick={() => onEditar(pessoa.id)}
                        >
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={aMudar}
                          onClick={() => onAlternarCampo(pessoa.id, 'isActive', !pessoa.is_active)}
                        >
                          {pessoa.is_active ? 'Desativar' : 'Ativar'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={aMudar}
                          onClick={() =>
                            onAlternarCampo(
                              pessoa.id,
                              'acceptsOnlineBooking',
                              !pessoa.accepts_online_booking,
                            )
                          }
                        >
                          {pessoa.accepts_online_booking ? 'Esconder' : 'Mostrar'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={aMudar}
                          onClick={() => onArquivar(pessoa.id)}
                        >
                          Arquivar
                        </Button>
                      </span>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/**
 * A lista de telemóvel.
 *
 * Sem seleção múltipla: marcar caixas com o polegar numa lista que se rola é
 * pedir seleções por engano. Quem faz alterações em massa está ao computador.
 */
function ListaEquipa({
  visiveis,
  porProfissional,
  canManage,
  aMudar,
  onAlternarCampo,
  onVerServicos,
  onEditar,
}: {
  visiveis: Staff[];
  porProfissional: Map<string, Set<string>>;
  canManage: boolean;
  aMudar: boolean;
  onAlternarCampo: (id: string, campo: 'isActive' | 'acceptsOnlineBooking', valor: boolean) => void;
  onVerServicos: (id: string) => void;
  onEditar: (id: string) => void;
}) {
  return (
    <ul className="space-y-2 md:hidden">
      {visiveis.map((pessoa) => {
        const quantos = porProfissional.get(pessoa.id)?.size ?? 0;

        return (
          <li key={pessoa.id}>
            <Card className="px-4 py-3">
              <div className="flex items-start gap-2.5">
                <span
                  aria-hidden="true"
                  className="mt-1.5 size-3 shrink-0 rounded-(--radius-full) border border-(--line)"
                  style={{ background: pessoa.calendar_color ?? 'var(--ink-subtle)' }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{pessoa.full_name}</span>
                    {!pessoa.is_active ? <Badge tone="neutral">Inativo</Badge> : null}
                    {pessoa.is_active && !pessoa.accepts_online_booking ? (
                      <Badge tone="warning">Só interno</Badge>
                    ) : null}
                  </div>
                  {pessoa.job_title ? (
                    <p className="mt-0.5 text-(length:--text-sm) text-(--ink-muted)">
                      {pessoa.job_title}
                    </p>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => onVerServicos(pessoa.id)}
                    className={cn(
                      'mt-1 min-h-11 cursor-pointer text-(length:--text-sm) underline underline-offset-4',
                      quantos === 0 ? 'text-(--warning)' : 'text-(--ink-muted)',
                    )}
                  >
                    {quantos === 0 ? 'Sem serviços' : `${quantos} serviços`}
                  </button>
                </div>
              </div>

              {canManage ? (
                <div className="mt-2 flex flex-wrap gap-1.5 border-t border-(--line) pt-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={aMudar}
                    onClick={() => onEditar(pessoa.id)}
                  >
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={aMudar}
                    onClick={() => onAlternarCampo(pessoa.id, 'isActive', !pessoa.is_active)}
                  >
                    {pessoa.is_active ? 'Desativar' : 'Ativar'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={aMudar}
                    onClick={() =>
                      onAlternarCampo(
                        pessoa.id,
                        'acceptsOnlineBooking',
                        !pessoa.accepts_online_booking,
                      )
                    }
                  >
                    {pessoa.accepts_online_booking ? 'Esconder' : 'Mostrar'}
                  </Button>
                </div>
              ) : null}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
