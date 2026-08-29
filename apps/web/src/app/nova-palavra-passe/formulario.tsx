'use client';

import { useActionState } from 'react';

import { Button, Field } from '@totalmobi/ui';

import { definirPalavraPasse, type EstadoDaPalavraPasse } from './actions';

export function FormularioDeNovaPalavraPasse() {
  const [estado, acao, aGravar] = useActionState(
    definirPalavraPasse,
    {} as EstadoDaPalavraPasse,
  );

  return (
    <form action={acao} className="mt-8 space-y-4">
      <Field
        label="Palavra-passe nova"
        name="palavraPasse"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        hint="Pelo menos 8 caracteres."
      />

      <Field
        label="Escreva outra vez"
        name="repetida"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
      />

      {estado.erro ? (
        <p
          role="alert"
          className="rounded-(--radius-md) border border-(--danger) bg-(--danger-soft) px-4 py-3 text-(length:--text-sm)"
        >
          {estado.erro}
        </p>
      ) : null}

      <Button type="submit" size="lg" loading={aGravar} className="w-full">
        Guardar e entrar
      </Button>
    </form>
  );
}
