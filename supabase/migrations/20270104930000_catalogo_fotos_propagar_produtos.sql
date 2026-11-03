-- ============================================================
-- 20270104930000_catalogo_fotos_propagar_produtos
-- ============================================================
-- Fotos do catálogo do fornecedor → produtos do CRM, também DEPOIS da ligação.
-- Base RH (uetjghdkwbywbftedtth). NUNCA a principal.
--
-- Problema: a cópia de supplier_catalog_items.image_paths para products.image_urls só acontecia ao ligar
-- (rpc_catalog_link / cat_ligar_produto_artigo). Produto ligado antes de o fornecedor carregar a foto
-- (ex.: "bolas", sku 31232131) ficava sem foto para sempre.
--
-- Só funções, nenhuma estrutura nova.
--
-- Funções novas
--   • fn_sp_catalog_copy_images_to_linked_products(artigo) — interna (sem EXECUTE para anon/authenticated):
--     para cada produto ligado ao artigo (item_suppliers.catalog_item_id, ligação e produto não apagados)
--     chama fn_sp_catalog_copy_images_to_product (inalterada: só escreve image_urls se o produto não tiver fotos).
--     Devolve quantos produtos ficaram com fotos.
--
-- Funções reescritas (a partir da versão viva, pg_get_functiondef, 03/11/2026)
--   • sp_catalog_image_register — depois de acrescentar a foto, propaga para os produtos ligados ao artigo.
--     O artigo já foi validado como sendo da conta do titular (fn_sp_actor + owner + supplier_account_id), por
--     isso a escrita fica limitada a image_urls de produtos ligados a esse artigo. Resposta + 'products_updated'.
--   • cat_ler_catalogo — 'produtos' passa a trazer image_urls (miniatura na lista do Catálogo e custos e na
--     ficha do produto). Só leitura; mesma permissão (services.view) e mesmo filtro de organização.
--
-- Regras que se mantêm
--   • Produto com fotos (image_urls não vazio) nunca é tocado.
--   • sp_catalog_image_remove / sp_catalog_image_reorder NÃO mexem no produto.
--   • updated_at do artigo não muda (é a data do preço). products.updated_at é avançado pelo gatilho
--     update_products_updated_at, tal como já acontecia em rpc_catalog_link; nenhuma lógica de preço lê
--     products.updated_at (os preços usam product_prices.updated_at e item_suppliers.preco_data).
--
-- Acerto único (backfill)
--   Na migração não há JWT, e fn_sp_catalog_image_public_url monta o URL a partir do iss do JWT. Para usar
--   exatamente o mesmo helper, define-se request.jwt.claims só nesta transação (set_config(..., true)) com o
--   iss do projeto RH: https://uetjghdkwbywbftedtth.supabase.co/auth/v1. O endereço do projeto fica escrito
--   APENAS neste bloco de acerto, nunca nas funções.

BEGIN;

