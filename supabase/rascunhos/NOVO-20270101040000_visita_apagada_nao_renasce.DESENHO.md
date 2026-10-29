# 20270101040000 — visita apagada no CRM não renasce (RASCUNHO, não aplicado)

Decisão do utilizador: «claro, se alguem apaga a visita ela apaga-se mesmo».

## O que muda
Só `fn_neg_sincronizar_visitas(uuid, uuid, jsonb, jsonb)`. Em relação à versão viva (20270101030000, md5 `1b7eb40289eea48cbc37de2cebd1f6bd`, medido a 29/10/2026 na base RH, corpo lido por `pg_get_functiondef` e igual ao do ficheiro):
- sai o `AND EXISTS (... schedule_items WHERE id = v_crm ...)`;
- marca `v<n>_crm` que seja um uuid válido (regex 8-4-4-4-12, cast só depois) passa a bastar para tratar a visita como do CRM: cancela a cópia `auto` com o mesmo número (`status <> 'cancelled'`) e `CONTINUE`.

Tudo o resto igual: assinatura, SECURITY DEFINER, `search_path=public`, EXECUTE só postgres/service_role, cancelamento final só de `origin = 'auto'`, duração pelo `end_datetime`.

## Caso a caso (ao gravar o negócio)
| Caso | Antes (viva) | Depois |
|---|---|---|
| Marcar no CRM | marca aponta a linha viva: ignora, cancela cópia auto | igual |
| Remarcar no CRM | igual: a linha do CRM é a fonte, a função não lhe toca | igual |
| Cancelar no CRM | linha existe (cancelada): ignora | igual |
| Apagar no CRM | linha some: EXISTS falso, **cria cópia auto (renasce)** | marca uuid basta: não cria nada; cópia auto antiga com o número fica cancelada |
| Marca inválida (não uuid) | caminho normal (cria/atualiza auto) | igual |
| Visita antiga só da Emylia (sem marca) | caminho normal | igual |

## Guardas
- Partida: 1 assinatura; corpo ainda contém `WHERE id = v_crm` (senão já está feito); md5 = `1b7eb40289eea48cbc37de2cebd1f6bd`.
- Conferir: 1 função, SECURITY DEFINER, `search_path=public`, EXECUTE só postgres/service_role, sem `WHERE id = v_crm`, com `IF v_crm IS NOT NULL THEN`, filtros `origin='auto'` e a correção da duração.

## O que NÃO está provado
Nada correu: não houve `db push`, nem teste, nem chamada à função. Não se verificou que o ecrã apaga também o espelho/marca `v<n>_crm` ao apagar (se apagar a marca, a visita volta ao caminho normal só se o espelho `v<n>_data/_hora` ficar). Uma marca uuid válida que aponte para um id que nunca existiu (escrita à mão ou de outro negócio) também passa a ser ignorada sem aviso.
