# O que fazer, e por que ordem

> Escrito a 9 de setembro de 2026, para o trabalho arrancar a 10.
> Cada etapa traz **o que já existe** (verificado, não suposto), **o que falta** e
> **o que custa**. As etapas estão por ordem de dependência, não de importância.

---

## Antes de abrir o editor

Duas coisas que não são código e que, se forem ignoradas, custam mais tarde do que
custam agora.

### 1. Falar com o Rafael sobre o `feature/inventario` ⚠

São **70 commits dele**, ainda fora do `main`, e tocam nos dois ficheiros que este
trabalho vai reescrever:

```
src/components/QuoteBuilder.tsx          |  30 ++++-
src/components/quote/AddItemsDialog.tsx  | 221 +++++++++++++++++++++++++++---
```

O `QuoteBuilder.tsx` tem 4 799 linhas. Começar o Orçamento V2 antes de este ramo
entrar é garantir um conflito grande no pior ficheiro possível.

Ele voltou de férias hoje e, na reunião, disse que queria marcar uma reunião com o
Ruben e o Miguel para mostrar este módulo — ainda não o mostrou ao Ricardo
(transcrição, 10:28 → 10:40). **Essa reunião é o sítio para decidir a ordem de
integração**, e é hoje ou amanhã.

### 2. Fechar a dívida das migrações órfãs — barato, e ninguém sabe que dá

O `main` tem quatro migrações substituídas por marcadores vazios que dizem que o
SQL «não existe neste repositório (…) nunca foi commitado, **em ramo nenhum**» e
que isso é «dívida por fechar, não um estado aceitável».

