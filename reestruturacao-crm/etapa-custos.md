# CRM — Área de custos e margem mínima por linha

> **Estado:** feita e validada em PGlite. **O SQL não foi aplicado em produção.**
> Ramo: `feat/lote2-financeiro-custos-area` (a partir de `871d538f`).
> Feita a 13/10/2026.
>
> Aplica a decisão do Ruben de 13/10: **margem mínima por linha de serviço**.
> Abaixo do mínimo, a proposta espera pela aprovação da Direção. Abaixo do
> custo, bloqueia sempre.

---

## O que muda para quem usa

### 1. Página **Custos** (`/custos`)

Entrada nova no menu, em Serviços: **Custos** (permissão `costs.view`).
Tem seis secções, com âncoras no topo:

- **Parâmetros**: meses de salário, TSU, encargos, subsídio de alimentação,
  horas produtivas (de um técnico e da empresa), se a estrutura soma ao custo,
  quando um preço fica desatualizado, e a margem mínima e alvo gerais.
  Começa com os valores do método BMG (14 meses, TSU 23,75%, encargos 7,5%,
  6,15 €×22 dias, 173,33 h/mês, mínimo 28%, alvo 35%).
- **Perfis**: as categorias de quem faz o trabalho. O custo/hora sai do salário
  e dos parâmetros, ou escreve-se à mão (subempreiteiro). **O salário só
  aparece a quem tem `costs.salaries.view`**; os outros veem só o custo/hora.
- **Equipamentos**: €/h = (compra − residual) ÷ vida útil + manutenção ÷ uso.
- **Estrutura**: renda, viaturas, pessoal não operacional… €/h = total ativo ÷
  horas produtivas da empresa.
- **Margens por linha**: mínima e alvo por categoria de serviço. Sem valor
  próprio, herda da linha-mãe e, no fim, da geral. Daqui abre-se a receita de
  cada serviço. Só a Direção (`margins.approve`) muda as margens.
- **Aprovações**: os pedidos dos comerciais, com a margem, o mínimo, o motivo
  e os alertas. A Direção aprova ou recusa (recusar pede motivo). O número de
  pendentes aparece na âncora.

### 2. Receita do serviço (`/custos/servicos/:id`)

A medida (m², pt, un…) e, por medida: horas de cada perfil, horas de cada
equipamento e consumíveis (quantidade × preço). Em cima, o custo por medida, o
preço de tabela (`service_prices` retail em vigor), a margem contra o mínimo da
linha, o preço para a margem alvo e os avisos:
- perfil sem custo/hora (usa a média dos perfis);
- preço de consumível com mais de N meses;
- consumível sem preço;
- serviço sem receita (custo desconhecido).

### 3. Funções

A categoria **Custos e margens** passa a aparecer no ecrã de Funções, com as
quatro permissões novas. É aí que se escolhe quem é a Direção.

---

## Como colar o SQL (por esta ordem)

Um só ficheiro, colado inteiro no **Supabase SQL Editor**:

1. `supabase/migrations/20261214110000_area_custos.sql`

Notas:
- Não depende da migração do Financeiro (`20261214100000_…`). Se forem as duas
  no mesmo dia, colar primeiro a do Financeiro (é a ordem dos nomes), mas
  qualquer ordem funciona.
- Pode correr-se mais de uma vez: não duplica nada nem apaga dados
  (validado com 3 corridas, a última já com dados).
- Precisa de ser corrido como dono das tabelas (o SQL Editor é): desliga por
  momentos os gatilhos de `anew_role_permissions` para dar as permissões aos
  papéis de sistema, e volta a ligá-los no fim.
- Só lê `services`, `service_categories`, `service_prices`, `catalog_items`,
  `quotes` e `quote_lines`. Não altera nenhuma tabela que já existe.

Verificação depois de colar:

```sql
-- 4 permissões novas
SELECT code FROM anew_permissions WHERE category = 'costs' ORDER BY code;
-- quem ficou com margins.approve (é a "Direção" provisória)
SELECT r.name, o.name AS organizacao
FROM anew_role_permissions rp
JOIN anew_roles r ON r.id = rp.role_id
LEFT JOIN anew_organizations o ON o.id = r.organization_id
WHERE rp.permission_code = 'margins.approve' ORDER BY 2, 1;
```

Validador local (não toca na base real):

```
cd operacao-app && npm ci && cd ..
node tools/validar-custos-crm.mjs
```

---

## Permissões (PROVISÓRIAS — falta o Ruben dizer quem é a Direção)

| Permissão | Para que serve | Quem recebe ao colar o SQL |
|---|---|---|
| `costs.view` | abrir `/custos` e as receitas | papéis com `services.view_cost`, `quotes.view_costs` ou `roles.edit` |
| `costs.edit` | mudar parâmetros, perfis (sem salário), equipamentos, estrutura e receitas | papéis com `services.manage_prices` ou `roles.edit` |
| `costs.salaries.view` | ver e mudar salários | papéis com `roles.edit` |
| `margins.approve` | aprovar/recusar margens abaixo do mínimo; mudar as margens (gerais e por linha) | papéis com `roles.edit` |

