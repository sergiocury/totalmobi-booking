import { exitTenant } from '@/app/console/viewing-actions';

/**
 * Banner permanente enquanto a Totalmobi está dentro da conta de um cliente.
 *
 * Fica no topo, não se pode fechar, e diz de quem é a conta. A razão é simples:
 * é fácil demais esquecer em que conta se está, e a ação seguinte — cancelar
 * uma marcação, suspender um profissional — passa a ser feita na empresa
 * errada. Um banner que se possa dispensar deixa de cumprir a função ao fim de
 * dois dias de uso.
 *
 * A cor é de aviso, não de erro: não está nada mal, mas convém não esquecer.
 */
export function ViewingBanner({ tenantName }: { tenantName: string }) {
  return (
    <div className="sticky top-0 z-50 border-b border-(--warning) bg-(--warning-soft)">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-2.5">
        <p className="text-(length:--text-sm)">
          <span aria-hidden="true">⚠ </span>
          Está a ver a conta de <strong>{tenantName}</strong> como administrador da Totalmobi.
          Tudo o que fizer fica registado em seu nome.
        </p>
        <form action={exitTenant}>
          <button
            type="submit"
            className="rounded-(--radius-full) border border-(--warning) px-3 py-1 text-(length:--text-sm) font-medium whitespace-nowrap transition-colors hover:bg-(--warning) hover:text-white"
          >
            Sair desta conta
          </button>
        </form>
      </div>
    </div>
  );
}
