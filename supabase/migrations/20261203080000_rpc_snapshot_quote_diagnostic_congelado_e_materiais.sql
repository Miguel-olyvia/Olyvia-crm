-- rpc_snapshot_quote_diagnostic — (A) congelar de vez depois do contrato assinado
-- e (B) incluir necessidades que só têm materiais.
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- ============================================================================
-- (A) REGRA DE NEGÓCIO — o diagnóstico da Encomenda de Cliente é IMUTÁVEL depois
--     do contrato assinado.  [prioritário]
-- ============================================================================
-- O frontend passou a chamar esta RPC em CADA gravação do orçamento (correção de um
-- defeito crítico: antes nunca era chamada, e o snapshot nunca existia). Efeito
-- lateral não intencional: reabrir e regravar um orçamento cujo contrato JÁ ESTÁ
-- ASSINADO fazia o DELETE+reinsert reescrever a fotografia — que deixava de ser a do
-- momento da assinatura e passava a refletir o estado ATUAL das deal_needs.
--
-- Isso contraria a regra explícita do negócio: o diagnóstico que acompanha a
-- Encomenda de Cliente fica congelado no que foi contratado. O que for acrescentado
-- à obra depois do contrato fechado entra por um campo próprio na encomenda (fase
-- seguinte, não aqui) e NUNCA por alteração do que foi contratado — entre outras
-- razões porque essas adições têm tratamento diferente na margem.
--
-- Comportamento novo: se existir um contrato assinado que resolva para este
-- orçamento, a função sai SEM ESCREVER e devolve o número de necessidades que a
-- fotografia já tem. Não levanta exceção de propósito — é chamada em cada gravação
-- do orçamento e não pode, em circunstância nenhuma, fazer falhar o save.
--
-- Como se encontra o contrato (a cadeia é fraca e já foi medida):
-- client_contracts.quote_id está NULL em 88% dos casos (80 de 91) e não tem FK — ver
-- 20261115080000_contract_quote_id_fallback_via_proposal.sql. Usa-se aqui a MESMA
-- resolução da rpc_get_client_order_document viva, na direção inversa:
--     COALESCE(cc.quote_id,
--              (SELECT q2.id FROM quotes q2
--               WHERE q2.proposal_id = cc.proposal_id
--               ORDER BY q2.created_at DESC LIMIT 1)) = p_quote_id
-- restringida à organização do orçamento (client_contracts tem ~91 linhas; o custo é
-- irrelevante). "Assinado" é o mesmo conjunto que a listagem de encomendas usa:
-- status IN ('signed','assinado') e deleted_at IS NULL — confirmado em
-- rpc_list_client_order_documents (20261115160000).
--
-- Consequência conhecida e aceite: um orçamento cujo contrato já estava assinado
-- ANTES desta funcionalidade existir nunca chega a ter fotografia. É deliberado —
-- escrever hoje o estado atual das deal_needs e apresentá-lo como "o que foi
-- contratado" seria pior do que não ter nada: seria uma mentira com ar de facto.
--
-- Alternativa considerada e descartada: coluna frozen_at em
-- quote_diagnostic_snapshot, escrita quando o contrato é assinado. É mais barata a
-- ler e não depende da cadeia fraca, mas obrigaria a mexer nas triggers de
-- assinatura de contrato (fn_contract_stock_deduction / fn_contract_supplier_request
-- e companhia) e deixaria sem proteção toda a fotografia já existente — o marcador
-- só apareceria em contratos assinados DEPOIS da migração. A resolução inversa
-- protege desde o primeiro dia, incluindo os contratos já assinados. Se um dia o
-- custo pesar, frozen_at é a evolução natural: passa a ser lido primeiro e esta
-- resolução fica como fallback.
--
-- ============================================================================
-- (B) Necessidades que só têm materiais ficavam fora da fotografia.  [médio]
-- ============================================================================
-- O WHERE da versão anterior (20261203040000, linhas 185-192) só aceitava
-- necessidades com pelo menos um campo diag_* não nulo. Mas os materiais são uma
-- tabela FILHA independente desses campos: nada impede que o técnico aceite os
-- serviços, encha a lista de materiais e depois limpe a área ou o tipo de
-- intervenção. Nessa altura a necessidade deixava de gerar fotografia nenhuma e a
-- lista de materiais — precisamente o que o armazém vai ler no documento de
-- encomenda — desaparecia sem erro nenhum.
--
-- Acrescenta-se `OR EXISTS (... deal_need_diagnostic_materials ...)` ao WHERE. A
-- regra passa a ser "tem levantamento" em vez de "tem campos preenchidos", que é a
-- mesma definição usada em 20261203070000 para decidir se rpc_update_deal pode
-- apagar a necessidade — as duas funções concordam agora sobre o que é uma
-- necessidade com diagnóstico.
--
-- Partida: a versão escrita em 20261203040000. Assinatura (uuid, uuid), retorno
-- integer, SECURITY DEFINER e search_path INALTERADOS. A idempotência (DELETE +
-- reinsert por quote_id) e a dupla validação de âmbito de organização ficam iguais.
--
-- Prerequisites:
--   20261203040000_quote_diagnostic_snapshot.sql — quote_diagnostic_snapshot,
--                                                  rpc_snapshot_quote_diagnostic()
--   20261203010000_diagnostico_deal_needs_campos_e_materiais.sql — deal_needs.diag_*,
--                                                  deal_need_diagnostic_materials
--   20261115080000_contract_quote_id_fallback_via_proposal.sql — a resolução
--                                                  contrato -> orçamento aqui invertida
--   20261115160000_client_order_documents_read_rpcs.sql — os aliases de "assinado"
--
-- Só acrescenta. Nenhum DROP. Nenhuma assinatura alterada.

