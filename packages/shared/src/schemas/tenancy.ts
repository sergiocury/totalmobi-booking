import { z } from 'zod';

import { MEMBER_ROLES } from '../domain/roles';
import {
  countryCodeSchema,
  e164Schema,
  emailSchema,
  slugSchema,
  timezoneSchema,
  uuidSchema,
} from './common';

export const memberRoleSchema = z.enum(MEMBER_ROLES);

export const inviteMemberSchema = z.object({
  tenantId: uuidSchema,
  email: emailSchema,
  role: memberRoleSchema,
  /** Vazio significa todas as unidades do tenant. */
  locationIds: z.array(uuidSchema).default([]),
  staffId: uuidSchema.optional(),
});

export const updateMembershipSchema = z.object({
  id: uuidSchema,
  role: memberRoleSchema.optional(),
  locationIds: z.array(uuidSchema).optional(),
  staffId: uuidSchema.nullish(),
});

export const createLocationSchema = z.object({
  tenantId: uuidSchema,
  name: z.string().min(2).max(120),
  slug: slugSchema,
  addressLine1: z.string().max(200).optional(),
  addressLine2: z.string().max(200).optional(),
  postalCode: z.string().max(20).optional(),
  city: z.string().max(100).optional(),
  countryCode: countryCodeSchema.default('PT'),
  /**
   * Obrigatório e sem valor por omissão herdado em silêncio.
   *
   * O fuso pertence à unidade, não ao tenant: uma rede pode ter Lisboa e São
   * Paulo, e um erro aqui marca o cliente com quatro horas de diferença.
   */
  timezone: timezoneSchema,
  phone: e164Schema.optional(),
  whatsappPhone: e164Schema.optional(),
  email: emailSchema.optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  isDefault: z.boolean().default(false),
});

export const updateLocationSchema = createLocationSchema
  .partial()
  .extend({ id: uuidSchema, isActive: z.boolean().optional() });

export type MemberRoleInput = z.infer<typeof memberRoleSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type UpdateMembershipInput = z.infer<typeof updateMembershipSchema>;
export type CreateLocationInput = z.infer<typeof createLocationSchema>;
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;
