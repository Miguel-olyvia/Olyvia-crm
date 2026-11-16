-- =============================================================================
-- Catálogo — o formulário de criar produto/consumível passa a ESCOLHER um fornecedor real (com pesquisa) ou a
-- CRIAR um novo, e liga-o ao produto. Base de RH (uetjghdkwbywbftedtth).
-- =============================================================================
--
-- Hoje o formulário só grava texto livre (products.fornecedor_livre, cat_guardar_produto_texto). Passa a haver:
--
--   1. cat_ler_fornecedores(p_org) → {fornecedores:[{id,nome,nif,email,ativo}], pode_criar}
--      Os fornecedores da organização, não apagados, por nome (sem acentos/maiúsculas). nif = tax_id (ou vat_number).
--      Permissão: products.edit OU services.view (quem preenche o formulário do Catálogo). NOTA: dá nome, NIF e email
--      dos fornecedores a quem não tem suppliers.view — é a lista de que o formulário precisa para escolher.
--      pode_criar = tem suppliers.create na organização (o formulário mostra ou esconde «Criar novo»).
--      nif e email só para quem tem suppliers.view na organização; os outros recebem null (o nome fica, para o seletor).
--      No máximo 2000 linhas (as primeiras por nome); "truncado": true se houver mais.
--
--   2. cat_ligar_fornecedor_produto(p_org, p_produto, p_fornecedor DEFAULT NULL, p_novo_nome DEFAULT NULL,
--                                   p_nif DEFAULT NULL, p_email DEFAULT NULL)
--      → {fornecedor:{id,nome,ativo,criado,reutilizado}, ligacao:{id,preferido,criada}}
--      Permissão products.edit; exatamente um de p_fornecedor / p_novo_nome (CT002). NIF e email só com p_novo_nome
--      (com p_fornecedor: CT002, em vez de os ignorar em silêncio).
--      • p_fornecedor: da organização e não apagado (CT003); desativado (is_active false) → CT002 «Fornecedor desativado.».
--        O mesmo vale para um fornecedor desativado encontrado pela reutilização por NIF/nome.
--      • Teto: no máximo 5000 fornecedores vivos por organização; criar acima disso → CT002.
--      • p_novo_nome: exige TAMBÉM suppliers.create (CT001 «Sem permissão para criar fornecedores.»). Nome limpo
--        (fn_cat_limpar_nome), 1 a 200 caracteres. NIF: espaços tirados, maiúsculas, só letras e algarismos, até 20.
--        Email: formato simples, até 254. Sob pg_advisory_xact_lock('cat_fornecedores:'||org), REUTILIZA (sem escrever
--        no fornecedor) um fornecedor não apagado da organização:
--          a) com o mesmo NIF (tax_id ou vat_number, comparados só por letras e algarismos, em maiúsculas);
--          b) senão, com o mesmo nome normalizado (fn_cat_chave_opcao: sem acentos, minúsculas, espaços colapsados) —
--             mas, se veio NIF, só um fornecedor SEM NIF (o mesmo nome com outro NIF é outra empresa: cria-se);
--        senão CRIA {organization_id, name, tax_id, email, is_active true, created_by} — o insert do ecrã de
--        Fornecedores (Suppliers.tsx) mais NIF e email. Um fornecedor reutilizado NÃO recebe o NIF/email escritos.
--      • O produto: da organização, vivo, tipo_catalogo produto ou consumível (CT003). Linha bloqueada.
--      • A ligação em item_suppliers como 20270101270000_catalogo_fornecedores_reais: item_type 'product' (também para
--        consumíveis), uom_id NULL, supplier_sku = products.sku, purchase_price = custo ATUAL do produto (linha purchase
--        mais recente, coalesce(preco_exato, price) a 2 casas) na moeda dessa linha, preco_data = hoje se houver custo,
--        is_active, created_by. is_preferred = true só se o produto ainda não tiver preferido (o gatilho existente
--        fn_item_suppliers_sync_preferred acerta products.supplier_id — esta função não o escreve). Se já existe uma
--        ligação não apagada a esse fornecedor (qualquer unidade), devolve-a sem a duplicar nem a alterar.
--        Uma corrida com outra escrita direta em item_suppliers (índices únicos): CT004.
--      • products.fornecedor_livre = nome do fornecedor escolhido (compatibilidade com o ecrã atual, como
--        cat_guardar_produto_texto). Nota: se o produto já tinha outro preferido, fica o texto deste e o
--        products.supplier_id do preferido.
--      Auditoria: app.audit_source = 'fn:cat_ligar_fornecedor_produto' durante a função, reposto no fim.
--
-- Sem tabelas, colunas, índices nem dados novos; nenhuma função existente é alterada.
-- Erros: CT001 sem permissão; CT002 dados inválidos; CT003 não encontrado; CT004 conflito de escrita.
-- Teste: supabase/tests/catalogo_fornecedor_produto.test.sql (BEGIN … ROLLBACK, só na nike).
-- ATENÇÃO antes do db push: `supabase db push` aplica TUDO o que estiver pendente;
-- listar com `supabase migration list --linked` imediatamente antes.
-- =============================================================================

