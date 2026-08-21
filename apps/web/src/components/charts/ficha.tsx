import { cn } from '@totalmobi/ui';

/**
 * Uma ficha de estatística.
 *
 * **Um número não é um gráfico de uma barra.** Cinco contagens do dia mostradas
 * como barras obrigariam a comparar alturas para ler valores que já estão
 * escritos — e o que interessa a quem abre a agenda de manhã é o número, não a
 * proporção.
 *
 * O estado tem cor **e** rótulo. Cor sozinha exclui quem não a distingue, e num
 * ecrã que diz "3 faltas" a diferença entre vermelho e cinzento não pode ser a
 * única coisa a dizer que aquilo é mau.
 */
export function Ficha({
  rotulo,
  valor,
  tom = 'neutro',
  detalhe,
}: {
  rotulo: string;
  valor: number | string;
  tom?: 'neutro' | 'bom' | 'aviso' | 'mau';
  detalhe?: string;
}) {
  const cores = {
    neutro: 'text-(--ink)',
    bom: 'text-(--success)',
    aviso: 'text-(--warning)',
    mau: 'text-(--danger)',
  } as const;

  return (
    <div className="rounded-(--radius-md) border border-(--line) bg-(--surface) px-4 py-3">
      <p className="text-(length:--text-sm) text-(--ink-muted)">{rotulo}</p>
      <p className={cn('mt-1 text-(length:--text-2xl) font-semibold tabular-nums', cores[tom])}>
        {typeof valor === 'number' ? valor.toLocaleString('pt-PT') : valor}
      </p>
      {detalhe ? (
        <p className="mt-0.5 text-(length:--text-sm) text-(--ink-subtle)">{detalhe}</p>
      ) : null}
    </div>
  );
}

/**
 * Uma proporção contra um limite.
 *
 * Um medidor, não um gráfico circular de duas fatias. A pergunta é "quanto do
 * disponível está ocupado", e a resposta lê-se melhor numa barra com um limite
 * do que em dois setores que obrigam a estimar ângulos.
 */
export function Medidor({
  rotulo,
  valor,
  maximo,
  sufixo = '%',
}: {
  rotulo: string;
  valor: number;
  maximo: number;
  sufixo?: string;
}) {
  const percentagem = maximo > 0 ? Math.min((valor / maximo) * 100, 100) : 0;

  return (
    <div className="rounded-(--radius-md) border border-(--line) bg-(--surface) px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-(length:--text-sm) text-(--ink-muted)">{rotulo}</p>
        <p className="text-(length:--text-lg) font-semibold tabular-nums">
          {percentagem.toFixed(0)}
          {sufixo}
        </p>
      </div>

      <div
        role="meter"
        aria-valuenow={Math.round(percentagem)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={rotulo}
        className="mt-2 h-2 overflow-hidden rounded-(--radius-full) bg-(--surface-sunken)"
      >
        <div
          className="h-full rounded-(--radius-full) bg-(--brand)"
          style={{ width: `${percentagem}%` }}
        />
      </div>

      <p className="mt-1.5 text-(length:--text-sm) text-(--ink-subtle)">
        {valor.toLocaleString('pt-PT')} de {maximo.toLocaleString('pt-PT')}
      </p>
    </div>
  );
}
