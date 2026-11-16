-- ============================================================
-- Testes: 20270118250000_catalogo_fornecedor_produto.sql (base RH)
-- ============================================================
-- ORDEM: correr ANTES do db push da 118100000 (falha no passo 0, «função cat_ligar_fornecedor_produto não existe»);
-- depois do push termina com «OK: …» e a lista do que foi saltado. Qualquer falha rebenta com 'FALHOU: …'.
--
-- Tudo dentro de BEGIN … ROLLBACK. Escritas só na nike (b6ffce4f-f630-4933-833a-008649757a33): 3 produtos de teste (pela
-- função do Catálogo), 2 fornecedores de teste inseridos como postgres (um vivo com NIF, um apagado), mais os que as
-- funções criam, e as ligações em item_suppliers. Mais um fornecedor desativado (is_active false), inserido como postgres. Um fornecedor GLOBAL (organization_id nulo) só para a recusa
-- «fornecedor de outra organização» — não se lê nem escreve nenhuma outra organização. A BM24
-- (872abff2-043f-41e1-99dd-0a8e305ddecb) só aparece como p_org para provar a recusa CT001.
-- Nomes com um sufixo aleatório; NIF aleatórios conferidos como livres na nike.
-- Sessões emprestadas (role authenticated, auth.uid() pelas claims), membros activos da nike, não system admin:
--   editor    products.edit, services.view e suppliers.create, fora da BM24        (obrigatório)
--   sem       sem products.edit                                                    (obrigatório)
--   reduzido  sem products.edit nem services.view                                  (obrigatório)
--   semcriar  products.edit sem suppliers.create                                   (opcional: saltado se não houver)
--   leitor    services.view sem products.edit                                      (opcional: saltado se não houver)
--   semver    products.edit sem suppliers.view                                     (opcional: saltado se não houver)
--
-- Correr a partir do worktree rh-pessoas (supabase/.temp/project-ref = uetjghdkwbywbftedtth):
--   supabase db query --linked -f supabase/tests/catalogo_fornecedor_produto.test.sql
-- Chamadas recusadas de propósito: cerca de 25 (ficam como erro no registo do Postgres).
--
-- O que PROVA:
--   1. Ler: só os não apagados da nike (nem o apagado nem o global), todos, na ordem do ORDER BY da própria função
--      (comparada com o mesmo ORDER BY corrido no teste, não com < em texto); truncado false; campos
--      id/nome/nif/email/ativo; nif/email preenchidos só com suppliers.view (null para semver, e para o editor se ele não
--      a tiver); pode_criar true (editor) e false (semcriar); leitor só com services.view lê; CT001 sem as duas permissões
--   2. Ligar existente: ligação criada, preferida (o produto não tinha), custo atual a 2 casas, moeda, preco_data,
--      supplier_sku = sku, item_type 'product', uom nula, created_by; repetir não duplica (mesma ligação, criada false)
--   3. Criar novo: nome limpo, email gravado, NIF nulo, ativo, created_by; não preferido (o produto já tinha);
--      auditoria com source 'fn:cat_ligar_fornecedor_produto' e app.audit_source reposto
--   4. Reutilizar: por nome (maiúsculas, sem acentos, espaços a mais) e por NIF (guardado com espaços, escrito com
--      espaços nas pontas); o mesmo nome com OUTRO NIF cria outro; o apagado não é reutilizado
--   5. Consumível sem custo: preço e preco_data nulos, preferido
--   6. products.supplier_id acertado pelo gatilho (= o preferido) e products.fornecedor_livre = o último escolhido
--   7. Recusas: CT002 (os dois, nenhum, NIF/email com p_fornecedor, nome vazio, 201 caracteres, email sem @, email de
--      255, NIF com sinal, NIF de 21, fornecedor desativado escolhido e reutilizado por nome), 200 caracteres aceite; CT003 (fornecedor global, inventado, apagado; produto
--      inventado, apagado, de tipo fora do Catálogo); CT001 (sem products.edit, leitor, sem suppliers.create ao criar —
--      mas ligar um existente passa —, BM24, p_org nulo)
--   8. GRANTs (anon e PUBLIC sem EXECUTE; authenticated e service_role com), SECURITY DEFINER e search_path com pg_temp
--
-- O que NÃO cobre: corridas entre duas sessões (advisory lock e o CT004 do unique_violation); um fornecedor REAL de
-- outra organização (usa-se um global); fornecedores com vat_number (a nike não tem nenhum); o teto de 5000
-- fornecedores por organização e o "truncado": true acima de 2000 linhas (precisariam de milhares de inserts).
-- ============================================================

BEGIN;

-- ─── 0. A migration está aplicada? ───────────────────────────────────────────
DO $t$
BEGIN
  IF to_regprocedure('public.cat_ligar_fornecedor_produto(uuid,uuid,uuid,text,text,text)') IS NULL
     OR to_regprocedure('public.cat_ler_fornecedores(uuid)') IS NULL THEN
    RAISE EXCEPTION 'FALHOU: função cat_ligar_fornecedor_produto / cat_ler_fornecedores não existe (aplicar 20270118250000_catalogo_fornecedor_produto.sql).';
  END IF;
END $t$;

