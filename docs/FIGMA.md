# Figma

> A biblioteca de design, gerada a partir do código a 2026-08-23.
>
> **[Totalmobi Booking — Design System](https://www.figma.com/design/X5lGgRyS72xHKHYV8ZipdE)**
> `fileKey` = `X5lGgRyS72xHKHYV8ZipdE`

---

## A direção é código → Figma, e não ao contrário

O design system nasceu no M3, em `packages/ui/src/tokens.css`, com um teste de
contraste que **faz falhar o build** quando um par de cores não passa a WCAG.
Desenhar em Figma ignorando isso criaria duas fontes de verdade que divergem na
primeira semana — e a que tem testes é a do código.

Por isso a biblioteca foi **gerada a partir dos tokens**, e cada variável leva
o nome CSS que representa no campo de code syntax. No Dev Mode aparece
`var(--brand)`, não um hexadecimal solto.

**Se um valor no Figma discordar do código, o código ganha.** Não há sincronismo
automático: quando um token mudar em `tokens.css`, é preciso repetir a geração.

## O que lá está

| | |
|---|---|
| Coleção `Cor` | 21 variáveis, modo Claro |
| Coleção `Cor — Escuro` | as mesmas 21, valores de `:root[data-theme='dark']` |
| Coleção `Escala` | 22 — tipografia, raio, alvo tátil, movimento |
| Estilos de texto | 9, a rampa do `tokens.css` |
| Estilos de efeito | 3 sombras |
| Componentes | `Botão` — 4 variantes × 3 estados |
| Páginas | Capa · Fundações · Botão |

### Auditoria, à data da geração

- **23 de 23** preenchimentos e **3 de 3** contornos ligados a variáveis. Zero
  valores escritos à mão.
- Raio e altura ligados nas 12 variantes.
- Contraste do texto contra o fundo: mínimo **5,08:1** (Primária), acima do
  mínimo AA de 4,5:1.

## Code Connect: bloqueado pelo plano

Tentado a 2026-08-23. A resposta do Figma:

> You need a Dev or Full seat on an Organization or Enterprise plan to use Code
> Connect.

O Code Connect é o que faz o painel de inspeção mostrar **o código real** —
`import { Button } from "@totalmobi/ui"` — em vez de um snippet gerado a partir
dos píxeis. Precisa de plano **Organization ou Enterprise**; o Starter não
chega, e nem sequer é o passo de publicar que falha: a API recusa a leitura.

**O que se fez em vez disso.** A descrição do conjunto e de cada uma das doze
variantes passou a carregar o código a que corresponde:

```
<Button variant="secondary">Confirmar</Button>
```

O painel de inspeção mostra a descrição, por isso quem abrir o componente vê o
que escrever. É manual — se o botão mudar no código, muda-se aqui também — e é
exatamente isso que o Code Connect automatizaria.

**Decidido a 2026-08-23: não se sobe de plano.** Não é indecisão — é que o
produto ainda não tem um cliente pagante, e uma subscrição mensal antes da
primeira venda é custo fixo contra receita zero.

**O gatilho para reavaliar** não é a vontade, é um facto: quando houver receita
**e** o Figma for onde o desenho acontece a sério — mais de uma dúzia de
componentes, ou outra pessoa a desenhar. Com um componente e um ficheiro, o
plano não se paga. Com vinte componentes e duas pessoas, paga-se no primeiro mês
em que alguém não implementar um botão errado.

Nessa altura os ficheiros `ComponentName.figma.ts` são meia hora de trabalho: a
skill `figma-code-connect` tem o formato, os componentes existem e as
propriedades já têm nomes estáveis (`Variante`, `Estado`). Falta só a
autorização.

## Quatro limites do plano Starter que moldaram o resultado

Não são preferências de desenho; são o que o plano deixa fazer. E ficam assim
por decisão — ver acima.

**O padrão vale a pena notar:** aqui, no FullCalendar Premium (480 USD/ano) e no
cron do Vercel Pro, o limite do plano forçou uma solução própria que acabou por
ser melhor ou igual. Procurar essa saída antes de assumir que o dinheiro é a
resposta tem sido o hábito certo.

0. **Sem Code Connect** — ver acima. É o que mais custa dos quatro.
1. **Um modo por coleção** — `addMode` responde *"Limited to 1 modes only"*. O
   claro e o escuro teriam de ser dois modos da mesma coleção, com as variáveis
   a resolver sozinhas. Como não podem, o escuro é uma **coleção separada**. A
   informação não se perde; a comodidade de trocar de tema com um clique sim.
2. **Três páginas** — *"The Starter plan only comes with 3 pages"*. Gastaram-se
   nas três que valem e não há página separadora.
3. **Sem variáveis `TIMING`** — *"TIMING variable creation is not supported"*.
   As durações ficam em `FLOAT`, em milissegundos. Perde-se a ligação ao painel
   de animação do Figma; não se perde o valor.

Num plano Professional, o primeiro e o segundo desaparecem e vale a pena
refazer a geração com modos a sério.

## Duas coisas que o ficheiro não decide

**A cor da marca.** O produto é white-label: cada cliente injeta a sua em
`--brand` no servidor, já validada contra a WCAG em `contrast.ts`. O
verde-azulado do ficheiro é o valor por omissão da plataforma, não a identidade
do produto.

**O tipo de letra.** O código usa a pilha do sistema (`ui-sans-serif`,
`system-ui`, `-apple-system`, `Segoe UI`, `Roboto`). Essa pilha não existe no
Figma; o **Inter** é o substituto, porque é metricamente próximo. Ninguém deve
concluir do ficheiro que o produto usa Inter.

## Como repetir a geração

Os scripts correram pelo MCP do Figma, com as skills `figma-use` e
`figma-generate-library`. A ordem que funcionou:

1. `create_new_file` → guardar o `fileKey`
2. Coleção `Cor` — variáveis, `scopes`, `setVariableCodeSyntax('WEB', 'var(--x)')`
3. Coleção `Cor — Escuro` e coleção `Escala`
4. Estilos de texto e de efeito (`loadFontAsync` antes de qualquer texto)
5. Páginas e documentação visível
6. Componentes, com `combineAsVariants` e posicionamento manual das variantes
7. Auditoria: nenhum `fill` ou `stroke` sem variável, e contraste de cada par

**Não editar variáveis à mão no Figma.** Edita-se o `tokens.css` e repete-se.
