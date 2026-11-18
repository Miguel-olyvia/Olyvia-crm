-- ============================================================
-- Testes: 20270119600000_catalogo_medida_com_intervalo.sql (base RH)
-- ============================================================
-- ORDEM: correr ANTES do db push da 119600000 (falha no passo 0: hoje uma medida com intervalo não tem SKU nem se
-- consegue gravar); depois do push termina com «OK: …». Qualquer falha: 'FALHOU: …'.
--
-- Tudo dentro de BEGIN … ROLLBACK. Escritas só na nike (b6ffce4f-f630-4933-833a-008649757a33), pelas funções do
-- Catálogo: uma categoria e uma subcategoria de teste (siglas aleatórias Q + 4 letras, livres na nike), um atributo
-- Medida de teste, um modelo e 4 produtos de teste. Nenhuma outra organização é escrita nem lida.
-- Sessão emprestada (role authenticated, auth.uid() pelas claims): um membro activo da nike, não system admin, com
-- products.edit e services.view.
-- Chamadas recusadas de propósito: 7, todas CT002 — ficam como erro no registo do Postgres.
--
-- Correr a partir do worktree rh-pessoas (supabase/.temp/project-ref = uetjghdkwbywbftedtth):
--   supabase db query --linked -f supabase/tests/catalogo_medida_com_intervalo.test.sql
--
-- O que PROVA:
--   1. Gravar e ler um intervalo: value_json {"de":91,"ate":100} (91.0 e 100.000 guardados sem zeros), value_text
--      «91–100 × 90 cm»; cat_ler_atributos_produto devolve a medida com o intervalo.
--   2. SKU: <CAT>-<SUB>-0001-91A100X90; a espessura em intervalo no 3D (60X30X1A2); mm (…MM).
--   3. Texto da lista paginada: o atributos_resumo de cat_ler_produtos_pagina traz «91–100×90 cm».
--   4. Duplicados: o mesmo intervalo noutro produto do mesmo modelo → «duplicado» (gerar e pré-visualizar); outro
--      intervalo → outro SKU.
--   5. Recusas CT002: de > ate, de = ate, falta o «ate», falta o «de», chave a mais, início negativo, fim com 4 casas;
--      a medida gravada antes fica. O início 0 aceita-se (20270122300000: «até 100» = {"de":0,"ate":100}).
-- Desde 20270122300000 (início 0 aceite, mensagem «igual ou maior que zero») este teste só passa com ela aplicada.
--   6. Números como antes: value_json e value_text iguais aos de 20270117600000 («70 × 70 cm», «12,5 × 25 × 0,8 mm»),
--      SKU 70X70; a pré-visualização com um intervalo inválido não dá erro (falta medida:<código>).
--
-- O que NÃO cobre: que os produtos que já existem não mudam de SKU — isso compara-se no ensaio (antes e depois da
-- migration, na mesma transação, só leitura); o ecrã.
-- ============================================================

BEGIN;

-- ─── 0. A migration está aplicada? (antes dela: um intervalo não tem SKU) ─────
DO $t$
BEGIN
  IF to_regprocedure('public.fn_cat_dimensao_medida(jsonb,text)') IS NULL
     OR public.fn_cat_sku_medida('{"tipo":"2D","largura":{"de":91,"ate":100},"comprimento":90,"unidade":"cm"}'::jsonb)
        IS DISTINCT FROM '91A100X90' THEN
    RAISE EXCEPTION 'FALHOU: a medida não aceita intervalos (fn_cat_sku_medida de 91–100 × 90 = %; aplicar 20270119600000).',
      coalesce(public.fn_cat_sku_medida('{"tipo":"2D","largura":{"de":91,"ate":100},"comprimento":90,"unidade":"cm"}'::jsonb), 'null');
  END IF;
END $t$;

