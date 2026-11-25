-- =============================================================================
-- Catálogo — «TEM ASPETO» NO ATRIBUTO (Emylia): um atributo de lista pode dizer que as suas opções têm aspeto, e
-- então cada opção pode levar «é metal» e uma «superfície por omissão» (polida, acetinada ou mate). O 3D usa-os
-- para o material de cada zona (metalness e roughness).
--
-- !!! SÓ PARA A BASE DE RH (uetjghdkwbywbftedtth) — NUNCA NA PRINCIPAL; confirmar o project-ref antes do push
-- !!! (supabase/.temp/project-ref tem de dizer uetjghdkwbywbftedtth).
-- !!! ATENÇÃO: esta base tem a Mudelar e mais 4 organizações além da nike (6 no total, lido a 25/11). A mudança é
-- !!! só aditiva (colunas desligadas, chaves novas nas leituras), mas as três leituras servem todas as organizações:
-- !!! dizer ao dono e esperar autorização antes do push.
--
-- !!! PRECISA DE CÓDIGO NOVO NO BROWSER (ramo feature/rh-pessoas, escrito em paralelo): MIGRATION E CÓDIGO ENTRAM
-- !!! JUNTOS (mesmo envio). O ecrã de gestão dos atributos chama cat_definir_aspeto_atributo e cat_aspeto_opcao e lê
-- !!! 'tem_aspeto', 'metal' e 'superficie'. Sem esse código a migration não parte nada (as leituras só ganham chaves
-- !!! novas; todos os atributos ficam com has_aspect = false), mas a funcionalidade não existe no ecrã.
-- =============================================================================
--
-- O QUE FAZ
--  1. product_attributes.has_aspect boolean NOT NULL DEFAULT false, CHECK (NOT has_aspect OR NOT is_measurement):
--     medida não tem aspeto. É CHECK (e não só regra na função) porque há escrita directa com products.manage.
--  2. attribute_option_group_values.is_metal boolean NOT NULL DEFAULT false e superficie text NULL,
--     CHECK (superficie IS NULL OR superficie IN ('polida','acetinada','mate')). «Nenhuma» = NULL.
--     ADD COLUMN com default constante não reescreve a tabela (PG 17).
--  3. cat_definir_aspeto_atributo(p_org, p_atributo, p_tem_aspeto) → {atributo:{id, tem_aspeto}}. Muda a qualquer
--     momento. Desligar NÃO apaga nada: os valores ficam nas opções e as leituras deixam de os devolver.
--  4. cat_aspeto_opcao(p_org, p_opcao, p_metal, p_superficie) → {opcao:{id, metal, superficie}, anterior:{…}}.
--     p_metal NULL = não mexe; p_superficie NULL = não mexe, '' = limpa, senão polida|acetinada|mate.
--     RPC NOVA de propósito: acrescentar argumentos a cat_guardar_opcao/cat_editar_opcao obrigava a DROP + CREATE e,
--     ficando a antiga, o PostgREST deixava de saber qual chamar (PGRST203) para as 6 organizações.
--  5. cat_ler_atributos / cat_ler_atributos_gestao / cat_ler_atributos_definicoes (mesma assinatura, privilégios
--     conservados pelo CREATE OR REPLACE): 'tem_aspeto' em cada atributo; 'metal' e 'superficie' em cada opção, só
--     quando o atributo tem aspeto (senão null). Nada mais muda.
--
-- CORPOS DE PARTIDA (lidos no remoto RH a 25/11 com pg_get_functiondef; prosrc igual, byte a byte, ao da
-- migration 20270126300000, que é a mais recente a tocar-lhes):
--   cat_ler_atributos            969e8a34b6bb2435138c06fecce8e23e
--   cat_ler_atributos_gestao     5587a407f8e8b30a6e15cd85e754e45b
--   cat_ler_atributos_definicoes fa4c5bbceef2faff24b9eae6d65bc17e
-- E as que NÃO se tocam, conferidas antes e depois (ninguém as substitui por engano):
--   cat_guardar_opcao            25327c5d0a887e0a9106a496b00231f8
--   cat_editar_opcao             e7fd2bbb229ea6abf74a5da0cc6254c9
--
-- O QUE NÃO MUDA: nenhum dado (sem UPDATE/INSERT/DELETE fora das funções), cat_guardar_opcao, cat_editar_opcao,
-- cat_guardar_atributo, cat_ler_atributos_produto. Sem DROP FUNCTION e sem sobrecargas novas.
--
-- EFEITOS LATERAIS: o ALTER não dispara triggers. Auditoria das duas tabelas usa a linha inteira (SUPOSIÇÃO herdada
-- do cabeçalho de 20270126300000). rpc_duplicate/create_product_attribute e rpc_manage_attribute_option_group
-- inserem com lista de colunas explícita: as cópias ficam desligadas (SUPOSIÇÃO, idem). Nenhuma vista afectada.
-- Fica por tratar no ecrã: tornar «medida» um atributo com has_aspect (por cat_guardar_atributo ou
-- rpc_update_product_attribute) falha no CHECK product_attributes_has_aspect_check com o erro em bruto (23514).
--
-- ORDEM: depende só do que já está aplicado na RH (última aplicada lida a 25/11: 20270126320000). `supabase db push`
-- aplica TUDO o que estiver pendente (a 25/11, 57 ficheiros do ramo): empurrar de um workdir isolado e listar com
-- `supabase migration list --linked` imediatamente antes.
-- =============================================================================

