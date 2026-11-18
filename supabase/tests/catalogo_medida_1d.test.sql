-- ============================================================
-- Testes: 20270122300000_catalogo_medida_1d.sql (base RH)
-- ============================================================
-- ORDEM: correr ANTES do db push da 20270122300000 (falha no passo 0: hoje uma medida 1D não é lida nem tem SKU);
-- depois do push termina com «OK: …». Qualquer falha: 'FALHOU: …'.
--
-- Tudo dentro de BEGIN … ROLLBACK. Escritas só na nike (b6ffce4f-f630-4933-833a-008649757a33), pelas funções do
-- Catálogo: uma categoria e uma subcategoria de teste (siglas aleatórias Q + 4 letras, livres na nike), um atributo
-- Medida de teste, um modelo e 9 produtos de teste. Nenhuma outra organização é escrita nem lida.
-- Sessão emprestada (role authenticated, auth.uid() pelas claims): um membro activo da nike, não system admin, com
-- products.edit e services.view.
-- Chamadas recusadas de propósito: 10, todas CT002 — ficam como erro no registo do Postgres.
--
-- Correr a partir do worktree rh-pessoas (supabase/.temp/project-ref = uetjghdkwbywbftedtth):
--   supabase db query --linked -f supabase/tests/catalogo_medida_1d.test.sql
--
-- O que PROVA:
--   1. Gravar e ler 1D nas quatro dimensões, número e intervalo (com de = 0) e em mm: o value_json
--      {"tipo":"1D","dimensao","valor","unidade"}, o value_text («Largura 70 cm», «Largura 100–105 cm», «Altura 70 cm»,
--      «Espessura 5,5 mm», «Comprimento 76 cm», «Largura 0–40 cm»), a leitura (cat_ler_atributos_produto) e o SKU
--      (70, 100A105, ALT70, ESP5P5MM, COMP76, 0A40). A dimensão escrita « Altura » grava-se «altura».
--   2. O texto da lista paginada: atributos_resumo «<Medida>: Largura 70 cm».
--   3. Duplicados: o mesmo valor 1D da mesma dimensão (70.0) noutro produto do mesmo modelo → «duplicado» (gerar e
--      pré-visualizar); a pré-visualização de um 1D dá o SKU com o troço (ALT70); com um 1D inválido não dá erro
--      (falta medida:<código>). Um 1D com largura/comprimento/espessura a null aceita-se e grava-se sem elas.
--   4. Recusas CT002 (10): sem dimensão, dimensão em branco, dimensão desconhecida, largura com valor numa altura, sem
--      valor, início negativo, valor 0, valor 100001, 4 casas decimais, unidade inválida; a medida gravada antes fica.
--   5. 2D e 3D como antes: «70 × 70 cm» 70X70, «12,5 × 25 × 0,8 mm» 12P5X25X0P8MM; o intervalo com início 0 também no
--      2D («0–40 × 90 cm», 0A40X90) e na espessura do 3D («60 × 30 × 0–2 cm», 60X30X0A2); o mesmo produto de 2D para 1D
--      (ALT85, «Altura 85 cm») e de volta (80X80, «80 × 80 cm»).
--
-- O que NÃO cobre: que os produtos que já existem não mudam (value_json, value_text, leitura, SKU) — compara-se no
-- ensaio, antes e depois da migration, na mesma transação, só leitura; o ecrã.
-- ============================================================

BEGIN;

-- ─── 0. A migration está aplicada? (antes dela: um 1D não é lido nem tem SKU) ───
DO $t$
BEGIN
  IF public.fn_cat_sku_medida('{"tipo":"1D","dimensao":"altura","valor":70,"unidade":"cm"}'::jsonb) IS DISTINCT FROM 'ALT70'
     OR public.fn_cat_medida_ler('{"tipo":"1D","dimensao":"largura","valor":70}'::jsonb, 'cm') IS NULL THEN
    RAISE EXCEPTION 'FALHOU: a medida não aceita 1D (fn_cat_sku_medida de altura 70 = %; aplicar 20270122300000).',
      coalesce(public.fn_cat_sku_medida('{"tipo":"1D","dimensao":"altura","valor":70,"unidade":"cm"}'::jsonb), 'null');
  END IF;
END $t$;