-- ─── Fixtures (como postgres) ────────────────────────────────────────────────
DO $fx$
DECLARE
  c_org constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  c_bm24 constant uuid := '872abff2-043f-41e1-99dd-0a8e305ddecb';
  r record; v_ed uuid; v_act uuid; v_sem uuid; v_red uuid; v_semc uuid; v_leit uuid; v_semv uuid; v_bm boolean; v_ed_ver boolean;
  v_suf text; v_nif text; v_nif_b text; v_i integer := 0; v_salt text := '';
  v_ex uuid := gen_random_uuid(); v_apag uuid := gen_random_uuid(); v_glob uuid := gen_random_uuid(); v_inat uuid := gen_random_uuid();
  v_p_apag uuid; v_p_tipo uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM anew_organizations WHERE id = c_org) THEN RAISE EXCEPTION 'FALHOU (fixture): a nike não existe nesta base'; END IF;
  PERFORM set_config('app.audit_source', 'teste:catalogo_fornecedor_produto', true);

  FOR r IN SELECT u.auth_user_id, u.id
           FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
           WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND NOT coalesce(m.role_is_client, false)
             AND NOT public.is_system_admin_user(u.auth_user_id)
           ORDER BY m.created_at, u.id LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', r.auth_user_id, 'role', 'authenticated')::text, true);
    v_bm := EXISTS (SELECT 1 FROM anew_memberships mb WHERE mb.user_id = r.id AND mb.organization_id = c_bm24 AND mb.status = 'active');
    IF v_ed IS NULL AND NOT v_bm AND public.fn_cat_pode(c_org, 'products.edit') AND public.fn_cat_pode(c_org, 'services.view')
       AND public.fn_cat_pode(c_org, 'suppliers.create') THEN
      v_ed := r.auth_user_id; v_act := public.current_business_user_id();
      v_ed_ver := public.fn_cat_pode(c_org, 'suppliers.view');
      IF public.fn_cat_pode(c_bm24, 'products.edit') THEN
        v_salt := v_salt || 'recusa BM24 (o editor tem products.edit lá); ';
        PERFORM set_config('teste.saltar_bm24', 'sim', true);
      END IF;
    ELSIF v_semc IS NULL AND public.fn_cat_pode(c_org, 'products.edit') AND NOT public.fn_cat_pode(c_org, 'suppliers.create') THEN
      v_semc := r.auth_user_id;
    END IF;
    IF v_sem IS NULL AND NOT public.fn_cat_pode(c_org, 'products.edit') THEN v_sem := r.auth_user_id; END IF;
    IF v_red IS NULL AND NOT public.fn_cat_pode(c_org, 'products.edit') AND NOT public.fn_cat_pode(c_org, 'services.view') THEN
      v_red := r.auth_user_id;
    END IF;
    IF v_leit IS NULL AND public.fn_cat_pode(c_org, 'services.view') AND NOT public.fn_cat_pode(c_org, 'products.edit') THEN
      v_leit := r.auth_user_id;
    END IF;
    IF v_semv IS NULL AND r.auth_user_id IS DISTINCT FROM v_ed AND public.fn_cat_pode(c_org, 'products.edit')
       AND NOT public.fn_cat_pode(c_org, 'suppliers.view') THEN
      v_semv := r.auth_user_id;
    END IF;
    EXIT WHEN v_ed IS NOT NULL AND v_sem IS NOT NULL AND v_red IS NOT NULL AND v_semc IS NOT NULL AND v_leit IS NOT NULL
      AND v_semv IS NOT NULL;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
  IF v_ed IS NULL OR v_act IS NULL THEN
    RAISE EXCEPTION 'FALHOU (fixture): sem membro activo da nike (não system admin, fora da BM24) com products.edit, services.view e suppliers.create';
  END IF;
  IF v_sem IS NULL THEN RAISE EXCEPTION 'FALHOU (fixture): sem membro activo da nike sem products.edit'; END IF;
  IF v_red IS NULL THEN RAISE EXCEPTION 'FALHOU (fixture): sem membro activo da nike sem products.edit nem services.view'; END IF;
  IF v_semc IS NULL THEN v_salt := v_salt || 'recusa sem suppliers.create e pode_criar false (nenhum membro com products.edit sem suppliers.create); '; END IF;
  IF v_leit IS NULL THEN v_salt := v_salt || 'leitor só com services.view (nenhum membro assim); '; END IF;
  IF v_semv IS NULL THEN v_salt := v_salt || 'nif/email nulos sem suppliers.view com um membro só com products.edit (nenhum membro assim); '; END IF;

  -- sufixo e NIF aleatórios, livres na nike
  LOOP
    v_i := v_i + 1;
    v_suf := translate(upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6)), '0123456789', 'GHIJKLMNOP');
    v_nif := '5' || lpad(floor(random() * 100000000)::bigint::text, 8, '0');
    v_nif_b := '6' || lpad(floor(random() * 100000000)::bigint::text, 8, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM suppliers s WHERE s.organization_id = c_org AND s.deleted_at IS NULL
                          AND (upper(regexp_replace(coalesce(s.tax_id, ''), '[^A-Za-z0-9]', '', 'g')) IN (v_nif, v_nif_b)
                            OR upper(regexp_replace(coalesce(s.vat_number, ''), '[^A-Za-z0-9]', '', 'g')) IN (v_nif, v_nif_b)
                            OR s.name ILIKE '%T' || v_suf || '%'));
    IF v_i >= 20 THEN RAISE EXCEPTION 'FALHOU (fixture): sem sufixo/NIF livres ao fim de 20 tentativas'; END IF;
  END LOOP;

  -- um fornecedor vivo com NIF guardado com espaços, um apagado, um global (sem organização)
  INSERT INTO suppliers (id, organization_id, name, tax_id, email, is_active, created_by)
  VALUES (v_ex, c_org, 'Aaa Forn Existente T' || v_suf, left(v_nif, 3) || ' ' || substr(v_nif, 4, 3) || ' ' || substr(v_nif, 7, 3),
          'existente@exemplo.pt', true, v_act);
  INSERT INTO suppliers (id, organization_id, name, is_active, created_by, deleted_at, deleted_by)
  VALUES (v_apag, c_org, 'Apagado Forn T' || v_suf, true, v_act, now(), v_act);
  INSERT INTO suppliers (id, organization_id, name, is_active, created_by)
  VALUES (v_glob, NULL, 'Global Forn T' || v_suf, true, v_act);
  INSERT INTO suppliers (id, organization_id, name, tax_id, email, is_active, created_by)
  VALUES (v_inat, c_org, 'Inativo Forn T' || v_suf, NULL, 'inativo@exemplo.pt', false, v_act);

  -- opcionais: sem eles, a recusa correspondente é saltada
  SELECT p.id INTO v_p_apag FROM products p
  WHERE p.organization_id = c_org AND p.tipo_catalogo IN ('produto', 'consumivel') AND p.is_deleted ORDER BY p.created_at, p.id LIMIT 1;
  IF v_p_apag IS NULL THEN v_salt := v_salt || 'recusa do produto apagado (a nike não tem); '; END IF;
  SELECT p.id INTO v_p_tipo FROM products p
  WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.deleted_at IS NULL
    AND (p.tipo_catalogo IS NULL OR p.tipo_catalogo NOT IN ('produto', 'consumivel'))
  ORDER BY p.created_at, p.id LIMIT 1;
  IF v_p_tipo IS NULL THEN v_salt := v_salt || 'recusa do produto fora do Catálogo (a nike não tem); '; END IF;

  PERFORM set_config('teste.org', c_org::text, true);
  PERFORM set_config('teste.bm24', c_bm24::text, true);
  PERFORM set_config('teste.act', v_act::text, true);
  PERFORM set_config('teste.suf', v_suf, true);
  PERFORM set_config('teste.nif', v_nif, true);
  PERFORM set_config('teste.nif_b', v_nif_b, true);
  PERFORM set_config('teste.f_ex', v_ex::text, true);
  PERFORM set_config('teste.f_apag', v_apag::text, true);
  PERFORM set_config('teste.f_glob', v_glob::text, true);
  PERFORM set_config('teste.f_inat', v_inat::text, true);
  PERFORM set_config('teste.ed_ver', v_ed_ver::text, true);
  PERFORM set_config('teste.p_apag', coalesce(v_p_apag::text, ''), true);
  PERFORM set_config('teste.p_tipo', coalesce(v_p_tipo::text, ''), true);
  PERFORM set_config('teste.n_forn', (SELECT count(*) FROM suppliers s WHERE s.organization_id = c_org AND s.deleted_at IS NULL)::text, true);
  PERFORM set_config('teste.saltados', v_salt, true);
  PERFORM set_config('teste.claims', json_build_object('sub', v_ed, 'role', 'authenticated')::text, true);
  PERFORM set_config('teste.claims_sem', json_build_object('sub', v_sem, 'role', 'authenticated')::text, true);
  PERFORM set_config('teste.claims_red', json_build_object('sub', v_red, 'role', 'authenticated')::text, true);
  PERFORM set_config('teste.claims_semc', (CASE WHEN v_semc IS NULL THEN '' ELSE json_build_object('sub', v_semc, 'role', 'authenticated')::text END), true);
  PERFORM set_config('teste.claims_leit', (CASE WHEN v_leit IS NULL THEN '' ELSE json_build_object('sub', v_leit, 'role', 'authenticated')::text END), true);
  PERFORM set_config('teste.tem_semc', (v_semc IS NOT NULL)::text, true);
  PERFORM set_config('teste.tem_leit', (v_leit IS NOT NULL)::text, true);
  PERFORM set_config('teste.claims_semv', (CASE WHEN v_semv IS NULL THEN '' ELSE json_build_object('sub', v_semv, 'role', 'authenticated')::text END), true);
  PERFORM set_config('teste.tem_semv', (v_semv IS NOT NULL)::text, true);
