import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,

  /**
   * Os pacotes do monorepo são publicados como TypeScript, sem passo de build.
   * O Next compila-os junto com a app — é o que mantém o ciclo de edição rápido
   * e evita ter de reconstruir `packages/*` a cada alteração.
   *
   * **A lista tem de conter todos os que a app importa.** Ficou três pacotes
   * atrás durante os M7, M13 e M14 — o `availability`, o `whatsapp` e o
   * `conversation` foram criados e nunca acrescentados aqui. Não partiu nada
   * localmente, o que é precisamente o que torna este esquecimento perigoso.
   */
  transpilePackages: [
    '@totalmobi/availability',
    '@totalmobi/conversation',
    '@totalmobi/database',
    '@totalmobi/notifications',
    '@totalmobi/shared',
    '@totalmobi/ui',
    '@totalmobi/whatsapp',
  ],

  typedRoutes: true,

  // Nota: o lint corre na raiz do monorepo (`npm run lint`), uma vez, com a
  // mesma configuração para tudo — não pelo `next build`.

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },
        ],
      },
    ];
  },
};

export default config;
