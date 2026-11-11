-- F1 (testes de permissões, Área 1, 11/11/2026): um perfil comercial sem services.view não abria Negócios, Hoje nem /home
-- (cat_ler_catalogo dava CT001). Passa a devolver o Catálogo reduzido, sem valores, a quem tem pessoas.view ou uma permissão
-- negocios.* e não tem services.view: o mesmo corte que já existe para o técnico (fn_neg_so_execucao, 20270111100000).
-- Quem tem services.view continua exatamente igual. Sem services.view, sem pessoas.view e sem negocios.*: CT001 como antes.
-- Parte da definição viva (pg_get_functiondef) com guarda md5.
DO $g$
BEGIN
  IF md5(pg_get_functiondef('public.cat_ler_catalogo(uuid)'::regprocedure)) <> '7489ed4e04dff38dde8852115d0d9d54' THEN
    RAISE EXCEPTION 'cat_ler_catalogo mudou desde a leitura (md5): rever antes de aplicar';
  END IF;
END $g$;

CREATE OR REPLACE FUNCTION public.cat_ler_catalogo(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r jsonb; v_ret boolean;
  v_tec boolean; v_mat boolean; -- 20270111100000
BEGIN
  -- 20270111100000: sem services.view (perfil, papel ou admin) mas com negocios.obra.executar: o Catálogo sem dinheiro. Ficam técnicos,
  -- ofícios (sem custo/hora nem salário), categorias, serviços (sem margem nem justificação do preço), passos, equipamentos (sem compra,
  -- residual e manutenção) e os seus usos; os produtos e os consumos só com negocios.obra.materiais. Fora: parâmetros, margens,
  -- estrutura, preços de serviço e de produto e fornecedores.
  v_tec := public.fn_neg_so_execucao(p_org, 'services.view');
  -- 20270113100000 (F1): sem services.view, quem tem pessoas.view ou uma permissão negocios.* (perfil, papel ou admin) recebe o
  -- mesmo corte do técnico (sem preços, custos, margens, parâmetros, estrutura nem fornecedores; os produtos só com
  -- negocios.obra.materiais). Sem nada disto continua o CT001. Quem tem services.view fica igual.
  IF NOT v_tec AND NOT public.fn_cat_pode(p_org, 'services.view') THEN
    v_tec := public.fn_cat_pode(p_org, 'pessoas.view')
      OR EXISTS (SELECT 1 FROM public.anew_permissions ap
                 WHERE ap.code LIKE 'negocios.%' AND public.fn_cat_pode(p_org, ap.code));
  END IF;
  IF NOT v_tec THEN
    PERFORM public.fn_cat_exigir(p_org, 'services.view');
  END IF;
  v_mat := NOT v_tec OR public.fn_cat_pode(p_org, 'negocios.obra.materiais');
  -- 20261231998000: o custo/hora de cada técnico só vai a quem vê as retribuições; a média por ofício (perfis) vai sempre
  v_ret := public.is_system_admin_user(auth.uid()) OR public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.retribuicao.view', p_org);
  WITH svc AS (SELECT * FROM services WHERE organization_id = p_org AND no_catalogo AND NOT is_deleted),
       prod AS (SELECT * FROM products WHERE organization_id = p_org AND tipo_catalogo IS NOT NULL AND NOT is_deleted),
       -- as pessoas técnicas (cargo técnico de obra, sem saída passada) e os ofícios efetivos (do cargo e extras)
       -- 20270110600000: entram também as do perfil de técnico de obra (negocios.obra.tecnico), mesmo sem ofícios (perfis vazio);
       --   as de cargo técnico sem ofícios continuam de fora
       rh AS (SELECT p.id, p.nome_completo,
                     coalesce(array_agg(e.skill_id ORDER BY e.skill_id) FILTER (WHERE e.skill_id IS NOT NULL), '{}') AS perfis FROM pessoas p
              LEFT JOIN LATERAL public.fn_rh_oficios_efetivos(p_org, p.id) e ON true
              WHERE p.organization_id = p_org AND p.deleted_at IS NULL AND (p.data_saida IS NULL OR p.data_saida >= current_date)
                AND (e.skill_id IS NOT NULL OR public.fn_rh_pessoa_tecnico_por_perfil(p_org, p.id))
              GROUP BY p.id, p.nome_completo)
  SELECT jsonb_build_object(
    'parametros', CASE WHEN v_tec THEN NULL ELSE (SELECT to_jsonb(x) FROM (SELECT meses, tsu, seguros_ano, horas_ano, horas_mes, meses_desatualizado, margem_minima, margem_alvo
                    FROM cat_parametros WHERE organization_id = p_org) x) END,
    'margemLinha', CASE WHEN v_tec THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT linha, margem_minima FROM cat_margem_linha WHERE organization_id = p_org) x), '[]') END,
    'categorias', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id, name, parent_id, sort_order FROM service_categories
                    WHERE organization_id = p_org AND NOT is_deleted) x), '[]'),
    'perfis', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT s.id, s.chave, s.nome, CASE WHEN v_tec THEN NULL ELSE s.salario_referencia END AS salario_referencia, s.ativo,
                    CASE WHEN v_tec THEN NULL ELSE d.custo_hora END AS custo_hora, d.fonte, d.n, d.nomes, d.cargos
                    FROM ops_skill s CROSS JOIN LATERAL public.fn_cat_custo_hora_oficio_det(p_org, s.id) d WHERE s.organization_id = p_org) x), '[]'),
    'equipamentos', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id, nome, CASE WHEN v_tec THEN NULL ELSE compra END AS compra, vida_anos, vida_horas,
                    CASE WHEN v_tec THEN NULL ELSE residual END AS residual, CASE WHEN v_tec THEN NULL ELSE manutencao_ano END AS manutencao_ano, uso_ano_horas, ativo
                    FROM cat_equipamentos WHERE organization_id = p_org AND apagado_em IS NULL) x), '[]'),
    'estrutura', CASE WHEN v_tec THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id, nome, categoria, mensal, ativo, ordem FROM cat_estrutura
                    WHERE organization_id = p_org AND apagado_em IS NULL) x), '[]') END,
    'servicos', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id, chave, name, sku, unidade, service_category_id, service_subcategory_id, linhas, medida,
                    modo_preco, CASE WHEN v_tec THEN NULL ELSE margem END AS margem, CASE WHEN v_tec THEN NULL ELSE justificacao_preco END AS justificacao_preco, fases, receita_origem, icone, exige_produto_categoria_id, exige_produto_medida,
                    exige_produto_fator, exige_produto_arredondar, pergunta_manter, entulho_modo, entulho_m3, entulho_kg FROM svc) x), '[]'),
    'precosServico', CASE WHEN v_tec THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT sp.service_id, sp.price, sp.valid_from, sp.nota, sp.vat_rate, sp.created_at
                    FROM service_prices sp JOIN svc ON svc.id = sp.service_id WHERE sp.price_type = 'retail') x), '[]') END,
    'passos', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT t.servico_id, t.ordem, t.nome, t.minutos_por_unidade, t.minutos_fixos, t.skill_id, t.fase
                    FROM ops_obra_servico_tarefa t JOIN svc ON svc.id = t.servico_id WHERE t.organization_id = p_org) x), '[]'),
    'usosEquip', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT service_id, equipamento_id, horas, ordem FROM cat_servico_equipamentos
                    WHERE organization_id = p_org) x), '[]'),
    'usosCons', CASE WHEN NOT v_mat THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT m.service_id, m.product_id, coalesce(m.quantidade_exata, m.quantity) AS quantity, m.opcional, m.sort_order
                    FROM service_materials m JOIN svc ON svc.id = m.service_id WHERE m.deleted_at IS NULL) x), '[]') END,
    'produtos', CASE WHEN NOT v_mat THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id, name, sku, tipo_catalogo, unidade, catalogo_categoria_id, servico_id, fator_servico,
                    entulho_m3, entulho_kg, short_description, marca_livre, fornecedor_livre, image_urls FROM prod) x), '[]') END,
    'precosProduto', CASE WHEN v_tec THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT pp.product_id, pp.price_type::text AS price_type, coalesce(pp.preco_exato, pp.price) AS price, pp.valid_from
                    FROM product_prices pp JOIN prod ON prod.id = pp.product_id) x), '[]') END,
    'fornecedores', CASE WHEN v_tec THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT v.product_id, v.purchase_price, v.preco_data, v.ligacao, su.name AS fornecedor
                    FROM cat_v_produto_fornecedor v LEFT JOIN suppliers su ON su.id = v.supplier_id WHERE v.organization_id = p_org) x), '[]') END,
    -- os técnicos vêm só do RH (sai ops_utilizador_perfil); o custo/hora de cada um só com retribuicao.view
    'tecnicos', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (
                    SELECT rh.id, rh.nome_completo AS nome, CASE WHEN v_ret THEN public.fn_rh_custo_hora_pessoa(p_org, rh.id) END AS custo_hora,
                    rh.perfis FROM rh) x), '[]'),
    've_custo_tecnicos', v_ret
  ) INTO r;
  RETURN r;
END $function$;
