-- ============================================================
-- Testes: 20270117600000_atributos_gestao_catalogo.sql (base RH)
-- ============================================================
-- ORDEM: depende de 20270117500000_atributos_funcoes_catalogo.sql (já aplicada). Correr ANTES do db push da 600000
-- (falha no passo 0, «função cat_ler_atributos_gestao não existe»); depois do push termina com «OK: …».
-- Qualquer falha rebenta com 'FALHOU: …'.
--
-- Tudo dentro de BEGIN … ROLLBACK e SÓ escrito na nike (b6ffce4f-f630-4933-833a-008649757a33). Dentro da transacção
-- cria para a nike atributos temporários (Cor com hex, Textura sem hex, um «Misto» com um grupo GLOBAL e um da
-- organização, e um «Só global» — os grupos globais, organization_id nulo, ficam presos a atributos da nike), opções,
-- valores em três produtos da nike (dois vivos e um apagado: usa um já apagado ou marca um como apagado, tudo desfeito)
-- e um preço por opção (product_attribute_value_prices). Nada se lê nem escreve noutras organizações: a BM24
-- (872abff2-043f-41e1-99dd-0a8e305ddecb) só aparece como p_org para provar a recusa CT001.
-- Sessões emprestadas (role authenticated, auth.uid() pelas claims), membros activos da nike, não system admin:
--   editor   products.edit e services.view, fora da BM24 e sem permissões lá (confirmado por fn_cat_pode)
--   sem      sem products.edit (confirmado por fn_cat_pode)
--   reduzido perfil reduzido de Negócios: sem services.view nem products.edit (confirmado por fn_cat_pode)
--
-- Correr a partir do worktree rh-pessoas (supabase/.temp/project-ref = uetjghdkwbywbftedtth):
--   supabase db query --linked -f supabase/tests/atributos_gestao.test.sql
-- Chamadas recusadas de propósito: cerca de 25 (ficam como erro no registo do Postgres).
--
-- Cobre (uma prova por suspeita):
--   1. Ler para gestão: opções ativas e desativadas, «ativo», «usados» por atributo e opção (só produtos vivos)
--   2. Criar lista com hex (nome limpo, código, grupo da organização) e medida; medida com hex → CT002; sufixo _2 no código
--   3. Atributo repetido (maiúsculas/acentos/invisíveis) → CT004 com o id no DETAIL
--   4. Renomear atributo (código fica); mudar o tipo → CT002
--   5. tem_hex: com produtos → CT002; sem produtos → muda; ligar com opções → CT002
--   6. Renomear opção: valores de 3 produtos (incl. apagado) e o preço (value_option) acompanham; ligação mantém-se
--   7. Opção repetida (ativa e desativada) → CT004 com o id no DETAIL
--   8. Hex: inválido → CT002; minúsculas → maiúsculas; vazio num atributo com cor → CT002; vazio sem cor → aceite;
--      hex num atributo sem cor → CT002
--   9. Desativar (valores ficam) e reativar
--  10. Reordenar; lista incompleta → CT002; mais de 500 → CT002; nome com mais de 1000 caracteres → CT002
--  11. Grupo global + grupo da organização: a da organização edita-se, a global é «Opção partilhada» (CT002);
--      reordenar atributo só com grupo global → CT002
--  12. Sem products.edit → CT001 nas três escritas; perfil reduzido a ler para gestão → CT001
--  13. Isolamento: p_org = BM24 (reordenar e ler) → CT001; organização inventada → CT001; opção inexistente → CT003
--  14. Catálogo: anon e PUBLIC sem EXECUTE nas 5 funções; cat_guardar_produto_atributos com FOR SHARE
-- ============================================================

BEGIN;

-- ─── 0. A migration está aplicada? ───────────────────────────────────────────
DO $t$
BEGIN
  IF to_regprocedure('public.cat_ler_atributos_gestao(uuid)') IS NULL THEN
    RAISE EXCEPTION 'FALHOU: função cat_ler_atributos_gestao não existe (aplicar 20270117600000_atributos_gestao_catalogo.sql).';
  END IF;
END $t$;

