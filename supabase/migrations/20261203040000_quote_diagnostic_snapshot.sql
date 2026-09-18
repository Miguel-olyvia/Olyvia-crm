-- quote_diagnostic_snapshot — cópia congelada do diagnóstico da necessidade no momento
-- em que o orçamento é feito, + rpc_snapshot_quote_diagnostic() que a produz.
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Why this migration exists
-- --------------------------
-- O diagnóstico vive em deal_needs (20261203010000) e continua a ser editado depois do
-- orçamento sair: alguém volta ao negócio, corrige a área, acrescenta material. Se a
-- encomenda de cliente/armazém lesse o diagnóstico ao vivo, o documento mudava por
-- baixo dos pés de quem já o tinha em mãos. Esta tabela é a fotografia: o que o
-- diagnóstico dizia quando o orçamento foi construído, imutável a partir daí.
--
-- materials é jsonb de propósito (e não uma tabela filha): é uma cópia morta, nunca
-- volta a ser editada nem cruzada com o catálogo. Continua a valer a regra de negócio:
-- o diagnóstico é APENAS INFORMATIVO para o armazém — não cria linhas de orçamento nem
-- mão de obra.
--
-- UNIQUE (quote_id, deal_need_id): uma fotografia por necessidade dentro do orçamento.
-- A RPC é idempotente — apaga e reinsere — por isso pode ser chamada as vezes que
-- forem precisas até o orçamento fechar.
--
-- Prerequisites:
--   20260615130000_baseline_new_database.sql — quotes, deals, deal_needs,
--                                              anew_organizations,
--                                              get_user_visible_org_ids()
--   20261203010000_diagnostico_deal_needs_campos_e_materiais.sql — deal_needs.diag_*,
--                                              deal_need_diagnostic_materials
--
-- Nota de segurança (RLS): tabela estritamente interna — sem policy "anon_*" nem
-- baseada em portal_user_can_see_document(). O diagnóstico nunca é exposto ao portal
-- do cliente nem ao link público de proposta.

-- ============================================================
-- 1. quote_diagnostic_snapshot
-- ============================================================

CREATE TABLE IF NOT EXISTS public.quote_diagnostic_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  -- Sem FK para deal_needs de propósito: a fotografia tem de sobreviver ao
  -- desaparecimento da necessidade de origem — é essa a razão de ser dela.
  deal_need_id uuid,
  need_title text,
  diag_area_m2 numeric(10,2),
  diag_demolir_descricao text,
  diag_demolir_m2 numeric(10,2),
  diag_proteger_descricao text,
  diag_intervencao_tipo text,
  diag_intervencao_descricao text,
  materials jsonb NOT NULL DEFAULT '[]'::jsonb,
  organization_id uuid NOT NULL REFERENCES public.anew_organizations(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_diagnostic_snapshot_quote_need_key UNIQUE (quote_id, deal_need_id)
);

COMMENT ON TABLE public.quote_diagnostic_snapshot IS
  'Cópia CONGELADA do diagnóstico das necessidades (deal_needs.diag_*) no momento em que o orçamento foi construído. Escrita apenas por rpc_snapshot_quote_diagnostic(). Não voltar a ler o diagnóstico ao vivo nos documentos de encomenda — mudaria debaixo de quem já os tem.';

COMMENT ON COLUMN public.quote_diagnostic_snapshot.materials IS
  'Array congelado dos materiais do diagnóstico: [{descricao, quantity, unidade, product_id, service_id}]. Informativo para o armazém — nunca gera linhas de orçamento nem mão de obra.';

CREATE INDEX IF NOT EXISTS idx_quote_diagnostic_snapshot_quote
  ON public.quote_diagnostic_snapshot (quote_id);

-- ------------------------------------------------------------
-- RLS — mesmo padrão org-scoped de quote_diagnostic_areas (20261119140000)
-- ------------------------------------------------------------
ALTER TABLE public.quote_diagnostic_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quote_diagnostic_snapshot_select_policy ON public.quote_diagnostic_snapshot;
CREATE POLICY quote_diagnostic_snapshot_select_policy ON public.quote_diagnostic_snapshot
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT get_user_visible_org_ids(auth.uid())));

DROP POLICY IF EXISTS quote_diagnostic_snapshot_insert_policy ON public.quote_diagnostic_snapshot;
CREATE POLICY quote_diagnostic_snapshot_insert_policy ON public.quote_diagnostic_snapshot
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT get_user_visible_org_ids(auth.uid())));

DROP POLICY IF EXISTS quote_diagnostic_snapshot_update_policy ON public.quote_diagnostic_snapshot;
CREATE POLICY quote_diagnostic_snapshot_update_policy ON public.quote_diagnostic_snapshot
  FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT get_user_visible_org_ids(auth.uid())))
  WITH CHECK (organization_id IN (SELECT get_user_visible_org_ids(auth.uid())));

DROP POLICY IF EXISTS quote_diagnostic_snapshot_delete_policy ON public.quote_diagnostic_snapshot;
CREATE POLICY quote_diagnostic_snapshot_delete_policy ON public.quote_diagnostic_snapshot
  FOR DELETE TO authenticated
  USING (organization_id IN (SELECT get_user_visible_org_ids(auth.uid())));

-- GRANT deliberadamente só de leitura para authenticated: a escrita é feita por
-- rpc_snapshot_quote_diagnostic() (SECURITY DEFINER), que valida o âmbito de
-- organização. Sendo esta tabela a "fotografia" que o documento de encomenda mostra,
-- não se dá ao cliente da API a possibilidade de a reescrever diretamente. As policies
-- de escrita acima ficam já definidas (e org-scoped) para o dia em que for preciso
-- alargar o GRANT — nunca a policy.
GRANT SELECT ON public.quote_diagnostic_snapshot TO authenticated;
GRANT ALL ON public.quote_diagnostic_snapshot TO service_role;

-- ============================================================
-- 2. rpc_snapshot_quote_diagnostic — congela o diagnóstico do negócio no orçamento
-- ============================================================

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
    -- Só necessidades com diagnóstico: uma necessidade sem levantamento não tem
    -- fotografia nenhuma para tirar.
    AND (
      dn.diag_area_m2 IS NOT NULL
      OR dn.diag_demolir_descricao IS NOT NULL
      OR dn.diag_demolir_m2 IS NOT NULL
      OR dn.diag_proteger_descricao IS NOT NULL
      OR dn.diag_intervencao_tipo IS NOT NULL
      OR dn.diag_intervencao_descricao IS NOT NULL
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count;
END;
$function$;

COMMENT ON FUNCTION public.rpc_snapshot_quote_diagnostic(uuid, uuid) IS
  'Congela em quote_diagnostic_snapshot o diagnóstico das necessidades do negócio p_deal_id que tenham algum campo diag_* preenchido, incluindo a lista de materiais. Idempotente (apaga e reinsere a fotografia do orçamento). Devolve o número de necessidades copiadas.';

GRANT EXECUTE ON FUNCTION public.rpc_snapshot_quote_diagnostic(uuid, uuid) TO authenticated;