-- ─── Fixtures (como postgres, só leitura) ─────────────────────────────────────
DO $fx$
DECLARE
  c_org constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  v_auth uuid; v_suf text; v_sa text; v_sb text; v_i integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM anew_organizations WHERE id = c_org) THEN RAISE EXCEPTION 'FALHOU (fixture): a nike não existe nesta base'; END IF;
  PERFORM set_config('app.audit_source', 'teste:catalogo_medida_com_intervalo', true);

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
  v_t := (public.cat_guardar_categoria_produto(v_org, NULL, NULL, 'Topo Intervalo T' || v_suf) -> 'categoria' ->> 'id')::uuid;
  v_s1 := (public.cat_guardar_categoria_produto(v_org, NULL, v_t, 'Sub Intervalo T' || v_suf) -> 'categoria' ->> 'id')::uuid;
  PERFORM public.cat_guardar_sigla_categoria(v_org, v_t, current_setting('teste.sa'));
  PERFORM public.cat_guardar_sigla_categoria(v_org, v_s1, current_setting('teste.sb'));
  v_med := (public.cat_guardar_atributo(v_org, NULL, 'Medida Intervalo T' || v_suf, 'medida', false) -> 'atributo' ->> 'id')::uuid;
  v_m1 := (public.cat_guardar_modelo(v_org, NULL, v_s1, 'Modelo Intervalo T' || v_suf) -> 'modelo' ->> 'id')::uuid;
  IF v_t IS NULL OR v_s1 IS NULL OR v_med IS NULL OR v_m1 IS NULL THEN
    RAISE EXCEPTION 'FALHOU (fixture): categoria, subcategoria, atributo ou modelo de teste não criados';
  END IF;
  PERFORM set_config('teste.t', v_t::text, true); PERFORM set_config('teste.s1', v_s1::text, true);
  PERFORM set_config('teste.med', v_med::text, true); PERFORM set_config('teste.m1', v_m1::text, true);
  PERFORM set_config('teste.n_t', 'Topo Intervalo T' || v_suf, true);
  PERFORM set_config('teste.n_s1', 'Sub Intervalo T' || v_suf, true);
END $t$;
RESET ROLE;
-- o código do atributo (para a falta medida:<código>), como postgres
SELECT set_config('teste.cod_med', (SELECT pa.code FROM product_attributes pa WHERE pa.id = current_setting('teste.med')::uuid), true);

-- ─── 1–5. Intervalo: gravar, ler, SKU, texto, duplicados, recusas ─────────────
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  v_org uuid := current_setting('teste.org')::uuid; v_suf text := current_setting('teste.suf');
  v_med text := current_setting('teste.med'); v_m1 uuid := current_setting('teste.m1')::uuid;
  v_pre text := current_setting('teste.sa') || '-' || current_setting('teste.sb');
  v_p1 uuid; v_p2 uuid; r jsonb; v_e jsonb; v_msg text; v_n integer := 0;
  v_esperado jsonb := '{"tipo":"2D","largura":{"de":91,"ate":100},"comprimento":90,"espessura":null,"unidade":"cm"}'::jsonb;
