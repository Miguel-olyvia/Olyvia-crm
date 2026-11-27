-- =============================================================================
-- Catálogo — MUDELAR igual aos Excels, ONDA 8: ATRIBUTOS DE MEDIDA EXPLÍCITA de produtos sem nenhum. MIGRATION DE DADOS.
-- Base de RH (uetjghdkwbywbftedtth).
-- =============================================================================
--
-- !!! SÓ PARA A BASE DE RH (uetjghdkwbywbftedtth). SÓ A MUDELAR (3242e925-da26-459a-8258-be04d904e355): todas as escritas
-- !!! levam o filtro da organização. Os ids, o SKU e a opção foram lidos na RH a 27/11/2026 (SELECT como administrador,
-- !!! sem RLS), depois de 20270130300000. Noutra base (a principal) a organização ou o produto não existem com estes ids,
-- !!! ou não há _mudelar_excel.onda3_produtos (a onda 3 não correu lá), e a migration sai por RAISE NOTICE sem escrever
-- !!! nada. Antes do `db push`, confirmar supabase/.temp/project-ref = uetjghdkwbywbftedtth.
--
-- Pedido do dono: mostrou o LLCCI0021 «LAVA LOUÇA BLANCO INOX LEMIS 45 S-IF 523 030 86CM» sem atributos: «ve este rpod
-- que nao tem ateibuto nem nd». Antes: «quero que vejas o excel e garantas que tens todos os prod com os atributos».
-- A 27/11 a Mudelar tinha cerca de 179 produtos vivos sem nenhum atributo (sem CONS-). Varrimento por script
-- (mudelar-audit/onda8: o8.py, o8_gen.py), fora da pasta do projeto, com as regras da onda 6 (medida NxM/NxMxP ou
-- largura «Ncm» só onde a regra acerta sempre nos produtos completos da mesma subcategoria: >= 5 certos, 0 errados):
-- 0 candidatos passaram a prova (candidatos.csv vazio); os que ficam de fora, com a razão, estão em sem_prova.csv.
--
-- O QUE FAZ: dá 1 valor(es) de atributo a 1 produto(s) que não tinham nenhum (0 medidas e 1 opções;
-- largura em Cubas inox: 1 (excecao)). Lista fechada, embutida abaixo; nada se calcula na hora.
-- EXCEÇÃO INDIVIDUAL (excecoes.csv): LLCCI0021 → largura «86». Não passa a prova por subcategoria (nenhum dos 21
-- completos de «Cubas inox» traz «CM» no nome: 0 certos, 0 errados), entra porque o dono o apontou: «86CM» é a única
-- medida com unidade no nome (45 é o modelo LEMIS 45, «523 030» a referência do fabricante); os irmãos guardam a largura
-- igual (KERAN 86 → value_text «86», sem unidade), e a opção «86» já existe ATIVA no grupo do atributo Largura.
--
-- O QUE NÃO FAZ: não muda SKU (nenhuma chamada a cat_gerar_sku_produto; C3 exige 0 SKU alterados em TODOS os produtos da
-- Mudelar: o LLCCI0021 fica LLCCI0021), não toca em nenhuma linha de products (C3 compara a linha inteira, updated_at
-- incluído), não dá modelo nem família, não cria opções nem atributos, não dá cor (a cor é um produto), não altera nem
-- apaga atributos que já existam (só entra em produtos SEM nenhum), não arquiva nada, não toca nos 27 tampos «Nx4x46»
-- (ficam sem medida, decisão do dono na onda 7), nem em preços, famílias, documentos ou noutra organização.
--
-- GUARDAS, ESCRITA E CONFERÊNCIAS: as mesmas da onda 6 (20270129900000), com os números desta onda: G0 a Mudelar existe
-- (senão NOTICE e sai); L1 as listas têm os números do cabeçalho; G1 548 famílias e 14637 membros; G2 cada produto existe,
-- é da Mudelar, está vivo, é produto do catálogo, tem o SKU lido, não tem modelo e não está em família; G3 cada atributo é
-- da Mudelar, vivo, com o código esperado, e cada opção existe ATIVA no grupo do atributo (fn_cat_grupo_do_atributo, o
-- mesmo que o ecrã usa); G4 nenhum produto da lista tem atributos (ou já todos têm os desta onda: já aplicada, sai por
-- NOTICE); G5 o utilizador da auditoria é membro ativo e a auditoria está ligada; G6 os eixos das famílias têm valores
-- distintos. Lock: pg_advisory_xact_lock(hashtextextended('cat_familias:' || org, 0)) e os produtos FOR NO KEY UPDATE.
-- ESCRITA: um só INSERT em product_attribute_values como cat_guardar_produto_atributos grava (opção: value_text),
-- ON CONFLICT (product_id, attribute_id) DO NOTHING. Os gatilhos dessa tabela (lidos a 27/11) são só a auditoria
-- (trg_audit_product_attribute_values, AFTER) e o updated_at (BEFORE UPDATE). CONFERÊNCIAS: C1 cada valor gravado e cada
-- produto com exatamente os da lista; C2 uma linha de auditoria por valor; C3 0 SKU alterados e products igual; C4
-- preços iguais; C5 atributos que já existiam iguais e +1 no total; C6 famílias (548 / 14637, impressão digital e
-- eixos distintos); C7 nada escrito fora dos atributos da Mudelar (xmin); C8 a cópia fechada (::text nas ACL e no relkind).
--
-- CÓPIA E REVERSÃO: a linha de products tocada fica em _mudelar_excel.onda8_produtos e os atributos criados em
-- _mudelar_excel.onda8_atributos_novos (só postgres). REVERSÃO fora da pasta das migrations (estar aqui é ser aplicada):
-- mudelar-reverter-onda8.sql, guardado com o trabalho; apaga só as linhas desta onda que ainda estão como ela as escreveu.
--
-- ORDEM: depois de 20270130300000 (última no remoto RH a 27/11) e antes de 20270130400000 (Ativos, retida). `supabase db
-- push` aplica TUDO o que estiver pendente: listar com `supabase migration list --linked` imediatamente antes e empurrar
-- só esta.
-- =============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