-- ─── Fixtures (como postgres, escritas só na nike) ───────────────────────────
DO $fx$
DECLARE
  c_org constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  c_bm24 constant uuid := '872abff2-043f-41e1-99dd-0a8e305ddecb';
  v_auth uuid; v_act uuid; v_sem uuid; v_red uuid; v_prod uuid; v_prod2 uuid; v_apag uuid; r record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM anew_organizations WHERE id = c_org) THEN RAISE EXCEPTION 'FALHOU: a nike não existe nesta base'; END IF;
  PERFORM set_config('app.audit_source', 'teste:atributos_gestao', true);

  SELECT u.auth_user_id, u.id INTO v_auth, v_act
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
  WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND NOT coalesce(m.role_is_client, false)
    AND public.has_anew_permission_in_org(u.auth_user_id, 'products.edit', c_org)
    AND public.has_anew_permission_in_org(u.auth_user_id, 'services.view', c_org)
    AND NOT public.is_system_admin_user(u.auth_user_id)
    AND NOT EXISTS (SELECT 1 FROM anew_memberships mb WHERE mb.user_id = u.id AND mb.organization_id = c_bm24 AND mb.status = 'active')
  ORDER BY m.created_at, u.id LIMIT 1;
  IF v_auth IS NULL THEN RAISE EXCEPTION 'FALHOU: sem membro activo da nike (não system admin, fora da BM24) com products.edit e services.view'; END IF;
  -- o editor não pode ter nada na BM24, senão a prova CT001 não prova nada
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  IF public.fn_cat_pode(c_bm24, 'products.edit') OR public.fn_cat_pode(c_bm24, 'services.view') THEN
    RAISE EXCEPTION 'FALHOU: o editor emprestado tem permissões na BM24; escolher outra organização para a prova de isolamento';
  END IF;

  -- o membro sem products.edit e o do perfil reduzido: confirmados por fn_cat_pode com as claims de cada um
  FOR r IN SELECT u.auth_user_id
           FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
           WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND NOT coalesce(m.role_is_client, false)
             AND NOT public.is_system_admin_user(u.auth_user_id)
           ORDER BY m.created_at, u.id LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', r.auth_user_id, 'role', 'authenticated')::text, true);
    IF v_sem IS NULL AND NOT public.fn_cat_pode(c_org, 'products.edit') THEN v_sem := r.auth_user_id; END IF;
    IF v_red IS NULL AND NOT public.fn_cat_pode(c_org, 'services.view') AND NOT public.fn_cat_pode(c_org, 'products.edit')
       AND (public.fn_cat_pode(c_org, 'pessoas.view')
            OR EXISTS (SELECT 1 FROM anew_permissions ap WHERE ap.code LIKE 'negocios.%' AND public.fn_cat_pode(c_org, ap.code))) THEN
      v_red := r.auth_user_id;
    END IF;
    EXIT WHEN v_sem IS NOT NULL AND v_red IS NOT NULL;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
  IF v_sem IS NULL THEN RAISE EXCEPTION 'FALHOU: sem membro activo da nike sem products.edit'; END IF;
  IF v_red IS NULL THEN RAISE EXCEPTION 'FALHOU: sem membro activo da nike no perfil reduzido de Negócios'; END IF;

  -- três produtos da nike: dois vivos e um apagado (um já apagado, ou um vivo marcado como apagado — desfeito no fim)
  SELECT p.id INTO v_prod FROM products p
  WHERE p.organization_id = c_org AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted
  ORDER BY p.created_at, p.id LIMIT 1;
  SELECT p.id INTO v_prod2 FROM products p
  WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.id <> v_prod
  ORDER BY p.created_at, p.id LIMIT 1;
  SELECT p.id INTO v_apag FROM products p WHERE p.organization_id = c_org AND p.is_deleted ORDER BY p.created_at, p.id LIMIT 1;
  IF v_apag IS NULL THEN
    SELECT p.id INTO v_apag FROM products p
    WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.id NOT IN (v_prod, v_prod2)
    ORDER BY p.created_at, p.id LIMIT 1;
    UPDATE products SET is_deleted = true WHERE id = v_apag AND organization_id = c_org;
  END IF;
  IF v_prod IS NULL OR v_prod2 IS NULL OR v_apag IS NULL THEN RAISE EXCEPTION 'FALHOU: a nike não tem três produtos para o teste'; END IF;

  INSERT INTO product_attributes (id, organization_id, code, label, type, value_type, has_hex_color, is_measurement, measurement_type, unit,
                                  pricing_type, valorization_type, is_variant_option, is_variant_attribute, sort_order, created_by)
  VALUES ('2027b600-0000-4000-8000-000000000001', c_org, 'teste_g2027_cor',     'Teste Gestão 2027 Cor',        'select', 'list', true,  false, NULL, NULL, 'none', 'none', false, false, 911, v_act),
         ('2027b600-0000-4000-8000-000000000002', c_org, 'teste_g2027_textura', 'Teste Gestão 2027 Textura',    'select', 'list', false, false, NULL, NULL, 'none', 'none', false, false, 912, v_act),
         ('2027b600-0000-4000-8000-000000000003', c_org, 'teste_g2027_misto',   'Teste Gestão 2027 Misto',      'select', 'list', false, false, NULL, NULL, 'none', 'none', false, false, 913, v_act),
         ('2027b600-0000-4000-8000-000000000004', c_org, 'teste_g2027_global',  'Teste Gestão 2027 Só Global',  'select', 'list', false, false, NULL, NULL, 'none', 'none', false, false, 914, v_act);
  INSERT INTO attribute_option_groups (id, attribute_id, organization_id, name, sort_order, is_active, created_by)
  VALUES ('2027b600-0000-4000-8000-000000000011', '2027b600-0000-4000-8000-000000000001', c_org, 'Teste Gestão 2027 Cor', 0, true, v_act),
         ('2027b600-0000-4000-8000-000000000012', '2027b600-0000-4000-8000-000000000002', c_org, 'Teste Gestão 2027 Textura', 0, true, v_act),
         ('2027b600-0000-4000-8000-000000000013', '2027b600-0000-4000-8000-000000000003', NULL,  'Teste Gestão 2027 Misto (global)', 0, true, v_act),
         ('2027b600-0000-4000-8000-000000000014', '2027b600-0000-4000-8000-000000000003', c_org, 'Teste Gestão 2027 Misto', 0, true, v_act),
         ('2027b600-0000-4000-8000-000000000015', '2027b600-0000-4000-8000-000000000004', NULL,  'Teste Gestão 2027 Só Global', 0, true, v_act);
  INSERT INTO attribute_option_group_values (id, group_id, value_text, display_name, hex_color, sort_order, is_active)
  VALUES ('2027b600-0000-4000-8000-000000000021', '2027b600-0000-4000-8000-000000000011', 'Branco G', 'Branco G', '#FFFFFF', 1, true),
         ('2027b600-0000-4000-8000-000000000022', '2027b600-0000-4000-8000-000000000011', 'Cinza G',  'Cinza G',  '#808080', 2, true),
         ('2027b600-0000-4000-8000-000000000023', '2027b600-0000-4000-8000-000000000011', 'Antigo G', 'Antigo G', NULL,      3, false),
         ('2027b600-0000-4000-8000-000000000024', '2027b600-0000-4000-8000-000000000012', 'LISO G',   'Liso G',   NULL,      1, true),
         ('2027b600-0000-4000-8000-000000000025', '2027b600-0000-4000-8000-000000000013', 'Global G', 'Global G', NULL,      1, true),
         ('2027b600-0000-4000-8000-000000000026', '2027b600-0000-4000-8000-000000000014', 'Local G',  'Local G',  NULL,      1, true),
         ('2027b600-0000-4000-8000-000000000027', '2027b600-0000-4000-8000-000000000015', 'Só Global G', 'Só Global G', NULL, 1, true);
  INSERT INTO product_attribute_values (product_id, attribute_id, value_text)
  VALUES (v_prod,  '2027b600-0000-4000-8000-000000000001', 'Branco G'),
         (v_prod,  '2027b600-0000-4000-8000-000000000002', 'LISO G'),
         (v_prod2, '2027b600-0000-4000-8000-000000000001', 'Branco G'),
         (v_apag,  '2027b600-0000-4000-8000-000000000001', 'Branco G');
  INSERT INTO product_attribute_value_prices (id, attribute_id, value_option, price, organization_id, is_available, sort_order, created_at, updated_at)
  VALUES ('2027b600-0000-4000-8000-000000000031', '2027b600-0000-4000-8000-000000000001', 'Branco G', 10, c_org, true, 0, now(), now());

  PERFORM set_config('teste.org', c_org::text, true);
  PERFORM set_config('teste.bm24', c_bm24::text, true);
  PERFORM set_config('teste.prod', v_prod::text, true);
  PERFORM set_config('teste.apag', v_apag::text, true);
  PERFORM set_config('teste.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  PERFORM set_config('teste.claims_sem', json_build_object('sub', v_sem, 'role', 'authenticated')::text, true);
  PERFORM set_config('teste.claims_red', json_build_object('sub', v_red, 'role', 'authenticated')::text, true);
END $fx$;

-- ─── 1. Ler para gestão ──────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb; a jsonb; o jsonb;
BEGIN
  r := public.cat_ler_atributos_gestao(current_setting('teste.org')::uuid);
  SELECT x INTO a FROM jsonb_array_elements(r -> 'atributos') x WHERE x ->> 'id' = '2027b600-0000-4000-8000-000000000001';
  IF a IS NULL OR a ->> 'tipo' IS DISTINCT FROM 'lista' OR (a -> 'tem_hex')::boolean IS NOT TRUE OR (a -> 'ativo')::boolean IS NOT TRUE
     OR (a ->> 'usados')::int IS DISTINCT FROM 2 OR jsonb_array_length(a -> 'opcoes') IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'FALHOU: ler gestão — atributo Cor (usados só conta os 2 vivos): %', a;
  END IF;
  o := a -> 'opcoes' -> 0;
  IF o ->> 'id' IS DISTINCT FROM '2027b600-0000-4000-8000-000000000021' OR (o ->> 'usados')::int IS DISTINCT FROM 2
     OR (o -> 'ativo')::boolean IS NOT TRUE OR o ->> 'hex' IS DISTINCT FROM '#FFFFFF' THEN
    RAISE EXCEPTION 'FALHOU: ler gestão — opção Branco: %', o;
  END IF;
  o := a -> 'opcoes' -> 2;
  IF o ->> 'id' IS DISTINCT FROM '2027b600-0000-4000-8000-000000000023' OR (o -> 'ativo')::boolean IS NOT FALSE OR (o ->> 'usados')::int IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'FALHOU: ler gestão — opção desativada: %', o;
  END IF;
  SELECT x INTO a FROM jsonb_array_elements(r -> 'atributos') x WHERE x ->> 'id' = '2027b600-0000-4000-8000-000000000002';
  IF a IS NULL OR (a -> 'tem_hex')::boolean IS NOT FALSE OR (a ->> 'usados')::int IS DISTINCT FROM 1
     OR a -> 'opcoes' -> 0 ->> 'valor' IS DISTINCT FROM 'LISO G' OR a -> 'opcoes' -> 0 ->> 'nome' IS DISTINCT FROM 'Liso G'
     OR (a -> 'opcoes' -> 0 ->> 'usados')::int IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU: ler gestão — atributo Textura: %', a;
  END IF;
  -- Misto: lê o grupo da organização, não o global
  SELECT x INTO a FROM jsonb_array_elements(r -> 'atributos') x WHERE x ->> 'id' = '2027b600-0000-4000-8000-000000000003';
  IF a IS NULL OR jsonb_array_length(a -> 'opcoes') IS DISTINCT FROM 1 OR a -> 'opcoes' -> 0 ->> 'id' IS DISTINCT FROM '2027b600-0000-4000-8000-000000000026' THEN
    RAISE EXCEPTION 'FALHOU: ler gestão — atributo Misto devia mostrar só o grupo da organização: %', a;
  END IF;
END $t$;
RESET ROLE;

-- ─── 2. Criar atributos ──────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb;
BEGIN
  r := public.cat_guardar_atributo(current_setting('teste.org')::uuid, NULL, '  Acabamento' || chr(160) || 'Gestão   Teste2027 ', 'lista', true) -> 'atributo';
  IF r ->> 'nome' IS DISTINCT FROM 'Acabamento Gestão Teste2027' OR r ->> 'codigo' !~ '^acabamento_gestao_teste2027(_[0-9]+)?$'
     OR r ->> 'tipo' IS DISTINCT FROM 'lista' OR (r -> 'tem_hex')::boolean IS NOT TRUE OR (r ->> 'usados')::int IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'FALHOU: criar lista — %', r;
  END IF;
  PERFORM set_config('teste.novo', r ->> 'id', true);
  r := public.cat_guardar_atributo(current_setting('teste.org')::uuid, NULL, 'Medida Gestão Teste2027', 'medida', NULL) -> 'atributo';
  IF r ->> 'tipo' IS DISTINCT FROM 'medida' OR (r -> 'tem_hex')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'FALHOU: criar medida — %', r; END IF;
  PERFORM set_config('teste.medida', r ->> 'id', true);
  BEGIN
    PERFORM public.cat_guardar_atributo(current_setting('teste.org')::uuid, NULL, 'Medida Cor Teste2027', 'medida', true);
    RAISE EXCEPTION 'FALHOU: medida com hex foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL;
  END;
  -- «Teste G2027 Cor» tem nome novo mas o código teste_g2027_cor já existe: fica com _2
  r := public.cat_guardar_atributo(current_setting('teste.org')::uuid, NULL, 'Teste G2027 Cor', 'lista', false) -> 'atributo';
  IF r ->> 'codigo' IS DISTINCT FROM 'teste_g2027_cor_2' THEN RAISE EXCEPTION 'FALHOU: sufixo _2 — %', r; END IF;
END $t$;
RESET ROLE;
DO $t$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM product_attributes pa WHERE pa.id = current_setting('teste.novo')::uuid AND pa.organization_id = current_setting('teste.org')::uuid
                   AND pa.type::text = 'select' AND pa.value_type = 'list' AND pa.has_hex_color AND NOT pa.is_measurement
                   AND pa.pricing_type = 'none' AND pa.valorization_type = 'none')
     OR NOT EXISTS (SELECT 1 FROM attribute_option_groups g WHERE g.attribute_id = current_setting('teste.novo')::uuid
                      AND g.organization_id = current_setting('teste.org')::uuid AND g.is_active) THEN
    RAISE EXCEPTION 'FALHOU: criar lista — linha ou grupo da organização não ficaram como esperado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM product_attributes pa WHERE pa.id = current_setting('teste.medida')::uuid AND pa.type::text = 'text'
                   AND pa.value_type = 'json' AND pa.is_measurement AND pa.measurement_type = 'dimensoes' AND NOT coalesce(pa.has_hex_color, false))
     OR EXISTS (SELECT 1 FROM attribute_option_groups g WHERE g.attribute_id = current_setting('teste.medida')::uuid) THEN
    RAISE EXCEPTION 'FALHOU: criar medida — linha não ficou como esperado (ou ganhou grupo)';
  END IF;
