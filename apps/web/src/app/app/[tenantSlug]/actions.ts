'use server';

import { revalidatePath } from 'next/cache';

import {
  createServiceSchema,
  createStaffSchema,
  slugify,
  updateServiceSchema,
  updateStaffSchema,
  uuidSchema,
} from '@totalmobi/shared';

import type { ServiceUpdate, StaffUpdate } from '@totalmobi/database';

import { requireRole } from '@/lib/auth/context';
import { writeAuditLog } from '@/lib/audit';

/**
 * Gestão do catálogo: serviços, equipa e as ligações entre eles.
 *
 * TRÊS REGRAS QUE VALEM PARA TODAS
 *
 * 1. **`requireRole(tenantId, 'manager')` antes de tudo.** Gerir o catálogo é
 *    operação corrente — não faz sentido chamar o dono para mudar o preço de um
 *    corte de cabelo. Mas um `staff` não mexe aqui.
 *
 * 2. **Escreve-se com a sessão do utilizador, não com `service_role`.** A RLS
 *    fica como segunda linha: se a guarda acima falhasse, a base de dados ainda
 *    recusava. É o contrário das ações da consola, onde `service_role` é
 *    inevitável porque se atravessam tenants.
 *
 * 3. **Arquiva-se, não se apaga.** Um serviço com marcações no histórico não
 *    pode desaparecer, senão a agenda de dezembro deixa de fazer sentido.
 */

export type CatalogState = { error?: string; ok?: boolean; id?: string };

function firstIssue(error: { issues: { path: PropertyKey[]; message: string }[] }): string {
  const issue = error.issues[0];
  return issue ? `${String(issue.path[0] ?? '')}: ${issue.message}` : 'Dados inválidos.';
}

