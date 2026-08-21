import { z } from 'zod';

import {
  e164Schema,
  emailSchema,
  hexColorSchema,
  moneySchema,
  slugSchema,
  timezoneSchema,
  uuidSchema,
} from './common';

/**
 * Serviços e profissionais.
 *
 * Os limites aqui espelham as `CHECK` da migration 0009 de propósito. A base de
 * dados é a autoridade — mas apanhar no formulário dá uma mensagem que explica,
 * em vez de um erro de constraint que ninguém percebe.
 */

/** `Limpeza Dentária` → `limpeza-dentaria`. Usado para sugerir, nunca para impor. */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

export const durationSchema = z
  .number()
  .int()
  .min(5, 'Mínimo de 5 minutos')
  .max(1440, 'Máximo de 24 horas');

export const bufferSchema = z.number().int().min(0).max(240, 'Máximo de 4 horas');

export const createServiceSchema = z
  .object({
    tenantId: uuidSchema,
    categoryId: uuidSchema.nullish(),
    name: z.string().min(2, 'Mínimo de 2 caracteres').max(120),
    slug: slugSchema,
    description: z.string().max(2000).nullish(),

    durationMinutes: durationSchema,
    bufferBeforeMinutes: bufferSchema.default(0),
    bufferAfterMinutes: bufferSchema.default(0),

    price: moneySchema.nullish(),
    promoPrice: moneySchema.nullish(),
    currency: z.string().length(3).nullish(),

    capacity: z.number().int().min(1).max(500).default(1),

    isActive: z.boolean().default(true),
    bookableOnline: z.boolean().default(true),
    requiresConfirmation: z.boolean().default(false),

    color: hexColorSchema.nullish(),

    // NULL significa "herda do tenant". Não confundir com zero: `0` é uma
    // decisão explícita de não exigir antecedência nenhuma.
    minAdvanceMinutes: z.number().int().min(0).max(43_200).nullish(),
    maxAdvanceDays: z.number().int().min(1).max(730).nullish(),
    cancellationMinHours: z.number().int().min(0).max(720).nullish(),
    rescheduleMinHours: z.number().int().min(0).max(720).nullish(),
  })
  .refine(
    (v) => v.promoPrice == null || v.price == null || v.promoPrice <= v.price,
    { message: 'O preço promocional tem de ser inferior ao normal', path: ['promoPrice'] },
  );

export const updateServiceSchema = z.object({
  id: uuidSchema,
  categoryId: uuidSchema.nullish(),
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(2000).nullish(),
  durationMinutes: durationSchema.optional(),
  bufferBeforeMinutes: bufferSchema.optional(),
  bufferAfterMinutes: bufferSchema.optional(),
  price: moneySchema.nullish(),
  promoPrice: moneySchema.nullish(),
  capacity: z.number().int().min(1).max(500).optional(),
  isActive: z.boolean().optional(),
  bookableOnline: z.boolean().optional(),
  requiresConfirmation: z.boolean().optional(),
  color: hexColorSchema.nullish(),
  sortOrder: z.number().int().optional(),
});

export const createStaffSchema = z.object({
  tenantId: uuidSchema,
  fullName: z.string().min(2, 'Mínimo de 2 caracteres').max(120),
  jobTitle: z.string().max(120).nullish(),
  bio: z.string().max(2000).nullish(),
  email: emailSchema.nullish(),
  phone: e164Schema.nullish(),
  calendarColor: hexColorSchema.nullish(),
  isActive: z.boolean().default(true),
  acceptsOnlineBooking: z.boolean().default(true),
  /** Desempata em "qualquer profissional": maior primeiro. */
  priority: z.number().int().min(-100).max(100).default(0),
  concurrentCapacity: z.number().int().min(1).max(50).default(1),
  /** NULL = usa o fuso da unidade. Só para quem trabalha noutro fuso. */
  timezone: timezoneSchema.nullish(),
});

export const updateStaffSchema = z.object({
  id: uuidSchema,
  fullName: z.string().min(2).max(120).optional(),
  jobTitle: z.string().max(120).nullish(),
  bio: z.string().max(2000).nullish(),
  email: emailSchema.nullish(),
  phone: e164Schema.nullish(),
  calendarColor: hexColorSchema.nullish(),
  isActive: z.boolean().optional(),
  acceptsOnlineBooking: z.boolean().optional(),
  priority: z.number().int().min(-100).max(100).optional(),
  concurrentCapacity: z.number().int().min(1).max(50).optional(),
  timezone: timezoneSchema.nullish(),
  sortOrder: z.number().int().optional(),
});

export const staffServiceLinkSchema = z.object({
  staffId: uuidSchema,
  serviceId: uuidSchema,
  /** NULL = o valor do serviço. A sénior pode demorar menos e levar mais. */
  durationMinutesOverride: durationSchema.nullish(),
  priceOverride: moneySchema.nullish(),
  isActive: z.boolean().default(true),
});

export const createCategorySchema = z.object({
  tenantId: uuidSchema,
  name: z.string().min(1).max(80),
  description: z.string().max(500).nullish(),
  sortOrder: z.number().int().default(0),
});

export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;
export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;
export type StaffServiceLink = z.infer<typeof staffServiceLinkSchema>;

/**
 * Duração e preço efetivos de um serviço quando executado por um profissional.
 *
 * Existe como função pura porque é usada em três sítios que não podem divergir:
 * a página pública (mostrar), o motor de disponibilidade (calcular o slot) e o
 * motor de marcações (gravar o que foi vendido). Se cada um resolvesse a
 * sobreposição à sua maneira, o cliente veria um preço e pagaria outro.
 */
export interface EffectiveService {
  durationMinutes: number;
  price: number | null;
}

export function resolveEffectiveService(
  service: { durationMinutes: number; price: number | null; promoPrice?: number | null },
  override?: { durationMinutesOverride?: number | null; priceOverride?: number | null } | null,
): EffectiveService {
  const price =
    override?.priceOverride ??
    // A promoção do serviço só vale quando o profissional não define preço
    // próprio: um preço específico é uma decisão mais recente e mais concreta.
    service.promoPrice ??
    service.price ??
    null;

  return {
    durationMinutes: override?.durationMinutesOverride ?? service.durationMinutes,
    price,
  };
}

/** Tempo total que o slot ocupa na agenda: serviço mais buffers. */
export function totalBlockedMinutes(
  durationMinutes: number,
  bufferBeforeMinutes = 0,
  bufferAfterMinutes = 0,
): number {
  return bufferBeforeMinutes + durationMinutes + bufferAfterMinutes;
}