END $t$;

-- ─── 3 a 5. Atributos: repetido, renomear, tipo, tem_hex ─────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb; v_det text; v_msg text;
BEGIN
  -- 3. repetido (maiúsculas, acentos, invisível)
  BEGIN
    PERFORM public.cat_guardar_atributo(current_setting('teste.org')::uuid, NULL, 'acabamento gestao' || chr(8203) || ' TESTE2027', 'lista', false);
    RAISE EXCEPTION 'FALHOU: atributo repetido foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT004' THEN
    GET STACKED DIAGNOSTICS v_det = PG_EXCEPTION_DETAIL;
    IF v_det IS DISTINCT FROM current_setting('teste.novo') THEN RAISE EXCEPTION 'FALHOU: atributo repetido — DETAIL %', v_det; END IF;
  END;
  -- 4. renomear (o código fica) e tentar mudar o tipo
  r := public.cat_guardar_atributo(current_setting('teste.org')::uuid, '2027b600-0000-4000-8000-000000000002', 'Teste Gestão 2027 Acabamento Final', NULL, NULL) -> 'atributo';
  IF r ->> 'nome' IS DISTINCT FROM 'Teste Gestão 2027 Acabamento Final' OR r ->> 'codigo' IS DISTINCT FROM 'teste_g2027_textura' THEN
    RAISE EXCEPTION 'FALHOU: renomear atributo — %', r;
  END IF;
  BEGIN
    PERFORM public.cat_guardar_atributo(current_setting('teste.org')::uuid, '2027b600-0000-4000-8000-000000000002', 'Teste Gestão 2027 Acabamento Final', 'medida', NULL);
    RAISE EXCEPTION 'FALHOU: mudar o tipo foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL;
  END;
  -- 5. tem_hex com produtos a usar: recusa; sem produtos: muda; ligar com opções: recusa
  BEGIN
    PERFORM public.cat_guardar_atributo(current_setting('teste.org')::uuid, '2027b600-0000-4000-8000-000000000001', 'Teste Gestão 2027 Cor', NULL, false);
    RAISE EXCEPTION 'FALHOU: tirar o hex com produtos a usar foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL;
  END;
  r := public.cat_guardar_atributo(current_setting('teste.org')::uuid, current_setting('teste.novo')::uuid, 'Acabamento Gestão Teste2027', NULL, false) -> 'atributo';
  IF (r -> 'tem_hex')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'FALHOU: tirar o hex sem produtos — %', r; END IF;
  PERFORM public.cat_guardar_opcao(current_setting('teste.org')::uuid, current_setting('teste.novo')::uuid, 'Mate Teste2027', NULL);
  BEGIN
    PERFORM public.cat_guardar_atributo(current_setting('teste.org')::uuid, current_setting('teste.novo')::uuid, 'Acabamento Gestão Teste2027', NULL, true);
    RAISE EXCEPTION 'FALHOU: ligar o hex num atributo com opções foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg IS DISTINCT FROM 'Este atributo já tem opções: crie um atributo novo com cor.' THEN RAISE EXCEPTION 'FALHOU: ligar hex com opções — mensagem: %', v_msg; END IF;
  END;