BEGIN
  -- 1. gravar (91.0 e 100.000 → sem zeros) e ler
  v_p1 := public.cat_guardar_produto(v_org, NULL, 'produto', 'Teste Intervalo P1 ' || v_suf, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
  PERFORM public.cat_guardar_produto_tabelas(v_org, v_p1, NULL, NULL, current_setting('teste.n_t'), current_setting('teste.n_s1'));
  r := public.cat_guardar_produto_atributos(v_org, v_p1, jsonb_build_array(jsonb_build_object('atributo', v_med,
         'medida', '{"tipo":"2D","largura":{"de":91.0,"ate":100.000},"comprimento":90,"unidade":"cm"}'::jsonb)));
  IF r IS DISTINCT FROM '{"ok":true,"n":1}'::jsonb THEN RAISE EXCEPTION 'FALHOU: gravar o intervalo → %', r; END IF;

  SELECT e INTO v_e FROM jsonb_array_elements(public.cat_ler_atributos_produto(v_org, v_p1) -> 'valores') e;
  IF v_e -> 'medida' IS DISTINCT FROM v_esperado OR v_e ->> 'valor' IS DISTINCT FROM '91–100 × 90 cm'
     OR (v_e ->> 'atributo') IS DISTINCT FROM v_med THEN
    RAISE EXCEPTION 'FALHOU: ler o intervalo → %', v_e;
  END IF;

  -- 2. SKU com o modelo
  PERFORM public.cat_guardar_produto_modelo(v_org, v_p1, v_m1);
  r := public.cat_gerar_sku_produto(v_org, v_p1);
  IF r ->> 'sku' IS DISTINCT FROM v_pre || '-0001-91A100X90' OR (r -> 'gerado') IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: SKU do intervalo → % (esperado %-0001-91A100X90)', r, v_pre;
  END IF;

  -- 3. o texto na lista paginada
  r := public.cat_ler_produtos_pagina(v_org, NULL, NULL, current_setting('teste.s1')::uuid);
  SELECT e INTO v_e FROM jsonb_array_elements(r -> 'produtos') e WHERE (e ->> 'id')::uuid = v_p1;
  IF v_e ->> 'atributos_resumo' IS DISTINCT FROM 'Medida Intervalo T' || v_suf || ': 91–100×90 cm' THEN
    RAISE EXCEPTION 'FALHOU: atributos_resumo da lista → %', v_e ->> 'atributos_resumo';
  END IF;

  -- 4. duplicados: o mesmo intervalo (100.0) noutro produto do mesmo modelo
  v_p2 := public.cat_guardar_produto(v_org, NULL, 'produto', 'Teste Intervalo P2 ' || v_suf, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
  PERFORM public.cat_guardar_produto_tabelas(v_org, v_p2, NULL, NULL, current_setting('teste.n_t'), current_setting('teste.n_s1'));
  PERFORM public.cat_guardar_produto_atributos(v_org, v_p2, jsonb_build_array(jsonb_build_object('atributo', v_med,
            'medida', '{"tipo":"2D","largura":{"de":91,"ate":100.0},"comprimento":90}'::jsonb)));
  PERFORM public.cat_guardar_produto_modelo(v_org, v_p2, v_m1);
  r := public.cat_gerar_sku_produto(v_org, v_p2);
  IF r ->> 'motivo' IS DISTINCT FROM 'duplicado' OR (r ->> 'outro_produto')::uuid IS DISTINCT FROM v_p1 THEN
    RAISE EXCEPTION 'FALHOU: o mesmo intervalo noutro produto não deu duplicado → %', r;
  END IF;
  r := public.cat_prever_sku_modelo(v_org, current_setting('teste.t')::uuid, current_setting('teste.s1')::uuid, v_m1,
         jsonb_build_array(jsonb_build_object('atributo', v_med, 'medida', '{"tipo":"2D","largura":{"de":91,"ate":100},"comprimento":90}'::jsonb)), v_p2);
  IF r ->> 'sku' IS DISTINCT FROM v_pre || '-0001-91A100X90' OR NOT (r -> 'faltas') ? 'duplicado'
     OR (r ->> 'outro_produto')::uuid IS DISTINCT FROM v_p1 THEN
    RAISE EXCEPTION 'FALHOU: pré-visualizar o mesmo intervalo → %', r;
  END IF;
  -- outro intervalo → outro SKU
  PERFORM public.cat_guardar_produto_atributos(v_org, v_p2, jsonb_build_array(jsonb_build_object('atributo', v_med,
            'medida', '{"tipo":"2D","largura":{"de":91,"ate":101},"comprimento":90}'::jsonb)));
  r := public.cat_gerar_sku_produto(v_org, v_p2);
  IF r ->> 'sku' IS DISTINCT FROM v_pre || '-0001-91A101X90' OR (r -> 'gerado') IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: outro intervalo → %', r;
  END IF;

  -- 5. recusas [CT002 x7]; a medida de P1 fica
  FOR v_e IN SELECT x FROM jsonb_array_elements(jsonb_build_array(
      jsonb_build_object('l', '{"de":100,"ate":91}'::jsonb, 'm', 'No intervalo da largura, o início (100) tem de ser menor que o fim (91).'),
      jsonb_build_object('l', '{"de":91,"ate":91}'::jsonb,  'm', 'No intervalo da largura, o início (91) tem de ser menor que o fim (91).'),
      jsonb_build_object('l', '{"de":91}'::jsonb,           'm', 'No intervalo da largura falta o fim («ate»).'),
      jsonb_build_object('l', '{"ate":100}'::jsonb,         'm', 'No intervalo da largura falta o início («de»).'),
      jsonb_build_object('l', '{"de":91,"ate":100,"a":1}'::jsonb, 'm', 'O intervalo da largura só leva «de» e «ate».'),
      -- 20270122300000: o início pode ser 0 (aceite mais abaixo); recusa-se só o negativo
      jsonb_build_object('l', '{"de":-1,"ate":100}'::jsonb, 'm', 'O início da largura tem de ser um número igual ou maior que zero.'),
      jsonb_build_object('l', '{"de":91,"ate":100.0001}'::jsonb, 'm', 'O fim da largura tem no máximo 3 casas decimais.'))) x LOOP
    BEGIN
      PERFORM public.cat_guardar_produto_atributos(v_org, v_p1, jsonb_build_array(jsonb_build_object('atributo', v_med,
                'medida', jsonb_build_object('tipo', '2D', 'largura', v_e -> 'l', 'comprimento', 90, 'unidade', 'cm'))));
      RAISE EXCEPTION 'FALHOU: intervalo inválido aceite: %', v_e -> 'l';
    EXCEPTION WHEN SQLSTATE 'CT002' THEN
      GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
      IF v_msg IS DISTINCT FROM v_e ->> 'm' THEN RAISE EXCEPTION 'FALHOU: recusa de % → «%» (esperado «%»)', v_e -> 'l', v_msg, v_e ->> 'm'; END IF;
      v_n := v_n + 1;
    END;
  END LOOP;
  IF v_n <> 7 THEN RAISE EXCEPTION 'FALHOU: % recusas (esperadas 7)', v_n; END IF;
  SELECT e INTO v_e FROM jsonb_array_elements(public.cat_ler_atributos_produto(v_org, v_p1) -> 'valores') e;
  IF v_e -> 'medida' IS DISTINCT FROM v_esperado THEN RAISE EXCEPTION 'FALHOU: a medida mudou depois das recusas → %', v_e; END IF;

  -- 20270122300000: o início 0 aceita-se («até 100»): {"de":0,"ate":100}, «0–100 × 90 cm» (em P2)
  r := public.cat_guardar_produto_atributos(v_org, v_p2, jsonb_build_array(jsonb_build_object('atributo', v_med,
         'medida', '{"tipo":"2D","largura":{"de":0,"ate":100},"comprimento":90,"unidade":"cm"}'::jsonb)));
  SELECT e INTO v_e FROM jsonb_array_elements(public.cat_ler_atributos_produto(v_org, v_p2) -> 'valores') e;
  IF r IS DISTINCT FROM '{"ok":true,"n":1}'::jsonb OR v_e #> '{medida,largura}' IS DISTINCT FROM '{"de":0,"ate":100}'::jsonb
     OR v_e ->> 'valor' IS DISTINCT FROM '0–100 × 90 cm' THEN
    RAISE EXCEPTION 'FALHOU: intervalo com início 0 → % / %', r, v_e;
  END IF;

  PERFORM set_config('teste.p1', v_p1::text, true);
END $t$;
RESET ROLE;

-- ─── 6. Números como antes; 3D com espessura em intervalo; pré-visualização inválida
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  v_org uuid := current_setting('teste.org')::uuid; v_suf text := current_setting('teste.suf');
  v_med text := current_setting('teste.med'); v_m1 uuid := current_setting('teste.m1')::uuid;
  v_t uuid := current_setting('teste.t')::uuid; v_s1 uuid := current_setting('teste.s1')::uuid;
  v_pre text := current_setting('teste.sa') || '-' || current_setting('teste.sb');
  v_p3 uuid; v_p4 uuid; r jsonb; v_e jsonb;
BEGIN
  -- números: o mesmo value_json e value_text de 20270117600000 (70.0 → 70)
  v_p3 := public.cat_guardar_produto(v_org, NULL, 'produto', 'Teste Intervalo P3 ' || v_suf, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
  PERFORM public.cat_guardar_produto_tabelas(v_org, v_p3, NULL, NULL, current_setting('teste.n_t'), current_setting('teste.n_s1'));
  PERFORM public.cat_guardar_produto_atributos(v_org, v_p3, jsonb_build_array(jsonb_build_object('atributo', v_med,
            'medida', '{"tipo":"2D","largura":70,"comprimento":70.0,"espessura":5,"unidade":"cm"}'::jsonb)));
  SELECT e INTO v_e FROM jsonb_array_elements(public.cat_ler_atributos_produto(v_org, v_p3) -> 'valores') e;
  IF v_e -> 'medida' IS DISTINCT FROM '{"tipo":"2D","largura":70,"comprimento":70,"espessura":null,"unidade":"cm"}'::jsonb
     OR v_e ->> 'valor' IS DISTINCT FROM '70 × 70 cm' THEN
    RAISE EXCEPTION 'FALHOU: medida com números mudou → %', v_e;
  END IF;
  PERFORM public.cat_guardar_produto_modelo(v_org, v_p3, v_m1);
  r := public.cat_gerar_sku_produto(v_org, v_p3);
  IF r ->> 'sku' IS DISTINCT FROM v_pre || '-0001-70X70' THEN RAISE EXCEPTION 'FALHOU: SKU com números → %', r; END IF;

  -- 3D em mm com números: «12,5 × 25 × 0,8 mm», 12P5X25X0P8MM
  PERFORM public.cat_guardar_produto_atributos(v_org, v_p3, jsonb_build_array(jsonb_build_object('atributo', v_med,
            'medida', '{"tipo":"3D","largura":12.5,"comprimento":25,"espessura":0.80,"unidade":"mm"}'::jsonb)));
  SELECT e INTO v_e FROM jsonb_array_elements(public.cat_ler_atributos_produto(v_org, v_p3) -> 'valores') e;
  r := public.cat_gerar_sku_produto(v_org, v_p3);
  IF v_e -> 'medida' IS DISTINCT FROM '{"tipo":"3D","largura":12.5,"comprimento":25,"espessura":0.8,"unidade":"mm"}'::jsonb
     OR v_e ->> 'valor' IS DISTINCT FROM '12,5 × 25 × 0,8 mm' OR r ->> 'sku' IS DISTINCT FROM v_pre || '-0001-12P5X25X0P8MM' THEN
    RAISE EXCEPTION 'FALHOU: 3D com números → % / %', v_e, r;
  END IF;

  -- 3D com a espessura em intervalo: «60 × 30 × 1–2,5 cm», 60X30X1A2P5
  v_p4 := public.cat_guardar_produto(v_org, NULL, 'produto', 'Teste Intervalo P4 ' || v_suf, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
  PERFORM public.cat_guardar_produto_tabelas(v_org, v_p4, NULL, NULL, current_setting('teste.n_t'), current_setting('teste.n_s1'));
  PERFORM public.cat_guardar_produto_atributos(v_org, v_p4, jsonb_build_array(jsonb_build_object('atributo', v_med,
            'medida', '{"tipo":"3D","largura":60,"comprimento":30,"espessura":{"de":1,"ate":2.5},"unidade":"cm"}'::jsonb)));
  PERFORM public.cat_guardar_produto_modelo(v_org, v_p4, v_m1);
  SELECT e INTO v_e FROM jsonb_array_elements(public.cat_ler_atributos_produto(v_org, v_p4) -> 'valores') e;
  r := public.cat_gerar_sku_produto(v_org, v_p4);
  IF v_e ->> 'valor' IS DISTINCT FROM '60 × 30 × 1–2,5 cm' OR v_e #> '{medida,espessura}' IS DISTINCT FROM '{"de":1,"ate":2.5}'::jsonb
     OR r ->> 'sku' IS DISTINCT FROM v_pre || '-0001-60X30X1A2P5' THEN
    RAISE EXCEPTION 'FALHOU: 3D com espessura em intervalo → % / %', v_e, r;
  END IF;

  -- pré-visualização com um intervalo inválido: sem erro, o segmento fica de fora e falta medida:<código>
  r := public.cat_prever_sku_modelo(v_org, v_t, v_s1, v_m1,
         jsonb_build_array(jsonb_build_object('atributo', v_med, 'medida', '{"tipo":"2D","largura":{"de":100,"ate":91},"comprimento":90}'::jsonb)), NULL);
  IF r ->> 'sku' IS DISTINCT FROM v_pre || '-0001' OR r -> 'faltas' IS DISTINCT FROM jsonb_build_array('medida:' || current_setting('teste.cod_med')) THEN
    RAISE EXCEPTION 'FALHOU: pré-visualização com intervalo inválido → %', r;
  END IF;
END $t$;
RESET ROLE;

SELECT 'OK: intervalo gravado e lido ({"de":91,"ate":100}, «91–100 × 90 cm»), SKU ' || current_setting('teste.sa') || '-'
       || current_setting('teste.sb') || '-0001-91A100X90, lista «91–100×90 cm», duplicado do mesmo intervalo (gerar e '
       || 'pré-visualizar), outro intervalo 91A101X90, 7 recusas CT002 com a mensagem certa, números iguais aos de antes '
       || '(70X70, «70 × 70 cm», 12P5X25X0P8MM), espessura em intervalo 60X30X1A2P5, pré-visualização inválida sem erro.' AS resultado;

ROLLBACK;
