-- ============================================================
-- 20270110600000 — Permissão «Ser técnico de obra» (negocios.obra.tecnico)
--
-- Quem tem este perfil e tem a conta ligada a uma pessoa do RH (pessoas_contas activa) faz o papel 'tecnico' no Negócio, como quem
-- tem cargo técnico de obra no RH: abre no Hoje do técnico, fixo em si, e executa as tarefas atribuídas a si. O papel do cargo continua.
-- Os ofícios destas pessoas são os extras ligados na ficha do RH (pessoas_oficios) e entram no custo/hora do ofício.
--
-- Sem tabelas nem colunas novas. A permissão NÃO é dada a nenhum papel aqui (nem a super_admin/system_admin) e não entra em
-- neg_papeis_permissoes. Cada CREATE OR REPLACE parte do pg_get_functiondef vivo de 9/11/2026 (guarda md5 abaixo).
--
--   1. anew_permissions: negocios.obra.tecnico (categoria 'pessoas', ordem 21).
--   2. NOVA fn_rh_pessoa_tecnico_por_perfil(org, pessoa): a pessoa tem uma conta ligada com o perfil (sem auth.uid()). Só service_role.
--   3. NOVA fn_rh_pessoa_tecnico_obra(org, pessoa) = fn_rh_pessoa_tecnica OR fn_rh_pessoa_tecnico_por_perfil. Só service_role.
--   4. fn_rh_oficios_efetivos: os extras também para quem é técnico pelo perfil (os do cargo só com cargo técnico).
--   5. fn_neg_papeis: 'tecnico' também por has_anew_permission_in_org(auth.uid(), 'negocios.obra.tecnico').
--   6. neg_papeis_dos_recursos: 'tecnico' por fn_rh_pessoa_tecnico_obra.
--   7. cat_ler_catalogo: os técnicos pelo perfil entram mesmo sem ofícios (perfis vazio).
--   8. rh_agenda_tecnicos: entra também quem é técnico só pelo perfil, e vê apenas a própria linha; lista por fn_rh_pessoa_tecnico_obra.
--   9. obra_guardar_negocio: o aviso da pessoa atribuída aceita o perfil (só aviso).
--  10. rh_guardar_oficios_pessoa: aceita o perfil; os ofícios do cargo só se descontam quando o cargo é técnico.
--  11. rh_ler_oficios_pessoa: chave nova 'tecnico_por_perfil'.
--  12. fn_permissoes_que_nao_posso_dar: negocios.obra.tecnico dá-se se quem dá já tem tudo o que o papel 'tecnico' dá
--      (neg_papeis_permissoes). Vale também para fn_papel_sem_mais_poder, que a usa.
--
-- Reversão (só como migration nova): repor as 9 funções com o texto vivo de 9/11 (md5 na guarda), DROP das 2 funções novas e apagar
--   as linhas de negocios.obra.tecnico (anew_role_permissions, anew_permissions).
-- ============================================================
SET lock_timeout = '5s';

