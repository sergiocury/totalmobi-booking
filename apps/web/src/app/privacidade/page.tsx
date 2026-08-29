import type { Metadata } from 'next';
import Link from 'next/link';

import { LogoBooking } from '@/components/logo-booking';

export const metadata: Metadata = {
  title: 'Política de privacidade',
  description:
    'Que dados o Totalmobi Booking trata, com que fundamento, com quem os partilha e durante quanto tempo.',
};

/**
 * A política de privacidade.
 *
 * ESCRITA CONTRA O CÓDIGO, NÃO CONTRA UM MODELO
 *
 * Uma política genérica copiada da internet é pior do que nenhuma: passa a ser
 * uma declaração falsa perante a autoridade de controlo, e é a primeira coisa
 * que se compara com o sistema numa queixa. Cada afirmação aqui corresponde a
 * qualquer coisa que existe — as tabelas `customers` e `customer_consents`, o
 * `anonymize_customer()`, o `data_retention_months`, a lista de subcontratantes
 * do `SECURITY.md`.
 *
 * Se o comportamento mudar, isto muda no mesmo commit. Em particular:
 *
 * · **No dia em que o LLM for ligado** — hoje não há `ANTHROPIC_API_KEY` na
 *   aplicação web e a interpretação é toda feita no nosso servidor — a secção
 *   "Inteligência artificial" deixa de ser verdadeira e tem de passar a
 *   declarar a Anthropic como subcontratante.
 * · **Se o projeto Supabase mudar de região**, muda a secção das transferências.
 *
 * OS DOIS PAPÉIS SÃO O CENTRO DO DOCUMENTO
 *
 * A Totalmobi é responsável pelo tratamento dos dados de quem subscreve o
 * serviço, e **subcontratante** dos dados dos clientes finais — esses são da
 * empresa que os atende. Confundir os dois é o erro que faz uma política
 * prometer ao paciente direitos que quem tem de os cumprir é a clínica.
 */

/**
 * A identificação legal.
 *
 * ⚠️ O NIF e a morada têm de ser os reais antes de este endereço ser entregue
 * à Meta ou a um cliente: a identificação do responsável pelo tratamento é
 * exigida pelo art. 13.º do RGPD, e uma política sem ela está incompleta.
 *
 * Ficam `null` em vez de um valor inventado — um NIF errado num documento legal
 * é pior do que um campo em falta, e assim a página omite a linha em vez de
 * publicar uma falsidade.
 */
const EMPRESA = {
  nome: 'Totalmobi',
  nif: null as string | null,
  morada: null as string | null,
  email: 'privacidade@totalmobi.pt',
} as const;

const ATUALIZADA_EM = '29 de agosto de 2026';

