-- =============================================================================
-- Catálogo — MUDELAR igual aos Excels, ONDA 4b: REPOR os 3 produtos que a onda 4 arquivou por engano. MIGRATION DE DADOS.
-- Base de RH (uetjghdkwbywbftedtth).
-- =============================================================================
--
-- !!! SÓ PARA A BASE DE RH (uetjghdkwbywbftedtth). SÓ A MUDELAR (3242e925-da26-459a-8258-be04d904e355): todas as escritas
-- !!! levam a organização. Os ids, os SKU, as ligações a fornecedores e o estado foram lidos na RH a 27/11/2026 (SELECT como
-- !!! administrador, sem RLS), DEPOIS da onda 4 (20270129800000). Noutra base (a principal) a organização ou a cópia da onda 4
-- !!! não existem e a migration sai por RAISE NOTICE sem escrever nada. Antes do `db push`, confirmar
-- !!! supabase/.temp/project-ref = uetjghdkwbywbftedtth.
--
-- Pedido do dono: «tudo o que quero eh que me garanntas que na mudelar os produtos que la tem estao 100% iguais aos do excel»
-- (antes: «men so faz que teja tudo como nos excels sf»). A prova de igualdade (mudelar-audit/prova-igualdade.md, secção 7, e
-- prova-diferencas.csv, «arquivado reclamado por linha sem produto vivo») encontrou 3 linhas do Excel sem produto vivo porque a
-- onda 4 arquivou o produto delas: estavam «por decidir» desde a onda 1 (o Excel só acrescenta o código do fabricante ao nome).
--   EL-PL-0001-80  PLACA COM EXAUSTOR INTGRADO AEG 80CM          ← Eletrodomésticos.csv linha 26 (EP0012)
--   EL-MLL-0004-45 Máquina lavar loiça INDESIT 45CM               ← Eletrodomésticos.csv linha 49 (EMLL0007)
--   EL-MLL-0001-45 MÁQUINA DE LAVAR LOUÇA BALAY 45CM              ← Eletrodomésticos.csv linha 50 (EMLL0008)
-- Os 3 não têm referências em documentos (com_refs = false na cópia da onda 4) nem código de barras (nem em product_codes).
-- Uma busca por SKU, código de fornecedor e nome contra todos os Excels (base-mudelar) não encontrou mais nenhum dos outros 177
-- arquivados reclamado por uma linha sem produto vivo (onda4b-scripts/busca177.py, fora do projeto).
--
-- O QUE FAZ: repõe os 3 produtos (is_deleted = false, deleted_at = NULL, deleted_by = NULL, como estavam antes da onda 4) e a
-- única ligação a fornecedor de cada um (item_suppliers, Prome Retail S.A., a preferencial), arquivada pela onda 4 (lida na
-- cópia _mudelar_excel.onda4_item_suppliers): deleted_at e deleted_by voltam a NULL. O gatilho fn_item_suppliers_sync_preferred
-- (AFTER, «caso 1»: a ligação passa a preferencial ativa) volta a escrever products.supplier_id. O gatilho
-- fn_item_suppliers_check_preferred_conflict («Já existe um fornecedor preferencial», o que bloqueou a onda 1) só recusa se
-- houver outra preferencial viva de outro fornecedor: a guarda G3 exige que os 3 produtos não tenham nenhuma ligação viva.
-- Uma linha de auditoria por produto e por ligação (fn_manual_audit_log, com a auditoria dos gatilhos desligada só na escrita).
-- fn_products_barcode_guard: um produto cujo código de barras (o principal ou um aprendido em product_codes) esteja entretanto
-- noutro produto ativo da Mudelar NÃO se repõe e fica listado por NOTICE (a 27/11 nenhum dos 3 tem código de barras).
--
-- O QUE NÃO FAZ: não apaga nada (nenhum DELETE), não cria nada (nenhum INSERT, nenhum DDL além da tabela temporária), não muda
-- SKU (C2 exige 0 SKU alterados), nome, preços, atributos, códigos, famílias nem documentos; não toca nos outros 177
-- arquivados pela onda 4 nem na cópia da onda 4 (que continua a servir a reversão dela). Nenhum produto fora dos 3 muda (C3).
--
-- GUARDAS (falham a migration inteira; nada fica): G0 a Mudelar e a cópia da onda 4 existem (senão NOTICE e sai); L1 a lista tem
-- 3 produtos e 3 ligações; já aplicada → NOTICE e sai, a meio → falha; G1 contagens de partida (32147 produtos vivos, 145
-- consumíveis CONS- vivos, 548 famílias, 14637 membros); G2 cada produto está arquivado PELA ONDA 4 e ninguém lhe tocou depois
-- (deleted_by = utilizador da onda 4, deleted_at = updated_at = arquivado_em da cópia, resto igual à cópia, supplier_id NULL,
-- sem referências em documentos); G3 cada ligação está arquivada pela onda 4, igual à cópia, é a preferencial do fornecedor
-- esperado e é a ÚNICA ligação do produto (nenhuma outra viva, preferencial ou não); G4 o fornecedor existe, é da Mudelar e
-- está vivo; G5 o utilizador da auditoria é membro ativo e app.audit_bypass desligado.
-- Lock: pg_advisory_xact_lock(hashtextextended('cat_familias:' || org, 0)), os produtos e as ligações FOR NO KEY UPDATE por ordem.
-- CONFERÊNCIAS no fim: C1 os 3 produtos e as 3 ligações ficaram IGUAIS à cópia de antes da onda 4 (sem updated_at; o
-- supplier_id incluído); C2 0 SKU alterados (impressão digital id+sku); C3 produtos fora da lista iguais, 3 vivos e 32150 vivos
-- na Mudelar; C4 preços, atributos, códigos, organização e histórico iguais; C5 ligações fora da lista iguais e vivas + 3;
-- C6 145 consumíveis vivos; C7 548 famílias, 14637 membros e impressão digital; C8 documentos e receitas iguais; C9 nada escrito
-- fora da Mudelar (xmin); C10 o schema _mudelar_excel e as tabelas continuam fechados (ACL lida por ::text); C12 uma linha de
-- auditoria por escrita e nenhuma dos gatilhos.
--
-- REVERSÃO fora da pasta das migrations (estar aqui é ser aplicada): mudelar-reverter-onda4b.sql, guardado com o trabalho;
-- volta a arquivar os 3 e as ligações como a onda 4. Para a aplicar, entra como uma migration nova.
--
-- ORDEM: depois de 20270129800000 (última no remoto RH a 27/11). `supabase db push` aplica TUDO o que estiver pendente:
-- listar com `supabase migration list --linked` imediatamente antes e empurrar só esta (`db push --dry-run` lista só esta).
-- =============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