DO $do$
BEGIN
  IF md5(pg_get_functiondef('public.fn_neg_papeis(uuid)'::regprocedure)) <> 'fc2d4726846b4f2ebd30a27254e9f022'
     OR md5(pg_get_functiondef('public.neg_papeis_dos_recursos(uuid)'::regprocedure)) <> 'ff30208db547ad3d19496def1f4a35ed'
     OR md5(pg_get_functiondef('public.cat_ler_catalogo(uuid)'::regprocedure)) <> '39ca0b13f20695dc02f32a7bfcc22935'
     OR md5(pg_get_functiondef('public.rh_agenda_tecnicos(uuid,date,date)'::regprocedure)) <> 'e848c60625d6f0d1be3e111e396e7397'
     OR md5(pg_get_functiondef('public.obra_guardar_negocio(uuid,uuid,jsonb)'::regprocedure)) <> 'b2df33255781c151e936da903658b220'
     OR md5(pg_get_functiondef('public.fn_rh_oficios_efetivos(uuid,uuid)'::regprocedure)) <> 'c26d3ee3be07cdbb3d1afce29889e9a8'
     OR md5(pg_get_functiondef('public.rh_guardar_oficios_pessoa(uuid,uuid,uuid[])'::regprocedure)) <> '0ef35eb8ae6e0bb03e02bbc48b92534a'
     OR md5(pg_get_functiondef('public.rh_ler_oficios_pessoa(uuid,uuid)'::regprocedure)) <> '021e296e5cf278a8a9c6f54567cd59b1'
     OR md5(pg_get_functiondef('public.fn_permissoes_que_nao_posso_dar(uuid,text[])'::regprocedure)) <> '252f37b54543c2c08593040a2f26e73b'
     OR md5(pg_get_functiondef('public.fn_rh_pessoa_tecnica(uuid,uuid)'::regprocedure)) <> '8ba80cbcf25fcfcc2bd2509c1ed75891' THEN
    RAISE EXCEPTION 'Guarda: uma das funções mudou desde 9/11/2026. Rever esta migration (refazer a partir do pg_get_functiondef vivo).';
  END IF;
  IF to_regprocedure('public.fn_rh_pessoa_tecnico_por_perfil(uuid,uuid)') IS NOT NULL
     OR to_regprocedure('public.fn_rh_pessoa_tecnico_obra(uuid,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'Guarda: as funções novas já existem. Rever esta migration.';
  END IF;
END $do$;


-- 1. Catálogo (categoria 'pessoas', a seguir a negocios.perder = 20)
INSERT INTO public.anew_permissions
  (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES
  ('negocios.obra.tecnico', 'Ser técnico de obra',
   'Quem tem este perfil é técnico de obra no Negócio, como quem tem cargo técnico de obra no RH: abre no Hoje do técnico, fixo em si, e executa as tarefas da obra atribuídas a si (registos, fotografias, notas, Visto, imprevistos), que o Gestor de obra valida. Exige a conta ligada a uma pessoa do RH. Os ofícios ligam-se na ficha do RH.',
   'pessoas', NULL, 21, false, 'organization', false)
ON CONFLICT (code) DO NOTHING;


-- 2. A pessoa é técnica de obra pelo perfil: tem uma conta ligada (activa, não revogada, utilizador não apagado) com a permissão
--    negocios.obra.tecnico nesta organização. Não depende de quem pergunta.
CREATE OR REPLACE FUNCTION public.fn_rh_pessoa_tecnico_por_perfil(p_org uuid, p_pessoa uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM pessoas p
    JOIN pessoas_contas pc ON pc.pessoa_id = p.id AND pc.organization_id = p_org AND pc.estado = 'activa' AND pc.revogada_em IS NULL
    JOIN anew_users u ON u.id = pc.anew_user_id AND u.deleted_at IS NULL
    WHERE p.id = p_pessoa AND p.organization_id = p_org AND p.deleted_at IS NULL
      AND (p.data_saida IS NULL OR p.data_saida >= current_date)
      AND public.has_anew_permission_in_org(u.auth_user_id, 'negocios.obra.tecnico', p_org))
$function$;

-- 3. Técnica de obra pelo cargo ou pelo perfil.
CREATE OR REPLACE FUNCTION public.fn_rh_pessoa_tecnico_obra(p_org uuid, p_pessoa uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.fn_rh_pessoa_tecnica(p_org, p_pessoa) OR public.fn_rh_pessoa_tecnico_por_perfil(p_org, p_pessoa)
$function$;

REVOKE ALL ON FUNCTION public.fn_rh_pessoa_tecnico_por_perfil(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_rh_pessoa_tecnico_obra(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_rh_pessoa_tecnico_por_perfil(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_rh_pessoa_tecnico_obra(uuid, uuid) TO service_role;

-- 4. fn_rh_oficios_efetivos (a partir do texto vivo de 9/11/2026, md5 c26d3ee3be07cdbb3d1afce29889e9a8)
CREATE OR REPLACE FUNCTION public.fn_rh_oficios_efetivos(p_org uuid, p_pessoa uuid)
 RETURNS TABLE(skill_id uuid, origem text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- 20270110600000: os do cargo só com cargo técnico; os extras também com o perfil de técnico de obra (negocios.obra.tecnico)
  WITH t AS (SELECT public.fn_rh_pessoa_tecnica(p_org, p_pessoa) AS tecnica, public.fn_rh_pessoa_cargo_vigente(p_pessoa) AS cargo,
                    public.fn_rh_pessoa_tecnico_obra(p_org, p_pessoa) AS tecnico_obra)
  SELECT co.skill_id, 'cargo'::text FROM t JOIN hr_cargos_oficios co ON co.cargo_id = t.cargo AND co.organization_id = p_org
  WHERE t.tecnica
  UNION ALL
  SELECT po.skill_id, 'extra'::text FROM t JOIN pessoas_oficios po ON po.pessoa_id = p_pessoa AND po.organization_id = p_org
  WHERE t.tecnico_obra
    AND NOT (t.tecnica AND EXISTS (SELECT 1 FROM hr_cargos_oficios co WHERE co.cargo_id = t.cargo AND co.skill_id = po.skill_id))
$function$;

-- 5. fn_neg_papeis (a partir do texto vivo de 9/11/2026, md5 fc2d4726846b4f2ebd30a27254e9f022)
CREATE OR REPLACE FUNCTION public.fn_neg_papeis(p_org uuid)
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH eu AS (SELECT public.fn_neg_pessoa_da_conta(p_org) AS pessoa)
  SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}') FROM (
    SELECT pp.papel AS x FROM eu JOIN pessoas_papeis_negocio pp ON pp.pessoa_id = eu.pessoa AND pp.organization_id = p_org
    UNION
    -- 20270110600000: técnico pelo cargo do RH ou pelo perfil (negocios.obra.tecnico) de quem está ligado a uma pessoa do RH
    SELECT 'tecnico' FROM eu WHERE eu.pessoa IS NOT NULL
      AND (public.fn_rh_pessoa_tecnica(p_org, eu.pessoa) OR public.has_anew_permission_in_org(auth.uid(), 'negocios.obra.tecnico', p_org))
  ) s
$function$;

-- 6. neg_papeis_dos_recursos (a partir do texto vivo de 9/11/2026, md5 ff30208db547ad3d19496def1f4a35ed)
CREATE OR REPLACE FUNCTION public.neg_papeis_dos_recursos(p_org uuid)
 RETURNS TABLE(resource_id uuid, papeis text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.fn_cat_exigir(p_org, 'pessoas.view');
  RETURN QUERY
    WITH contas AS (
      SELECT DISTINCT ON (r.id) r.id AS recurso, pc.pessoa_id AS pessoa
        FROM schedule_resources r
        JOIN pessoas_contas pc ON pc.anew_user_id = r.user_id AND pc.organization_id = p_org AND pc.estado = 'activa' AND pc.revogada_em IS NULL
        JOIN pessoas p ON p.id = pc.pessoa_id AND p.deleted_at IS NULL AND (p.data_saida IS NULL OR p.data_saida >= current_date)
       WHERE r.organization_id = p_org AND r.resource_type = 'user' AND r.user_id IS NOT NULL AND r.is_active IS NOT FALSE
       ORDER BY r.id, pc.ligada_em DESC NULLS LAST
    )
    SELECT c.recurso, coalesce((
      SELECT array_agg(DISTINCT x ORDER BY x) FROM (
        SELECT pp.papel AS x FROM pessoas_papeis_negocio pp WHERE pp.pessoa_id = c.pessoa AND pp.organization_id = p_org
        UNION
        SELECT 'tecnico' WHERE public.fn_rh_pessoa_tecnico_obra(p_org, c.pessoa) -- 20270110600000: cargo ou perfil
      ) s), '{}')
      FROM contas c;
END;
$function$;

-- 7. cat_ler_catalogo (a partir do texto vivo de 9/11/2026, md5 39ca0b13f20695dc02f32a7bfcc22935)
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
       -- 20270110600000: entram também as do perfil de técnico de obra (negocios.obra.tecnico), mesmo sem ofícios (perfis vazio);
       --   as de cargo técnico sem ofícios continuam de fora
       rh AS (SELECT p.id, p.nome_completo,
                     coalesce(array_agg(e.skill_id ORDER BY e.skill_id) FILTER (WHERE e.skill_id IS NOT NULL), '{}') AS perfis FROM pessoas p
              LEFT JOIN LATERAL public.fn_rh_oficios_efetivos(p_org, p.id) e ON true
              WHERE p.organization_id = p_org AND p.deleted_at IS NULL AND (p.data_saida IS NULL OR p.data_saida >= current_date)
                AND (e.skill_id IS NOT NULL OR public.fn_rh_pessoa_tecnico_por_perfil(p_org, p.id))
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

-- 8. rh_agenda_tecnicos (a partir do texto vivo de 9/11/2026, md5 e848c60625d6f0d1be3e111e396e7397)
CREATE OR REPLACE FUNCTION public.rh_agenda_tecnicos(p_org uuid, p_de date, p_ate date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_eu uuid; v_so_eu boolean := false;
BEGIN
  -- 20270110600000: a porta de antes fica igual (o papel do Negócio conta como antes: o do RH ou o do cargo técnico); quem entra
  --   só pelo perfil de técnico de obra (negocios.obra.tecnico) vê apenas a própria linha
  v_eu := CASE WHEN p_org IS NOT NULL THEN public.fn_neg_pessoa_da_conta(p_org) END;
  IF p_org IS NULL OR NOT (public.is_system_admin_user(auth.uid())
      OR public.has_anew_permission_in_org(auth.uid(), 'pessoas.view', p_org)
      OR public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.laborais.view', p_org)
      OR EXISTS (SELECT 1 FROM neg_papeis_permissoes m WHERE m.permission_code = 'pessoas.view'  -- 20270101370000: ou um papel do Negócio pelo RH
                   AND (m.papel IN (SELECT pp.papel FROM pessoas_papeis_negocio pp WHERE pp.pessoa_id = v_eu AND pp.organization_id = p_org)
                        OR (m.papel = 'tecnico' AND v_eu IS NOT NULL AND public.fn_rh_pessoa_tecnica(p_org, v_eu))))) THEN
    IF p_org IS NOT NULL AND v_eu IS NOT NULL AND 'tecnico' = ANY (public.fn_neg_papeis(p_org)) THEN
      v_so_eu := true;
    ELSE
      RAISE EXCEPTION 'Sem permissão (pessoas.view ou hr.pessoas.laborais.view).' USING ERRCODE = 'CT001';
    END IF;
  END IF;
  IF p_de IS NULL OR p_ate IS NULL OR p_ate < p_de OR p_ate - p_de > 400 THEN
    RAISE EXCEPTION 'Intervalo inválido (até 400 dias).' USING ERRCODE = 'CT002';
  END IF;

  RETURN coalesce((
    WITH tar AS (
      SELECT r.pessoa_id, t.id, t.nome, t.inicio_planeado AS inicio, coalesce(t.fim_planeado, t.inicio_planeado) AS fim,
             t.minutos_previstos, t.pessoas_previstas, t.estado, k.nome AS oficio, o.id AS obra_id, o.codigo, o.titulo, o.morada, o.estado AS obra_estado,
             n.numero AS negocio_numero
      FROM ops_obra_tarefa_rh r
      JOIN ops_obra_tarefa t ON t.id = r.tarefa_id
      JOIN ops_obra o ON o.id = r.obra_id AND o.organization_id = p_org
      LEFT JOIN negocios n ON n.id = o.negocio_id
      LEFT JOIN ops_skill k ON k.id = t.skill_id
      WHERE r.organization_id = p_org AND o.estado <> 'cancelada' AND (NOT v_so_eu OR r.pessoa_id = v_eu)
        AND t.inicio_planeado IS NOT NULL AND t.inicio_planeado <= p_ate AND coalesce(t.fim_planeado, t.inicio_planeado) >= p_de
    ),
    tec AS (
      SELECT p.id, p.nome_completo FROM pessoas p
      WHERE p.organization_id = p_org AND p.deleted_at IS NULL AND public.fn_rh_pessoa_tecnico_obra(p_org, p.id)
        AND (NOT v_so_eu OR p.id = v_eu)
      UNION
      SELECT p.id, p.nome_completo FROM pessoas p WHERE p.id IN (SELECT pessoa_id FROM tar)
    )
    SELECT jsonb_agg(jsonb_build_object(
      'pessoa_id', tec.id,
      'nome', tec.nome_completo,
      'oficios', coalesce((SELECT jsonb_agg(k.nome ORDER BY k.nome) FROM public.fn_rh_oficios_efetivos(p_org, tec.id) e
                           JOIN ops_skill k ON k.id = e.skill_id), '[]'::jsonb),
      'tarefas', coalesce((SELECT jsonb_agg(jsonb_build_object(
                    'tarefa_id', x.id, 'nome', x.nome, 'oficio', x.oficio, 'inicio', x.inicio, 'fim', x.fim, 'estado', x.estado,
                    'minutos', x.minutos_previstos, 'pessoas', x.pessoas_previstas,
                    'horas_dia', round(x.minutos_previstos / 60.0 / greatest(1, x.pessoas_previstas) / greatest(1, (SELECT count(*) FROM generate_series(x.inicio, x.fim, interval '1 day') d
                                                                                  WHERE extract(isodow FROM d) < 6)), 2),
                    'obra_id', x.obra_id, 'obra_codigo', x.codigo, 'obra_titulo', x.titulo, 'morada', x.morada, 'obra_estado', x.obra_estado,
                    'negocio_numero', x.negocio_numero) ORDER BY x.inicio, x.nome)
                   FROM tar x WHERE x.pessoa_id = tec.id), '[]'::jsonb),
      'indisponivel', coalesce((SELECT jsonb_agg(jsonb_build_object('data', a.data, 'fraccao', a.fraccao_dia) ORDER BY a.data)
                                FROM pessoas_ausencias_dias a
                                WHERE a.organization_id = p_org AND a.pessoa_id = tec.id AND a.estado = 'aprovado'
                                  AND a.data BETWEEN p_de AND p_ate), '[]'::jsonb)
    ) ORDER BY tec.nome_completo)
    FROM tec), '[]'::jsonb);
END $function$;

-- 9. obra_guardar_negocio (a partir do texto vivo de 9/11/2026, md5 b2df33255781c151e936da903658b220)
CREATE OR REPLACE FUNCTION public.obra_guardar_negocio(p_org uuid, p_negocio_id uuid, p_obra jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- 20270102220000: o código antigo do papel da obra deu lugar a negocios.obra.planear (o Gestor de obra) e negocios.obra.executar (o técnico)
  v_user uuid := public.fn_cat_exigir_uma(p_org, ARRAY['pessoas.edit', 'negocios.obra.planear', 'negocios.obra.executar']);
  v_existe boolean; v_planear boolean; v_executar boolean; v_eu uuid; v_porque text; s record;
  v_neg negocios; v_obra ops_obra; v_codigo text; v_estado text; v_plano boolean; v_inicio date;
  t jsonb; v_chave text; v_nome text; v_fase uuid; v_tar uuid; v_skill uuid; v_skill_nome text; v_pessoa uuid; v_tarestado text; v_pessoas smallint;
  v_chaves text[] := '{}'; v_avisos text[] := '{}';
  v_imp_a jsonb; v_imp_d jsonb; v_auto_a jsonb; v_auto_d jsonb; -- 20270105200000
BEGIN
  SELECT * INTO v_neg FROM negocios WHERE id = p_negocio_id AND organization_id = p_org AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Negócio não encontrado nesta organização.' USING ERRCODE = 'NE003'; END IF;
  IF p_obra IS NULL OR jsonb_typeof(p_obra) <> 'object' THEN RAISE EXCEPTION 'A obra tem de ser um objeto.' USING ERRCODE = 'CT002'; END IF;
  v_plano := coalesce(jsonb_typeof(p_obra->'tarefas') = 'array', false);
  v_estado := coalesce(nullif(p_obra->>'estado', ''), 'planeada');
  IF v_estado NOT IN ('planeada', 'em_curso', 'suspensa', 'concluida', 'cancelada') THEN
    RAISE EXCEPTION 'Estado da obra inválido: %.', v_estado USING ERRCODE = 'CT002';
  END IF;
  BEGIN
    v_inicio := nullif(p_obra->>'inicio', '')::date;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Data de início inválida: %.', p_obra->>'inicio' USING ERRCODE = 'CT002';
  END;

  SELECT * INTO v_obra FROM ops_obra WHERE negocio_id = p_negocio_id AND organization_id = p_org FOR UPDATE;
  v_existe := FOUND;

  -- 20270102220000: sem negocios.obra.planear, compara-se a obra gravada com a nova e só passa o que é de quem executa: as tarefas
  -- atribuídas a ele (ops_obra_tarefa_rh; no estado da Emylia, tasks[i].tec), marcadas em curso ou feitas, com os registos, as
  -- fotografias, as notas e os imprevistos delas (fn_obra_execucao_permitida). Gravar sem mudanças passa sempre. O plano, o estado da
  -- obra, o cancelamento, a atribuição dos técnicos, a validação e as tarefas novas ou apagadas são do Gestor de obra.
  v_planear := public.fn_cat_pode(p_org, 'negocios.obra.planear');
  IF NOT v_planear AND NOT v_existe THEN
    -- a obra nasce do orçamento (o plano gerado, por aprovar, sem nada feito): quem grava o negócio pode criá-la
    IF v_plano AND (v_estado <> 'planeada' OR NOT public.fn_cat_pode(p_org, 'pessoas.edit')
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_obra->'tarefas') x WHERE coalesce(nullif(x->>'estado', ''), 'por_fazer') <> 'por_fazer')) THEN
      RAISE EXCEPTION 'Sem permissão (negocios.obra.planear): só o Gestor de obra cria uma obra que já não está só planeada.' USING ERRCODE = 'CT001';
    END IF;
  ELSIF NOT v_planear THEN
    v_executar := public.fn_cat_pode(p_org, 'negocios.obra.executar');
    v_eu := CASE WHEN v_executar THEN public.fn_neg_pessoa_da_conta(p_org) END;
    IF NOT v_plano OR v_estado IS DISTINCT FROM v_obra.estado THEN
      RAISE EXCEPTION 'Sem permissão (negocios.obra.planear): não pode mudar o estado da obra nem cancelá-la.' USING ERRCODE = 'CT001';
    END IF;
    IF (SELECT coalesce(array_agg(t.chave ORDER BY t.chave), '{}') FROM ops_obra_tarefa t WHERE t.obra_id = v_obra.id)
       IS DISTINCT FROM (SELECT coalesce(array_agg(btrim(x->>'chave') ORDER BY btrim(x->>'chave')), '{}') FROM jsonb_array_elements(p_obra->'tarefas') x) THEN
      RAISE EXCEPTION 'Sem permissão (negocios.obra.planear): não pode juntar nem tirar tarefas do plano.' USING ERRCODE = 'CT001';
    END IF;
    FOR s IN SELECT t.chave, t.nome, t.estado, (SELECT r.pessoa_id FROM ops_obra_tarefa_rh r WHERE r.tarefa_id = t.id LIMIT 1) AS pessoa,
                    CASE WHEN coalesce(nullif(x->>'estado', ''), 'por_fazer') IN ('por_fazer', 'em_curso', 'feita', 'validada', 'rejeitada')
                         THEN coalesce(nullif(x->>'estado', ''), 'por_fazer') ELSE 'por_fazer' END AS novo,
                    CASE WHEN coalesce(x->>'pessoa', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (x->>'pessoa')::uuid END AS nova_pessoa
             FROM ops_obra_tarefa t JOIN jsonb_array_elements(p_obra->'tarefas') x ON btrim(x->>'chave') = t.chave
             WHERE t.obra_id = v_obra.id LOOP
      IF s.nova_pessoa IS DISTINCT FROM s.pessoa THEN
        RAISE EXCEPTION 'Sem permissão (negocios.obra.planear): não pode mudar o técnico da tarefa %.', s.nome USING ERRCODE = 'CT001';
      END IF;
      IF s.novo IS DISTINCT FROM s.estado AND NOT (v_eu IS NOT NULL AND s.pessoa = v_eu AND s.estado <> 'validada' AND s.novo IN ('em_curso', 'feita')) THEN
        -- 20270105500000: sem negocios.obra.executar a falta é essa (não a do Gestor de obra); a regra não muda, só a mensagem
        IF NOT coalesce(v_executar, false) THEN
          RAISE EXCEPTION 'Sem permissão (negocios.obra.executar): não pode marcar a tarefa % em curso ou feita.', s.nome
            USING ERRCODE = 'CT001';
        END IF;
        RAISE EXCEPTION 'Sem permissão (negocios.obra.planear): na tarefa % só quem a tem atribuída a marca em curso ou feita; validar e pedir correção é do Gestor de obra.', s.nome
          USING ERRCODE = 'CT001';
      END IF;
    END LOOP;
    v_porque := public.fn_obra_execucao_permitida(v_obra.estado_emylia, p_obra->'emylia', v_eu);
    IF v_porque IS NOT NULL THEN
      -- 20270105700000: sem negocios.obra.executar o que falta é ela (não planear)
      RAISE EXCEPTION 'Sem permissão (%): não pode mudar %; só regista a execução das tarefas atribuídas a si.',
        CASE WHEN v_executar THEN 'negocios.obra.planear' ELSE 'negocios.obra.executar' END, v_porque USING ERRCODE = 'CT001';
    END IF;
    -- grava só a execução: o estado da Emylia e o estado das tarefas dele; o resto da projeção (datas, nomes, técnicos) fica o da base
    UPDATE ops_obra SET estado_emylia = p_obra->'emylia', atualizada_em = now()
    WHERE id = v_obra.id AND estado_emylia IS DISTINCT FROM p_obra->'emylia';
    UPDATE ops_obra_tarefa t SET estado = x.novo, atualizada_em = now()
    FROM (SELECT btrim(y->>'chave') AS chave, CASE WHEN coalesce(nullif(y->>'estado', ''), 'por_fazer') IN ('por_fazer', 'em_curso', 'feita', 'validada', 'rejeitada')
                         THEN coalesce(nullif(y->>'estado', ''), 'por_fazer') ELSE 'por_fazer' END AS novo FROM jsonb_array_elements(p_obra->'tarefas') y) x
    WHERE t.obra_id = v_obra.id AND t.chave = x.chave AND t.estado IS DISTINCT FROM x.novo;
    RETURN jsonb_build_object('obra_id', v_obra.id, 'codigo', v_obra.codigo, 'avisos', '[]'::jsonb);
  END IF;

  -- 20270105200000: daqui para baixo grava quem planeia (ou quem cria a obra só planeada). Por cima disso:
  --   negocios.obra.imprevistos  mudar ou tirar um imprevisto já gravado (propor ao cliente, decidir, fechar). Registar um novo (no fim da
  --                              lista) não a pede: é da execução (fn_obra_execucao_permitida) ou do planeamento.
  --   negocios.obra.fechar       a obra passar a concluída, ou o auto de receção mudar (enviá-lo). A assinatura do auto que o cliente fez no
  --                              portal (negocio_rececao_cliente com o mesmo número) passa sem ela: é o espelho do que já está na base.
  v_imp_a := public.fn_neg_lista(CASE WHEN v_existe THEN v_obra.estado_emylia->'imprevistos' END);
  v_imp_d := public.fn_neg_lista(p_obra->'emylia'->'imprevistos');
  IF (jsonb_array_length(v_imp_d) < jsonb_array_length(v_imp_a)
      OR EXISTS (SELECT 1 FROM generate_series(0, jsonb_array_length(v_imp_a) - 1) i WHERE (v_imp_d->i) IS DISTINCT FROM (v_imp_a->i)))
     AND NOT public.fn_cat_pode(p_org, 'negocios.obra.imprevistos') THEN
    RAISE EXCEPTION 'Sem permissão (negocios.obra.imprevistos): não pode propor nem decidir os imprevistos da obra.' USING ERRCODE = 'CT001';
  END IF;
  v_auto_a := CASE WHEN v_existe AND jsonb_typeof(v_obra.estado_emylia->'auto') = 'object' THEN v_obra.estado_emylia->'auto' END;
  v_auto_d := CASE WHEN jsonb_typeof(p_obra->'emylia'->'auto') = 'object' THEN p_obra->'emylia'->'auto' END;
  IF ((v_estado = 'concluida' AND (NOT v_existe OR v_obra.estado IS DISTINCT FROM 'concluida'))
      OR (v_auto_d IS DISTINCT FROM v_auto_a
          AND NOT (v_auto_a->>'estado' = 'por assinar' AND v_auto_d->>'estado' = 'assinado' AND v_auto_d->>'n' = v_auto_a->>'n'
                   AND (v_auto_d - ARRAY['estado', 'assinado', 'assinatura', 'reservas']) = (v_auto_a - ARRAY['estado', 'assinado', 'assinatura', 'reservas'])
                   AND EXISTS (SELECT 1 FROM negocio_rececao_cliente r WHERE r.negocio_id = p_negocio_id AND r.auto_n = v_auto_d->>'n'))))
     AND NOT public.fn_cat_pode(p_org, 'negocios.obra.fechar') THEN
    RAISE EXCEPTION 'Sem permissão (negocios.obra.fechar): não pode encerrar a obra nem enviar o auto de receção.' USING ERRCODE = 'CT001';
  END IF;

  IF NOT v_existe THEN
    IF NOT v_plano THEN RETURN jsonb_build_object('obra_id', NULL, 'codigo', NULL, 'avisos', '[]'::jsonb); END IF;
    v_codigo := 'OB-' || coalesce(v_neg.numero::text, left(p_negocio_id::text, 8));
    IF EXISTS (SELECT 1 FROM ops_obra WHERE organization_id = p_org AND codigo = v_codigo) THEN
      v_codigo := v_codigo || '-' || left(replace(gen_random_uuid()::text, '-', ''), 4);
    END IF;
    INSERT INTO ops_obra (organization_id, codigo, negocio_id, titulo, morada, estado, data_inicio_prevista, criada_por, estado_emylia,
                          iniciada_em, concluida_em)
    VALUES (p_org, v_codigo, p_negocio_id,
            coalesce(nullif(btrim(p_obra->>'titulo'), ''), nullif(btrim(v_neg.titulo), ''), 'Obra ' || v_codigo),
            nullif(btrim(coalesce(p_obra->>'morada', '')), ''), v_estado, v_inicio, v_user, p_obra->'emylia',
            CASE WHEN v_estado IN ('em_curso', 'concluida') THEN now() END, CASE WHEN v_estado = 'concluida' THEN now() END)
    RETURNING * INTO v_obra;
  ELSE
    UPDATE ops_obra SET
      titulo = coalesce(nullif(btrim(p_obra->>'titulo'), ''), titulo),
      morada = coalesce(nullif(btrim(coalesce(p_obra->>'morada', '')), ''), morada),
      estado = CASE WHEN v_plano THEN v_estado ELSE 'cancelada' END,
      data_inicio_prevista = coalesce(v_inicio, data_inicio_prevista),
      iniciada_em = CASE WHEN v_estado IN ('em_curso', 'concluida') THEN coalesce(iniciada_em, now()) ELSE iniciada_em END,
      concluida_em = CASE WHEN v_estado = 'concluida' THEN coalesce(concluida_em, now()) ELSE concluida_em END,
      estado_emylia = p_obra->'emylia',
      atualizada_em = now()
    WHERE id = v_obra.id
    RETURNING * INTO v_obra;
  END IF;

  IF NOT v_plano THEN
    DELETE FROM ops_obra_tarefa_rh WHERE obra_id = v_obra.id;
    RETURN jsonb_build_object('obra_id', v_obra.id, 'codigo', v_obra.codigo, 'avisos', '[]'::jsonb);
  END IF;

  -- as fases: as que o motor manda e as que as tarefas usam
  INSERT INTO ops_obra_fase (organization_id, obra_id, ordem, nome)
  SELECT p_org, v_obra.id, f.ordem, coalesce(max(f.nome), 'Fase ' || f.ordem)
  FROM (
    SELECT (x->>'ordem')::smallint AS ordem, nullif(btrim(x->>'nome'), '') AS nome
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_obra->'fases') = 'array' THEN p_obra->'fases' ELSE '[]'::jsonb END) x
    UNION ALL
    SELECT coalesce((x->>'fase')::smallint, 0), NULL FROM jsonb_array_elements(p_obra->'tarefas') x
  ) f
  GROUP BY f.ordem
  ON CONFLICT (obra_id, ordem) DO UPDATE SET nome = EXCLUDED.nome WHERE ops_obra_fase.nome IS DISTINCT FROM EXCLUDED.nome;

  FOR t IN SELECT x FROM jsonb_array_elements(p_obra->'tarefas') x LOOP
    v_chave := nullif(btrim(coalesce(t->>'chave', '')), '');
    v_nome := nullif(btrim(coalesce(t->>'nome', '')), '');
    IF v_chave IS NULL OR v_nome IS NULL THEN RAISE EXCEPTION 'Cada tarefa precisa de chave e nome.' USING ERRCODE = 'CT002'; END IF;
    IF v_chave = ANY (v_chaves) THEN RAISE EXCEPTION 'Tarefa repetida: %.', v_chave USING ERRCODE = 'CT002'; END IF;
    v_chaves := v_chaves || v_chave;

    v_skill := NULL; v_skill_nome := NULL;
    IF nullif(t->>'perfil', '') IS NOT NULL THEN
      SELECT k.id, k.nome INTO v_skill, v_skill_nome FROM ops_skill k
      WHERE k.organization_id = p_org AND (k.chave = t->>'perfil' OR k.id::text = t->>'perfil') LIMIT 1;
    END IF;
    SELECT id INTO v_fase FROM ops_obra_fase WHERE obra_id = v_obra.id AND ordem = coalesce((t->>'fase')::smallint, 0);
    v_tarestado := coalesce(nullif(t->>'estado', ''), 'por_fazer');
    IF v_tarestado NOT IN ('por_fazer', 'em_curso', 'feita', 'validada', 'rejeitada') THEN v_tarestado := 'por_fazer'; END IF;
    v_pessoas := least(20, greatest(1, coalesce((t->>'pessoas')::int, 1)));

    v_tar := NULL;
    SELECT id INTO v_tar FROM ops_obra_tarefa WHERE obra_id = v_obra.id AND chave = v_chave;
    IF v_tar IS NULL THEN
      INSERT INTO ops_obra_tarefa (organization_id, obra_id, fase_id, ordem, nome, minutos_previstos, inicio_planeado, fim_planeado,
                                   estado, skill_id, chave, pessoas_previstas)
      VALUES (p_org, v_obra.id, v_fase, coalesce((t->>'ordem')::int, 0), v_nome, greatest(1, coalesce(round((t->>'minutos')::numeric), 60))::int,
              nullif(t->>'inicio', '')::date, nullif(t->>'fim', '')::date, v_tarestado, v_skill, v_chave, v_pessoas)
      RETURNING id INTO v_tar;
    ELSE
      UPDATE ops_obra_tarefa SET fase_id = v_fase, ordem = coalesce((t->>'ordem')::int, 0), nome = v_nome,
        minutos_previstos = greatest(1, coalesce(round((t->>'minutos')::numeric), 60))::int,
        inicio_planeado = nullif(t->>'inicio', '')::date, fim_planeado = nullif(t->>'fim', '')::date,
        estado = v_tarestado, skill_id = v_skill, pessoas_previstas = v_pessoas, atualizada_em = now()
      WHERE id = v_tar
        AND (fase_id, ordem, nome, minutos_previstos, inicio_planeado, fim_planeado, estado, skill_id, pessoas_previstas) IS DISTINCT FROM
            (v_fase, coalesce((t->>'ordem')::int, 0), v_nome, greatest(1, coalesce(round((t->>'minutos')::numeric), 60))::int,
             nullif(t->>'inicio', '')::date, nullif(t->>'fim', '')::date, v_tarestado, v_skill, v_pessoas);
    END IF;

    -- quem a faz: só uma pessoa do RH desta organização
    v_pessoa := NULL;
    IF coalesce(t->>'pessoa', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT p.id INTO v_pessoa FROM pessoas p WHERE p.id = (t->>'pessoa')::uuid AND p.organization_id = p_org AND p.deleted_at IS NULL;
      IF v_pessoa IS NULL THEN
        v_avisos := v_avisos || format('%s: o técnico não é uma pessoa do RH desta organização. Ficou por atribuir.', v_nome);
      ELSIF NOT public.fn_rh_pessoa_tecnico_obra(p_org, v_pessoa) THEN -- 20270110600000: cargo ou perfil
        v_avisos := v_avisos || format('%s: a pessoa atribuída não tem cargo técnico de obra no RH nem o perfil de técnico de obra.', v_nome);
      ELSIF v_skill IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.fn_rh_oficios_efetivos(p_org, v_pessoa) o WHERE o.skill_id = v_skill) THEN
        v_avisos := v_avisos || format('%s: a pessoa atribuída não tem o ofício %s no RH.', v_nome, v_skill_nome);
      END IF;
    END IF;
    DELETE FROM ops_obra_tarefa_rh WHERE tarefa_id = v_tar AND pessoa_id IS DISTINCT FROM v_pessoa;
    IF v_pessoa IS NOT NULL THEN
      INSERT INTO ops_obra_tarefa_rh (organization_id, obra_id, tarefa_id, pessoa_id, atribuida_por)
      VALUES (p_org, v_obra.id, v_tar, v_pessoa, v_user)
      ON CONFLICT (tarefa_id, pessoa_id) DO NOTHING;
    END IF;
  END LOOP;

  -- o que saiu do plano sai da projeção (as fases só se nenhuma tarefa as usar)
  DELETE FROM ops_obra_tarefa WHERE obra_id = v_obra.id AND (chave IS NULL OR NOT (chave = ANY (v_chaves)));
  DELETE FROM ops_obra_fase f WHERE f.obra_id = v_obra.id AND NOT EXISTS (SELECT 1 FROM ops_obra_tarefa x WHERE x.fase_id = f.id);

  RETURN jsonb_build_object('obra_id', v_obra.id, 'codigo', v_obra.codigo, 'avisos', to_jsonb(v_avisos));
END $function$;

-- 10. rh_guardar_oficios_pessoa (a partir do texto vivo de 9/11/2026, md5 0ef35eb8ae6e0bb03e02bbc48b92534a)
CREATE OR REPLACE FUNCTION public.rh_guardar_oficios_pessoa(p_org uuid, p_pessoa uuid, p_skills uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user uuid; v_skills uuid[] := coalesce(p_skills, '{}'); v_cargo uuid;
BEGIN
  v_user := public.fn_cat_exigir(p_org, 'hr.pessoas.laborais.edit');
  IF NOT EXISTS (SELECT 1 FROM pessoas WHERE id = p_pessoa AND organization_id = p_org AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Pessoa não encontrada nesta organização.' USING ERRCODE = 'CT003';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_skills) k WHERE NOT EXISTS (SELECT 1 FROM ops_skill s WHERE s.id = k AND s.organization_id = p_org)) THEN
    RAISE EXCEPTION 'Ofício que não é desta organização.' USING ERRCODE = 'CT002';
  END IF;
  -- 20261231998000: só as pessoas técnicas têm ofícios; os herdados do cargo não se gravam na pessoa (ficam só os extras)
  -- 20270110600000: ou o perfil de técnico de obra (negocios.obra.tecnico); os do cargo só se tiram quando o cargo é técnico
  IF NOT public.fn_rh_pessoa_tecnico_obra(p_org, p_pessoa) THEN
    RAISE EXCEPTION 'Só pessoas com cargo técnico de obra ou perfil de técnico de obra têm ofícios.' USING ERRCODE = 'CT002';
  END IF;
  v_cargo := CASE WHEN public.fn_rh_pessoa_tecnica(p_org, p_pessoa) THEN public.fn_rh_pessoa_cargo_vigente(p_pessoa) END;
  v_skills := ARRAY(SELECT DISTINCT k FROM unnest(v_skills) k
                    WHERE NOT EXISTS (SELECT 1 FROM hr_cargos_oficios co WHERE co.cargo_id = v_cargo AND co.skill_id = k));
  DELETE FROM pessoas_oficios WHERE pessoa_id = p_pessoa AND organization_id = p_org AND NOT (skill_id = ANY (v_skills));
  INSERT INTO pessoas_oficios (organization_id, pessoa_id, skill_id, created_by)
    SELECT DISTINCT p_org, p_pessoa, k, v_user FROM unnest(v_skills) k
  ON CONFLICT (pessoa_id, skill_id) DO NOTHING;
END $function$;

-- 11. rh_ler_oficios_pessoa (a partir do texto vivo de 9/11/2026, md5 021e296e5cf278a8a9c6f54567cd59b1)
CREATE OR REPLACE FUNCTION public.rh_ler_oficios_pessoa(p_org uuid, p_pessoa uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_ret boolean; v_tec boolean; v_cargo uuid; v_det record;
BEGIN
  PERFORM public.fn_cat_exigir(p_org, 'hr.pessoas.laborais.view');
  IF NOT EXISTS (SELECT 1 FROM pessoas WHERE id = p_pessoa AND organization_id = p_org AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Pessoa não encontrada nesta organização.' USING ERRCODE = 'CT003';
  END IF;
  v_ret := public.is_system_admin_user(auth.uid()) OR public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.retribuicao.view', p_org);
  -- 20261231998000: os ofícios herdados do cargo técnico, os extras da pessoa e a origem do custo/hora
  v_tec := public.fn_rh_pessoa_tecnica(p_org, p_pessoa);
  v_cargo := public.fn_rh_pessoa_cargo_vigente(p_pessoa);
  SELECT * INTO v_det FROM public.fn_rh_custo_hora_pessoa_em_det(p_org, p_pessoa, current_date);
  RETURN jsonb_build_object(
    'tecnica', v_tec,
    'tecnico_por_perfil', public.fn_rh_pessoa_tecnico_por_perfil(p_org, p_pessoa), -- 20270110600000
    'cargo', (SELECT jsonb_build_object('id', c.id, 'nome', c.nome) FROM hr_cargos c WHERE c.id = v_cargo AND c.organization_id = p_org),
    'oficios', coalesce((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'nome', s.nome, 'herdado', x.herdado, 'extra', x.extra,
                 'ligado', x.herdado OR x.extra) ORDER BY s.nome)
               FROM ops_skill s
               CROSS JOIN LATERAL (SELECT h.herdado,
                   (NOT h.herdado AND EXISTS (SELECT 1 FROM pessoas_oficios po WHERE po.pessoa_id = p_pessoa AND po.skill_id = s.id)) AS extra
                 FROM (SELECT v_tec AND EXISTS (SELECT 1 FROM hr_cargos_oficios co WHERE co.cargo_id = v_cargo AND co.skill_id = s.id) AS herdado) h) x
               WHERE s.organization_id = p_org AND (s.ativo OR x.herdado OR x.extra)), '[]'),
    'custo_hora', CASE WHEN v_ret THEN v_det.custo_hora END,
    'origem_custo', CASE WHEN v_ret THEN v_det.origem END,
    've_custo', v_ret
  );
END $function$;

-- 12. fn_permissoes_que_nao_posso_dar (a partir do texto vivo de 9/11/2026, md5 252f37b54543c2c08593040a2f26e73b)
CREATE OR REPLACE FUNCTION public.fn_permissoes_que_nao_posso_dar(p_org uuid, p_perms text[])
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH RECURSIVE orgs(org) AS (
    SELECT p_org
    UNION
    SELECT h.parent_org_id
    FROM public.anew_hierarchy h
    JOIN orgs o ON h.child_org_id = o.org
  ),
  minhas AS (
    SELECT DISTINCT rp.permission_code
    FROM public.anew_users u
    JOIN public.anew_memberships m
      ON m.user_id = u.id
     AND m.status = 'active'
     AND m.role_is_client IS NOT TRUE
    JOIN public.anew_role_permissions rp ON rp.role_id = m.role_id
    WHERE u.auth_user_id = auth.uid()
      AND u.deleted_at IS NULL
      AND m.organization_id IN (SELECT org FROM orgs WHERE org IS NOT NULL)
  )
  SELECT CASE
           WHEN public.fn_sou_admin_global() THEN ARRAY[]::text[]
           ELSE COALESCE(
                  (SELECT array_agg(DISTINCT p ORDER BY p)
                   FROM unnest(COALESCE(p_perms, ARRAY[]::text[])) AS p
                   WHERE p IS NOT NULL
                     AND p NOT IN (SELECT permission_code FROM minhas)
                     -- 20270110600000: o perfil de técnico de obra dá-se se quem dá já tem tudo o que o papel técnico do Negócio dá
                     AND NOT (p = 'negocios.obra.tecnico'
                              AND EXISTS (SELECT 1 FROM public.neg_papeis_permissoes t WHERE t.papel = 'tecnico')
                              AND NOT EXISTS (SELECT 1 FROM public.neg_papeis_permissoes t
                                              WHERE t.papel = 'tecnico'
                                                AND NOT EXISTS (SELECT 1 FROM minhas mm WHERE mm.permission_code = t.permission_code)))),
                  ARRAY[]::text[])
         END
$function$;

-- fim
