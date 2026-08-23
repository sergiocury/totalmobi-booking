import { CalendarioDemo } from './calendario-demo';
import { ContrastDemo } from './contrast-demo';
import { ReviewBar } from './review-bar';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  PageHeader,
  Skeleton,
} from '@totalmobi/ui';

export const metadata = { title: 'Design system' };

/**
 * Página de revisão do design system.
 *
 * Existe em vez de um Storybook. O Storybook traria mais um build, mais
 * configuração e mais uma coisa para manter em sincronia; esta página vive
 * dentro da app, usa exatamente os mesmos tokens e componentes que a produção,
 * e abre-se num URL. Se um dia forem precisos controlos interativos por
 * propriedade, reavalia-se.
 *
 * A secção de contraste não é decorativa: é a prova visível de que a validação
 * do `FR-WL-2` faz o que diz.
 */

export default function DesignSystemPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
      <PageHeader
        eyebrow="Milestone 3"
        title="Design system"
        description="Os tokens e componentes que sustentam todos os ecrãs do produto. Alterar aqui altera em todo o lado."
      />

      <ReviewBar>

      <section className="mb-16">
        <h2 className="mb-5 text-(length:--text-xl) font-semibold tracking-(--tracking-tight)">
          Tipografia
        </h2>
        <Card className="space-y-4 p-7">
          <p className="text-(length:--text-4xl) leading-(--leading-tight) font-semibold tracking-(--tracking-tighter)">
            Marque em menos de um minuto
          </p>
          <p className="text-(length:--text-2xl) leading-(--leading-snug) font-semibold tracking-(--tracking-tight)">
            Título de secção
          </p>
          <p className="text-(length:--text-lg)">Subtítulo com um pouco mais de peso.</p>
          <p className="max-w-prose text-pretty text-(--ink-muted)">
            Texto corrido. Poucos degraus de tamanho, mas bem separados — uma escala com doze
            tamanhos parecidos produz ecrãs onde nada chama a atenção.
          </p>
          <p className="text-(length:--text-sm) text-(--ink-subtle)">
            Texto de apoio, para notas e legendas.
          </p>
        </Card>
      </section>

      <section className="mb-16">
        <h2 className="mb-5 text-(length:--text-xl) font-semibold tracking-(--tracking-tight)">
          Botões
        </h2>
        <Card className="space-y-6 p-7">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Confirmar marcação</Button>
            <Button variant="secondary">Cancelar</Button>
            <Button variant="ghost">Saber mais</Button>
            <Button variant="danger">Eliminar</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Pequeno</Button>
            <Button size="md">Médio</Button>
            <Button size="lg">Grande</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button loading>A guardar</Button>
            <Button disabled>Indisponível</Button>
          </div>
        </Card>
      </section>

      <section className="mb-16">
        <h2 className="mb-5 text-(length:--text-xl) font-semibold tracking-(--tracking-tight)">
          Campos
        </h2>
        <Card className="space-y-5 p-7">
          <Field label="Nome" placeholder="Maria Silva" required />
          <Field
            label="Telemóvel"
            placeholder="+351 912 345 678"
            hint="Usamos o número para lhe enviar o lembrete."
          />
          <Field label="Email" defaultValue="nao-e-um-email" error="Introduza um email válido." />
        </Card>
      </section>

      <section className="mb-16">
        <h2 className="mb-5 text-(length:--text-xl) font-semibold tracking-(--tracking-tight)">
          Estados
        </h2>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge>Pendente</Badge>
            <Badge tone="brand">Confirmada</Badge>
            <Badge tone="success">Concluída</Badge>
            <Badge tone="warning">Em atraso</Badge>
            <Badge tone="danger">Faltou</Badge>
          </div>

          <EmptyState
            title="Ainda não há marcações hoje"
            description="Quando alguém marcar, aparece aqui. Pode também criar uma marcação manualmente."
            action={<Button>Nova marcação</Button>}
          />

          <ErrorState action={<Button variant="secondary">Tentar novamente</Button>} />

          <Card className="space-y-3 p-6" aria-busy="true">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </Card>
        </div>
      </section>

      <section className="mb-16">
        <h2 className="mb-2 text-(length:--text-xl) font-semibold tracking-(--tracking-tight)">
          Validação de contraste
        </h2>
        <ContrastDemo />
      </section>

      <section className="mb-16">
        <h2 className="mb-2 text-(length:--text-xl) font-semibold tracking-(--tracking-tight)">
          Calendário
        </h2>
        <p className="mb-5 text-pretty text-(--ink-muted)">
          As grelhas do dia e da semana, com dados falsos. Estão aqui porque de
          outro modo só se veriam com sessão iniciada no painel de um cliente —
          e uma vista que só se revê com dados reais é uma vista que ninguém
          revê.
        </p>
        <CalendarioDemo />
      </section>

      <section>
        <h2 className="mb-5 text-(length:--text-xl) font-semibold tracking-(--tracking-tight)">
          Superfícies
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ['Funda', 'bg-(--surface-sunken)'],
            ['Base', 'bg-(--surface)'],
            ['Elevada', 'bg-(--surface-raised)'],
          ].map(([label, bg]) => (
            <div
              key={label}
              className={`rounded-(--radius-lg) border border-(--line) p-6 ${bg}`}
            >
              <p className="font-medium">{label}</p>
              <p className="mt-1 text-(length:--text-sm) text-(--ink-muted)">
                A elevação lê-se pelo degrau de fundo, não por sombra.
              </p>
            </div>
          ))}
        </div>
      </section>
      </ReviewBar>
    </main>
  );
}