**O SQL existe.** Está no `feature/inventario`, commitado pelo Rafael no mesmo dia
em que o marcador foi escrito. A correspondência de timestamps está em
[`o-que-ja-existe.md § 6a`](o-que-ja-existe.md#6a-o-sql-perdido-do-main-não-está-perdido--está-no-ramo-do-rafael).

Falta confirmar que o SQL do ramo é o que está mesmo aplicado na base remota — não
tenho acesso à base para o verificar. **Confirmar e commitar fecha a dívida.**
Custo: minutos, mais a confirmação de quem tiver acesso ao Supabase.

Isto não é do Orçamento V2. Mas é o Orçamento V2 que depende dessas funções, e foi
a preparar este trabalho que se descobriu.

### 3. Não começar no ramo atual

A pasta está em `feature/operacoes`, **220 commits atrás do `main`**. O Orçamento
V2 sai de `main` atualizado, depois de o `feature/inventario` entrar.

---

## E0 — Os rácios reais ⚠ **bloqueante**

**Prioridade: a mais alta. Sem isto, E3 não tem o que testar.**

Não podemos inventar estes números, e neste momento estamos a trabalhar com uma
suposição: os únicos valores que existem são os das notas do Rafael durante a
chamada com o Ricardo — *35 sacos para uma casa de banho completa*, *saco de 20 kg*
— e **não sabemos a que área correspondem esses 35 sacos**. O exemplo trabalhado no
[`desenho.md`](desenho.md) assume 10 m², e essa suposição é dele, não do Ricardo.

O Rafael disse na reunião que ainda não tinha falado disto com ele (04:00).

Do lado da Mudelar, é preciso:

| O que | Porquê |
|---|---|
| Os campos exatos da fase 1 | define o template de levantamento |
| A lista de cenários | «casa de banho completa», «só troca de banheira», … |
| O rácio de cada cenário, **e a que medida se refere** | é o que o motor calcula |
| Confirmar que os materiais existem no catálogo, **como produtos, com fornecedor preferencial** | senão a cadeia de compras salta-os em silêncio — ver [`desenho.md § contrato com as compras`](desenho.md#o-contrato-com-as-compras) |

**Entrega:** uma folha de rácios validada pelo Ricardo **e por quem faz as obras**.
A última linha da tabela é verificação de dados no sistema, não uma pergunta — e é
a que mais provavelmente falha sem ninguém dar por isso.

---

## E1 — Fases configuráveis

| | |
|---|---|
| **O que já existe** | secções por texto livre em `quote_lines.section_name`, desenhadas em `QuoteBuilder.tsx:3891`, com subtotal e margem por secção — o desenho aproveita-se |
| **O que falta** | `quote_phases` com RLS, ecrã de administração para criar e ordenar, e o construtor a ler fases em vez de texto |
| **Custo** | médio. O risco não é a tabela, é o `QuoteBuilder.tsx` |
| **Cuidado** | `phase_id` entra **a par** de `section_name`, sem a remover. O literal `"Geral"` aparece em 10 sítios do ficheiro |

**Entrega:** um orçamento da Mudelar mostra as quatro fases pela ordem certa, e um
orçamento antigo continua a abrir.

---

## E2 — Levantamento obrigatório e bloqueio

| | |
|---|---|
| **O que já existe** | **quase tudo.** Templates por organização com campos tipados (`NeedsAssessmentConfig.tsx`), valores em `deal_needs.measurement_values`, ecrã de preenchimento (`DealNeedsSection.tsx`), e `quotes.deal_id` para herdar o que já foi levantado no negócio |
| **O que falta** | ligar template ↔ fase, mostrar o formulário **dentro do orçamento**, validar obrigatórios, bloquear a fase seguinte |
| **Custo** | baixo a médio — é sobretudo ligação, não construção |

**Entrega:** R2 e R3 a funcionar.

---

## E3 — Motor de rácios ← **o núcleo**

| | |
|---|---|
| **O que já existe** | nada de rácios. Existe um editor de regras e escalões de preço por dimensão em `configurator-lab/` (2 938 linhas) que **vale a pena ler antes de escrever isto** |
| **O que falta** | `quote_scenarios` + `quote_ratio_rules`, o avaliador, o ecrã de configuração com pré-visualização, e testes sobre os rácios de E0 |
| **Custo** | o maior das cinco etapas |

Por ordem:

1. Avaliar se a gramática do `RulesEditor.tsx` se reaproveita. Meia hora que pode
   poupar dias — ou confirmar que não serve.
2. Tabelas de cenários e regras.
3. Avaliador, com gramática **fechada**. Nunca `eval`.
4. Ecrã de configuração **com pré-visualização**: meto 10 m², vejo o que sai. Sem
   isto, quem configura só descobre o erro num orçamento real.
5. Testes com os rácios de E0.

**Entrega:** configurar um cenário novo sem tocar em código.

**Critério de aceitação do R8:** montar um cenário de outro sector — uma oficina,
por exemplo — sem editar uma linha de código. Se não der, ficámos presos à Mudelar
e é exatamente o que o Rafael pediu para não acontecer.

---

## E4 — Gerar as linhas no orçamento

| | |
|---|---|
| **O que já existe** | o construtor de orçamentos e a estrutura de linhas |
| **O que falta** | botão de calcular na fase, linhas marcadas como automáticas, rasto visível, edição por cima, e aviso antes de um recálculo substituir edições manuais |
| **Custo** | médio |

**As quatro regras da cadeia de compras aplicam-se aqui**, e são critério de
aceitação, não sugestão: produto e não serviço para o que se compra, quantidade
inteira, quantidade positiva, fornecedor preferencial. As três primeiras falham em
silêncio. Ver [`desenho.md § contrato com as compras`](desenho.md#o-contrato-com-as-compras).

**Entrega:** R4, R5 e R6 a funcionar.

**Teste que fecha a etapa, de ponta a ponta:** preencher a fase 1 com 10 m² →
gerar as linhas → aceitar a proposta / assinar o contrato → **confirmar que a
encomenda ao fornecedor aparece em rascunho com os 35 sacos**. Se aparecer, as duas
metades encaixaram. É este o teste que prova que o Orçamento V2 alimenta bem o que
o Rafael já construiu.

---

## E5 — Passagem a operações

| | |
|---|---|
| **O que já existe** | a cadeia orçamento → proposta → contrato, e a de compras/stock a jusante |
| **O que falta** | as fases e o levantamento acompanharem o orçamento até à proposta, ao contrato e à ordem de trabalho, e saírem no PDF |
| **Custo** | médio |

**Entrega:** R7. É esta etapa que fecha o problema de origem — operações deixa de
refazer o levantamento (transcrição, 06:00).

---

## Fora de âmbito, de propósito

- **Fases 2, 3 e 4.** O Ricardo pediu só a 1 (06:12). Entram depois de a fase 1
  estar a ser usada a sério e de sabermos o que falhou.
- **Cálculo automático de mão de obra em horas.** Não foi pedido.
- **Produzir internamente.** Não existe no modelo e não foi pedido — ver Q6.

---

## As decisões

Cinco perguntas fechadas antes de E1, mais uma que só afeta o futuro. Cada uma tem
uma recomendação, para a conversa começar de algum lado em vez de começar do zero.

### Q1 — Quais são os rácios reais, e a que medida se referem? ⚠
**Quem:** Ricardo, e quem faz as obras.
Sem isto, E3 não tem o que testar e o exemplo do `desenho.md` continua a assentar
numa suposição nossa. **É o bloqueante.**

### Q2 — O bloqueio da fase seguinte impede mesmo, ou só avisa?
**Quem:** Ricardo.
**Recomendação:** impedir, com possibilidade de o administrador desligar por
organização. As notas dizem «só passas à fase 2 depois de concluir a fase 1», mas
um bloqueio duro sem escape trava o comercial no primeiro dia mau e a ferramenta
deixa de ser usada.

### Q3 — As fases aplicam-se a todos os orçamentos, ou só a alguns tipos de trabalho?
**Quem:** Ricardo, Rafael.
**Recomendação:** por tipo de trabalho. Obrigar um orçamento de manutenção simples
a passar por quatro fases é a maneira mais rápida de os comerciais deixarem de usar
o sistema. O modelo já tem por onde pegar: os templates de levantamento têm
`sector`.

### Q4 — O levantamento vive no negócio ou no orçamento?
**Quem:** Ruben, Rafael, Miguel.
**Recomendação:** no orçamento, herdando do negócio quando existe. Um negócio pode
gerar vários orçamentos com âmbitos diferentes, e hoje o levantamento está preso ao
negócio (`deal_needs`).

### Q5 — Quem pode editar uma linha gerada automaticamente?
**Quem:** Ricardo.
**Recomendação:** deixar editar, marcar a linha como alterada e guardar o valor
original. Tem impacto na margem e no que operações recebe.

### Q6 — A Mudelar produz alguma coisa internamente?
**Quem:** Ricardo.
Não urgente. Mas o modelo de inventário só sabe **comprar** ou **dar baixa de
stock** — não há ordem de fabrico nem lista de materiais em lado nenhum. Se houver
produção interna, é um módulo por desenhar, não um campo por acrescentar.

---

## Riscos

### Ficar preso à Mudelar ⚠
O caminho fácil é cravar «sacos de entulho» em código e entregar numa semana.
**Mitigação:** nenhum termo de construção civil sai da configuração; o critério de
aceitação de E3 é montar um cenário de outro sector sem tocar no código.

### O material ser orçamentado e nunca comprado ⚠
Uma quantidade partida, um serviço onde devia estar um produto, ou um produto sem
fornecedor preferencial — e a linha é saltada **sem erro à vista**, só com um
registo em `workflow_execution_log`. **Mitigação:** as quatro regras são critério
de aceitação de E4, e o teste de ponta a ponta dessa etapa verifica a encomenda ao
fornecedor, não só o orçamento.

### O comercial não ter a medida no momento do orçamento
Perguntei isto na reunião e o Rafael respondeu que sim, porque fazem visita ao
cliente (04:54) — mas na demonstração vimos leads com visita agendada em que ainda
não se sabia o que o cliente queria (05:23). **Mitigação:** permitir guardar em
rascunho com a fase incompleta; o bloqueio aplica-se ao **envio**, não à gravação.

### O `QuoteBuilder.tsx` já tem 4 799 linhas
Mexer nas secções toca em gravação, rascunho automático, PDF e duplicação — e o
`feature/inventario` mexe no mesmo ficheiro. **Mitigação:** integrar o
`feature/inventario` primeiro; `phase_id` entra a par de `section_name` sem a
remover.

### Rácios errados saírem para o cliente
Um rácio mal configurado gera um orçamento errado em silêncio. **Mitigação:** o
rasto do cálculo é sempre visível na linha, e a pré-visualização de E3 obriga quem
configura a ver o resultado antes de gravar.
