-- RH › ofícios de obra (28/10/2026): liga as pessoas do RH aos ofícios do Catálogo (ops_skill).
--
-- O problema: o orçamento do /negocios mostra "Ofício sem custo/hora … sem técnicos no RH e sem salário no perfil". Os técnicos do
-- Catálogo (cat_ler_catalogo › tecnicos) só vinham de ops_utilizador_perfil + ops_utilizador_skill, que são utilizadores da app.
-- As pessoas do RH (pessoas) não têm conta na app (a maioria dos técnicos de obra nunca terá) e não havia onde dizer o ofício delas.
--
-- O que muda (a base só cresce; nada se apaga):
--   1. pessoas_oficios       a pessoa do RH e os ofícios que faz (um ou mais).
--   2. fn_rh_custo_hora_pessoa  o custo/hora da pessoa, pela MESMA conta do salário do perfil no Catálogo:
--                            (salário mensal × meses × (1 + TSU) + seguros do ano) ÷ horas produtivas do ano (cat_parametros).
--                            O salário é a retribuição em vigor (pessoas_retribuicoes); à hora, × horas semanais × 52 ÷ 12.
--   3. rh_ler_oficios_pessoa / rh_guardar_oficios_pessoa  o cartão "Ofícios de obra" da ficha (Detalhes laborais).
--   4. cat_ler_catalogo      os técnicos passam a ser também as pessoas do RH com ofício. Uma pessoa com conta na app que também
--                            está em ops_utilizador_perfil conta uma vez só (vale a do RH).
--
-- Permissões: ler pede hr.pessoas.laborais.view; gravar pede hr.pessoas.laborais.edit; o custo/hora no cartão só com
-- hr.pessoas.retribuicao.view. No Catálogo o custo/hora de cada técnico já se via (services.view), como o de ops_utilizador_perfil.
-- Erros: CT001 sem permissão; CT002 dados inválidos; CT003 não encontrado nesta organização.
--
-- Fica para a Fase 3 (Operações): atribuir tarefas da obra (ops_obra_tarefa_pessoa, ops_ordem_pessoa) usa utilizador_id; uma pessoa
-- do RH sem conta ainda não se atribui lá.

-- ------------------------------------------------------------------ 1. a tabela
CREATE TABLE IF NOT EXISTS public.pessoas_oficios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE RESTRICT,
  pessoa_id uuid NOT NULL,
  skill_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.anew_users(id) ON DELETE SET NULL,
  CONSTRAINT pessoas_oficios_pessoa_fkey FOREIGN KEY (pessoa_id, organization_id) REFERENCES public.pessoas(id, organization_id) ON DELETE CASCADE,
  CONSTRAINT pessoas_oficios_skill_fkey FOREIGN KEY (skill_id, organization_id) REFERENCES public.ops_skill(id, organization_id) ON DELETE CASCADE,
  CONSTRAINT pessoas_oficios_unico UNIQUE (pessoa_id, skill_id)
);
CREATE INDEX IF NOT EXISTS pessoas_oficios_org_skill_idx ON public.pessoas_oficios (organization_id, skill_id);
COMMENT ON TABLE public.pessoas_oficios IS 'Os ofícios de obra (ops_skill) de cada pessoa do RH. É o que faz dela técnico no Catálogo e no orçamento.';

ALTER TABLE public.pessoas_oficios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pessoas_oficios_ler ON public.pessoas_oficios;
CREATE POLICY pessoas_oficios_ler ON public.pessoas_oficios FOR SELECT TO authenticated
  USING ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.laborais.view', organization_id)));
-- sem políticas de escrita: grava-se só por rh_guardar_oficios_pessoa
REVOKE ALL ON public.pessoas_oficios FROM anon;
GRANT SELECT ON public.pessoas_oficios TO authenticated;
GRANT ALL ON public.pessoas_oficios TO service_role;

