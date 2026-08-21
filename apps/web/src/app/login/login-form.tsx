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
    </div>
  );
}
