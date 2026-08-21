import type { Database } from './database.types';

/**
 * Aliases das linhas do schema `booking`.
 *
 * Vivem **fora** do ficheiro gerado de propósito: `database.types.ts` é
 * reescrito a cada `npm run db:types`, e tudo o que lá se acrescentasse à mão
 * desaparecia sem aviso. Aqui derivam-se do tipo gerado, por isso acompanham
 * qualquer alteração de schema sozinhos.
 */

type Tables = Database['booking']['Tables'];

export type Row<T extends keyof Tables> = Tables[T]['Row'];
export type Insert<T extends keyof Tables> = Tables[T]['Insert'];
export type Update<T extends keyof Tables> = Tables[T]['Update'];

export type TenantRow = Row<'tenants'>;
export type TenantBrandingRow = Row<'tenant_branding'>;
export type TenantPoliciesRow = Row<'tenant_policies'>;
export type TenantFeatureRow = Row<'tenant_features'>;
export type MembershipRow = Row<'memberships'>;
export type LocationRow = Row<'locations'>;
export type PlatformAdminRow = Row<'platform_admins'>;
export type AuditLogRow = Row<'audit_logs'>;
export type PlanRow = Row<'plans'>;

export type ServiceRow = Row<'services'>;
export type ServiceUpdate = Update<'services'>;
export type ServiceCategoryRow = Row<'service_categories'>;
export type StaffRow = Row<'staff'>;
export type StaffUpdate = Update<'staff'>;
export type StaffServiceRow = Row<'staff_services'>;
export type StaffLocationRow = Row<'staff_locations'>;

/**
 * As colunas de `tenants` que a `anon` tem privilégio de ler.
 *
 * O `GRANT SELECT (…)` da migration 0006 é por coluna: pedir `email` com a
 * chave anónima devolve `42501`, não `null`. Este tipo mantém o código honesto
 * sobre o que existe em cada caminho.
 */
export type PublicTenantRow = Pick<
  TenantRow,
  | 'id'
  | 'slug'
  | 'code'
  | 'display_name'
  | 'segment'
  | 'status'
  | 'plan_code'
  | 'website'
  | 'country_code'
  | 'default_timezone'
  | 'default_locale'
  | 'default_currency'
  | 'custom_domain'
  | 'archived_at'
>;

export type MemberRole = Database['booking']['Enums']['member_role'];
export type TenantStatus = Database['booking']['Enums']['tenant_status'];
export type ActorType = Database['booking']['Enums']['actor_type'];
export type BookingStatus = Database['booking']['Enums']['booking_status'];
