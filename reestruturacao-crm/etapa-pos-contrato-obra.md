# Etapa pós-contrato, Frente B: obra com todos os orçamentos, plano aprovado e checklist de arranque

> **Estado:** pronta e verificada localmente, **por aplicar em produção**.
> Ramo: `feat/pos-contrato-obra` (worktree `D:\Olyvia\wt-pc-obra`), a partir de `ccd53f11` (lote 2), 13/10/2026.
> Especificação: `docs/melhorias-v2-2026-10-13/pos-contrato-especificacao.md` e `fluxo-encomendas.md` (1.1 e 1.1b).
> A Frente A (Encomenda Cliente e notas de encomenda a fornecedor) está noutro ramo. Esta frente lê as tabelas dela só se existirem.
>
> **Junção feita** no ramo `feat/pos-contrato` (13/10/2026): cartões reais no Arranque, `nota_id` fixado, orçamentos do contrato numa só fonte e "Dados em falta" no menu. A ordem única do SQL e o que avisar estão em `etapa-pos-contrato.md`; os pontos "Por fazer"/"Para a junção" abaixo que falam disto já estão feitos.

---

## O que muda para quem usa

### Nova obra (passo "Serviços do contrato")

- **Contrato sem `quote_id` com vários orçamentos aceites:** a obra passa a ter os serviços de **todos** os orçamentos aceites da proposta.
  - Antes usava só o mais recente. No CC-2026-0331 da Mudelar isso era ≈ 38 % do contrato.
  - Com `quote_id` preenchido, conta só esse orçamento.
  - Um orçamento não aceite (`accepted_at` vazio) fica de fora. É uma alternativa.
- Cada orçamento gera as suas tarefas. Dois "Modelo WC" em dois orçamentos são duas casas de banho, logo dois conjuntos de tarefas.
  - O nome da tarefa leva o orçamento à frente, por exemplo "WC suite · Modelo WC: Demolição". É assim que o Gantt as agrupa.
  - As fases 1 a 4 mantêm o significado de sempre.
- **Os serviços dentro dos conjuntos** (`bundle_components` com `type = 'service'`) passam a gerar tarefas, tal como os serviços diretos.
  - A quantidade é a do componente × a da linha. O tempo é proporcional a essa quantidade.
- Em cada serviço, o ecrã mostra **de que orçamento vem** e se está dentro de um conjunto.

### Obra, novo separador "Arranque"

Junta as 3 validações do Planeador:

1. **Encomenda Cliente**
2. **Encomenda a fornecedor**
3. **Plano da obra**

- Por agora, os cartões 1 e 2 só mostram o estado. Na junção com a Frente A entram os componentes dela. O sítio está marcado com `JUNÇÃO:` em `ArranqueObra.tsx`.
- No cartão do plano:
  - o estado, quem aprovou e quando;
  - o botão **"Aprovar plano"** (gestor e admin);
  - os avisos: tarefas sem datas, tarefas sem ninguém atribuído, falta de supervisor, e tarefas que começam antes de o material chegar.
- **Mexer no plano depois de aprovado** volta a pô-lo "por aprovar" e fica registado no histórico (evento `plano_por_aprovar`).
  - Conta como mexer: criar ou apagar tarefas, mudar datas, nome, fase, minutos, pessoas previstas, especialidade, equipa, dependências ou supervisor.
  - Isto só acontece enquanto a obra não arrancou. Os replaneamentos de uma obra em curso (por atrasos, por exemplo) já não desaprovam o plano.
- **"Arrancar"** fica bloqueado enquanto faltar alguma validação. A janela diz o que falta. A base recusa na mesma, com a mesma mensagem.
  - Retomar uma obra suspensa que já tinha arrancado não passa pelo checklist.