-- ═══ 1. Propagar para os produtos ligados ═══════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_sp_catalog_copy_images_to_linked_products(p_catalog_item_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r   record;
  v_n integer := 0;
BEGIN
  IF p_catalog_item_id IS NULL THEN
    RETURN 0;
  END IF;
  FOR r IN
    SELECT DISTINCT s.product_id
    FROM public.item_suppliers s
    JOIN public.products p ON p.id = s.product_id
    WHERE s.catalog_item_id = p_catalog_item_id
      AND s.product_id IS NOT NULL
      AND s.deleted_at IS NULL
      AND COALESCE(p.is_deleted, false) = false
      AND p.deleted_at IS NULL
      AND (p.image_urls IS NULL OR cardinality(p.image_urls) = 0)
  LOOP
    IF public.fn_sp_catalog_copy_images_to_product(r.product_id, p_catalog_item_id) > 0 THEN
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RETURN v_n;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_sp_catalog_copy_images_to_linked_products(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sp_catalog_copy_images_to_linked_products(uuid) TO service_role;

-- ═══ 2. sp_catalog_image_register (versão viva + propagação) ═══════════════

CREATE OR REPLACE FUNCTION public.sp_catalog_image_register(p_catalog_item_id uuid, p_path text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  u      public.supplier_portal_users := public.fn_sp_actor();
  ci     public.supplier_catalog_items;
  v_mime text;
  v_size bigint;
  v_prod integer;
BEGIN
  IF u.role <> 'owner' THEN
    RAISE EXCEPTION 'Só o utilizador principal da conta pode alterar o catálogo'
      USING ERRCODE = 'insufficient_privilege', HINT = 'not_owner';
  END IF;
  SELECT * INTO ci FROM public.supplier_catalog_items
  WHERE id = p_catalog_item_id AND supplier_account_id = u.supplier_account_id FOR UPDATE;
  IF ci.id IS NULL THEN
    RAISE EXCEPTION 'Artigo não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;
  IF NOT public.fn_sp_catalog_image_path_ok(u.supplier_account_id, ci.id, p_path) THEN
    RAISE EXCEPTION 'Caminho da foto inválido para este artigo' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;

  IF p_path = ANY (ci.image_paths) THEN
    RETURN jsonb_build_object('item', public.fn_sp_catalog_item_json(ci, true), 'already_registered', true);
  END IF;

  -- Só a Edge escreve no bucket (políticas RESTRICTIVE): o objeto existir é prova de que os bytes foram vistos.
  SELECT lower(o.metadata ->> 'mimetype'), (o.metadata ->> 'size')::bigint INTO v_mime, v_size
  FROM storage.objects o
  WHERE o.bucket_id = 'supplier-catalog-images' AND o.name = p_path;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'A foto não foi carregada' USING ERRCODE = 'no_data_found', HINT = 'validation';
  END IF;
  IF v_mime IS NULL OR v_mime NOT IN ('image/jpeg', 'image/png', 'image/webp')
     OR v_size IS NULL OR v_size <= 0 OR v_size > 5242880 THEN
    RAISE EXCEPTION 'Só se aceitam fotos JPEG, PNG ou WEBP até 5 MB' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;

  IF cardinality(ci.image_paths) >= 4 THEN
    RAISE EXCEPTION 'Cada artigo pode ter no máximo 4 fotos' USING ERRCODE = 'check_violation', HINT = 'limit';
  END IF;

  UPDATE public.supplier_catalog_items
     SET image_paths = image_paths || p_path, updated_by_portal_user = u.id
   WHERE id = ci.id
  RETURNING * INTO ci;

  -- Produtos já ligados a este artigo (da própria conta, validado acima) e ainda sem fotos ficam com as do artigo.
  v_prod := public.fn_sp_catalog_copy_images_to_linked_products(ci.id);

  RETURN jsonb_build_object('item', public.fn_sp_catalog_item_json(ci, true), 'already_registered', false,
                            'products_updated', v_prod);
END;
$function$;

-- ═══ 3. Acerto único (backfill) ═════════════════════════════════════════════

DO $backfill$
DECLARE
  r   record;
  v_n integer := 0;
BEGIN
  -- Mesmo helper de URL que as RPCs: iss do projeto RH só nesta transação.
  PERFORM set_config('request.jwt.claims',
                     jsonb_build_object('iss', 'https://uetjghdkwbywbftedtth.supabase.co/auth/v1')::text, true);
  FOR r IN
    SELECT ci.id FROM public.supplier_catalog_items ci
    WHERE cardinality(ci.image_paths) > 0
      AND EXISTS (SELECT 1 FROM public.item_suppliers s WHERE s.catalog_item_id = ci.id AND s.deleted_at IS NULL)
  LOOP
    v_n := v_n + public.fn_sp_catalog_copy_images_to_linked_products(r.id);
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE 'catalogo_fotos_propagar_produtos: % produto(s) ficaram com fotos', v_n;
END;
$backfill$;

-- ═══ 4. cat_ler_catalogo (versão viva + image_urls dos produtos) ══════════════

CREATE OR REPLACE FUNCTION public.cat_ler_catalogo(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r jsonb; v_ret boolean;
BEGIN
  PERFORM public.fn_cat_exigir(p_org, 'services.view');
  -- 20261231998000: o custo/hora de cada técnico só vai a quem vê as retribuições; a média por ofício (perfis) vai sempre
  v_ret := public.is_system_admin_user(auth.uid()) OR public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.retribuicao.view', p_org);
  WITH svc AS (SELECT * FROM services WHERE organization_id = p_org AND no_catalogo AND NOT is_deleted),
       prod AS (SELECT * FROM products WHERE organization_id = p_org AND tipo_catalogo IS NOT NULL AND NOT is_deleted),
       -- as pessoas técnicas (cargo técnico de obra, sem saída passada) e os ofícios efetivos (do cargo e extras)
       rh AS (SELECT p.id, p.nome_completo, array_agg(e.skill_id ORDER BY e.skill_id) AS perfis FROM pessoas p
              CROSS JOIN LATERAL public.fn_rh_oficios_efetivos(p_org, p.id) e
              WHERE p.organization_id = p_org AND p.deleted_at IS NULL AND (p.data_saida IS NULL OR p.data_saida >= current_date)
              GROUP BY p.id, p.nome_completo)
  SELECT jsonb_build_object(
    'parametros', (SELECT to_jsonb(x) FROM (SELECT meses, tsu, seguros_ano, horas_ano, horas_mes, meses_desatualizado, margem_minima, margem_alvo
                    FROM cat_parametros WHERE organization_id = p_org) x),
    'margemLinha', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT linha, margem_minima FROM cat_margem_linha WHERE organization_id = p_org) x), '[]'),
    'categorias', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id, name, parent_id, sort_order FROM service_categories
                    WHERE organization_id = p_org AND NOT is_deleted) x), '[]'),
    'perfis', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT s.id, s.chave, s.nome, s.salario_referencia, s.ativo,
                    d.custo_hora, d.fonte, d.n, d.nomes, d.cargos
                    FROM ops_skill s CROSS JOIN LATERAL public.fn_cat_custo_hora_oficio_det(p_org, s.id) d WHERE s.organization_id = p_org) x), '[]'),
    'equipamentos', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id, nome, compra, vida_anos, vida_horas, residual, manutencao_ano, uso_ano_horas, ativo
                    FROM cat_equipamentos WHERE organization_id = p_org AND apagado_em IS NULL) x), '[]'),
    'estrutura', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id, nome, categoria, mensal, ativo, ordem FROM cat_estrutura
                    WHERE organization_id = p_org AND apagado_em IS NULL) x), '[]'),
    'servicos', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id, chave, name, sku, unidade, service_category_id, service_subcategory_id, linhas, medida,
                    modo_preco, margem, justificacao_preco, fases, receita_origem, icone, exige_produto_categoria_id, exige_produto_medida,
                    exige_produto_fator, exige_produto_arredondar, pergunta_manter, entulho_modo, entulho_m3, entulho_kg FROM svc) x), '[]'),
    'precosServico', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT sp.service_id, sp.price, sp.valid_from, sp.nota, sp.vat_rate, sp.created_at
                    FROM service_prices sp JOIN svc ON svc.id = sp.service_id WHERE sp.price_type = 'retail') x), '[]'),
    'passos', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT t.servico_id, t.ordem, t.nome, t.minutos_por_unidade, t.minutos_fixos, t.skill_id, t.fase
                    FROM ops_obra_servico_tarefa t JOIN svc ON svc.id = t.servico_id WHERE t.organization_id = p_org) x), '[]'),
    'usosEquip', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT service_id, equipamento_id, horas, ordem FROM cat_servico_equipamentos
                    WHERE organization_id = p_org) x), '[]'),
    'usosCons', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT m.service_id, m.product_id, coalesce(m.quantidade_exata, m.quantity) AS quantity, m.opcional, m.sort_order
                    FROM service_materials m JOIN svc ON svc.id = m.service_id WHERE m.deleted_at IS NULL) x), '[]'),
    'produtos', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id, name, sku, tipo_catalogo, unidade, catalogo_categoria_id, servico_id, fator_servico,
                    entulho_m3, entulho_kg, short_description, marca_livre, fornecedor_livre, image_urls FROM prod) x), '[]'),
    'precosProduto', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT pp.product_id, pp.price_type::text AS price_type, coalesce(pp.preco_exato, pp.price) AS price, pp.valid_from
                    FROM product_prices pp JOIN prod ON prod.id = pp.product_id) x), '[]'),
    'fornecedores', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT v.product_id, v.purchase_price, v.preco_data, v.ligacao, su.name AS fornecedor
                    FROM cat_v_produto_fornecedor v LEFT JOIN suppliers su ON su.id = v.supplier_id WHERE v.organization_id = p_org) x), '[]'),
    -- os técnicos vêm só do RH (sai ops_utilizador_perfil); o custo/hora de cada um só com retribuicao.view
    'tecnicos', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (
                    SELECT rh.id, rh.nome_completo AS nome, CASE WHEN v_ret THEN public.fn_rh_custo_hora_pessoa(p_org, rh.id) END AS custo_hora,
                    rh.perfis FROM rh) x), '[]'),
    've_custo_tecnicos', v_ret
  ) INTO r;
  RETURN r;
END $function$;


COMMIT;
