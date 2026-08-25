'use client';

import { useActionState, useEffect, useState } from 'react';

import { slugify } from '@totalmobi/shared';
import { Button, Field } from '@totalmobi/ui';

import { iniciarSubscricao, type EstadoDoRegisto } from './actions';

const inicial: EstadoDoRegisto = {};

/**
 * O formulário.
 *
 * O endereço aparece enquanto se escreve o nome da empresa, com o mesmo
 * `slugify` que o servidor usa para o criar. Mostrar uma coisa e gravar outra
 * seria a forma mais fácil de perder a confiança de quem está prestes a pagar.
 *
 * A navegação para o Stripe acontece no cliente, com `window.location`. Um
 * `redirect()` do servidor dentro de uma ação também funciona, mas rouba ao
 * browser a hipótese de o utilizador voltar atrás com o botão — e voltar atrás
 * de um checkout é uma coisa que as pessoas fazem.
 */
export function FormularioDeRegisto({ plano, periodo }: { plano: string; periodo: string }) {
  const [estado, acao, aEnviar] = useActionState(iniciarSubscricao, inicial);
  const [empresa, setEmpresa] = useState('');

  useEffect(() => {
    if (estado.url) window.location.href = estado.url;
  }, [estado.url]);

  const endereco = empresa.trim() ? slugify(empresa) : '';

  return (
    <form action={acao} className="mt-8 space-y-4">
      <input type="hidden" name="plano" value={plano} />
      <input type="hidden" name="periodo" value={periodo} />

      <Field label="O seu nome" name="nome" autoComplete="name" required placeholder="Ana Martins" />

      <div>
        <Field
          label="Nome da empresa"
          name="empresa"
          autoComplete="organization"
          required
          placeholder="Clínica Sorriso"
          value={empresa}
          onChange={(e) => setEmpresa(e.target.value)}
        />
        {/* `aria-live` para quem não vê: o endereço muda enquanto se escreve, e
            é a informação mais importante desta página. */}
        <p
          aria-live="polite"
          className="mt-1.5 min-h-5 truncate text-(length:--text-sm) text-(--ink-subtle)"
        >
          {endereco ? (
            <>
              O seu endereço:{' '}
              <span className="text-(--brand)">booking.totalmobi.pt/{endereco}</span>
            </>
          ) : (
            ' '
          )}
        </p>
      </div>

      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        placeholder="ana@clinicasorriso.pt"
        hint="É por aqui que entra e que recebe a fatura."
      />

      <Field
        label="Palavra-passe"
        name="palavraPasse"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        hint="Pelo menos 8 caracteres."
      />

      {estado.erro ? (
        <p
          role="alert"
          className="rounded-(--radius-md) border border-(--danger) bg-(--danger-soft) px-4 py-3 text-(length:--text-sm)"
        >
          {estado.erro}
        </p>
      ) : null}

      <Button type="submit" size="lg" loading={aEnviar} className="w-full">
        Continuar para o pagamento
      </Button>
    </form>
  );
}
