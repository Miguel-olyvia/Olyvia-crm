-- quote_diagnostic_area_suggestions passa a ser auto-suficiente — deixa de
-- depender de quote_line_id para saber O QUE foi sugerido/aceite.
--
-- Mudança de arquitetura pedida pelo utilizador (10/09/2026, sessão de
-- diagnóstico Fase 1): aceitar uma sugestão (regra ou IA) já NÃO cria uma
-- linha no orçamento — os itens do orçamento continuam sempre a ser
-- adicionados manualmente, sem ligação automática ao diagnóstico. A sugestão
-- aceite fica só registada, para alimentar mais tarde uma nota de
-- encomenda/ordem de trabalho para o armazém e a equipa de obra.
--
-- Antes desta migração, quote_diagnostic_area_suggestions só guardava a
-- ORIGEM (regra/IA, quantidade) e um quote_line_id que apontava para a linha
-- real do orçamento — era aí que vivia a descrição/produto/serviço. Sem
-- nunca mais haver essa linha, isso deixaria de existir nalgum lado. Esta
-- migração acrescenta as colunas que faltam para o registo ficar completo
-- por si só, e quote_line_id passa a ficar sempre NULL nos registos novos
-- (mantido na tabela só por compatibilidade com os 2 registos de teste
-- já existentes na BD viva, criados antes desta mudança).
--
-- Colunas novas, todas opcionais (os 2 registos de teste já existentes
-- ficam com tudo NULL — não há dados reais em produção a proteger aqui):
--   target_type/product_id/service_id/catalog_item_id — mesmo padrão de
--   mútua exclusividade já usado em quote_suggestion_rules.target_type.
--   descricao/unidade — texto livre, mesma origem que já alimentava
--   quote_lines.descricao_snapshot/unidade nesta funcionalidade.

ALTER TABLE public.quote_diagnostic_area_suggestions
  ADD COLUMN target_type text CHECK (target_type IN ('product','service','catalog_item')),
  ADD COLUMN product_id uuid REFERENCES public.products(id),
  ADD COLUMN service_id uuid REFERENCES public.services(id),
  ADD COLUMN catalog_item_id uuid REFERENCES public.catalog_items(id),
  ADD COLUMN descricao text,
  ADD COLUMN unidade text;

ALTER TABLE public.quote_diagnostic_area_suggestions
  ADD CONSTRAINT quote_diagnostic_area_suggestions_target_check CHECK (
    target_type IS NULL OR
    (target_type = 'product' AND product_id IS NOT NULL AND service_id IS NULL AND catalog_item_id IS NULL) OR
    (target_type = 'service' AND service_id IS NOT NULL AND product_id IS NULL AND catalog_item_id IS NULL) OR
    (target_type = 'catalog_item' AND catalog_item_id IS NOT NULL AND product_id IS NULL AND service_id IS NULL)
  );

COMMENT ON TABLE public.quote_diagnostic_area_suggestions IS
  'Registo autónomo de cada sugestão aceite na Fase 1 (regra ou IA) — descricao/target_type/product_id/service_id/catalog_item_id/unidade guardam por si só o que foi validado como necessário, sem depender de existir uma quote_line (que deixou de ser criada ao aceitar). quote_line_id mantido só por compatibilidade histórica, sempre NULL em registos novos. Fonte de dados para uma futura nota de encomenda/ordem de trabalho. Sem organization_id próprio — âmbito derivado de quote_diagnostic_areas.organization_id. Sem RLS anon/portal.';

-- ============================================================
-- rpc_record_diagnostic_suggestion_accepted — grava uma sugestão aceite,
-- SEM criar nenhuma quote_line. Chamada diretamente pelo ecrã de
-- diagnóstico no momento do clique em "Aceitar" (antes: bubbling até
-- QuoteBuilder.tsx, que só gravava isto mais tarde, condicionado a existir
-- uma linha correspondente em p_lines de rpc_save_quote — mecanismo agora
-- morto, rpc_save_quote nunca mais recebe nada em p_diagnostic_suggestions
-- mas fica intacto, o parâmetro já tinha DEFAULT '[]'::jsonb).
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_record_diagnostic_suggestion_accepted(
  p_diagnostic_area_id uuid,
  p_source              text,
  p_source_field        text,
  p_target_type         text,
  p_descricao           text,
  p_qty                 numeric,
  p_product_id          uuid DEFAULT NULL,
  p_service_id          uuid DEFAULT NULL,
  p_catalog_item_id     uuid DEFAULT NULL,
  p_unidade             text DEFAULT NULL,
  p_rule_id             uuid DEFAULT NULL,
  p_ai_rationale        text DEFAULT NULL,
  p_ai_confidence       numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_area public.quote_diagnostic_areas;
  v_id   uuid;
BEGIN
  IF p_source_field NOT IN ('area_m2','demolir','proteger','intervencao') THEN
    RAISE EXCEPTION 'Campo de origem inválido: %', p_source_field USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_area FROM public.quote_diagnostic_areas WHERE id = p_diagnostic_area_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Área de diagnóstico não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_area.organization_id IS NULL
     OR v_area.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Área fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.quote_diagnostic_area_suggestions (
    diagnostic_area_id, quote_line_id, source, rule_id, ai_rationale, ai_confidence,
    source_field, suggested_qty, was_edited_by_user,
    target_type, product_id, service_id, catalog_item_id, descricao, unidade
  )
  VALUES (
    p_diagnostic_area_id, NULL, p_source, p_rule_id, p_ai_rationale, p_ai_confidence,
    p_source_field, p_qty, false,
    p_target_type, p_product_id, p_service_id, p_catalog_item_id, p_descricao, p_unidade
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_record_diagnostic_suggestion_accepted(uuid, text, text, text, text, numeric, uuid, uuid, uuid, text, uuid, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_record_diagnostic_suggestion_accepted(uuid, text, text, text, text, numeric, uuid, uuid, uuid, text, uuid, text, numeric) TO authenticated;

COMMENT ON FUNCTION public.rpc_record_diagnostic_suggestion_accepted(uuid, text, text, text, text, numeric, uuid, uuid, uuid, text, uuid, text, numeric) IS
  'Grava uma sugestão da Fase 1 (regra ou IA) aceite pelo utilizador — auto-suficiente, nunca cria nem depende de quote_lines. Chamada diretamente por QuoteDiagnosticPhase.tsx no clique em "Aceitar". A mesma validação de âmbito (organization_id) de rpc_save_diagnostic_area/rpc_preview_diagnostic_suggestions.';