-- ─── 0. Guardas ─────────────────────────────────────────────────────────────────
DO $g$
DECLARE v_falta text;
BEGIN
  SELECT string_agg(s, ', ') INTO v_falta
  FROM unnest(ARRAY['public.fn_cat_exigir(uuid,text)', 'public.fn_cat_exigir_uma(uuid,text[])', 'public.fn_cat_pode(uuid,text)',
                    'public.fn_cat_limpar_nome(text)', 'public.fn_cat_chave_opcao(text)', 'public.current_business_user_id()',
                    'public.fn_item_suppliers_sync_preferred()']) s
  WHERE to_regprocedure(s) IS NULL;
  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'Faltam funções (%): aplicar antes 20270117500000 e as do Catálogo.', v_falta;
  END IF;

  SELECT string_agg(x.t || '.' || x.c, ', ') INTO v_falta
  FROM (VALUES ('suppliers', 'tax_id'), ('suppliers', 'vat_number'), ('suppliers', 'email'), ('suppliers', 'deleted_at'),
               ('suppliers', 'created_by'), ('item_suppliers', 'preco_data'), ('item_suppliers', 'supplier_sku'),
               ('products', 'fornecedor_livre'), ('products', 'tipo_catalogo'), ('product_prices', 'preco_exato'),
               ('product_prices', 'valid_from'), ('product_prices', 'price_type'), ('product_prices', 'currency')) AS x(t, c)
  WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns ic
                    WHERE ic.table_schema = 'public' AND ic.table_name::text = x.t AND ic.column_name::text = x.c);
  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'Faltam colunas: %. Rever esta migration.', v_falta;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger t
                 WHERE NOT t.tgisinternal AND t.tgname::text = 'trg_item_suppliers_sync_preferred'
                   AND t.tgrelid = to_regclass('public.item_suppliers')) THEN
    RAISE EXCEPTION 'Falta o gatilho trg_item_suppliers_sync_preferred (acerta products.supplier_id). Rever esta migration.';
  END IF;

  -- nenhuma outra versão (outra assinatura) das funções novas
  SELECT string_agg(p.proname::text || '(' || pg_get_function_identity_arguments(p.oid)::text || ')', ', ') INTO v_falta
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND ((p.proname = 'cat_ler_fornecedores' AND pg_get_function_identity_arguments(p.oid) <> 'p_org uuid')
      OR (p.proname = 'cat_ligar_fornecedor_produto' AND pg_get_function_identity_arguments(p.oid)
            <> 'p_org uuid, p_produto uuid, p_fornecedor uuid, p_novo_nome text, p_nif text, p_email text'));
  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'Já existe outra versão destas funções: %. Rever esta migration.', v_falta;
  END IF;
END $g$;