CREATE OR REPLACE FUNCTION public.rpc_snapshot_quote_diagnostic(p_quote_id uuid, p_deal_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_quote_org uuid;
  v_deal_org  uuid;
  v_count     integer := 0;
  -- NOVO (20261203080000): mesmos aliases de "assinado" usados por
  -- rpc_list_client_order_documents e pelas triggers de contrato assinado.
  v_signed_aliases text[] := ARRAY['signed', 'assinado'];
  v_frozen    boolean := false;
BEGIN
  IF p_quote_id IS NULL OR p_deal_id IS NULL THEN
    RAISE EXCEPTION 'quote_id e deal_id são obrigatórios' USING ERRCODE = 'check_violation';
  END IF;

  SELECT q.organization_id INTO v_quote_org
  FROM public.quotes q
  WHERE q.id = p_quote_id;

  IF v_quote_org IS NULL THEN
    RAISE EXCEPTION 'Orçamento não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT d.organization_id INTO v_deal_org
  FROM public.deals d
  WHERE d.id = p_deal_id;

  IF v_deal_org IS NULL THEN
    RAISE EXCEPTION 'Negócio não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- SECURITY DEFINER: o RLS não se aplica aqui dentro, por isso o âmbito de
  -- organização é validado à mão nas DUAS pontas — o orçamento e o negócio de onde
  -- se copia o diagnóstico.
  IF v_quote_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR v_deal_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão para congelar o diagnóstico deste orçamento'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── NOVO (20261203080000): a fotografia está congelada? ───────────────────
  -- Resolução inversa da de rpc_get_client_order_document: para cada contrato
  -- assinado da mesma organização, o orçamento a que ele corresponde é
  -- cc.quote_id quando existe, e senão a quote mais recente da sua proposta.
  SELECT EXISTS (
    SELECT 1
    FROM public.client_contracts cc
    WHERE cc.organization_id = v_quote_org
      AND cc.deleted_at IS NULL
      AND cc.status = ANY (v_signed_aliases)
      AND COALESCE(
            cc.quote_id,
            (
              SELECT q2.id
              FROM public.quotes q2
              WHERE q2.proposal_id = cc.proposal_id
              ORDER BY q2.created_at DESC
              LIMIT 1
            )
          ) = p_quote_id
  )
  INTO v_frozen;

  IF v_frozen THEN
    -- Sai SEM ESCREVER. Sem exceção: esta RPC corre em cada gravação do orçamento
    -- e não pode fazer falhar o save. Devolve quantas necessidades a fotografia
    -- congelada já tem — é o mesmo significado do valor devolvido no caminho
    -- normal ("necessidades que esta fotografia cobre"), por isso um chamador que
    -- só verifica `> 0` continua a ver a verdade.
    SELECT count(*) INTO v_count
    FROM public.quote_diagnostic_snapshot s
    WHERE s.quote_id = p_quote_id;

    RETURN COALESCE(v_count, 0);
  END IF;

  -- Idempotente: apaga a fotografia anterior deste orçamento e volta a tirá-la.
  DELETE FROM public.quote_diagnostic_snapshot WHERE quote_id = p_quote_id;

  INSERT INTO public.quote_diagnostic_snapshot (
    quote_id, deal_need_id, need_title,
    diag_area_m2, diag_demolir_descricao, diag_demolir_m2,
    diag_proteger_descricao, diag_intervencao_tipo, diag_intervencao_descricao,
    materials, organization_id
  )
  SELECT
    p_quote_id,
    dn.id,
    dn.title,
    dn.diag_area_m2,
    dn.diag_demolir_descricao,
    dn.diag_demolir_m2,
    dn.diag_proteger_descricao,
    dn.diag_intervencao_tipo,
    dn.diag_intervencao_descricao,
    COALESCE(
      (
        SELECT jsonb_agg(
                 jsonb_build_object(
                   'descricao',  m.descricao,
                   'quantity',   m.quantity,
                   'unidade',    m.unidade,
                   'product_id', m.product_id,
                   'service_id', m.service_id
                 )
                 ORDER BY m.sort_order NULLS LAST, m.created_at
               )
        FROM public.deal_need_diagnostic_materials m
        WHERE m.deal_need_id = dn.id
      ),
      '[]'::jsonb
    ),
    v_quote_org
  FROM public.deal_needs dn
  WHERE dn.deal_id = p_deal_id
    -- Só necessidades com levantamento: uma necessidade sem diagnóstico nenhum não
    -- tem fotografia para tirar.
    AND (
      dn.diag_area_m2 IS NOT NULL
      OR dn.diag_demolir_descricao IS NOT NULL
      OR dn.diag_demolir_m2 IS NOT NULL
      OR dn.diag_proteger_descricao IS NOT NULL
      OR dn.diag_intervencao_tipo IS NOT NULL
      OR dn.diag_intervencao_descricao IS NOT NULL
      -- NOVO (20261203080000): os materiais são tabela filha e sobrevivem ao
      -- apagamento dos campos diag_*. Uma necessidade só com materiais TEM
      -- levantamento e tem de chegar ao armazém.
      OR EXISTS (
           SELECT 1
           FROM public.deal_need_diagnostic_materials m
           WHERE m.deal_need_id = dn.id
         )
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count;
END;
$function$;

COMMENT ON FUNCTION public.rpc_snapshot_quote_diagnostic(uuid, uuid) IS
  'Congela em quote_diagnostic_snapshot o diagnóstico das necessidades do negócio p_deal_id que tenham levantamento — algum campo diag_* preenchido OU pelo menos um material em deal_need_diagnostic_materials. REGRA DE NEGÓCIO (não remover): se já existir um contrato ASSINADO a resolver para este orçamento (client_contracts.quote_id, ou a quote mais recente de quotes.proposal_id quando quote_id é NULL; status signed/assinado), a função NÃO escreve nada e devolve o número de necessidades que a fotografia já tem. O diagnóstico que acompanha a Encomenda de Cliente é imutável depois da assinatura: o que for acrescentado à obra depois entra por campo próprio na encomenda, nunca por alteração do que foi contratado (a margem é tratada de forma diferente). Nunca levanta exceção neste caminho — é chamada em cada gravação de orçamento e não pode fazer o save falhar. Idempotente enquanto não há contrato assinado (apaga e reinsere a fotografia do orçamento).';

GRANT EXECUTE ON FUNCTION public.rpc_snapshot_quote_diagnostic(uuid, uuid) TO authenticated;
