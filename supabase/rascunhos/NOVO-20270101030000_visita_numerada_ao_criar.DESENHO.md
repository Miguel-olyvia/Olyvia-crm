# Visita do CRM numerada ao criar (20270101030000) — desenho

Rascunho: `NOVO-20270101030000_visita_numerada_ao_criar.sql`. Nada aplicado.

## O que resolve

O passo Visitas cria a visita por `neg_guardar_visita` (sem `visita_numero`). Em cada gravação do negócio, `fn_neg_sincronizar_visitas` (Ben) procura `(negocio_id, visita_numero = n)` e, não encontrando, insere uma segunda linha (`origin 'auto'`, sem recursos). Decisão do utilizador: numerar a visita ao criar; a função do Ben não muda. **Substitui** o rascunho `NOVO-20270101010000_visitas_adotar_do_crm.sql` (não aplicar os dois).

## Contrato

`public.neg_numerar_visita(p_negocio_id uuid, p_visita_id uuid) RETURNS integer` — SECURITY DEFINER, `search_path = public, pg_temp`, EXECUTE só a `authenticated`.

| Caso | Resposta |
|---|---|
| sem sessão / sem perfil | `insufficient_privilege` / `no_data_found` |
| negócio inexistente, apagado, de outra org, sem `pessoas.edit` ou fora do âmbito | `NG001` «Negócio indisponível.» |
| negócio do CRM (sem `fluxo_emylia` e com documentos do CRM) | `NE005`, a regra e a mensagem de `neg_guardar_negocio` |
| visita inexistente, de outro negócio ou de outra org | `NG001` «Visita indisponível neste negócio.» |
| visita já numerada | devolve o número, sem escrever |
| caso normal | menor n >= 1 livre; grava e devolve |

Permissão: cópia do passo 6 de `neg_guardar_visita` (âmbito `pessoas.edit` por `:*`, `assigned_to` ou `created_by`), **sem** exigir negócio «aberto» (a sincronização corre também em fechados). Bloqueio: `FOR UPDATE` na linha do negócio (o mesmo recurso que o `UPDATE negocios` de `neg_guardar_negocio` e o `FOR NO KEY UPDATE` de `neg_guardar_visita`; mesma ordem negócio→agenda, sem impasse), depois `FOR UPDATE` na visita.

## Número livre — um desvio ao pedido, para decidir

O pedido dizia «menor livre na agenda». A função exclui **também** os números já em `negocio_medidas.visitas` (a lista do espelho já gravada): uma visita da Emylia sem dia nem hora tem número e não tem linha na agenda; só com a agenda, a visita nova do CRM receberia esse número e colidiria com ela no espelho. Se o código quiser que a visita do CRM **seja** essa visita sem data, este desvio impede-o: dizer e tira-se.

## O que a sincronização faz depois a uma linha já numerada (lido em `pg_get_functiondef`, viva na RH)

Só actua se `v<n>_data` e `v<n>_hora` estiverem preenchidas; senão não lhe toca. Quando actua, **sobrescreve**:

- `title` → «Visita n · nome da pessoa» (perde o título do CRM);
- `status` → de `v<n>_estado` (Feita/Cancelada; tudo o resto = `scheduled`);
- `start_datetime` → `v<n>_data` + `v<n>_hora` em Europe/Lisbon; `end_datetime` → início + duração de `v<n>_duracao`: só conhece «30 min», «1 h», «2 h»; **qualquer outro valor dá 90 min**. Mudar as horas dispara `trg_schedule_items_reset_confirmation` e o gatilho de feriados (um erro aí vira aviso, não falha);
- `visit_kind` → de `v<n>_tipo` (o que não reconhece vira `levantamento`);
- `notes` → `v<n>_combinado`, **NULL se vazio** (o CRM escreve as notas em `description`, que não é tocada).

**Não toca**: recursos (atribuições, noutra tabela), `board_id`, `location`/lat/lng, `description`, `metadata`, `origin`, `entity_id`, `created_by`.

**Cancela** a linha se `visita_numero` não estiver na lista `visitas` da gravação. Por isso o código, logo a seguir a numerar, tem de pôr `n` em `visitas` e escrever `v<n>_data`, `_hora`, `_duracao`, `_estado`, `_tipo` e `_combinado` iguais ao que o CRM tem — senão a primeira gravação do negócio desfaz o CRM.

## Não provado (nada corre)

- A função nunca foi executada: nem compilação, nem guarda, nem conferir. Erros de tipo em SQL só aparecem a correr (`db push --dry-run` não executa o corpo).
- Não se testou a permissão com um utilizador só com `pessoas.edit`, nem a concorrência com `neg_guardar_negocio`.
- O número devolvido não vê espelhos por gravar no cliente (só a lista já gravada).
- Contagem lida na RH: 7 linhas de agenda com negócio, 2 com número.