END $fx$;

-- ─── 1 a 5. Editor: ler, ligar, criar, reutilizar ────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  v_org uuid := current_setting('teste.org')::uuid; v_suf text := current_setting('teste.suf');
  v_ex uuid := current_setting('teste.f_ex')::uuid; v_apag uuid := current_setting('teste.f_apag')::uuid;
  v_nif text := current_setting('teste.nif'); v_nif_b text := current_setting('teste.nif_b');
  v_p1 uuid; v_p2 uuid; v_p3 uuid; r jsonb; v_el jsonb; v_lig1 uuid; v_novo uuid; v_outro uuid; v_apag_novo uuid; v_longo uuid;
  v_nome_longo text; v_msg text;
BEGIN
  v_p1 := public.cat_guardar_produto(v_org, NULL, 'produto', 'Teste Forn P1 T' || v_suf, NULL, NULL, NULL, 12.345, NULL, NULL, NULL, NULL);
  v_p2 := public.cat_guardar_produto(v_org, NULL, 'consumivel', 'Teste Forn P2 T' || v_suf, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
  v_p3 := public.cat_guardar_produto(v_org, NULL, 'produto', 'Teste Forn P3 T' || v_suf, NULL, NULL, NULL, 7, NULL, NULL, NULL, NULL);

  -- 1. ler
  r := public.cat_ler_fornecedores(v_org);
  IF (r -> 'pode_criar') IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'FALHOU: pode_criar do editor → %', r -> 'pode_criar'; END IF;
  IF jsonb_typeof(r -> 'fornecedores') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'FALHOU: fornecedores não é lista'; END IF;
  SELECT e INTO v_el FROM jsonb_array_elements(r -> 'fornecedores') e WHERE e ->> 'id' = v_ex::text;
  IF v_el IS NULL THEN RAISE EXCEPTION 'FALHOU: o fornecedor de teste não vem na lista'; END IF;
  IF v_el ->> 'nome' IS DISTINCT FROM 'Aaa Forn Existente T' || v_suf OR (v_el -> 'ativo') IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: campos do fornecedor na lista → %', v_el;
  END IF;
  -- nif/email só com suppliers.view
  IF current_setting('teste.ed_ver')::boolean THEN
    IF v_el ->> 'nif' IS DISTINCT FROM left(v_nif, 3) || ' ' || substr(v_nif, 4, 3) || ' ' || substr(v_nif, 7, 3)
       OR v_el ->> 'email' IS DISTINCT FROM 'existente@exemplo.pt' THEN
      RAISE EXCEPTION 'FALHOU: nif/email com suppliers.view → %', v_el;
    END IF;
  ELSIF (v_el -> 'nif') IS DISTINCT FROM 'null'::jsonb OR (v_el -> 'email') IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: nif/email sem suppliers.view (editor) → %', v_el;
  END IF;
  IF (r -> 'truncado') IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'FALHOU: truncado → %', r -> 'truncado'; END IF;
  SELECT e INTO v_el FROM jsonb_array_elements(r -> 'fornecedores') e WHERE e ->> 'id' = current_setting('teste.f_inat');
  IF v_el IS NULL OR (v_el -> 'ativo') IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'FALHOU: o desativado na lista → %', v_el; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(r -> 'fornecedores') e
             WHERE e ->> 'id' IN (v_apag::text, current_setting('teste.f_glob'))) THEN
    RAISE EXCEPTION 'FALHOU: a lista traz o fornecedor apagado ou o global';
  END IF;
  PERFORM set_config('teste.lista', r::text, true);

  -- 2. ligar um existente
  r := public.cat_ligar_fornecedor_produto(v_org, v_p1, p_fornecedor := v_ex);
  IF (r #>> '{fornecedor,id}')::uuid IS DISTINCT FROM v_ex OR (r #> '{fornecedor,criado}') IS DISTINCT FROM 'false'::jsonb
     OR (r #> '{fornecedor,reutilizado}') IS DISTINCT FROM 'false'::jsonb OR (r #> '{ligacao,criada}') IS DISTINCT FROM 'true'::jsonb
     OR (r #> '{ligacao,preferido}') IS DISTINCT FROM 'true'::jsonb OR r #>> '{fornecedor,nome}' IS DISTINCT FROM 'Aaa Forn Existente T' || v_suf THEN
    RAISE EXCEPTION 'FALHOU: ligar existente → %', r;
  END IF;
  IF current_setting('app.audit_source', true) IS DISTINCT FROM 'teste:catalogo_fornecedor_produto' THEN
    RAISE EXCEPTION 'FALHOU: app.audit_source não foi reposto (ficou %)', current_setting('app.audit_source', true);
  END IF;
  v_lig1 := (r #>> '{ligacao,id}')::uuid;
  r := public.cat_ligar_fornecedor_produto(v_org, v_p1, v_ex);
  IF (r #>> '{ligacao,id}')::uuid IS DISTINCT FROM v_lig1 OR (r #> '{ligacao,criada}') IS DISTINCT FROM 'false'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: ligar de novo duplicou → %', r;
  END IF;

  -- 3. criar novo (P1 já tem preferido)
  r := public.cat_ligar_fornecedor_produto(v_org, v_p1, p_novo_nome := '  Forn   Ção Teste T' || v_suf || '  ', p_email := ' compras@exemplo.pt ');
  IF (r #> '{fornecedor,criado}') IS DISTINCT FROM 'true'::jsonb OR (r #> '{fornecedor,reutilizado}') IS DISTINCT FROM 'false'::jsonb
     OR r #>> '{fornecedor,nome}' IS DISTINCT FROM 'Forn Ção Teste T' || v_suf
     OR (r #> '{ligacao,preferido}') IS DISTINCT FROM 'false'::jsonb OR (r #> '{ligacao,criada}') IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: criar novo → %', r;
  END IF;
  v_novo := (r #>> '{fornecedor,id}')::uuid;
  IF current_setting('app.audit_source', true) IS DISTINCT FROM 'teste:catalogo_fornecedor_produto' THEN
    RAISE EXCEPTION 'FALHOU: app.audit_source não foi reposto depois de criar (ficou %)', current_setting('app.audit_source', true);
  END IF;

  -- 4. reutilizar por nome (maiúsculas, sem acento, espaços) — P2 (consumível, sem custo) não tem preferido
  r := public.cat_ligar_fornecedor_produto(v_org, v_p2, p_novo_nome := 'FORN cao   teste t' || lower(v_suf));
  IF (r #>> '{fornecedor,id}')::uuid IS DISTINCT FROM v_novo OR (r #> '{fornecedor,reutilizado}') IS DISTINCT FROM 'true'::jsonb
     OR (r #> '{fornecedor,criado}') IS DISTINCT FROM 'false'::jsonb OR (r #> '{ligacao,preferido}') IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: reutilizar por nome → %', r;
  END IF;
  -- por NIF (guardado com espaços; escrito com espaços nas pontas e outro nome)
  r := public.cat_ligar_fornecedor_produto(v_org, v_p3, p_novo_nome := 'Nome Totalmente Outro T' || v_suf, p_nif := '  ' || v_nif || ' ');
  IF (r #>> '{fornecedor,id}')::uuid IS DISTINCT FROM v_ex OR (r #> '{fornecedor,reutilizado}') IS DISTINCT FROM 'true'::jsonb
     OR (r #> '{ligacao,preferido}') IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: reutilizar por NIF → %', r;
  END IF;
  -- o mesmo nome com OUTRO NIF é outra empresa
  r := public.cat_ligar_fornecedor_produto(v_org, v_p3, p_novo_nome := 'aaa forn existente t' || v_suf, p_nif := v_nif_b);
  IF (r #> '{fornecedor,criado}') IS DISTINCT FROM 'true'::jsonb OR (r #>> '{fornecedor,id}')::uuid = v_ex
     OR (r #> '{ligacao,preferido}') IS DISTINCT FROM 'false'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: mesmo nome com outro NIF → %', r;
  END IF;
  v_outro := (r #>> '{fornecedor,id}')::uuid;
  -- o apagado não é reutilizado
  r := public.cat_ligar_fornecedor_produto(v_org, v_p2, p_novo_nome := 'Apagado Forn T' || v_suf);
  IF (r #> '{fornecedor,criado}') IS DISTINCT FROM 'true'::jsonb OR (r #>> '{fornecedor,id}')::uuid = v_apag THEN
    RAISE EXCEPTION 'FALHOU: o fornecedor apagado foi reutilizado → %', r;
  END IF;
  v_apag_novo := (r #>> '{fornecedor,id}')::uuid;
  -- 200 caracteres passa (último ligado a P2)
  v_nome_longo := 'Longo T' || v_suf || ' ';
  v_nome_longo := v_nome_longo || repeat('x', 200 - length(v_nome_longo));
  r := public.cat_ligar_fornecedor_produto(v_org, v_p2, p_novo_nome := v_nome_longo);
  IF (r #> '{fornecedor,criado}') IS DISTINCT FROM 'true'::jsonb OR length(r #>> '{fornecedor,nome}') <> 200 THEN
    RAISE EXCEPTION 'FALHOU: nome de 200 caracteres → %', r;
  END IF;
  v_longo := (r #>> '{fornecedor,id}')::uuid;

  -- 7. recusas do editor
  BEGIN PERFORM public.cat_ligar_fornecedor_produto(v_org, v_p1, v_ex, 'Ambos T' || v_suf); RAISE EXCEPTION 'FALHOU: os dois aceites';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL; END;
  BEGIN PERFORM public.cat_ligar_fornecedor_produto(v_org, v_p1); RAISE EXCEPTION 'FALHOU: nenhum aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL; END;
  BEGIN PERFORM public.cat_ligar_fornecedor_produto(v_org, v_p1, p_fornecedor := v_ex, p_nif := v_nif); RAISE EXCEPTION 'FALHOU: NIF com p_fornecedor aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL; END;
  BEGIN PERFORM public.cat_ligar_fornecedor_produto(v_org, v_p1, p_novo_nome := '   '); RAISE EXCEPTION 'FALHOU: nome vazio aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL; END;
  BEGIN PERFORM public.cat_ligar_fornecedor_produto(v_org, v_p1, p_novo_nome := v_nome_longo || 'y'); RAISE EXCEPTION 'FALHOU: nome de 201 aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL; END;
  BEGIN PERFORM public.cat_ligar_fornecedor_produto(v_org, v_p1, p_novo_nome := 'Email T' || v_suf, p_email := 'sem-arroba.pt');
    RAISE EXCEPTION 'FALHOU: email sem @ aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL; END;
  BEGIN PERFORM public.cat_ligar_fornecedor_produto(v_org, v_p1, p_novo_nome := 'Email T' || v_suf, p_email := repeat('a', 250) || '@x.pt');
    RAISE EXCEPTION 'FALHOU: email de 255 aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL; END;
  BEGIN PERFORM public.cat_ligar_fornecedor_produto(v_org, v_p1, p_novo_nome := 'Nif T' || v_suf, p_nif := 'AB-12');
    RAISE EXCEPTION 'FALHOU: NIF com sinal aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL; END;
  BEGIN PERFORM public.cat_ligar_fornecedor_produto(v_org, v_p1, p_novo_nome := 'Nif T' || v_suf, p_nif := repeat('1', 21));
    RAISE EXCEPTION 'FALHOU: NIF de 21 aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL; END;
  BEGIN PERFORM public.cat_ligar_fornecedor_produto(v_org, v_p1, current_setting('teste.f_glob')::uuid); RAISE EXCEPTION 'FALHOU: fornecedor global aceite';
  EXCEPTION WHEN SQLSTATE 'CT003' THEN NULL; END;
  BEGIN PERFORM public.cat_ligar_fornecedor_produto(v_org, v_p1, gen_random_uuid()); RAISE EXCEPTION 'FALHOU: fornecedor inventado aceite';
  EXCEPTION WHEN SQLSTATE 'CT003' THEN NULL; END;
  BEGIN PERFORM public.cat_ligar_fornecedor_produto(v_org, v_p1, v_apag); RAISE EXCEPTION 'FALHOU: fornecedor apagado aceite';
  EXCEPTION WHEN SQLSTATE 'CT003' THEN NULL; END;
  BEGIN PERFORM public.cat_ligar_fornecedor_produto(v_org, v_p1, current_setting('teste.f_inat')::uuid);
    RAISE EXCEPTION 'FALHOU: fornecedor desativado aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg IS DISTINCT FROM 'Fornecedor desativado.' THEN RAISE EXCEPTION 'FALHOU: mensagem do desativado — %', v_msg; END IF; END;
  BEGIN PERFORM public.cat_ligar_fornecedor_produto(v_org, v_p1, p_novo_nome := 'INATIVO forn t' || v_suf);
    RAISE EXCEPTION 'FALHOU: desativado reutilizado por nome aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg IS DISTINCT FROM 'Fornecedor desativado.' THEN RAISE EXCEPTION 'FALHOU: mensagem do desativado por nome — %', v_msg; END IF; END;
  BEGIN PERFORM public.cat_ligar_fornecedor_produto(v_org, gen_random_uuid(), v_ex); RAISE EXCEPTION 'FALHOU: produto inventado aceite';
  EXCEPTION WHEN SQLSTATE 'CT003' THEN NULL; END;
  IF current_setting('teste.p_apag') <> '' THEN
    BEGIN PERFORM public.cat_ligar_fornecedor_produto(v_org, current_setting('teste.p_apag')::uuid, v_ex); RAISE EXCEPTION 'FALHOU: produto apagado aceite';
    EXCEPTION WHEN SQLSTATE 'CT003' THEN NULL; END;
  END IF;
  IF current_setting('teste.p_tipo') <> '' THEN
    BEGIN PERFORM public.cat_ligar_fornecedor_produto(v_org, current_setting('teste.p_tipo')::uuid, v_ex); RAISE EXCEPTION 'FALHOU: produto fora do Catálogo aceite';
    EXCEPTION WHEN SQLSTATE 'CT003' THEN NULL; END;
  END IF;
  IF current_setting('teste.saltar_bm24', true) IS DISTINCT FROM 'sim' THEN
    BEGIN PERFORM public.cat_ligar_fornecedor_produto(current_setting('teste.bm24')::uuid, v_p1, v_ex); RAISE EXCEPTION 'FALHOU: BM24 aceite';
    EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL; END;
    BEGIN PERFORM public.cat_ler_fornecedores(current_setting('teste.bm24')::uuid); RAISE EXCEPTION 'FALHOU: ler BM24 aceite';
    EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL; END;
  END IF;
  BEGIN PERFORM public.cat_ligar_fornecedor_produto(NULL, v_p1, v_ex); RAISE EXCEPTION 'FALHOU: p_org nulo aceite';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL; END;

  PERFORM set_config('teste.p1', v_p1::text, true); PERFORM set_config('teste.p2', v_p2::text, true);
  PERFORM set_config('teste.p3', v_p3::text, true); PERFORM set_config('teste.lig1', v_lig1::text, true);
  PERFORM set_config('teste.f_novo', v_novo::text, true); PERFORM set_config('teste.f_outro', v_outro::text, true);
  PERFORM set_config('teste.f_apag_novo', v_apag_novo::text, true); PERFORM set_config('teste.f_longo', v_longo::text, true);
  PERFORM set_config('teste.nome_longo', v_nome_longo, true);
END $t$;
RESET ROLE;

-- ─── 1 a 6. Conferir o que ficou gravado (como postgres) ─────────────────────
DO $t$
DECLARE
  v_org uuid := current_setting('teste.org')::uuid; v_suf text := current_setting('teste.suf');
  v_act uuid := current_setting('teste.act')::uuid;
  v_p1 uuid := current_setting('teste.p1')::uuid; v_p2 uuid := current_setting('teste.p2')::uuid; v_p3 uuid := current_setting('teste.p3')::uuid;
  v_ex uuid := current_setting('teste.f_ex')::uuid; v_novo uuid := current_setting('teste.f_novo')::uuid;
  v_outro uuid := current_setting('teste.f_outro')::uuid; v_longo uuid := current_setting('teste.f_longo')::uuid;
  v_lista jsonb := current_setting('teste.lista')::jsonb; v_n bigint; v_src text; i record; s record; v_ids_f uuid[]; v_ids_sql uuid[];
BEGIN
  -- 1. a lista: todos os vivos da nike, por nome normalizado
  IF jsonb_array_length(v_lista -> 'fornecedores') <> current_setting('teste.n_forn')::bigint THEN
    RAISE EXCEPTION 'FALHOU: a lista tem % fornecedores, a nike tem %', jsonb_array_length(v_lista -> 'fornecedores'), current_setting('teste.n_forn');
  END IF;
  FOR i IN SELECT e, o FROM jsonb_array_elements(v_lista -> 'fornecedores') WITH ORDINALITY AS t(e, o) ORDER BY o LOOP
    IF NOT (i.e ?& ARRAY['id', 'nome', 'nif', 'email', 'ativo']) THEN RAISE EXCEPTION 'FALHOU: elemento sem os campos → %', i.e; END IF;
  END LOOP;
  -- a ordem: a da lista tem de ser a do mesmo ORDER BY corrido aqui (mesma collation; sem comparar texto com <)
  SELECT array_agg((t.e ->> 'id')::uuid ORDER BY t.o) INTO v_ids_f
  FROM jsonb_array_elements(v_lista -> 'fornecedores') WITH ORDINALITY AS t(e, o);
  SELECT array_agg(x.id ORDER BY x.n) INTO v_ids_sql
  FROM (SELECT s2.id, row_number() OVER (ORDER BY public.fn_cat_chave_opcao(s2.name), s2.name, s2.id) AS n
        FROM suppliers s2 WHERE s2.organization_id = v_org AND s2.deleted_at IS NULL AND s2.id = ANY (v_ids_f)) x
  WHERE x.n <= 2000; -- só os que vieram na lista: o teste cria fornecedores depois de a ler
  IF v_ids_f IS DISTINCT FROM v_ids_sql THEN RAISE EXCEPTION 'FALHOU: a lista não vem na ordem do ORDER BY por nome normalizado'; END IF;

  -- 2. a ligação ao existente
  SELECT * INTO i FROM item_suppliers WHERE id = current_setting('teste.lig1')::uuid;
  IF i.product_id IS DISTINCT FROM v_p1 OR i.supplier_id IS DISTINCT FROM v_ex OR i.organization_id IS DISTINCT FROM v_org
     OR i.item_type IS DISTINCT FROM 'product' OR i.uom_id IS NOT NULL OR NOT i.is_preferred OR NOT i.is_active
     OR i.purchase_price IS DISTINCT FROM 12.35 OR i.currency IS DISTINCT FROM 'EUR' OR i.preco_data IS DISTINCT FROM current_date
     OR i.supplier_sku IS DISTINCT FROM (SELECT p.sku FROM products p WHERE p.id = v_p1) OR i.created_by IS DISTINCT FROM v_act
     OR i.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: ligação ao existente gravada mal → %', to_jsonb(i);
  END IF;
  SELECT count(*) INTO v_n FROM item_suppliers WHERE product_id = v_p1 AND supplier_id = v_ex AND deleted_at IS NULL;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FALHOU: % ligações vivas P1–existente', v_n; END IF;
  SELECT count(*) INTO v_n FROM item_suppliers WHERE product_id = v_p1 AND deleted_at IS NULL;
  IF v_n <> 2 THEN RAISE EXCEPTION 'FALHOU: P1 tem % ligações (esperadas 2)', v_n; END IF;

  -- 3. o fornecedor criado
  SELECT * INTO s FROM suppliers WHERE id = v_novo;
  IF s.organization_id IS DISTINCT FROM v_org OR s.name IS DISTINCT FROM 'Forn Ção Teste T' || v_suf OR s.tax_id IS NOT NULL
     OR s.email IS DISTINCT FROM 'compras@exemplo.pt' OR s.is_active IS DISTINCT FROM true OR s.created_by IS DISTINCT FROM v_act
     OR s.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: fornecedor criado gravado mal → %', to_jsonb(s);
  END IF;
  SELECT count(*) INTO v_n FROM suppliers WHERE organization_id = v_org AND deleted_at IS NULL
    AND public.fn_cat_chave_opcao(name) = public.fn_cat_chave_opcao('Forn Ção Teste T' || v_suf);
  IF v_n <> 1 THEN RAISE EXCEPTION 'FALHOU: % fornecedores com o nome do criado (reutilizar duplicou)', v_n; END IF;
  IF (SELECT is_preferred FROM item_suppliers WHERE product_id = v_p1 AND supplier_id = v_novo AND deleted_at IS NULL) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FALHOU: o segundo fornecedor de P1 ficou preferido';
  END IF;
  SELECT count(*) INTO v_n FROM entity_audit_log WHERE record_id = v_novo AND table_name = 'suppliers';
  IF v_n = 0 THEN
    PERFORM set_config('teste.saltados', current_setting('teste.saltados') || 'auditoria do fornecedor criado (sem registo em entity_audit_log); ', true);
  ELSE
    SELECT string_agg(DISTINCT coalesce(source, '(nulo)'), ', ') INTO v_src FROM entity_audit_log
    WHERE record_id = v_novo AND table_name = 'suppliers' AND source IS DISTINCT FROM 'fn:cat_ligar_fornecedor_produto';
    IF v_src IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: auditoria do fornecedor com source %', v_src; END IF;
  END IF;

  -- 4. o outro NIF
  IF (SELECT tax_id FROM suppliers WHERE id = v_outro) IS DISTINCT FROM current_setting('teste.nif_b') THEN
    RAISE EXCEPTION 'FALHOU: NIF do fornecedor novo não gravado';
  END IF;
  IF (SELECT tax_id FROM suppliers WHERE id = v_ex) IS DISTINCT FROM
     left(current_setting('teste.nif'), 3) || ' ' || substr(current_setting('teste.nif'), 4, 3) || ' ' || substr(current_setting('teste.nif'), 7, 3) THEN
    RAISE EXCEPTION 'FALHOU: o fornecedor reutilizado foi alterado';
  END IF;

  -- 5. consumível sem custo
  SELECT * INTO i FROM item_suppliers WHERE product_id = v_p2 AND supplier_id = v_novo AND deleted_at IS NULL;
  IF i.purchase_price IS NOT NULL OR i.preco_data IS NOT NULL OR NOT i.is_preferred OR i.item_type IS DISTINCT FROM 'product' THEN
    RAISE EXCEPTION 'FALHOU: ligação do consumível sem custo → %', to_jsonb(i);
  END IF;
  IF (SELECT purchase_price FROM item_suppliers WHERE product_id = v_p3 AND supplier_id = v_ex AND deleted_at IS NULL) IS DISTINCT FROM 7.00 THEN
    RAISE EXCEPTION 'FALHOU: custo de P3 na ligação';
  END IF;

  -- 6. supplier_id pelo gatilho e fornecedor_livre = o último escolhido
  IF (SELECT supplier_id FROM products WHERE id = v_p1) IS DISTINCT FROM v_ex
     OR (SELECT supplier_id FROM products WHERE id = v_p2) IS DISTINCT FROM v_novo
     OR (SELECT supplier_id FROM products WHERE id = v_p3) IS DISTINCT FROM v_ex THEN
    RAISE EXCEPTION 'FALHOU: products.supplier_id não é o preferido';
  END IF;
  IF (SELECT fornecedor_livre FROM products WHERE id = v_p1) IS DISTINCT FROM 'Forn Ção Teste T' || v_suf
     OR (SELECT fornecedor_livre FROM products WHERE id = v_p2) IS DISTINCT FROM current_setting('teste.nome_longo')
     OR (SELECT fornecedor_livre FROM products WHERE id = v_p3) IS DISTINCT FROM 'aaa forn existente t' || v_suf THEN
    RAISE EXCEPTION 'FALHOU: products.fornecedor_livre → % / % / %',
      (SELECT fornecedor_livre FROM products WHERE id = v_p1), left((SELECT fornecedor_livre FROM products WHERE id = v_p2), 30),
      (SELECT fornecedor_livre FROM products WHERE id = v_p3);
  END IF;
  IF (SELECT count(*) FROM item_suppliers WHERE product_id IN (v_p1, v_p2, v_p3) AND deleted_at IS NULL AND is_preferred) <> 3 THEN
    RAISE EXCEPTION 'FALHOU: não há exatamente um preferido por produto de teste';
  END IF;
END $t$;

-- ─── 7. Recusas por permissão ────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims_sem'), true);
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
  BEGIN PERFORM public.cat_ligar_fornecedor_produto(current_setting('teste.org')::uuid, current_setting('teste.p1')::uuid,
                                                    current_setting('teste.f_ex')::uuid);
    RAISE EXCEPTION 'FALHOU: ligar sem products.edit aceite';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL; END;
END $t$;
RESET ROLE;

SELECT set_config('request.jwt.claims', current_setting('teste.claims_red'), true);
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
  BEGIN PERFORM public.cat_ler_fornecedores(current_setting('teste.org')::uuid);
    RAISE EXCEPTION 'FALHOU: ler sem products.edit nem services.view aceite';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL; END;
END $t$;
RESET ROLE;

SELECT set_config('request.jwt.claims', current_setting('teste.claims_semc'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb; v_msg text;
BEGIN
  IF current_setting('teste.tem_semc')::boolean THEN
    r := public.cat_ler_fornecedores(current_setting('teste.org')::uuid);
    IF (r -> 'pode_criar') IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'FALHOU: pode_criar sem suppliers.create → %', r -> 'pode_criar'; END IF;
    BEGIN PERFORM public.cat_ligar_fornecedor_produto(current_setting('teste.org')::uuid, current_setting('teste.p3')::uuid,
                                                      p_novo_nome := 'Sem Criar T' || current_setting('teste.suf'));
      RAISE EXCEPTION 'FALHOU: criar fornecedor sem suppliers.create aceite';
    EXCEPTION WHEN SQLSTATE 'CT001' THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
      IF v_msg IS DISTINCT FROM 'Sem permissão para criar fornecedores.' THEN RAISE EXCEPTION 'FALHOU: mensagem sem suppliers.create — %', v_msg; END IF;
    END;
    -- ligar um existente não precisa de suppliers.create
    r := public.cat_ligar_fornecedor_produto(current_setting('teste.org')::uuid, current_setting('teste.p3')::uuid,
                                             current_setting('teste.f_novo')::uuid);
    IF (r #> '{ligacao,criada}') IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'FALHOU: ligar existente sem suppliers.create → %', r; END IF;
  END IF;
END $t$;
RESET ROLE;

SELECT set_config('request.jwt.claims', current_setting('teste.claims_leit'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb;
BEGIN
  IF current_setting('teste.tem_leit')::boolean THEN
    r := public.cat_ler_fornecedores(current_setting('teste.org')::uuid);
    IF jsonb_typeof(r -> 'fornecedores') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'FALHOU: leitor não leu a lista'; END IF;
    BEGIN PERFORM public.cat_ligar_fornecedor_produto(current_setting('teste.org')::uuid, current_setting('teste.p1')::uuid,
                                                      current_setting('teste.f_ex')::uuid);
      RAISE EXCEPTION 'FALHOU: leitor (só services.view) ligou';
    EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL; END;
  END IF;
END $t$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

SELECT set_config('request.jwt.claims', current_setting('teste.claims_semv'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb; v_el jsonb;
BEGIN
  IF current_setting('teste.tem_semv')::boolean THEN
    r := public.cat_ler_fornecedores(current_setting('teste.org')::uuid);
    SELECT e INTO v_el FROM jsonb_array_elements(r -> 'fornecedores') e WHERE e ->> 'id' = current_setting('teste.f_ex');
    IF v_el IS NULL OR v_el ->> 'nome' IS NULL THEN RAISE EXCEPTION 'FALHOU: sem suppliers.view não vê o nome → %', v_el; END IF;
    IF (v_el -> 'nif') IS DISTINCT FROM 'null'::jsonb OR (v_el -> 'email') IS DISTINCT FROM 'null'::jsonb THEN
      RAISE EXCEPTION 'FALHOU: sem suppliers.view viu nif/email → %', v_el;
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(r -> 'fornecedores') e
               WHERE (e -> 'nif') IS DISTINCT FROM 'null'::jsonb OR (e -> 'email') IS DISTINCT FROM 'null'::jsonb) THEN
      RAISE EXCEPTION 'FALHOU: sem suppliers.view há nif/email na lista';
    END IF;
  END IF;
END $t$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

-- ─── 8. Acessos e search_path ────────────────────────────────────────────────
DO $t$
DECLARE v_sig text; v_oid oid;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY['public.cat_ler_fornecedores(uuid)', 'public.cat_ligar_fornecedor_produto(uuid,uuid,uuid,text,text,text)'] LOOP
    v_oid := to_regprocedure(v_sig)::oid;
    IF v_oid IS NULL THEN RAISE EXCEPTION 'FALHOU: falta a função %', v_sig; END IF;
    IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN RAISE EXCEPTION 'FALHOU: anon pode executar %', v_sig; END IF;
    IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') OR NOT has_function_privilege('service_role', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'FALHOU: authenticated/service_role não pode executar %', v_sig;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc pr, aclexplode(pr.proacl) x WHERE pr.oid = v_oid AND x.grantee = 0 AND x.privilege_type::text = 'EXECUTE')
       OR (SELECT pr.proacl FROM pg_proc pr WHERE pr.oid = v_oid) IS NULL THEN
      RAISE EXCEPTION 'FALHOU: PUBLIC pode executar %', v_sig;
    END IF;
    IF NOT (SELECT pr.prosecdef FROM pg_proc pr WHERE pr.oid = v_oid) THEN RAISE EXCEPTION 'FALHOU: % não é SECURITY DEFINER', v_sig; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc pr, unnest(pr.proconfig) cfg WHERE pr.oid = v_oid AND cfg = 'search_path=public, pg_temp') THEN
      RAISE EXCEPTION 'FALHOU: % sem search_path = public, pg_temp', v_sig;
    END IF;
  END LOOP;
END $t$;

SELECT 'OK: ler (vivos da nike, sem apagado nem global, contagem, ordem = ORDER BY do SQL, truncado false, campos, nif/email só com suppliers.view, pode_criar), ligar existente (preferido, custo 12,35, moeda, preco_data, sku, created_by; sem duplicar), criar (nome limpo, email, auditoria e audit_source reposto, não preferido), reutilizar por nome e por NIF, outro NIF cria, apagado não reutilizado, 200 caracteres, consumível sem custo, supplier_id pelo gatilho, fornecedor_livre, recusas (CT002 x9 + desativado escolhido e por nome, CT003 x3-5, CT001 sem products.edit / reduzido / BM24 / org nula / sem suppliers.create / leitor), acessos e search_path. Saltado: '
       || coalesce(nullif(current_setting('teste.saltados', true), ''), 'nada') AS resultado;

ROLLBACK;
