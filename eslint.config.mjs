import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/coverage/**',
      '**/*.d.ts',
      'supabase/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },

  /**
   * Regra de dependência da arquitetura, imposta pelo linter.
   *
   * `shared` é lógica pura: tipos, schemas, tempo, erros. Se um dia importar o
   * Supabase, o React ou o Next, deixa de poder ser testado em milissegundos e
   * a fronteira que separa o domínio da infraestrutura desaparece. Um comentário
   * a pedir cuidado não sobrevive a seis meses; esta regra sobrevive.
   */
  {
    files: ['packages/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@supabase/*', 'next', 'next/*', 'react', 'react-dom'],
              message:
                'packages/shared é lógica pura: não pode conhecer Supabase, Next nem React. Ver ARCHITECTURE.md, secção 5.',
            },
          ],
        },
      ],
    },
  },

  /**
   * O mesmo para o futuro motor de disponibilidade (Milestone 7): tem de
   * continuar a ser uma função pura, testável com fixtures.
   */
  {
    files: ['packages/availability/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@supabase/*', '@totalmobi/database', 'next', 'next/*'],
              message:
                'O motor de disponibilidade recebe um dataset já carregado. Não faz I/O. Ver ARCHITECTURE.md, secção 6.2.',
            },
          ],
        },
      ],
    },
  },

  /**
   * Nenhum componente de produto importa o FullCalendar diretamente.
   * Falam com o `CalendarAdapter` — é o que permite trocar de biblioteca (ou
   * não pagar a licença Premium) sem reescrever o painel. Ver ADR-6.
   */
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    ignores: ['apps/web/src/components/calendar/adapter/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@fullcalendar/*'],
              message:
                'Usar o CalendarAdapter em vez de importar o FullCalendar diretamente. Ver ARCHITECTURE.md, secção 7.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['**/*.test.ts', '**/tests/**/*.ts', 'scripts/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