-- ------------------------------------------------------------------ 2. o custo/hora da pessoa
CREATE OR REPLACE FUNCTION public.fn_rh_custo_hora_pessoa(p_org uuid, p_pessoa uuid) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH par AS (
    SELECT coalesce(max(meses), 14) AS meses, coalesce(max(tsu), 23.75) AS tsu, coalesce(max(seguros_ano), 713) AS seguros,
           coalesce(max(horas_ano), 1345) AS horas_ano
    FROM cat_parametros WHERE organization_id = p_org
  ), ret AS (
    SELECT r.valor_base, r.periodicidade FROM pessoas_retribuicoes r
    WHERE r.organization_id = p_org AND r.pessoa_id = p_pessoa AND r.deleted_at IS NULL
      AND (r.valido_de IS NULL OR r.valido_de <= current_date) AND (r.valido_ate IS NULL OR r.valido_ate >= current_date)
    ORDER BY r.valido_de DESC NULLS LAST, r.created_at DESC LIMIT 1
  ), vin AS (
    SELECT coalesce(v.horas_semanais_equivalentes, 40) AS horas_semana FROM pessoas_vinculos v
    WHERE v.organization_id = p_org AND v.pessoa_id = p_pessoa AND v.deleted_at IS NULL AND v.estado = 'activo'
    ORDER BY v.data_inicio DESC NULLS LAST LIMIT 1
  ), sal AS (
    SELECT CASE ret.periodicidade
             WHEN 'mensal' THEN ret.valor_base
             WHEN 'hora' THEN ret.valor_base * coalesce((SELECT horas_semana FROM vin), 40) * 52 / 12
           END AS mensal
    FROM ret
  )
  SELECT CASE WHEN sal.mensal > 0 AND par.horas_ano > 0
              THEN round((sal.mensal * par.meses * (1 + par.tsu / 100) + par.seguros) / par.horas_ano, 2) END
  FROM sal, par
$$;
REVOKE ALL ON FUNCTION public.fn_rh_custo_hora_pessoa(uuid, uuid) FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.fn_rh_custo_hora_pessoa(uuid, uuid) IS 'Custo/hora de obra da pessoa: a retribuição em vigor pela conta do salário do perfil do Catálogo. Null sem retribuição.';

-- ------------------------------------------------------------------ 3. o cartão da ficha
CREATE OR REPLACE FUNCTION public.rh_ler_oficios_pessoa(p_org uuid, p_pessoa uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ret boolean;
BEGIN
  PERFORM public.fn_cat_exigir(p_org, 'hr.pessoas.laborais.view');
  IF NOT EXISTS (SELECT 1 FROM pessoas WHERE id = p_pessoa AND organization_id = p_org AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Pessoa não encontrada nesta organização.' USING ERRCODE = 'CT003';
  END IF;
  v_ret := public.is_system_admin_user(auth.uid()) OR public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.retribuicao.view', p_org);
  RETURN jsonb_build_object(
    'oficios', coalesce((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'nome', s.nome,
                 'ligado', EXISTS (SELECT 1 FROM pessoas_oficios po WHERE po.pessoa_id = p_pessoa AND po.skill_id = s.id)) ORDER BY s.nome)
               FROM ops_skill s WHERE s.organization_id = p_org AND (s.ativo OR EXISTS (SELECT 1 FROM pessoas_oficios po WHERE po.pessoa_id = p_pessoa AND po.skill_id = s.id))), '[]'),
    'custo_hora', CASE WHEN v_ret THEN public.fn_rh_custo_hora_pessoa(p_org, p_pessoa) END,
    've_custo', v_ret
  );
