-- =============================================================================
-- Catálogo — mudar SÓ o serviço que um produto traz (products.servico_id e fator_servico).
-- Base de RH (uetjghdkwbywbftedtth).
-- =============================================================================
--
-- Problema (20/11, Mudelar): na página leve de Produtos a ficha do produto não deixava escolher o serviço que o instala; ligar
-- um serviço só se fazia por SQL. cat_guardar_produto grava o produto TODO (nome, unidade, categoria do catálogo, entulho,
-- descrição…) e a ficha leve não tem todos esses campos: usá-la para mudar só o serviço podia apagar o resto.
--
-- O que acrescenta (sem tabelas, colunas nem índices novos; nenhuma função existente muda):
--   cat_definir_servico_produto(p_org uuid, p_produto uuid, p_servico uuid, p_fator numeric DEFAULT 1) → jsonb
--     {id, servico_id, fator_servico}
--     p_servico null tira o serviço (o fator volta a 1). Com serviço, p_fator > 0 (o CHECK da coluna) e até 100000.
--     Permissão: products.edit (fn_cat_exigir, como cat_guardar_produto).
--     Erros: CT001 sem permissão; CT002 serviço de outra organização ou apagado, ou fator inválido; CT003 produto inexistente,
--     apagado ou de outra organização.
--
-- O ecrã (src/emylia/real/servicosDoProduto.ts) já trata a função em falta: diz que falta esta migração e não grava nada.
-- ATENÇÃO antes do db push: `supabase db push` aplica TUDO o que estiver pendente; listar com
-- `supabase migration list --linked` antes. Aplicar à mão no editor SQL é o habitual.
-- =============================================================================

SET lock_timeout = '5s';

DO $g$
BEGIN
  IF to_regprocedure('public.fn_cat_exigir(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Falta public.fn_cat_exigir(uuid,text). Rever esta migration.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'servico_id')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'fator_servico') THEN
    RAISE EXCEPTION 'Falta products.servico_id ou products.fator_servico. Rever esta migration.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'cat_definir_servico_produto') THEN
    RAISE EXCEPTION 'Já existe cat_definir_servico_produto. Rever esta migration.';
  END IF;
END $g$;

CREATE FUNCTION public.cat_definir_servico_produto(p_org uuid, p_produto uuid, p_servico uuid, p_fator numeric DEFAULT 1)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := public.fn_cat_exigir(p_org, 'products.edit');
  v_fator numeric := round(CASE WHEN p_servico IS NULL THEN 1 ELSE coalesce(p_fator, 1) END, 4);
  v_id uuid;
BEGIN
  IF p_servico IS NOT NULL AND NOT EXISTS (SELECT 1 FROM services s WHERE s.id = p_servico AND s.organization_id = p_org AND NOT s.is_deleted) THEN
    RAISE EXCEPTION 'Serviço desconhecido nesta organização.' USING ERRCODE = 'CT002';
  END IF;
  IF v_fator <= 0 OR v_fator > 100000 THEN
    RAISE EXCEPTION 'O fator tem de ser maior que zero (até 100000).' USING ERRCODE = 'CT002';
  END IF;
  UPDATE products SET servico_id = p_servico, fator_servico = v_fator, updated_at = now()
  WHERE id = p_produto AND organization_id = p_org AND NOT is_deleted
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Produto não encontrado.' USING ERRCODE = 'CT003'; END IF;
  RETURN jsonb_build_object('id', v_id, 'servico_id', p_servico, 'fator_servico', v_fator);
END $$;

REVOKE ALL ON FUNCTION public.cat_definir_servico_produto(uuid,uuid,uuid,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_definir_servico_produto(uuid,uuid,uuid,numeric) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_definir_servico_produto(uuid,uuid,uuid,numeric) IS
  'Muda só o serviço que o produto traz (servico_id) e o fator; null tira-o. products.edit. 20270126100000.';