END $t$;
RESET ROLE;

-- ─── 6. Renomear uma opção: valores (incl. produto apagado) e preço acompanham ─
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb; c jsonb;
BEGIN
  r := public.cat_editar_opcao(current_setting('teste.org')::uuid, '2027b600-0000-4000-8000-000000000021', ' Branco   Neve G ', NULL, NULL);
  IF r -> 'opcao' ->> 'valor' IS DISTINCT FROM 'Branco Neve G' OR r -> 'opcao' ->> 'nome' IS DISTINCT FROM 'Branco Neve G'
     OR r -> 'opcao' ->> 'hex' IS DISTINCT FROM '#FFFFFF' OR (r ->> 'valores_atualizados')::int IS DISTINCT FROM 3
     OR (r ->> 'precos_atualizados')::int IS DISTINCT FROM 1 OR (r -> 'opcao' ->> 'usados')::int IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'FALHOU: renomear opção — %', r;
  END IF;
  r := public.cat_ler_atributos(current_setting('teste.org')::uuid);
  SELECT v INTO c FROM jsonb_array_elements(r -> 'produtos') x, jsonb_array_elements(x -> 'valores') v
  WHERE x ->> 'id' = current_setting('teste.prod') AND v ->> 'atributo' = '2027b600-0000-4000-8000-000000000001';
  IF c ->> 'opcao' IS DISTINCT FROM '2027b600-0000-4000-8000-000000000021' OR c ->> 'valor' IS DISTINCT FROM 'Branco Neve G' THEN
    RAISE EXCEPTION 'FALHOU: renomear opção — o produto perdeu a ligação: %', c;
  END IF;
