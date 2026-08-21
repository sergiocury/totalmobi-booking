'use client';

import { useState, useTransition } from 'react';

import {
  Button,
  Card,
  DialogClose,
  DialogContent,
  DialogRoot,
  DialogTrigger,
  Field,
} from '@totalmobi/ui';

import { setTenantStatus } from '../actions';

/**
 * Estado da conta.
 *
 * Suspender pede confirmação e um motivo. Não é burocracia: é a ação que
 * fecha a agenda de um cliente que paga, e o motivo aparece na lista de
 * empresas para quem vier a seguir não ter de perguntar porquê.
 *
 * Reativar não pede confirmação — é a ação que repõe o serviço, e pôr um
 * obstáculo a devolver o acesso a alguém é hostil ao contrário.
 */
export function StatusControls({
  tenantId,
  current,
  hasCustomDomain,
}: {
  tenantId: string;
  current: string;
  hasCustomDomain: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [aberto, setAberto] = useState(false);

  const suspensa = current === 'suspended' || current === 'cancelled';

  function mudar(estado: string, razao?: string) {
    setErro(null);
    startTransition(async () => {
      const resultado = await setTenantStatus(tenantId, estado, razao);
      if (resultado.error) setErro(resultado.error);
      else setAberto(false);
    });
  }

  return (
    <Card className="p-6">
      {erro ? (
        <p
          role="alert"
          className="mb-4 rounded-(--radius-md) border border-(--danger) bg-(--danger-soft) px-4 py-3 text-(length:--text-sm)"
        >
          {erro}
        </p>
      ) : null}

      {suspensa ? (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-(length:--text-sm) text-(--ink-muted)">
            A conta está fechada. Reativar devolve o painel e a página pública de imediato.
          </p>
          <Button loading={pending} onClick={() => mudar('active')}>
            Reativar
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-(length:--text-sm) text-(--ink-muted)">
            {hasCustomDomain
              ? 'Esta empresa tem domínio próprio ativo — é preciso removê-lo antes de suspender.'
              : 'Suspender fecha o painel e a página pública. Nada é apagado.'}
          </p>

          <DialogRoot open={aberto} onOpenChange={setAberto}>
            <DialogTrigger asChild>
              <Button variant="danger">Suspender</Button>
            </DialogTrigger>
            <DialogContent
              title="Suspender esta empresa?"
              description="O painel e a página pública de marcação deixam de funcionar imediatamente. As marcações já feitas ficam guardadas."
              footer={
                <>
                  <DialogClose asChild>
                    <Button variant="secondary">Cancelar</Button>
                  </DialogClose>
                  <Button
                    variant="danger"
                    loading={pending}
                    onClick={() => mudar('suspended', motivo.trim() || undefined)}
                  >
                    Suspender
                  </Button>
                </>
              }
            >
              <Field
                label="Motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Falta de pagamento desde março"
                hint="Aparece na lista de empresas. Quem vier a seguir não vai ter de perguntar."
              />
            </DialogContent>
          </DialogRoot>
        </div>
      )}
    </Card>
  );
}