-- ─── 1. Ler os fornecedores da organização ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cat_ler_fornecedores(p_org uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  c_max_linhas constant integer := 2000;
  v_ver boolean; v_lista jsonb; v_truncado boolean;
BEGIN
  PERFORM public.fn_cat_exigir_uma(p_org, ARRAY['products.edit', 'services.view']);
  -- NIF e email só para quem pode ver a ficha do fornecedor
  v_ver := public.fn_cat_pode(p_org, 'suppliers.view');
  SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id', x.id, 'nome', x.name,
             'nif', (CASE WHEN v_ver THEN coalesce(nullif(btrim(x.tax_id), ''), nullif(btrim(x.vat_number), '')) END),
             'email', (CASE WHEN v_ver THEN nullif(btrim(x.email), '') END),
             'ativo', coalesce(x.is_active, true))
           ORDER BY x.n) FILTER (WHERE x.n <= c_max_linhas), '[]'::jsonb),
         count(*) > c_max_linhas
    INTO v_lista, v_truncado
  FROM (SELECT s.id, s.name, s.tax_id, s.vat_number, s.email, s.is_active,
               row_number() OVER (ORDER BY public.fn_cat_chave_opcao(s.name), s.name, s.id) AS n
        FROM suppliers s
        WHERE s.organization_id = p_org AND s.deleted_at IS NULL
        ORDER BY n
        LIMIT c_max_linhas + 1) x;
  RETURN jsonb_build_object('fornecedores', v_lista, 'truncado', coalesce(v_truncado, false),
                            'pode_criar', public.fn_cat_pode(p_org, 'suppliers.create'));
