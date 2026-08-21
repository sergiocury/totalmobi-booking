/**
 * O layout do caminho público.
 *
 * Existe por duas razões, e a segunda só se descobriu a testar.
 *
 * 1. **Separar a superfície pública do painel.** O que vive aqui é visto por
 *    clientes finais que nunca terão conta, e não deve herdar nada do que é
 *    para quem gere.
 *
 * 2. **É o que faz o `not-found.tsx` deste segmento ser usado.** Sem um
 *    `layout.tsx` no mesmo nível, o `notFound()` da página caía no 404 genérico
 *    do Next — o "This page could not be found" em inglês, sem marca nenhuma,
 *    numa página que um cliente de uma clínica portuguesa pode ver.
 */
export default function LayoutPublico({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
