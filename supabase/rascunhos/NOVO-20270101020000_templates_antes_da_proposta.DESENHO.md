# Escolher templates antes de a proposta existir (rascunho 20270101020000)

Nada aplicado. Base RH (uetjghdkwbywbftedtth). Lido no remoto em 29/10, só catálogo.

## Problema

Na ficha do negócio, ao escolher o template no passo Proposta, aparecia «A proposta ainda não existe: nasce quando o orçamento é enviado» (NE007).
A proposta só nasce quando se carrega em «Enviar proposta» (é `neg_guardar_negocio` que a cria) e o contrato só depois da aceitação. A escolha tem de poder ser feita antes e ficar guardada.

## Decisão: tabela 1-para-1 `negocio_templates`, não colunas em `negocios`

- `negocios` tem gatilhos de UPDATE (eventos, «fechado só leitura», `updated_at`) que uma escolha de template não deve disparar.
- Colunas novas apareceriam em qualquer leitura do Ben que leia a linha inteira, e o texto do contrato pode ter até 1 MB.
- RLS igual à das tabelas irmãs (`negocio_respostas`): só leitura com `pessoas.view`, `authenticated` só com SELECT, nenhum acesso para `anon`. Quem escreve é só a RPC (SECURITY DEFINER).

## RPCs (mesma assinatura, SECURITY, search_path e permissões que na 20261231999800; as mesmas chaves)

- `neg_definir_templates_negocio` grava **sempre** no negócio. Se o documento já existir, grava também nele, como antes. **NE007 deixa de existir.** NE008 só acontece quando o documento existe e já foi decidido ou enviado para assinatura. NE009 continua: o template tem de ser da organização, estar activo e ser do tipo certo.
- Na primeira gravação, a linha do negócio nasce com o que os documentos já têm. Assim fica um espelho completo, e as respostas de uma minuta antiga não se perdem.
- `neg_ler_templates_negocio` / `fn_neg_templates_estado`: se o documento existe, devolve o valor do documento, que é o que fica congelado. Se não existe, devolve a escolha pendente, e `*_editavel` passa a `true`. Antes era `false`; no código, só o hook lê estes campos.

## Aplicar ao nascer: gatilhos BEFORE INSERT

Os gatilhos disparam por ordem do nome (ordem de bytes):

| Tabela | Ordem |
|---|---|
| quotes | `trg_negocios_10_herdar` → `trg_negocios_20_validar_ins` → **`trg_negocios_25_template_pendente`** |
| proposals | `trg_negocios_10_herdar` → `trg_negocios_20_validar_ins` → **`trg_negocios_25_template_pendente`** → `trg_proposals_freeze_template_snapshot` |
| client_contracts | **`trg_contracts_05_template_pendente`** → `trg_contracts_freeze_template` → … → `trg_negocios_10_herdar` |

- Os gatilhos só agem quando o documento vem sem template (e sem snapshot próprio) e o negócio tem uma escolha pendente válida.
- O contrato só recebe as respostas e o texto se ficar com a mesma minuta que foi escolhida.
- Limitação: no contrato, o congelamento corre antes da herança do negócio. Por isso, o gatilho novo só vê o `negocio_id` que vem no próprio INSERT. É o caso de `neg_guardar_negocio`. Um contrato que só herda o negócio pelo CRM não recebe a escolha.
- Os gatilhos são SECURITY DEFINER, com `search_path` fixo, como os irmãos. Fazem uma leitura por chave primária e outra por template.

## O que não se consegue provar (nada correu)

- Que a migration aplica: os erros de tipo em SQL só aparecem a correr.
- Que a ficha deixa de dar erro, e que, depois do envio, a proposta nasce com o template e com o snapshot certos.
- O custo dos gatilhos em INSERT com muito volume (por desenho, é desprezável).
- Que, ao ver `*_editavel = true` sem documento, o ecrã não faz nada inesperado.
