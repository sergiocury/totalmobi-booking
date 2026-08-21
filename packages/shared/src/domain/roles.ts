/**
 * Papéis e permissões.
 *
 * `super_admin` **não** está aqui de propósito: não é um papel dentro de um
 * tenant, é um estatuto de plataforma que vive em `booking.platform_admins`.
 * Modelá-lo como um `member_role` obrigaria a criar uma linha por cada tenant
 * novo, e um esquecimento tornar-se-ia num buraco de acesso silencioso.
 */

export const MEMBER_ROLES = ['tenant_admin', 'manager', 'staff'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/** Maior número, mais poder. Só para comparações de "pelo menos este papel". */
const ROLE_RANK: Record<MemberRole, number> = {
  staff: 1,
  manager: 2,
  tenant_admin: 3,
};

export function roleAtLeast(role: MemberRole, minimum: MemberRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export const PERMISSIONS = [
  'bookings.read.own',
  'bookings.read.all',
  'bookings.write',
  'bookings.override_rules',
  'customers.read',
  'customers.write',
  'customers.export',
  'catalog.read',
  'catalog.write',
  'schedule.read',
  'schedule.write.own',
  'schedule.write.all',
  'staff.read',
  'staff.write',
  'members.manage',
  'integrations.manage',
  'branding.manage',
  'settings.manage',
  'reports.view',
  'conversations.read',
  'conversations.reply',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const STAFF_PERMISSIONS: readonly Permission[] = [
  'bookings.read.own',
  'bookings.write',
  'customers.read',
  'catalog.read',
  'schedule.read',
  'schedule.write.own',
  'staff.read',
  'conversations.read',
];

const MANAGER_PERMISSIONS: readonly Permission[] = [
  ...STAFF_PERMISSIONS,
  'bookings.read.all',
  'bookings.override_rules',
  'customers.write',
  'customers.export',
  'catalog.write',
  'schedule.write.all',
  'staff.write',
  'reports.view',
  'conversations.reply',
];

const TENANT_ADMIN_PERMISSIONS: readonly Permission[] = [
  ...MANAGER_PERMISSIONS,
  'members.manage',
  'integrations.manage',
  'branding.manage',
  'settings.manage',
];

export const ROLE_PERMISSIONS: Record<MemberRole, readonly Permission[]> = {
  staff: STAFF_PERMISSIONS,
  manager: MANAGER_PERMISSIONS,
  tenant_admin: TENANT_ADMIN_PERMISSIONS,
};

export function hasPermission(role: MemberRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Isto é conveniência de UI, não segurança.
 *
 * A autorização a sério está na RLS do PostgreSQL. Se estas listas
 * desaparecessem, o pior que acontecia era o painel mostrar botões que a base
 * de dados depois recusa. Se fosse ao contrário, era uma falha de segurança.
 */
export function permissionsFor(role: MemberRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}
