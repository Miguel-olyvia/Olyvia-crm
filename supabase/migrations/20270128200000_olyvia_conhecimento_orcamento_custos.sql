-- 26/11/2026 (Rúben: «faz isso ao máximo detalhe, super bonito e detalhado»): a base de conhecimento da Olyvia (20270128000000) passa a
-- ter o orçamento ao detalhe e os custos, para o chat, a voz e os relatórios (/relatorios/olyvia) em qualquer página:
--   · orcamento : as linhas, os totais por fase e por taxa de IVA, as adendas e as prestações (o que o cliente vê) — quem vê o negócio;
--   · custos    : o custo e a margem, previstos e reais por fase — quem vê o negócio E tem quotes.view_costs.
-- Reversão: voltar a pôr o CHECK e a política de 20270128000000 e apagar as linhas destes dois tipos.

SET lock_timeout = '5s';

ALTER TABLE public.olyvia_conhecimento DROP CONSTRAINT IF EXISTS olyvia_conhecimento_tipo_check;
ALTER TABLE public.olyvia_conhecimento ADD CONSTRAINT olyvia_conhecimento_tipo_check
  CHECK (tipo IN ('guia', 'resumo', 'negocio', 'obra', 'orcamento', 'custos'));

DROP POLICY IF EXISTS olyvia_conhecimento_ler ON public.olyvia_conhecimento;
CREATE POLICY olyvia_conhecimento_ler ON public.olyvia_conhecimento FOR SELECT TO authenticated USING (
  organization_id IN (SELECT o FROM public.get_user_visible_org_ids(auth.uid()) AS o)
  AND (
    tipo = 'guia'
    OR (tipo = 'resumo' AND (public.has_anew_permission(auth.uid(), 'negocios.obra.planear') OR public.has_anew_permission(auth.uid(), 'negocios.obra.executar')))
    -- o negócio tem de ser visível pela regra de acesso dos negócios (a RLS de public.negocios aplica-se a quem lê)
    OR (tipo IN ('negocio', 'obra', 'orcamento') AND EXISTS (
      SELECT 1 FROM public.negocios n WHERE n.organization_id = olyvia_conhecimento.organization_id AND n.numero = olyvia_conhecimento.numero AND n.deleted_at IS NULL))
    -- os custos e a margem: só quem vê custos
    OR (tipo = 'custos' AND public.has_anew_permission(auth.uid(), 'quotes.view_costs') AND EXISTS (
      SELECT 1 FROM public.negocios n WHERE n.organization_id = olyvia_conhecimento.organization_id AND n.numero = olyvia_conhecimento.numero AND n.deleted_at IS NULL))
  )
);

-- a gravação aceita os dois tipos novos (o resto da função fica igual)
CREATE OR REPLACE FUNCTION public.olyvia_conhecimento_gravar(p_org uuid, p_itens jsonb, p_completo boolean DEFAULT true)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_n integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_anew_permission(auth.uid(), 'negocios.obra.planear') THEN
    RAISE EXCEPTION 'Sem permissão para atualizar a base de conhecimento' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (p_org IN (SELECT o FROM public.get_user_visible_org_ids(auth.uid()) AS o)) THEN
    RAISE EXCEPTION 'Organização fora do âmbito' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) > 4000 THEN
    RAISE EXCEPTION 'Itens inválidos' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO public.olyvia_conhecimento AS k (organization_id, chave, tipo, numero, titulo, texto, dados, atualizado_em)
  SELECT p_org, left(i->>'chave', 120), i->>'tipo', nullif(i->>'numero', '')::integer, left(i->>'titulo', 300), left(i->>'texto', 6000),
         coalesce(i->'dados', '{}'::jsonb), now()
  FROM jsonb_array_elements(p_itens) i
  WHERE i->>'tipo' IN ('guia', 'resumo', 'negocio', 'obra', 'orcamento', 'custos') AND coalesce(i->>'chave', '') <> '' AND coalesce(i->>'titulo', '') <> ''
  ON CONFLICT (organization_id, chave) DO UPDATE
    SET tipo = excluded.tipo, numero = excluded.numero, titulo = excluded.titulo, texto = excluded.texto, dados = excluded.dados, atualizado_em = now();
  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF p_completo THEN
    DELETE FROM public.olyvia_conhecimento k
    WHERE k.organization_id = p_org
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_itens) i WHERE i->>'chave' = k.chave);
  END IF;
  RETURN v_n;
END $$;