END $t$;
RESET ROLE;
DO $t$
BEGIN
  IF (SELECT v.value_text FROM product_attribute_values v WHERE v.product_id = current_setting('teste.apag')::uuid
        AND v.attribute_id = '2027b600-0000-4000-8000-000000000001') IS DISTINCT FROM 'Branco Neve G' THEN
    RAISE EXCEPTION 'FALHOU: renomear opção — o produto apagado ficou com o texto antigo';
  END IF;
  IF (SELECT pr.value_option FROM product_attribute_value_prices pr WHERE pr.id = '2027b600-0000-4000-8000-000000000031') IS DISTINCT FROM 'Branco Neve G' THEN
    RAISE EXCEPTION 'FALHOU: renomear opção — o preço (value_option) ficou com o texto antigo';
  END IF;
END $t$;

-- ─── 7 e 8. Opção repetida; hex ──────────────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb; v_det text; v_msg text;
BEGIN
  BEGIN
    PERFORM public.cat_editar_opcao(current_setting('teste.org')::uuid, '2027b600-0000-4000-8000-000000000022', 'BRANCO' || chr(160) || 'néve g', NULL, NULL);
    RAISE EXCEPTION 'FALHOU: opção repetida foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT004' THEN
    GET STACKED DIAGNOSTICS v_det = PG_EXCEPTION_DETAIL;
    IF v_det IS DISTINCT FROM '2027b600-0000-4000-8000-000000000021' THEN RAISE EXCEPTION 'FALHOU: opção repetida — DETAIL %', v_det; END IF;
  END;
  BEGIN
    PERFORM public.cat_editar_opcao(current_setting('teste.org')::uuid, '2027b600-0000-4000-8000-000000000022', 'antigo g', NULL, NULL);
    RAISE EXCEPTION 'FALHOU: opção repetida (desativada) foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT004' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT, v_det = PG_EXCEPTION_DETAIL;
    IF v_msg IS DISTINCT FROM 'Esta opção já existe (está desativada).' OR v_det IS DISTINCT FROM '2027b600-0000-4000-8000-000000000023' THEN
      RAISE EXCEPTION 'FALHOU: opção repetida (desativada) — % / %', v_msg, v_det;
    END IF;
  END;
  BEGIN
    PERFORM public.cat_editar_opcao(current_setting('teste.org')::uuid, '2027b600-0000-4000-8000-000000000022', NULL, '#12345G', NULL);
    RAISE EXCEPTION 'FALHOU: hex inválido foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL;
  END;
  r := public.cat_editar_opcao(current_setting('teste.org')::uuid, '2027b600-0000-4000-8000-000000000022', NULL, ' #a0b0c0 ', NULL);
  IF r -> 'opcao' ->> 'hex' IS DISTINCT FROM '#A0B0C0' OR r -> 'opcao' ->> 'valor' IS DISTINCT FROM 'Cinza G' THEN
    RAISE EXCEPTION 'FALHOU: hex em minúsculas — %', r;
  END IF;
  BEGIN
    PERFORM public.cat_editar_opcao(current_setting('teste.org')::uuid, '2027b600-0000-4000-8000-000000000022', NULL, '', NULL);
    RAISE EXCEPTION 'FALHOU: hex vazio num atributo com cor foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL;
  END;
  r := public.cat_editar_opcao(current_setting('teste.org')::uuid, '2027b600-0000-4000-8000-000000000024', NULL, '', NULL);
  IF r -> 'opcao' -> 'hex' IS DISTINCT FROM 'null'::jsonb OR r -> 'opcao' ->> 'valor' IS DISTINCT FROM 'LISO G' THEN
    RAISE EXCEPTION 'FALHOU: hex vazio num atributo sem cor — %', r;
  END IF;
  BEGIN
    PERFORM public.cat_editar_opcao(current_setting('teste.org')::uuid, '2027b600-0000-4000-8000-000000000024', NULL, '#FFFFFF', NULL);
    RAISE EXCEPTION 'FALHOU: hex num atributo sem cor foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL;
  END;
