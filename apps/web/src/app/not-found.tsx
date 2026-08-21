/**
 * O 404 da aplicação inteira.
 *
 * Está na raiz por necessidade, não por escolha: no Next 16 um `not-found.tsx`
 * aninhado **não** é usado quando o `notFound()` vem de um segmento dinâmico —
 * cai sempre neste. Foi verificado, não deduzido: com o ficheiro em
 * `marcar/[tenantSlug]/` e um `layout.tsx` ao lado, continuava a aparecer o
 * "This page could not be found" em inglês.
 *
 * Isso obriga a um texto que sirva os dois públicos muito diferentes que aqui
 * chegam: alguém da equipa que escreveu mal um endereço do painel, e um cliente
 * final que seguiu o link de marcação de uma empresa que não existe, foi
 * arquivada ou está suspensa.
 *
 * Os três casos da marcação dão a mesma página de propósito. Dizer "esta
 * empresa está suspensa" contaria a um estranho o estado comercial de um
 * cliente nosso; dizer "não existe" quando existe faria desta rota um
 * verificador de empresas.
 */
export default function NaoEncontrado() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-(length:--text-xl) font-semibold">Página não encontrada</h1>

      <p className="mt-3 text-pretty text-(--ink-muted)">
        Este endereço não corresponde a nada que possamos mostrar. Se estava a
        tentar marcar, confirme se o link está completo — ou contacte
        diretamente o estabelecimento.
      </p>
    </main>
  );
}