-- ─── 1. A lista fechada (tabelas temporárias: desaparecem no COMMIT) ───────────────────────────────
-- os produtos, o SKU lido a 27/11 e quantos atributos recebem
CREATE TEMP TABLE _o8_prod (id uuid PRIMARY KEY, sku text NOT NULL, n_attr integer NOT NULL) ON COMMIT DROP;
INSERT INTO _o8_prod (id, sku, n_attr) VALUES
  ('a8d471f1-6bfe-577b-bf49-964e8eb0135f', 'LLCCI0021', 1);
CREATE TEMP TABLE _o8_attr (product_id uuid NOT NULL, attribute_id uuid NOT NULL, codigo text NOT NULL, opcao text, med_tipo text, med_l numeric, med_c numeric, med_e numeric, med_u text, PRIMARY KEY (product_id, attribute_id)) ON COMMIT DROP;
INSERT INTO _o8_attr (product_id, attribute_id, codigo, opcao, med_tipo, med_l, med_c, med_e, med_u) VALUES
  ('a8d471f1-6bfe-577b-bf49-964e8eb0135f', '1e938087-56c8-44cb-b3d2-e33072ed2e17', 'largura', '86', NULL, NULL, NULL, NULL, NULL);

-- ─── 2. Guardas, cópia, escrita e conferências (um só bloco: tudo ou nada) ─────────────────────────
DO $mig$
DECLARE
  c_org           constant uuid    := '3242e925-da26-459a-8258-be04d904e355';
  c_criador       constant uuid    := 'ba0b0ebf-1bdb-43f9-b82b-a2ade29848e2';
  c_fonte         constant text    := 'migration:mudelar_excel_onda8_atributos';
  c_n_fam         constant integer := 548;
  c_n_membros     constant integer := 14637;
  c_n_produtos    constant integer := 1;
  c_n_attr        constant integer := 1;
  c_n_medida      constant integer := 0;
  c_n_opcao       constant integer := 1;
  v_n bigint; v_m bigint; v_pend bigint; v_feito bigint; v_pav_antes bigint; v_vivos_antes bigint;
  v_acl text; v_xid text; v_t text; v_txt text;
  v_h_sku_antes text;   v_h_sku_depois text;
  v_h_prod_antes text;  v_h_prod_depois text;
  v_h_preco_antes text; v_h_preco_depois text;
  v_h_attr_antes text;  v_h_attr_depois text;
  v_h_fam_antes text;   v_h_fam_depois text;