- **Data de chegada do material:** ao aprovar o plano, ou com o botão "Atualizar datas do material", as tarefas recebem `material_chega_em`.
  - A data vem das notas de encomenda a fornecedor da obra, propostas ou aprovadas.
  - Usa-se o `expected_delivery` da encomenda ao fornecedor, se existir. Senão, usa-se o `prazo_previsto` da nota.
  - Uma tarefa usa um produto se ele estiver nos materiais ligados à tarefa, na ficha de materiais do serviço, ou numa linha da Encomenda Cliente com a mesma linha do orçamento ou o mesmo serviço.
  - As datas do plano não mudam: fica só o aviso.
  - Uma data dita à mão não é substituída.

### Adendas (preparado, sem ecrã)

- `ops_contrato_orcamentos(p_contrato_id)` é a **única** função que diz que orçamentos tem um contrato. Devolve `(quote_id, origem)`, com `origem = 'contrato'`.
  - Espelha a `fn_ec_orcamentos_do_contrato` da Frente A. Na junção, as duas passam a uma só.
  - As adendas entram aí com `origem = 'adenda'`.
- `ops_obra_acrescentar_orcamentos_impl(obra, quote_ids[])` (interna) e `rpc_ops_obra_acrescentar_orcamentos(p_obra_id, p_quote_ids)` acrescentam a uma obra existente as tarefas de orçamentos novos:
  - não mexem nas tarefas que lá estão;
  - saltam orçamentos que já deram tarefas;
  - põem as tarefas novas depois do fim atual;
  - o plano volta a "por aprovar".
- Falta o ecrã e a tabela de adendas no CRM. Isso é trabalho do CRM.

---

## Como aplicar (Supabase, SQL Editor, por esta ordem)

1. `operacao-app/db/obras.sql`, o ficheiro inteiro, como sempre. É idempotente.
   - Acrescenta 2 colunas a `ops_obra_tarefa`: `orcamento_id` e `orcamento_componente`.
   - Muda a criação e a previsão da obra para usarem todos os orçamentos e os conjuntos.
   - Acrescenta o bloqueio do "Arrancar". Só fica ativo depois do passo 2.
2. `operacao-app/db/obra-arranque.sql`, novo e idempotente. Precisa do `obras.sql` do passo 1.
   - Acrescenta `ops_obra.plano_aprovado_por` e `plano_aprovado_em`, os gatilhos, o checklist e "Aprovar plano".
   - **Na 1.ª vez**, as obras que já arrancaram (com `iniciada_em`, em curso ou concluídas) ficam com o plano aprovado. Leva a data de arranque, não tem autor e o evento diz `automatico: true`.
3. *(Quando a Frente A for aplicada)* não é preciso voltar a correr nada daqui. O checklist passa a ler as tabelas dela sozinho.

Se `obras.sql` voltar a ser colado mais tarde, por exemplo noutra atualização, não desfaz nada do `obra-arranque.sql`. O validador prova as duas ordens.

Verificação local (PGlite, sem tocar no Supabase):

```
cd operacao-app
npm run validar-obra-arranque   # novo
npm run validar-obras
npm run validar-planeamento
npx tsc --noEmit && npx vitest run
```

### Depois de aplicar, ver no browser (`/operacao/obras`)

- Nova obra a partir do CC-2026-0331: os serviços dos 4 orçamentos, cada um com "do orçamento …".
- Abrir uma obra planeada, separador "Arranque":
  - plano "por aprovar";
  - "Aprovar plano";
  - mudar uma data no Gantt: volta a "por aprovar".
- "Arrancar" com o plano por aprovar: a janela diz o que falta e o botão fica desligado.
- Uma obra em curso: no separador "Arranque", o plano aparece aprovado.

---

## Decisões tomadas (a confirmar pelo Ruben, se quiser outra coisa)

1. **Obras já arrancadas = plano aprovado.**
   - As planeadas ficam "por aprovar".
   - Uma obra que foi suspensa sem nunca ter arrancado também fica por aprovar. Ao "Retomar", passa pelo checklist.