END $t$;
RESET ROLE;

-- ─── 9. Desativar (os valores ficam) e reativar ──────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb; o jsonb;
BEGIN
  r := public.cat_editar_opcao(current_setting('teste.org')::uuid, '2027b600-0000-4000-8000-000000000021', NULL, NULL, false);
  IF (r -> 'opcao' -> 'ativo')::boolean IS NOT FALSE OR (r ->> 'valores_atualizados')::int IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'FALHOU: desativar — %', r;
  END IF;
  r := public.cat_ler_atributos_gestao(current_setting('teste.org')::uuid);
  SELECT op INTO o FROM jsonb_array_elements(r -> 'atributos') x, jsonb_array_elements(x -> 'opcoes') op
  WHERE op ->> 'id' = '2027b600-0000-4000-8000-000000000021';
  IF (o -> 'ativo')::boolean IS NOT FALSE OR (o ->> 'usados')::int IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'FALHOU: desativar — leitura de gestão: %', o;
  END IF;
END $t$;
RESET ROLE;
DO $t$
BEGIN
  IF (SELECT v.value_text FROM product_attribute_values v WHERE v.product_id = current_setting('teste.prod')::uuid
        AND v.attribute_id = '2027b600-0000-4000-8000-000000000001') IS DISTINCT FROM 'Branco Neve G' THEN
    RAISE EXCEPTION 'FALHOU: desativar mexeu no valor do produto';
  END IF;
