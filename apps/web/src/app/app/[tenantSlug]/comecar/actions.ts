'use server';

import { revalidatePath } from 'next/cache';

import { createLocationSchema, janelaSemanal, slugify, uuidSchema } from '@totalmobi/shared';

import { requireRole } from '@/lib/auth/context';
import { writeAuditLog } from '@/lib/audit';

/**
 * A unidade — o passo que não existia.
 *
 * A página de unidades sempre foi só de leitura, com uma nota a dizer que criar
 * pela interface «chega com os horários, no Milestone 6». Não chegou. As três
 * empresas de demonstração receberam as suas unidades por migração, e por isso
 * ninguém deu pela falta — até nascer a primeira empresa a sério, que ficou
 * parada no primeiro passo da lista sem forma de o dar.
 *
 * O schema já cá estava desde o início (`createLocationSchema`), com testes.
 * Faltava só quem o chamasse.
 *
 * O FUSO É OBRIGATÓRIO E NÃO SE HERDA EM SILÊNCIO
 *
 * É a decisão que o schema já tinha tomado, e vale a pena repeti-la: o fuso
 * pertence à unidade, não à empresa. Uma rede com Lisboa e São Paulo tem dois,
 * e um erro aqui marca o cliente com horas de diferença — o tipo de erro que só
 * se descobre quando alguém falta a uma consulta.
 */

export type EstadoDoPasso = { error?: string; ok?: boolean; id?: string };

export async function criarUnidade(
  tenantId: string,
  tenantSlug: string,
  _anterior: EstadoDoPasso,
  formData: FormData,
): Promise<EstadoDoPasso> {
  const guard = await requireRole(tenantId, 'manager');
  if (!guard.ok) return { error: 'Não tem permissão para criar unidades.' };

  const nome = String(formData.get('name') ?? '').trim();

  /*
   * `locations_one_default_idx` deixa passar exatamente uma unidade por omissão
   * por empresa. Fixar `is_default: true` funcionava na primeira criação e
   * rebentava na segunda com um erro cru do Postgres — e a segunda acontece
   * sozinha: dois separadores abertos, um duplo clique, um recarregamento
   * depois de gravar.
   *
   * Pergunta-se antes. A primeira unidade fica por omissão porque alguém tem de
   * ser; as seguintes não mexem em quem já lá está.
   */
  const { data: jaHaOmissao } = await guard.value.client
    .from('locations')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('is_default', true)
    .is('archived_at', null)
    .maybeSingle();

  const parsed = createLocationSchema.safeParse({
    tenantId,
    name: nome,
    slug: slugify(nome),
    timezone: String(formData.get('timezone') ?? '').trim(),
    addressLine1: String(formData.get('addressLine1') ?? '').trim() || undefined,
    postalCode: String(formData.get('postalCode') ?? '').trim() || undefined,
    city: String(formData.get('city') ?? '').trim() || undefined,
    isDefault: !jaHaOmissao,
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue ? `${String(issue.path[0] ?? '')}: ${issue.message}` : 'Dados inválidos.' };
  }

  const { data, error } = await guard.value.client
    .from('locations')
    .insert({
      tenant_id: tenantId,
      name: parsed.data.name,
      slug: parsed.data.slug,
      timezone: parsed.data.timezone,
      address_line1: parsed.data.addressLine1 ?? null,
      postal_code: parsed.data.postalCode ?? null,
      city: parsed.data.city ?? null,
      country_code: parsed.data.countryCode,
      is_default: parsed.data.isDefault,
    })
    .select('id')
    .single();

  if (error || !data) {
    // `23505` aqui é quase sempre outra unidade com o mesmo nome — o slug sai
    // do nome, e dois «Clínica do Rossio» dão o mesmo. Vale a pena dizê-lo em
    // vez de mostrar o texto do Postgres a quem está a criar a primeira conta.
    if (error?.code === '23505') {
      return { error: 'Já existe uma unidade com este nome. Escolha outro.' };
    }
    return { error: `Não foi possível criar: ${error?.message ?? 'erro desconhecido'}` };
  }

  await writeAuditLog({
    tenantId,
    action: 'location.created',
    entity: 'location',
    entityId: data.id,
    actorType: 'user',
    actorUserId: guard.value.user.id,
    newValues: { name: parsed.data.name, timezone: parsed.data.timezone },
  });

  revalidatePath(`/app/${tenantSlug}/comecar`);
  revalidatePath(`/app/${tenantSlug}/unidades`);
  return { ok: true, id: data.id };
}

/**
 * O horário de abertura, em cima de toda a equipa de uma vez.
 *
 * O assistente não pergunta o horário pessoa a pessoa. Numa clínica que está a
 * abrir a conta, toda a gente faz o mesmo horário — e quem precisar de
 * diferenciar tem a página de horários, que é feita para isso e faz muito mais
 * do que isto.
 *
 * Pedir aqui o horário de cinquenta pessoas, uma a uma, era garantir que
 * ninguém acabava a configuração.
 */