SET lock_timeout = '5s';
SET statement_timeout = '2min';

-- ---- Guarda: os corpos de partida são os que estão na base -----------------------------------------------------
DO $guarda$
DECLARE
  r record;
  v_md5 text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('public.cat_ler_atributos(uuid)',                       '969e8a34b6bb2435138c06fecce8e23e'),
      ('public.cat_ler_atributos_gestao(uuid)',                '5587a407f8e8b30a6e15cd85e754e45b'),
      ('public.cat_ler_atributos_definicoes(uuid)',            'fa4c5bbceef2faff24b9eae6d65bc17e'),
      ('public.cat_guardar_opcao(uuid,uuid,text,text)',        '25327c5d0a887e0a9106a496b00231f8'),
      ('public.cat_editar_opcao(uuid,uuid,text,text,boolean)', 'e7fd2bbb229ea6abf74a5da0cc6254c9')
    ) AS t(assinatura, md5)
  LOOP
    IF to_regprocedure(r.assinatura) IS NULL THEN
      RAISE EXCEPTION '%', format('Guarda: a função %s não existe nesta base (é a base de RH?).', r.assinatura);
    END IF;
    SELECT md5(pg_get_functiondef(to_regprocedure(r.assinatura))) INTO v_md5;
    IF v_md5 IS DISTINCT FROM r.md5 THEN
      RAISE EXCEPTION '%', format('Guarda: %s mudou desde a leitura (md5 %s, esperado %s). Rever antes de sobrepor.',
                                  r.assinatura, v_md5, r.md5);
    END IF;
  END LOOP;

  IF to_regprocedure('public.fn_cat_pode(uuid,text)') IS NULL
     OR to_regprocedure('public.fn_cat_exigir(uuid,text)') IS NULL
     OR to_regprocedure('public.fn_cat_exigir_uma(uuid,text[])') IS NULL
     OR to_regprocedure('public.fn_cat_grupo_do_atributo(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Guarda: faltam fn_cat_pode, fn_cat_exigir, fn_cat_exigir_uma ou fn_cat_grupo_do_atributo com os argumentos esperados.';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
             AND p.proname IN ('cat_aspeto_opcao', 'cat_definir_aspeto_atributo')) THEN
    RAISE EXCEPTION 'Guarda: cat_aspeto_opcao ou cat_definir_aspeto_atributo já existem (ver o que está na base).';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns c
             WHERE c.table_schema = 'public'
               AND ((c.table_name = 'product_attributes' AND c.column_name = 'has_aspect')
                 OR (c.table_name = 'attribute_option_group_values' AND c.column_name IN ('is_metal', 'superficie')))) THEN
    RAISE EXCEPTION 'Guarda: has_aspect, is_metal ou superficie já existem (ver o que está na base).';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint co
             WHERE co.conname IN ('product_attributes_has_aspect_check', 'attribute_option_group_values_superficie_check')) THEN
    RAISE EXCEPTION 'Guarda: já existe product_attributes_has_aspect_check ou attribute_option_group_values_superficie_check.';
  END IF;
END
$guarda$;

-- ---- 1 e 2. Colunas e regras (um só ALTER por tabela: um só pedido de lock) -------------------------------------
ALTER TABLE public.product_attributes
  ADD COLUMN has_aspect boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT product_attributes_has_aspect_check CHECK (NOT has_aspect OR NOT is_measurement);