2. **Sem as tabelas da Frente A, os passos 1 e 2 ficam "por instalar" e não bloqueiam.** Senão, nenhuma obra arrancava até a Frente A ir para produção. Até lá, só o plano bloqueia.
3. **Obra sem contrato** (em branco ou de orçamento avulso): a Encomenda Cliente e o fornecedor ficam "não aplicável" e não bloqueiam.
4. **Aprovar o plano não exige os passos 1 e 2 validados.** O plano pode ser revisto em paralelo. Mas:
   - "Arrancar" exige os três;
   - se a Encomenda Cliente for validada **depois** da aprovação do plano, o plano volta a "por aprovar" (as datas do material podem ter mudado). Isto é calculado; não é preciso gatilho nas tabelas da Frente A.
5. **Aprovar exige** pelo menos uma tarefa e todas as tarefas com datas.
   - Tarefas sem ninguém, falta de supervisor e material que chega depois são avisos, não bloqueios.
6. **Fornecedor OK** quando `fornecedor_estado` é `aprovada` ou `nao_necessaria`.
   - `parcial`, `por_aprovar` e `por_gerar` bloqueiam.
   - Notas rejeitadas não contam para as datas.
7. **O orçamento principal da obra** (`ops_obra.orcamento_id`) continua a ser o de sempre (`ops_contrato_orcamento`): o título e a morada vêm dele.
   - Os outros orçamentos ficam marcados tarefa a tarefa (`ops_obra_tarefa.orcamento_id`).
   - Um orçamento que já entrou numa obra viva não abre outra obra.
8. **Nenhuma permissão nova.**
   - Aprovar o plano usa `operations.orders.edit` e a função gestor ou admin.
   - Ver o checklist segue a mesma regra de quem vê a obra.

---

## Riscos e limitações (ler antes de aplicar)

1. **Obras planeadas em produção ficam "por aprovar"** e não arrancam sem alguém carregar em "Aprovar plano".
   - É o comportamento pedido, mas convém avisar os gestores no dia em que se aplica.
2. **Ligação nota → linha da Frente A.** A especificação não fixa o nome da coluna de `nota_encomenda_fornecedor_linha` que aponta para a nota.
   - O código procura, por esta ordem, `nota_id`, `nota_encomenda_id` e `nota_encomenda_fornecedor_id`.
   - Se a Frente A usar outro nome, as datas do material ficam por ler (com um aviso nos logs) até se acrescentar o nome. **A confirmar na junção.**
3. **Contratos com orçamentos aceites que são alternativas.**
   - A regra de 13/10 diz que vários orçamentos num negócio são alternativas. Mas um orçamento só conta aqui se tiver `accepted_at`.
   - Se um comercial marcar duas alternativas como aceites, a obra fica com as duas. Corrige-se preenchendo `client_contracts.quote_id`, ou cancelando a obra e voltando a criá-la.
4. **Obras antigas não têm `orcamento_id` nas tarefas.**
   - Funcionam como antes.
   - A proteção "este orçamento já tem obra" só as apanha pelo orçamento principal.
5. **Tarefas acrescentadas de uma adenda** entram todas no 1.º dia útil depois do fim atual, em paralelo, com a duração dos minutos ÷ pessoas.
   - Ficam com o plano por aprovar.
   - Para um plano fino, o gestor arrasta no Gantt ou replaneia.
6. **Nomes das tarefas com o orçamento à frente.** Só quando há mais de um orçamento. Nos relatórios por nome de tarefa, aparecem como tarefas diferentes, de propósito.

---

## Para a junção com a Frente A

- Em `operacao-app/src/components/arranque/ArranqueObra.tsx`, trocar os dois `ArranqueCartaoProvisorio` por `EncomendaClienteCartao` e `NotaEncomendaCartao` (props: `contratoId`, `obraId`, `aoMudar`). Os sítios estão marcados com `JUNÇÃO:`.
- Juntar `ops_contrato_orcamentos` e `fn_ec_orcamentos_do_contrato` numa só função, com `origem = 'contrato' | 'adenda'`.
- Opcional: quando uma nota for aprovada, chamar `ops_obra_material_frente_a_impl(obra)` para as datas do material ficarem logo em dia. Hoje atualizam-se ao aprovar o plano ou com o botão.
