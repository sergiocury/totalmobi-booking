'use client';

import { useActionState, useState } from 'react';

import { Button, Card, Field } from '@totalmobi/ui';

import { sendMagicLink, signInWithPassword, type LoginState } from './actions';

const initial: LoginState = {};

export function LoginForm({ next }: { next?: string | undefined }) {
  const [mode, setMode] = useState<'password' | 'magic'>('password');
  const [passwordState, passwordAction, passwordPending] = useActionState(
    signInWithPassword,
    initial,
  );
  const [magicState, magicAction, magicPending] = useActionState(sendMagicLink, initial);

  const state = mode === 'password' ? passwordState : magicState;
  const pending = mode === 'password' ? passwordPending : magicPending;

  if (mode === 'magic' && magicState.sent) {
    return (
      <Card className="p-7">
        <h2 className="text-(length:--text-lg) font-medium">Verifique o seu email</h2>
        <p className="mt-2 text-pretty text-(--ink-muted)">
          Se existir uma conta com esse endereço, enviámos um link de entrada. É válido por uma
          hora.
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-5 -ml-3.5"
          onClick={() => setMode('password')}
        >
          Entrar com palavra-passe
        </Button>
      </Card>
    );
  }

  return (
    <div>
      <form action={mode === 'password' ? passwordAction : magicAction} className="space-y-5">
        {next ? <input type="hidden" name="proximo" value={next} /> : null}

        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="voce@empresa.pt"
          required
        />

        {mode === 'password' ? (
          <Field
            label="Palavra-passe"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            {...(state.error ? { error: state.error } : {})}
          />
        ) : null}

        {state.error && mode === 'magic' ? (
          <p role="alert" className="text-(length:--text-sm) text-(--danger)">
            {state.error}
          </p>
        ) : null}

        <Button type="submit" size="lg" loading={pending} className="w-full">
          {pending
            ? 'Um momento…'
            : mode === 'password'
              ? 'Entrar'
              : 'Enviar link de entrada'}
        </Button>
      </form>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mt-4 -ml-3.5"
        onClick={() => setMode(mode === 'password' ? 'magic' : 'password')}
      >
        {mode === 'password' ? 'Entrar com link por email' : 'Entrar com palavra-passe'}
      </Button>

      {/*
        Esqueci-me da palavra-passe.

        Não havia entrada nenhuma para isto na aplicação: quem se esquecia tinha
        de a pedir pelo painel do Supabase, o que só um administrador sabe fazer.

        Manda o mesmo link de entrada por email — e depois de entrar, a página
        de definir palavra-passe está a um clique. É o caminho com menos peças
        do que um fluxo de recuperação à parte, e não há uma segunda
        implementação para manter.
      */}
      {mode === 'password' ? (
        <p className="mt-3 text-(length:--text-sm) text-(--ink-subtle)">
          Esqueceu-se da palavra-passe?{' '}
          <button
            type="button"
            onClick={() => setMode('magic')}
            className="cursor-pointer text-(--brand) underline underline-offset-4"
          >
            Entre com um link por email
          </button>{' '}
          e defina uma nova.
        </p>
      ) : null}
    </div>
  );
}