BEGIN
  -- G0: só a Mudelar da base de RH
  IF NOT EXISTS (SELECT 1 FROM anew_organizations o WHERE o.id = c_org AND o.name = 'Mudelar' AND o.deleted_at IS NULL) THEN
    RAISE NOTICE 'mudelar_excel_onda8: a organização Mudelar (%) não existe nesta base — nada a fazer.', c_org;
    RETURN;
  END IF;
  -- G1: só onde a onda 3 correu (a cópia _mudelar_excel.onda3_produtos só existe na RH). Numa base clonada da RH com os
  -- mesmos ids (a principal, quando o ramo chegar ao main) sai aqui por NOTICE em vez de bloquear o db push em G2.
  IF to_regclass('_mudelar_excel.onda3_produtos') IS NULL THEN
    RAISE NOTICE 'mudelar_excel_onda8: a onda 3 não correu nesta base (sem _mudelar_excel.onda3_produtos) — nada a fazer.';
    RETURN;
  END IF;
  SELECT count(*) INTO v_n FROM _o8_prod s JOIN products p ON p.id = s.id;
  IF v_n = 0 THEN
    RAISE NOTICE 'mudelar_excel_onda8: os produtos da lista não existem aqui — nada a fazer.';
    RETURN;
  END IF;

  -- L1: a lista embutida tem os números do cabeçalho
  IF (SELECT count(*) FROM _o8_prod) <> c_n_produtos THEN RAISE EXCEPTION 'L1: a lista de produtos não tem % produtos.', c_n_produtos; END IF;
  SELECT count(*), count(*) FILTER (WHERE a.med_tipo IS NOT NULL), count(*) FILTER (WHERE a.opcao IS NOT NULL) INTO v_n, v_m, v_pend FROM _o8_attr a;
  IF v_n <> c_n_attr OR v_m <> c_n_medida OR v_pend <> c_n_opcao OR c_n_medida + c_n_opcao <> c_n_attr THEN
    RAISE EXCEPTION 'L1: a lista de atributos tem % valores (% medidas, % opções); esperavam-se % (% e %).', v_n, v_m, v_pend, c_n_attr, c_n_medida, c_n_opcao;
  END IF;
  IF (SELECT sum(n_attr) FROM _o8_prod) <> c_n_attr
     OR EXISTS (SELECT 1 FROM _o8_prod s WHERE s.n_attr <> (SELECT count(*) FROM _o8_attr a WHERE a.product_id = s.id))
     OR EXISTS (SELECT 1 FROM _o8_attr a WHERE a.product_id NOT IN (SELECT s.id FROM _o8_prod s))
     OR EXISTS (SELECT 1 FROM _o8_attr a WHERE (a.opcao IS NULL) = (a.med_tipo IS NULL)) THEN
    RAISE EXCEPTION 'L1: as listas de produtos e de atributos não batem (contagem por produto, produto fora da lista ou valor sem opção nem medida).';
  END IF;

  PERFORM set_config('app.audit_source', c_fonte, true);
  PERFORM set_config('app.audit_user_id', c_criador::text, true);
  -- o lock das funções das famílias do ecrã, e os produtos da lista presos até ao fim, por ordem fixa
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_familias:' || c_org::text, 0));
  PERFORM 1 FROM products p WHERE p.id IN (SELECT s.id FROM _o8_prod s) ORDER BY p.id FOR NO KEY UPDATE;

  -- G1: contagens de partida (as famílias; o total de vivos só se regista: a onda 4b, aplicada à parte, pode mudá-lo)
  SELECT count(*) INTO v_vivos_antes FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.deleted_at IS NULL;
  SELECT count(*) INTO v_n FROM product_families f WHERE f.organization_id = c_org;
  SELECT count(*) INTO v_m FROM product_family_members m JOIN product_families f ON f.id = m.family_id WHERE f.organization_id = c_org;
  IF v_n <> c_n_fam OR v_m <> c_n_membros THEN
    RAISE EXCEPTION 'G1: a Mudelar tem % famílias e % membros; esperavam-se % e %.', v_n, v_m, c_n_fam, c_n_membros;
  END IF;

  -- G2: cada produto existe, é da Mudelar, está vivo, é um produto do catálogo, tem o SKU esperado, não tem modelo e não
  -- está em família (nenhum SKU nem modelo depende dos atributos que vão entrar)
  SELECT count(*) INTO v_n FROM _o8_prod s JOIN products p ON p.id = s.id
  WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.deleted_at IS NULL AND p.sku IS NOT DISTINCT FROM s.sku
    AND p.tipo_catalogo = 'produto' AND p.model_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM product_family_members m WHERE m.product_id = p.id);
  IF v_n <> c_n_produtos THEN
    SELECT string_agg(s.sku || ' → ' || coalesce(p.sku, '(sem produto)'), '; ' ORDER BY s.sku) INTO v_txt
    FROM (SELECT * FROM _o8_prod s0 WHERE NOT EXISTS (SELECT 1 FROM products p0 WHERE p0.id = s0.id AND p0.organization_id = c_org
          AND NOT p0.is_deleted AND p0.deleted_at IS NULL AND p0.sku IS NOT DISTINCT FROM s0.sku AND p0.tipo_catalogo = 'produto'
          AND p0.model_id IS NULL AND NOT EXISTS (SELECT 1 FROM product_family_members m WHERE m.product_id = p0.id)) ORDER BY s0.sku LIMIT 5) s
    LEFT JOIN products p ON p.id = s.id;
    RAISE EXCEPTION 'G2: só % de % produtos existem na Mudelar, vivos, com o SKU esperado, sem modelo e fora das famílias. Primeiros: %', v_n, c_n_produtos, v_txt;
  END IF;

  -- G3: cada atributo existe, é da Mudelar, não está apagado e tem o código esperado; as medidas são is_measurement e as
  -- opções existem ATIVAS no grupo que o ecrã usa (fn_cat_grupo_do_atributo, como cat_guardar_produto_atributos)
  SELECT count(*) INTO v_n FROM _o8_attr a JOIN product_attributes pa ON pa.id = a.attribute_id
  WHERE pa.organization_id = c_org AND pa.deleted_at IS NULL AND pa.code = a.codigo
    AND CASE WHEN a.med_tipo IS NOT NULL THEN pa.is_measurement
             ELSE NOT pa.is_measurement AND EXISTS (SELECT 1 FROM attribute_option_group_values o
                    WHERE o.group_id = public.fn_cat_grupo_do_atributo(pa.id, c_org) AND o.is_active AND o.value_text = a.opcao) END;
  IF v_n <> c_n_attr THEN RAISE EXCEPTION 'G3: só % de % valores têm o atributo vivo da Mudelar e a opção ativa no grupo (ou são medidas).', v_n, c_n_attr; END IF;

  -- G4: estado: nenhum produto da lista tem atributos (pendente) ou todos têm exatamente os desta onda (aplicada)
  SELECT count(*) INTO v_pend FROM _o8_prod s WHERE NOT EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id = s.id);
  SELECT count(*) INTO v_feito FROM _o8_prod s
  WHERE (SELECT count(*) FROM product_attribute_values v WHERE v.product_id = s.id) = s.n_attr
    AND (SELECT count(*) FROM _o8_attr a JOIN product_attribute_values v ON v.product_id = a.product_id AND v.attribute_id = a.attribute_id
         WHERE a.product_id = s.id) = s.n_attr;
  IF v_feito = c_n_produtos AND to_regclass('_mudelar_excel.onda8_atributos_novos') IS NOT NULL THEN
    RAISE NOTICE 'mudelar_excel_onda8: já aplicada (os % produtos já têm os atributos desta onda) — nada a fazer.', c_n_produtos;
    RETURN;
  END IF;
  IF v_pend <> c_n_produtos THEN
    RAISE EXCEPTION 'mudelar_excel_onda8: estado a meio ou a base mudou: % de % produtos ainda sem atributos e % já com os desta onda.', v_pend, c_n_produtos, v_feito;
  END IF;

  -- G5: o utilizador da auditoria existe e é membro ativo da Mudelar; a auditoria dos gatilhos está ligada
  IF NOT EXISTS (SELECT 1 FROM anew_users u WHERE u.id = c_criador AND u.deleted_at IS NULL)
     OR NOT EXISTS (SELECT 1 FROM anew_memberships ms WHERE ms.user_id = c_criador AND ms.organization_id = c_org AND ms.status = 'active') THEN
    RAISE EXCEPTION 'G5: o utilizador % não existe em anew_users, está apagado ou não é membro ativo da Mudelar.', c_criador;
  END IF;
  IF coalesce(current_setting('app.audit_bypass', true), '') = 'on' THEN
    RAISE EXCEPTION 'G5: app.audit_bypass está ligado: os atributos entrariam sem auditoria.';
  END IF;

  -- G6: dentro de cada família, os valores dos eixos são distintos (antes de escrever)
  SELECT count(*) INTO v_n FROM (
    SELECT z.family_id, z.k FROM (
      SELECT m.family_id,
             (SELECT string_agg(coalesce(v.value_text, '') || '|' || coalesce(v.value_json::text, ''), '#' ORDER BY ax.posicao, v.id)
              FROM product_family_axes ax LEFT JOIN product_attribute_values v ON v.product_id = m.product_id AND v.attribute_id = ax.attribute_id
              WHERE ax.family_id = m.family_id) AS k
      FROM product_family_members m JOIN product_families f ON f.id = m.family_id WHERE f.organization_id = c_org) z
    GROUP BY z.family_id, z.k HAVING count(*) > 1) d;
  IF v_n > 0 THEN RAISE EXCEPTION 'G6: % combinações de eixos repetidas dentro de famílias da Mudelar (antes de escrever).', v_n; END IF;

  -- ─── impressões digitais de partida ─────────────────────────────────────────────────────────────────
  -- products COM updated_at: inserir atributos não pode tocar em nenhuma linha de products (nome, preço, estado, SKU, modelo)
  SELECT md5(string_agg(p.id::text || '=' || p.sku, ',' ORDER BY p.id)) INTO v_h_sku_antes FROM products p WHERE p.organization_id = c_org;
  SELECT md5(string_agg(md5(to_jsonb(p)::text), '' ORDER BY p.id)) INTO v_h_prod_antes FROM products p WHERE p.organization_id = c_org;
  SELECT md5(coalesce(string_agg(md5(to_jsonb(pp)::text), '' ORDER BY pp.id), '')) INTO v_h_preco_antes
  FROM product_prices pp JOIN products p ON p.id = pp.product_id WHERE p.organization_id = c_org;
  SELECT md5(coalesce(string_agg(md5(to_jsonb(v)::text), '' ORDER BY v.id), '')), count(*) INTO v_h_attr_antes, v_pav_antes
  FROM product_attribute_values v JOIN products p ON p.id = v.product_id WHERE p.organization_id = c_org;
  SELECT md5(coalesce(string_agg(h, '' ORDER BY h), '')) INTO v_h_fam_antes FROM (
    SELECT 'f' || md5(to_jsonb(f)::text) AS h FROM product_families f WHERE f.organization_id = c_org
    UNION ALL SELECT 'm' || md5(to_jsonb(m)::text) FROM product_family_members m JOIN product_families f ON f.id = m.family_id WHERE f.organization_id = c_org
    UNION ALL SELECT 'a' || md5(to_jsonb(a)::text) FROM product_family_axes a JOIN product_families f ON f.id = a.family_id WHERE f.organization_id = c_org) z;

  -- ─── 3. Cópia (schema privado, só postgres) ─────────────────────────────────────────────────────────
  CREATE SCHEMA IF NOT EXISTS _mudelar_excel;
  REVOKE ALL ON SCHEMA _mudelar_excel FROM PUBLIC, anon, authenticated, service_role;
  IF to_regclass('_mudelar_excel.onda8_produtos') IS NOT NULL OR to_regclass('_mudelar_excel.onda8_atributos_novos') IS NOT NULL THEN
    RAISE EXCEPTION 'B1: a cópia _mudelar_excel.onda8_* já existe mas os produtos não têm os atributos desta onda: rever à mão.';
  END IF;
  CREATE TABLE _mudelar_excel.onda8_produtos (id uuid PRIMARY KEY, sku text NOT NULL, n_attr integer NOT NULL, linha jsonb NOT NULL,
    copiado_em timestamptz NOT NULL DEFAULT now());
  CREATE TABLE _mudelar_excel.onda8_atributos_novos (id uuid PRIMARY KEY, product_id uuid NOT NULL, attribute_id uuid NOT NULL, linha jsonb NOT NULL);
  REVOKE ALL ON ALL TABLES IN SCHEMA _mudelar_excel FROM PUBLIC, anon, authenticated, service_role;
  INSERT INTO _mudelar_excel.onda8_produtos (id, sku, n_attr, linha)
  SELECT p.id, s.sku, s.n_attr, to_jsonb(p) FROM products p JOIN _o8_prod s ON s.id = p.id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> c_n_produtos THEN RAISE EXCEPTION 'B2: % produtos copiados, esperados %.', v_n, c_n_produtos; END IF;

  -- ─── 4. Escrita: só INSERT em product_attribute_values, como cat_guardar_produto_atributos grava ─────
  -- opção: value_text = o value_text da opção, sem value_json nem unidade; medida: value_json {tipo, largura, comprimento,
  -- espessura, unidade} com cada número passado por fn_cat_dimensao_medida e value_text de fn_cat_dimensao_texto, unit =
  -- a unidade. Em product_attribute_values só há os gatilhos de auditoria (AFTER) e de updated_at (BEFORE UPDATE): nada
  -- recalcula o SKU, tira o modelo ou mexe em products. ON CONFLICT DO NOTHING e só em produtos ainda sem atributos.
  WITH x AS (
    SELECT a.product_id, a.attribute_id, a.opcao, a.med_tipo, a.med_u,
           public.fn_cat_dimensao_medida(to_jsonb(a.med_l), 'A largura') AS l,
           public.fn_cat_dimensao_medida(to_jsonb(a.med_c), 'O comprimento') AS c,
           CASE WHEN a.med_tipo = '3D' THEN public.fn_cat_dimensao_medida(to_jsonb(a.med_e), 'A espessura') END AS e
    FROM _o8_attr a WHERE a.med_tipo IS NOT NULL),
  ins AS (
    INSERT INTO product_attribute_values AS pav (product_id, attribute_id, value_text, value_json, unit)
    SELECT z.product_id, z.attribute_id, z.value_text, z.value_json, z.unit FROM (
      SELECT a.product_id, a.attribute_id, a.opcao AS value_text, NULL::jsonb AS value_json, NULL::text AS unit
      FROM _o8_attr a WHERE a.opcao IS NOT NULL
      UNION ALL
      SELECT x.product_id, x.attribute_id,
             public.fn_cat_dimensao_texto(x.l) || ' × ' || public.fn_cat_dimensao_texto(x.c)
               || CASE WHEN x.e IS NULL THEN '' ELSE ' × ' || public.fn_cat_dimensao_texto(x.e) END || ' ' || x.med_u,
             jsonb_build_object('tipo', x.med_tipo, 'largura', x.l, 'comprimento', x.c, 'espessura', x.e, 'unidade', x.med_u),
             x.med_u
      FROM x) z
    JOIN products p ON p.id = z.product_id AND p.organization_id = c_org AND NOT p.is_deleted
    WHERE NOT EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id = z.product_id)
    ORDER BY z.product_id, z.attribute_id
    ON CONFLICT (product_id, attribute_id) DO NOTHING
    RETURNING pav.id, pav.product_id, pav.attribute_id)
  INSERT INTO _mudelar_excel.onda8_atributos_novos (id, product_id, attribute_id, linha) SELECT ins.id, ins.product_id, ins.attribute_id, '{}'::jsonb FROM ins;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> c_n_attr THEN RAISE EXCEPTION 'W1: % atributos escritos, esperados %.', v_n, c_n_attr; END IF;
  UPDATE _mudelar_excel.onda8_atributos_novos n SET linha = to_jsonb(v) FROM product_attribute_values v WHERE v.id = n.id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> c_n_attr THEN RAISE EXCEPTION 'W1: % atributos copiados para a reversão, esperados %.', v_n, c_n_attr; END IF;

  -- ─── 5. Conferências ────────────────────────────────────────────────────────────────────────────────
  -- C1: cada valor ficou gravado como o ecrã o grava, e cada produto tem exatamente os atributos da lista
  SELECT count(*) INTO v_n FROM _o8_attr a JOIN product_attribute_values v ON v.product_id = a.product_id AND v.attribute_id = a.attribute_id
  WHERE a.opcao IS NOT NULL AND v.value_text = a.opcao AND v.value_json IS NULL AND v.unit IS NULL
    AND v.value_number IS NULL AND v.value_bool IS NULL AND v.value_date IS NULL;
  IF v_n <> c_n_opcao THEN RAISE EXCEPTION 'C1: só % de % opções ficaram gravadas como na lista.', v_n, c_n_opcao; END IF;
  SELECT count(*) INTO v_n FROM _o8_attr a JOIN product_attribute_values v ON v.product_id = a.product_id AND v.attribute_id = a.attribute_id
  WHERE a.med_tipo IS NOT NULL AND v.value_json ->> 'tipo' = a.med_tipo AND (v.value_json ->> 'largura')::numeric = a.med_l
    AND (v.value_json ->> 'comprimento')::numeric = a.med_c AND v.value_json ->> 'unidade' = a.med_u AND v.unit = a.med_u
    AND CASE WHEN a.med_tipo = '3D' THEN (v.value_json ->> 'espessura')::numeric = a.med_e ELSE v.value_json -> 'espessura' = 'null'::jsonb END
    AND v.value_text LIKE ('% ' || a.med_u) AND v.value_number IS NULL AND v.value_bool IS NULL AND v.value_date IS NULL;
  IF v_n <> c_n_medida THEN RAISE EXCEPTION 'C1: só % de % medidas ficaram gravadas como na lista.', v_n, c_n_medida; END IF;
  SELECT count(*) INTO v_n FROM _o8_prod s WHERE (SELECT count(*) FROM product_attribute_values v WHERE v.product_id = s.id) = s.n_attr;
  IF v_n <> c_n_produtos THEN RAISE EXCEPTION 'C1: só % de % produtos ficaram com exatamente os atributos da lista.', v_n, c_n_produtos; END IF;
  -- C2: auditoria: uma linha de INSERT por atributo novo, com a fonte desta onda (o gatilho engole os erros: conta-se)
  SELECT count(*), count(DISTINCT l.full_record ->> 'id') INTO v_n, v_m FROM entity_audit_log l
  WHERE l.table_name = 'product_attribute_values' AND l.operation = 'INSERT' AND l.created_at = now() AND l.source = c_fonte
    AND l.organization_id = c_org AND l.entity_id IN (SELECT s.id FROM _o8_prod s);
  IF v_n <> c_n_attr OR v_m <> c_n_attr THEN RAISE EXCEPTION 'C2: % linhas de auditoria dos atributos (% valores distintos), esperadas %.', v_n, v_m, c_n_attr; END IF;
  -- C3: nenhum SKU da Mudelar mudou e nenhuma linha de products mudou (nem updated_at: nome, preço, estado, modelo intactos)
  SELECT md5(string_agg(p.id::text || '=' || p.sku, ',' ORDER BY p.id)) INTO v_h_sku_depois FROM products p WHERE p.organization_id = c_org;
  IF v_h_sku_depois <> v_h_sku_antes THEN RAISE EXCEPTION 'C3: há SKU alterados na Mudelar.'; END IF;
  SELECT md5(string_agg(md5(to_jsonb(p)::text), '' ORDER BY p.id)) INTO v_h_prod_depois FROM products p WHERE p.organization_id = c_org;
  IF v_h_prod_depois <> v_h_prod_antes THEN RAISE EXCEPTION 'C3: mudaram linhas de products da Mudelar.'; END IF;
  SELECT count(*) INTO v_n FROM _mudelar_excel.onda8_produtos b JOIN products p ON p.id = b.id WHERE to_jsonb(p) = b.linha;
  IF v_n <> c_n_produtos THEN RAISE EXCEPTION 'C3: só % de % produtos da lista ficaram iguais à cópia.', v_n, c_n_produtos; END IF;
  SELECT count(*) INTO v_n FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.deleted_at IS NULL;
  IF v_n <> v_vivos_antes THEN RAISE EXCEPTION 'C3: a Mudelar ficou com % produtos vivos (eram %).', v_n, v_vivos_antes; END IF;
  -- C4: preços iguais
  SELECT md5(coalesce(string_agg(md5(to_jsonb(pp)::text), '' ORDER BY pp.id), '')) INTO v_h_preco_depois
  FROM product_prices pp JOIN products p ON p.id = pp.product_id WHERE p.organization_id = c_org;
  IF v_h_preco_depois <> v_h_preco_antes THEN RAISE EXCEPTION 'C4: mudaram preços da Mudelar.'; END IF;
  -- C5: os atributos que já existiam ficaram iguais e há exatamente c_n_attr novos
  SELECT md5(coalesce(string_agg(md5(to_jsonb(v)::text), '' ORDER BY v.id), '')), count(*) INTO v_h_attr_depois, v_n
  FROM product_attribute_values v JOIN products p ON p.id = v.product_id
  WHERE p.organization_id = c_org AND v.id NOT IN (SELECT n.id FROM _mudelar_excel.onda8_atributos_novos n);
  IF v_h_attr_depois <> v_h_attr_antes OR v_n <> v_pav_antes THEN RAISE EXCEPTION 'C5: mudaram valores de atributos da Mudelar que já existiam.'; END IF;
  SELECT count(*) INTO v_n FROM product_attribute_values v JOIN products p ON p.id = v.product_id WHERE p.organization_id = c_org;
  IF v_n <> v_pav_antes + c_n_attr THEN RAISE EXCEPTION 'C5: a Mudelar tem % valores de atributos; esperavam-se %.', v_n, v_pav_antes + c_n_attr; END IF;
  -- C6: famílias intactas (contagens, impressão digital e eixos distintos)
  SELECT count(*) INTO v_n FROM product_families f WHERE f.organization_id = c_org;
  SELECT count(*) INTO v_m FROM product_family_members m JOIN product_families f ON f.id = m.family_id WHERE f.organization_id = c_org;
  IF v_n <> c_n_fam OR v_m <> c_n_membros THEN
    RAISE EXCEPTION 'C6: a Mudelar ficou com % famílias e % membros (eram % e %).', v_n, v_m, c_n_fam, c_n_membros;
  END IF;
  SELECT md5(coalesce(string_agg(h, '' ORDER BY h), '')) INTO v_h_fam_depois FROM (
    SELECT 'f' || md5(to_jsonb(f)::text) AS h FROM product_families f WHERE f.organization_id = c_org
    UNION ALL SELECT 'm' || md5(to_jsonb(m)::text) FROM product_family_members m JOIN product_families f ON f.id = m.family_id WHERE f.organization_id = c_org
    UNION ALL SELECT 'a' || md5(to_jsonb(a)::text) FROM product_family_axes a JOIN product_families f ON f.id = a.family_id WHERE f.organization_id = c_org) z;
  IF v_h_fam_depois <> v_h_fam_antes THEN RAISE EXCEPTION 'C6: as famílias da Mudelar mudaram.'; END IF;
  SELECT count(*) INTO v_n FROM (
    SELECT z.family_id, z.k FROM (
      SELECT m.family_id,
             (SELECT string_agg(coalesce(v.value_text, '') || '|' || coalesce(v.value_json::text, ''), '#' ORDER BY ax.posicao, v.id)
              FROM product_family_axes ax LEFT JOIN product_attribute_values v ON v.product_id = m.product_id AND v.attribute_id = ax.attribute_id
              WHERE ax.family_id = m.family_id) AS k
      FROM product_family_members m JOIN product_families f ON f.id = m.family_id WHERE f.organization_id = c_org) z
    GROUP BY z.family_id, z.k HAVING count(*) > 1) d;
  IF v_n > 0 THEN RAISE EXCEPTION 'C6: % combinações de eixos repetidas dentro de famílias da Mudelar.', v_n; END IF;
  -- C7: nada escrito fora da Mudelar (nenhuma linha de outra organização tem o xmin desta transação)
  v_xid := (txid_current() % 4294967296)::text;
  SELECT (SELECT count(*) FROM products p WHERE p.xmin::text = v_xid)
       + (SELECT count(*) FROM product_attribute_values x JOIN products p ON p.id = x.product_id WHERE x.xmin::text = v_xid AND p.organization_id IS DISTINCT FROM c_org)
       + (SELECT count(*) FROM product_prices x WHERE x.xmin::text = v_xid)
    INTO v_n;
  IF v_n > 0 THEN RAISE EXCEPTION 'C7: % linhas escritas fora dos atributos da Mudelar.', v_n; END IF;
  -- C8: a cópia fica fechada (schema e tabelas sem privilégios para PUBLIC, anon, authenticated nem service_role)
  SELECT coalesce(n.nspacl::text, '') INTO v_acl FROM pg_namespace n WHERE n.nspname = '_mudelar_excel';
  IF v_acl LIKE '%anon=%' OR v_acl LIKE '%authenticated=%' OR v_acl LIKE '%service_role=%' OR v_acl LIKE '{=%' OR v_acl LIKE '%,=%' THEN
    RAISE EXCEPTION 'C8: o schema _mudelar_excel ficou aberto (%).', v_acl;
  END IF;
  FOR v_t IN SELECT c.oid::regclass::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = '_mudelar_excel' AND c.relkind::text = 'r' LOOP
    SELECT coalesce(c.relacl::text, '') INTO v_acl FROM pg_class c WHERE c.oid = to_regclass(v_t);
    IF v_acl LIKE '%anon=%' OR v_acl LIKE '%authenticated=%' OR v_acl LIKE '%service_role=%' OR v_acl LIKE '{=%' OR v_acl LIKE '%,=%' THEN
      RAISE EXCEPTION 'C8: % ficou aberta (%).', v_t, v_acl;
    END IF;
  END LOOP;

  RAISE NOTICE 'mudelar_excel_onda8: % produtos receberam % atributos (% medidas, % opções).', c_n_produtos, c_n_attr, c_n_medida, c_n_opcao;
END $mig$;

COMMIT;
