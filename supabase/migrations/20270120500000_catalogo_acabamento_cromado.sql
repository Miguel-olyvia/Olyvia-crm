-- =============================================================================
-- Catálogo — COR ≠ ACABAMENTO nos produtos da MUDELAR já importados: «Cromo» deixa de ser uma Cor e passa a
-- Acabamento «Cromado»; «ROSA GOLD ESCOVADO» separa-se em Cor «Rosa Gold» + Acabamento «Escovado».
-- Base de RH (uetjghdkwbywbftedtth). Não cria nem apaga produtos; não mexe em nomes, preços, modelos nem categorias.
-- =============================================================================
--
-- Regra do utilizador (17/11): a Cor é o que se vê (Preto, Branco, Dourado, Níquel, Titânio, Gun Metal, Cobre,
-- Rosa Gold…); o Acabamento é o tratamento da superfície (Cromado, Escovado, Mate, PVD). Usa-se o atributo de lista
-- «Acabamento» que já existe (código acabamento, com Transparente e Frost Plus) e acrescentam-se-lhe as opções
-- Cromado, Escovado, Mate e PVD (procuradas pelo nome primeiro: a importação das Torneiras, 20270120600000, faz o
-- mesmo, e qualquer uma pode correr primeiro).
--
-- O que muda (lido no remoto a 17/11, só leitura):
--   * Produtos com Cor «CROMO» (opção CRO) e SEM Acabamento: 796 — Acessórios de Casa de Banho 22 (Auxiliares 1,
--     Cabides 2, Cestos 1, Pega De Segurança 1, Piaçaba 2, Porta-rolos 2, Toalheiros 13), Duche & Banho 772
--     (Chuveiro Higiénico 3, Colunas Duche 15, Resguardos de Duche 754), Loiças Sanitárias › Kit´s para Sanitários 2.
--     Perdem a Cor e ganham Acabamento = Cromado.
--   * O produto com Cor «ROSA GOLD ESCOVADO» (Chuveiro Higiénico WATER BLISS): Cor «Rosa Gold» (a opção que já existe,
--     RG) + Acabamento = Escovado.
--   * O SKU dos 797 gera-se de novo pela regra do Catálogo (fn_cat_sku_partes + o número do modelo, como
--     cat_gerar_sku_produto): sai o segmento da Cor e entra o do Acabamento no fim (sku_ordem 16),
--     ex. DB-RD-0131-CRO-90 → DB-RD-0131-90-CRD. Nenhum pode repetir outro produto da Mudelar (vivo ou apagado) nem
--     ficar provisório; se colidir, PARA (RAISE) e diz quais.
--   * As ligações a fornecedor cujo supplier_sku é o SKU antigo do próprio produto (41, as que não tinham código de
--     fornecedor) passam ao SKU novo; quem tem código de fornecedor real não muda.
--
-- O que NÃO muda (decisões desta migration, a confirmar pelo utilizador):
--   * Os 227 Resguardos de Duche com Cor CROMO e Acabamento «Frost Plus» ficam COMO ESTÃO: um produto só pode ter
--     um valor por atributo (UNIQUE product_id, attribute_id) e o Frost Plus (o vidro) já ocupa o Acabamento. Pôr
--     Cromado nesses apagaria o Frost Plus. Fica por decidir (ver o relatório).
--   * Escovado/Mate que já estão num atributo à parte («Tonalidade») — Acessórios WC (Dourado + ESCOVADO, Branco +
--     MATE, …), Loiças e Móveis — não se mexem: não estão colados à Cor.
--   * As opções de Cor «CROMO» e «ROSA GOLD ESCOVADO» não se apagam (CROMO continua nos 227 de cima).
--   * Siglas novas do Acabamento: Cromado CRD, Escovado ESC, Mate MAT, PVD PVD — escolhidas para não repetirem
--     siglas da Cor (CR = CREMA, ES = ESQUISTO, MT = Moka - T016) e o SKU não ficar ambíguo; se a sigla já estiver
--     ocupada no grupo do Acabamento, usa-se a sugestão livre e o NOTICE diz qual.
--
-- Escritas em massa com app.audit_bypass = 'on' e UMA linha consolidada na auditoria (fn_manual_audit_log); as opções
-- novas ficam auditadas normalmente. Fonte: app.audit_source = 'migration:catalogo_acabamento_cromado'.
--
-- GUARDA (inerte: RAISE NOTICE e sai sem escrever nada) se: a organização 3242e925-… não existir com o nome 'Mudelar';
-- faltar a versão dos modelos (20270118300000); ou já estiver aplicada (nenhum produto com Cor CROMO/Cromado/ROSA GOLD
-- ESCOVADO sem Acabamento).
-- Falha (RAISE EXCEPTION, nada fica) se: o número de produtos a corrigir não for 797 (796 + 1) ou o dos que ficam
-- (Frost Plus) não for 227; faltar o atributo Cor ou Acabamento, a opção Rosa Gold, ou o membro para created_by;
-- uma opção estiver ambígua ou desativada; o SKU novo tiver faltas, repetir ou já for usado noutro produto.
--
-- Conferir no fim (conta o que está ERRADO e faz RAISE se não for 0): por subcategoria, quantos ficaram com Cromado e
-- sem Cor; nenhum produto vivo da Mudelar com Cor Cromo sem Acabamento; os 227 intactos; o WATER BLISS com Rosa Gold +
-- Escovado; os outros atributos dos 797 iguais a antes; SKUs únicos, no formato, iguais ao recalculado (todos) e a
-- cat_prever_sku_modelo (amostra); as 41 ligações com o SKU novo e nenhuma com o antigo; preços intactos; nada escrito
-- fora da Mudelar nem noutros produtos dela (xmin).
--
-- ORDEM: antes de 20270120600000 (torneiras), mas as duas são independentes. Teste:
-- supabase/tests/catalogo_acabamento_cromado.test.sql (BEGIN … ROLLBACK, só leitura; o passo 0 falha antes).
-- ATENÇÃO antes do db push: `supabase db push` aplica TUDO o que estiver pendente; listar com
-- `supabase migration list --linked` imediatamente antes.
-- =============================================================================