END $$;
REVOKE ALL ON FUNCTION public.rh_ler_oficios_pessoa(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rh_ler_oficios_pessoa(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rh_guardar_oficios_pessoa(p_org uuid, p_pessoa uuid, p_skills uuid[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid; v_skills uuid[] := coalesce(p_skills, '{}');
BEGIN
  v_user := public.fn_cat_exigir(p_org, 'hr.pessoas.laborais.edit');
  IF NOT EXISTS (SELECT 1 FROM pessoas WHERE id = p_pessoa AND organization_id = p_org AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Pessoa não encontrada nesta organização.' USING ERRCODE = 'CT003';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_skills) k WHERE NOT EXISTS (SELECT 1 FROM ops_skill s WHERE s.id = k AND s.organization_id = p_org)) THEN
    RAISE EXCEPTION 'Ofício que não é desta organização.' USING ERRCODE = 'CT002';
  END IF;
  DELETE FROM pessoas_oficios WHERE pessoa_id = p_pessoa AND organization_id = p_org AND NOT (skill_id = ANY (v_skills));
  INSERT INTO pessoas_oficios (organization_id, pessoa_id, skill_id, created_by)
    SELECT DISTINCT p_org, p_pessoa, k, v_user FROM unnest(v_skills) k
  ON CONFLICT (pessoa_id, skill_id) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.rh_guardar_oficios_pessoa(uuid, uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rh_guardar_oficios_pessoa(uuid, uuid, uuid[]) TO authenticated, service_role;

-- ------------------------------------------------------------------ 4. o Catálogo lê os técnicos do RH
-- Igual à de 20261231920000, só muda 'tecnicos'.
CREATE OR REPLACE FUNCTION public.cat_ler_catalogo(p_org uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  PERFORM public.fn_cat_exigir(p_org, 'services.view');
  WITH svc AS (SELECT * FROM services WHERE organization_id = p_org AND no_catalogo AND NOT is_deleted),
       prod AS (SELECT * FROM products WHERE organization_id = p_org AND tipo_catalogo IS NOT NULL AND NOT is_deleted),
       -- as pessoas do RH com ofício (ativas: sem data de saída passada)
       rh AS (SELECT p.id, p.nome_completo, array_agg(po.skill_id) AS perfis FROM pessoas p
              JOIN pessoas_oficios po ON po.pessoa_id = p.id AND po.organization_id = p_org
              WHERE p.organization_id = p_org AND p.deleted_at IS NULL AND (p.data_saida IS NULL OR p.data_saida >= current_date)
              GROUP BY p.id, p.nome_completo)
  SELECT jsonb_build_object(
    'parametros', (SELECT to_jsonb(x) FROM (SELECT meses, tsu, seguros_ano, horas_ano, horas_mes, meses_desatualizado, margem_minima, margem_alvo
                    FROM cat_parametros WHERE organization_id = p_org) x),
    'margemLinha', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT linha, margem_minima FROM cat_margem_linha WHERE organization_id = p_org) x), '[]'),
    'categorias', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id, name, parent_id, sort_order FROM service_categories
                    WHERE organization_id = p_org AND NOT is_deleted) x), '[]'),
    'perfis', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id, chave, nome, salario_referencia, ativo FROM ops_skill WHERE organization_id = p_org) x), '[]'),
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
                    entulho_m3, entulho_kg, short_description, marca_livre, fornecedor_livre FROM prod) x), '[]'),
    'precosProduto', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT pp.product_id, pp.price_type::text AS price_type, coalesce(pp.preco_exato, pp.price) AS price, pp.valid_from
                    FROM product_prices pp JOIN prod ON prod.id = pp.product_id) x), '[]'),
    'fornecedores', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT v.product_id, v.purchase_price, v.preco_data, v.ligacao, su.name AS fornecedor
                    FROM cat_v_produto_fornecedor v LEFT JOIN suppliers su ON su.id = v.supplier_id WHERE v.organization_id = p_org) x), '[]'),
    'tecnicos', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (
                    SELECT up.utilizador_id AS id, coalesce(u.name, u.email, '') AS nome, up.custo_hora,
                    coalesce((SELECT array_agg(us.skill_id) FROM ops_utilizador_skill us JOIN ops_skill sk ON sk.id = us.skill_id
                              WHERE us.utilizador_id = up.utilizador_id AND sk.organization_id = p_org), '{}') AS perfis
                    FROM ops_utilizador_perfil up LEFT JOIN anew_users u ON u.id = up.utilizador_id
                    WHERE up.organization_id = p_org AND up.ativo AND up.funcao = 'tecnico'
                      -- a mesma pessoa com ofício no RH conta pelo RH
                      AND NOT EXISTS (SELECT 1 FROM pessoas_contas pc JOIN rh ON rh.id = pc.pessoa_id
                                      WHERE pc.anew_user_id = up.utilizador_id AND pc.organization_id = p_org AND pc.estado = 'activa')
                    UNION ALL
                    SELECT rh.id, rh.nome_completo AS nome, public.fn_rh_custo_hora_pessoa(p_org, rh.id) AS custo_hora, rh.perfis FROM rh) x), '[]')
  ) INTO r;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.cat_ler_catalogo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_ler_catalogo(uuid) TO authenticated, service_role;