export async function horarioParaEquipaToda(
  tenantId: string,
  tenantSlug: string,
  _anterior: EstadoDoPasso,
  formData: FormData,
): Promise<EstadoDoPasso> {
  const guard = await requireRole(tenantId, 'manager');
  if (!guard.ok) return { error: 'Não tem permissão para alterar horários.' };

  const unidade = uuidSchema.safeParse(String(formData.get('locationId') ?? ''));
  if (!unidade.success) return { error: 'Unidade inválida.' };

  // As regras das horas vivem em `janelaSemanal`, que é pura e tem testes. Uma
  // ação de servidor precisa de sessão e de base de dados para correr; aquilo
  // precisa de dois textos e uma lista.
  const janela = janelaSemanal({
    // 0 a 6, domingo a sábado, como na coluna `weekday`. O assistente só oferece
    // segunda a sexta; quem trabalha ao sábado acrescenta-o na página de
    // horários, que é onde essa conversa cabe.
    dias: [1, 2, 3, 4, 5].filter((d) => formData.get(`dia-${d}`) !== null),
    abre: String(formData.get('abre') ?? ''),
    fecha: String(formData.get('fecha') ?? ''),
  });

  if ('erro' in janela) return { error: janela.erro };

  const { dias, abre, fecha } = janela.ok;

  const client = guard.value.client;

  const { data: equipa, error: erroDaEquipa } = await client
    .from('staff')
    .select('id')
    .eq('tenant_id', tenantId)
    .is('archived_at', null);

  if (erroDaEquipa) return { error: `Não foi possível ler a equipa: ${erroDaEquipa.message}` };
  if (!equipa?.length) return { error: 'Ainda não há ninguém na equipa.' };

  /*
   * Apaga e reinsere, como o `setStaffHours` da página de horários — e pela
   * mesma razão: para sete dias e um período, descobrir o que mudou custa mais
   * do que reescrever, e não deixa lixo para trás.
   *
   * O `delete` limita-se a esta unidade e a esta equipa. Um profissional que
   * trabalhe noutra unidade não perde o horário de lá.
   */
  const ids = equipa.map((p) => p.id);

  const { error: erroApagar } = await client
    .from('staff_working_hours')
    .delete()
    .in('staff_id', ids)
    .eq('location_id', unidade.data);

  if (erroApagar) return { error: `Não foi possível guardar: ${erroApagar.message}` };

  const linhas = ids.flatMap((staffId) =>
    dias.map((weekday) => ({
      staff_id: staffId,
      location_id: unidade.data,
      weekday,
      starts_at: abre,
      ends_at: fecha,
    })),
  );

  const { error } = await client.from('staff_working_hours').insert(linhas);
  if (error) return { error: `Não foi possível guardar: ${error.message}` };

  await writeAuditLog({
    tenantId,
    action: 'staff_hours.bulk_set',
    entity: 'staff_working_hours',
    actorType: 'user',
    actorUserId: guard.value.user.id,
    newValues: { pessoas: ids.length, dias: dias.length, abre, fecha },
  });

  revalidatePath(`/app/${tenantSlug}/comecar`);
  revalidatePath(`/app/${tenantSlug}/horarios`);
  return { ok: true };
}

/**
 * Quem faz o quê, tudo de uma vez.
 *
 * A página de equipa liga um par de cada vez, com um pedido por clique — bom
 * para corrigir uma ligação, mau para as declarar todas. Aqui chega uma matriz
 * inteira num só pedido.
 *
 * As caixas vêm no formulário como `lig-{staffId}-{serviceId}`. O que não vier
 * é para desligar: um formulário só diz o que está marcado, e tratar o silêncio
 * como «deixa estar» tornaria impossível desmarcar seja o que for.
 */
export async function ligarServicos(
  tenantId: string,
  tenantSlug: string,
  _anterior: EstadoDoPasso,
  formData: FormData,
): Promise<EstadoDoPasso> {
  const guard = await requireRole(tenantId, 'manager');
  if (!guard.ok) return { error: 'Não tem permissão.' };

  const client = guard.value.client;

  const [{ data: equipa }, { data: servicos }] = await Promise.all([
    client.from('staff').select('id').eq('tenant_id', tenantId).is('archived_at', null),
    client.from('services').select('id').eq('tenant_id', tenantId).is('archived_at', null),
  ]);

  if (!equipa?.length || !servicos?.length) return { error: 'Faltam serviços ou equipa.' };

  const marcadas = new Set<string>();
  for (const p of equipa) {
    for (const s of servicos) {
      if (formData.get(`lig-${p.id}-${s.id}`) !== null) marcadas.add(`${p.id}:${s.id}`);
    }
  }

  if (marcadas.size === 0) {
    return { error: 'Escolha pelo menos um serviço para alguém — senão não há hora nenhuma.' };
  }

  const paraLigar = [...marcadas].map((par) => {
    const [staffId, serviceId] = par.split(':');
    return { staff_id: staffId!, service_id: serviceId!, is_active: true };
  });

  // O trigger `staff_services_same_tenant` recusa ligações entre empresas
  // diferentes, mesmo que a RLS deixasse passar.
  const { error } = await client
    .from('staff_services')
    .upsert(paraLigar, { onConflict: 'staff_id,service_id' });

  if (error) return { error: `Não foi possível ligar: ${error.message}` };

  // O que não veio marcado deixa de existir. Apaga-se em vez de desativar: ou a
  // pessoa faz o serviço, ou não faz — não há valor herdado a distinguir.
  const idsDaEquipa = equipa.map((p) => p.id);
  const { data: existentes } = await client
    .from('staff_services')
    .select('staff_id, service_id')
    .in('staff_id', idsDaEquipa);

  const aRemover = (existentes ?? []).filter(
    (l) => !marcadas.has(`${l.staff_id}:${l.service_id}`),
  );

  for (const l of aRemover) {
    await client
      .from('staff_services')
      .delete()
      .eq('staff_id', l.staff_id)
      .eq('service_id', l.service_id);
  }

  await writeAuditLog({
    tenantId,
    action: 'staff_services.bulk_set',
    entity: 'staff_services',
    actorType: 'user',
    actorUserId: guard.value.user.id,
    newValues: { ligadas: marcadas.size, removidas: aRemover.length },
  });

  revalidatePath(`/app/${tenantSlug}/comecar`);
  revalidatePath(`/app/${tenantSlug}/equipa`);
  return { ok: true };
}