export default function PrivacidadePage() {
  return (
    <div className="min-h-dvh bg-(--surface)">
      <header className="border-b border-(--line)">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <Link href="/" aria-label="Totalmobi Booking — início">
            <LogoBooking />
          </Link>
          <Link
            href="/"
            className="text-(length:--text-sm) text-(--ink-muted) underline underline-offset-4 hover:text-(--ink)"
          >
            Voltar ao início
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
        <h1 className="text-(length:--text-3xl) leading-(--leading-tight) font-semibold tracking-(--tracking-tight) text-balance">
          Política de privacidade
        </h1>

        <p className="mt-3 text-(length:--text-sm) text-(--ink-subtle)">
          Atualizada a {ATUALIZADA_EM}
        </p>

        <p className="mt-6 text-pretty text-(--ink-muted)">
          O Totalmobi Booking é um serviço de marcações usado por clínicas, salões e outras empresas
          para agendarem com os seus clientes. Esta política explica que dados pessoais tratamos,
          porquê, com quem os partilhamos e durante quanto tempo os guardamos. Está escrita para ser
          lida — sem cláusulas que só se percebem com um advogado ao lado.
        </p>

        {/* ── A distinção que decide quem responde por quê ───────────────── */}
        <Seccao titulo="Dois papéis diferentes, consoante quem é você">
          <p>Esta distinção decide quem responde por quê, por isso vem antes de tudo o resto.</p>

          <Tabela
            colunas={['Se você é…', 'O nosso papel', 'Quem decide sobre os seus dados']}
            linhas={[
              [
                'uma empresa que subscreve o serviço',
                'responsável pelo tratamento',
                `a ${EMPRESA.nome}`,
              ],
              [
                'um cliente que marcou numa dessas empresas',
                'subcontratante — tratamos por conta dela',
                'a empresa onde marcou',
              ],
            ]}
          />

          <p>
            Se marcou uma consulta através de um link do Totalmobi Booking, os seus dados são da
            empresa que o atende. Nós apenas operamos o sistema, seguindo as instruções dela. Para
            apagar ou corrigir os seus dados, o caminho mais rápido é falar diretamente com essa
            empresa — mas se preferir escrever-nos, encaminhamos.
          </p>
        </Seccao>

        <Seccao titulo="Que dados tratamos">
          <p>
            Recolhemos o mínimo para conseguir marcar e avisar. Não há campos de preenchimento livre
            sobre si que você não veja.
          </p>

          <Tabela
            colunas={['Dados', 'De onde vêm', 'Para quê']}
            linhas={[
              ['Nome', 'do formulário de marcação ou da conversa', 'identificar a marcação'],
              [
                'Telemóvel',
                'do formulário, da conversa, ou do número que nos escreve no WhatsApp',
                'confirmar, lembrar e permitir remarcar',
              ],
              ['Email (opcional)', 'do formulário', 'enviar a confirmação e o lembrete'],
              [
                'Mensagens trocadas com o assistente',
                'o que escreve no WhatsApp ou na página de marcação',
                'perceber o pedido e deixar registo do que foi combinado',
              ],
              [
                'Registo de consentimentos',
                'as caixas que assinala, com data, origem e endereço IP',
                'provar quando e como consentiu, como a lei exige',
              ],
              [
                'Marcações',
                'o que fica agendado',
                'a agenda da empresa e as obrigações fiscais dela',
              ],
              [
                'Dados de conta e faturação (só empresas)',
                'do registo e do pagamento',
                'dar acesso ao painel e cobrar a subscrição',
              ],
            ]}
          />

          <Destaque titulo="Não guardamos informação clínica">
            Os campos de notas do sistema servem para o agendamento — &ldquo;prefere de
            manhã&rdquo;, &ldquo;chega sempre atrasado&rdquo;. O painel avisa expressamente que não
            são para diagnósticos, tratamentos ou qualquer informação de saúde. Guardar isso mudaria
            a natureza do serviço, e é uma coisa que o produto deliberadamente não faz.
          </Destaque>
        </Seccao>

        <Seccao titulo="Com que fundamento">
          <Tabela
            colunas={['Tratamento', 'Fundamento legal']}
            linhas={[
              [
                'Criar e gerir a sua marcação',
                'execução do contrato entre si e a empresa (art. 6.º/1/b)',
              ],
              [
                'Enviar a confirmação e o lembrete',
                'consentimento, dado no momento da marcação (art. 6.º/1/a)',
              ],
              [
                'Mensagens promocionais',
                'consentimento separado — e nunca por omissão (art. 6.º/1/a)',
              ],
              [
                'Guardar o histórico de marcações',
                'obrigação legal da empresa, sobretudo fiscal (art. 6.º/1/c)',
              ],
              [
                'Segurança, registos de acesso e prevenção de abuso',
                'interesse legítimo em manter o serviço seguro (art. 6.º/1/f)',
              ],
            ]}
          />

          <p>
            Onde o fundamento é o consentimento, pode retirá-lo a qualquer momento — e retirá-lo é
            tão fácil como tê-lo dado. Deixar de receber lembretes não cancela a sua marcação.
          </p>
        </Seccao>

        {/* ── A secção que a Meta procura ao rever a app ─────────────────── */}
        <Seccao titulo="WhatsApp">
          <p>
            Algumas empresas usam o WhatsApp para receber marcações. Se nos escrever por essa via:
          </p>

          <ul className="list-disc space-y-2 pl-5">
            <li>
              o seu número e o conteúdo das mensagens são tratados para responder ao pedido e
              registar o que foi combinado;
            </li>
            <li>
              a mensagem passa pela infraestrutura da Meta, que é quem opera o WhatsApp, nos termos
              da política de privacidade dela;
            </li>
            <li>
              as mensagens ficam visíveis para a empresa com quem está a falar, na caixa de entrada
              do painel dela;
            </li>
            <li>
              não usamos o seu número para lhe enviar publicidade sem consentimento, nem o
              partilhamos com outras empresas do sistema. Cada empresa vê apenas as suas próprias
              conversas.
            </li>
          </ul>
        </Seccao>

        <Seccao titulo="Inteligência artificial">
          <p>
            O assistente que interpreta &ldquo;quero marcar na terça de tarde&rdquo; corre nos
            nossos próprios servidores.{' '}
            <strong className="font-medium text-(--ink)">
              O conteúdo das suas mensagens não é enviado a fornecedores externos de inteligência
              artificial
            </strong>
            , nem usado para treinar modelos — nossos ou de terceiros.
          </p>
          <p>
            Se isto mudar, esta secção muda antes, e a data de atualização no topo passa a
            refleti-lo.
          </p>
        </Seccao>

        <Seccao titulo="Com quem partilhamos">
          <p>
            Só com quem é preciso para o serviço funcionar. Todos estão vinculados por contrato a
            tratar os dados apenas segundo as nossas instruções.
          </p>

          <Tabela
            colunas={['Quem', 'Para quê', 'Onde']}
            linhas={[
              ['Supabase', 'base de dados e autenticação', 'Estados Unidos'],
              ['Vercel', 'alojamento da aplicação', 'União Europeia'],
              ['Meta Platforms', 'entrega das mensagens de WhatsApp', 'Estados Unidos'],
              ['Brevo', 'envio dos emails de confirmação e lembrete', 'União Europeia'],
              ['Stripe', 'pagamento das subscrições (só empresas)', 'Estados Unidos'],
            ]}
          />

          <p>
            <strong className="font-medium text-(--ink)">Não vendemos dados pessoais</strong>, não
            os cedemos a corretores de dados e não os usamos para publicidade dirigida.
          </p>
        </Seccao>

        <Seccao titulo="Transferências para fora da União Europeia">
          <p>
            Parte da infraestrutura está nos Estados Unidos — em particular a base de dados, alojada
            pela Supabase. Isso significa que os dados são transferidos para fora do Espaço
            Económico Europeu.
          </p>
          <p>
            Estas transferências assentam nas cláusulas contratuais-tipo aprovadas pela Comissão
            Europeia, complementadas por cifragem em trânsito e em repouso. Dizemo-lo aqui de forma
            direta porque é o tipo de facto que costuma ficar escondido numa nota de rodapé.
          </p>
        </Seccao>

        <Seccao titulo="Durante quanto tempo guardamos">
          <Tabela
            colunas={['O quê', 'Quanto tempo']}
            linhas={[
              ['Marcações', '5 anos, por causa do prazo fiscal'],
              ['Mensagens de conversas', '24 meses'],
              ['Registos técnicos de integrações', '90 dias'],
              ['Registos de auditoria de acessos', '3 anos'],
            ]}
          />

          <p>
            Cada empresa pode encurtar estes prazos para os seus próprios dados, dentro dos mínimos
            que a lei impõe. Findo o prazo, os dados pessoais são anonimizados: o nome e os
            contactos desaparecem e fica apenas o registo contabilístico, que já não identifica
            ninguém.
          </p>
        </Seccao>

        <Seccao titulo="Os seus direitos">
          <p>Sobre os seus dados pessoais, tem direito a:</p>

          <Tabela
            colunas={['Direito', 'O que significa na prática']}
            linhas={[
              ['Aceder', 'receber cópia do que temos sobre si, em ficheiro legível'],
              ['Retificar', 'corrigir o que estiver errado'],
              [
                'Apagar',
                'remover os seus dados pessoais — as marcações passadas ficam sem o identificar, porque a empresa tem de as conservar por razões fiscais',
              ],
              ['Portabilidade', 'levar os seus dados noutro formato'],
              ['Opor-se', 'dizer que não quer determinado tratamento'],
              ['Retirar o consentimento', 'a qualquer momento, sem ter de justificar'],
            ]}
          />

          <p>
            Para exercer qualquer um destes direitos, escreva à empresa onde marcou, ou a nós para{' '}
            <a
              href={`mailto:${EMPRESA.email}`}
              className="underline underline-offset-4 hover:text-(--ink)"
            >
              {EMPRESA.email}
            </a>
            . Respondemos no prazo de um mês. Se achar que não tratámos bem o assunto, pode reclamar
            junto da{' '}
            <a
              href="https://www.cnpd.pt"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-4 hover:text-(--ink)"
            >
              Comissão Nacional de Proteção de Dados
            </a>
            .
          </p>
        </Seccao>

        <Seccao titulo="Como protegemos os dados">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Os dados de cada empresa estão isolados na própria base de dados, e não por cuidado de
              quem programa: o isolamento é imposto pelo motor, linha a linha.
            </li>
            <li>Tudo circula cifrado, e as credenciais de integrações ficam cifradas.</li>
            <li>Os acessos ao painel exigem autenticação, e quem faz o quê fica registado.</li>
            <li>
              Os links de gestão de marcação enviados por email e WhatsApp são pessoais e expiram —
              quem não tem o link não chega à marcação.
            </li>
          </ul>
        </Seccao>

        <Seccao titulo="Menores">
          <p>
            O serviço não se dirige a menores de 16 anos. Quando uma marcação é para um menor, quem
            a faz é o representante legal, e é ele quem consente.
          </p>
        </Seccao>

        <Seccao titulo="Alterações a esta política">
          <p>
            Se mudarmos alguma coisa relevante, mudamos a data no topo e avisamos as empresas que
            usam o serviço. Alterações que afetem o fundamento de um tratamento baseado no
            consentimento implicam pedir consentimento de novo — não passam num aviso discreto.
          </p>
        </Seccao>

        <Seccao titulo="Contactos">
          <p>
            <strong className="font-medium text-(--ink)">{EMPRESA.nome}</strong>
            {EMPRESA.nif ? <> · NIF {EMPRESA.nif}</> : null}
            {EMPRESA.morada ? (
              <>
                <br />
                {EMPRESA.morada}
              </>
            ) : null}
            <br />
            <a
              href={`mailto:${EMPRESA.email}`}
              className="underline underline-offset-4 hover:text-(--ink)"
            >
              {EMPRESA.email}
            </a>
          </p>
        </Seccao>
      </main>

      <footer className="border-t border-(--line)">
        <div className="mx-auto max-w-3xl px-6 py-8 text-(length:--text-sm) text-(--ink-muted)">
          <Link href="/" className="hover:text-(--ink)">
            Totalmobi Booking
          </Link>
        </div>
      </footer>
    </div>
  );
}

