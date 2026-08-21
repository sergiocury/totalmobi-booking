import { z } from 'zod';

import {
  countryCodeSchema,
  currencySchema,
  e164Schema,
  emailSchema,
  hexColorSchema,
  localeSchema,
  slugSchema,
  timezoneSchema,
  uuidSchema,
} from './common';

export const tenantStatusSchema = z.enum([
  'trial',
  'active',
  'past_due',
  'suspended',
  'cancelled',
]);

/**
 * Segmento de negócio.
 *
 * É **informativo**: serve para escolher o conjunto de dados de exemplo no
 * onboarding e para métricas. Nunca pode condicionar lógica — este produto não
 * é um sistema de clínicas com uns cabeleireiros por cima.
 */
export const tenantSegmentSchema = z.enum([
  'dental',
  'medical',
  'psychology',
  'physiotherapy',
  'veterinary',
  'hair_salon',
  'barbershop',
  'aesthetics',
  'spa',
  'massage',
  'fitness',
  'automotive',
  'consulting',
  'technical_services',
  'other',
]);

export const createTenantSchema = z.object({
  slug: slugSchema,
  displayName: z.string().min(2).max(120),
  legalName: z.string().min(2).max(200).optional(),
  segment: tenantSegmentSchema.default('other'),
  email: emailSchema,
  phone: e164Schema.optional(),
  whatsappPhone: e164Schema.optional(),
  website: z.url().max(255).optional(),
  taxId: z.string().max(50).optional(),
  countryCode: countryCodeSchema.default('PT'),
  defaultTimezone: timezoneSchema.default('Europe/Lisbon'),
  defaultLocale: localeSchema.default('pt-PT'),
  defaultCurrency: currencySchema.default('EUR'),
  planCode: z.string().min(2).max(30).default('basic'),
});

export const updateTenantSchema = createTenantSchema.partial().extend({
  id: uuidSchema,
  customDomain: z
    .string()
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/, 'Domínio inválido')
    .max(255)
    .nullish(),
});

export const tenantBrandingSchema = z.object({
  logoUrl: z.url().max(500).nullish(),
  faviconUrl: z.url().max(500).nullish(),
  heroImageUrl: z.url().max(500).nullish(),
  primaryColor: hexColorSchema.default('#0B5FFF'),
  secondaryColor: hexColorSchema.default('#101828'),
  backgroundColor: hexColorSchema.default('#FFFFFF'),
  textColor: hexColorSchema.default('#101828'),
  fontFamily: z.enum(['system', 'inter', 'geist', 'dm-sans', 'source-serif']).default('system'),
  borderRadius: z.enum(['none', 'sm', 'md', 'lg', 'full']).default('md'),
  publicHeadline: z.string().max(120).nullish(),
  publicSubheadline: z.string().max(240).nullish(),
});

/**
 * Políticas por omissão do tenant.
 *
 * Cada serviço pode sobrepor-se a estes valores. A resolução é sempre
 * `COALESCE(serviço, tenant, plataforma)` — uma limpeza dentária e uma cirurgia
 * não podem ter a mesma antecedência de cancelamento.
 */
export const tenantPoliciesSchema = z.object({
  cancellationMinHours: z.number().int().min(0).max(720).default(24),
  rescheduleMinHours: z.number().int().min(0).max(720).default(24),
  minAdvanceMinutes: z.number().int().min(0).max(43_200).default(60),
  maxAdvanceDays: z.number().int().min(1).max(730).default(90),
  slotGranularityMinutes: z.number().int().min(5).max(120).default(15),
  requireConfirmation: z.boolean().default(false),
  allowCustomerReschedule: z.boolean().default(true),
  allowCustomerCancel: z.boolean().default(true),
  requireEmail: z.boolean().default(false),
  requireNotes: z.boolean().default(false),
  /** Retenção de dados pessoais, em meses. Ver SECURITY.md, secção 11. */
  dataRetentionMonths: z.number().int().min(12).max(120).default(60),
});

export type TenantStatus = z.infer<typeof tenantStatusSchema>;
export type TenantSegment = z.infer<typeof tenantSegmentSchema>;
export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
export type TenantBranding = z.infer<typeof tenantBrandingSchema>;
export type TenantPolicies = z.infer<typeof tenantPoliciesSchema>;

/**
 * Slugs que não podem ser usados por um tenant porque colidem com rotas da
 * aplicação ou com subdomínios da infraestrutura.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'admin',
  'api',
  'app',
  'auth',
  'booking',
  'console',
  'dashboard',
  'docs',
  'help',
  'login',
  'logout',
  'm',
  'privacy',
  'public',
  'settings',
  'signup',
  'status',
  'support',
  'terms',
  'totalmobi',
  'widget',
  'www',
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}