-- ─── 1. A lista fechada (tabela temporária: desaparece no COMMIT) ──────────────────────────────────
-- os 3 produtos: id, SKU, a ligação a fornecedor arquivada pela onda 4 e a linha do Excel que o reclama
CREATE TEMP TABLE _o4b_prod (id uuid PRIMARY KEY, sku text NOT NULL, isup_id uuid NOT NULL UNIQUE, linha_excel text NOT NULL) ON COMMIT DROP;
INSERT INTO _o4b_prod (id, sku, isup_id, linha_excel) VALUES
  ('98b724e0-72dd-4b56-9255-e71a969d8c83', 'EL-PL-0001-80', 'f15ed6d0-f220-4bb5-9ed7-62a9497ad1f8', 'EP0012'),
  ('aa35a10d-b228-418d-933a-13fcb8f2a64b', 'EL-MLL-0004-45', 'bc47e9c2-8af4-4565-a0ac-40ccec0bf0d8', 'EMLL0007'),
  ('b03d6e45-487a-4adf-bd93-95b24fd05303', 'EL-MLL-0001-45', '79ea2092-e87f-4676-888a-1e6577f25b62', 'EMLL0008');

-- ─── 2. Guardas, escrita e conferências (um só bloco: tudo ou nada) ────────────────────────────────
DO $mig$
DECLARE
  c_org           constant uuid    := '3242e925-da26-459a-8258-be04d904e355';
  c_criador       constant uuid    := 'ba0b0ebf-1bdb-43f9-b82b-a2ade29848e2';
  c_fornecedor    constant uuid    := 'ed680b15-b9f7-4a30-943e-64cc27d87005';
  c_fonte         constant text    := 'migration:mudelar_excel_onda4b';
  c_n_mudelar     constant integer := 32147;
  c_n_cons        constant integer := 145;
  c_n_fam         constant integer := 548;
  c_n_membros     constant integer := 14637;
  c_n_produtos    constant integer := 3;
  v_n bigint; v_m bigint; v_bloq bigint; v_repor bigint; v_isup_vivas bigint;
  v_txt text; v_acl text; v_xid text; v_t text;
  v_h_sku_antes text;   v_h_sku_depois text;
  v_h_out_antes text;   v_h_out_depois text;
  v_h_preco_antes text; v_h_preco_depois text;
  v_h_isup_antes text;  v_h_isup_depois text;
  v_h_attr_antes text;  v_h_attr_depois text;
  v_h_cod_antes text;   v_h_cod_depois text;
  v_h_fam_antes text;   v_h_fam_depois text;
  v_h_docs_antes text;  v_h_docs_depois text;