END $t$;
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb;
BEGIN
  r := public.cat_editar_opcao(current_setting('teste.org')::uuid, '2027b600-0000-4000-8000-000000000021', NULL, NULL, true);
  IF (r -> 'opcao' -> 'ativo')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: reativar — %', r; END IF;
END $t$;
RESET ROLE;

-- ─── 10. Reordenar; nome demasiado longo ─────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb; v_ids uuid[];
BEGIN
  r := public.cat_reordenar_opcoes(current_setting('teste.org')::uuid, '2027b600-0000-4000-8000-000000000001',
         ARRAY['2027b600-0000-4000-8000-000000000023', '2027b600-0000-4000-8000-000000000022', '2027b600-0000-4000-8000-000000000021']::uuid[]);
  IF r IS DISTINCT FROM '{"ok": true, "n": 3, "alteradas": 2}'::jsonb THEN RAISE EXCEPTION 'FALHOU: reordenar — retorno %', r; END IF;
  r := public.cat_ler_atributos_gestao(current_setting('teste.org')::uuid);
  IF (SELECT x -> 'opcoes' -> 0 ->> 'id' FROM jsonb_array_elements(r -> 'atributos') x WHERE x ->> 'id' = '2027b600-0000-4000-8000-000000000001')
     IS DISTINCT FROM '2027b600-0000-4000-8000-000000000023' THEN
    RAISE EXCEPTION 'FALHOU: reordenar — a primeira opção não é a pedida';
  END IF;
  BEGIN
    PERFORM public.cat_reordenar_opcoes(current_setting('teste.org')::uuid, '2027b600-0000-4000-8000-000000000001',
              ARRAY['2027b600-0000-4000-8000-000000000023', '2027b600-0000-4000-8000-000000000022']::uuid[]);
    RAISE EXCEPTION 'FALHOU: reordenar com uma opção em falta foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL;
  END;
  SELECT array_agg(gen_random_uuid()) INTO v_ids FROM generate_series(1, 501);
  BEGIN
    PERFORM public.cat_reordenar_opcoes(current_setting('teste.org')::uuid, '2027b600-0000-4000-8000-000000000001', v_ids);
    RAISE EXCEPTION 'FALHOU: reordenar com 501 ids foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL;
  END;
  BEGIN
    PERFORM public.cat_guardar_atributo(current_setting('teste.org')::uuid, NULL, repeat('x', 1001), 'lista', false);
    RAISE EXCEPTION 'FALHOU: nome com 1001 caracteres foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL;
  END;
END $t$;
RESET ROLE;

-- ─── 11. Grupo global + grupo da organização ─────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb; v_msg text;
BEGIN
  r := public.cat_editar_opcao(current_setting('teste.org')::uuid, '2027b600-0000-4000-8000-000000000026', 'Local Novo G', NULL, NULL);
  IF r -> 'opcao' ->> 'valor' IS DISTINCT FROM 'Local Novo G' THEN RAISE EXCEPTION 'FALHOU: editar opção do grupo da organização — %', r; END IF;
  BEGIN
    PERFORM public.cat_editar_opcao(current_setting('teste.org')::uuid, '2027b600-0000-4000-8000-000000000025', 'Outro G', NULL, NULL);
    RAISE EXCEPTION 'FALHOU: editar opção de grupo global foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg IS DISTINCT FROM 'Opção partilhada: não se pode alterar aqui.' THEN RAISE EXCEPTION 'FALHOU: grupo global — mensagem: %', v_msg; END IF;
  END;
  BEGIN
    PERFORM public.cat_reordenar_opcoes(current_setting('teste.org')::uuid, '2027b600-0000-4000-8000-000000000004',
              ARRAY['2027b600-0000-4000-8000-000000000027']::uuid[]);
    RAISE EXCEPTION 'FALHOU: reordenar atributo só com grupo global foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg IS DISTINCT FROM 'Opção partilhada: não se pode alterar aqui.' THEN RAISE EXCEPTION 'FALHOU: reordenar global — mensagem: %', v_msg; END IF;
  END;
END $t$;
RESET ROLE;