function num(form: FormData, key: string): number | undefined {
  const raw = form.get(key);
  if (raw === null || raw === '') return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Campo numérico opcional: vazio significa "herda", não zero. */
function nullableNum(form: FormData, key: string): number | null {
  const raw = form.get(key);
  if (raw === null || String(raw).trim() === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

// --- Serviços ----------------------------------------------------------------

export async function createService(
  tenantId: string,
  tenantSlug: string,
  _previous: CatalogState,
  formData: FormData,
): Promise<CatalogState> {
  const guard = await requireRole(tenantId, 'manager');
  if (!guard.ok) return { error: 'Não tem permissão para gerir serviços.' };

  const nome = String(formData.get('name') ?? '').trim();

  const parsed = createServiceSchema.safeParse({
    tenantId,
    name: nome,
    slug: String(formData.get('slug') ?? '').trim() || slugify(nome),
    description: String(formData.get('description') ?? '').trim() || null,
    durationMinutes: num(formData, 'durationMinutes'),
    bufferBeforeMinutes: num(formData, 'bufferBeforeMinutes') ?? 0,
    bufferAfterMinutes: num(formData, 'bufferAfterMinutes') ?? 0,
    price: nullableNum(formData, 'price'),
    capacity: num(formData, 'capacity') ?? 1,
    bookableOnline: formData.get('bookableOnline') !== null,
    requiresConfirmation: formData.get('requiresConfirmation') !== null,
  });

  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const { data, error } = await guard.value.client
    .from('services')
    .insert({
      tenant_id: tenantId,
      name: parsed.data.name,
      slug: parsed.data.slug,
      description: parsed.data.description ?? null,
      duration_minutes: parsed.data.durationMinutes,
      buffer_before_minutes: parsed.data.bufferBeforeMinutes,
      buffer_after_minutes: parsed.data.bufferAfterMinutes,
      price: parsed.data.price ?? null,
      currency: parsed.data.price != null ? 'EUR' : null,
      capacity: parsed.data.capacity,
      bookable_online: parsed.data.bookableOnline,
      requires_confirmation: parsed.data.requiresConfirmation,
    })
    .select('id')
    .single();

  if (error || !data) {
    if (error?.code === '23505') {
      return { error: `Já existe um serviço com o identificador "${parsed.data.slug}".` };
    }
    return { error: `Não foi possível criar: ${error?.message ?? 'erro desconhecido'}` };
  }

  await writeAuditLog({
    tenantId,
    action: 'service.created',
    entity: 'service',
    entityId: data.id,
    actorType: 'user',
    actorUserId: guard.value.user.id,
    newValues: { name: parsed.data.name, duration: parsed.data.durationMinutes },
  });

  revalidatePath(`/app/${tenantSlug}/servicos`);
  return { ok: true, id: data.id };
}

export async function updateService(
  tenantId: string,
  tenantSlug: string,
  serviceId: string,
  patch: Record<string, unknown>,
): Promise<CatalogState> {
  const guard = await requireRole(tenantId, 'manager');
  if (!guard.ok) return { error: 'Não tem permissão.' };

  const parsed = updateServiceSchema.safeParse({ id: serviceId, ...patch });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const { id, ...campos } = parsed.data;

  // Construído campo a campo em vez de por um mapa genérico: o tipo gerado
  // recusa `Record<string, unknown>`, e essa recusa é útil — apanha uma coluna
  // mal escrita em tempo de compilação, em vez de a ignorar em silêncio.
  const update: ServiceUpdate = {};
  if (campos.name !== undefined) update.name = campos.name;
  if (campos.description !== undefined) update.description = campos.description ?? null;
  if (campos.durationMinutes !== undefined) update.duration_minutes = campos.durationMinutes;
  if (campos.bufferBeforeMinutes !== undefined)
    update.buffer_before_minutes = campos.bufferBeforeMinutes;
  if (campos.bufferAfterMinutes !== undefined)
    update.buffer_after_minutes = campos.bufferAfterMinutes;
  if (campos.price !== undefined) update.price = campos.price ?? null;
  if (campos.promoPrice !== undefined) update.promo_price = campos.promoPrice ?? null;
  if (campos.capacity !== undefined) update.capacity = campos.capacity;
  if (campos.isActive !== undefined) update.is_active = campos.isActive;
  if (campos.bookableOnline !== undefined) update.bookable_online = campos.bookableOnline;
  if (campos.requiresConfirmation !== undefined)
    update.requires_confirmation = campos.requiresConfirmation;
  if (campos.color !== undefined) update.color = campos.color ?? null;
  if (campos.sortOrder !== undefined) update.sort_order = campos.sortOrder;

  if (Object.keys(update).length === 0) return { ok: true };

  // A RLS filtra pelo tenant; o `.eq('tenant_id')` é a segunda linha, para o
  // caso de alguém passar um id de outro tenant por engano.
  const { error } = await guard.value.client
    .from('services')
    .update(update)
    .eq('id', id)
    .eq('tenant_id', tenantId);

  if (error) return { error: `Não foi possível guardar: ${error.message}` };

  await writeAuditLog({
    tenantId,
    action: 'service.updated',
    entity: 'service',
    entityId: id,
    actorType: 'user',
    actorUserId: guard.value.user.id,
    newValues: update,
  });

  revalidatePath(`/app/${tenantSlug}/servicos`);
  return { ok: true };
}

export async function archiveService(
  tenantId: string,
  tenantSlug: string,
  serviceId: string,
): Promise<CatalogState> {
  const guard = await requireRole(tenantId, 'manager');
  if (!guard.ok) return { error: 'Não tem permissão.' };

  const id = uuidSchema.safeParse(serviceId);
  if (!id.success) return { error: 'Pedido inválido.' };

  // Arquivar, não apagar: as marcações passadas continuam a precisar deste
  // serviço para fazerem sentido.
  const { error } = await guard.value.client
    .from('services')
    .update({ archived_at: new Date().toISOString(), is_active: false })
    .eq('id', id.data)
    .eq('tenant_id', tenantId);

  if (error) return { error: `Não foi possível arquivar: ${error.message}` };

  await writeAuditLog({
    tenantId,
    action: 'service.archived',
    entity: 'service',
    entityId: id.data,
    actorType: 'user',
    actorUserId: guard.value.user.id,
  });

  revalidatePath(`/app/${tenantSlug}/servicos`);
  return { ok: true };
}

// --- Equipa ------------------------------------------------------------------

export async function createStaff(
  tenantId: string,
  tenantSlug: string,
  _previous: CatalogState,
  formData: FormData,
): Promise<CatalogState> {
  const guard = await requireRole(tenantId, 'manager');
  if (!guard.ok) return { error: 'Não tem permissão para gerir a equipa.' };

  const parsed = createStaffSchema.safeParse({
    tenantId,
    fullName: String(formData.get('fullName') ?? '').trim(),
    jobTitle: String(formData.get('jobTitle') ?? '').trim() || null,
    email: String(formData.get('email') ?? '').trim() || null,
    calendarColor: String(formData.get('calendarColor') ?? '').trim() || null,
    acceptsOnlineBooking: formData.get('acceptsOnlineBooking') !== null,
  });

  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const { data, error } = await guard.value.client
    .from('staff')
    .insert({
      tenant_id: tenantId,
      full_name: parsed.data.fullName,
      job_title: parsed.data.jobTitle ?? null,
      email: parsed.data.email ?? null,
      calendar_color: parsed.data.calendarColor ?? null,
      accepts_online_booking: parsed.data.acceptsOnlineBooking,
    })
    .select('id')
    .single();

  if (error || !data) {
    return { error: `Não foi possível criar: ${error?.message ?? 'erro desconhecido'}` };
  }

  await writeAuditLog({
    tenantId,
    action: 'staff.created',
    entity: 'staff',
    entityId: data.id,
    actorType: 'user',
    actorUserId: guard.value.user.id,
    newValues: { name: parsed.data.fullName },
  });

  revalidatePath(`/app/${tenantSlug}/equipa`);
  return { ok: true, id: data.id };
}

export async function updateStaff(
  tenantId: string,
  tenantSlug: string,
  staffId: string,
  patch: Record<string, unknown>,
): Promise<CatalogState> {
  const guard = await requireRole(tenantId, 'manager');
  if (!guard.ok) return { error: 'Não tem permissão.' };

  const parsed = updateStaffSchema.safeParse({ id: staffId, ...patch });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const { id, ...campos } = parsed.data;

  const update: StaffUpdate = {};
  if (campos.fullName !== undefined) update.full_name = campos.fullName;
  if (campos.jobTitle !== undefined) update.job_title = campos.jobTitle ?? null;
  if (campos.bio !== undefined) update.bio = campos.bio ?? null;
  if (campos.email !== undefined) update.email = campos.email ?? null;
  if (campos.phone !== undefined) update.phone_e164 = campos.phone ?? null;
  if (campos.calendarColor !== undefined) update.calendar_color = campos.calendarColor ?? null;
  if (campos.isActive !== undefined) update.is_active = campos.isActive;
  if (campos.acceptsOnlineBooking !== undefined)
    update.accepts_online_booking = campos.acceptsOnlineBooking;
  if (campos.priority !== undefined) update.priority = campos.priority;
  if (campos.concurrentCapacity !== undefined)
    update.concurrent_capacity = campos.concurrentCapacity;
  if (campos.timezone !== undefined) update.timezone = campos.timezone ?? null;
  if (campos.sortOrder !== undefined) update.sort_order = campos.sortOrder;

  if (Object.keys(update).length === 0) return { ok: true };

  const { error } = await guard.value.client
    .from('staff')
    .update(update)
    .eq('id', id)
    .eq('tenant_id', tenantId);

  if (error) return { error: `Não foi possível guardar: ${error.message}` };

  await writeAuditLog({
    tenantId,
    action: 'staff.updated',
    entity: 'staff',
    entityId: id,
    actorType: 'user',
    actorUserId: guard.value.user.id,
    newValues: update,
  });

  revalidatePath(`/app/${tenantSlug}/equipa`);
  return { ok: true };
}

export async function archiveStaff(
  tenantId: string,
  tenantSlug: string,
  staffId: string,
): Promise<CatalogState> {
  const guard = await requireRole(tenantId, 'manager');
  if (!guard.ok) return { error: 'Não tem permissão.' };

  const id = uuidSchema.safeParse(staffId);
  if (!id.success) return { error: 'Pedido inválido.' };

  const { error } = await guard.value.client
    .from('staff')
    .update({ archived_at: new Date().toISOString(), is_active: false })
    .eq('id', id.data)
    .eq('tenant_id', tenantId);

  if (error) return { error: `Não foi possível arquivar: ${error.message}` };

  await writeAuditLog({
    tenantId,
    action: 'staff.archived',
    entity: 'staff',
    entityId: id.data,
    actorType: 'user',
    actorUserId: guard.value.user.id,
  });

  revalidatePath(`/app/${tenantSlug}/equipa`);
  return { ok: true };
}

/**
 * Liga ou desliga um serviço a um profissional.
 *
 * `linked: false` **apaga** a linha em vez de gravar `is_active: false` — aqui,
 * ao contrário das feature flags, não há um "valor herdado" para distinguir:
 * ou o profissional faz o serviço, ou não faz.
 */
export async function setStaffService(
  tenantId: string,
  tenantSlug: string,
  staffId: string,
  serviceId: string,
  linked: boolean,
): Promise<CatalogState> {
  const guard = await requireRole(tenantId, 'manager');
  if (!guard.ok) return { error: 'Não tem permissão.' };

  const staff = uuidSchema.safeParse(staffId);
  const service = uuidSchema.safeParse(serviceId);
  if (!staff.success || !service.success) return { error: 'Pedido inválido.' };

  if (linked) {
    // O trigger `staff_services_same_tenant` recusa ligações entre empresas
    // diferentes, mesmo que a RLS deixasse passar.
    const { error } = await guard.value.client
      .from('staff_services')
      .upsert(
        { staff_id: staff.data, service_id: service.data, is_active: true },
        { onConflict: 'staff_id,service_id' },
      );
    if (error) return { error: `Não foi possível ligar: ${error.message}` };
  } else {
    const { error } = await guard.value.client
      .from('staff_services')
      .delete()
      .eq('staff_id', staff.data)
      .eq('service_id', service.data);
    if (error) return { error: `Não foi possível desligar: ${error.message}` };
  }

  revalidatePath(`/app/${tenantSlug}/equipa`);
  return { ok: true };
}
