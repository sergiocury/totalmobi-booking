import type { Metadata, Viewport } from 'next';

import { themeScript } from '@totalmobi/ui';

import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Totalmobi Booking',
    template: '%s · Totalmobi Booking',
  },
  description: 'Agendamento online para qualquer negócio de serviços.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0d181c' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `suppressHydrationWarning` só no <html> e só por causa do `data-theme`:
    // o script abaixo escreve o atributo antes do React hidratar, por isso o
    // servidor e o cliente divergem nesse ponto — de propósito.
    <html lang="pt-PT" suppressHydrationWarning>
      <head>
        {/*
          Aplica o tema antes da primeira pintura. Tem de ser inline e vir antes
          do CSS: com um `useEffect` a página apareceria clara e saltaria para
          escura — o flash do tema errado.
        */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