-- ─── Fixtures (como postgres, só leitura) ─────────────────────────────────────
DO $fx$
DECLARE
  c_org constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  v_auth uuid; v_suf text; v_sa text; v_sb text; v_i integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM anew_organizations WHERE id = c_org) THEN RAISE EXCEPTION 'FALHOU (fixture): a nike não existe nesta base'; END IF;
  PERFORM set_config('app.audit_source', 'teste:catalogo_medida_1d', true);

  SELECT u.auth_user_id INTO v_auth
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
  WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND NOT coalesce(m.role_is_client, false)
    AND public.has_anew_permission_in_org(u.auth_user_id, 'products.edit', c_org)
    AND public.has_anew_permission_in_org(u.auth_user_id, 'services.view', c_org)
    AND NOT public.is_system_admin_user(u.auth_user_id)
  ORDER BY m.created_at, u.id LIMIT 1;
  IF v_auth IS NULL THEN RAISE EXCEPTION 'FALHOU (fixture): sem membro activo da nike (não system admin) com products.edit e services.view'; END IF;

  -- siglas aleatórias (só letras); a de topo livre na nike e sem nenhum SKU com esse prefixo
  LOOP
    v_i := v_i + 1;
    v_suf := translate(upper(md5(random()::text || clock_timestamp()::text)), '0123456789', 'GHIJKLMNOP');
    v_sa := 'Q' || substr(v_suf, 1, 4); v_sb := 'Q' || substr(v_suf, 5, 4);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM product_categories c WHERE c.organization_id = c_org AND c.parent_id IS NULL
                          AND c.deleted_at IS NULL AND c.sigla = v_sa)
      AND NOT EXISTS (SELECT 1 FROM products p WHERE p.organization_id = c_org AND p.sku LIKE v_sa || '-%');
    IF v_i >= 20 THEN RAISE EXCEPTION 'FALHOU (fixture): sem siglas de teste livres ao fim de 20 tentativas'; END IF;
  END LOOP;

  PERFORM set_config('teste.org', c_org::text, true);
  PERFORM set_config('teste.suf', substr(v_suf, 13, 6), true);
  PERFORM set_config('teste.sa', v_sa, true);
  PERFORM set_config('teste.sb', v_sb, true);
  PERFORM set_config('teste.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
END $fx$;

-- ─── Categoria, atributo, modelo (como editor) ────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  v_org uuid := current_setting('teste.org')::uuid; v_suf text := current_setting('teste.suf');
  v_t uuid; v_s1 uuid; v_med uuid; v_m1 uuid;
BEGIN
  v_t := (public.cat_guardar_categoria_produto(v_org, NULL, NULL, 'Topo Medida1D T' || v_suf) -> 'categoria' ->> 'id')::uuid;
  v_s1 := (public.cat_guardar_categoria_produto(v_org, NULL, v_t, 'Sub Medida1D T' || v_suf) -> 'categoria' ->> 'id')::uuid;
  PERFORM public.cat_guardar_sigla_categoria(v_org, v_t, current_setting('teste.sa'));
  PERFORM public.cat_guardar_sigla_categoria(v_org, v_s1, current_setting('teste.sb'));
  v_med := (public.cat_guardar_atributo(v_org, NULL, 'Medida 1D T' || v_suf, 'medida', false) -> 'atributo' ->> 'id')::uuid;
  v_m1 := (public.cat_guardar_modelo(v_org, NULL, v_s1, 'Modelo Medida1D T' || v_suf) -> 'modelo' ->> 'id')::uuid;
  IF v_t IS NULL OR v_s1 IS NULL OR v_med IS NULL OR v_m1 IS NULL THEN
    RAISE EXCEPTION 'FALHOU (fixture): categoria, subcategoria, atributo ou modelo de teste não criados';
  END IF;
  PERFORM set_config('teste.t', v_t::text, true); PERFORM set_config('teste.s1', v_s1::text, true);
  PERFORM set_config('teste.med', v_med::text, true); PERFORM set_config('teste.m1', v_m1::text, true);
  PERFORM set_config('teste.n_t', 'Topo Medida1D T' || v_suf, true);
  PERFORM set_config('teste.n_s1', 'Sub Medida1D T' || v_suf, true);
END $t$;
RESET ROLE;
-- o código do atributo (para a falta medida:<código>), como postgres
SELECT set_config('teste.cod_med', (SELECT pa.code FROM product_attributes pa WHERE pa.id = current_setting('teste.med')::uuid), true);

-- ─── 1–4. 1D: gravar, ler, SKU, texto, duplicados, recusas ────────────────────
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  v_org uuid := current_setting('teste.org')::uuid; v_suf text := current_setting('teste.suf');
  v_med text := current_setting('teste.med'); v_m1 uuid := current_setting('teste.m1')::uuid;
  v_t uuid := current_setting('teste.t')::uuid; v_s1 uuid := current_setting('teste.s1')::uuid;
  v_pre text := current_setting('teste.sa') || '-' || current_setting('teste.sb');
  v_p uuid; v_p1 uuid; v_palt uuid; r jsonb; v_e jsonb; c jsonb; v_msg text; v_n integer := 0; v_k integer := 0;
BEGIN
  -- 1. os seis casos: o que se envia, o value_json lido, o value_text, o troço do SKU
  FOR c IN SELECT x FROM jsonb_array_elements(jsonb_build_array(
      jsonb_build_object('envia', '{"tipo":"1D","dimensao":"largura","valor":70.0,"unidade":"cm"}'::jsonb,
                         'json', '{"tipo":"1D","dimensao":"largura","valor":70,"unidade":"cm"}'::jsonb,
                         'texto', 'Largura 70 cm', 'sku', '70'),
      jsonb_build_object('envia', '{"tipo":"1D","dimensao":"largura","valor":{"de":100,"ate":105.000}}'::jsonb,
                         'json', '{"tipo":"1D","dimensao":"largura","valor":{"de":100,"ate":105},"unidade":"cm"}'::jsonb,
                         'texto', 'Largura 100–105 cm', 'sku', '100A105'),
      jsonb_build_object('envia', '{"tipo":"1d","dimensao":" Altura ","valor":70,"unidade":"cm"}'::jsonb,
                         'json', '{"tipo":"1D","dimensao":"altura","valor":70,"unidade":"cm"}'::jsonb,
                         'texto', 'Altura 70 cm', 'sku', 'ALT70'),
      jsonb_build_object('envia', '{"tipo":"1D","dimensao":"espessura","valor":5.50,"unidade":"mm"}'::jsonb,
                         'json', '{"tipo":"1D","dimensao":"espessura","valor":5.5,"unidade":"mm"}'::jsonb,
                         'texto', 'Espessura 5,5 mm', 'sku', 'ESP5P5MM'),
      jsonb_build_object('envia', '{"tipo":"1D","dimensao":"comprimento","valor":76,"unidade":"cm"}'::jsonb,
                         'json', '{"tipo":"1D","dimensao":"comprimento","valor":76,"unidade":"cm"}'::jsonb,
                         'texto', 'Comprimento 76 cm', 'sku', 'COMP76'),
      jsonb_build_object('envia', '{"tipo":"1D","dimensao":"largura","valor":{"de":0,"ate":40},"unidade":"cm"}'::jsonb,
                         'json', '{"tipo":"1D","dimensao":"largura","valor":{"de":0,"ate":40},"unidade":"cm"}'::jsonb,
                         'texto', 'Largura 0–40 cm', 'sku', '0A40'))) x LOOP
    v_k := v_k + 1;
    v_p := public.cat_guardar_produto(v_org, NULL, 'produto', 'Teste 1D P' || v_k || ' ' || v_suf, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
    PERFORM public.cat_guardar_produto_tabelas(v_org, v_p, NULL, NULL, current_setting('teste.n_t'), current_setting('teste.n_s1'));
    r := public.cat_guardar_produto_atributos(v_org, v_p, jsonb_build_array(jsonb_build_object('atributo', v_med, 'medida', c -> 'envia')));
    IF r IS DISTINCT FROM '{"ok":true,"n":1}'::jsonb THEN RAISE EXCEPTION 'FALHOU: gravar 1D % → %', c -> 'envia', r; END IF;
    SELECT e INTO v_e FROM jsonb_array_elements(public.cat_ler_atributos_produto(v_org, v_p) -> 'valores') e;
    IF v_e -> 'medida' IS DISTINCT FROM c -> 'json' OR v_e ->> 'valor' IS DISTINCT FROM c ->> 'texto'
       OR (v_e ->> 'atributo') IS DISTINCT FROM v_med THEN
      RAISE EXCEPTION 'FALHOU: ler 1D % → % (esperado % / «%»)', c -> 'envia', v_e, c -> 'json', c ->> 'texto';
    END IF;
    PERFORM public.cat_guardar_produto_modelo(v_org, v_p, v_m1);
    r := public.cat_gerar_sku_produto(v_org, v_p);
    IF r ->> 'sku' IS DISTINCT FROM v_pre || '-0001-' || (c ->> 'sku') OR (r -> 'gerado') IS DISTINCT FROM 'true'::jsonb THEN
      RAISE EXCEPTION 'FALHOU: SKU do 1D % → % (esperado %-0001-%)', c -> 'envia', r, v_pre, c ->> 'sku';
    END IF;
    IF v_k = 1 THEN v_p1 := v_p; END IF;
    IF v_k = 3 THEN v_palt := v_p; END IF;
  END LOOP;

  -- 2. o texto na lista paginada
  r := public.cat_ler_produtos_pagina(v_org, NULL, NULL, v_s1);
  SELECT e INTO v_e FROM jsonb_array_elements(r -> 'produtos') e WHERE (e ->> 'id')::uuid = v_p1;
  IF v_e ->> 'atributos_resumo' IS DISTINCT FROM 'Medida 1D T' || v_suf || ': Largura 70 cm' THEN
    RAISE EXCEPTION 'FALHOU: atributos_resumo da lista → %', v_e ->> 'atributos_resumo';
  END IF;

  -- 3. duplicados: largura 70 noutro produto do mesmo modelo
  v_p := public.cat_guardar_produto(v_org, NULL, 'produto', 'Teste 1D P7 ' || v_suf, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
  PERFORM public.cat_guardar_produto_tabelas(v_org, v_p, NULL, NULL, current_setting('teste.n_t'), current_setting('teste.n_s1'));
  PERFORM public.cat_guardar_produto_atributos(v_org, v_p, jsonb_build_array(jsonb_build_object('atributo', v_med,
            'medida', '{"tipo":"1D","dimensao":"largura","valor":70}'::jsonb)));
  PERFORM public.cat_guardar_produto_modelo(v_org, v_p, v_m1);
  r := public.cat_gerar_sku_produto(v_org, v_p);
  IF r ->> 'motivo' IS DISTINCT FROM 'duplicado' OR (r ->> 'outro_produto')::uuid IS DISTINCT FROM v_p1 THEN
    RAISE EXCEPTION 'FALHOU: a mesma largura 1D noutro produto não deu duplicado → %', r;
  END IF;
  r := public.cat_prever_sku_modelo(v_org, v_t, v_s1, v_m1,
         jsonb_build_array(jsonb_build_object('atributo', v_med, 'medida', '{"tipo":"1D","dimensao":"largura","valor":70.0}'::jsonb)), v_p);
  IF r ->> 'sku' IS DISTINCT FROM v_pre || '-0001-70' OR NOT (r -> 'faltas') ? 'duplicado'
     OR (r ->> 'outro_produto')::uuid IS DISTINCT FROM v_p1 THEN
    RAISE EXCEPTION 'FALHOU: pré-visualizar a mesma largura 1D → %', r;
  END IF;
  -- a pré-visualização do próprio produto da altura: o troço ALT70, sem duplicado
  r := public.cat_prever_sku_modelo(v_org, v_t, v_s1, v_m1,
         jsonb_build_array(jsonb_build_object('atributo', v_med, 'medida', '{"tipo":"1D","dimensao":"Altura","valor":70}'::jsonb)), v_palt);
  IF r ->> 'sku' IS DISTINCT FROM v_pre || '-0001-ALT70' OR r -> 'faltas' IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: pré-visualizar a altura 1D → %', r;
  END IF;
  -- a pré-visualização com um 1D inválido: sem erro, o troço fica de fora e falta medida:<código>
  r := public.cat_prever_sku_modelo(v_org, v_t, v_s1, v_m1,
         jsonb_build_array(jsonb_build_object('atributo', v_med, 'medida', '{"tipo":"1D","dimensao":"profundidade","valor":70}'::jsonb)), NULL);
  IF r ->> 'sku' IS DISTINCT FROM v_pre || '-0001' OR r -> 'faltas' IS DISTINCT FROM jsonb_build_array('medida:' || current_setting('teste.cod_med')) THEN
    RAISE EXCEPTION 'FALHOU: pré-visualização com 1D inválido → %', r;
  END IF;

  -- 1D com as chaves do 2D/3D a null: aceite, e não se gravam
  r := public.cat_guardar_produto_atributos(v_org, v_palt, jsonb_build_array(jsonb_build_object('atributo', v_med,
         'medida', '{"tipo":"1D","dimensao":"altura","valor":70,"unidade":"cm","largura":null,"comprimento":null,"espessura":null}'::jsonb)));
  SELECT e INTO v_e FROM jsonb_array_elements(public.cat_ler_atributos_produto(v_org, v_palt) -> 'valores') e;
  IF r IS DISTINCT FROM '{"ok":true,"n":1}'::jsonb
     OR v_e -> 'medida' IS DISTINCT FROM '{"tipo":"1D","dimensao":"altura","valor":70,"unidade":"cm"}'::jsonb
     OR (SELECT v.value_json FROM product_attribute_values v WHERE v.product_id = v_palt AND v.attribute_id = v_med::uuid)
        IS DISTINCT FROM '{"tipo":"1D","dimensao":"altura","valor":70,"unidade":"cm"}'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: 1D com largura/comprimento/espessura a null → % / %', r, v_e;
  END IF;

  -- 4. recusas [CT002 x10]; a medida de P1 fica
  FOR c IN SELECT x FROM jsonb_array_elements(jsonb_build_array(
      jsonb_build_object('m', '{"tipo":"1D","valor":70}'::jsonb,
                         'msg', 'Falta dizer qual é a dimensão da medida 1D (largura, altura, comprimento ou espessura).'),
      jsonb_build_object('m', '{"tipo":"1D","dimensao":"  ","valor":70}'::jsonb,
                         'msg', 'Falta dizer qual é a dimensão da medida 1D (largura, altura, comprimento ou espessura).'),
      jsonb_build_object('m', '{"tipo":"1D","dimensao":"profundidade","valor":70}'::jsonb,
                         'msg', 'A dimensão da medida 1D tem de ser largura, altura, comprimento ou espessura.'),
      jsonb_build_object('m', '{"tipo":"1D","dimensao":"altura","valor":70,"largura":70}'::jsonb,
                         'msg', 'Uma medida 1D leva só «dimensao» e «valor»: não leva largura, comprimento nem espessura.'),
      jsonb_build_object('m', '{"tipo":"1D","dimensao":"altura"}'::jsonb,
                         'msg', 'Falta o valor da altura.'),
      jsonb_build_object('m', '{"tipo":"1D","dimensao":"largura","valor":{"de":-1,"ate":40}}'::jsonb,
                         'msg', 'O início da largura tem de ser um número igual ou maior que zero.'),
      jsonb_build_object('m', '{"tipo":"1D","dimensao":"largura","valor":0}'::jsonb,
                         'msg', 'A largura tem de ser um número maior que zero.'),
      jsonb_build_object('m', '{"tipo":"1D","dimensao":"comprimento","valor":100001}'::jsonb,
                         'msg', 'O comprimento não pode passar de 100000.'),
      jsonb_build_object('m', '{"tipo":"1D","dimensao":"espessura","valor":5.1234}'::jsonb,
                         'msg', 'A espessura tem no máximo 3 casas decimais.'),
      jsonb_build_object('m', '{"tipo":"1D","dimensao":"largura","valor":70,"unidade":"m"}'::jsonb,
                         'msg', 'A unidade da medida tem de ser cm ou mm.'))) x LOOP
    BEGIN
      PERFORM public.cat_guardar_produto_atributos(v_org, v_p1, jsonb_build_array(jsonb_build_object('atributo', v_med, 'medida', c -> 'm')));
      RAISE EXCEPTION 'FALHOU: 1D inválido aceite: %', c -> 'm';
    EXCEPTION WHEN SQLSTATE 'CT002' THEN
      GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
      IF v_msg IS DISTINCT FROM c ->> 'msg' THEN RAISE EXCEPTION 'FALHOU: recusa de % → «%» (esperado «%»)', c -> 'm', v_msg, c ->> 'msg'; END IF;
      v_n := v_n + 1;
    END;
  END LOOP;
  IF v_n <> 10 THEN RAISE EXCEPTION 'FALHOU: % recusas (esperadas 10)', v_n; END IF;
  SELECT e INTO v_e FROM jsonb_array_elements(public.cat_ler_atributos_produto(v_org, v_p1) -> 'valores') e;
  IF v_e -> 'medida' IS DISTINCT FROM '{"tipo":"1D","dimensao":"largura","valor":70,"unidade":"cm"}'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: a medida mudou depois das recusas → %', v_e;
  END IF;
END $t$;
RESET ROLE;

-- ─── 5. 2D e 3D como antes; intervalo com início 0 no 2D ──────────────────────
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  v_org uuid := current_setting('teste.org')::uuid; v_suf text := current_setting('teste.suf');
  v_med text := current_setting('teste.med'); v_m1 uuid := current_setting('teste.m1')::uuid;
  v_pre text := current_setting('teste.sa') || '-' || current_setting('teste.sb');
  v_p uuid; r jsonb; v_e jsonb;
BEGIN
  v_p := public.cat_guardar_produto(v_org, NULL, 'produto', 'Teste 1D P8 ' || v_suf, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
  PERFORM public.cat_guardar_produto_tabelas(v_org, v_p, NULL, NULL, current_setting('teste.n_t'), current_setting('teste.n_s1'));
  PERFORM public.cat_guardar_produto_modelo(v_org, v_p, v_m1);

  -- 2D com números: o mesmo value_json e value_text de antes (70.0 → 70; a espessura não conta)
  PERFORM public.cat_guardar_produto_atributos(v_org, v_p, jsonb_build_array(jsonb_build_object('atributo', v_med,
            'medida', '{"tipo":"2D","largura":70,"comprimento":70.0,"espessura":5,"unidade":"cm"}'::jsonb)));
  SELECT e INTO v_e FROM jsonb_array_elements(public.cat_ler_atributos_produto(v_org, v_p) -> 'valores') e;
  r := public.cat_gerar_sku_produto(v_org, v_p);
  IF v_e -> 'medida' IS DISTINCT FROM '{"tipo":"2D","largura":70,"comprimento":70,"espessura":null,"unidade":"cm"}'::jsonb
     OR v_e ->> 'valor' IS DISTINCT FROM '70 × 70 cm' OR r ->> 'sku' IS DISTINCT FROM v_pre || '-0001-70X70' THEN
    RAISE EXCEPTION 'FALHOU: 2D com números mudou → % / %', v_e, r;
  END IF;

  -- 3D em mm: «12,5 × 25 × 0,8 mm», 12P5X25X0P8MM
  PERFORM public.cat_guardar_produto_atributos(v_org, v_p, jsonb_build_array(jsonb_build_object('atributo', v_med,
            'medida', '{"tipo":"3D","largura":12.5,"comprimento":25,"espessura":0.80,"unidade":"mm"}'::jsonb)));
  SELECT e INTO v_e FROM jsonb_array_elements(public.cat_ler_atributos_produto(v_org, v_p) -> 'valores') e;
  r := public.cat_gerar_sku_produto(v_org, v_p);
  IF v_e -> 'medida' IS DISTINCT FROM '{"tipo":"3D","largura":12.5,"comprimento":25,"espessura":0.8,"unidade":"mm"}'::jsonb
     OR v_e ->> 'valor' IS DISTINCT FROM '12,5 × 25 × 0,8 mm' OR r ->> 'sku' IS DISTINCT FROM v_pre || '-0001-12P5X25X0P8MM' THEN
    RAISE EXCEPTION 'FALHOU: 3D com números mudou → % / %', v_e, r;
  END IF;

  -- 2D com a largura «até 40»: «0–40 × 90 cm», 0A40X90
  PERFORM public.cat_guardar_produto_atributos(v_org, v_p, jsonb_build_array(jsonb_build_object('atributo', v_med,
            'medida', '{"tipo":"2D","largura":{"de":0,"ate":40},"comprimento":90,"unidade":"cm"}'::jsonb)));
  SELECT e INTO v_e FROM jsonb_array_elements(public.cat_ler_atributos_produto(v_org, v_p) -> 'valores') e;
  r := public.cat_gerar_sku_produto(v_org, v_p);
  IF v_e #> '{medida,largura}' IS DISTINCT FROM '{"de":0,"ate":40}'::jsonb OR v_e ->> 'valor' IS DISTINCT FROM '0–40 × 90 cm'
     OR r ->> 'sku' IS DISTINCT FROM v_pre || '-0001-0A40X90' THEN
    RAISE EXCEPTION 'FALHOU: 2D com início 0 → % / %', v_e, r;
  END IF;

  -- 3D com a espessura «até 2»: «60 × 30 × 0–2 cm», 60X30X0A2
  PERFORM public.cat_guardar_produto_atributos(v_org, v_p, jsonb_build_array(jsonb_build_object('atributo', v_med,
            'medida', '{"tipo":"3D","largura":60,"comprimento":30,"espessura":{"de":0,"ate":2},"unidade":"cm"}'::jsonb)));
  SELECT e INTO v_e FROM jsonb_array_elements(public.cat_ler_atributos_produto(v_org, v_p) -> 'valores') e;
  r := public.cat_gerar_sku_produto(v_org, v_p);
  IF v_e #> '{medida,espessura}' IS DISTINCT FROM '{"de":0,"ate":2}'::jsonb OR v_e ->> 'valor' IS DISTINCT FROM '60 × 30 × 0–2 cm'
     OR r ->> 'sku' IS DISTINCT FROM v_pre || '-0001-60X30X0A2' THEN
    RAISE EXCEPTION 'FALHOU: 3D com espessura de início 0 → % / %', v_e, r;
  END IF;

  -- trocar o mesmo produto de 2D para 1D e de volta: cada leitura e SKU seguem o que está gravado
  PERFORM public.cat_guardar_produto_atributos(v_org, v_p, jsonb_build_array(jsonb_build_object('atributo', v_med,
            'medida', '{"tipo":"2D","largura":80,"comprimento":80,"unidade":"cm"}'::jsonb)));
  PERFORM public.cat_guardar_produto_atributos(v_org, v_p, jsonb_build_array(jsonb_build_object('atributo', v_med,
            'medida', '{"tipo":"1D","dimensao":"altura","valor":85,"unidade":"cm"}'::jsonb)));
  SELECT e INTO v_e FROM jsonb_array_elements(public.cat_ler_atributos_produto(v_org, v_p) -> 'valores') e;
  r := public.cat_gerar_sku_produto(v_org, v_p);
  IF v_e -> 'medida' IS DISTINCT FROM '{"tipo":"1D","dimensao":"altura","valor":85,"unidade":"cm"}'::jsonb
     OR v_e ->> 'valor' IS DISTINCT FROM 'Altura 85 cm' OR r ->> 'sku' IS DISTINCT FROM v_pre || '-0001-ALT85' THEN
    RAISE EXCEPTION 'FALHOU: de 2D para 1D → % / %', v_e, r;
  END IF;
  PERFORM public.cat_guardar_produto_atributos(v_org, v_p, jsonb_build_array(jsonb_build_object('atributo', v_med,
            'medida', '{"tipo":"2D","largura":80,"comprimento":80,"unidade":"cm"}'::jsonb)));
  SELECT e INTO v_e FROM jsonb_array_elements(public.cat_ler_atributos_produto(v_org, v_p) -> 'valores') e;
  r := public.cat_gerar_sku_produto(v_org, v_p);
  IF v_e -> 'medida' IS DISTINCT FROM '{"tipo":"2D","largura":80,"comprimento":80,"espessura":null,"unidade":"cm"}'::jsonb
     OR v_e ->> 'valor' IS DISTINCT FROM '80 × 80 cm' OR r ->> 'sku' IS DISTINCT FROM v_pre || '-0001-80X80' THEN
    RAISE EXCEPTION 'FALHOU: de 1D de volta para 2D → % / %', v_e, r;
  END IF;
END $t$;
RESET ROLE;

SELECT 'OK: 1D gravado, lido e com SKU nas quatro dimensões (' || current_setting('teste.sa') || '-' || current_setting('teste.sb')
       || '-0001- 70, 100A105, ALT70, ESP5P5MM, COMP76, 0A40; «Largura 70 cm», «Largura 100–105 cm», «Altura 70 cm», '
       || '«Espessura 5,5 mm», «Comprimento 76 cm», «Largura 0–40 cm»), lista «Largura 70 cm», duplicado da mesma largura '
       || '(gerar e pré-visualizar), pré-visualização ALT70 e 1D inválido sem erro, chaves a null aceites, 10 recusas '
       || 'CT002 com a mensagem certa, 2D e 3D iguais aos de antes (70X70, 12P5X25X0P8MM), início 0 no 2D (0A40X90) e na '
       || 'espessura do 3D (60X30X0A2), 2D → 1D → 2D (ALT85, 80X80).' AS resultado;

ROLLBACK;