-- ─── 12. Sem products.edit; perfil reduzido ──────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims_sem'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE v_msg text; v_f text;
BEGIN
  FOREACH v_f IN ARRAY ARRAY['guardar', 'editar', 'reordenar'] LOOP
    BEGIN
      IF v_f = 'guardar' THEN
        PERFORM public.cat_guardar_atributo(current_setting('teste.org')::uuid, '2027b600-0000-4000-8000-000000000001', 'Sem Permissão G', NULL, NULL);
      ELSIF v_f = 'editar' THEN
        PERFORM public.cat_editar_opcao(current_setting('teste.org')::uuid, '2027b600-0000-4000-8000-000000000022', 'Sem Permissão G', NULL, NULL);
      ELSE
        PERFORM public.cat_reordenar_opcoes(current_setting('teste.org')::uuid, '2027b600-0000-4000-8000-000000000001',
                  ARRAY['2027b600-0000-4000-8000-000000000021', '2027b600-0000-4000-8000-000000000022', '2027b600-0000-4000-8000-000000000023']::uuid[]);
      END IF;
      RAISE EXCEPTION 'FALHOU: sem products.edit foi aceite (%)', v_f;
    EXCEPTION WHEN SQLSTATE 'CT001' THEN
      GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
      IF v_msg IS DISTINCT FROM 'Sem permissão (products.edit).' THEN RAISE EXCEPTION 'FALHOU: sem permissão (%) — mensagem: %', v_f, v_msg; END IF;
    END;
  END LOOP;
END $t$;
RESET ROLE;
SELECT set_config('request.jwt.claims', current_setting('teste.claims_red'), true);
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
  PERFORM public.cat_ler_atributos_gestao(current_setting('teste.org')::uuid);
  RAISE EXCEPTION 'FALHOU: o perfil reduzido leu o ecrã de gestão';
EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL;
END $t$;
RESET ROLE;

-- ─── 13. Isolamento ──────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
  BEGIN
    PERFORM public.cat_reordenar_opcoes(current_setting('teste.bm24')::uuid, '2027b600-0000-4000-8000-000000000001',
              ARRAY['2027b600-0000-4000-8000-000000000021', '2027b600-0000-4000-8000-000000000022', '2027b600-0000-4000-8000-000000000023']::uuid[]);
    RAISE EXCEPTION 'FALHOU: reordenar com p_org = BM24 foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL;
  END;
  BEGIN
    PERFORM public.cat_ler_atributos_gestao(current_setting('teste.bm24')::uuid);
    RAISE EXCEPTION 'FALHOU: ler gestão com p_org = BM24 foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL;
  END;
  BEGIN
    PERFORM public.cat_guardar_atributo(gen_random_uuid(), NULL, 'Alheio G', 'lista', false);
    RAISE EXCEPTION 'FALHOU: criar atributo numa organização inventada foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL;
  END;
  BEGIN
    PERFORM public.cat_editar_opcao(current_setting('teste.org')::uuid, gen_random_uuid(), NULL, NULL, false);
    RAISE EXCEPTION 'FALHOU: editar uma opção inexistente foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT003' THEN NULL;
  END;
END $t$;
RESET ROLE;

-- ─── 14. Catálogo: acessos e FOR SHARE ───────────────────────────────────────
DO $t$
DECLARE v_sig text; v_oid oid;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY['public.cat_ler_atributos_gestao(uuid)', 'public.cat_guardar_atributo(uuid,uuid,text,text,boolean)',
                                'public.cat_editar_opcao(uuid,uuid,text,text,boolean)', 'public.cat_reordenar_opcoes(uuid,uuid,uuid[])',
                                'public.cat_guardar_produto_atributos(uuid,uuid,jsonb)'] LOOP
    v_oid := to_regprocedure(v_sig)::oid;
    IF v_oid IS NULL THEN RAISE EXCEPTION 'FALHOU: falta a função %', v_sig; END IF;
    IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN RAISE EXCEPTION 'FALHOU: anon pode executar %', v_sig; END IF;
    IF EXISTS (SELECT 1 FROM pg_proc pr, aclexplode(pr.proacl) x WHERE pr.oid = v_oid AND x.grantee = 0 AND x.privilege_type = 'EXECUTE')
       OR (SELECT pr.proacl FROM pg_proc pr WHERE pr.oid = v_oid) IS NULL THEN
      RAISE EXCEPTION 'FALHOU: PUBLIC pode executar %', v_sig;
    END IF;
  END LOOP;
  IF pg_get_functiondef(to_regprocedure('public.cat_guardar_produto_atributos(uuid,uuid,jsonb)')) NOT LIKE '%o.group_id = v_grupo FOR SHARE;%' THEN
    RAISE EXCEPTION 'FALHOU: cat_guardar_produto_atributos sem FOR SHARE na leitura da opção';
  END IF;
END $t$;

SELECT 'OK: ler para gestão, criar (lista, medida, sufixo _2), medida com hex, repetido, renomear, tipo fixo, tem_hex (produtos, sem produtos, com opções), renomear opção com valores de 3 produtos e preço, opção repetida, hex (inválido, minúsculas, vazio com e sem cor, sem cor), desativar e reativar, reordenar (incompleta, >500), nome >1000, grupo global e da organização, sem permissão (3), perfil reduzido, BM24, organização inventada, opção inexistente, acessos e FOR SHARE.' AS resultado;

ROLLBACK;
