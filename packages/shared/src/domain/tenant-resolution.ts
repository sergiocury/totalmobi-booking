/**
 * Resolução do tenant a partir do pedido HTTP.
 *
 * Lógica pura: recebe host e caminho, devolve o que fazer. Sem Next, sem
 * Supabase, sem I/O — o que a torna testável com uma tabela de casos em vez de
 * um servidor a correr.
 *
 * Três formas de chegar a um tenant, por ordem de prioridade:
 *
 *   1. domínio próprio      agenda.clinicadente.pt        → por `custom_domain`
 *   2. slug no caminho      booking.totalmobi.pt/clinica  → por `slug`
 *   3. nenhuma              booking.totalmobi.pt/app      → contexto de plataforma
 */

/** Rotas que nunca pertencem a um tenant, mesmo que o primeiro segmento pareça um slug. */
/**
 * Segmentos que são nossos e nunca podem ser o slug de uma empresa.
 *
 * **Tem de conter todas as rotas de topo da aplicação.** Um segmento a menos
 * aqui não dá erro: passa a ser tratado como slug de empresa, o pedido é
 * reescrito para `/marcar/<segmento>` e a rota verdadeira devolve 404. Foi
 * exatamente o que aconteceu ao ligar o link público — `/marcar` e `/design`
 * deixaram de existir sem ninguém dar por isso até alguém as abrir.
 *
 * A lista está protegida por um teste que a compara com as pastas reais de
 * `apps/web/src/app`. Criar uma rota nova e esquecer esta lista faz o teste
 * falhar em vez de partir a rota em produção.
 *
 * Também protege os slugs: uma empresa não pode chamar-se `login` nem `app`.
 * Isso é reforçado na base de dados pela tabela `reserved_slugs`.
 */
const PLATFORM_SEGMENTS: ReadonlySet<string> = new Set([
  'api',
  'app',
  'auth',
  'console',
  'convite',
  'design',
  'invite',
  'login',
  'logout',
  'm',
  // A rota antiga da página pública. Continua a funcionar: está em emails já
  // enviados e em links que alguém pode ter guardado.
  'marcar',
  'status',
  'widget',
  '_next',
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
]);

/** As mesmas, para quem precise de as verificar de fora. */
export const SEGMENTOS_RESERVADOS: readonly string[] = [...PLATFORM_SEGMENTS];

/** Prefixos que dispensam sessão e não devem sofrer redireção para o login. */
const PUBLIC_PREFIXES: readonly string[] = [
  '/api/webhooks',
  '/api/public',
  '/auth',
  '/login',
  '/m/',
  '/widget',
  '/status',
  '/_next',
];

export type TenantSource = 'custom_domain' | 'path_slug' | 'none';

export interface RequestContext {
  /** Host sem porta, em minúsculas. */
  readonly host: string;
  /** Caminho começado por `/`, sem query string. */
  readonly pathname: string;
  /** Segmento de idioma, quando o URL já o traz. */
  readonly locale?: string;
}

export interface TenantResolution {
  readonly source: TenantSource;
  /** Slug ou domínio a procurar na base de dados. `null` quando é contexto de plataforma. */
  readonly identifier: string | null;
  /** A rota exige sessão iniciada? */
  readonly requiresSession: boolean;
  /** A rota é do painel super admin da Totalmobi? */
  readonly isPlatformConsole: boolean;
}

export interface ResolutionInput extends RequestContext {
  /** Domínios da própria plataforma. Tudo o resto é domínio próprio de cliente. */
  readonly platformHosts: readonly string[];
}

export function normalizeHost(rawHost: string): string {
  return rawHost.split(':')[0]!.trim().toLowerCase();
}

function isPlatformHost(host: string, platformHosts: readonly string[]): boolean {
  return platformHosts.some((h) => {
    const normalized = normalizeHost(h);
    return host === normalized || host.endsWith(`.${normalized}`);
  });
}

/** Primeiro segmento do caminho, já sem o prefixo de idioma. */
export function firstSegment(pathname: string, locale?: string): string | null {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return null;

  const head = parts[0]!;
  if (locale && head === locale) {
    return parts[1] ?? null;
  }
  return head;
}

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

export function resolveTenant(input: ResolutionInput): TenantResolution {
  const host = normalizeHost(input.host);
  const segment = firstSegment(input.pathname, input.locale);
  const platform = isPlatformHost(host, input.platformHosts);

  const isConsole = segment === 'console';
  const isAdminApp = segment === 'app';
  const publicPath = isPublicPath(input.pathname);

  // Domínio que não é nosso: só pode ser o domínio próprio de um cliente.
  if (!platform) {
    return {
      source: 'custom_domain',
      identifier: host,
      // Num domínio próprio, `/app` continua a ser o painel e exige sessão.
      requiresSession: isAdminApp,
      isPlatformConsole: false,
    };
  }

  // Domínio da plataforma, rota reservada: /app, /console, /api, /login…
  if (segment === null || PLATFORM_SEGMENTS.has(segment)) {
    return {
      source: 'none',
      identifier: null,
      requiresSession: (isConsole || isAdminApp) && !publicPath,
      isPlatformConsole: isConsole,
    };
  }

  // Domínio da plataforma, primeiro segmento é o slug do tenant.
  return {
    source: 'path_slug',
    identifier: segment,
    requiresSession: false,
    isPlatformConsole: false,
  };
}
