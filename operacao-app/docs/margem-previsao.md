# Margem em tempo real e fim provável ("e se…")

> Feito a 06/10/2026, no ramo `feat/ops-margem-previsao`. SQL em
> [`db/margem-previsao.sql`](../db/margem-previsao.sql) — corre **depois** de
> `db/obras.sql`, é idempotente, e só lê o CRM.
> Validação: `npm run validar-margem-previsao` (PGlite, 29 verificações).

## O que se vê

**Ficha da obra** (só quem tem `operations.costs.view` — na prática admin e
gestor da organização; técnico e supervisor não veem nada, nem o semáforo):

- bloco **Margem projetada** com o semáforo, a margem **na venda**, **a esta
  data** e o **limiar**; "Ver as contas" abre o detalhe (vendido, extras,
  materiais, mão de obra prevista/real/que falta, custo projetado) e diz de
  onde veio o ritmo e o custo/hora. O gestor muda o limiar ali;
- por baixo do "Fim previsto" do cabeçalho: **Fim provável DD/MM · até DD/MM
  (P80)** — para toda a gente que vê a obra;
- separador **E se…?**: ritmo (planeado / provável / pessimista), adiar o
  início N dias úteis, +1 pessoa numa especialidade, uma tarefa +N %. Mostra o
  fim com o cenário, a diferença para o plano, as tarefas que mudam e o Gantt
  com o cenário em barras e o plano atual em sombra. **Não grava nada.**

**Lista das Obras:** um ponto do semáforo com a margem projetada ao lado do
estado (uma só chamada, em segundo plano — a lista não espera por ela).

**Sino do CRM:** "OB-…: margem projetada 12,0 % (abaixo de 20 %)" aos
admin/gestor, para obras **em curso** abaixo do limiar. Um aviso por obra;
volta a "por ler" se piorar (amarelo → vermelho); resolve-se sozinho quando
recupera. `pg_cron` de hora a hora (`ops-obras-margem`).

## As contas

| | Como se calcula |
|---|---|
| Vendido | `quotes.subtotal × (1 − desconto global) + taxas`, sem IVA. Sem subtotal: soma das linhas; último recurso: `total` (avisado no ecrã, pode trazer IVA). |
| Extras | `ops_obra_extra` aprovados ou enviados (`valor_estimado`). Os registados não contam. |
| Mão de obra orçada | Linhas de serviço (`service_id`) ou de categoria "Mão de Obra" (o CRM real põe o custo na coluna de material), mais `custo_mao_obra_unit`. |
| Materiais | O resto do custo das linhas. Conta pelo orçamento (não há custo real de material nas obras). |
| Custo/hora | O do perfil de quem trabalhou; sem ele, o implícito no orçamento (mão de obra orçada ÷ horas previstas); sem orçamento, a média da equipa; sem nada, o padrão da organização (20 €/h). |
| Ritmo | real ÷ previsto das tarefas feitas desta obra (≥ 1 h); senão o histórico da organização (P50, ≥ 5 tarefas); senão 1. Entre 0,5× e 3×. |
| Na venda | vendido − (materiais + mão de obra orçada). |
| A esta data | vendido × progresso − (mão de obra real + materiais × progresso). Progresso = minutos previstos das tarefas feitas ÷ todos. |
| Projetada | vendido − (materiais + mão de obra real + o que falta × ritmo). |
| Semáforo | verde ≥ limiar · amarelo ≥ metade · vermelho abaixo. |

**Em produção a 06/10/2026:** nenhum perfil da Mudelar tem custo/hora, por
isso conta o custo/hora implícito no orçamento. As obras de demonstração
(`OB-DEMO-*`) não têm orçamento: mostram "sem valor vendido".

## O fim provável

`rpc_ops_obra_previsao` devolve P50/P80 e os dias úteis (com feriados):

- **P50** = o ritmo desta obra; sem ele, o histórico (≥ 5 tarefas
  terminadas); sem nada, 1×.
- **P80** = P50 × (P80 ÷ P50 do histórico); sem histórico, +20 %.
- Por especialidade, quando há ≥ 5 tarefas dela no histórico e a obra ainda
  não tem ritmo próprio.

A conta das datas é `src/domain/previsao.ts` (testada): feitas ficam; em
curso continuam hoje com o que falta; por fazer sem dependências não começam
antes do planeado (+ adiar); com dependências andam com elas, para a frente e
para trás, guardando a folga que tinham no plano. Ao ritmo 1× e sem cenário,
devolve o próprio plano.

## Limitações

- O histórico real ainda é pequeno: até haver tarefas validadas, o P80 é um
  +20 % convencionado (dito no ecrã).
- A simulação não volta a ver a capacidade da equipa (quem está livre); para
  isso, "Replanear datas".
- Materiais contam pelo custo orçado.
- O aviso no sino vai a admin/gestor por função em Operações; a permissão do
  CRM (`operations.costs.view`) é a mesma que o `ops_pode` já exige a essas
  funções.
