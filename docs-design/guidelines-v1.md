# Livro de guidelines do V1

**Olyvia · protótipo de Negócios, versão "Atual" (aspeto simples)** · estado de 15/10/2026

Este livro junta as regras de CSS, UX, acessibilidade e construção de ecrãs que o V1 segue de facto. Nada aqui é teoria: cada regra vem do código do protótipo, com o porquê e um exemplo real.

**Para quem:** designers e programadores que vão desenhar os próximos ecrãs e migrar o protótipo para a app.

**Como ler cada regra:**
- **Regra** em negrito, com um código (ex.: `P1`, `L4`) para se citar num PR ou numa revisão.
- *Porquê*, numa frase.
- **Exemplo do V1**, com o excerto real (classes Tailwind ou JSX) e o `ficheiro:linha`.

Os caminhos são relativos a `src/pages/prototipo-negocios/`, salvo indicação em contrário. Os números de linha são os do ramo `feat/negocios-prototipo` a 15/10/2026 e podem mexer-se com o tempo: procure o excerto, se a linha já não bater.

---

## Índice

1. [Princípios](#1-princípios)
2. [Fundamentos visuais](#2-fundamentos-visuais)
   - [2.1 Cor](#21-cor)
   - [2.2 Tipografia](#22-tipografia)
   - [2.3 Espaço, raio e sombra](#23-espaço-raio-e-sombra)
   - [2.4 Ícones e ilustrações](#24-ícones-e-ilustrações)
3. [Layout e responsivo](#3-layout-e-responsivo)
4. [Componentes e padrões](#4-componentes-e-padrões)
   - [4.1 Botões](#41-botões)
   - [4.2 Escolhas e campos](#42-escolhas-e-campos)
   - [4.3 Listas e cartões](#43-listas-e-cartões)
   - [4.4 Progresso e passos](#44-progresso-e-passos)
   - [4.5 Avisos, confirmações e estados](#45-avisos-confirmações-e-estados)
   - [4.6 Documentos, portal e assinatura](#46-documentos-portal-e-assinatura)
5. [Construção de um ecrã (receita)](#5-construção-de-um-ecrã-receita)
6. [Movimento](#6-movimento)
7. [Acessibilidade](#7-acessibilidade)
8. [Escrita (microcopy)](#8-escrita-microcopy)
9. [Qualidade e verificação](#9-qualidade-e-verificação)
10. [Checklist de revisão de um ecrã](#10-checklist-de-revisão-de-um-ecrã)
- [Anexo A: Antes e depois (15/10)](#anexo-a-antes-e-depois-1510)
- [Anexo B: Exceções e dívidas conhecidas](#anexo-b-exceções-e-dívidas-conhecidas)
- [Anexo C: Referência rápida de classes](#anexo-c-referência-rápida-de-classes)

---

## 1. Princípios

O V1 nasceu de uma frase do Ruben, a 09/10: *"tem muito ruído na tela, pouca acessibilidade. Não podemos simplesmente simplificar o processo, temos de simplificar a experiência e design"*. A 14/10 juntou: *"tem de ser fluida, intuitiva, guiada, e linda"*. A 15/10: *"sempre interfaces clean como na V1"*. Estes princípios mandam em todas as outras regras.

**P1. Um só botão primário por ecrã.**
*Porquê:* quem olha tem de saber logo o que fazer; dois primários obrigam a decidir.
Exemplo: o rodapé do passo tem só um primário, e o resto é `ghost` ou ligação.
```tsx
{/* Um só botão primário: Continuar, ou o passo do negócio no fim (o passo guiado tem o seu) */}
<Button variant="ghost" size="lg" …>Anterior</Button>
…
<Button size="lg" className="w-full sm:w-auto" onClick={() => setAtivo(ativo + 1)}>Continuar</Button>
```
`NegocioSimples.tsx:412-433`. Quando um passo traz o seu próprio "Seguinte" (a seleção guiada), a fase esconde o "Continuar" (`NegocioSimples.tsx:413`, `guiaPasso.ts`).

**P2. O próximo passo está sempre à vista.**
*Porquê:* o ecrã nunca acaba num beco; quem chega sabe o que vem a seguir.
Exemplos: o cartão de cada negócio acaba no próximo passo, em cor de acento e com seta (`NegociosSimples.tsx:31-34`); no telemóvel, "Fase 3 de 6: Visita · depois: Negócio" (`NegocioSimples.tsx:100-102`); no portal, uma barra fixa em baixo chamada "Próximo passo" (`PortalCliente.tsx:547`).

**P3. Guiado: uma coisa de cada vez.**
*Porquê:* o comercial está de pé, com o telemóvel numa mão; um passo por ecrã cansa menos do que um formulário comprido.
Exemplo: a página do negócio mostra só o passo atual; os outros ficam numa lista à esquerda (`NegocioSimples.tsx:1-3`, `Lateral` em `:261`). A seleção das necessidades é um passo de cada vez, com o "Seguinte" fixo em baixo (`SelecaoGuiada.tsx:2`).

**P4. Menos ruído.**
*Porquê:* foi o motivo do V1. O que fazia ruído (memória de 09/10): moldura escura, gradientes, títulos em maiúsculas espaçadas, pastilhas e contadores por todo o lado, cartões dentro de cartões, vários primários, pontos de cor com legenda, texto cinzento a 11–12 px, ícones sem rótulo, animações em "ping".
Regras práticas (README, "As regras de desenho, pedidas pelo Ruben"): fundo claro e um só acento; cor só nos ícones, nunca no texto; nada de cartões dentro de cartões.

**P5. Escolher em vez de escrever. Nada de listas que abrem nem de "+" para juntar.**
*Porquê:* um toque é mais rápido e mais seguro do que escrever ou abrir um `<select>`; os "+" multiplicam botões.
Exemplo:
```tsx
// escolher é mais rápido do que escrever: botões sempre, nunca uma lista que abre
```
`CamposFase.tsx:359`. Os cartões de serviços e produtos ligam e desligam ao toque, "sem '+', com `aria-pressed`" (`CartoesSelecao.tsx:1`). O ícone `Plus` só aparece no contador − / + e no botão de criar ("Novo negócio").

**P6. Os factos fazem avançar.**
*Porquê:* o estado do negócio tem de ser verdadeiro; arrastar cartões mente.
Exemplo:
```tsx
<p …>Os cartões não se arrastam: o negócio muda de fase quando acontece o facto (chamada registada, visita marcada, contrato assinado, pagamento validado).</p>
```
`NegociosSimples.tsx:99`. Um passo completo passa sozinho ao seguinte, 700 ms depois (`NegocioSimples.tsx:344-355`).

**P7. A ação está onde a pessoa a procura.**
*Porquê:* o "Reabrir levantamento" escondido nos produtos ninguém o encontrava (memória de 14/10).
Exemplo: "Precisa de mudar a visita?" aparece na própria Visita já feita, com o botão ao lado (`NegocioSimples.tsx:165-173`).

**P8. Leitura fácil para todos.**
*Porquê:* quem usa inclui pessoas com dislexia e quem lê no estaleiro.
Exemplo: a letra é Lexend; há o interruptor "Leitura fácil" (fundo creme, mais espaço) e o botão "Ouvir", que lê o passo em voz alta em pt-PT (`prototipo.css:277-283`, `NegocioSimples.tsx:233-257`).

**P9. Dados de exemplo realistas.**
*Porquê:* o protótipo convence quem decide; "Lorem ipsum" e "Cliente 1" não.
Exemplo: nomes portugueses (Ana Martins, Joana Ribeiro, Tiago Almeida), o catálogo real da Mudelar (358 serviços, 2.136 produtos), feriados nacionais reais, NIF de exemplo `500 000 000`. O que é inventado diz-se ("Dados de exemplo neste protótipo", `PortalCliente.tsx:160`). Nunca se inventam datas nem preços que não estejam configurados (README, "Contentor escolhido sozinho").

**P10. Bonito e dinâmico, mas discreto.**
*Porquê:* o Ruben quer "WOW" no terreno, sem animações que distraiam.
Exemplo: a mola curta de cerca de 300 ms, só `transform` e `opacity`, e nada de movimento com `prefers-reduced-motion` (`movimento.tsx:1-6`). Ver a secção [6](#6-movimento).

---

## 2. Fundamentos visuais

### 2.1 Cor

**F1. Use só os tokens do tema `.calma`, nunca cores soltas.**
*Porquê:* o tema `.calma` muda os tokens do shadcn só dentro do protótipo; com eles, os componentes (`Button`, `Switch`…) e o contraste vêm certos de graça.
Exemplo: a raiz do V1 leva a classe `calma`:
```tsx
<div className={cn("pn calma fixed inset-0 flex bg-background … text-foreground", S.leitura && "leitura")}>
```
`PrototipoNegocios.tsx:333`. Os tokens estão em `prototipo.css:239-252` e `:292-293`:

| Token | Valor (HSL) | Uso |
|---|---|---|
| `--background` | `240 24% 96.5%` | fundo da página (cinza-lilás muito suave, não branco puro) |
| `--card` | `0 0% 100%` | cartões, listas, cabeçalhos |
| `--foreground` | `224 28% 12%` | texto principal |
| `--muted` | `240 20% 94.5%` | fundos de estado (passo ativo, figuras) |
| `--muted-foreground` | `220 10% 34%` | texto secundário (cerca de 7:1) |
| `--primary` | `256 56% 48%` | **o único acento** (7,7:1 sobre branco) |
| `--border` | `235 16% 87%` | linhas e contornos de cartão |
| `--input` | `220 12% 78%` | contorno de controlos |
| `--destructive` | `0 68% 44%` | erro, "Falta preencher", margem abaixo do mínimo |
| `--warning` | `32 92% 38%` | atenção (margem abaixo do alvo, materiais tarde) |
| `--success` | `152 62% 30%` | feito, margem boa |
| `--info` | `210 70% 40%` | informação (pouco usado) |

> Os valores de `src/index.css` (roxo `262 83% 58%`, rosa `340 82% 52%`, gradientes) são da estética antiga da Olyvia e **não se usam** no V1. Ao migrar, o tema `.calma` passa a ser o tema da app.

**F2. Um só acento: o `primary`.**
*Porquê:* uma cor que chama a atenção só funciona se for a única.
Exemplo: escolhido = `border-primary bg-primary text-primary-foreground`; o resto é neutro (`CamposFase.tsx:411-415`). O acento suave usa opacidades: `bg-primary/10` (item de menu atual, `PrototipoNegocios.tsx:304`), `bg-primary/[0.06]` (cartão escolhido, `CartoesSelecao.tsx:24`), `bg-primary/[0.04]` (pergunta seguinte, `CamposFase.tsx:386`).

**F3. As cores de estado dizem-se também com ícone e texto, nunca só com cor.**
*Porquê:* daltonismo e ecrãs ao sol; e a cor no texto faz ruído.
Exemplo: margem baixa no Catálogo = ícone vermelho + texto normal + frase só para leitores de ecrã:
```tsx
{baixa && <TriangleAlert className="h-4 w-4 text-destructive" aria-hidden="true" />}margem {pct(i.m)}<span className="sr-only">, {margemEmPalavras(i.m, min, alvo)}</span>
```
`CatalogoV1.tsx:80`. Exceção aceite: o número da margem no cabeçalho do negócio leva `text-destructive / text-warning / text-success` porque está ao lado do rótulo "margem" (`NegocioSimples.tsx:89`).

**F4. As cores das fases do negócio vivem só nos ícones (`FASE_COR`).**
*Porquê:* ajudam a reconhecer a fase de relance sem pintar texto.
```ts
export const FASE_COR = [
  "bg-sky-100 text-sky-700", "bg-teal-100 text-teal-700", "bg-amber-100 text-amber-800",
  "bg-violet-100 text-violet-700", "bg-emerald-100 text-emerald-700", "bg-orange-100 text-orange-700",
];
```
`pecas.tsx:74-77`; usadas em `IconeFase` (`pecas.tsx:78-82`), sempre `aria-hidden`.

**F5. As fases da obra usam uma rampa do acento (`COR_FASE`), não quatro cores diferentes.**
*Porquê:* é a mesma família do acento, do claro ao escuro, e todas têm pelo menos 3:1 sobre o branco e o fundo.
```ts
/** A rampa das fases (um só tom, do claro ao escuro; todos ≥ 3:1 sobre o branco e sobre o fundo). */
export const COR_FASE: Record<number, string> = { 1: "#9074dc", 2: "#7452d1", 3: "#5a36bf", 4: "#432791" };
```
`planoObra.ts:12-13`. Usa-se nas barras do Gantt, nas faixas das fases e no traço de cada fase (`PlanoObraOrcamento.tsx:189`, `:234`, `:266`).

**F6. Fundos de aviso: a cor do estado a 5–8 % e a borda a 25–40 %.**
*Porquê:* o aviso destaca-se sem gritar.
Exemplos: fase concluída `border-success/30 bg-success/[0.08]` (`NegocioSimples.tsx:124`); de volta à visita `border-primary/25 bg-primary/[0.05]` (`:138`); materiais tarde `border-warning/40 bg-warning/[0.06]` (`ObraOperacoes.tsx:226`); campo em falta `bg-destructive/[0.05]` (`CamposFase.tsx:386`).

**F7. O portal do cliente e os documentos têm a sua paleta: `slate`.**
*Porquê:* é o que o cliente vê, com a marca da empresa (Mudelar), e não a interface interna da Olyvia.
Exemplo: primário `bg-slate-900 text-white`, secundário `border border-slate-300 bg-white`, perigo `bg-red-700` (`PortalCliente.tsx:95-100`); o acento do passo atual é `#5a36bf`, a fase 3 da rampa (`PortalCliente.tsx:459`).

### 2.2 Tipografia

**F8. A letra é Lexend, carregada só no protótipo.**
*Porquê:* foi desenhada para facilitar a leitura, incluindo quem tem dislexia.
```css
.calma{font-family:"Lexend",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.calma button,.calma input,.calma select,.calma textarea{font-family:inherit}
```
`prototipo.css:277-278`; carregada do Google Fonts com os pesos 400, 500 e 600 (`PrototipoNegocios.tsx:178-183`). Não use pesos acima de 600 (`font-semibold`), salvo nos documentos.

**F9. O texto corre a 15–16 px. Nada abaixo de 14 px na interface.**
*Porquê:* o texto cinzento a 11–12 px era um dos ruídos de 09/10.
A escala usada:

| Uso | Classe | Exemplo |
|---|---|---|
| Título da página | `text-3xl font-semibold tracking-tight` | "Negócios" (`NegociosSimples.tsx:61`) |
| Nome no cabeçalho do negócio | `text-2xl … sm:text-3xl` | `NegocioSimples.tsx:67` |
| Título do passo | `text-2xl font-semibold tracking-tight` | `NegocioSimples.tsx:396` |
| Pergunta da seleção guiada | `text-[22px] font-semibold leading-tight tracking-[-0.01em]` | `SelecaoGuiada.tsx:178` |
| Subtítulo da página | `text-base` / `text-lg text-muted-foreground` | `NegociosSimples.tsx:62`, `CatalogoV1.tsx:364` |
| Título de secção | `text-base font-semibold` / `text-lg font-semibold` | `NegocioSimples.tsx:174`, `ObraOperacoes.tsx:30` |
| **Texto corrente, botões, campos** | **`text-[15px]`** | em todo o V1 |
| Texto secundário e notas | `text-sm text-muted-foreground` (14 px) | "Passo 2 de 5 · …" (`NegocioSimples.tsx:391`) |
| Número em destaque | `text-[17px] font-semibold` | total na barra de baixo (`SelecaoGuiada.tsx:217`) |

A base do tema é `font-size:16px; line-height:1.5` (`prototipo.css:251`). Exceções em [Anexo B](#anexo-b-exceções-e-dívidas-conhecidas).

**F10. Números em `tabular-nums`.**
*Porquê:* os algarismos ficam com a mesma largura, e as colunas e as contagens não "dançam".
Exemplo: `<dd className="font-semibold tabular-nums">{eur(T.pf)} €</dd>` (`NegocioSimples.tsx:88`); a contagem de cada fase (`NegociosSimples.tsx:46`); o `Contagem` animado já é `tabular-nums` (`movimento.tsx:111`).

**F11. Sem maiúsculas espaçadas na interface.**
*Porquê:* eram ruído. O `uppercase tracking-…` fica só nos documentos e no portal, como rótulo pequeno de um valor ("TOTAL, COM IVA", `PortalCliente.tsx:254`; o cabeçalho da `Folha`, `DocsCliente.tsx:96`).

### 2.3 Espaço, raio e sombra

**F12. Margens da página: `px-4 sm:px-8`; 16 px de margem lateral no telemóvel.**
*Porquê:* o mesmo ritmo em todos os ecrãs e nada colado à borda.
Exemplo: `mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:px-8 sm:pt-10` (`NegocioSimples.tsx:56`); `max-w-[1400px] px-4 pb-24 pt-6 sm:px-8` (`NegociosSimples.tsx:58`). O `pb-24` deixa espaço para a barra de baixo do telemóvel.

**F13. Ritmo vertical: `mt-2` dentro de um bloco, `mt-6` entre blocos, `mt-8`/`mt-10` entre secções.**
Exemplo: cabeçalho `mt-2`, filtros `mt-6`, colunas `mt-8` (`NegociosSimples.tsx:57-96`); rodapé do passo `mt-10 … border-t border-border pt-6` (`NegocioSimples.tsx:414`). Cada pergunta é uma linha com `py-4` (`CamposFase.tsx:385`).

**F14. Raios: `rounded-lg` em controlos, `rounded-xl` em cartões e botões grandes, `rounded-2xl` em blocos, `rounded-full` em filtros e pílulas.**
Exemplos: campo `h-11 … rounded-lg` (`NegociosSimples.tsx:71`); cartão de negócio `rounded-xl` (`:27`); cabeçalho do negócio `rounded-2xl` (`NegocioSimples.tsx:62`); filtro `rounded-full` (`CartoesSelecao.tsx:257`). A base do tema é `--radius: 0.75rem`.

**F15. Sombras discretas, só pelos tokens.**
*Porquê:* no `.calma` as sombras são cinzentas e quase invisíveis; as roxas do tema antigo faziam ruído.
Exemplos: bloco `shadow-[var(--shadow-sm)]` (`NegocioSimples.tsx:62`); ao passar o rato no cartão `hover:shadow-[var(--shadow-md)]` (`NegociosSimples.tsx:27`); cartão de seleção `shadow-[0_1px_2px_hsl(var(--foreground)/0.05)]` (`CartoesSelecao.tsx:38`). Só o primário fixo da barra de baixo tem sombra do acento: `shadow-[0_6px_16px_-6px_hsl(var(--primary)/0.6)]` (`SelecaoGuiada.tsx:221`).

**F16. Nada de cartões dentro de cartões.**
*Porquê:* cada caixa a mais é ruído. Dentro de um bloco, separa-se com `divide-y` ou com espaço.
Exemplo corrigido: "o 'O que fazer' deixou de ser um cartão com cartões dentro" (README, "Regras de desenho corrigidas"). As fases do plano passaram de cartões a uma lista `divide-y` (ver [Anexo A](#anexo-a-antes-e-depois-1510), caso 2).

### 2.4 Ícones e ilustrações

**F17. Ícones lucide, 16 px no texto e 18–20 px no menu, sempre `aria-hidden` e sempre com rótulo à vista.**
*Porquê:* ícones sem rótulo eram ruído e ninguém os percebia.
Exemplos: `<ArrowLeft className="h-4 w-4" aria-hidden="true" /> Negócios` (`NegocioSimples.tsx:59`); menu `h-[18px] w-[18px]` (`PrototipoNegocios.tsx:305`); barra de baixo `h-5 w-5` com o nome por baixo (`PrototipoNegocios.tsx:414`). Quando o ícone é o único conteúdo (−, +, fechar, voltar), o botão leva `aria-label` (`CamposFase.tsx:434`, `SelecaoGuiada.tsx:211`).

**F18. O ícone de uma fase ou de um bloco vai num quadrado de cor suave.**
Exemplo: `IconeFase` em três tamanhos (`sm` 28 px `rounded-lg`, `md` 40 px `rounded-xl`, `lg` 56 px `rounded-2xl`) e o `Chip` de 36 px (`pecas.tsx:78-87`).

**F19. Ilustrações próprias em SVG: traço de 2 px, cinzento, o acento só no pormenor, decorativas.**
*Porquê:* reconhecer um produto de relance sem fotografias; o nome está sempre escrito ao lado.
```ts
// <Ilustracao k="sanita" />: desenhos próprios em SVG, traço simples de 2 px (não escala), cinzento para a forma
// e a cor de destaque do tema (hsl(var(--primary))) só no pormenor (a água, a luz, o puxador). Legíveis a 48–96 px.
// São decorativas (aria-hidden): o nome do produto está sempre escrito ao lado.
```
`ilustracoes.tsx:2-4`. Sem `img`, usa-se a ilustração `generico`.

---

## 3. Layout e responsivo

**L1. Desenha-se primeiro para uma coluna, a 360 e 390 px.**
*Porquê:* o comercial e o técnico usam o telemóvel; o computador é o caso fácil.
Exemplo: o plano da obra foi refeito "numa coluna só, a pensar no telemóvel e na coluna estreita do computador" (`PlanoObraOrcamento.tsx:60-61`). Cada pergunta passa a resposta para baixo no telemóvel: `grid gap-3 … sm:grid-cols-[minmax(0,1fr)_auto]` (`CamposFase.tsx:385`).

**L2. Larguras máximas por tipo de ecrã.**

| Ecrã | Largura | Exemplo |
|---|---|---|
| Leitura, listas, fichas | `max-w-3xl` | Catálogo (`CatalogoV1.tsx:362`), portal (`PortalCliente.tsx:445`) |
| Página com lateral (negócio, mapa) | `max-w-6xl` | `NegocioSimples.tsx:56`, Ligações (`CatalogoV1.tsx:362`) |
| Quadro de colunas | `max-w-[1400px]` | `NegociosSimples.tsx:58` |
| Documento | `max-w-[760px]` / A4 `max-w-[794px]` | `DocsCliente.tsx:88`, `:164` |

**L3. A grelha do negócio: lateral de 260 px, conteúdo `minmax(0,1fr)` e, em ecrãs muito largos, uma terceira coluna de 240 px.**
```tsx
<div className="mt-8 grid items-start gap-10 lg:grid-cols-[260px_minmax(0,1fr)] 2xl:grid-cols-[260px_minmax(0,1fr)_240px]">
```
`NegocioSimples.tsx:154`. Abaixo de `lg` a lateral desaparece e os passos passam para pílulas por cima do passo (`:372`).

**L4. Lista no telemóvel, colunas no computador.**
*Porquê:* seis colunas a 390 px não cabem; uma fase de cada vez cabe.
Exemplo: Negócios mostra um separador por fase abaixo de `lg` (`NegociosSimples.tsx:84-92`) e as seis colunas a partir de `lg` (`:96`: `hidden gap-5 lg:grid lg:grid-cols-6`).

**L5. Numa linha de lista, os valores passam para baixo do nome abaixo de `sm`.**
*Porquê:* uma coluna de valores à direita espreme o nome numa coluna estreita (caso 1 do [Anexo A](#anexo-a-antes-e-depois-1510)).
```ts
// Os valores à direita da linha (preço, custo, margem). No telemóvel passam para uma linha própria por baixo do nome, lado a lado,
// para o nome não ficar espremido numa coluna estreita; a partir de sm voltam a ser a coluna da direita.
const VALORES = "flex basis-full flex-wrap items-baseline gap-x-3 sm:block sm:basis-auto sm:shrink-0 sm:text-right";
```
`CatalogoV1.tsx:31-33`. A linha é `flex flex-wrap … sm:flex-nowrap` e os valores ganham o recuo do ícone (`pl-14 sm:pl-0`) para alinharem com o texto (`CatalogoV1.tsx:65`, `:76`).

**L6. Quebrar a linha (`flex-wrap`) em vez de cortar.**
*Porquê:* um texto cortado esconde informação; uma linha a mais não custa nada.
Exemplos: os dados do cliente `flex flex-wrap gap-x-6 gap-y-2` (`NegocioSimples.tsx:85`); as fases feitas e os passos em pílulas `flex flex-wrap gap-1.5` (`:104`, `:372`); "Mostrar mais" com `h-auto max-w-full whitespace-normal` (`CatalogoV1.tsx:53`).

**L7. Todo o filho flexível com texto leva `min-w-0`; textos sem espaços levam `break-all`.**
*Porquê:* sem `min-w-0` o texto empurra a página para fora do ecrã.
Exemplos: `<span className="min-w-0 flex-1">` em cada linha (`CatalogoV1.tsx:67`); o email `className="break-all"` (`NegocioSimples.tsx:206`); a referência MB e o IBAN `min-w-0 break-all` (`PortalCliente.tsx:66`). O `truncate` só se usa quando o texto inteiro está noutro lado (no `title` e no `aria-label`, como os nomes dos cartões: `line-clamp-2`, `CartoesSelecao.tsx:79`).

**L8. Filas que deslizam: uma linha só, sem barra de scroll, com esbatimento na ponta que tem mais.**
*Porquê:* filtros e separadores numa linha poupam altura; o esbatimento diz que há mais.
```tsx
<div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 sm:[mask-image:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,#000_calc(100%-2rem),transparent)]" role="group" aria-label="Mostrar">
```
`NegociosSimples.tsx:74`. A partir de `sm` a fila quebra a linha e o esbatimento sai. A `FiltrosFila` vai mais longe: esbate só a ponta que tem conteúdo, arrasta-se com o rato, a roda passa a horizontal e o filtro focado com Tab fica à vista (`CartoesSelecao.tsx:207-305`, máscara em `:263-265`).
Quando usar cada uma: **desliza** se são filtros ou separadores do mesmo nível (muitos e curtos); **quebra** se é informação que tem de se ler toda (dados, fases feitas, passos).

**L9. Barra de baixo no telemóvel, com a área segura do iPhone.**
*Porquê:* o menu fica ao alcance do polegar e não fica por baixo da barra do sistema.
```tsx
<nav className="fixed bottom-0 left-0 right-0 z-50 flex h-[calc(4rem_+_env(safe-area-inset-bottom))] … pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Menu">
```
`PrototipoNegocios.tsx:410`. O `<main>` desconta-a: `pb-[calc(4rem_+_env(safe-area-inset-bottom))] md:pb-0` (`:373`), e a meta viewport ganha `viewport-fit=cover` enquanto o protótipo está aberto (`:133`). Quatro itens e "Mais"; o resto vai para um painel que sobe de baixo (`:389-408`).

**L10. O primário do passo guiado fica fixo em baixo, com fundo translúcido.**
```tsx
<div className="sticky bottom-0 z-20 -mx-4 mt-8 flex items-center gap-3 border-t border-border/70 bg-background/80 px-4 py-3 backdrop-blur-md backdrop-saturate-150 md:mx-0 md:px-0 md:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
```
`SelecaoGuiada.tsx:197`. À esquerda o "Voltar" (só ícone, 48 px), ao meio o total e o resumo, à direita o "Seguinte".

**L11. Títulos de grupo pegajosos dentro de listas longas.**
Exemplo: `sticky top-0 z-10 -mx-4 … bg-background/90 … backdrop-blur-md` com o nome da fase e quantos estão escolhidos (`SelecaoGuiada.tsx:302`).

**L12. No Gantt, o nome vai numa linha por cima da barra e fica parado ao deslizar a grelha.**
*Porquê:* uma coluna de nomes à esquerda cortava os nomes no telemóvel (caso 3 do [Anexo A](#anexo-a-antes-e-depois-1510)).
```tsx
{/* o nome, os dias e o custo por cima da barra (parados ao deslizar a grelha): nunca cortados */}
<button … className="sticky left-4 flex min-h-8 items-center gap-2 …" style={{ width: linhaW }}>
```
`PlanoObraOrcamento.tsx:244-253`. A grelha usa a largura toda (`colW = Math.max(48, visivel / nDias)`, `:64`) e só desliza abaixo de 48 px por dia; o custo fica ao lado da barra, nunca por cima.

**L13. Medidas pelo próprio bloco quando o bloco pode estar em sítios diferentes (container queries).**
Exemplo: as etapas da pessoa mostram o nome a partir de 560 px de largura do bloco, não do ecrã:
```css
.etapas-cx,.percurso-cx,.negocios-cx{container-type:inline-size;min-width:0}
@container (min-width:560px){.etapa-nome{position:static;…}.etapa-atual{display:none}}
```
`prototipo.css:299-302`.

---

## 4. Componentes e padrões

### 4.1 Botões

**C1. Quatro níveis de botão, por esta ordem de peso.**

| Nível | Como | Exemplo |
|---|---|---|
| Primário (um por ecrã) | `<Button size="lg">` | "Continuar" (`NegocioSimples.tsx:433`) |
| Secundário | `<Button variant="outline">` | "Mostrar mais" (`CatalogoV1.tsx:53`), "Copiar link" (`DocsCliente.tsx:690`) |
| Discreto | `<Button variant="ghost">` | "Anterior", "Cancelar" (`NegocioSimples.tsx:416`, `NegociosSimples.tsx:126`) |
| Ligação | `text-primary underline-offset-4 hover:underline`, `min-h-11` | "Portal do cliente", "Não mudar nada e voltar ao orçamento" (`NegocioSimples.tsx:74`, `:146-148`) |
| Ação rara e secundária | ligação cinzenta `text-muted-foreground … hover:underline` | "Marcar como perdido" (`NegocioSimples.tsx:79`) |

Os primários usam `size="lg"` (44 px). O tamanho `default` do shadcn tem 40 px e o `sm` 36 px: só se usam em controlos secundários dentro de uma faixa.

**C2. No telemóvel, o primário ocupa a largura toda e fica por baixo dos secundários.**
```tsx
<div className="mt-10 flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
  …<Button size="lg" className="w-full sm:w-auto" …>Continuar</Button>
```
`NegocioSimples.tsx:414-433`. O `flex-col-reverse` põe o primário em cima no telemóvel e à direita no computador.

**C3. Uma ação perigosa usa `variant="destructive"` e só aparece na confirmação.**
Exemplo: "Marcar como perdido" é uma ligação cinzenta; o botão vermelho só aparece na confirmação (`NegocioSimples.tsx:79`, `:119`).

### 4.2 Escolhas e campos

**C4. Escolha única ou múltipla: botões com `aria-pressed`, num `role="group"` com rótulo.**
```tsx
<div role="group" aria-labelledby={rot} aria-describedby={desc} className={cn("flex flex-wrap gap-2", !largo && "sm:justify-end")}>
  <button type="button" aria-pressed={ligado(x)} aria-invalid={erro || undefined}
    className={cn("min-h-11 min-w-14 rounded-lg border px-4 text-[15px] transition-colors duration-150",
      ligado(x) ? "border-primary bg-primary text-primary-foreground" : …)}>
```
`CamposFase.tsx:407-415`. Tocar outra vez na escolhida limpa a resposta (`val === x ? "" : x`). Com mais de 3 opções ou mais de 34 letras, a resposta passa para baixo da pergunta (`largo`, `:361`).

**C5. A opção que faz avançar leva contorno tracejado do acento enquanto não está escolhida.**
*Porquê:* diz, sem palavras a mais, qual é a resposta que leva ao passo seguinte (ex.: "Feita" no estado da visita).
```tsx
// a opção que faz avançar (ex.: "Feita"), enquanto não está escolhida: tracejado do acento
: x === avanca ? "border-2 border-dashed border-primary bg-primary/[0.04] font-medium text-primary hover:bg-primary/10"
…
{x === avanca && !ligado(x) && <span className="sr-only"> (marque para avançar)</span>}
```
`CamposFase.tsx:413-418`. O mesmo tracejado marca uma resposta **sugerida** (nunca escolhida por nós): `border-2 border-dashed border-primary/70` e a palavra "Sugerido" (`CartoesSelecao.tsx:178-182`).

**C6. Contar sem escrever: o contador − / +.**
```tsx
<div role="group" aria-labelledby={rot} … className="inline-flex items-center rounded-lg border bg-card p-0.5">
  <button type="button" className={btn} aria-label="Menos" disabled={n !== null && n <= min} …><Minus className="h-4 w-4" /></button>
  <output aria-live="polite" className="w-14 text-center text-[17px] font-medium tabular-nums">{txt}</output>
  <button type="button" className={btn} aria-label="Mais" …><Plus className="h-4 w-4" /></button>
```
`CamposFase.tsx:425-442`. Botões de 44 × 44 (`h-11 w-11`); o primeiro + dá 1 e o primeiro − dá o mínimo; o zero pode ter nome ("R/C").

**C7. Datas: os dias mais usados num toque; outra data só quando é preciso.**
Exemplo: "Hoje · Amanhã · Daqui a 1 semana · Outra data" (ou "Hoje · Ontem · Há 2 dias" para o passado); só "Outra data" abre o `input type="date"` (`CamposFase.tsx:445-472`). No plano da obra: "Próxima segunda · Daqui a 2 semanas · Daqui a um mês · Outra data" (README, "Plano da obra no orçamento").

**C8. Nada de `<select>` nativos: segmentos até 6 opções, seletor com pesquisa acima disso.**
*Porquê:* o Ruben: "na ficha do serviço não quero dropdowns feias".
```ts
// · Segmentos: poucas opções (até 6), em botões de rádio com alvos de 44 px;
// · SeletorPesquisa: muitas opções, num painel (popover) com pesquisa, lista filtrável, ícone e o valor
//   principal à direita (€/h, €/un). Teclado: ↑ ↓ para andar, Enter para escolher, Esc para fechar.
```
`pecasFicha.tsx:1-4`. Os `Segmentos` usam `<input type="radio" className="sr-only">` dentro de `<label>` com `focus-within:ring-2` (`pecasFicha.tsx:14-34`).

**C9. Campos de texto: 44 px, rótulo visível, grava ao sair ou com Enter.**
Exemplo: `h-11 w-full rounded-lg border border-input bg-background px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25` (`NegociosSimples.tsx:109`). O rótulo envolve o campo (`<label className="grid gap-1.5 text-sm font-medium">Nome<input …/></label>`, `:113`). Números com `inputMode="decimal"` e alinhados à direita (`CamposFase.tsx:376-377`); telefone com `inputMode="tel"` (`NegociosSimples.tsx:114`). O campo opcional diz-se: "(opcional)" (`CamposFase.tsx:389`).

**C10. Pesquisa: ícone à esquerda, rótulo só para leitores de ecrã, exemplo do que se procura.**
```tsx
<label className="relative w-full sm:w-80">
  <span className="sr-only">Procurar</span>
  <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
  <input type="search" placeholder="Procurar nome, telefone ou serviço" … className="h-11 w-full rounded-lg … pl-10 pr-3 text-[15px] …" />
```
`NegociosSimples.tsx:68-72`. Na seleção guiada é mais alta (`h-12 rounded-xl`, `CartoesSelecao.tsx:196`). Pesquisa sem acentos (`normal()`), e o número de resultados num `aria-live` (`CatalogoV1.tsx:144`).

**C11. Interruptores: `role="switch"` com `aria-checked`, rótulo e explicação à esquerda.**
```tsx
<button type="button" role="switch" aria-checked={!!S.leitura} …
  className="mx-3 flex min-h-11 items-center justify-between gap-3 rounded-lg text-left text-[15px] text-foreground">
  <span>Leitura fácil<span className="block text-sm text-muted-foreground">letra maior, mais espaço</span></span>
  <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", S.leitura ? "bg-primary" : "bg-input")}>…
```
`PrototipoNegocios.tsx:347-352`; igual em "Venda direta" (`OrcamentoSimples.tsx:142-148`). Use o interruptor para estados que ficam (ligado/desligado), não uma ligação que troca de texto (caso da demolição, `2c696a67`).

### 4.3 Listas e cartões

**C12. Uma lista é um bloco com `divide-y`, não uma pilha de cartões.**
```ts
const LISTA = "divide-y divide-border rounded-2xl border border-border bg-card px-4 shadow-[var(--shadow-sm)] sm:px-5";
```
`CatalogoV1.tsx:29`. Cada linha tem pelo menos 64 px (`min-h-16`), ícone ou ilustração à esquerda, nome e descrição ao meio, valores à direita (ou por baixo, [L5](#3-layout-e-responsivo)).

**C13. A linha inteira é um botão quando abre alguma coisa.**
Exemplo: `<button … className="group flex min-h-16 w-full … text-left">` com `group-hover:underline` no nome (`CatalogoV1.tsx:65-68`). Ao voltar, o foco regressa à linha (`id={`svc-${i.sid}`}`).

**C14. O cartão do negócio tem três linhas: quem, o quê, o próximo passo.**
```tsx
<Progresso fase={d.fase} className="mb-3" />
<span className="block text-base font-semibold text-foreground">{d.nome}</span>
<span className="mt-0.5 block text-sm text-muted-foreground">{d.servico}{loc ? " · " + loc : ""}…</span>
<span className={cn("mt-2 block text-sm font-medium", late ? "text-destructive" : p.wait || p.done ? "text-muted-foreground" : "text-primary")}>{p.t}…
```
`NegociosSimples.tsx:28-35`. O cartão novo aparece com `border-primary animate-in fade-in-0 zoom-in-95`.

**C15. Cartões de seleção: ligam e desligam ao toque, com visto que se desenha e o acento por camada.**
*Porquê:* um toque, sem "+", e o escolhido vê-se sem repintar a caixa.
Exemplo: o acento é uma camada por cima que só muda de `opacity`:
```tsx
className="pointer-events-none absolute -inset-px rounded-xl border-2 border-primary bg-primary/[0.06] shadow-[0_8px_24px_-12px_hsl(var(--primary)/0.55)]"
```
`CartoesSelecao.tsx:20-26`; o botão tem `aria-pressed`, `aria-label` com o nome completo, o nome em 2 linhas no máximo e o "press" a 0,97 (`:45-47`, `:79`, `:92`). Grelhas fluidas: `grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))]` para serviços e `minmax(150px,1fr)` para produtos (`SelecaoGuiada.tsx:44-46`).

**C16. Listas grandes mostram-se aos poucos.**
Exemplo: 6 cartões e "Ver mais" de 12 em 12 (`SelecaoGuiada.tsx:465-472`); 8 por ofício e 40 produtos de cada vez, com "Mostrar mais 40 (faltam N)" (`CatalogoV1.tsx:34`, `:50-56`). Testado com 2.200 produtos.

### 4.4 Progresso e passos

**C17. As fases do negócio: seis segmentos finos, com o nome por baixo a partir de `sm`.**
```tsx
<ol className="grid grid-cols-6 gap-1.5" aria-label="Fases do negócio">
  <li aria-current={i === d.fase ? "step" : undefined}>
    <span className={cn("block h-2 rounded-full transition-colors duration-500", i < d.fase ? "bg-primary" : i === d.fase ? "bg-primary/50" : "bg-muted")} />
```
`NegocioSimples.tsx:92-99`. No telemóvel, uma frase substitui os nomes (`:100-102`). Versão mini no cartão: `Progresso` com `role="img"` e `aria-label="Fase 3 de 6"` (`pecas.tsx:46-54`).

**C18. Os passos de uma fase: lista à esquerda no computador, pílulas no telemóvel, e "Fim".**
Exemplo: no computador, cada passo tem uma bola (vazia, cheia com visto, ou vermelha com "!") e "faltam 2" em texto (`NegocioSimples.tsx:273-281`). No telemóvel, pílulas de 36 px: o passo atual com o nome, os feitos com visto, os outros com o número, e a pílula "Fim" para o botão da fase (`:372-386`).

**C19. A barra de passos da seleção guiada mostra "3 de 7" e, ao acabar, "Feito".**
Exemplo: `Progresso` em `movimento.tsx:123-155` (`role="progressbar"`, `aria-valuetext="3 de 7"`, o indicador do passo atual desliza com `layoutId`).

**C20. Cada passo diz quanto falta, em respostas e em tempo.**
```ts
return `falta${f > 1 ? "m" : ""} ${f} ${f === 1 ? "resposta" : "respostas"} · ${min <= 1 ? "menos de 1 minuto" : `cerca de ${min} minutos`}`;
```
`NegocioSimples.tsx:225-231` (cerca de 6 s por resposta com botões).

### 4.5 Avisos, confirmações e estados

**C21. O cartão "O que fazer": uma frase, as condições e um só primário.**
*Porquê:* quem abre a obra tem de ver logo o que lhe cabe.
Exemplo: `<section aria-label="O que fazer" className={cn(CARTAO, "mt-6 p-5")}>`, com a frase em `text-lg`, as condições numa linha com visto ou círculo (e "(feito)/(por fazer)" para leitores de ecrã), as alternativas como botões grandes com a consequência por baixo ("A obra não atrasa." / "A obra acaba mais tarde.") e o botão de quem tem a vez (`ObraOperacoes.tsx:222-260`).

**C22. Avisos (toasts): no máximo dois à vista, com ação quando faz sentido.**
*Porquê:* uma ação em cadeia (assinar o contrato) dava seis avisos e tapava o ecrã do telemóvel.
```tsx
<div className="toasts" aria-live="polite">
  {/* no máximo dois avisos à vista (os mais recentes) … */}
  {toasts.slice(-2).map((t) => (
    <div key={t.id} className={"toast " + (t.kind || "")} role="status">
      …{t.act ? <button onClick={…}>{t.act.label}</button> : <span />}
```
`PrototipoNegocios.tsx:283-293`. O aviso leva ao sítio ("Ver a obra"). Na seleção guiada, o aviso com "Desfazer" (5 s) aparece por cima da barra de baixo, ao alcance do polegar (`SelecaoGuiada.tsx:198-209`); no mapa das ligações, "Anular" durante 7 s.

**C23. Confirmar antes do irreversível, no sítio, sem janela modal.**
```tsx
<div role="alertdialog" aria-label="Confirmar" className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4 animate-in fade-in-0">
  <p className="flex-1 text-[15px]">Marcar como perdido? Sai do quadro, mas fica no histórico.</p>
  <Button variant="outline" …>Cancelar</Button>
  <Button variant="destructive" …>Marcar como perdido</Button>
```
`NegocioSimples.tsx:116-120`. A pergunta diz a consequência; o botão repete o verbo (nunca "Sim"/"OK"). "Voltar à visita" diz o que fica e o que se refaz (README, "Voltar atrás e versões").

**C24. Mensagem de fase concluída: o que acabou e o que vem, e desaparece sozinha.**
`<span><b className="font-semibold">{FASES[acabou]} concluída.</b> Agora: {FASES[d.fase]}.</span>` com `role="status"`, 5 s (`NegocioSimples.tsx:40-52`, `:123-128`).

**C25. Estados vazios dizem quando aparece alguma coisa.**
Exemplos: "Ainda não há obras. Aparecem quando o cliente assina o contrato." (`ObraOperacoes.tsx:101`); "Ainda não há encomendas de cliente. Nascem quando o cliente assina o contrato." (`OperacoesSimples.tsx:211`); numa coluna vazia, um contorno tracejado com "Nenhum" (`NegociosSimples.tsx:51`); na pesquisa, "Nenhum produto com esse nome." (`CatalogoV1.tsx:165`).

**C26. Etiquetas de estado: pílula neutra com o estado em palavras.**
Exemplo: `<span className="rounded-full bg-muted px-2.5 py-0.5 text-sm text-muted-foreground">{estado}</span>` ("enviada", "aceite 14/10", `DocsCliente.tsx:686`); "Sugerido" com ícone (`CamposFase.tsx:391`). Sem cores vivas nas pílulas.

**C27. Passos de outro papel: diz de quem é e oferece a troca.**
*Porquê:* no protótipo, uma só pessoa experimenta todos os papéis; na app, cada um vê o seu.
```tsx
<p className={NOTA}>Este passo é de {PAPEIS[papel].n}.{" "}
  <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" …>Mudar para {…}</button></p>
```
`ObraOperacoes.tsx:36-42`; no caminho da obra, "Ver como …" (`CaminhoObra.tsx:97`). O papel ativo escolhe-se em "A ver como" no menu (`PrototipoNegocios.tsx:320-329`).

### 4.6 Documentos, portal e assinatura

**C28. Documentos numa folha branca, com a marca da empresa, número e data.**
```tsx
<article className="folha relative mx-auto w-full max-w-[760px] rounded-2xl border border-border bg-white p-6 text-[15px] text-slate-900 shadow-[0_8px_30px_rgb(16_24_40/0.08)] sm:p-10">
```
`DocsCliente.tsx:87-105`. A proposta formal usa páginas A4 de 794 × 1123 px, que crescem com o conteúdo no telemóvel (`Pagina`, `DocsCliente.tsx:162-175`), com cabeçalho, rodapé e "Página 2 de 4".

**C29. Partilhar um documento: o link à vista e as saídas lado a lado, todas secundárias.**
Exemplo: "Copiar link", "Email", "WhatsApp", "Abrir em ecrã inteiro" e "Imprimir ou PDF" são `outline` (`DocsCliente.tsx:690-696`). O leitor em ecrã inteiro abre por portal no `body` (para não ficar preso a um passo animado), com zoom de 60 % a 160 % e Escape para fechar (`:700-720`).

**C30. O portal do cliente: estilo `slate`, a marca no topo, o percurso e a barra fixa do próximo passo.**
```tsx
<div className="fixed inset-0 z-[90] overflow-y-auto bg-slate-100 text-slate-900 …" role="dialog" aria-modal="true" aria-label={`Portal do cliente: ${d.nome}`}>
…
<div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))] pt-3 backdrop-blur" role="region" aria-label="Próximo passo">
```
`PortalCliente.tsx:438`, `:547-551`. O percurso tem cinco passos com nomes curtos no telemóvel e longos a partir de `sm` (`:453-468`). Cada estado diz o que o cliente tem de fazer ou que "não precisa de fazer nada agora" (`:265`, `:286`). Os dados de pagamento copiam-se com um toque e "Copiado" para leitores de ecrã (`:56-75`).

**C31. Assinar: duas formas à escolha, e uma delas sem desenhar.**
*Porquê:* nem todos conseguem desenhar com o dedo; a Chave Móvel Digital é a alternativa acessível.
```ts
// Em ambas, a caixa "Li e aceito o contrato" é obrigatória. O desenho tem alternativa sem rato nem dedo: a digital.
```
`AssinaturaContrato.tsx:6`. A área de desenho diz a alternativa no `aria-label` (`:157`), só deixa assinar com traço suficiente e anuncia-o (`aria-live`, `:168`). O resultado é um selo com nome, data, hora e identificador (`SeloAssinatura`, `:43-50`).

---

## 5. Construção de um ecrã (receita)

Siga estes passos por esta ordem. O esqueleto no fim junta-os.

**R1. Comece pela pergunta "o que é que esta pessoa vem aqui fazer?".** A resposta é o primário. Se houver duas, são dois ecrãs, ou uma delas é secundária.

**R2. Cabeçalho.** Voltar (ligação com seta, `min-h-11`), título (`text-2xl sm:text-3xl` ou `text-3xl`), uma linha de contexto em `text-muted-foreground` com os números que importam ("8 abertos · 12.340,00 € em proposta", `NegociosSimples.tsx:62`). As ações raras do cabeçalho são ligações (`NegocioSimples.tsx:71-83`).

**R3. O que fazer agora.** Uma frase e, se for preciso, as condições. Se o passo é de outro papel, "Este passo é de …" e "Mudar para …" ([C27](#45-avisos-confirmações-e-estados)).

**R4. Conteúdo.** Uma coisa de cada vez. Perguntas em linhas (`py-4`), listas em blocos `divide-y`, nada de cartões dentro de cartões. A informação de leitura vai para baixo ou para o lado (a coluna "Cliente" só em `2xl`, `NegocioSimples.tsx:202`).

**R5. Próximo passo.** No fim, separado por `border-t`, com o primário ([C2](#41-botões)), ou fixo em baixo num passo guiado ([L10](#3-layout-e-responsivo)). Diga o que acontece a seguir ("Ir para \"Enviar a proposta\"", `NegocioSimples.tsx:427`).

**R6. Validação: não deixe avançar com falhas, mas leve a pessoa ao sítio.**
- O motor tem um portão por fase (`portao(d, grupos, extras)`), que preenche `d.valida` com o que falta (README, "Como funciona").
- O ecrã vai ao primeiro passo com falta e põe o cursor no primeiro campo inválido:
```tsx
useEffect(() => {
  if (S.pulse !== "falta") return;
  const i = passos.findIndex((x) => (x.falta || 0) > 0);
  if (i >= 0 && i !== ativo) setAtivo(i);
  setTimeout(() => (document.querySelector('[aria-invalid="true"]') as HTMLElement | null)?.focus(), 450);
});
```
`NegocioSimples.tsx:337-342`.
- O campo diz "Falta preencher" com ícone, ligado ao controlo por `aria-describedby`, e a linha ganha fundo vermelho a 5 % (`CamposFase.tsx:351-352`, `:386`, `:393`). O passo na lista mostra "faltam 2" (`NegocioSimples.tsx:280`).
- Nunca desative o primário sem dizer porquê. O V1 deixa tocar e mostra o que falta ("Verificar o orçamento" → "Ver o que falta resolver", `NegocioSimples.tsx:431-433`).

**R7. Dados vivos do motor.** O ecrã não calcula: pede ao motor. Os números vêm de funções puras (`tot`, `proximo`, `planoObra.ts`, `selecao.ts`…), testadas sem React. As ações correm dentro de `run(() => …)` ou `go(() => …)` (gravam e redesenham). Uma ação do portal é a mesma ação do motor, por isso o resto do protótipo reage (README, "Portal do cliente").

**R8. Sugestões, nunca escolhas por nós.** O motor pode sugerir (`derivar`, `sugerirPorFases`, `sugestaoTroca`), mas a sugestão fica marcada ("Sugerido", tracejado) até alguém a confirmar.

**Esqueleto de um ecrã do V1:**
```tsx
export function EcraNovo(ctx: Ctx) {
  const { S, A, go } = ctx;
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-8 sm:pt-10">
      {/* R2 cabeçalho */}
      <button type="button" onClick={go(() => A.nav("negocios"))}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg text-[15px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Negócios
      </button>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Título</h1>
      <p className="mt-1 text-base text-muted-foreground">Contexto · números que importam</p>

      {/* R3 o que fazer agora */}
      <section aria-label="O que fazer" className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)]">
        <p className="text-lg">Uma frase com o que falta.</p>
      </section>

      {/* R4 conteúdo: uma lista, não uma pilha de cartões */}
      <ul className="mt-6 divide-y divide-border rounded-2xl border border-border bg-card px-4 shadow-[var(--shadow-sm)] sm:px-5">
        <li className="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-1 py-3 sm:flex-nowrap sm:gap-4">
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium">Nome inteiro, nunca cortado</span>
            <span className="block text-[15px] text-muted-foreground">descrição curta</span>
          </span>
          <span className="flex basis-full flex-wrap items-baseline gap-x-3 sm:block sm:basis-auto sm:shrink-0 sm:text-right">
            <span className="block text-[15px] font-medium tabular-nums">1.234,50 €</span>
          </span>
        </li>
      </ul>

      {/* R5 próximo passo: um só primário */}
      <div className="mt-10 flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" size="lg">Anterior</Button>
        <Button size="lg" className="w-full sm:w-auto">Aprovar o plano</Button>
      </div>
    </div>
  );
}
```

---

## 6. Movimento

Tudo o que mexe vem de `movimento.tsx` (framer-motion) ou das classes `animate-in` do `tailwindcss-animate`.

**M1. Só se anima `transform` e `opacity`.**
*Porquê:* 60 fps no telemóvel; mudar larguras, cores de fundo ou bordas repinta.
Exemplo: o acento do cartão escolhido é uma camada que muda de `opacity` (`CartoesSelecao.tsx:19-26`); as barras de progresso enchem com `scaleX` (`movimento.tsx:133`).

**M2. As constantes do movimento.**

| Nome | Valor | Uso |
|---|---|---|
| `MOLA` | `spring, stiffness 560, damping 44, mass 0.9` (cerca de 300 ms) | passagem entre passos, layout, Gantt |
| `MOLA_CARTAO` | `spring, stiffness 700, damping 38` | o "press" e o realce dos cartões |
| `SAIDA` | `[0.22, 1, 0.36, 1]` | entradas e números (sai rápido, assenta devagar) |
| `FADE` | `0,1 s linear` | a única animação com movimento reduzido |
| `CASCATA` | `0,035 s` entre itens | entrada de listas |
| `ANIMAR_ATE` | `40` itens | acima disto, a lista entra sem animação |

`movimento.tsx:13-22`.

**M3. Avançar entra da direita, voltar entra da esquerda.**
*Porquê:* o movimento conta a direção.
```ts
entra: (dir: number) => ({ x: dir * 56, opacity: 0 }),
fica: { x: 0, opacity: 1, transition: { x: MOLA, opacity: { duration: 0.2, ease: SAIDA } } },
```
`movimento.tsx:31-38`. Nos passos simples do negócio, o mesmo com classes: `animate-in fade-in-0 slide-in-from-right-3 duration-300` (`NegocioSimples.tsx:387`).

**M4. Entradas curtas com `animate-in`: 150–500 ms.**
Exemplos: troca de ecrã `animate-in fade-in-0 duration-200` (`PrototipoNegocios.tsx:384`); mensagem de fase concluída `slide-in-from-top-2 duration-500` (`NegocioSimples.tsx:124`); erro `animate-in fade-in-0` (`CamposFase.tsx:393`); painel "Mais" `slide-in-from-bottom-4` (`PrototipoNegocios.tsx:391`).

**M5. Pequenos sinais em vez de efeitos grandes.**
- O visto que se desenha (`VistoDesenho`, `movimento.tsx:52-73`).
- O total que conta até ao valor novo, com um realce breve (`Contagem`, 380 ms, `:78-120`). É `aria-hidden`: o valor final vai para o leitor de ecrã à parte (`SelecaoGuiada.tsx:216`).
- O "press" a 0,97 (`CartoesSelecao.tsx:47`).
- O fundo do filtro ativo que desliza de um para o outro (`layoutId`, `CartoesSelecao.tsx:259-261`).
- A vibração: 10 ms ao ligar, 10-30-10 ms ao avançar sozinho, só onde existe (`movimento.tsx:168-171`).

**M6. Respeite `prefers-reduced-motion` sempre, com `useReduzir()`.**
```ts
export function useReduzir(): boolean {
  const r = useReducedMotion();
  return !!r || !!MotionGlobalConfig.skipAnimations;
}
```
`movimento.tsx:25-28`. Com ele: nada de deslizes, cascatas, contagens nem vibração; só um fade de 100 ms (`deslize(true)`, `:32`). Nos testes, `MotionGlobalConfig.skipAnimations` faz o mesmo.

**M7. Nenhuma animação bloqueia.**
*Porquê:* quem toca depressa não pode esperar pela animação.
Exemplos: o passo que sai fica inerte e escondido do leitor de ecrã enquanto desliza (`Saindo`, `SelecaoGuiada.tsx:231`); qualquer toque cancela o avanço automático (`onPointerDownCapture={cancelar}`, `:167`); listas com mais de 40 itens entram sem animação.

**M8. Listas reorganizam-se com `layout="position"`, só quando são curtas.**
`<motion.li layout={animar && !reduzir ? "position" : false} transition={MOLA} …>` (`CartoesSelecao.tsx:37`). O contentor que faz scroll leva `layoutScroll` para as medidas baterem (`PrototipoNegocios.tsx:373`).

**M9. Nada de animações em ciclo.**
*Porquê:* o "ping" a piscar era ruído (09/10). Ainda há um caso no V1, o passo "agora" do caminho da obra (`CaminhoObra.tsx:27`, `animate-ping` a 2 s): ver o [Anexo B](#anexo-b-exceções-e-dívidas-conhecidas).

---

## 7. Acessibilidade

**A1. Contraste AA com folga.**
Contas do tema `.calma` (README, "Movimento, preenchimento rápido…"): acento 7,7:1 sobre branco e 7,1:1 sobre o fundo; texto secundário 7,6:1 e 7,0:1; o pior caso (texto secundário sobre o acento a 10 %) 6,5:1. As barras do Gantt têm pelo menos 3:1 (gráfico). O token `--input` (contorno dos controlos) dá menos de 3:1 sobre branco: onde o contorno é a única pista, reforce (a página de Pessoas usa `hsl(220 10% 45%)`, cerca de 5:1).

**A2. Alvos de pelo menos 44 × 44 px.**
*Porquê:* o polegar e as luvas do estaleiro.
Exemplos: `min-h-11` em botões, chips, ligações e itens de menu (`CamposFase.tsx:411`, `PrototipoNegocios.tsx:303`, `NegocioSimples.tsx:58`); `h-11 w-11` no contador (`CamposFase.tsx:429`); `h-12` no "Seguinte" e no "Voltar" (`SelecaoGuiada.tsx:212`, `:221`). As ligações de texto também levam `min-h-11 inline-flex items-center`.

**A3. Foco sempre visível.**
```css
.calma :focus-visible{outline:2px solid hsl(var(--primary));outline-offset:2px}
.calma [tabindex="-1"]:focus{outline:none}
```
`prototipo.css:253`, `:270`. Nos componentes: `outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background` (`CartoesSelecao.tsx:45`); campos `focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25`. Nunca `outline-none` sem um `focus-visible:` a substituir.

**A4. O foco vai para o título quando o conteúdo muda.**
*Porquê:* o leitor de ecrã sabe onde está; quem usa o teclado não volta ao início.
```tsx
titulo.current?.focus({ preventScroll: true });
titulo.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
…
<h2 id="passo-titulo" ref={titulo} tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
```
`NegocioSimples.tsx:357-362`, `:396`. Ao fechar uma ficha ou um painel, o foco volta à linha que a abriu.

**A5. Estados com ARIA, não só com aspeto.**
- Escolhido: `aria-pressed` (escolhas, filtros, cartões).
- Atual: `aria-current="step"` (fases, passos), `aria-current="page"` (menu).
- Expandido: `aria-expanded` (tarefa do Gantt, "Mudar os números", "Mais").
- Inválido: `aria-invalid` + `aria-describedby` para a mensagem.
- Interruptor: `role="switch"` + `aria-checked`.
Exemplos em `CamposFase.tsx:409`, `NegocioSimples.tsx:94`, `PlanoObraOrcamento.tsx:246`, `PrototipoNegocios.tsx:347`.

**A6. Rótulos para tudo o que não tem texto.**
Exemplos: `aria-label="Menos"` / `"Mais"` no contador; `aria-label={`Copiar ${rotulo.toLowerCase()}`}` (`PortalCliente.tsx:67`); ícones dos dados do cliente com `aria-label="Telefone"` dentro de `<dt>` (`NegocioSimples.tsx:86`); o gráfico do custo com `role="img"` e uma frase com o essencial (`PlanoObraOrcamento.tsx:340`). Texto só para leitores de ecrã com `sr-only`: "(feito)", "(marque para avançar)", "Procurar".

**A7. Mudanças anunciadas com `aria-live` ou `role="status"`.**
Exemplos: o passo atual "Passo 3 de 7: …" (`SelecaoGuiada.tsx:170`); o total estimado (`:216`); o número de resultados (`CatalogoV1.tsx:144`); "Copiado" (`PortalCliente.tsx:73`); os avisos (`PrototipoNegocios.tsx:284-287`). Use `polite`; `role="alert"` só para erros de um formulário (`NegociosSimples.tsx:124`).

**A8. Diálogos e confirmações com o papel certo.**
Exemplos: confirmação no sítio `role="alertdialog"` (`NegocioSimples.tsx:116`); portal e leitor de documentos `role="dialog" aria-modal="true"` com nome, foco no "Fechar" e Escape (`PortalCliente.tsx:438`, `DocsCliente.tsx:704-716`).

**A9. Separadores (`tablist`) com setas, Home e End.**
```ts
/** Navegação de um tablist por setas, Home e End: escolhe o separador seguinte e passa-lhe o foco (o id do botão é `${prefixo}-${id}`). */
export function teclasTablist<T extends string>(e, i, ids, prefixo, escolher) { … }
```
`pecas.tsx:63-71`. Só o separador ativo tem `tabIndex={0}`; o painel leva `role="tabpanel"` e `aria-labelledby` (`CatalogoV1.tsx:338-346`, `:365-368`).

**A10. Tudo o que se arrasta também se faz com o teclado.**
Exemplo: cada barra do Gantt é um `role="slider"` com `aria-valuetext` em palavras ("2 dias, de seg, 19 out"); ← → mudam meio dia e Enter abre o detalhe, que tem − / + (`PlanoObraOrcamento.tsx:92`, `:258-262`, `:389-393`). A fila de filtros arrasta-se com o rato, mas cada filtro é um botão com Tab.

**A11. Uma alternativa para o que exige gesto fino.**
Exemplo: a assinatura desenhada tem a Chave Móvel Digital ([C31](#46-documentos-portal-e-assinatura)); o gesto de deslizar entre passos tem "Voltar" e "Seguinte"; o "Ouvir" lê o passo.

**A12. Listas e dados com a semântica certa.**
`<ol>` para sequências (fases, passos, prestações), `<ul>` para conjuntos, `<dl>/<dt>/<dd>` para pares rótulo-valor (`NegocioSimples.tsx:85-90`, `:204-209`), `<section aria-labelledby>` para regiões, `<nav aria-label>` para menus.

**A13. Língua e leitura.**
A voz do "Ouvir" usa `u.lang = "pt-PT"` (`NegocioSimples.tsx:247`); o documento impresso leva `lang="pt"` (`DocsCliente.tsx:662`). A leitura fácil (`.leitura`) segue a British Dyslexia Association: fundo creme, `zoom:1.1`, mais espaço entre letras e palavras, `line-height:1.7`, sem itálicos (`prototipo.css:273-283`).

**A14. A cor nunca é a única pista** ([F3](#21-cor)).

---

## 8. Escrita (microcopy)

**E1. Português de Portugal, sem anglicismos desnecessários.**
"Ecrã", "telemóvel", "partilhar", "guardar", "aviso", "transferência", "fatura". Nada de "dashboard" na interface do V1, nem "submit", "upload", "OK".

**E2. Frases curtas. Uma ideia por frase.**
Exemplo: "Escolha o passo que quer mudar. Ao fechar o levantamento, o orçamento refaz-se com o que mudou." (`NegocioSimples.tsx:143`).

**E3. Botões com verbo no infinitivo e o objeto: diz-se o que acontece.**
Exemplos reais: "Verificar o orçamento", "Ver o que falta resolver" (`NegocioSimples.tsx:432`), "Aprovar o plano", "Arrancar a obra", "Guardar o preço", "Aceitar a proposta", "Marcar como perdido", "Não mudar nada e voltar ao orçamento", "Começar a seg, 26 out" (`ObraOperacoes.tsx:229`). Evite "Sim", "OK", "Confirmar", "Submeter".

**E4. Diga o que acontece a seguir e se a pessoa tem de fazer alguma coisa.**
Exemplos: "Marcar como perdido? Sai do quadro, mas fica no histórico." (`NegocioSimples.tsx:117`); "Recebe-a aqui, neste mesmo link. Não precisa de fazer nada agora." (`PortalCliente.tsx:265`); "Trocar por …: livre nesses dias, mesmo custo por hora. A obra não atrasa." (`ObraOperacoes.tsx:249`).

**E5. Fale com o cliente por "você" implícito e com cortesia; com a equipa, direto.**
Portal: "Olá, Ana", "Diga-nos o que não está bem. Respondemos neste mesmo link." (`PortalCliente.tsx:202`). Interior: "Este passo é de Operações."

**E6. Sem jargão técnico para o cliente.**
O cliente vê "Como vai decorrer a obra", fases com datas, "Fornecido por si"; nunca custo, margem, receita, "€/h", nem o nome das tabelas. Uma só linha de entulho no orçamento do cliente (README, "Entulho").

**E7. Números: vírgula decimal, ponto nos milhares, € depois com espaço.**
```ts
export function eur(x: number): string {
  const s = (Math.round(x * 100) / 100).toFixed(2).split(".");
  return s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + s[1];
}
```
`motor.ts:591-594`. Escreve-se `` `${eur(x)} €` `` → "1.476,02 €". Percentagens com `pct` → "32,1%" (`motor.ts:595`). Medidas com `nfmt` → "16,5". Unidades depois do número com espaço ("16 m²", "1 un", "2 dias úteis").

**E8. Datas curtas e humanas.**
`dataCurta` → "seg, 19 out" (`planoObra.ts:86-91`); relativas quando ajudam ("há 2 dias", "Daqui a 1 semana"); por extenso só nos documentos. Contam-se dias úteis e diz-se que feriados se saltaram.

**E9. Plural certo, sempre por função.**
`plural(n, "serviço", "serviços")` → "1 serviço", "3 serviços" (`SelecaoGuiada.tsx:216`); "falta 1 resposta" / "faltam 2 respostas" (`NegocioSimples.tsx:230`); "1 produto" / "12 produtos" (`CatalogoV1.tsx:144`). Nunca "1 serviço(s)".

**E10. Títulos de passo como perguntas ou nomes curtos.**
"O cliente mantém a sanita?", "Escolhas do cliente", "Necessidades do cliente". Os nomes técnicos do motor têm um nome curto para a interface (`CURTO`, `NegocioSimples.tsx:27-31`).

**E11. O que é de exemplo diz-se.**
"Protótipo com dados de exemplo." (`PrototipoNegocios.tsx:356`); "Protótipo: a Chave Móvel Digital é simulada; qualquer código de 6 dígitos serve." (`AssinaturaContrato.tsx:211`).

**E12. Nada de datas nem preços inventados.**
Sem valor configurado, mostra-se o aviso e não o número (README, "Licença de via pública"). O que falta diz-se "a combinar" ou "a definir" (`PortalCliente.tsx:255`).

---

## 9. Qualidade e verificação

Antes de dar um ecrã por feito, passe por estas quatro verificações. A 15/10 apanharam todos os casos do [Anexo A](#anexo-a-antes-e-depois-1510).

**Q1. Auditoria das margens a 360, 390 e 1280 px.**
*O método:* um script Playwright (com `channel: "chrome"`) abre cada ecrã a cada largura e procura qualquer elemento cujo retângulo saia da janela, e qualquer `scrollWidth > clientWidth` no documento. Falha se encontrar algum e diz qual (texto, classe, largura a mais). A 15/10: 89 ecrãs a 360 e 390 px sem nada fora das margens (commit `f6f909f0`). Os scripts vivem fora do repositório (na pasta temporária da sessão); o que conta é o método.

**Q2. O robô que segue o botão principal.**
*O método:* um script percorre a app como um utilizador apressado. Em cada ecrã, toca no botão primário; se o passo é de outro papel, muda em "A ver como"; se aparece "Falta preencher", responde. Regista cada ecrã e para quando não há primário, ou quando o mesmo ecrã se repete (um beco sem saída). A 15/10 fez 62 ecrãs a 390 px, da lead nova à obra fechada, e encontrou seis becos e incómodos (commit `2d66facf`).
*O que prova:* que **P1** e **P2** se cumprem; se o robô não sabe o que tocar, uma pessoa também não.

**Q3. Testes de interface por papel e por nome acessível.**
*Porquê:* o teste encontra o que o leitor de ecrã encontra; se o teste não acha o botão pelo nome, falta-lhe o rótulo.
```ts
const seguinte = () => fireEvent.click(screen.getByRole("button", { name: /^Seguinte/ }));
const g = screen.getByRole("group", { name: /fornece materiais/i });
fireEvent.click(within(g).getByRole("button", { name: "Sim" }));
expect(within(g).getByRole("button", { name: "Sim" })).toHaveAttribute("aria-pressed", "true");
```
`selecao.test.tsx:246`, `:263-266`. Use `getByRole` e `within`; nunca seletores de classe nem `data-testid`, salvo num `canvas` (`data-testid="tela-assinatura"`). As contas vivem em funções puras com testes próprios (`planoObra.test.ts`, `selecao.test.tsx`…), e há testes com o catálogo inteiro (2.200 produtos).

**Q4. Tipos a zero erros no protótipo.**
```bash
npx vitest run src/pages/prototipo-negocios
npx tsc --noEmit -p tsconfig.app.json   # os do protótipo têm de ficar a zero
```
README, "Como correr".

**Q5. Ver no browser, a 1280 e a 390 px, com o movimento reduzido ligado e desligado.** Teste com o teclado (Tab, setas, Enter, Escape) pelo menos o primário e os controlos novos.

**Q6. Escreva no README o que mudou e porquê**, com as decisões tomadas sozinho para o Ruben validar.

---

## 10. Checklist de revisão de um ecrã

Copie para o PR:

```markdown
### Revisão do ecrã (guidelines V1)
- [ ] Um só botão primário à vista (P1); o resto é outline, ghost ou ligação
- [ ] O próximo passo está à vista no fim do ecrã ou na barra de baixo (P2)
- [ ] Sem <select> nativos nem "+" para juntar; escolhas em botões com aria-pressed (P5, C4, C8)
- [ ] Sem cartões dentro de cartões; listas com divide-y (F16, C12)
- [ ] Só tokens do tema .calma; cor só em ícones; estado também em texto (F1–F3)
- [ ] Texto a 15–16 px; nada abaixo de 14 px; números em tabular-nums (F9, F10)
- [ ] Alvos ≥ 44 px (min-h-11); foco visível em tudo o que se toca (A2, A3)
- [ ] 360 e 390 px: nada fora das margens; valores por baixo do nome; flex-wrap em vez de cortar; min-w-0 (L5–L7, Q1)
- [ ] Barra de baixo e elementos fixos com env(safe-area-inset-bottom) (L9, L10)
- [ ] "Falta preencher" com aria-invalid + aria-describedby, e o foco vai ao campo (R6)
- [ ] Mudanças anunciadas (aria-live / role="status"); avisos no máximo 2 (A7, C22)
- [ ] Ação irreversível com confirmação no sítio que diz a consequência (C23)
- [ ] Movimento só em transform/opacity e com useReduzir() (M1, M6)
- [ ] PT-PT, frases curtas, botões no infinitivo com objeto, "1.234,50 €", "seg, 19 out", plural certo (secção 8)
- [ ] Testes por papel e nome acessível; tsc a zero no protótipo (Q3, Q4)
- [ ] O robô do botão principal chega ao fim sem becos (Q2)
```

---

## Anexo A: Antes e depois (15/10)

Seis casos reais, corrigidos a 15/10/2026 depois das auditorias da [secção 9](#9-qualidade-e-verificação).

### Caso 1. As linhas do Catálogo espremidas → os valores por baixo do nome
**Antes:** os valores ficavam numa coluna à direita, também no telemóvel. A 360 px o nome do serviço ficava numa coluna de meia dúzia de letras, com quatro ou cinco linhas.
```tsx
<span className="shrink-0 text-right">…preço, custo, margem…</span>
```
**Depois:** abaixo de `sm` os valores ganham uma linha própria por baixo do nome, lado a lado, alinhados com o texto (`VALORES` e `pl-14 sm:pl-0`).
```tsx
const VALORES = "flex basis-full flex-wrap items-baseline gap-x-3 sm:block sm:basis-auto sm:shrink-0 sm:text-right";
<span className={cn(VALORES, "pl-14 sm:pl-0")}>…</span>
```
`CatalogoV1.tsx:31-33`, `:76`; commit `f6f909f0`. Regra: [L5](#3-layout-e-responsivo).

### Caso 2. As fases do plano em cartões sobrepostos → uma lista
**Antes:** quatro cartões com `min-w-[172px]` numa fila; na coluna estreita do orçamento sobrepunham-se ou obrigavam a deslizar para ler a fase 4.
```tsx
className={cn("relative min-w-[172px] snap-start overflow-hidden rounded-xl border bg-card p-3 pt-4 …", on ? "border-primary …" : …)}
```
**Depois:** uma lista `divide-y` num só bloco: o nome inteiro, a data, os dias e o custo à esquerda; o preço e a margem à direita. Tocar realça a fase (`aria-pressed`).
```tsx
<div role="group" aria-label="Fases da obra" className="divide-y divide-border rounded-2xl border border-border bg-card shadow-[var(--shadow-sm)]">
  <button type="button" aria-pressed={on} className={cn("flex w-full items-start gap-3 px-4 py-3 text-left …", on ? "bg-primary/[0.06]" : "hover:bg-muted/50")}>
```
`PlanoObraOrcamento.tsx:179-206`; commit `2c696a67`. O mesmo para as condições de pagamento (era `grid grid-cols-2 lg:grid-cols-4`, passou a lista). Regras: [F16](#23-espaço-raio-e-sombra), [C12](#43-listas-e-cartões).

### Caso 3. Os nomes cortados no Gantt → o nome por cima da barra
**Antes:** uma coluna fixa de nomes à esquerda (`sticky left-0`, largura `rotuloW`), com `truncate`: no telemóvel, "Revestimento de pa…".
```tsx
<span className="block truncate text-[15px] font-medium leading-tight" title={t.nome}>{t.nome}</span>
```
**Depois:** o nome, os dias e o custo numa linha por cima da barra, presa à esquerda ao deslizar a grelha; a grelha usa a largura toda.
```tsx
{/* o nome, os dias e o custo por cima da barra (parados ao deslizar a grelha): nunca cortados */}
<button … className="sticky left-4 flex min-h-8 items-center gap-2 …" style={{ width: linhaW }}>
  <span className="min-w-0 flex-1 text-[15px] font-medium leading-snug">{t.nome}</span>
```
`PlanoObraOrcamento.tsx:244-253`; commit `2c696a67`. Regras: [L7](#3-layout-e-responsivo), [L12](#3-layout-e-responsivo).

### Caso 4. "Copiar link" primário → secundário
**Antes:** no bloco "Partilhar", o "Copiar link" era `variant="default"`, e o passo já tinha o seu primário ("Enviar a proposta"): dois primários no mesmo ecrã.
```tsx
<Button size="sm" variant={copiado ? "secondary" : "default"} onClick={copiar}>…Copiar link</Button>
```
**Depois:**
```tsx
<Button size="sm" variant={copiado ? "secondary" : "outline"} onClick={copiar}>…Copiar link</Button>
```
`DocsCliente.tsx:690`; commit `2d66facf`. Regra: [P1](#1-princípios). O robô do botão principal tocava no "Copiar link" em vez de avançar.

### Caso 5. Avisos empilhados → no máximo dois
**Antes:** todos os avisos ficavam à vista. Assinar o contrato dispara uma cadeia (contrato, encomenda, plano, fatura…) e dava seis avisos, que tapavam o ecrã do telemóvel.
```tsx
{toasts.map((t) => (
```
**Depois:** só os dois mais recentes.
```tsx
{/* no máximo dois avisos à vista (os mais recentes) … */}
{toasts.slice(-2).map((t) => (
```
`PrototipoNegocios.tsx:285-286`; commit `2d66facf`. Regra: [C22](#45-avisos-confirmações-e-estados).

### Caso 6. "Feita" igual às outras opções → "Feita" tracejado
**Antes:** no estado da visita, "Marcada · Feita · Cancelada" pareciam iguais; quem chegava não sabia que era o "Feita" que fazia avançar o negócio.
```tsx
ligado(x) ? "border-primary bg-primary text-primary-foreground" : cn("bg-card text-foreground hover:border-foreground/40", …)
```
**Depois:** a opção que faz avançar leva contorno tracejado do acento enquanto não está escolhida, e "(marque para avançar)" para leitores de ecrã.
```tsx
: x === avanca ? "border-2 border-dashed border-primary bg-primary/[0.04] font-medium text-primary hover:bg-primary/10"
{x === avanca && !ligado(x) && <span className="sr-only"> (marque para avançar)</span>}
```
`CamposFase.tsx:413-418` (a opção marca-se com `avanca` no campo, em `campos.ts`); commit `2c696a67`. Regra: [C5](#42-escolhas-e-campos).

---

## Anexo B: Exceções e dívidas conhecidas

O V1 ainda tem alguns sítios que não cumprem estas regras. Ficam aqui para não se copiarem e para se resolverem na migração.

| Onde | O quê | Regra | O que fazer |
|---|---|---|---|
| `PrototipoNegocios.tsx:320-329`, `:367-370` | "A ver como" é um `<select>` nativo | C8 | É uma ferramenta do protótipo (na app, cada pessoa tem o seu papel). Se ficar, passa a `Segmentos` ou `SeletorPesquisa`. |
| `CatalogoV1.tsx:142` (`Escolha` de `v2/pecasCustos.tsx:29-34`) | O filtro "Ofício" dos produtos é um `<select>` nativo | C8 | Trocar por `FiltrosFila` ou `SeletorPesquisa`. |
| `PlanoObraOrcamento.tsx:223` | Dia da semana no Gantt a `text-[11px]` | F9 | Aceite por falta de espaço numa coluna de 48 px; o número do dia está a 14 px. |
| `DocsCliente.tsx:173` | Rodapé da página A4 a `text-[11px]` | F9 | Aceite: é papel impresso. |
| `ObraOperacoes.tsx:44` | Iniciais no avatar a `text-[11px]` | F9 | Decorativo (`aria-hidden`); o nome está ao lado. |
| `DocsCliente.tsx:690` | "Copiar link" com `size="sm"` (36 px) | A2 | Subir para `min-h-11` na migração. |
| `PortalCliente.tsx:68` | Botões de copiar com 36 px (`h-9 w-9`) | A2 | Subir para `h-11 w-11`. |
| `CaminhoObra.tsx:97` | "Ver como …" com `min-h-10` (40 px) | A2 | Subir para `min-h-11`. |
| `CaminhoObra.tsx:27` | O passo "agora" pulsa em ciclo (`animate-ping`), também com movimento reduzido | M6, M9 | Pôr `motion-safe:` ou trocar por um realce fixo (anel do acento). |
| `src/index.css` | O tema global ainda é o roxo e rosa antigo, com gradientes | F1 | Na migração, os valores de `.calma` passam a ser os de `:root`. |
| `NegocioSimples.tsx`, cabeçalho | No telemóvel, o cabeçalho do negócio ocupa cerca de 300 px antes do passo | P3 | Compactar (por fazer, nota de 15/10). |

---

## Anexo C: Referência rápida de classes

| Peça | Classes |
|---|---|
| Página | `mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-8 sm:pt-10` |
| Título da página | `text-3xl font-semibold tracking-tight` |
| Subtítulo | `mt-1 text-base text-muted-foreground` |
| Bloco | `rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)] sm:p-6` |
| Lista | `divide-y divide-border rounded-2xl border border-border bg-card px-4 shadow-[var(--shadow-sm)] sm:px-5` |
| Linha de lista | `flex min-h-16 flex-wrap items-center gap-x-3 gap-y-1 py-3 sm:flex-nowrap sm:gap-4` |
| Valores da linha | `flex basis-full flex-wrap items-baseline gap-x-3 sm:block sm:basis-auto sm:shrink-0 sm:text-right` |
| Texto corrente | `text-[15px]` |
| Nota | `text-[15px] text-muted-foreground` ou `text-sm text-muted-foreground` |
| Campo | `h-11 w-full rounded-lg border border-input bg-card px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25` |
| Escolha (desligada) | `min-h-11 min-w-14 rounded-lg border border-input bg-card px-4 text-[15px] hover:border-foreground/40` |
| Escolha (ligada) | `border-primary bg-primary text-primary-foreground` |
| Escolha que faz avançar | `border-2 border-dashed border-primary bg-primary/[0.04] font-medium text-primary` |
| Filtro | `inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-[15px]` |
| Fila que desliza | `-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,#000_calc(100%-2rem),transparent)]` |
| Ligação | `inline-flex min-h-11 items-center text-[15px] font-medium text-primary underline-offset-4 hover:underline` |
| Foco | `outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background` |
| Aviso de sucesso | `rounded-xl border border-success/30 bg-success/[0.08] px-4 py-3 text-[15px]` |
| Aviso de atenção | `rounded-xl border border-warning/40 bg-warning/[0.06] p-4` |
| Rodapé do passo | `mt-10 flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between` |
| Barra fixa de baixo | `sticky bottom-0 z-20 -mx-4 border-t border-border/70 bg-background/80 px-4 py-3 backdrop-blur-md md:mx-0 md:px-0` |
| Área segura | `pb-[env(safe-area-inset-bottom)]`, `pb-[calc(4rem_+_env(safe-area-inset-bottom))]` |