END $$;
REVOKE ALL ON FUNCTION public.cat_ler_fornecedores(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_ler_fornecedores(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_ler_fornecedores(uuid) IS
  'Catálogo (20270118250000): os fornecedores da organização, não apagados, por nome (até 2000) — {fornecedores:[{id,nome,nif,email,ativo}], truncado, pode_criar}. nif/email só com suppliers.view (senão null). pode_criar = suppliers.create. Permissão products.edit ou services.view.';

-- ─── 2. Ligar (ou criar e ligar) um fornecedor a um produto ─────────────────────
CREATE OR REPLACE FUNCTION public.cat_ligar_fornecedor_produto(
  p_org uuid, p_produto uuid, p_fornecedor uuid DEFAULT NULL, p_novo_nome text DEFAULT NULL,
  p_nif text DEFAULT NULL, p_email text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := public.fn_cat_exigir(p_org, 'products.edit');
  c_max_nome constant integer := 200;
  c_max_nif constant integer := 20;
  c_max_email constant integer := 254;
  c_max_entrada constant integer := 1000;
  c_max_fornecedores constant integer := 5000;
  v_fonte text; v_ok boolean; v_sku text;
  v_nome text; v_nif text; v_email text; v_chave text;
  v_sup uuid; v_sup_nome text; v_sup_ativo boolean; v_criado boolean := false; v_reutilizado boolean := false;
  v_lig uuid; v_pref boolean; v_lig_criada boolean := false;
  v_preco_id uuid; v_preco numeric; v_moeda text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Utilizador sem ficha nesta organização.' USING ERRCODE = 'CT001';
  END IF;

  -- a forma do pedido: um fornecedor existente OU um nome novo
  IF (p_fornecedor IS NULL) = (p_novo_nome IS NULL) THEN
    RAISE EXCEPTION 'Escolha um fornecedor existente ou escreva o nome de um novo (só um dos dois).' USING ERRCODE = 'CT002';
  END IF;
  IF p_fornecedor IS NOT NULL AND (nullif(btrim(p_nif), '') IS NOT NULL OR nullif(btrim(p_email), '') IS NOT NULL) THEN
    RAISE EXCEPTION 'O NIF e o email só se indicam ao criar um fornecedor novo.' USING ERRCODE = 'CT002';
  END IF;

  IF p_novo_nome IS NOT NULL THEN
    IF NOT public.fn_cat_pode(p_org, 'suppliers.create') THEN
      RAISE EXCEPTION 'Sem permissão para criar fornecedores.' USING ERRCODE = 'CT001';
    END IF;

    IF length(p_novo_nome) > c_max_entrada THEN
      RAISE EXCEPTION 'O nome do fornecedor tem no máximo 200 caracteres.' USING ERRCODE = 'CT002';
    END IF;
    v_nome := public.fn_cat_limpar_nome(p_novo_nome);
    IF v_nome = '' THEN RAISE EXCEPTION 'Escreva o nome do fornecedor.' USING ERRCODE = 'CT002'; END IF;
    IF length(v_nome) > c_max_nome THEN
      RAISE EXCEPTION 'O nome do fornecedor tem no máximo 200 caracteres.' USING ERRCODE = 'CT002';
    END IF;

    IF length(p_nif) > c_max_entrada THEN
      RAISE EXCEPTION 'O NIF só pode ter letras e algarismos (no máximo 20).' USING ERRCODE = 'CT002';
    END IF;
    v_nif := nullif(upper(replace(public.fn_cat_limpar_nome(p_nif), ' ', '')), '');
    IF v_nif IS NOT NULL AND (length(v_nif) > c_max_nif OR v_nif !~ '^[A-Z0-9]+$') THEN
      RAISE EXCEPTION 'O NIF só pode ter letras e algarismos (no máximo 20).' USING ERRCODE = 'CT002';
    END IF;

    IF length(p_email) > c_max_entrada THEN
      RAISE EXCEPTION 'O email não é válido.' USING ERRCODE = 'CT002';
    END IF;
    v_email := nullif(public.fn_cat_limpar_nome(p_email), '');
    IF v_email IS NOT NULL AND (length(v_email) > c_max_email OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') THEN
      RAISE EXCEPTION 'O email não é válido.' USING ERRCODE = 'CT002';
    END IF;

    v_chave := public.fn_cat_chave_opcao(v_nome);
  END IF;

  v_fonte := current_setting('app.audit_source', true);
  PERFORM set_config('app.audit_source', 'fn:cat_ligar_fornecedor_produto', true);

  -- um de cada vez por organização (a reutilização por nome/NIF não pode correr ao mesmo tempo), e só depois as linhas
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_fornecedores:' || p_org::text, 0));

  SELECT true, p.sku INTO v_ok, v_sku FROM products p
  WHERE p.id = p_produto AND p.organization_id = p_org AND NOT p.is_deleted AND p.deleted_at IS NULL
    AND p.tipo_catalogo IN ('produto', 'consumivel')
  FOR NO KEY UPDATE;
  IF NOT coalesce(v_ok, false) THEN RAISE EXCEPTION 'Produto não encontrado.' USING ERRCODE = 'CT003'; END IF;

  IF p_fornecedor IS NOT NULL THEN
    SELECT s.id, s.name, coalesce(s.is_active, true) INTO v_sup, v_sup_nome, v_sup_ativo
    FROM suppliers s
    WHERE s.id = p_fornecedor AND s.organization_id = p_org AND s.deleted_at IS NULL
    FOR KEY SHARE;
    IF v_sup IS NULL THEN RAISE EXCEPTION 'Fornecedor não encontrado.' USING ERRCODE = 'CT003'; END IF;
    IF NOT v_sup_ativo THEN RAISE EXCEPTION 'Fornecedor desativado.' USING ERRCODE = 'CT002'; END IF;
  ELSE
    -- a) o mesmo NIF
    IF v_nif IS NOT NULL THEN
      SELECT s.id, s.name, coalesce(s.is_active, true) INTO v_sup, v_sup_nome, v_sup_ativo
      FROM suppliers s
      WHERE s.organization_id = p_org AND s.deleted_at IS NULL
        AND (upper(regexp_replace(coalesce(s.tax_id, ''), '[^A-Za-z0-9]', '', 'g')) = v_nif
          OR upper(regexp_replace(coalesce(s.vat_number, ''), '[^A-Za-z0-9]', '', 'g')) = v_nif)
      ORDER BY s.created_at, s.id
      LIMIT 1
      FOR KEY SHARE;
    END IF;
    -- b) o mesmo nome (com NIF escrito, só um fornecedor sem NIF)
    IF v_sup IS NULL THEN
      SELECT s.id, s.name, coalesce(s.is_active, true) INTO v_sup, v_sup_nome, v_sup_ativo
      FROM suppliers s
      WHERE s.organization_id = p_org AND s.deleted_at IS NULL AND public.fn_cat_chave_opcao(s.name) = v_chave
        AND (v_nif IS NULL
          OR (regexp_replace(coalesce(s.tax_id, ''), '[^A-Za-z0-9]', '', 'g') = ''
              AND regexp_replace(coalesce(s.vat_number, ''), '[^A-Za-z0-9]', '', 'g') = ''))
      ORDER BY s.created_at, s.id
      LIMIT 1
      FOR KEY SHARE;
    END IF;

    IF v_sup IS NOT NULL THEN
      IF NOT v_sup_ativo THEN RAISE EXCEPTION 'Fornecedor desativado.' USING ERRCODE = 'CT002'; END IF;
      v_reutilizado := true;
    ELSE
      IF (SELECT count(*) FROM suppliers s WHERE s.organization_id = p_org AND s.deleted_at IS NULL) >= c_max_fornecedores THEN
        RAISE EXCEPTION 'A organização já tem o máximo de 5000 fornecedores.' USING ERRCODE = 'CT002';
      END IF;
      INSERT INTO suppliers (organization_id, name, tax_id, email, is_active, created_by)
      VALUES (p_org, v_nome, v_nif, v_email, true, v_user)
      RETURNING id, name, coalesce(is_active, true) INTO v_sup, v_sup_nome, v_sup_ativo;
      v_criado := true;
    END IF;
  END IF;

  -- a ligação: a que já existe (qualquer unidade), ou uma nova com o custo atual do produto
  SELECT i.id, i.is_preferred INTO v_lig, v_pref
  FROM item_suppliers i
  WHERE i.product_id = p_produto AND i.supplier_id = v_sup AND i.deleted_at IS NULL
  ORDER BY i.is_preferred DESC, i.created_at, i.id
  LIMIT 1;

  IF v_lig IS NULL THEN
    v_pref := NOT EXISTS (SELECT 1 FROM item_suppliers x
                          WHERE x.product_id = p_produto AND x.is_preferred AND x.deleted_at IS NULL);
    SELECT r.id, round(coalesce(r.preco_exato, r.price), 2), r.currency::text INTO v_preco_id, v_preco, v_moeda
    FROM product_prices r
    WHERE r.product_id = p_produto AND r.price_type = 'purchase'
    ORDER BY r.valid_from DESC NULLS LAST, r.created_at DESC
    LIMIT 1;

    BEGIN
      INSERT INTO item_suppliers (organization_id, item_type, product_id, supplier_id, uom_id, supplier_sku, purchase_price,
                                  currency, is_preferred, is_active, created_by, preco_data)
      VALUES (p_org, 'product', p_produto, v_sup, NULL, v_sku, v_preco, coalesce(v_moeda, 'EUR'), v_pref, true, v_user,
              (CASE WHEN v_preco_id IS NOT NULL THEN current_date END))
      RETURNING id INTO v_lig;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'Os fornecedores deste produto foram alterados entretanto. Tente de novo.' USING ERRCODE = 'CT004';
    END;
    v_lig_criada := true;
  END IF;

  -- o texto que o ecrã atual mostra
  UPDATE products p SET fornecedor_livre = public.fn_cat_limpar_nome(v_sup_nome), updated_at = now()
  WHERE p.id = p_produto AND p.fornecedor_livre IS DISTINCT FROM public.fn_cat_limpar_nome(v_sup_nome);

  PERFORM set_config('app.audit_source', coalesce(v_fonte, ''), true);

  RETURN jsonb_build_object(
    'fornecedor', jsonb_build_object('id', v_sup, 'nome', v_sup_nome, 'ativo', v_sup_ativo,
                                     'criado', v_criado, 'reutilizado', v_reutilizado),
    'ligacao', jsonb_build_object('id', v_lig, 'preferido', v_pref, 'criada', v_lig_criada));
END $$;
REVOKE ALL ON FUNCTION public.cat_ligar_fornecedor_produto(uuid,uuid,uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_ligar_fornecedor_produto(uuid,uuid,uuid,text,text,text) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_ligar_fornecedor_produto(uuid,uuid,uuid,text,text,text) IS
  'Catálogo (20270118250000): liga um fornecedor da organização (p_fornecedor) ou um novo (p_novo_nome, com NIF e email opcionais; reutiliza o de mesmo NIF ou mesmo nome normalizado; exige suppliers.create) a um produto/consumível: item_suppliers com o custo atual, preferido se o produto não tinha, sem duplicar; grava products.fornecedor_livre. Permissão products.edit. CT001/CT002/CT003/CT004.';

-- ─── 3. Conferir ────────────────────────────────────────────────────────────────
DO $c$
DECLARE
  c_sp constant text := 'search_path=public, pg_temp';
  v_sig text; v_oid oid; p record;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY['public.cat_ler_fornecedores(uuid)',
                                'public.cat_ligar_fornecedor_produto(uuid,uuid,uuid,text,text,text)'] LOOP
    v_oid := to_regprocedure(v_sig)::oid;
    IF v_oid IS NULL THEN RAISE EXCEPTION 'Conferir: falta a função %.', v_sig; END IF;
    SELECT pr.proconfig, pr.proacl, pr.prosecdef INTO p FROM pg_proc pr WHERE pr.oid = v_oid;
    IF NOT p.prosecdef THEN RAISE EXCEPTION 'Conferir: % não é SECURITY DEFINER.', v_sig; END IF;
    IF p.proconfig IS NULL OR NOT (c_sp = ANY (p.proconfig)) THEN
      RAISE EXCEPTION 'Conferir: % sem search_path = public, pg_temp.', v_sig;
    END IF;
    IF p.proacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) x WHERE x.grantee = 0 AND x.privilege_type::text = 'EXECUTE')
       OR has_function_privilege('anon', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'Conferir: % pode ser executada por anon/PUBLIC.', v_sig;
    END IF;
    IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') OR NOT has_function_privilege('service_role', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'Conferir: % sem EXECUTE para authenticated/service_role.', v_sig;
    END IF;
  END LOOP;

  IF (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_ler_fornecedores(uuid)')::oid)
       NOT LIKE '%c_max_linhas constant integer := 2000;%suppliers.view%' THEN
    RAISE EXCEPTION 'Conferir: cat_ler_fornecedores sem o teto de 2000 ou sem a guarda de suppliers.view.';
  END IF;
  IF (SELECT pr.provolatile::text FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_ler_fornecedores(uuid)')::oid) <> 's' THEN
    RAISE EXCEPTION 'Conferir: cat_ler_fornecedores não é STABLE.';
  END IF;
  IF (SELECT pr.provolatile::text FROM pg_proc pr
      WHERE pr.oid = to_regprocedure('public.cat_ligar_fornecedor_produto(uuid,uuid,uuid,text,text,text)')::oid) <> 'v' THEN
    RAISE EXCEPTION 'Conferir: cat_ligar_fornecedor_produto não é VOLATILE.';
  END IF;

  -- os tetos estão no corpo (âncoras)
  IF (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_ligar_fornecedor_produto(uuid,uuid,uuid,text,text,text)')::oid)
       NOT LIKE '%c_max_nome constant integer := 200;%c_max_nif constant integer := 20;%c_max_email constant integer := 254;%c_max_fornecedores constant integer := 5000;%' THEN
    RAISE EXCEPTION 'Conferir: faltam os tetos no corpo (nome 200, NIF 20, email 254, 5000 fornecedores).';
  END IF;
  RAISE NOTICE 'catalogo_fornecedor_produto: cat_ler_fornecedores e cat_ligar_fornecedor_produto criadas e conferidas.';
END $c$;