COMMENT ON COLUMN public.product_attributes.has_aspect IS
  'As opções deste atributo de lista têm aspeto (é metal, superfície por omissão) para o 3D. Nunca numa medida. Desligar não apaga os valores das opções. Muda-se por cat_definir_aspeto_atributo.';

ALTER TABLE public.attribute_option_group_values
  ADD COLUMN is_metal boolean NOT NULL DEFAULT false,
  ADD COLUMN superficie text NULL,
  ADD CONSTRAINT attribute_option_group_values_superficie_check
    CHECK (superficie IS NULL OR superficie IN ('polida', 'acetinada', 'mate'));

COMMENT ON COLUMN public.attribute_option_group_values.is_metal IS
  'A opção é um metal (o 3D usa metalness 1). Só conta quando o atributo tem has_aspect. Escreve-se por cat_aspeto_opcao.';
COMMENT ON COLUMN public.attribute_option_group_values.superficie IS
  'Superfície por omissão da opção: polida, acetinada ou mate; NULL = nenhuma. Só conta quando o atributo tem has_aspect. Escreve-se por cat_aspeto_opcao.';

-- ---- 3. cat_definir_aspeto_atributo -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cat_definir_aspeto_atributo(p_org uuid, p_atributo uuid, p_tem_aspeto boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  -- a mesma permissão que cat_guardar_atributo e cat_definir_foto_atributo exigem
  v_user uuid := public.fn_cat_exigir(p_org, 'products.edit');
  a record;
BEGIN
  IF p_tem_aspeto IS NULL THEN
    RAISE EXCEPTION 'Indique se as opções deste atributo têm aspeto.' USING ERRCODE = 'CT002';
  END IF;

  SELECT pa.id, pa.label, pa.is_measurement INTO a
  FROM product_attributes pa
  WHERE pa.id = p_atributo AND pa.organization_id = p_org AND pa.deleted_at IS NULL FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Atributo não encontrado.' USING ERRCODE = 'CT003'; END IF;

  IF p_tem_aspeto AND a.is_measurement THEN
    RAISE EXCEPTION 'A «%» é uma medida: as medidas não têm aspeto.', a.label USING ERRCODE = 'CT002';
  END IF;

  -- desligar não apaga nada: is_metal e superficie ficam nas opções e voltam ao ligar
  UPDATE product_attributes pa SET has_aspect = p_tem_aspeto
  WHERE pa.id = a.id AND pa.has_aspect IS DISTINCT FROM p_tem_aspeto;

  RETURN jsonb_build_object('atributo', jsonb_build_object('id', a.id, 'tem_aspeto', p_tem_aspeto));
END $function$;

-- a ordem importa: primeiro tirar (o CREATE dá EXECUTE a PUBLIC e o default ACL a anon), depois dar
REVOKE ALL ON FUNCTION public.cat_definir_aspeto_atributo(uuid,uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_definir_aspeto_atributo(uuid,uuid,boolean) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_definir_aspeto_atributo(uuid,uuid,boolean) IS
  'Liga/desliga «Tem aspeto» (has_aspect) num atributo de lista. Desligar não apaga os valores das opções. Exige products.edit.';

-- ---- 4. cat_aspeto_opcao ----------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cat_aspeto_opcao(p_org uuid, p_opcao uuid, p_metal boolean, p_superficie text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user uuid := public.fn_cat_exigir(p_org, 'products.edit');
  c_max_texto constant integer := 20;
  a record; o record; v_grupo uuid; v_metal boolean; v_sup text;
BEGIN
  -- texto absurdo: recusado antes de qualquer trabalho
  IF length(p_superficie) > c_max_texto THEN
    RAISE EXCEPTION 'A superfície não é válida: escolha polida, acetinada ou mate.' USING ERRCODE = 'CT002';
  END IF;

  -- o atributo fica preso até ao fim (o mesmo que cat_editar_opcao e cat_definir_aspeto_atributo prendem)
  SELECT pa.id, pa.label, pa.has_aspect AS tem_aspeto, g.organization_id AS grupo_org INTO a
  FROM attribute_option_group_values ov
  JOIN attribute_option_groups g ON g.id = ov.group_id
  JOIN product_attributes pa ON pa.id = g.attribute_id
  WHERE ov.id = p_opcao AND pa.organization_id = p_org AND pa.deleted_at IS NULL
    AND (g.organization_id = p_org OR g.organization_id IS NULL)
  FOR NO KEY UPDATE OF pa;
  IF NOT FOUND THEN RAISE EXCEPTION 'Opção não encontrada.' USING ERRCODE = 'CT003'; END IF;
  IF a.grupo_org IS NULL THEN
    RAISE EXCEPTION 'Opção partilhada: não se pode alterar aqui.' USING ERRCODE = 'CT002';
  END IF;
  IF NOT a.tem_aspeto THEN
    RAISE EXCEPTION 'Ligue primeiro «Tem aspeto» no atributo «%».', a.label USING ERRCODE = 'CT002';
  END IF;

  -- só a opção do grupo em uso (o mesmo que ler e gravar usam)
  v_grupo := public.fn_cat_grupo_do_atributo(a.id, p_org);
  SELECT ov.id, ov.is_metal AS metal, ov.superficie INTO o
  FROM attribute_option_group_values ov WHERE ov.id = p_opcao AND ov.group_id = v_grupo FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Opção não encontrada.' USING ERRCODE = 'CT003'; END IF;

  -- metal: NULL não mexe
  v_metal := coalesce(p_metal, o.metal);

  -- superfície: NULL não mexe; '' limpa; senão polida | acetinada | mate
  IF p_superficie IS NULL THEN
    v_sup := o.superficie;
  ELSIF btrim(p_superficie) = '' THEN
    v_sup := NULL;
  ELSE
    v_sup := lower(btrim(p_superficie));
    IF v_sup NOT IN ('polida', 'acetinada', 'mate') THEN
      RAISE EXCEPTION 'A superfície «%» não é válida: escolha polida, acetinada ou mate.', v_sup USING ERRCODE = 'CT002';
    END IF;
  END IF;

  UPDATE attribute_option_group_values ov SET is_metal = v_metal, superficie = v_sup
  WHERE ov.id = p_opcao AND (ov.is_metal, ov.superficie) IS DISTINCT FROM (v_metal, v_sup);

  RETURN jsonb_build_object(
    'opcao', jsonb_build_object('id', o.id, 'metal', v_metal, 'superficie', v_sup),
    'anterior', jsonb_build_object('metal', o.metal, 'superficie', o.superficie));
END $function$;

REVOKE ALL ON FUNCTION public.cat_aspeto_opcao(uuid,uuid,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_aspeto_opcao(uuid,uuid,boolean,text) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_aspeto_opcao(uuid,uuid,boolean,text) IS
  'Põe o aspeto de uma opção (é metal; superfície polida/acetinada/mate) num atributo com has_aspect. NULL = não mexe; superfície '''' = limpa. Devolve {opcao, anterior}. Exige products.edit.';

-- ---- 5. cat_ler_atributos (de 20270126300000; + 'tem_aspeto', 'metal' e 'superficie') --------------------------
CREATE OR REPLACE FUNCTION public.cat_ler_atributos(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_tec boolean; v_val boolean;
BEGIN
  -- as mesmas permissões e o mesmo corte de cat_ler_produtos_tabelas (20270117100000)
  v_tec := public.fn_neg_so_execucao(p_org, 'services.view');
  IF NOT v_tec AND NOT public.fn_cat_pode(p_org, 'services.view') THEN
    v_tec := public.fn_cat_pode(p_org, 'pessoas.view')
      OR EXISTS (SELECT 1 FROM public.anew_permissions ap WHERE ap.code LIKE 'negocios.%' AND public.fn_cat_pode(p_org, ap.code));
  END IF;
  IF NOT v_tec THEN PERFORM public.fn_cat_exigir(p_org, 'services.view'); END IF;
  v_val := NOT v_tec OR public.fn_cat_pode(p_org, 'negocios.obra.materiais');
  RETURN (
    WITH atr AS (
      -- 20270126300000: "tem_foto"; 20270126400000: "tem_aspeto"
      SELECT a.id, a.code, a.label, a.is_measurement, coalesce(a.has_hex_color, false) AS tem_hex,
             a.has_photo AS tem_foto, a.has_aspect AS tem_aspeto, coalesce(a.sort_order, 0) AS ordem,
             CASE WHEN a.is_measurement THEN NULL ELSE public.fn_cat_grupo_do_atributo(a.id, p_org) END AS grupo
      FROM product_attributes a
      WHERE a.organization_id = p_org AND a.deleted_at IS NULL
    ),
    -- todas as opções dos grupos (activas e desativadas): os valores resolvem-se por aqui
    -- 20270118000000: "sigla"; 20270126300000: "foto"; 20270126400000: "metal" e "superficie"
    opc_todas AS (
      SELECT o.id, o.group_id, o.value_text::text AS valor, coalesce(o.display_name, o.value_text)::text AS nome,
             o.hex_color::text AS hex, coalesce(o.sort_order, 0) AS ordem, o.is_active, o.sigla, o.foto_path AS foto,
             o.is_metal AS metal, o.superficie
      FROM attribute_option_group_values o
      WHERE o.group_id IN (SELECT grupo FROM atr WHERE grupo IS NOT NULL)
    ),
    val AS (
      SELECT v.product_id, v.attribute_id, v.value_text, v.value_json, v.unit, a.is_measurement, a.grupo, a.ordem, a.label
      FROM product_attribute_values v
      JOIN atr a ON a.id = v.attribute_id
      JOIN products p ON p.id = v.product_id AND p.organization_id = p_org AND NOT p.is_deleted AND p.tipo_catalogo = 'produto'
      WHERE v_val
    )
    SELECT jsonb_build_object(
      'atributos', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', a.id, 'codigo', a.code, 'nome', a.label,
                 'tipo', CASE WHEN a.is_measurement THEN 'medida' ELSE 'lista' END,
                 'tem_hex', a.tem_hex, 'tem_foto', a.tem_foto, 'tem_aspeto', a.tem_aspeto, 'ordem', a.ordem,
                 'opcoes', CASE WHEN a.is_measurement THEN '[]'::jsonb ELSE coalesce((
                   SELECT jsonb_agg(jsonb_build_object('id', o.id, 'valor', o.valor, 'nome', o.nome,
                                                       'hex', CASE WHEN a.tem_hex THEN o.hex END, 'ordem', o.ordem,
                                                       'sigla', o.sigla, 'foto', o.foto,
                                                       'metal', CASE WHEN a.tem_aspeto THEN o.metal END,
                                                       'superficie', CASE WHEN a.tem_aspeto THEN o.superficie END)
                                    ORDER BY o.ordem, o.valor, o.id)
                   FROM opc_todas o WHERE o.group_id = a.grupo AND o.is_active), '[]'::jsonb) END)
               ORDER BY a.ordem, a.label, a.id)
        FROM atr a), '[]'::jsonb),
      'produtos', coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', x.product_id, 'valores', x.valores) ORDER BY x.product_id)
        FROM (
          SELECT v.product_id,
                 jsonb_agg(jsonb_build_object(
                   'atributo', v.attribute_id,
                   'opcao', CASE WHEN v.is_measurement THEN NULL ELSE o.id END,
                   'valor', v.value_text,
                   'medida', CASE WHEN v.is_measurement THEN public.fn_cat_medida_ler(v.value_json, v.unit) END,
                   'ativa', CASE WHEN v.is_measurement THEN true ELSE coalesce(o.is_active, false) END)
                   ORDER BY v.ordem, v.label, v.attribute_id) AS valores
          FROM val v
          LEFT JOIN opc_todas o ON NOT v.is_measurement AND o.group_id = v.grupo AND o.valor = v.value_text
          GROUP BY v.product_id
        ) x), '[]'::jsonb)
    ));
END $function$;

-- ---- 5. cat_ler_atributos_gestao (de 20270126300000; + 'tem_aspeto', 'metal' e 'superficie') ------------------
CREATE OR REPLACE FUNCTION public.cat_ler_atributos_gestao(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- o ecrã de gestão: quem edita produtos ou quem vê o catálogo; o perfil reduzido de Negócios não entra
  PERFORM public.fn_cat_exigir_uma(p_org, ARRAY['products.edit', 'services.view']);
  RETURN (
    WITH atr AS (
      -- 20270118000000: "sku_ordem" e "sku_entra"; 20270126300000: "tem_foto"; 20270126400000: "tem_aspeto"
      SELECT a.id, a.code, a.label, a.is_measurement, coalesce(a.has_hex_color, false) AS tem_hex,
             a.has_photo AS tem_foto, a.has_aspect AS tem_aspeto, coalesce(a.sort_order, 0) AS ordem,
             a.sku_ordem, a.sku_entra,
             CASE WHEN a.is_measurement THEN NULL ELSE public.fn_cat_grupo_do_atributo(a.id, p_org) END AS grupo
      FROM product_attributes a
      WHERE a.organization_id = p_org AND a.deleted_at IS NULL
    ),
    -- uma só passagem pelos valores: quantos produtos vivos por atributo e texto
    uso AS (
      SELECT v.attribute_id, v.value_text, count(*)::integer AS n
      FROM product_attribute_values v
      JOIN atr a ON a.id = v.attribute_id
      JOIN products p ON p.id = v.product_id AND p.organization_id = p_org AND NOT p.is_deleted
      GROUP BY v.attribute_id, v.value_text
    ),
    uso_atr AS (SELECT u.attribute_id, sum(u.n)::integer AS n FROM uso u GROUP BY u.attribute_id),
    opc AS (
      -- 20270118000000: "sigla"; 20270126300000: "foto"; 20270126400000: "metal" e "superficie"
      SELECT o.id, o.group_id, o.value_text::text AS valor, coalesce(o.display_name, o.value_text)::text AS nome,
             o.hex_color::text AS hex, coalesce(o.sort_order, 0) AS ordem, o.is_active AS ativo, o.sigla,
             o.foto_path AS foto, o.is_metal AS metal, o.superficie
      FROM attribute_option_group_values o
      WHERE o.group_id IN (SELECT grupo FROM atr WHERE grupo IS NOT NULL)
    )
    SELECT jsonb_build_object('atributos', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', a.id, 'codigo', a.code, 'nome', a.label,
               'tipo', CASE WHEN a.is_measurement THEN 'medida' ELSE 'lista' END,
               'tem_hex', a.tem_hex, 'tem_foto', a.tem_foto, 'tem_aspeto', a.tem_aspeto, 'ordem', a.ordem, 'ativo', true,
               'usados', coalesce(ua.n, 0), 'sku_ordem', a.sku_ordem, 'sku_entra', a.sku_entra,
               'opcoes', CASE WHEN a.is_measurement THEN '[]'::jsonb ELSE coalesce((
                 SELECT jsonb_agg(jsonb_build_object(
                          'id', o.id, 'valor', o.valor, 'nome', o.nome,
                          'hex', CASE WHEN a.tem_hex THEN o.hex END, 'ordem', o.ordem, 'ativo', o.ativo,
                          'usados', coalesce(u.n, 0), 'sigla', o.sigla, 'foto', o.foto,
                          'metal', CASE WHEN a.tem_aspeto THEN o.metal END,
                          'superficie', CASE WHEN a.tem_aspeto THEN o.superficie END)
                        ORDER BY o.ordem, o.valor, o.id)
                 FROM opc o
                 LEFT JOIN uso u ON u.attribute_id = a.id AND u.value_text = o.valor
                 WHERE o.group_id = a.grupo), '[]'::jsonb) END)
             ORDER BY a.ordem, a.label, a.id)
      FROM atr a LEFT JOIN uso_atr ua ON ua.attribute_id = a.id), '[]'::jsonb))
  );
END $function$;

-- ---- 5. cat_ler_atributos_definicoes (de 20270126300000; + 'tem_aspeto', 'metal' e 'superficie') --------------
CREATE OR REPLACE FUNCTION public.cat_ler_atributos_definicoes(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.fn_cat_exigir_uma(p_org, ARRAY['products.edit', 'services.view']);
  RETURN (
    -- copiado de cat_ler_atributos (20270118000000, md5 conferido na guarda): o campo "atributos"
    -- 20270126300000: "tem_foto" e "foto"; 20270126400000: "tem_aspeto", "metal" e "superficie"
    WITH atr AS (
      SELECT a.id, a.code, a.label, a.is_measurement, coalesce(a.has_hex_color, false) AS tem_hex,
             a.has_photo AS tem_foto, a.has_aspect AS tem_aspeto, coalesce(a.sort_order, 0) AS ordem,
             CASE WHEN a.is_measurement THEN NULL ELSE public.fn_cat_grupo_do_atributo(a.id, p_org) END AS grupo
      FROM product_attributes a
      WHERE a.organization_id = p_org AND a.deleted_at IS NULL
    ),
    opc AS (
      SELECT o.id, o.group_id, o.value_text::text AS valor, coalesce(o.display_name, o.value_text)::text AS nome,
             o.hex_color::text AS hex, coalesce(o.sort_order, 0) AS ordem, o.sigla, o.foto_path AS foto,
             o.is_metal AS metal, o.superficie
      FROM attribute_option_group_values o
      WHERE o.group_id IN (SELECT grupo FROM atr WHERE grupo IS NOT NULL) AND o.is_active
    )
    SELECT jsonb_build_object('atributos', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', a.id, 'codigo', a.code, 'nome', a.label,
               'tipo', CASE WHEN a.is_measurement THEN 'medida' ELSE 'lista' END,
               'tem_hex', a.tem_hex, 'tem_foto', a.tem_foto, 'tem_aspeto', a.tem_aspeto, 'ordem', a.ordem,
               'opcoes', CASE WHEN a.is_measurement THEN '[]'::jsonb ELSE coalesce((
                 SELECT jsonb_agg(jsonb_build_object('id', o.id, 'valor', o.valor, 'nome', o.nome,
                                                     'hex', CASE WHEN a.tem_hex THEN o.hex END, 'ordem', o.ordem,
                                                     'sigla', o.sigla, 'foto', o.foto,
                                                     'metal', CASE WHEN a.tem_aspeto THEN o.metal END,
                                                     'superficie', CASE WHEN a.tem_aspeto THEN o.superficie END)
                                  ORDER BY o.ordem, o.valor, o.id)
                 FROM opc o WHERE o.group_id = a.grupo), '[]'::jsonb) END)
             ORDER BY a.ordem, a.label, a.id)
      FROM atr a), '[]'::jsonb))
  );
END $function$;

-- ---- 6. Conferir: falha a migration se alguma coisa não ficou como descrito -----------------------------------
DO $conferir$
DECLARE
  r record;
  v_oid oid;
  v_n integer;
  v_def text;
  v_md5 text;
BEGIN
  -- colunas
  SELECT count(*)::integer INTO v_n FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'product_attributes' AND c.column_name = 'has_aspect'
    AND c.data_type = 'boolean' AND c.is_nullable = 'NO' AND c.column_default = 'false';
  IF v_n <> 1 THEN RAISE EXCEPTION 'Conferir: falta product_attributes.has_aspect boolean NOT NULL DEFAULT false.'; END IF;

  SELECT count(*)::integer INTO v_n FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'attribute_option_group_values' AND c.column_name = 'is_metal'
    AND c.data_type = 'boolean' AND c.is_nullable = 'NO' AND c.column_default = 'false';
  IF v_n <> 1 THEN RAISE EXCEPTION 'Conferir: falta attribute_option_group_values.is_metal boolean NOT NULL DEFAULT false.'; END IF;

  SELECT count(*)::integer INTO v_n FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'attribute_option_group_values' AND c.column_name = 'superficie'
    AND c.data_type = 'text' AND c.is_nullable = 'YES' AND c.column_default IS NULL;
  IF v_n <> 1 THEN RAISE EXCEPTION 'Conferir: falta attribute_option_group_values.superficie text NULL sem default.'; END IF;

  -- CHECKs validados (::text em contype: é do tipo "char"; to_regclass só aqui, já com as colunas)
  SELECT pg_get_constraintdef(co.oid) INTO v_def FROM pg_constraint co
  WHERE co.conname = 'product_attributes_has_aspect_check' AND co.contype::text = 'c' AND co.convalidated
    AND co.conrelid = to_regclass('public.product_attributes');
  IF v_def IS NULL OR position('has_aspect' IN v_def) = 0 OR position('is_measurement' IN v_def) = 0 THEN
    RAISE EXCEPTION '%', format('Conferir: CHECK de has_aspect em falta ou diferente (%s).', coalesce(v_def, 'nenhum'));
  END IF;
  v_def := NULL;
  SELECT pg_get_constraintdef(co.oid) INTO v_def FROM pg_constraint co
  WHERE co.conname = 'attribute_option_group_values_superficie_check' AND co.contype::text = 'c' AND co.convalidated
    AND co.conrelid = to_regclass('public.attribute_option_group_values');
  IF v_def IS NULL OR position('superficie' IN v_def) = 0 OR position('acetinada' IN v_def) = 0 THEN
    RAISE EXCEPTION '%', format('Conferir: CHECK de superficie em falta ou diferente (%s).', coalesce(v_def, 'nenhum'));
  END IF;

  -- nenhum dado mudou: tudo desligado
  SELECT count(*)::integer INTO v_n FROM public.product_attributes pa WHERE pa.has_aspect;
  IF v_n <> 0 THEN
    RAISE EXCEPTION '%', format('Conferir: %s atributo(s) ficaram com has_aspect = true (esperado 0).', v_n);
  END IF;
  SELECT count(*)::integer INTO v_n FROM public.attribute_option_group_values o WHERE o.is_metal OR o.superficie IS NOT NULL;
  IF v_n <> 0 THEN
    RAISE EXCEPTION '%', format('Conferir: %s opção(ões) com is_metal ou superficie (esperado 0).', v_n);
  END IF;

  -- funções: uma só versão por nome, assinatura, resultado, SECURITY DEFINER, search_path e privilégios
  FOR r IN SELECT * FROM (VALUES
      ('cat_definir_aspeto_atributo',  'p_org uuid, p_atributo uuid, p_tem_aspeto boolean'),
      ('cat_aspeto_opcao',             'p_org uuid, p_opcao uuid, p_metal boolean, p_superficie text'),
      ('cat_ler_atributos',            'p_org uuid'),
      ('cat_ler_atributos_gestao',     'p_org uuid'),
      ('cat_ler_atributos_definicoes', 'p_org uuid'),
      ('cat_guardar_opcao',            'p_org uuid, p_atributo uuid, p_valor text, p_hex text'),
      ('cat_editar_opcao',             'p_org uuid, p_opcao uuid, p_nome text, p_hex text, p_ativo boolean')
    ) AS t(nome, args)
  LOOP
    SELECT count(*)::integer INTO v_n FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname = r.nome;
    IF v_n <> 1 THEN
      RAISE EXCEPTION '%', format('Conferir: %s tem %s versões (esperado 1).', r.nome, v_n);
    END IF;
    v_oid := NULL;
    SELECT p.oid INTO v_oid FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname = r.nome
      AND pg_get_function_identity_arguments(p.oid) = r.args
      AND pg_get_function_result(p.oid) = 'jsonb'
      AND p.prosecdef
      AND p.proconfig::text = '{"search_path=public, pg_temp"}';
    IF v_oid IS NULL THEN
      RAISE EXCEPTION '%', format('Conferir: %s não tem a assinatura (%s) → jsonb, SECURITY DEFINER e search_path esperados.', r.nome, r.args);
    END IF;
    IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_oid, 'EXECUTE')
       OR has_function_privilege('anon', v_oid, 'EXECUTE')
       OR EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) x WHERE p.oid = v_oid AND x.grantee = 0) THEN
      RAISE EXCEPTION '%', format('Conferir: os privilégios de %s divergem (esperado EXECUTE só a authenticated e service_role, nada a anon/PUBLIC).', r.nome);
    END IF;
  END LOOP;

  -- as que não se tocam continuam iguais
  FOR r IN SELECT * FROM (VALUES
      ('public.cat_guardar_opcao(uuid,uuid,text,text)',        '25327c5d0a887e0a9106a496b00231f8'),
      ('public.cat_editar_opcao(uuid,uuid,text,text,boolean)', 'e7fd2bbb229ea6abf74a5da0cc6254c9')
    ) AS t(assinatura, md5)
  LOOP
    SELECT md5(pg_get_functiondef(to_regprocedure(r.assinatura))) INTO v_md5;
    IF v_md5 IS DISTINCT FROM r.md5 THEN
      RAISE EXCEPTION '%', format('Conferir: %s mudou (md5 %s, esperado %s) e não devia.', r.assinatura, v_md5, r.md5);
    END IF;
  END LOOP;

  -- as três leituras levam mesmo as chaves novas
  SELECT count(*)::integer INTO v_n FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname IN ('cat_ler_atributos', 'cat_ler_atributos_gestao', 'cat_ler_atributos_definicoes')
    AND position('tem_aspeto' IN p.prosrc) > 0 AND position('superficie' IN p.prosrc) > 0
    AND position('is_metal' IN p.prosrc) > 0 AND position('tem_foto' IN p.prosrc) > 0;
  IF v_n <> 3 THEN
    RAISE EXCEPTION '%', format('Conferir: só %s de 3 leituras levam tem_aspeto, metal e superficie.', v_n);
  END IF;
END
$conferir$;

RESET lock_timeout;
RESET statement_timeout;