SET lock_timeout = '5s';
SET statement_timeout = '10min';

DO $mig$
DECLARE
  c_org          constant uuid    := '3242e925-da26-459a-8258-be04d904e355';
  c_fonte        constant text    := 'migration:catalogo_acabamento_cromado';
  c_total        constant integer := 797;
  c_n_cromo      constant integer := 796;
  c_n_rosa       constant integer := 1;
  c_n_ficam      constant integer := 227;
  c_n_forn_sku   constant integer := 41;
  c_amostra      constant integer := 40;
  c_rosa_nova    constant text    := 'Rosa Gold';
  v_n bigint; v_m bigint; v_k bigint; v_xid text; v_txt text; v_ativa boolean; v_opc uuid; v_criadas text := '';
  v_criador uuid; v_a_cor uuid; v_a_acab uuid; v_g_cor uuid; v_g_acab uuid;
  v_rosa uuid; v_rosa_valor text; v_rosa_sigla text;
  v_auth uuid; v_claims text; v_prev jsonb; v_attrs jsonb; r record;
BEGIN
  -- ─── 0. Guarda (inerte) ───────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM anew_organizations o WHERE o.id = c_org AND o.name = 'Mudelar' AND o.deleted_at IS NULL) THEN
    RAISE NOTICE 'catalogo_acabamento_cromado: a organização Mudelar (%) não existe nesta base — nada a fazer.', c_org;
    RETURN;
  END IF;
  IF to_regclass('public.product_models') IS NULL
     OR to_regprocedure('public.fn_cat_modelo_numero(uuid,uuid,uuid)') IS NULL
     OR to_regprocedure('public.cat_prever_sku_modelo(uuid,uuid,uuid,uuid,jsonb,uuid)') IS NULL THEN
    RAISE NOTICE 'catalogo_acabamento_cromado: falta a versão dos modelos (20270118300000) — nada a fazer.';
    RETURN;
  END IF;
  SELECT string_agg(s, ', ') INTO v_txt
  FROM unnest(ARRAY['public.fn_cat_chave_opcao(text)', 'public.fn_cat_grupo_do_atributo(uuid,uuid)',
                    'public.fn_cat_medida_ler(jsonb,text)', 'public.fn_cat_sku_partes(uuid,uuid,uuid,jsonb)',
                    'public.fn_cat_sigla_opcao_livre(uuid,text,uuid)', 'public.has_anew_permission_in_org(uuid,text,uuid)',
                    'public.fn_manual_audit_log(text,uuid,uuid,text,jsonb,text,uuid)']) s
  WHERE to_regprocedure(s) IS NULL;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'catalogo_acabamento_cromado: faltam funções do Catálogo (%).', v_txt; END IF;

  -- atributos Cor e Acabamento (de lista, a entrar no SKU, com grupo da Mudelar)
  SELECT count(*) FILTER (WHERE a.code::text = 'cor'), count(*) FILTER (WHERE a.code::text = 'acabamento'),
         (array_agg(a.id) FILTER (WHERE a.code::text = 'cor'))[1], (array_agg(a.id) FILTER (WHERE a.code::text = 'acabamento'))[1]
    INTO v_n, v_m, v_a_cor, v_a_acab
  FROM product_attributes a
  WHERE a.organization_id = c_org AND a.deleted_at IS NULL AND NOT a.is_measurement AND a.code::text IN ('cor', 'acabamento');
  IF v_n <> 1 OR v_m <> 1 THEN
    RAISE EXCEPTION 'catalogo_acabamento_cromado: a Mudelar tem de ter um atributo cor e um acabamento de lista (tem % e %).', v_n, v_m;
  END IF;
  IF NOT (SELECT coalesce(a.sku_entra, false) FROM product_attributes a WHERE a.id = v_a_acab) THEN
    RAISE EXCEPTION 'catalogo_acabamento_cromado: o Acabamento da Mudelar não entra no SKU.';
  END IF;
  v_g_cor := public.fn_cat_grupo_do_atributo(v_a_cor, c_org);
  v_g_acab := public.fn_cat_grupo_do_atributo(v_a_acab, c_org);
  IF NOT EXISTS (SELECT 1 FROM attribute_option_groups g WHERE g.id = v_g_cor AND g.organization_id = c_org)
     OR NOT EXISTS (SELECT 1 FROM attribute_option_groups g WHERE g.id = v_g_acab AND g.organization_id = c_org) THEN
    RAISE EXCEPTION 'catalogo_acabamento_cromado: os grupos de opções da Cor ou do Acabamento não são da Mudelar.';
  END IF;

  -- os produtos a corrigir: Cor Cromo/Cromado/ROSA GOLD ESCOVADO e SEM Acabamento
  DROP TABLE IF EXISTS pg_temp._acb, pg_temp._acb_ficam, pg_temp._acb_antes, pg_temp._acb_forn, pg_temp._acb_opc, pg_temp._acb_esperado,
                       pg_temp._acb_ja;
  CREATE TEMP TABLE _acb ON COMMIT DROP AS
  SELECT p.id, p.sku AS sku_antigo, p.category_id, p.subcategory_id, p.model_id, pv.value_text AS cor_antiga,
         (public.fn_cat_chave_opcao(pv.value_text) = 'rosa gold escovado') AS rosa,
         NULL::text AS sku_novo
  FROM products p
  JOIN product_attribute_values pv ON pv.product_id = p.id AND pv.attribute_id = v_a_cor
  WHERE p.organization_id = c_org AND NOT p.is_deleted
    AND public.fn_cat_chave_opcao(pv.value_text) IN ('cromo', 'cromado', 'rosa gold escovado')
    AND NOT EXISTS (SELECT 1 FROM product_attribute_values x WHERE x.product_id = p.id AND x.attribute_id = v_a_acab);
  SELECT count(*) FILTER (WHERE NOT b.rosa), count(*) FILTER (WHERE b.rosa) INTO v_n, v_m FROM _acb b;
  IF v_n + v_m = 0 THEN
    RAISE NOTICE 'catalogo_acabamento_cromado: nenhum produto com Cor Cromo sem Acabamento — já aplicada, nada a fazer.';
    RETURN;
  END IF;
  IF v_n <> c_n_cromo OR v_m <> c_n_rosa THEN
    RAISE EXCEPTION 'catalogo_acabamento_cromado: % produtos com Cor Cromo e % com ROSA GOLD ESCOVADO sem Acabamento (esperados % e %). Rever antes de aplicar.',
      v_n, v_m, c_n_cromo, c_n_rosa;
  END IF;
  -- os que ficam como estão (Cor Cromo + Frost Plus no Acabamento)
  CREATE TEMP TABLE _acb_ficam ON COMMIT DROP AS
  SELECT p.id, p.sku, pv.value_text AS cor, ac.value_text AS acab
  FROM products p
  JOIN product_attribute_values pv ON pv.product_id = p.id AND pv.attribute_id = v_a_cor
  JOIN product_attribute_values ac ON ac.product_id = p.id AND ac.attribute_id = v_a_acab
  WHERE p.organization_id = c_org AND NOT p.is_deleted
    AND public.fn_cat_chave_opcao(pv.value_text) IN ('cromo', 'cromado', 'rosa gold escovado');
  SELECT count(*) INTO v_n FROM _acb_ficam;
  IF v_n <> c_n_ficam THEN
    RAISE EXCEPTION 'catalogo_acabamento_cromado: % produtos com Cor Cromo e já com Acabamento (esperados %). Rever antes de aplicar.', v_n, c_n_ficam;
  END IF;

  -- o esperado por subcategoria (lido no remoto a 17/11)
  CREATE TEMP TABLE _acb_esperado (cat text NOT NULL, sub text NOT NULL, cromo integer NOT NULL, rosa integer NOT NULL,
                                   sub_id uuid, PRIMARY KEY (cat, sub)) ON COMMIT DROP;
  INSERT INTO _acb_esperado (cat, sub, cromo, rosa) VALUES
    ('Acessórios de Casa de Banho', 'Auxiliares', 1, 0),
    ('Acessórios de Casa de Banho', 'Cabides', 2, 0),
    ('Acessórios de Casa de Banho', 'Cestos', 1, 0),
    ('Acessórios de Casa de Banho', 'Pega De Segurança', 1, 0),
    ('Acessórios de Casa de Banho', 'Piaçaba', 2, 0),
    ('Acessórios de Casa de Banho', 'Porta-rolos', 2, 0),
    ('Acessórios de Casa de Banho', 'Toalheiros', 13, 0),
    ('Duche & Banho', 'Chuveiro Higiénico', 3, 1),
    ('Duche & Banho', 'Colunas Duche', 15, 0),
    ('Duche & Banho', 'Resguardos de Duche', 754, 0),
    ('Loiças Sanitárias', 'Kit´s para Sanitários', 2, 0);
  UPDATE _acb_esperado e SET sub_id = s.id
  FROM product_categories s JOIN product_categories c ON c.id = s.parent_id
  WHERE s.organization_id = c_org AND s.deleted_at IS NULL AND c.deleted_at IS NULL
    AND public.fn_cat_chave_opcao(s.name) = public.fn_cat_chave_opcao(e.sub)
    AND public.fn_cat_chave_opcao(c.name) = public.fn_cat_chave_opcao(e.cat);
  SELECT string_agg(coalesce(e.cat || ' › ' || e.sub, 'subcategoria fora da lista') || ': ' || coalesce(x.n_cromo, 0) || '+' || coalesce(x.n_rosa, 0)
                    || ' em vez de ' || coalesce(e.cromo, 0) || '+' || coalesce(e.rosa, 0), '; ') INTO v_txt
  FROM _acb_esperado e
  FULL JOIN (SELECT b.subcategory_id, count(*) FILTER (WHERE NOT b.rosa) AS n_cromo, count(*) FILTER (WHERE b.rosa) AS n_rosa
             FROM _acb b GROUP BY b.subcategory_id) x ON x.subcategory_id = e.sub_id
  WHERE e.sub_id IS NULL OR x.subcategory_id IS NULL OR x.n_cromo <> e.cromo OR x.n_rosa <> e.rosa;
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'catalogo_acabamento_cromado: a contagem por subcategoria não é a lida a 17/11: %', left(v_txt, 1500);
  END IF;

  SELECT m.user_id INTO v_criador
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL
  WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND coalesce(m.role_is_client, false) = false
  ORDER BY m.created_at, m.user_id LIMIT 1;
  IF v_criador IS NULL THEN RAISE EXCEPTION 'catalogo_acabamento_cromado: a Mudelar não tem um membro ativo para created_by.'; END IF;

  -- o estado antes (para conferir que só a Cor e o Acabamento mudaram)
  CREATE TEMP TABLE _acb_antes ON COMMIT DROP AS
  SELECT b.id,
         (SELECT string_agg(v.attribute_id::text || '=' || coalesce(v.value_text, '') || coalesce(v.value_json::text, ''), '|' ORDER BY v.attribute_id)
          FROM product_attribute_values v WHERE v.product_id = b.id AND v.attribute_id NOT IN (v_a_cor, v_a_acab)) AS outros,
         (SELECT string_agg(x.id::text || ':' || coalesce(x.price::text, ''), ',' ORDER BY x.id) FROM product_prices x WHERE x.product_id = b.id) AS precos,
         p.name, p.model_id, p.status::text AS status
  FROM _acb b JOIN products p ON p.id = b.id;
  CREATE TEMP TABLE _acb_forn ON COMMIT DROP AS
  SELECT i.id, i.product_id, i.supplier_sku, (i.supplier_sku = b.sku_antigo) AS muda
  FROM item_suppliers i JOIN _acb b ON b.id = i.product_id WHERE i.deleted_at IS NULL;
  SELECT count(*) INTO v_n FROM _acb_forn f WHERE f.muda;
  IF v_n <> c_n_forn_sku THEN
    RAISE EXCEPTION 'catalogo_acabamento_cromado: % ligações a fornecedor com o SKU antigo (esperadas %).', v_n, c_n_forn_sku;
  END IF;

  -- o que esta transação já tinha escrito antes desta migration (se correr no mesmo BEGIN que outra), para a
  -- verificação pelo xmin no fim contar só o que esta escreveu
  v_xid := (txid_current() % 4294967296)::text;
  CREATE TEMP TABLE _acb_ja ON COMMIT DROP AS
  SELECT 'products'::text AS t, x.id FROM products x WHERE x.xmin::text = v_xid
  UNION ALL SELECT 'product_attribute_values', x.id FROM product_attribute_values x WHERE x.xmin::text = v_xid
  UNION ALL SELECT 'product_prices', x.id FROM product_prices x WHERE x.xmin::text = v_xid
  UNION ALL SELECT 'item_suppliers', x.id FROM item_suppliers x WHERE x.xmin::text = v_xid
  UNION ALL SELECT 'product_models', x.id FROM product_models x WHERE x.xmin::text = v_xid
  UNION ALL SELECT 'product_categories', x.id FROM product_categories x WHERE x.xmin::text = v_xid
  UNION ALL SELECT 'product_attributes', x.id FROM product_attributes x WHERE x.xmin::text = v_xid
  UNION ALL SELECT 'attribute_option_groups', x.id FROM attribute_option_groups x WHERE x.xmin::text = v_xid
  UNION ALL SELECT 'attribute_option_group_values', x.id FROM attribute_option_group_values x WHERE x.xmin::text = v_xid;

  -- ─── Locks (as chaves das funções de gestão do Catálogo) ─────────────────────
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_sku_config:' || c_org::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_modelos:' || c_org::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_sigla_opc:' || v_g_cor::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_sigla_opc:' || v_g_acab::text, 0));

  PERFORM set_config('app.audit_source', c_fonte, true);
  PERFORM set_config('app.audit_user_id', v_criador::text, true);

  -- ─── 1. Acabamento: Cromado, Escovado, Mate e PVD (procura pelo nome; cria só se faltar) ─────
  CREATE TEMP TABLE _acb_opc (nome text PRIMARY KEY, sigla_pref text NOT NULL, ordem integer NOT NULL, opcao_id uuid, valor text, sigla text)
    ON COMMIT DROP;
  INSERT INTO _acb_opc (nome, sigla_pref, ordem) VALUES ('Cromado', 'CRD', 1), ('Escovado', 'ESC', 2), ('Mate', 'MAT', 3), ('PVD', 'PVD', 4);
  FOR r IN SELECT o.nome, o.sigla_pref FROM _acb_opc o ORDER BY o.ordem LOOP
    SELECT count(*), (array_agg(v.id ORDER BY v.id))[1], (array_agg(v.is_active ORDER BY v.id))[1] INTO v_n, v_opc, v_ativa
    FROM attribute_option_group_values v
    WHERE v.group_id = v_g_acab AND public.fn_cat_chave_opcao(v.value_text::text) = public.fn_cat_chave_opcao(r.nome);
    IF v_n > 1 THEN RAISE EXCEPTION 'catalogo_acabamento_cromado: há % opções «%» no Acabamento.', v_n, r.nome; END IF;
    IF v_n = 1 AND NOT v_ativa THEN RAISE EXCEPTION 'catalogo_acabamento_cromado: a opção «%» do Acabamento está desativada.', r.nome; END IF;
    IF v_n = 0 THEN
      v_txt := CASE WHEN NOT EXISTS (SELECT 1 FROM attribute_option_group_values v WHERE v.group_id = v_g_acab AND v.sigla = r.sigla_pref)
                    THEN r.sigla_pref ELSE public.fn_cat_sigla_opcao_livre(v_g_acab, r.nome, NULL) END;
      IF v_txt IS NULL THEN RAISE EXCEPTION 'catalogo_acabamento_cromado: sem sigla livre para «%».', r.nome; END IF;
      INSERT INTO attribute_option_group_values (group_id, value_text, display_name, hex_color, sort_order, is_active, sigla)
      VALUES (v_g_acab, r.nome, r.nome, NULL,
              coalesce((SELECT max(v.sort_order) FROM attribute_option_group_values v WHERE v.group_id = v_g_acab), 0) + 1, true, v_txt)
      RETURNING id INTO v_opc;
      v_criadas := v_criadas || r.nome || ' (' || v_txt || '); ';
    END IF;
    UPDATE _acb_opc o SET opcao_id = v_opc WHERE o.nome = r.nome;
  END LOOP;
  UPDATE _acb_opc o SET valor = v.value_text::text, sigla = v.sigla FROM attribute_option_group_values v WHERE v.id = o.opcao_id;
  IF EXISTS (SELECT 1 FROM _acb_opc o WHERE o.sigla IS NULL OR o.valor IS NULL) THEN
    RAISE EXCEPTION 'catalogo_acabamento_cromado: há opções do Acabamento sem sigla (o SKU precisa dela).';
  END IF;

  -- a Cor «Rosa Gold» que já existe (só se usa, não se cria: tem de existir)
  SELECT count(*), (array_agg(v.id))[1], (array_agg(v.is_active))[1], (array_agg(v.value_text::text))[1], (array_agg(v.sigla))[1]
    INTO v_n, v_rosa, v_ativa, v_rosa_valor, v_rosa_sigla
  FROM attribute_option_group_values v
  WHERE v.group_id = v_g_cor AND public.fn_cat_chave_opcao(v.value_text::text) = public.fn_cat_chave_opcao(c_rosa_nova);
  IF v_n <> 1 OR NOT v_ativa OR v_rosa_sigla IS NULL THEN
    RAISE EXCEPTION 'catalogo_acabamento_cromado: a Cor «%» da Mudelar não existe uma vez, ativa e com sigla (% encontradas).', c_rosa_nova, v_n;
  END IF;

  -- ─── 2. O SKU novo (a regra de cat_gerar_sku_produto, set-based): os atributos de hoje sem a Cor antiga, ─────
  --        mais Rosa Gold (só o WATER BLISS) e o Acabamento
  UPDATE _acb b SET sku_novo = z.calc
  FROM (SELECT b2.id,
               (CASE WHEN (pt ->> 'prefixo') IS NOT NULL AND coalesce(pt -> 'faltas', '[]'::jsonb) = '[]'::jsonb
                     THEN concat_ws('-', pt ->> 'prefixo', lpad(public.fn_cat_modelo_numero(c_org, b2.subcategory_id, b2.model_id)::text, 4, '0'),
                                    pt ->> 'resto') END) AS calc
        FROM _acb b2
        CROSS JOIN LATERAL (SELECT public.fn_cat_sku_partes(c_org, b2.category_id, b2.subcategory_id, (
            SELECT coalesce(jsonb_agg(q.e), '[]'::jsonb) FROM (
              SELECT jsonb_build_object('atributo', v.attribute_id, 'sigla', o.sigla,
                                        'medida', (CASE WHEN a.is_measurement THEN public.fn_cat_medida_ler(v.value_json, v.unit) END)) AS e
              FROM product_attribute_values v
              JOIN product_attributes a ON a.id = v.attribute_id AND a.organization_id = c_org AND a.deleted_at IS NULL
              LEFT JOIN attribute_option_group_values o
                ON NOT a.is_measurement AND o.group_id = public.fn_cat_grupo_do_atributo(a.id, c_org) AND o.value_text = v.value_text
              WHERE v.product_id = b2.id AND v.attribute_id <> v_a_cor
              UNION ALL
              SELECT jsonb_build_object('atributo', v_a_cor, 'sigla', v_rosa_sigla) WHERE b2.rosa
              UNION ALL
              SELECT jsonb_build_object('atributo', v_a_acab, 'sigla', o.sigla)
              FROM _acb_opc o WHERE o.nome = (CASE WHEN b2.rosa THEN 'Escovado' ELSE 'Cromado' END)) q)) AS pt) x) z
  WHERE z.id = b.id;
  SELECT count(*), string_agg(b.sku_antigo, ', ') INTO v_n, v_txt FROM _acb b WHERE b.sku_novo IS NULL OR b.sku_novo ~ '^CAT-';
  IF v_n > 0 THEN RAISE EXCEPTION 'catalogo_acabamento_cromado: % SKUs novos com faltas ou provisórios (ex.: %).', v_n, left(v_txt, 500); END IF;
  -- repetido entre eles, ou já usado por outro produto da Mudelar (vivo ou apagado): PARA e diz quais
  SELECT string_agg(x.sku_novo || ' ×' || x.n || ' (' || x.antigos || ')', '; ') INTO v_txt
  FROM (SELECT b.sku_novo, count(*) AS n, string_agg(b.sku_antigo, ' | ' ORDER BY b.sku_antigo) AS antigos FROM _acb b
        GROUP BY b.sku_novo HAVING count(*) > 1 ORDER BY b.sku_novo LIMIT 10) x;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'catalogo_acabamento_cromado: SKUs novos repetidos: %', v_txt; END IF;
  SELECT string_agg(b.sku_antigo || ' → ' || b.sku_novo || ' (já é de «' || p.name || '»)', '; ') INTO v_txt
  FROM (SELECT b2.* FROM _acb b2 JOIN products p2 ON p2.organization_id = c_org AND p2.sku = b2.sku_novo AND p2.id <> b2.id
        ORDER BY b2.sku_novo LIMIT 10) b
  JOIN products p ON p.organization_id = c_org AND p.sku = b.sku_novo AND p.id <> b.id;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'catalogo_acabamento_cromado: SKUs novos já usados noutros produtos da Mudelar: %', v_txt; END IF;
  IF EXISTS (SELECT 1 FROM _acb b WHERE b.sku_novo = b.sku_antigo) THEN
    RAISE EXCEPTION 'catalogo_acabamento_cromado: há SKUs novos iguais aos antigos (o segmento da Cor não saiu).';
  END IF;

  -- ─── 3. Gravar (auditoria por linha desligada: fica uma linha consolidada no fim) ───────────────
  PERFORM set_config('app.audit_bypass', 'on', true);

  DELETE FROM product_attribute_values v USING _acb b
  WHERE v.product_id = b.id AND v.attribute_id = v_a_cor AND NOT b.rosa;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  UPDATE product_attribute_values v SET value_text = v_rosa_valor
  FROM _acb b WHERE v.product_id = b.id AND v.attribute_id = v_a_cor AND b.rosa;
  GET DIAGNOSTICS v_m = ROW_COUNT;
  IF v_n <> c_n_cromo OR v_m <> c_n_rosa THEN
    RAISE EXCEPTION 'catalogo_acabamento_cromado: % Cores retiradas e % mudadas (esperadas % e %).', v_n, v_m, c_n_cromo, c_n_rosa;
  END IF;
  -- como cat_guardar_produto_atributos: o value_text é o da opção
  INSERT INTO product_attribute_values (product_id, attribute_id, value_text, value_json, unit)
  SELECT b.id, v_a_acab, o.valor, NULL::jsonb, NULL::text
  FROM _acb b JOIN _acb_opc o ON o.nome = (CASE WHEN b.rosa THEN 'Escovado' ELSE 'Cromado' END);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> c_total THEN RAISE EXCEPTION 'catalogo_acabamento_cromado: % Acabamentos gravados em vez de %.', v_n, c_total; END IF;

  UPDATE products p SET sku = b.sku_novo, sku_gerado = true
  FROM _acb b WHERE p.id = b.id AND p.organization_id = c_org;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> c_total THEN RAISE EXCEPTION 'catalogo_acabamento_cromado: % SKUs gravados em vez de %.', v_n, c_total; END IF;

  -- supplier_sku: o SKU antigo do próprio produto passa ao novo (quem tem código de fornecedor não muda)
  UPDATE item_suppliers i SET supplier_sku = b.sku_novo
  FROM _acb_forn f JOIN _acb b ON b.id = f.product_id
  WHERE i.id = f.id AND f.muda AND i.organization_id = c_org;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> c_n_forn_sku THEN RAISE EXCEPTION 'catalogo_acabamento_cromado: % supplier_sku mudados em vez de %.', v_n, c_n_forn_sku; END IF;

  PERFORM set_config('app.audit_bypass', 'off', true);
  PERFORM public.fn_manual_audit_log('products', c_org, c_org, 'UPDATE',
    jsonb_build_object('correcao', 'catalogo_acabamento_cromado', 'produtos', c_total, 'cromo_para_cromado', c_n_cromo,
                       'rosa_gold_escovado', c_n_rosa, 'ficam_frost_plus', c_n_ficam, 'supplier_sku', c_n_forn_sku,
                       'opcoes_criadas', v_criadas,
                       'skus', (SELECT jsonb_object_agg(b.sku_antigo, b.sku_novo) FROM _acb b)),
    c_fonte, c_org);
  IF NOT EXISTS (SELECT 1 FROM entity_audit_log e WHERE e.organization_id = c_org AND e.source = c_fonte
                 AND e.table_name = 'products' AND e.created_at >= now()) THEN
    RAISE WARNING 'catalogo_acabamento_cromado: a linha consolidada da auditoria não ficou gravada (fn_manual_audit_log engole o erro).';
  END IF;

  -- ─── 4. Conferir (cada contagem é do que está ERRADO; tem de dar 0) ───────────
  -- por subcategoria: Cromado e sem Cor (e o WATER BLISS com Rosa Gold + Escovado)
  SELECT string_agg(e.sub || ': ' || coalesce(x.n_cromado, 0) || '+' || coalesce(x.n_rosa, 0) || ' em vez de ' || e.cromo || '+' || e.rosa, '; ')
    INTO v_txt
  FROM _acb_esperado e
  LEFT JOIN (SELECT b.subcategory_id,
                    count(*) FILTER (WHERE NOT b.rosa AND ac.value_text = (SELECT o.valor FROM _acb_opc o WHERE o.nome = 'Cromado') AND vc.product_id IS NULL) AS n_cromado,
                    count(*) FILTER (WHERE b.rosa AND ac.value_text = (SELECT o.valor FROM _acb_opc o WHERE o.nome = 'Escovado') AND vc.value_text = v_rosa_valor) AS n_rosa
             FROM _acb b
             LEFT JOIN product_attribute_values ac ON ac.product_id = b.id AND ac.attribute_id = v_a_acab
             LEFT JOIN product_attribute_values vc ON vc.product_id = b.id AND vc.attribute_id = v_a_cor
             GROUP BY b.subcategory_id) x ON x.subcategory_id = e.sub_id
  WHERE coalesce(x.n_cromado, 0) <> e.cromo OR coalesce(x.n_rosa, 0) <> e.rosa;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'Conferir: por subcategoria: %', v_txt; END IF;
  -- nenhum produto vivo da Mudelar com Cor Cromo/ROSA GOLD ESCOVADO sem Acabamento; os 227 intactos
  SELECT count(*) INTO v_n FROM products p JOIN product_attribute_values pv ON pv.product_id = p.id AND pv.attribute_id = v_a_cor
  WHERE p.organization_id = c_org AND NOT p.is_deleted
    AND public.fn_cat_chave_opcao(pv.value_text) IN ('cromo', 'cromado', 'rosa gold escovado')
    AND NOT EXISTS (SELECT 1 FROM product_attribute_values x WHERE x.product_id = p.id AND x.attribute_id = v_a_acab);
  SELECT count(*) INTO v_m FROM _acb_ficam f LEFT JOIN products p ON p.id = f.id
  WHERE NOT coalesce(p.sku = f.sku AND NOT p.is_deleted
                     AND EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id = f.id AND v.attribute_id = v_a_cor AND v.value_text = f.cor)
                     AND EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id = f.id AND v.attribute_id = v_a_acab AND v.value_text = f.acab), false);
  IF v_n > 0 OR v_m > 0 THEN
    RAISE EXCEPTION 'Conferir: % produtos ainda com Cor Cromo sem Acabamento; % dos % com Frost Plus mudaram.', v_n, v_m, c_n_ficam;
  END IF;
  -- os 797: SKU novo e gerado; nome, modelo, estado, preços e os outros atributos iguais a antes; 1 Acabamento
  SELECT count(*), string_agg(b.sku_antigo, ', ') INTO v_n, v_txt
  FROM _acb b JOIN _acb_antes a ON a.id = b.id LEFT JOIN products p ON p.id = b.id
  WHERE NOT coalesce(p.sku = b.sku_novo AND p.sku_gerado AND NOT p.is_deleted AND p.organization_id = c_org
                     AND p.name = a.name AND p.model_id IS NOT DISTINCT FROM a.model_id AND p.status::text = a.status
                     AND a.outros IS NOT DISTINCT FROM (SELECT string_agg(v.attribute_id::text || '=' || coalesce(v.value_text, '') || coalesce(v.value_json::text, ''), '|' ORDER BY v.attribute_id)
                                                        FROM product_attribute_values v WHERE v.product_id = b.id AND v.attribute_id NOT IN (v_a_cor, v_a_acab))
                     AND a.precos IS NOT DISTINCT FROM (SELECT string_agg(x.id::text || ':' || coalesce(x.price::text, ''), ',' ORDER BY x.id)
                                                        FROM product_prices x WHERE x.product_id = b.id)
                     AND (SELECT count(*) FROM product_attribute_values v WHERE v.product_id = b.id AND v.attribute_id = v_a_acab) = 1, false);
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % produtos não ficaram como esperado: %', v_n, left(v_txt, 1000); END IF;

  -- SKUs: únicos na Mudelar, no formato, sem provisórios, e iguais ao recalculado a partir do que ficou gravado (todos os 797)
  SELECT count(*) INTO v_n FROM (SELECT p.sku FROM products p WHERE p.organization_id = c_org GROUP BY p.sku HAVING count(*) > 1) d;
  SELECT count(*) INTO v_m FROM _acb b WHERE b.sku_novo !~ '^[A-Z0-9]+-[A-Z0-9]+-[0-9]{4}(-[A-Z0-9]+){1,5}$' OR b.sku_novo ~ '^CAT-';
  IF v_n > 0 OR v_m > 0 THEN RAISE EXCEPTION 'Conferir: % SKUs repetidos na Mudelar; % SKUs novos fora do formato.', v_n, v_m; END IF;
  SELECT count(*), string_agg(y.sku || ' ≠ ' || coalesce(y.calc, 'null'), '; ') FILTER (WHERE y.k <= 5) INTO v_n, v_txt
  FROM (SELECT x.sku, x.calc, row_number() OVER (ORDER BY x.sku) AS k FROM (
          SELECT p.sku, pt ->> 'faltas' AS faltas, (pt ->> 'prefixo') AS prefixo,
                 concat_ws('-', pt ->> 'prefixo', lpad(public.fn_cat_modelo_numero(c_org, p.subcategory_id, p.model_id)::text, 4, '0'),
                           pt ->> 'resto') AS calc
          FROM products p JOIN _acb b ON b.id = p.id
          CROSS JOIN LATERAL (SELECT public.fn_cat_sku_partes(c_org, p.category_id, p.subcategory_id, (
              SELECT coalesce(jsonb_agg(jsonb_build_object(
                       'atributo', v.attribute_id, 'sigla', o.sigla,
                       'medida', (CASE WHEN a.is_measurement THEN public.fn_cat_medida_ler(v.value_json, v.unit) END))), '[]'::jsonb)
              FROM product_attribute_values v
              JOIN product_attributes a ON a.id = v.attribute_id AND a.organization_id = c_org AND a.deleted_at IS NULL
              LEFT JOIN attribute_option_group_values o
                ON NOT a.is_measurement AND o.group_id = public.fn_cat_grupo_do_atributo(a.id, c_org) AND o.value_text = v.value_text
              WHERE v.product_id = p.id)) AS pt) z) x
        WHERE x.calc IS DISTINCT FROM x.sku OR x.prefixo IS NULL OR x.faltas <> '[]') y;
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % SKUs diferentes do recalculado pela regra do Catálogo (ex.: %).', v_n, v_txt; END IF;

  -- uma amostra com cat_prever_sku_modelo, como um membro da Mudelar com products.edit (só leitura; claims locais)
  SELECT u.auth_user_id INTO v_auth
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
  WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND NOT coalesce(m.role_is_client, false)
    AND public.has_anew_permission_in_org(u.auth_user_id, 'products.edit', c_org)
  ORDER BY m.created_at, u.id LIMIT 1;
  IF v_auth IS NULL THEN
    RAISE NOTICE 'catalogo_acabamento_cromado: sem membro da Mudelar com products.edit — a comparação com cat_prever_sku_modelo ficou por fazer (o recálculo de todos foi feito).';
  ELSE
    v_claims := current_setting('request.jwt.claims', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
    v_n := 0;
    FOR r IN (SELECT b.id, b.sku_novo, b.category_id, b.subcategory_id, b.model_id FROM _acb b WHERE b.rosa)
             UNION ALL
             (SELECT b.id, b.sku_novo, b.category_id, b.subcategory_id, b.model_id FROM _acb b WHERE NOT b.rosa ORDER BY random() LIMIT c_amostra - 1) LOOP
      SELECT coalesce(jsonb_agg(CASE WHEN a.is_measurement THEN jsonb_build_object('atributo', v.attribute_id, 'medida', v.value_json)
                                     ELSE jsonb_build_object('atributo', v.attribute_id, 'opcao', o.id) END), '[]'::jsonb) INTO v_attrs
      FROM product_attribute_values v
      JOIN product_attributes a ON a.id = v.attribute_id
      LEFT JOIN attribute_option_group_values o
        ON NOT a.is_measurement AND o.group_id = public.fn_cat_grupo_do_atributo(v.attribute_id, c_org) AND o.value_text = v.value_text
      WHERE v.product_id = r.id;
      v_prev := public.cat_prever_sku_modelo(c_org, r.category_id, r.subcategory_id, r.model_id, v_attrs, r.id);
      IF (v_prev ->> 'sku') IS DISTINCT FROM r.sku_novo OR coalesce(v_prev -> 'faltas', '[]'::jsonb) <> '[]'::jsonb THEN
        RAISE EXCEPTION 'Conferir: cat_prever_sku_modelo dá % para o produto com o SKU %.', v_prev, r.sku_novo;
      END IF;
      v_n := v_n + 1;
    END LOOP;
    PERFORM set_config('request.jwt.claims', coalesce(v_claims, ''), true);
    IF v_n <> c_amostra THEN RAISE EXCEPTION 'Conferir: só % de % comparados com cat_prever_sku_modelo.', v_n, c_amostra; END IF;
  END IF;

  -- ligações a fornecedor: as 41 com o SKU novo, as outras iguais; nenhuma com o SKU antigo; nenhuma nova
  SELECT count(*) FILTER (WHERE f.muda), count(*) FILTER (WHERE NOT f.muda) INTO v_n, v_m
  FROM _acb_forn f JOIN _acb b ON b.id = f.product_id LEFT JOIN item_suppliers i ON i.id = f.id
  WHERE NOT coalesce(i.supplier_sku = (CASE WHEN f.muda THEN b.sku_novo ELSE f.supplier_sku END) AND i.deleted_at IS NULL, false);
  SELECT count(*) INTO v_k FROM item_suppliers i JOIN _acb b ON b.id = i.product_id
  WHERE (i.deleted_at IS NULL AND i.supplier_sku = b.sku_antigo) OR NOT EXISTS (SELECT 1 FROM _acb_forn f WHERE f.id = i.id);
  IF v_n > 0 OR v_m > 0 OR v_k > 0 THEN
    RAISE EXCEPTION 'Conferir: % ligações sem o SKU novo, % ligações com código de fornecedor mudadas, % com o SKU antigo ou novas.', v_n, v_m, v_k;
  END IF;

  -- nada escrito fora da Mudelar, nem noutros produtos dela, nem em preços, modelos, categorias ou atributos (xmin)
  SELECT string_agg(x.t || ' ' || x.n, ', ') INTO v_txt FROM (
    SELECT 'products (fora dos 797)' AS t, count(*) AS n FROM products p
           WHERE p.xmin::text = v_xid AND NOT EXISTS (SELECT 1 FROM _acb b WHERE b.id = p.id)
             AND NOT EXISTS (SELECT 1 FROM _acb_ja j WHERE j.t = 'products' AND j.id = p.id)
    UNION ALL SELECT 'product_attribute_values (fora dos 797)', count(*) FROM product_attribute_values x
              WHERE x.xmin::text = v_xid AND NOT EXISTS (SELECT 1 FROM _acb b WHERE b.id = x.product_id)
                AND NOT EXISTS (SELECT 1 FROM _acb_ja j WHERE j.t = 'product_attribute_values' AND j.id = x.id)
    UNION ALL SELECT 'product_attribute_values (outro atributo)', count(*) FROM product_attribute_values x
              WHERE x.xmin::text = v_xid AND x.attribute_id NOT IN (v_a_cor, v_a_acab)
                AND NOT EXISTS (SELECT 1 FROM _acb_ja j WHERE j.t = 'product_attribute_values' AND j.id = x.id)
    UNION ALL SELECT 'product_prices', count(*) FROM product_prices x WHERE x.xmin::text = v_xid
              AND NOT EXISTS (SELECT 1 FROM _acb_ja j WHERE j.t = 'product_prices' AND j.id = x.id)
    UNION ALL SELECT 'item_suppliers (além das 41)', count(*) FROM item_suppliers x
              WHERE x.xmin::text = v_xid AND NOT EXISTS (SELECT 1 FROM _acb_forn f WHERE f.id = x.id AND f.muda)
                AND NOT EXISTS (SELECT 1 FROM _acb_ja j WHERE j.t = 'item_suppliers' AND j.id = x.id)
    UNION ALL SELECT 'product_models', count(*) FROM product_models x WHERE x.xmin::text = v_xid
              AND NOT EXISTS (SELECT 1 FROM _acb_ja j WHERE j.t = 'product_models' AND j.id = x.id)
    UNION ALL SELECT 'product_categories', count(*) FROM product_categories x WHERE x.xmin::text = v_xid
              AND NOT EXISTS (SELECT 1 FROM _acb_ja j WHERE j.t = 'product_categories' AND j.id = x.id)
    UNION ALL SELECT 'product_attributes', count(*) FROM product_attributes x WHERE x.xmin::text = v_xid
              AND NOT EXISTS (SELECT 1 FROM _acb_ja j WHERE j.t = 'product_attributes' AND j.id = x.id)
    UNION ALL SELECT 'attribute_option_groups', count(*) FROM attribute_option_groups x WHERE x.xmin::text = v_xid
              AND NOT EXISTS (SELECT 1 FROM _acb_ja j WHERE j.t = 'attribute_option_groups' AND j.id = x.id)
    UNION ALL SELECT 'attribute_option_group_values (fora do Acabamento)', count(*) FROM attribute_option_group_values v
              WHERE v.xmin::text = v_xid AND v.group_id IS DISTINCT FROM v_g_acab
                AND NOT EXISTS (SELECT 1 FROM _acb_ja j WHERE j.t = 'attribute_option_group_values' AND j.id = v.id)
    UNION ALL SELECT 'products de outra organização', count(*) FROM products p WHERE p.xmin::text = v_xid AND p.organization_id IS DISTINCT FROM c_org) x
  WHERE x.n > 0;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'Conferir: foram escritas linhas fora do âmbito: %', v_txt; END IF;
  SELECT count(*) INTO v_n FROM products p WHERE p.xmin::text = v_xid AND p.organization_id = c_org
    AND NOT EXISTS (SELECT 1 FROM _acb_ja j WHERE j.t = 'products' AND j.id = p.id);
  IF v_n <> c_total THEN
    RAISE EXCEPTION 'Conferir: % produtos com o xmin desta transação (esperados %): a verificação pelo xmin não vale.', v_n, c_total;
  END IF;

  RAISE NOTICE 'catalogo_acabamento_cromado: % produtos (% Cromo → Acabamento %, % ROSA GOLD ESCOVADO → % + %), % ficam com Cromo + Frost Plus, % ligações a fornecedor com o SKU novo. Opções do Acabamento criadas: %. Conferido.',
    c_total, c_n_cromo, (SELECT o.valor || ' ' || o.sigla FROM _acb_opc o WHERE o.nome = 'Cromado'), c_n_rosa, v_rosa_valor,
    (SELECT o.valor || ' ' || o.sigla FROM _acb_opc o WHERE o.nome = 'Escovado'), c_n_ficam, c_n_forn_sku,
    coalesce(nullif(v_criadas, ''), 'nenhuma');
END $mig$;

RESET statement_timeout;
RESET lock_timeout;