BEGIN
  -- G0: só a Mudelar da base de RH, depois da onda 4
  IF NOT EXISTS (SELECT 1 FROM anew_organizations o WHERE o.id = c_org AND o.name = 'Mudelar' AND o.deleted_at IS NULL) THEN
    RAISE NOTICE 'mudelar_excel_onda4b: a organização Mudelar (%) não existe nesta base — nada a fazer.', c_org;
    RETURN;
  END IF;
  IF to_regclass('_mudelar_excel.onda4_produtos') IS NULL OR to_regclass('_mudelar_excel.onda4_item_suppliers') IS NULL THEN
    RAISE NOTICE 'mudelar_excel_onda4b: a cópia da onda 4 (_mudelar_excel.onda4_*) não existe nesta base — nada a fazer.';
    RETURN;
  END IF;

  -- L1: a lista embutida tem os números do cabeçalho
  IF (SELECT count(*) FROM _o4b_prod) <> c_n_produtos OR (SELECT count(DISTINCT x.isup_id) FROM _o4b_prod x) <> c_n_produtos THEN
    RAISE EXCEPTION 'L1: a lista não tem % produtos e % ligações.', c_n_produtos, c_n_produtos;
  END IF;

  PERFORM set_config('app.audit_source', c_fonte, true);
  PERFORM set_config('app.audit_user_id', c_criador::text, true);
  -- o lock das funções das famílias do ecrã, e os produtos e as ligações presos até ao fim, por ordem fixa
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_familias:' || c_org::text, 0));
  PERFORM 1 FROM products p WHERE p.id IN (SELECT x.id FROM _o4b_prod x) ORDER BY p.id FOR NO KEY UPDATE;
  PERFORM 1 FROM item_suppliers i WHERE i.product_id IN (SELECT x.id FROM _o4b_prod x) ORDER BY i.id FOR NO KEY UPDATE;

  -- já aplicada? (os 3 vivos, com a ligação viva e o fornecedor de volta); a meio, falha
  SELECT count(*) INTO v_n FROM _o4b_prod x JOIN products p ON p.id = x.id
  WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.deleted_at IS NULL;
  SELECT count(*) INTO v_m FROM _o4b_prod x JOIN item_suppliers i ON i.id = x.isup_id
  WHERE i.organization_id = c_org AND i.deleted_at IS NULL;
  IF v_n = c_n_produtos AND v_m = c_n_produtos THEN
    RAISE NOTICE 'mudelar_excel_onda4b: já aplicada (os % produtos e as % ligações estão vivos) — nada a fazer.', c_n_produtos, c_n_produtos;
    RETURN;
  END IF;
  IF v_n > 0 OR v_m > 0 THEN
    RAISE EXCEPTION 'mudelar_excel_onda4b: estado a meio: % de % produtos e % de % ligações já estão vivos.', v_n, c_n_produtos, v_m, c_n_produtos;
  END IF;

  -- G1: contagens de partida
  SELECT count(*) INTO v_n FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.deleted_at IS NULL;
  IF v_n <> c_n_mudelar THEN RAISE EXCEPTION 'G1: a Mudelar tem % produtos vivos e esperavam-se %.', v_n, c_n_mudelar; END IF;
  SELECT count(*) INTO v_n FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.deleted_at IS NULL AND p.sku LIKE 'CONS-%';
  IF v_n <> c_n_cons THEN RAISE EXCEPTION 'G1: a Mudelar tem % consumíveis vivos e esperavam-se %.', v_n, c_n_cons; END IF;
  SELECT count(*) INTO v_n FROM product_families f WHERE f.organization_id = c_org;
  SELECT count(*) INTO v_m FROM product_family_members m JOIN product_families f ON f.id = m.family_id WHERE f.organization_id = c_org;
  IF v_n <> c_n_fam OR v_m <> c_n_membros THEN
    RAISE EXCEPTION 'G1: a Mudelar tem % famílias e % membros; esperavam-se % e %.', v_n, v_m, c_n_fam, c_n_membros;
  END IF;
  SELECT count(*) INTO v_isup_vivas FROM item_suppliers i WHERE i.organization_id = c_org AND i.deleted_at IS NULL;

  -- G2: cada produto foi arquivado PELA ONDA 4 e ninguém lhe tocou depois (estado exato esperado)
  SELECT count(*) INTO v_n FROM _o4b_prod x
  JOIN products p ON p.id = x.id
  JOIN _mudelar_excel.onda4_produtos b ON b.id = x.id
  WHERE p.organization_id = c_org AND p.sku IS NOT DISTINCT FROM x.sku AND b.linha->>'sku' = x.sku
    AND p.is_deleted AND p.deleted_by = c_criador AND p.deleted_at = b.arquivado_em AND p.updated_at = b.arquivado_em
    AND p.supplier_id IS NULL AND b.linha->>'supplier_id' = c_fornecedor::text
    AND NOT b.com_refs AND (b.linha->>'is_deleted')::boolean = false AND b.linha->>'deleted_at' IS NULL
    AND (to_jsonb(p) - ARRAY['updated_at', 'is_deleted', 'deleted_at', 'deleted_by', 'supplier_id'])
        = (b.linha - ARRAY['updated_at', 'is_deleted', 'deleted_at', 'deleted_by', 'supplier_id']);
  IF v_n <> c_n_produtos THEN
    SELECT string_agg(x.sku, '; ' ORDER BY x.sku) INTO v_txt FROM _o4b_prod x LEFT JOIN products p ON p.id = x.id
    WHERE p.id IS NULL OR NOT p.is_deleted OR p.deleted_by IS DISTINCT FROM c_criador OR p.supplier_id IS NOT NULL;
    RAISE EXCEPTION 'G2: só % de % produtos estão arquivados pela onda 4, intactos desde então. Fora do esperado: %', v_n, c_n_produtos, coalesce(v_txt, '(campos)');
  END IF;
  -- G2b: continuam sem referências em documentos
  SELECT count(*) INTO v_n FROM _o4b_prod x WHERE EXISTS (SELECT 1 FROM quote_lines t WHERE t.product_id = x.id)
     OR EXISTS (SELECT 1 FROM negocio_produtos t WHERE t.produto_id = x.id) OR EXISTS (SELECT 1 FROM purchase_order_items t WHERE t.product_id = x.id)
     OR EXISTS (SELECT 1 FROM purchase_order_receipts t WHERE t.product_id = x.id) OR EXISTS (SELECT 1 FROM receiving_scans t WHERE t.product_id = x.id)
     OR EXISTS (SELECT 1 FROM supplier_delivery_note_lines t WHERE t.product_id = x.id) OR EXISTS (SELECT 1 FROM stock_movements t WHERE t.product_id = x.id)
     OR EXISTS (SELECT 1 FROM product_family_members t WHERE t.product_id = x.id) OR EXISTS (SELECT 1 FROM service_materials t WHERE t.product_id = x.id);
  IF v_n > 0 THEN RAISE EXCEPTION 'G2: % produtos ganharam referências em documentos, famílias ou receitas desde a onda 4.', v_n; END IF;

  -- G3: cada ligação foi arquivada pela onda 4, está igual à cópia, é a preferencial do fornecedor esperado e é a ÚNICA do produto
  SELECT count(*) INTO v_n FROM _o4b_prod x
  JOIN item_suppliers i ON i.id = x.isup_id
  JOIN _mudelar_excel.onda4_item_suppliers b ON b.id = x.isup_id
  JOIN _mudelar_excel.onda4_produtos bp ON bp.id = x.id
  WHERE i.product_id = x.id AND b.product_id = x.id AND i.organization_id = c_org AND i.supplier_id = c_fornecedor AND i.is_preferred
    AND i.deleted_by = c_criador AND i.deleted_at = bp.arquivado_em AND i.updated_at = bp.arquivado_em AND b.linha->>'deleted_at' IS NULL
    AND (to_jsonb(i) - ARRAY['updated_at', 'deleted_at', 'deleted_by']) = (b.linha - ARRAY['updated_at', 'deleted_at', 'deleted_by']);
  IF v_n <> c_n_produtos THEN RAISE EXCEPTION 'G3: só % de % ligações estão arquivadas pela onda 4, intactas e preferenciais do fornecedor esperado.', v_n, c_n_produtos; END IF;
  SELECT count(*) INTO v_n FROM item_suppliers i WHERE i.product_id IN (SELECT x.id FROM _o4b_prod x) AND i.id NOT IN (SELECT x.isup_id FROM _o4b_prod x);
  SELECT count(*) INTO v_m FROM item_suppliers i WHERE i.product_id IN (SELECT x.id FROM _o4b_prod x) AND i.deleted_at IS NULL AND i.is_preferred;
  IF v_n > 0 OR v_m > 0 THEN
    RAISE EXCEPTION 'G3: os produtos têm % outras ligações e % preferenciais vivas (o gatilho de preferencial recusaria).', v_n, v_m;
  END IF;
  -- G4: o fornecedor existe, é da Mudelar e está vivo
  IF NOT EXISTS (SELECT 1 FROM suppliers s WHERE s.id = c_fornecedor AND s.organization_id = c_org AND s.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'G4: o fornecedor % não existe, não é da Mudelar ou está arquivado.', c_fornecedor;
  END IF;
  -- G5: o utilizador da auditoria existe e é membro ativo da Mudelar; a auditoria dos gatilhos está ligada
  IF NOT EXISTS (SELECT 1 FROM anew_users u WHERE u.id = c_criador AND u.deleted_at IS NULL)
     OR NOT EXISTS (SELECT 1 FROM anew_memberships ms WHERE ms.user_id = c_criador AND ms.organization_id = c_org AND ms.status = 'active') THEN
    RAISE EXCEPTION 'G5: o utilizador % não existe em anew_users, está apagado ou não é membro ativo da Mudelar.', c_criador;
  END IF;
  IF coalesce(current_setting('app.audit_bypass', true), '') = 'on' THEN
    RAISE EXCEPTION 'G5: app.audit_bypass já está ligado antes da escrita.';
  END IF;

  -- códigos de barras entretanto noutro produto ativo (fn_products_barcode_guard recusava): não se repõem, listam-se
  CREATE TEMP TABLE _o4b_bloq ON COMMIT DROP AS
  SELECT DISTINCT x.id FROM _o4b_prod x JOIN products p ON p.id = x.id
  WHERE EXISTS (
    SELECT 1 FROM (SELECT fn_product_code_key(p.barcode) AS k
                   UNION SELECT pc.code_key FROM product_codes pc WHERE pc.product_id = p.id AND pc.kind = 'barcode' AND pc.deleted_at IS NULL) kk
    WHERE kk.k IS NOT NULL AND (
      EXISTS (SELECT 1 FROM products o WHERE o.organization_id = c_org AND o.id <> p.id AND o.deleted_at IS NULL AND NOT o.is_deleted
              AND fn_product_code_key(o.barcode) = kk.k)
      OR EXISTS (SELECT 1 FROM product_codes pc JOIN products o ON o.id = pc.product_id
                 WHERE pc.organization_id = c_org AND pc.kind = 'barcode' AND pc.deleted_at IS NULL AND pc.code_key = kk.k
                   AND pc.product_id <> p.id AND o.deleted_at IS NULL AND NOT o.is_deleted)));
  SELECT count(*), string_agg(x.sku, '; ' ORDER BY x.sku) INTO v_bloq, v_txt FROM _o4b_bloq b JOIN _o4b_prod x ON x.id = b.id;
  IF v_bloq > 0 THEN
    RAISE NOTICE 'mudelar_excel_onda4b: % produtos NÃO repostos (código de barras noutro produto ativo da Mudelar): %', v_bloq, v_txt;
  END IF;
  v_repor := c_n_produtos - v_bloq;

  -- ─── impressões digitais de partida (sem updated_at) ───────────────────────────────────────────────
  SELECT md5(string_agg(p.id::text || '=' || p.sku, ',' ORDER BY p.id)) INTO v_h_sku_antes FROM products p WHERE p.organization_id = c_org;
  SELECT md5(string_agg(md5((to_jsonb(p) - 'updated_at')::text), '' ORDER BY p.id)) INTO v_h_out_antes
  FROM products p WHERE p.organization_id = c_org AND p.id NOT IN (SELECT x.id FROM _o4b_prod x);
  SELECT md5(coalesce(string_agg(md5((to_jsonb(pp) - 'updated_at')::text), '' ORDER BY pp.id), '')) INTO v_h_preco_antes
  FROM product_prices pp JOIN products p ON p.id = pp.product_id WHERE p.organization_id = c_org;
  SELECT md5(coalesce(string_agg(md5((to_jsonb(i) - 'updated_at')::text), '' ORDER BY i.id), '')) INTO v_h_isup_antes
  FROM item_suppliers i JOIN products p ON p.id = i.product_id
  WHERE p.organization_id = c_org AND i.id NOT IN (SELECT x.isup_id FROM _o4b_prod x);
  SELECT md5(coalesce(string_agg(md5((to_jsonb(v) - 'updated_at')::text), '' ORDER BY v.id), '')) INTO v_h_attr_antes
  FROM product_attribute_values v JOIN products p ON p.id = v.product_id WHERE p.organization_id = c_org;
  SELECT md5(coalesce(string_agg(h, '' ORDER BY h), '')) INTO v_h_cod_antes FROM (
    SELECT 'c' || md5((to_jsonb(t) - 'updated_at')::text) AS h FROM product_codes t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'o' || md5((to_jsonb(t) - 'updated_at')::text) FROM product_organizations t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'h' || md5(to_jsonb(t)::text) FROM product_price_history t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org) z;
  SELECT md5(coalesce(string_agg(h, '' ORDER BY h), '')) INTO v_h_fam_antes FROM (
    SELECT 'f' || md5((to_jsonb(f) - 'updated_at')::text) AS h FROM product_families f WHERE f.organization_id = c_org
    UNION ALL SELECT 'm' || md5(to_jsonb(m)::text) FROM product_family_members m JOIN product_families f ON f.id = m.family_id WHERE f.organization_id = c_org
    UNION ALL SELECT 'a' || md5(to_jsonb(a)::text) FROM product_family_axes a JOIN product_families f ON f.id = a.family_id WHERE f.organization_id = c_org) z;
  SELECT md5(coalesce(string_agg(h, '' ORDER BY h), '')) INTO v_h_docs_antes FROM (
    SELECT 'q' || md5((to_jsonb(t) - 'updated_at')::text) AS h FROM quote_lines t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'n' || md5(to_jsonb(t)::text) FROM negocio_produtos t JOIN products p ON p.id = t.produto_id WHERE p.organization_id = c_org
    UNION ALL SELECT 's' || md5((to_jsonb(t) - 'updated_at')::text) FROM service_materials t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'c' || md5((to_jsonb(t) - 'updated_at')::text) FROM purchase_order_items t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'r' || md5(to_jsonb(t)::text) FROM purchase_order_receipts t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'e' || md5(to_jsonb(t)::text) FROM receiving_scans t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'g' || md5(to_jsonb(t)::text) FROM supplier_delivery_note_lines t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'm' || md5(to_jsonb(t)::text) FROM stock_movements t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'v' || md5((to_jsonb(t) - 'atualizada_em')::text) FROM negocio_vista_cliente t WHERE t.organization_id = c_org) z;

  -- ─── 3. Escrita (auditoria dos gatilhos desligada só aqui; o gatilho de preferencial repõe products.supplier_id) ──
  PERFORM set_config('app.audit_bypass', 'on', true);
  -- W1: os produtos (is_deleted, deleted_at e deleted_by, os três, como antes da onda 4)
  UPDATE products p SET is_deleted = false, deleted_at = NULL, deleted_by = NULL
  WHERE p.id IN (SELECT x.id FROM _o4b_prod x) AND p.id NOT IN (SELECT b.id FROM _o4b_bloq b)
    AND p.organization_id = c_org AND p.is_deleted AND p.deleted_by = c_criador;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> v_repor THEN RAISE EXCEPTION 'W1: % produtos repostos, esperados %.', v_n, v_repor; END IF;
  -- W2: a ligação de cada produto reposto (só a arquivada pela onda 4, pela cópia)
  UPDATE item_suppliers i SET deleted_at = NULL, deleted_by = NULL, updated_at = now()
  FROM _o4b_prod x JOIN _mudelar_excel.onda4_item_suppliers b ON b.id = x.isup_id
  WHERE i.id = x.isup_id AND i.product_id = x.id AND x.id NOT IN (SELECT bl.id FROM _o4b_bloq bl)
    AND i.organization_id = c_org AND i.deleted_at IS NOT NULL AND i.deleted_by = c_criador;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> v_repor THEN RAISE EXCEPTION 'W2: % ligações repostas, esperadas %.', v_n, v_repor; END IF;
  PERFORM set_config('app.audit_bypass', 'off', true);
  IF current_setting('app.audit_bypass', true) <> 'off' THEN RAISE EXCEPTION 'W2: app.audit_bypass não voltou a off.'; END IF;
  -- W3: uma linha de auditoria por produto e por ligação repostos
  PERFORM fn_manual_audit_log('products', x.id, c_org, 'UPDATE',
    jsonb_build_object('products', jsonb_build_object(
      'is_deleted', jsonb_build_object('old', to_jsonb(true), 'new', to_jsonb(false)),
      'deleted_at', jsonb_build_object('old', to_jsonb(b.arquivado_em), 'new', NULL))), c_fonte)
  FROM _o4b_prod x JOIN _mudelar_excel.onda4_produtos b ON b.id = x.id WHERE x.id NOT IN (SELECT bl.id FROM _o4b_bloq bl);
  PERFORM fn_manual_audit_log('item_suppliers', x.isup_id, c_org, 'UPDATE',
    jsonb_build_object(
      'deleted_at', jsonb_build_object('old', to_jsonb(b.arquivado_em), 'new', NULL),
      'deleted_by', jsonb_build_object('old', to_jsonb(c_criador), 'new', NULL)), c_fonte)
  FROM _o4b_prod x JOIN _mudelar_excel.onda4_produtos b ON b.id = x.id WHERE x.id NOT IN (SELECT bl.id FROM _o4b_bloq bl);

  -- ─── 4. Conferências ──────────────────────────────────────────────────────────────────────────────
  -- C1: os produtos e as ligações repostos ficaram IGUAIS à cópia de antes da onda 4 (supplier_id incluído)
  SELECT count(*) INTO v_n FROM _o4b_prod x JOIN products p ON p.id = x.id JOIN _mudelar_excel.onda4_produtos b ON b.id = x.id
  WHERE x.id NOT IN (SELECT bl.id FROM _o4b_bloq bl)
    AND ((to_jsonb(p) - 'updated_at') IS DISTINCT FROM (b.linha - 'updated_at') OR p.supplier_id IS DISTINCT FROM c_fornecedor);
  IF v_n > 0 THEN RAISE EXCEPTION 'C1: % produtos repostos não ficaram iguais à cópia de antes da onda 4.', v_n; END IF;
  SELECT count(*) INTO v_n FROM _o4b_prod x JOIN item_suppliers i ON i.id = x.isup_id JOIN _mudelar_excel.onda4_item_suppliers b ON b.id = x.isup_id
  WHERE x.id NOT IN (SELECT bl.id FROM _o4b_bloq bl)
    AND ((to_jsonb(i) - 'updated_at') IS DISTINCT FROM (b.linha - 'updated_at') OR i.deleted_at IS NOT NULL OR NOT i.is_preferred);
  IF v_n > 0 THEN RAISE EXCEPTION 'C1: % ligações repostas não ficaram iguais à cópia de antes da onda 4.', v_n; END IF;
  -- C2: nenhum SKU da Mudelar mudou
  SELECT md5(string_agg(p.id::text || '=' || p.sku, ',' ORDER BY p.id)) INTO v_h_sku_depois FROM products p WHERE p.organization_id = c_org;
  IF v_h_sku_depois <> v_h_sku_antes THEN RAISE EXCEPTION 'C2: há SKU alterados na Mudelar.'; END IF;
  -- C3: os produtos fora da lista ficaram iguais (sem updated_at); os 3 vivos e o total de vivos
  SELECT md5(string_agg(md5((to_jsonb(p) - 'updated_at')::text), '' ORDER BY p.id)) INTO v_h_out_depois
  FROM products p WHERE p.organization_id = c_org AND p.id NOT IN (SELECT x.id FROM _o4b_prod x);
  IF v_h_out_depois <> v_h_out_antes THEN RAISE EXCEPTION 'C3: mudaram produtos da Mudelar que não são desta onda.'; END IF;
  SELECT count(*) INTO v_n FROM _o4b_prod x JOIN products p ON p.id = x.id WHERE NOT p.is_deleted AND p.deleted_at IS NULL;
  IF v_n <> v_repor THEN RAISE EXCEPTION 'C3: % dos produtos da lista estão vivos; esperavam-se %.', v_n, v_repor; END IF;
  SELECT count(*) INTO v_n FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.deleted_at IS NULL;
  IF v_n <> c_n_mudelar + v_repor THEN
    RAISE EXCEPTION 'C3: a Mudelar ficou com % produtos vivos; esperavam-se %.', v_n, c_n_mudelar + v_repor;
  END IF;
  -- C4: preços, atributos, códigos, organização e histórico de preços iguais
  SELECT md5(coalesce(string_agg(md5((to_jsonb(pp) - 'updated_at')::text), '' ORDER BY pp.id), '')) INTO v_h_preco_depois
  FROM product_prices pp JOIN products p ON p.id = pp.product_id WHERE p.organization_id = c_org;
  IF v_h_preco_depois <> v_h_preco_antes THEN RAISE EXCEPTION 'C4: mudaram preços da Mudelar.'; END IF;
  SELECT md5(coalesce(string_agg(md5((to_jsonb(v) - 'updated_at')::text), '' ORDER BY v.id), '')) INTO v_h_attr_depois
  FROM product_attribute_values v JOIN products p ON p.id = v.product_id WHERE p.organization_id = c_org;
  IF v_h_attr_depois <> v_h_attr_antes THEN RAISE EXCEPTION 'C4: mudaram atributos da Mudelar.'; END IF;
  SELECT md5(coalesce(string_agg(h, '' ORDER BY h), '')) INTO v_h_cod_depois FROM (
    SELECT 'c' || md5((to_jsonb(t) - 'updated_at')::text) AS h FROM product_codes t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'o' || md5((to_jsonb(t) - 'updated_at')::text) FROM product_organizations t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'h' || md5(to_jsonb(t)::text) FROM product_price_history t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org) z;
  IF v_h_cod_depois <> v_h_cod_antes THEN RAISE EXCEPTION 'C4: mudaram códigos, organizações ou o histórico de preços da Mudelar.'; END IF;
  -- C5: ligações a fornecedores fora da lista iguais; vivas contadas
  SELECT md5(coalesce(string_agg(md5((to_jsonb(i) - 'updated_at')::text), '' ORDER BY i.id), '')) INTO v_h_isup_depois
  FROM item_suppliers i JOIN products p ON p.id = i.product_id
  WHERE p.organization_id = c_org AND i.id NOT IN (SELECT x.isup_id FROM _o4b_prod x);
  IF v_h_isup_depois <> v_h_isup_antes THEN RAISE EXCEPTION 'C5: mudaram ligações a fornecedores que não são desta onda.'; END IF;
  SELECT count(*) INTO v_n FROM item_suppliers i WHERE i.organization_id = c_org AND i.deleted_at IS NULL;
  IF v_n <> v_isup_vivas + v_repor THEN RAISE EXCEPTION 'C5: a Mudelar ficou com % ligações vivas; esperavam-se %.', v_n, v_isup_vivas + v_repor; END IF;
  -- C6: os consumíveis vivos continuam os mesmos
  SELECT count(*) INTO v_n FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.deleted_at IS NULL AND p.sku LIKE 'CONS-%';
  IF v_n <> c_n_cons THEN RAISE EXCEPTION 'C6: a Mudelar ficou com % consumíveis vivos; esperavam-se %.', v_n, c_n_cons; END IF;
  -- C7: famílias intactas (contagens e impressão digital)
  SELECT count(*) INTO v_n FROM product_families f WHERE f.organization_id = c_org;
  SELECT count(*) INTO v_m FROM product_family_members m JOIN product_families f ON f.id = m.family_id WHERE f.organization_id = c_org;
  IF v_n <> c_n_fam OR v_m <> c_n_membros THEN
    RAISE EXCEPTION 'C7: a Mudelar ficou com % famílias e % membros (eram % e %).', v_n, v_m, c_n_fam, c_n_membros;
  END IF;
  SELECT md5(coalesce(string_agg(h, '' ORDER BY h), '')) INTO v_h_fam_depois FROM (
    SELECT 'f' || md5((to_jsonb(f) - 'updated_at')::text) AS h FROM product_families f WHERE f.organization_id = c_org
    UNION ALL SELECT 'm' || md5(to_jsonb(m)::text) FROM product_family_members m JOIN product_families f ON f.id = m.family_id WHERE f.organization_id = c_org
    UNION ALL SELECT 'a' || md5(to_jsonb(a)::text) FROM product_family_axes a JOIN product_families f ON f.id = a.family_id WHERE f.organization_id = c_org) z;
  IF v_h_fam_depois <> v_h_fam_antes THEN RAISE EXCEPTION 'C7: as famílias da Mudelar mudaram.'; END IF;
  -- C8: orçamentos, negócios, receitas, compras, receções, guias, stock e a vista do cliente iguais
  SELECT md5(coalesce(string_agg(h, '' ORDER BY h), '')) INTO v_h_docs_depois FROM (
    SELECT 'q' || md5((to_jsonb(t) - 'updated_at')::text) AS h FROM quote_lines t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'n' || md5(to_jsonb(t)::text) FROM negocio_produtos t JOIN products p ON p.id = t.produto_id WHERE p.organization_id = c_org
    UNION ALL SELECT 's' || md5((to_jsonb(t) - 'updated_at')::text) FROM service_materials t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'c' || md5((to_jsonb(t) - 'updated_at')::text) FROM purchase_order_items t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'r' || md5(to_jsonb(t)::text) FROM purchase_order_receipts t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'e' || md5(to_jsonb(t)::text) FROM receiving_scans t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'g' || md5(to_jsonb(t)::text) FROM supplier_delivery_note_lines t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'm' || md5(to_jsonb(t)::text) FROM stock_movements t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'v' || md5((to_jsonb(t) - 'atualizada_em')::text) FROM negocio_vista_cliente t WHERE t.organization_id = c_org) z;
  IF v_h_docs_depois <> v_h_docs_antes THEN RAISE EXCEPTION 'C8: mudaram documentos, receitas ou vistas da Mudelar.'; END IF;
  -- C9: nada escrito fora da Mudelar (nenhuma linha de outra organização tem o xmin desta transação)
  v_xid := (txid_current() % 4294967296)::text;
  SELECT (SELECT count(*) FROM products p WHERE p.xmin::text = v_xid AND p.organization_id IS DISTINCT FROM c_org)
       + (SELECT count(*) FROM item_suppliers x WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org)
       + (SELECT count(*) FROM entity_audit_log x WHERE x.created_at = now() AND x.source = c_fonte AND x.organization_id IS DISTINCT FROM c_org)
    INTO v_n;
  IF v_n > 0 THEN RAISE EXCEPTION 'C9: % linhas de outras organizações foram escritas.', v_n; END IF;
  -- C10: a cópia continua fechada (schema e tabelas sem privilégios para PUBLIC, anon, authenticated nem service_role)
  SELECT coalesce(n.nspacl::text, '') INTO v_acl FROM pg_namespace n WHERE n.nspname = '_mudelar_excel';
  IF v_acl LIKE '%anon=%' OR v_acl LIKE '%authenticated=%' OR v_acl LIKE '%service_role=%' OR v_acl LIKE '{=%' OR v_acl LIKE '%,=%' THEN
    RAISE EXCEPTION 'C10: o schema _mudelar_excel ficou aberto (%).', v_acl;
  END IF;
  FOR v_t IN SELECT c.oid::regclass::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = '_mudelar_excel' AND c.relkind::text = 'r' LOOP
    SELECT coalesce(c.relacl::text, '') INTO v_acl FROM pg_class c WHERE c.oid = to_regclass(v_t);
    IF v_acl LIKE '%anon=%' OR v_acl LIKE '%authenticated=%' OR v_acl LIKE '%service_role=%' OR v_acl LIKE '{=%' OR v_acl LIKE '%,=%' THEN
      RAISE EXCEPTION 'C10: % ficou aberta (%).', v_t, v_acl;
    END IF;
  END LOOP;
  -- C12: uma linha de auditoria por produto e por ligação repostos, e nenhuma dos gatilhos (now() = o início desta transação)
  SELECT count(*) INTO v_n FROM entity_audit_log l
  WHERE l.created_at = now() AND l.source = c_fonte AND l.changed_by = c_criador AND l.table_name = 'products' AND l.entity_id IN (SELECT x.id FROM _o4b_prod x);
  IF v_n <> v_repor THEN RAISE EXCEPTION 'C12: % linhas de auditoria dos produtos, esperadas %.', v_n, v_repor; END IF;
  SELECT count(*) INTO v_n FROM entity_audit_log l
  WHERE l.created_at = now() AND l.source = c_fonte AND l.changed_by = c_criador AND l.table_name = 'item_suppliers' AND l.entity_id IN (SELECT x.isup_id FROM _o4b_prod x);
  IF v_n <> v_repor THEN RAISE EXCEPTION 'C12: % linhas de auditoria das ligações, esperadas %.', v_n, v_repor; END IF;
  SELECT count(*) INTO v_n FROM entity_audit_log l WHERE l.created_at = now() AND l.entity_id IN (SELECT x.id FROM _o4b_prod x UNION ALL SELECT x.isup_id FROM _o4b_prod x);
  IF v_n <> 2 * v_repor THEN RAISE EXCEPTION 'C12: % linhas de auditoria destes produtos e ligações nesta transação, esperadas %.', v_n, 2 * v_repor; END IF;

  RAISE NOTICE 'mudelar_excel_onda4b: % produtos repostos com a ligação ao fornecedor (% não repostos por código de barras).', v_repor, v_bloq;
END $mig$;

COMMIT;
