# DESENHO: a gravação do negócio deixa de repor as visitas do CRM (rascunho 20270101030000)

Decisão do utilizador: «podes só fazer com que a função do Ben não reponha a visita».

## O que muda

Só a `public.fn_neg_sincronizar_visitas(uuid, uuid, jsonb, jsonb)`, chamada apenas por `neg_guardar_negocio`
(`p_linhas->'respostas'`, uma lista `{campo_chave, valor}` vinda de `d.f`, e `p_linhas->'visitas'`, a lista `d.vis`).
Parte da versão viva (20270101000000; md5 de `pg_get_functiondef` medido a 29/10 na base RH: `8c3191681ad746971c97a6f86886e1d4`,
e o corpo igual ao ficheiro da migration). Mantém-se a correção da `duration_minutes`, a assinatura, SECURITY DEFINER,
`search_path=public` e EXECUTE só para postgres e service_role.

1. Para cada visita n: se `v<n>_crm` é um uuid válido e esse id existe em `schedule_items` com o mesmo negócio e organização,
   a visita é do CRM e a função passa à seguinte (não procura, não insere, não atualiza). Marca inválida ou id inexistente:
   caminho de sempre.
2. Nesse caso, uma cópia `origin='auto'` com `visita_numero = n` fica `cancelled` e com `visita_numero = NULL`.
3. O cancelamento final só atinge `origin='auto'` e `organization_id = p_org`.

## Caso a caso

- **Marcar no CRM**: a visita real (manual, sem número) entra por `neg_guardar_visita`; o espelho ganha `v<n>_crm`; ao gravar o
  negócio a função ignora a visita n. Deixa de nascer a cópia 'auto' repetida. Se já tinha nascido (gravação antes da marca), é cancelada.
- **Remarcar no CRM**: `neg_alterar_visita` muda a linha real; o espelho reescreve `v<n>_data/hora`; a função ignora. Sem cópia nova.
- **Cancelar no CRM**: a linha real fica cancelada pelo CRM; o espelho fica «Cancelada»; a função ignora. A visita continua
  marcada no espelho com um id que existe, por isso não renasce.
- **Visita antiga só da Emylia** (sem marca): tudo como hoje; a sua cópia 'auto' continua a ser criada, atualizada e cancelada.
- **Mudelar**: nunca escreve a marca; para ela o único efeito é o cancelamento final não tocar em linhas não-'auto'
  (nas migrations do repositório, `visita_numero` só é escrito por esta função, sempre com 'auto'), portanto nada muda na prática.
- **Lista do passo Visitas** (`useVisitasDoNegocio`, lê por `negocio_id`): uma cópia 'auto' cancelada pela regra 2 pode aparecer
  lá como visita cancelada; não verificado.

## O que não consigo provar (nada correu)

- Não foi executado: nem a guarda, nem a função, nem o bloco de conferir. Só o catálogo foi lido (md5, ACL, índice único
  `(negocio_id, visita_numero)`, `origin` enum `schedule_item_origin`, contagens: 2 'auto' e 5 'manual' com negócio).
- Não sei se os gatilhos de `schedule_items` (feriados, ausências, confirmação, auditoria) aceitam o cancelamento da cópia
  antiga; se recusarem, a gravação continua e devolve o aviso «A cópia antiga da visita n não foi cancelada».
- Limite assumido: se a linha do CRM for **apagada** (não cancelada), o id deixa de existir e a visita n volta ao caminho normal
  (nasce uma cópia 'auto' a partir do espelho). Foi a regra pedida («para não perder a visita»).
- O md5 depende da versão do Postgres que renderiza a definição; se divergir, a guarda pára sem mexer.
