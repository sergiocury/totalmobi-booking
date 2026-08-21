import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        // Testes puros: sem rede, sem base de dados. Correm sempre, em qualquer
        // máquina, em milissegundos. É onde vive a lógica que mais interessa.
        test: {
          name: 'unit',
          include: ['packages/*/src/**/*.test.ts', 'packages/*/tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        // Testes de RLS e de concorrência. Precisam de `supabase start`.
        // Sem instância local, saltam-se com um aviso — nunca falham em falso,
        // e nunca dão a impressão de terem passado.
        test: {
          name: 'database',
          include: ['packages/database/tests/**/*.test.ts'],
          environment: 'node',
          testTimeout: 30_000,
          hookTimeout: 60_000,
          // Um teste de isolamento a correr ao lado de outro que cria e apaga
          // utilizadores dá falsos positivos. Aqui a ordem importa.
          fileParallelism: false,
        },
      },
    ],
  },
});