**A regra provisória é "Direção = quem administra funções (`roles.edit`)",
incluindo os papéis de sistema.** Quando o Ruben disser quem é a Direção em cada
empresa, ajusta-se no ecrã de Funções (sem SQL).

---

## Riscos e limites

- **Quem tem `roles.edit` passa a ver salários e a aprovar margens.** Se algum
  papel com `roles.edit` não for da Direção, tirar-lhe `costs.salaries.view` e
  `margins.approve` em Funções logo a seguir.
- **A margem só conta linhas com custo.** Uma linha com preço e sem custo
  (`custo_material_unit + custo_mao_obra_unit`, ou `cost_price`) dá o aviso
  "custo desconhecido" mas **não bloqueia**. Os orçamentos antigos sem custos
  passam como "ok". Bloquear linhas sem custo é uma decisão em aberto.
- O custo da linha é o que está gravado no orçamento, não o da receita no
  momento da verificação. A receita entra nos avisos (perfil sem custo/hora,
  preços desatualizados). Copiar o custo da receita para a linha quando se
  junta um serviço ao orçamento fica para o construtor de orçamentos.
- A receita da linha é `total_sem_iva × (1 − desconto global)`. As taxas de
  serviço (`total_fees`) não entram.
- A margem total também se verifica contra a mínima geral, mas só quando
  nenhuma linha já pede aprovação nem bloqueia.
- Uma aprovação vale para a margem aprovada: se o preço descer ou o desconto
  subir depois, o estado volta a "precisa de aprovação". Um pedido novo anula o
  pendente anterior.
- Os avisos para o sino (pedido → Direção; decisão → quem pediu) vão para
  `notifications`. Se essa escrita falhar, o pedido fica gravado na mesma (sem
  aviso).
- As tabelas novas ainda não estão em `src/integrations/supabase/types.ts`
  (o código usa um cast em `src/hooks/custos/useCustos.ts`). Regenerar os tipos
  depois de colar o SQL e tirar o cast.
- Ainda não ligado: escolher o consumível a partir do catálogo
  (`catalog_item_id` já existe na tabela e na conta; falta o seletor no ecrã).

---

## O que o Rafael tem de ligar no "Enviar proposta"

O SQL já está pronto; falta o botão chamar as RPCs. Tipos e uma ajuda em
`src/lib/custos/verificarMargem.ts` (`VerificacaoMargem`, `acaoEnvio`) e as
chamadas em `custosApi.verificarMargem` / `custosApi.pedirAprovacao`
(`src/hooks/custos/useCustos.ts`).

1. Antes de enviar, chamar `rpc_margem_verificar(p_quote_id)`.
2. Se `pode_enviar` for **true** (`estado` = `ok` ou `aprovado`): enviar como
   hoje.
3. Se `pode_enviar` for **false**, mostrar os `alertas` (cada um tem
   `mensagem`, `nivel` = `bloqueio` | `aprovacao` | `aviso`, e `linha`) e:
   - `estado` = **`bloqueado`** (há linhas abaixo do custo): **não deixar
     enviar** nem pedir aprovação. Só corrigindo o preço.
   - `estado` = **`precisa_aprovacao`** ou **`recusado`**: pedir um motivo
     (mínimo 5 letras) e chamar `rpc_margem_pedir_aprovacao(p_quote_id,
     p_motivo)`. A Direção recebe o aviso no sino e decide em
     `/custos#aprovacoes`.
   - `estado` = **`aguarda_aprovacao`**: dizer que está à espera da Direção;
     não enviar.
4. Quando a Direção decide, quem pediu recebe "Margem aprovada" ou
   "Margem recusada" no sino. Depois de aprovado, `rpc_margem_verificar`
   devolve `aprovado` e `pode_enviar = true`.

Alertas de nível `aviso` (sem custo, perfil sem custo/hora, preço
desatualizado) não impedem o envio: mostram-se e pronto.

Permissões: verificar pede `quotes.view`, `proposals.view` ou `costs.view`;
pedir aprovação pede `quotes.edit`, `quotes.manage`, `proposals.edit` ou
`proposals.manage`.

---

## Verificações feitas

- `node tools/validar-custos-crm.mjs` (PGlite, 2 organizações, 4 pessoas):
  tudo certo — 925 € → 9,12 €/h; 1.900 € → 25,00 €/h; estrutura
  3.400 € ÷ 672 h → 5,06 €/h; WC suite com custo 2.454,72 € (protótipo
  2.454,55 €), preço 3.606,11 € (protótipo 3.606,12 €) e margem 31,9%;
  abaixo do custo bloqueia; só a Direção aprova; salário escondido;
  isolamento entre organizações; 3 corridas sem erro.
  As diferenças de cêntimos vêm de o custo/hora dar 25,0049 € e não 25 €
  redondos, e de o protótipo arredondar o preço por linha.
- `npx vitest run src/lib/custos`: 24 testes a passar.
- `npx tsc --noEmit -p tsconfig.app.json`: 158 erros, os mesmos 158 da base
  (`871d538f`); nenhum nos ficheiros novos.
- **Não visto no browser**: as tabelas ainda não existem na base real.
