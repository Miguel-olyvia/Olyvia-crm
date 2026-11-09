# Teste de permissões por papel — `permissoes_papeis.sql`

Prova, na **base RH** (project-ref `uetjghdkwbywbftedtth`), quem passa e quem é bloqueado nas ações principais de permissões.
**Nunca correr na de produção (`tzbfgwpckrfbqcolqxtm`).**

## Como correr

```bash
cd <workdir ligada à base RH>
cat supabase/.temp/project-ref        # tem de dar uetjghdkwbywbftedtth
npx supabase db query --linked -f <caminho>/supabase/tests/permissoes_papeis.sql -o csv
```

O resultado é o último `SELECT`: uma linha por verificação
(`papel_conta | verificacao | esperado | obtido | resultado | detalhe`) e uma linha `TOTAL` com o número de FALHAS.

## Não deixa alterações

- Tudo em `BEGIN … ROLLBACK`; cada ação corre num sub-bloco que acaba sempre em `RAISE` (o que a ação escreveu é desfeito
  mesmo quando passa — inserts em `documents`, picagens, o `purge` de um orçamento).
- A conta-sonda muda de papel durante o teste (`UPDATE anew_memberships`), também desfeito.
- Só tabelas temporárias `ON COMMIT DROP`. Sem DDL persistente, sem migrations, sem mexer em funções/políticas.
- Para confirmar: contar `documents`, `pessoas_picagens`, `quotes`, `quote_lines`, `anew_entity_history` e um md5 de
  `anew_memberships` antes e depois.

## Contas cobertas

Todas as associações ativas da organização `b6ffce4f-…` (só a primeira de cliente), mais a conta-sonda
`1999rubencmail@gmail.com` (super_admin sem ficha RH) com o papel trocado para `system_admin`, `viewer` e
`teste_rh_so_ponto` (o caso "tem `hr.assiduidade.picar` mas não tem ficha"). Os Papéis no Negócio (armazém, financeiro,
comercial, operações, técnico) aparecem no rótulo `[neg: …]`.

## Como se calcula o esperado

A partir das tabelas, não das funções testadas:
- **perfil** — `anew_role_permissions` do papel da associação ativa não-cliente na organização;
- **papel** — `neg_papeis_permissoes` dos Papéis no Negócio da ficha ligada (`pessoas_papeis_negocio`, + `tecnico` por
  `fn_rh_pessoa_tecnica`);
- **admin** — associação ativa ao papel global `system_admin`.

## O que cobre

1. `fn_cat_pode` para `negocios.proposta.enviar`, `portal.manage`, `client_contracts.cancel`, `quotes.view_costs`,
   `deals.delete`, `trash.view`, `hr.assiduidade.picar`, `hr.pessoas.view`.
2. `trg_documents_portal_exige_permissao`: insert com `visible_to_client=true` (exige `portal.manage` OU
   `negocios.proposta.enviar`) e `=false` (só a RLS de membro).
3. Custos: `rpc_quote_lines_custos` (`quotes.view` para ver linhas; `quotes.view_costs`/`quotes.manage` para os custos) e
   `neg_ler_negocios` → `fn_neg_ler_orcamento` (`pessoas.view` para ler; `quotes.view_costs`/`quotes.manage` para os custos — a mesma
   regra, `fn_quote_custos_pode`, desde 20270110200000).
   Se não houver dados, a linha diz "sem dados".
4. `rpc_hr_picar`: com ficha, exige `hr.assiduidade.picar`; sem ficha, deve recusar com uma mensagem de "sem ficha"
   (`conta_sem_ficha_rh`, 20270110200000).
5. `purge_business_entity('quote', …)` (Lixo): bloqueia sem `deals.delete` nesta organização ou acima.
   5b. Simulado: a sonda fica `viewer` aqui e ganha, só dentro do sub-bloco, `super_admin` noutra organização (criada e
   desfeita se só houver uma) → tem de ser bloqueada (antes de 20270110200000 passava).
6. Custos iguais nas duas vias: quando 3a e 3b leem linhas, dão ambas "com custos" ou ambas "custos a null".

## `permissoes_ambito.sql` — o âmbito no servidor (20270110900000)

Mesmo estilo (`BEGIN … ROLLBACK`, sessão impersonada, esperado calculado das tabelas). Cria os seus dados na transação: o Rafael
passa a `comercial` (OWNED), fica dono de um negócio/orçamento/proposta/contrato, ganha uma tarefa na obra de outro negócio, e
lidera uma equipa de teste. Verifica: `neg_ler_negocios`/`obra_ler_negocios` (dono + tarefas; ORG; TEAM; NONE), as guardas de
`neg_guardar_negocio`/`obra_guardar_negocio`, quem entra só pelo Papel no Negócio e os técnicos (veem tudo, sem guarda de âmbito),
o super_admin, `rpc_save_quote` (permissão + âmbito), o SELECT de `quotes`/`proposals`/`client_contracts` (OWNED = a cadeia do
negócio comercial e contém o "meu" de cada ecrã; ORG = tudo), o UPDATE com as chaves de `quotes.edit`, NONE em
`crm_scope_keys`/`get_schedule_item_scope_context`/`get_proposal_edit_scope`, e o âmbito em `soft_delete_business_entity` e
`cancel_and_replace_contract`. O 3b de `permissoes_papeis.sql` passou a contar com o âmbito (sem negócios no âmbito = "sem linhas").
