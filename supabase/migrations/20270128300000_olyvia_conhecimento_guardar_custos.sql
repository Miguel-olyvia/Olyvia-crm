-- 26/11/2026: o robô do servidor (agentes-obra) não tem quotes.view_costs e lê as linhas com o custo a 0; escrevia «margem prevista 100%»
-- em todos os negócios. Agora quem não vê custos não manda itens «custos» (conhecimentoOlyvia.ts) e a gravação completa guarda os que já
-- lá estão (escritos pelo browser de quem os vê). Limpa-se também os custos a 0 que ficaram.
-- Reversão: voltar a pôr a função de 20270128200000.

SET lock_timeout = '5s';

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
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_itens) i WHERE i->>'chave' = k.chave)
      -- 26/11: quem não vê custos (o robô do servidor) não manda nenhum item «custos»: os que lá estão ficam
      AND NOT (k.tipo = 'custos' AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_itens) i WHERE i->>'tipo' = 'custos'));
  END IF;
  RETURN v_n;
END $$;

DELETE FROM public.olyvia_conhecimento WHERE tipo = 'custos' AND coalesce((dados->>'custo')::numeric, 0) <= 0;

SELECT count(*) AS custos_que_ficam FROM public.olyvia_conhecimento WHERE tipo = 'custos';