function Seccao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="text-(length:--text-xl) leading-(--leading-snug) font-semibold tracking-(--tracking-tight)">
        {titulo}
      </h2>
      <div className="mt-4 space-y-4 text-pretty text-(--ink-muted)">{children}</div>
    </section>
  );
}

/**
 * Tabelas que cabem num telemóvel.
 *
 * Quase toda a gente que abre uma política de privacidade chega a ela do
 * telemóvel, muitas vezes a partir do próprio WhatsApp. Uma tabela de três
 * colunas que obriga a página inteira a deslizar para o lado é o suficiente
 * para deixar de se ler — por isso o deslizamento fica dentro da tabela.
 */
function Tabela({ colunas, linhas }: { colunas: string[]; linhas: React.ReactNode[][] }) {
  return (
    <div className="-mx-6 overflow-x-auto px-6 sm:mx-0 sm:px-0">
      <table className="w-full min-w-md border-collapse text-(length:--text-sm)">
        <thead>
          <tr className="border-b border-(--line) text-left">
            {colunas.map((c) => (
              <th key={c} className="py-2 pr-4 font-medium text-(--ink)">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha, i) => (
            <tr key={i} className="border-b border-(--line)">
              {linha.map((celula, j) => (
                <td key={j} className="py-3 pr-4 align-top">
                  {celula}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Destaque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-(--radius-lg) border border-(--line) bg-(--surface-raised) px-5 py-4">
      <p className="font-medium text-(--ink)">{titulo}</p>
      <p className="mt-2 text-pretty">{children}</p>
    </div>
  );
}
