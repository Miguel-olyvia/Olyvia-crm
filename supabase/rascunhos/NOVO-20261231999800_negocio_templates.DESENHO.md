# Desenho: templates nos documentos do Negócio (ficha do Pipeline)

Rascunho: `NOVO-20261231999800_negocio_templates.sql`. Nada aplicado. Base RH.

## O que existe (lido no catálogo a 28/10)

- `quotes.template_id` (uuid, sem chave estrangeira) — é o template do tipo orçamento (`proposal_templates`, `template_type = 'quote'`); o `QuoteBuilder` grava-o como `pdf_template_id` e `generateQuotePdfBlob` lê-o. **Não é preciso coluna nova.**
- `proposals.template_id` (FK para `proposal_templates`) e `proposals.template_snapshot`. O gatilho `proposal_freeze_template_snapshot` escreve o snapshot quando o `template_id` muda (e noutras mudanças à proposta, menos aceitar/recusar).
- `client_contracts.contract_template_id` (FK para `client_contract_templates`), `prompt_values`, `contract_body_html`. O gatilho `contract_freeze_template_snapshot` re-congela a minuta quando muda a minuta, as respostas ou o texto.
- `proposal_templates` e `client_contract_templates` estão **vazias em toda a base RH** (contagem). Nenhum documento tem hoje template.

## As duas RPC (novas; nada do Ben se toca)

`neg_ler_templates_negocio(p_negocio_id uuid) -> jsonb` — `pessoas.view`.
`neg_definir_templates_negocio(p_negocio_id uuid, p_dados jsonb) -> jsonb` — `pessoas.edit`; devolve o mesmo objecto que a leitura, já gravado.

Ambas: SECURITY DEFINER, `search_path = public`, organização tirada do próprio negócio e verificada com `fn_cat_exigir` (como `neg_guardar_negocio`); negócio inexistente dá a mesma mensagem que falta de permissão (CT001). Só `authenticated` executa.

### Chaves devolvidas (o código da ficha lê estas)

| chave | tipo | de onde |
|---|---|---|
| `negocio_id` | uuid | |
| `orcamento_id` | uuid \| null | versão actual do orçamento (fluxo Emylia, maior versão não substituída, sem adenda) |
| `orcamento_versao` | número \| null | |
| `orcamento_editavel` | boolean | falso se aceite/recusado/rejeitado ou se não há orçamento |
| `template_orcamento_id` | uuid \| null | `quotes.template_id` |
| `proposta_id` | uuid \| null | a proposta do negócio (a mesma que `neg_guardar_negocio` usa); null até ao 1.º envio |
| `proposta_editavel` | boolean | `status` em draft/sent/viewed |
| `template_proposta_id` | uuid \| null | `proposals.template_id` |
| `template_proposta_snapshot` | objecto \| null | `proposals.template_snapshot` (a linha do template congelada: cores, logo, header_text, sections, design_settings…) |
| `contrato_id` | uuid \| null | versão actual do contrato (maior versão, sem adenda) |
| `contrato_versao` | número \| null | |
| `contrato_editavel` | boolean | `status` em draft/changes_requested |
| `minuta_id` | uuid \| null | `client_contracts.contract_template_id` |
| `minuta_respostas` | objecto \| null | `prompt_values` — `{ chave: texto }` |
| `contrato_corpo_html` | texto \| null | `contract_body_html` |

### O que se envia em `p_dados`

Só as chaves a mudar; as ausentes ficam como estão. `null` = nenhum template.
`template_orcamento_id`, `template_proposta_id`, `minuta_id`, `minuta_respostas`, `contrato_corpo_html`. Qualquer outra chave é recusada (NE006).

Validações: template do tipo certo (`quote` / `proposal`), activo e da organização do negócio; minuta activa e da organização; respostas com chaves `{{chave}}` (`^[a-zA-Z0-9_]{1,80}$`), valores texto até 5000, até 200, até 256 KB; texto do contrato até 1 MB.

Erros: CT001 permissão/negócio; NE005 negócio do CRM; NE006 dados; NE007 documento ainda não existe; NE008 documento já não se muda; NE009 template inválido.

## Notas para a ficha

- Seletores com estado honesto: as duas tabelas de templates estão vazias; mostrar «ainda não há templates; cria-os em …» com ligação a `/quote-templates`, `/proposal-templates`, `/contract-templates`, e «Nenhum» como opção válida.
- A proposta só existe depois do 1.º envio do orçamento (`proposta_id` null): o seletor de template de proposta fica desactivado com essa explicação; gravar antes dá NE007.
- O texto do contrato compõe-o a aplicação (minuta + respostas), como no CRM (`contractDocument.ts`); a função grava o que recebe, não o compõe nem o sanitiza. Mandar `minuta_id`, `minuta_respostas` e `contrato_corpo_html` na mesma chamada.
- Ordem com `neg_guardar_negocio`: as duas bloqueiam primeiro a linha do negócio, por isso não se cruzam. Gravar os templates **depois** de `neg_guardar_negocio` (é ela que cria a versão do orçamento, a proposta e a versão do contrato).

## Limites que ficam assumidos

- **Versão nova perde o template do orçamento**: `neg_guardar_negocio` cria cada versão sem `template_id`, e não se lhe toca. A ficha tem de voltar a chamar `neg_definir_templates_negocio` com o template quando cria uma versão nova (ou decide-se outra via; ver POR DECIDIR).
- **«Nenhum» na proposta e no contrato segue a regra que o CRM já tem**: com `template_id` null, os gatilhos congelam o template **por omissão** da organização (`is_default`), se existir. Hoje não existe nenhum. Não se combate o gatilho.
- Mudar o template da proposta passa pelos gatilhos da proposta (`trg_proposals_mark_dirty`, linha do tempo, auditoria), como qualquer edição do CRM.

## O que NÃO está provado (nada correu)

- Que o ficheiro compila e aplica: não foi aplicado nem testado; erros de tipo em SQL só aparecem a correr.
- O comportamento dos gatilhos com SECURITY DEFINER (`trg_lock_proposal_ownership`, `proposal_mark_dirty_before_update`) nesta escrita: inferido de `neg_guardar_negocio` fazer o mesmo tipo de UPDATE.
- Os md5 da guarda foram lidos no remoto a 28/10; se alguém mudar uma das funções antes do push, a guarda pára (é o pretendido).
