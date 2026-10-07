-- 20261210100000: aprender códigos (Fase 2 — fatia 3)
--
-- Na receção por código, uma leitura não reconhecida pode ser associada a um
-- produto ("aprender"): código de barras (EAN/DUN, eventualmente de uma
-- caixa) ou referência do fornecedor. O código passa a ser reconhecido pelo
-- lookup (níveis 1 e 2) e a leitura pode converter caixas↔unidades.
--
-- Regras (decisões aprovadas em 06/10/2026):
--   1 Onde gravar: tabela nova product_codes; products.barcode continua o
--     código principal. D5 (único por organização) vale ENTRE as duas.
--   2 Normalização (fn_product_code_key): só dígitos com 8–14 → lpad 14 com
--     zeros (EAN-13 = 0+EAN-13); resto → lower(btrim()).
--   3 Quem associa: (purchase_orders.receive E inventory.edit) OU
--     products.edit. Definir a unidade 'un' num produto sem unidade:
--     products.edit e sem linhas/ligações do produto noutra unidade. Criar
--     embalagens (uom) não é destas RPCs (tabela uom, products.manage).
--   4 Desfazer (rpc_product_code_remove): anulação lógica com motivo; autor
--     nas primeiras 24 h ou products.edit; não reverte receções; devolve
--     quantas leituras usaram o código.
--   5 Conversão caixa↔unidades (p_unit_conversion, por omissão false): só
--     caixas inteiras de cada linha, ordem linhas da guia → D2 sem preferir a
--     unidade lida; resto ≠ 0 → recusa tudo (23514). Flag desligada = caminho
--     da fatia 2 intacto. result.unit_conversion = true só com a flag; um
--     p_request_id gravado com a outra opção → 23514.
--   6 Produto sem unidade: p_set_product_uom = true define 'un' se não houver
--     conflitos.
--   7 Linhas da guia noutra unidade da mesma base que a linha da PO: aceites
--     (rpc_delivery_note_save).
--   Lookup: comparação por chave normalizada em products.barcode e
--   product_codes; supplier_sku (POs, item_suppliers) e SKU continuam com a
--   comparação antiga (lower(btrim())). Produto apagado não bloqueia códigos;
--   restaurá-lo com um código já usado → 23505. Um código aprendido de um
--   produto apagado é anulado quando o mesmo código é associado a outro.
--
-- Objetos:
--   + fn_product_code_key(text)          IMMUTABLE
--   + product_codes (+ índices únicos parciais, RLS só SELECT, auditoria)
--   + fn_product_codes_guard / fn_products_barcode_guard + gatilhos (D5)
--   + uq_products_barcode_key (índice único em products)
--   + fn_product_code_json (interna), rpc_product_code_learn, rpc_product_code_remove
--   ~ rpc_receiving_lookup / rpc_receive_by_code: DROP + CREATE a partir do
--     pg_get_functiondef VIVO (fatia 2), p_unit_conversion boolean DEFAULT
--     false no fim; owner/GRANTs repostos iguais.
--   ~ rpc_delivery_note_save: CREATE OR REPLACE (mesma assinatura), só retira
--     a recusa "linha noutra unidade".
--   Nenhuma função da Fase 1 (receção, reversão, destino, anulação do resto)
--   nem fn_receiving_open_lines / fn_receiving_scan_replay é alterada.
--
-- Concorrência: advisory 'product_code:<org>:<chave>' (código de barras) e
-- 'product_code:<org>:<fornecedor>:<chave>' (referência), sempre antes das
-- verificações; os gatilhos de products tomam os locks das chaves por ordem.
-- A receção mantém a ordem global de locks da fatia 2 (guia → leitura →
-- produto → POs → EC → Fase 1); a conversão só muda o plano.
--
-- Reversão no fim do ficheiro (comentada).

SET lock_timeout = '5s';

-- ── 1. Chave normalizada de um código ──────────────────────────────────────
-- GTIN (só dígitos, 8 a 14) → lpad a 14 com zeros (EAN-13 = 0+EAN-13 =
-- GTIN-14 com zero à esquerda); resto → lower(btrim()). Vazio/NULL → NULL.
-- IMMUTABLE (usada em índices e na coluna gerada); só funções do catálogo.
CREATE OR REPLACE FUNCTION public.fn_product_code_key(p_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  SELECT CASE
           WHEN s.c IS NULL OR s.c = '' THEN NULL
           WHEN s.c ~ '^[0-9]{8,14}$' THEN lpad(s.c, 14, '0')
           ELSE lower(s.c)
         END
  FROM (SELECT btrim(p_code) AS c) s
$function$;

ALTER FUNCTION public.fn_product_code_key(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_product_code_key(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_product_code_key(text) TO authenticated, service_role;

-- ── 2. Códigos aprendidos ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.product_codes (
  id              uuid PRIMARY KEY,  -- gerado pelo cliente (idempotência)
  organization_id uuid NOT NULL REFERENCES public.anew_organizations(id),
  code            text NOT NULL CHECK (btrim(code) <> '' AND char_length(code) <= 200),
  code_key        text GENERATED ALWAYS AS (public.fn_product_code_key(code)) STORED,
  kind            text NOT NULL CHECK (kind IN ('barcode', 'supplier_ref')),
  product_id      uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  uom_id          uuid REFERENCES public.uom(id),       -- NULL = unidade do produto
  supplier_id     uuid REFERENCES public.suppliers(id), -- obrigatório em supplier_ref
  source          text NOT NULL CHECK (source IN ('receiving', 'product_form', 'catalog')),
  context         jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(context) = 'object'),
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  deleted_by      uuid,
  delete_reason   text CHECK (delete_reason IS NULL OR char_length(delete_reason) <= 1000),
  CONSTRAINT product_codes_supplier_ref_chk CHECK (kind <> 'supplier_ref' OR supplier_id IS NOT NULL),
  CONSTRAINT product_codes_deleted_chk CHECK (deleted_at IS NULL OR delete_reason IS NOT NULL)
);

COMMENT ON TABLE public.product_codes IS
  'Códigos aprendidos (código de barras / referência do fornecedor) → produto + unidade. products.barcode continua o código principal; os dois são únicos por organização (D5). Só escrito por RPCs (rpc_product_code_learn / rpc_product_code_remove). Anulação lógica.';

-- Um código ativo = um produto (por organização; referência por fornecedor).
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_codes_barcode
  ON public.product_codes (organization_id, code_key)
  WHERE deleted_at IS NULL AND kind = 'barcode';
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_codes_supplier_ref
  ON public.product_codes (organization_id, supplier_id, code_key)
  WHERE deleted_at IS NULL AND kind = 'supplier_ref';
CREATE INDEX IF NOT EXISTS idx_product_codes_key
  ON public.product_codes (organization_id, code_key) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_product_codes_product
  ON public.product_codes (product_id) WHERE deleted_at IS NULL;

ALTER TABLE public.product_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.product_codes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.product_codes TO authenticated;
GRANT ALL ON TABLE public.product_codes TO service_role;

DROP POLICY IF EXISTS product_codes_select ON public.product_codes;
CREATE POLICY product_codes_select ON public.product_codes
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
         AND (public.has_anew_permission((SELECT auth.uid()), 'products.view')
              OR public.has_anew_permission((SELECT auth.uid()), 'purchase_orders.receive')));

DROP TRIGGER IF EXISTS trg_audit_product_codes ON public.product_codes;
CREATE TRIGGER trg_audit_product_codes
  AFTER INSERT OR DELETE OR UPDATE ON public.product_codes
  FOR EACH ROW EXECUTE FUNCTION public.fn_generic_entity_audit();

-- ── 3. D5 entre tabelas: código de barras único por organização ────────────
-- products.barcode (produtos ativos) e product_codes (kind barcode, ativos)
-- partilham a mesma chave. Cada sentido: advisory lock por chave
-- 'product_code:<org>:<chave>' + verificação na outra tabela → 23505 com o
-- nome do produto. Produto apagado não bloqueia; restaurá-lo em conflito → 23505.

-- 3a. Gatilho em product_codes
CREATE OR REPLACE FUNCTION public.fn_product_codes_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_key   text := public.fn_product_code_key(NEW.code);  -- code_key (gerada) ainda não está calculada num BEFORE
  v_org   uuid;
  v_other record;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL
     AND v_key IS NOT DISTINCT FROM OLD.code_key AND NEW.kind = OLD.kind
     AND NEW.product_id = OLD.product_id AND NEW.organization_id = OLD.organization_id THEN
    RETURN NEW;
  END IF;

  SELECT organization_id INTO v_org FROM public.products WHERE id = NEW.product_id;
  IF v_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'O produto do código não pertence à organização do código' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.kind = 'barcode' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('product_code:' || NEW.organization_id::text || ':' || v_key, 0));
    SELECT p.id, p.name, p.sku INTO v_other
    FROM public.products p
    WHERE p.organization_id = NEW.organization_id AND p.id <> NEW.product_id
      AND p.deleted_at IS NULL AND NOT p.is_deleted
      AND public.fn_product_code_key(p.barcode) = v_key
    ORDER BY p.id
    LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'O código de barras «%» já é o código do produto «%» (%)', btrim(NEW.code), v_other.name, v_other.sku
        USING ERRCODE = 'unique_violation', DETAIL = v_other.id::text,
              HINT = 'Um código de barras só pode estar num produto ativo da organização (id do produto em DETAIL).';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

ALTER FUNCTION public.fn_product_codes_guard() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_product_codes_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_product_codes_guard() TO service_role;

DROP TRIGGER IF EXISTS trg_product_codes_guard ON public.product_codes;
CREATE TRIGGER trg_product_codes_guard
  BEFORE INSERT OR UPDATE ON public.product_codes
  FOR EACH ROW EXECUTE FUNCTION public.fn_product_codes_guard();

-- 3b. Gatilho em products (barcode, apagar/restaurar, mudar de organização)
CREATE OR REPLACE FUNCTION public.fn_products_barcode_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_own   text;
  v_keys  text[];
  v_k     text;
  v_other record;
  v_found boolean;
  v_upsert uuid;  -- INSERT: produto já existente com a mesma (organization_id, sku)
BEGIN
  IF NEW.organization_id IS NULL OR NEW.deleted_at IS NOT NULL OR NEW.is_deleted THEN
    RETURN NEW;  -- produto apagado (ou sem organização) não bloqueia
  END IF;

  v_own := public.fn_product_code_key(NEW.barcode);

  -- INSERT … ON CONFLICT (sku, organization_id) DO UPDATE (rpc_bulk_import_products):
  -- o BEFORE INSERT corre antes de o conflito ser resolvido, por isso o produto
  -- com a mesma (organization_id, sku) — igualdade exata, como o índice
  -- products_sku_organization_id_key — é o próprio produto, não "outro". Se a
  -- linha for mesmo inserida, esse produto não existe (o índice impede); se
  -- houver conflito, o BEFORE UPDATE OF barcode/... verifica com o id real.
  IF TG_OP = 'INSERT' AND NEW.sku IS NOT NULL THEN
    SELECT p.id INTO v_upsert
    FROM public.products p
    WHERE p.organization_id = NEW.organization_id AND p.sku = NEW.sku;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL AND NOT OLD.is_deleted
     AND OLD.organization_id IS NOT DISTINCT FROM NEW.organization_id THEN
    -- Continua ativo na mesma organização: só o código principal pode mudar.
    IF v_own IS NULL OR v_own IS NOT DISTINCT FROM public.fn_product_code_key(OLD.barcode) THEN
      RETURN NEW;
    END IF;
    v_keys := ARRAY[v_own];
  ELSE
    -- Novo, restaurado da lixeira ou noutra organização: o código principal
    -- e os códigos aprendidos ativos do produto.
    SELECT array_agg(DISTINCT z.k ORDER BY z.k) INTO v_keys
    FROM (
      SELECT v_own AS k WHERE v_own IS NOT NULL
      UNION
      SELECT pc.code_key FROM public.product_codes pc
      WHERE pc.product_id = NEW.id AND pc.kind = 'barcode' AND pc.deleted_at IS NULL
    ) z;
    IF v_keys IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Locks por ordem (chaves ordenadas) antes de qualquer verificação.
  FOREACH v_k IN ARRAY v_keys LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('product_code:' || NEW.organization_id::text || ':' || v_k, 0));
  END LOOP;

  FOREACH v_k IN ARRAY v_keys LOOP
    SELECT p.id, p.name, p.sku, btrim(p.barcode) AS code INTO v_other
    FROM public.products p
    WHERE p.organization_id = NEW.organization_id AND p.id <> NEW.id
      AND p.id IS DISTINCT FROM v_upsert
      AND p.deleted_at IS NULL AND NOT p.is_deleted
      AND public.fn_product_code_key(p.barcode) = v_k
    ORDER BY p.id
    LIMIT 1;
    v_found := FOUND;
    IF NOT v_found THEN
      SELECT p.id, p.name, p.sku, btrim(pc.code) AS code INTO v_other
      FROM public.product_codes pc
      JOIN public.products p ON p.id = pc.product_id
      WHERE pc.organization_id = NEW.organization_id AND pc.kind = 'barcode'
        AND pc.deleted_at IS NULL AND pc.code_key = v_k AND pc.product_id <> NEW.id
        AND pc.product_id IS DISTINCT FROM v_upsert
        AND p.deleted_at IS NULL AND NOT p.is_deleted
      ORDER BY pc.id
      LIMIT 1;
      v_found := FOUND;
    END IF;
    IF v_found THEN
      RAISE EXCEPTION 'O código de barras «%» já é o código do produto «%» (%)', v_other.code, v_other.name, v_other.sku
        USING ERRCODE = 'unique_violation', DETAIL = v_other.id::text,
              HINT = 'Um código de barras só pode estar num produto ativo da organização (id do produto em DETAIL).';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

ALTER FUNCTION public.fn_products_barcode_guard() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_products_barcode_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_products_barcode_guard() TO service_role;

DROP TRIGGER IF EXISTS trg_products_barcode_guard ON public.products;
CREATE TRIGGER trg_products_barcode_guard
  BEFORE INSERT OR UPDATE OF barcode, deleted_at, is_deleted, organization_id ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.fn_products_barcode_guard();

-- 3c. Índice único em products (rede de segurança do gatilho). Antes de o
-- criar, falhar com mensagem clara se houver duplicados ativos.
DO $chk$
DECLARE v_dups text;
BEGIN
  SELECT string_agg(format('%s (%s produtos)', z.k, z.n), ', ') INTO v_dups
  FROM (
    SELECT organization_id, public.fn_product_code_key(barcode) AS k, count(*) AS n
    FROM public.products
    WHERE public.fn_product_code_key(barcode) IS NOT NULL AND deleted_at IS NULL AND NOT is_deleted
      AND organization_id IS NOT NULL
    GROUP BY 1, 2 HAVING count(*) > 1
  ) z;
  IF v_dups IS NOT NULL THEN
    RAISE EXCEPTION 'Há produtos ativos com o mesmo código de barras na mesma organização: %', v_dups
      USING ERRCODE = 'unique_violation';
  END IF;
END
$chk$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_products_barcode_key
  ON public.products (organization_id, public.fn_product_code_key(barcode))
  WHERE public.fn_product_code_key(barcode) IS NOT NULL AND deleted_at IS NULL AND NOT is_deleted;

-- ── 4. Resumo de um código (interna) ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_product_code_json(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_r      record;
  v_factor integer;
BEGIN
  SELECT pc.*, p.name AS product_name, p.sku AS product_sku, p.uom_id AS product_uom_id,
         u.code AS uom_code, s.name AS supplier_name
  INTO v_r
  FROM public.product_codes pc
  JOIN public.products p ON p.id = pc.product_id
  LEFT JOIN public.uom u ON u.id = COALESCE(pc.uom_id, p.uom_id)
  LEFT JOIN public.suppliers s ON s.id = pc.supplier_id
  WHERE pc.id = p_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  BEGIN
    v_factor := public.fn_uom_units_per(v_r.uom_id, v_r.product_id);
  EXCEPTION WHEN OTHERS THEN
    v_factor := NULL;  -- unidade deixou de ser compatível com o produto
  END;
  RETURN jsonb_build_object(
    'id', v_r.id, 'code', v_r.code, 'code_key', v_r.code_key, 'kind', v_r.kind,
    'product_id', v_r.product_id, 'product_name', v_r.product_name, 'sku', v_r.product_sku,
    'uom_id', COALESCE(v_r.uom_id, v_r.product_uom_id), 'uom_code', v_r.uom_code,
    'is_pack', v_r.uom_id IS NOT NULL, 'units_per_uom', v_factor,
    'supplier_id', v_r.supplier_id, 'supplier_name', v_r.supplier_name,
    'source', v_r.source, 'context', v_r.context,
    'created_by', v_r.created_by, 'created_at', v_r.created_at,
    'deleted_at', v_r.deleted_at, 'deleted_by', v_r.deleted_by, 'delete_reason', v_r.delete_reason);
END;
$function$;

ALTER FUNCTION public.fn_product_code_json(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_product_code_json(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_product_code_json(uuid) TO service_role;

-- ── 5. Aprender um código ──────────────────────────────────────────────────
-- p_warehouse_id: na receção (source 'receiving', organização do armazém,
-- auditoria com source 'receiving'); NULL = ficha do produto ('product_form').
-- Permissões: (purchase_orders.receive E inventory.edit) OU products.edit.
-- p_set_product_uom: produto sem unidade → passa a 'un' (exige products.edit
-- e nenhuma linha/ligação do produto noutra unidade). Criar embalagens novas
-- não é desta RPC (tabela uom, products.manage).
-- Idempotente por p_id. Código já noutro produto ativo → 23505 com o nome.
CREATE OR REPLACE FUNCTION public.rpc_product_code_learn(
  p_id              uuid,
  p_warehouse_id    uuid,
  p_code            text,
  p_kind            text,
  p_product_id      uuid,
  p_uom_id          uuid    DEFAULT NULL,
  p_supplier_id     uuid    DEFAULT NULL,
  p_set_product_uom boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_actor     uuid;
  v_org       uuid;
  v_code      text := btrim(COALESCE(p_code, ''));
  v_kind      text := lower(btrim(COALESCE(p_kind, '')));
  v_key       text;
  v_source    text;
  v_can_edit  boolean;
  v_can_wh    boolean;
  v_prod      record;
  v_uom       uuid;
  v_req_uom   uuid;
  v_factor    integer;
  v_un        uuid;
  v_conf      text;
  v_row       public.product_codes%ROWTYPE;
  v_other     record;
  v_already   text;
  v_existing  uuid;
  v_annulled  jsonb := '[]'::jsonb;
  v_warnings  jsonb := '[]'::jsonb;
  v_uom_set   boolean := false;
  v_prev_src  text;
  v_cn        text;
  v_txt       text;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'Identificador da associação em falta' USING ERRCODE = 'check_violation';
  END IF;
  IF p_product_id IS NULL THEN
    RAISE EXCEPTION 'Indica o produto' USING ERRCODE = 'check_violation';
  END IF;

  IF p_warehouse_id IS NOT NULL THEN
    SELECT organization_id INTO v_org FROM public.warehouses WHERE id = p_warehouse_id AND deleted_at IS NULL;
    IF v_org IS NULL THEN
      RAISE EXCEPTION 'Armazém não encontrado' USING ERRCODE = 'no_data_found';
    END IF;
    v_source := 'receiving';
  ELSE
    SELECT organization_id INTO v_org FROM public.products WHERE id = p_product_id;
    IF v_org IS NULL THEN
      RAISE EXCEPTION 'Produto não encontrado' USING ERRCODE = 'no_data_found';
    END IF;
    v_source := 'product_form';
  END IF;

  v_can_edit := public.has_anew_permission(v_uid, 'products.edit');
  v_can_wh   := public.has_anew_permission(v_uid, 'purchase_orders.receive')
            AND public.has_anew_permission(v_uid, 'inventory.edit');
  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(v_uid)) OR NOT (v_can_edit OR v_can_wh) THEN
    RAISE EXCEPTION 'Sem permissão para associar códigos a produtos desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Produto (trancado se a unidade do produto pode mudar).
  IF COALESCE(p_set_product_uom, false) THEN
    SELECT id, name, sku, barcode, uom_id, organization_id, deleted_at, is_deleted INTO v_prod
    FROM public.products WHERE id = p_product_id FOR NO KEY UPDATE;
  ELSE
    SELECT id, name, sku, barcode, uom_id, organization_id, deleted_at, is_deleted INTO v_prod
    FROM public.products WHERE id = p_product_id;
  END IF;
  IF v_prod.id IS NULL OR v_prod.organization_id IS DISTINCT FROM v_org
     OR v_prod.deleted_at IS NOT NULL OR v_prod.is_deleted THEN
    RAISE EXCEPTION 'Produto inválido para esta organização' USING ERRCODE = 'check_violation';
  END IF;

  -- Pedido já processado → devolve o gravado (tem de ser igual).
  SELECT * INTO v_row FROM public.product_codes WHERE id = p_id;
  IF FOUND THEN
    v_req_uom := CASE WHEN p_uom_id IS NOT DISTINCT FROM v_prod.uom_id THEN NULL ELSE p_uom_id END;
    IF v_row.organization_id IS DISTINCT FROM v_org OR v_row.created_by IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION 'Esta associação pertence a outro utilizador ou organização' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_row.product_id IS DISTINCT FROM p_product_id OR v_row.kind IS DISTINCT FROM v_kind
       OR v_row.code_key IS DISTINCT FROM public.fn_product_code_key(v_code)
       OR v_row.supplier_id IS DISTINCT FROM p_supplier_id OR v_row.uom_id IS DISTINCT FROM v_req_uom THEN
      RAISE EXCEPTION 'O identificador da associação já foi usado noutra associação (outro código, produto, unidade ou fornecedor)'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN public.fn_product_code_json(p_id)
      || jsonb_build_object('replayed', true, 'learned', v_row.deleted_at IS NULL, 'already', NULL,
                            'product_uom_set', COALESCE((v_row.context ->> 'product_uom_set')::boolean, false),
                            'annulled', COALESCE(v_row.context -> 'annulled', '[]'::jsonb), 'warnings', '[]'::jsonb);
  END IF;

  IF v_code = '' THEN
    RAISE EXCEPTION 'Indica o código lido' USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(v_code) > 200 THEN
    RAISE EXCEPTION 'Código demasiado longo' USING ERRCODE = 'check_violation';
  END IF;
  IF v_kind NOT IN ('barcode', 'supplier_ref') THEN
    RAISE EXCEPTION 'Tipo de código inválido (barcode ou supplier_ref)' USING ERRCODE = 'check_violation';
  END IF;
  v_key := public.fn_product_code_key(v_code);

  IF v_kind = 'supplier_ref' AND p_supplier_id IS NULL THEN
    RAISE EXCEPTION 'Indica o fornecedor da referência' USING ERRCODE = 'check_violation';
  END IF;
  IF p_supplier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.suppliers WHERE id = p_supplier_id AND organization_id = v_org AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Fornecedor inválido para esta organização' USING ERRCODE = 'check_violation';
  END IF;

  v_prev_src := current_setting('app.audit_source', true);
  IF v_source = 'receiving' THEN
    PERFORM set_config('app.audit_source', 'receiving', true);
  END IF;

  -- Produto sem unidade: definir 'un' (opcional, sem conflitos).
  IF v_prod.uom_id IS NULL AND COALESCE(p_set_product_uom, false) THEN
    IF NOT v_can_edit THEN
      RAISE EXCEPTION 'Definir a unidade do produto exige permissão para editar produtos' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT id INTO v_un FROM public.uom
    WHERE organization_id IS NULL AND base_uom_id IS NULL AND lower(btrim(code)) = 'un'
    ORDER BY id LIMIT 1;
    IF v_un IS NULL THEN
      RAISE EXCEPTION 'Unidade "un" não encontrada' USING ERRCODE = 'no_data_found';
    END IF;
    SELECT string_agg(format('%s %s', z.n, z.t), ', ' ORDER BY z.t) INTO v_conf
    FROM (
      SELECT 'linha(s) de encomenda a fornecedor' AS t, count(*) AS n FROM public.purchase_order_items WHERE product_id = p_product_id AND uom_id IS NOT NULL AND uom_id <> v_un
      UNION ALL SELECT 'linha(s) de orçamento', count(*) FROM public.quote_lines WHERE product_id = p_product_id AND uom_id IS NOT NULL AND uom_id <> v_un
      UNION ALL SELECT 'linha(s) de venda direta', count(*) FROM public.direct_sale_lines WHERE product_id = p_product_id AND uom_id IS NOT NULL AND uom_id <> v_un
      UNION ALL SELECT 'ligação(ões) a fornecedores', count(*) FROM public.item_suppliers WHERE product_id = p_product_id AND deleted_at IS NULL AND uom_id IS NOT NULL AND uom_id <> v_un
      UNION ALL SELECT 'material(is) de serviços', count(*) FROM public.service_materials WHERE product_id = p_product_id AND uom_id IS NOT NULL AND uom_id <> v_un
      UNION ALL SELECT 'linha(s) de guias', count(*) FROM public.supplier_delivery_note_lines WHERE product_id = p_product_id AND uom_id IS NOT NULL AND uom_id <> v_un
      UNION ALL SELECT 'código(s) aprendido(s)', count(*) FROM public.product_codes WHERE product_id = p_product_id AND deleted_at IS NULL AND uom_id IS NOT NULL AND uom_id <> v_un
    ) z
    WHERE z.n > 0;
    IF v_conf IS NOT NULL THEN
      RAISE EXCEPTION 'Não é possível definir a unidade "un" em «%»: já há % noutra unidade', v_prod.name, v_conf
        USING ERRCODE = 'check_violation';
    END IF;
    UPDATE public.products SET uom_id = v_un WHERE id = p_product_id;
    v_prod.uom_id := v_un;
    v_uom_set := true;
  END IF;

  -- Unidade do código: NULL = a do produto.
  v_uom := CASE WHEN p_uom_id IS NOT DISTINCT FROM v_prod.uom_id THEN NULL ELSE p_uom_id END;
  IF v_uom IS NOT NULL AND v_prod.uom_id IS NULL
     AND EXISTS (SELECT 1 FROM public.uom WHERE id = v_uom AND base_uom_id IS NULL) THEN
    RAISE EXCEPTION 'O produto «%» não tem unidade definida — associa o código sem unidade ou define a unidade do produto', v_prod.name
      USING ERRCODE = 'check_violation';
  END IF;
  v_factor := public.fn_uom_units_per(v_uom, p_product_id);  -- erro claro se incompatível

  -- Conflitos (com o lock da chave detido).
  IF v_kind = 'barcode' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('product_code:' || v_org::text || ':' || v_key, 0));

    IF public.fn_product_code_key(v_prod.barcode) = v_key THEN
      IF v_uom IS NOT NULL THEN
        RAISE EXCEPTION 'O código «%» já é o código de barras principal de «%» (na unidade do produto)', v_code, v_prod.name
          USING ERRCODE = 'unique_violation', DETAIL = p_product_id::text;
      END IF;
      v_already := 'product_barcode';
    END IF;

    SELECT p.id, p.name, p.sku INTO v_other
    FROM public.products p
    WHERE p.organization_id = v_org AND p.id <> p_product_id
      AND p.deleted_at IS NULL AND NOT p.is_deleted
      AND public.fn_product_code_key(p.barcode) = v_key
    ORDER BY p.id LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'O código «%» já é o código de barras do produto «%» (%)', v_code, v_other.name, v_other.sku
        USING ERRCODE = 'unique_violation', DETAIL = v_other.id::text;
    END IF;
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended('product_code:' || v_org::text || ':' || p_supplier_id::text || ':' || v_key, 0));

    -- Referência na ficha do produto (item_suppliers) do mesmo fornecedor.
    FOR v_other IN
      SELECT i.product_id, p.name, p.sku,
             CASE WHEN i.uom_id IS NOT DISTINCT FROM p.uom_id THEN NULL ELSE i.uom_id END AS uom_id
      FROM public.item_suppliers i
      JOIN public.products p ON p.id = i.product_id
      WHERE i.organization_id = v_org AND i.supplier_id = p_supplier_id AND i.deleted_at IS NULL
        AND i.product_id IS NOT NULL AND p.deleted_at IS NULL AND NOT p.is_deleted
        AND public.fn_product_code_key(i.supplier_sku) = v_key
      ORDER BY (i.product_id = p_product_id) DESC, i.id
    LOOP
      IF v_other.product_id <> p_product_id THEN
        RAISE EXCEPTION 'A referência «%» deste fornecedor já está na ficha do produto «%» (%)', v_code, v_other.name, v_other.sku
          USING ERRCODE = 'unique_violation', DETAIL = v_other.product_id::text;
      ELSIF v_other.uom_id IS DISTINCT FROM v_uom THEN
        RAISE EXCEPTION 'A referência «%» deste fornecedor já está na ficha de «%» noutra unidade', v_code, v_prod.name
          USING ERRCODE = 'unique_violation', DETAIL = p_product_id::text;
      ELSE
        v_already := 'item_supplier';
      END IF;
    END LOOP;
  END IF;

  -- Códigos aprendidos ativos com a mesma chave (no máximo um: índices únicos).
  FOR v_other IN
    SELECT pc.id, pc.product_id, pc.uom_id, p.name, p.sku,
           (p.deleted_at IS NULL AND NOT p.is_deleted) AS active
    FROM public.product_codes pc
    JOIN public.products p ON p.id = pc.product_id
    WHERE pc.organization_id = v_org AND pc.kind = v_kind AND pc.deleted_at IS NULL AND pc.code_key = v_key
      AND (v_kind = 'barcode' OR pc.supplier_id = p_supplier_id)
    FOR UPDATE OF pc
  LOOP
    IF v_other.product_id = p_product_id THEN
      IF v_other.uom_id IS DISTINCT FROM v_uom THEN
        RAISE EXCEPTION 'O código «%» já está associado a «%» noutra unidade', v_code, v_prod.name
          USING ERRCODE = 'unique_violation', DETAIL = p_product_id::text;
      END IF;
      v_already := 'product_code';
      v_existing := v_other.id;
    ELSIF v_other.active THEN
      RAISE EXCEPTION 'O código «%» já está associado ao produto «%» (%)', v_code, v_other.name, v_other.sku
        USING ERRCODE = 'unique_violation', DETAIL = v_other.product_id::text;
    ELSE
      -- Produto apagado não bloqueia: o código antigo é anulado.
      UPDATE public.product_codes
      SET deleted_at = now(), deleted_by = v_actor,
          delete_reason = left(format('Produto «%s» apagado — código associado a «%s»', v_other.name, v_prod.name), 1000)
      WHERE id = v_other.id;
      v_annulled := v_annulled || to_jsonb(v_other.id);
    END IF;
  END LOOP;

  -- Avisos: o código também é o SKU de outro produto (a leitura passa a
  -- encontrar este primeiro — nível 1/2 antes do SKU).
  SELECT string_agg(DISTINCT format('«%s» (%s)', p.name, p.sku), ', ') INTO v_txt
  FROM public.products p
  WHERE p.organization_id = v_org AND p.id <> p_product_id AND p.deleted_at IS NULL AND NOT p.is_deleted
    AND lower(btrim(p.sku)) = lower(v_code);
  IF v_txt IS NOT NULL THEN
    v_warnings := v_warnings || to_jsonb(format('O código «%s» também é o SKU de %s — a leitura passa a encontrar «%s» primeiro', v_code, v_txt, v_prod.name));
  END IF;

  IF v_already IS NOT NULL THEN
    PERFORM set_config('app.audit_source', COALESCE(v_prev_src, ''), true);
    RETURN COALESCE(public.fn_product_code_json(v_existing),
                    jsonb_build_object('id', NULL, 'code', v_code, 'code_key', v_key, 'kind', v_kind,
                                       'product_id', p_product_id, 'product_name', v_prod.name, 'sku', v_prod.sku,
                                       'uom_id', COALESCE(v_uom, v_prod.uom_id),
                                       'uom_code', (SELECT code FROM public.uom WHERE id = COALESCE(v_uom, v_prod.uom_id)),
                                       'is_pack', v_uom IS NOT NULL, 'units_per_uom', v_factor,
                                       'supplier_id', p_supplier_id))
      || jsonb_build_object('replayed', false, 'learned', false, 'already', v_already,
                            'product_uom_set', v_uom_set, 'annulled', v_annulled, 'warnings', v_warnings);
  END IF;

  BEGIN
    INSERT INTO public.product_codes (
      id, organization_id, code, kind, product_id, uom_id, supplier_id, source, context, created_by
    ) VALUES (
      p_id, v_org, v_code, v_kind, p_product_id, v_uom, p_supplier_id, v_source,
      jsonb_strip_nulls(jsonb_build_object(
        'warehouse_id', p_warehouse_id,
        'product_uom_set', CASE WHEN v_uom_set THEN true END,
        'annulled', CASE WHEN jsonb_array_length(v_annulled) > 0 THEN v_annulled END)),
      v_actor
    )
    ON CONFLICT (id) DO NOTHING;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Associação em conflito — tenta de novo' USING ERRCODE = 'serialization_failure';
    END IF;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_cn = CONSTRAINT_NAME;
    IF COALESCE(v_cn, '') = '' THEN
      RAISE;  -- mensagem do gatilho (já com o nome do produto)
    END IF;
    RAISE EXCEPTION 'O código «%» acabou de ser associado a outro produto — lê de novo', v_code
      USING ERRCODE = 'unique_violation';
  END;

  PERFORM set_config('app.audit_source', COALESCE(v_prev_src, ''), true);

  RETURN public.fn_product_code_json(p_id)
    || jsonb_build_object('replayed', false, 'learned', true, 'already', NULL,
                          'product_uom_set', v_uom_set, 'annulled', v_annulled, 'warnings', v_warnings);
END;
$function$;

ALTER FUNCTION public.rpc_product_code_learn(uuid, uuid, text, text, uuid, uuid, uuid, boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rpc_product_code_learn(uuid, uuid, text, text, uuid, uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_product_code_learn(uuid, uuid, text, text, uuid, uuid, uuid, boolean) TO authenticated, service_role;

-- ── 6. Remover (anular) um código ──────────────────────────────────────────
-- Autor nas primeiras 24 h (com permissão de associar) ou products.edit.
-- Não reverte receções; devolve quantas leituras usaram o código desde a
-- associação (mesmo produto e chave).
CREATE OR REPLACE FUNCTION public.rpc_product_code_remove(p_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_actor    uuid;
  v_reason   text := btrim(COALESCE(p_reason, ''));
  v_row      public.product_codes%ROWTYPE;
  v_can_edit boolean;
  v_can_wh   boolean;
  v_already  boolean := false;
  v_scans    integer;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_row FROM public.product_codes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Código não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_can_edit := public.has_anew_permission(v_uid, 'products.edit');
  v_can_wh   := public.has_anew_permission(v_uid, 'purchase_orders.receive')
            AND public.has_anew_permission(v_uid, 'inventory.edit');
  IF v_row.organization_id NOT IN (SELECT public.get_user_visible_org_ids(v_uid))
     OR NOT (v_can_edit
             OR (v_can_wh AND v_row.created_by = v_actor AND v_row.created_at > now() - interval '24 hours')) THEN
    RAISE EXCEPTION 'Só quem associou o código (nas primeiras 24 h) ou quem edita produtos o pode remover'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_reason = '' THEN
    RAISE EXCEPTION 'Indica o motivo' USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(v_reason) > 1000 THEN
    RAISE EXCEPTION 'Motivo demasiado longo' USING ERRCODE = 'check_violation';
  END IF;

  IF v_row.deleted_at IS NOT NULL THEN
    v_already := true;
  ELSE
    UPDATE public.product_codes
    SET deleted_at = now(), deleted_by = v_actor, delete_reason = v_reason
    WHERE id = p_id;
  END IF;

  SELECT count(*) INTO v_scans
  FROM public.receiving_scans s
  WHERE s.organization_id = v_row.organization_id
    AND s.product_id = v_row.product_id
    AND s.created_at >= v_row.created_at
    AND public.fn_product_code_key(s.code) = v_row.code_key;

  RETURN public.fn_product_code_json(p_id)
    || jsonb_build_object('removed', NOT v_already, 'already_removed', v_already, 'scans_using_code', v_scans);
END;
$function$;

ALTER FUNCTION public.rpc_product_code_remove(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rpc_product_code_remove(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_product_code_remove(uuid, text) TO authenticated, service_role;

-- ── 7. rpc_receiving_lookup + códigos aprendidos + p_unit_conversion ──────
-- DROP + CREATE (assinatura nova; evitar overload/PGRST203) a partir do
-- pg_get_functiondef VIVO (fatia 2, 20261209100000). Owner/GRANTs iguais.
DROP FUNCTION IF EXISTS public.rpc_receiving_lookup(uuid, text, uuid, uuid);

CREATE OR REPLACE FUNCTION public.rpc_receiving_lookup(p_warehouse_id uuid, p_code text, p_supplier_id uuid DEFAULT NULL::uuid, p_delivery_note_id uuid DEFAULT NULL::uuid, p_unit_conversion boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org         uuid;
  v_code        text := btrim(COALESCE(p_code, ''));
  v_lc          text;
  v_can_receive boolean;
  v_level       integer;
  v_cand        record;
  v_factor      integer;
  v_lines       jsonb;
  v_candidates  jsonb := '[]'::jsonb;
  v_warnings    jsonb := '[]'::jsonb;
  v_other       integer;
  v_other_txt   text;
  v_matches     jsonb;
  -- NOVO (guia)
  v_note_org       uuid;
  v_note_supplier  uuid;
  v_note_number    text;
  v_note_status    text;
  v_scope          uuid[];
  v_note_poi       uuid[];
  v_note_has_lines boolean := false;
  v_ann            numeric;
  v_rcv            numeric;
  v_note_info      jsonb := '{}'::jsonb;
  -- NOVO (códigos)
  v_key            text;
  v_conv           boolean := COALESCE(p_unit_conversion, false);
BEGIN
  SELECT organization_id INTO v_org
  FROM public.warehouses
  WHERE id = p_warehouse_id AND deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Armazém não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT (public.has_anew_permission(auth.uid(), 'purchase_orders.receive')
             OR public.has_anew_permission(auth.uid(), 'purchase_orders.view')) THEN
    RAISE EXCEPTION 'Sem permissão para consultar encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_can_receive := public.has_anew_permission(auth.uid(), 'purchase_orders.receive')
               AND public.has_anew_permission(auth.uid(), 'inventory.edit');

  IF v_code = '' THEN
    RAISE EXCEPTION 'Indica o código lido' USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(v_code) > 200 THEN
    RAISE EXCEPTION 'Código lido demasiado longo' USING ERRCODE = 'check_violation';
  END IF;

  IF p_supplier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.suppliers
    WHERE id = p_supplier_id AND organization_id = v_org AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Fornecedor inválido para esta organização' USING ERRCODE = 'check_violation';
  END IF;

  -- NOVO (guia): a guia fixa o fornecedor e o âmbito (POs da guia, ou todas
  -- as do fornecedor se não tiver POs).
  IF p_delivery_note_id IS NOT NULL THEN
    SELECT organization_id, supplier_id, note_number, status
    INTO v_note_org, v_note_supplier, v_note_number, v_note_status
    FROM public.supplier_delivery_notes
    WHERE id = p_delivery_note_id;
    IF v_note_org IS NULL OR v_note_org <> v_org THEN
      RAISE EXCEPTION 'Guia do fornecedor não encontrada nesta organização' USING ERRCODE = 'no_data_found';
    END IF;
    IF v_note_status <> 'open' THEN
      RAISE EXCEPTION 'A guia % está % — reabre-a para receber', v_note_number,
        CASE v_note_status WHEN 'closed' THEN 'fechada' ELSE 'cancelada' END
        USING ERRCODE = 'check_violation';
    END IF;
    IF p_supplier_id IS NOT NULL AND p_supplier_id <> v_note_supplier THEN
      RAISE EXCEPTION 'A guia % é de outro fornecedor', v_note_number USING ERRCODE = 'check_violation';
    END IF;
    p_supplier_id := v_note_supplier;
    v_scope := public.fn_delivery_note_scope(p_delivery_note_id);
    SELECT array_agg(DISTINCT l.purchase_order_item_id) FILTER (WHERE l.purchase_order_item_id IS NOT NULL),
           count(*) > 0
    INTO v_note_poi, v_note_has_lines
    FROM public.supplier_delivery_note_lines l
    WHERE l.delivery_note_id = p_delivery_note_id;
    v_note_info := jsonb_build_object('delivery_note', jsonb_build_object(
      'id', p_delivery_note_id, 'note_number', v_note_number, 'status', v_note_status,
      'supplier_id', v_note_supplier, 'purchase_order_ids', to_jsonb(v_scope), 'has_lines', v_note_has_lines));
  END IF;

  v_lc := lower(v_code);
  v_key := public.fn_product_code_key(v_code);  -- NOVO (códigos)

  -- Correspondências (produto, unidade, nível) num jsonb — sem tabelas
  -- temporárias (função STABLE).
  SELECT COALESCE(jsonb_agg(jsonb_build_object('product_id', mm.product_id, 'uom_id', mm.uom_id,
                                               'matched_by', mm.matched_by, 'lvl', mm.lvl,
                                               'code_id', mm.code_id)), '[]'::jsonb)  -- NOVO (códigos): code_id
  INTO v_matches
  FROM (
  -- 1 código de barras
  SELECT p.id AS product_id, NULL::uuid AS uom_id, 'barcode'::text AS matched_by, 1 AS lvl, NULL::uuid AS code_id
  FROM public.products p
  WHERE p.organization_id = v_org AND p.deleted_at IS NULL AND NOT p.is_deleted
    AND public.fn_product_code_key(p.barcode) = v_key  -- NOVO (códigos): chave normalizada (GTIN)
  UNION
  -- 1b NOVO (códigos): código de barras aprendido (unidade do código)
  SELECT pc.product_id, pc.uom_id, 'barcode', 1, pc.id
  FROM public.product_codes pc
  JOIN public.products p ON p.id = pc.product_id
  WHERE pc.organization_id = v_org AND pc.kind = 'barcode' AND pc.deleted_at IS NULL
    AND pc.code_key = v_key
    AND p.organization_id = v_org AND p.deleted_at IS NULL AND NOT p.is_deleted
  UNION
  -- 2a referência do fornecedor nas linhas em aberto
  SELECT poi.product_id, poi.uom_id, 'supplier_sku', 2, NULL::uuid
  FROM public.purchase_order_items poi
  JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
  JOIN public.products p ON p.id = poi.product_id
  WHERE po.organization_id = v_org AND po.deleted_at IS NULL
    AND po.status IN ('pending', 'ordered', 'partially_received')
    AND poi.item_type = 'product' AND poi.quantity > poi.received_quantity
    AND (p_supplier_id IS NULL OR po.supplier_id = p_supplier_id)
    AND p.deleted_at IS NULL AND NOT p.is_deleted
    AND lower(btrim(poi.supplier_sku)) = v_lc
  UNION
  -- 2b referência do fornecedor na ficha do produto (item_suppliers)
  SELECT i.product_id, i.uom_id, 'supplier_sku', 2, NULL::uuid
  FROM public.item_suppliers i
  JOIN public.products p ON p.id = i.product_id
  WHERE i.organization_id = v_org AND i.deleted_at IS NULL AND i.product_id IS NOT NULL
    AND (p_supplier_id IS NULL OR i.supplier_id = p_supplier_id)
    AND p.organization_id = v_org AND p.deleted_at IS NULL AND NOT p.is_deleted
    AND lower(btrim(i.supplier_sku)) = v_lc
  UNION
  -- 2c NOVO (códigos): referência do fornecedor aprendida (filtrada pelo
  -- fornecedor quando há; unidade do código)
  SELECT pc.product_id, pc.uom_id, 'supplier_sku', 2, pc.id
  FROM public.product_codes pc
  JOIN public.products p ON p.id = pc.product_id
  WHERE pc.organization_id = v_org AND pc.kind = 'supplier_ref' AND pc.deleted_at IS NULL
    AND pc.code_key = v_key
    AND (p_supplier_id IS NULL OR pc.supplier_id = p_supplier_id)
    AND p.organization_id = v_org AND p.deleted_at IS NULL AND NOT p.is_deleted
  UNION
  -- 3 SKU do produto
  SELECT p.id, NULL::uuid, 'sku', 3, NULL::uuid
  FROM public.products p
  WHERE p.organization_id = v_org AND p.deleted_at IS NULL AND NOT p.is_deleted
    AND lower(btrim(p.sku)) = v_lc
  UNION
  -- 4 SKU gravado nas linhas das POs da organização
  SELECT poi.product_id, NULL::uuid, 'po_line_sku', 4, NULL::uuid
  FROM public.purchase_order_items poi
  JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
  JOIN public.products p ON p.id = poi.product_id
  WHERE po.organization_id = v_org AND po.deleted_at IS NULL
    AND poi.item_type = 'product'
    AND (p_supplier_id IS NULL OR po.supplier_id = p_supplier_id)
    AND p.deleted_at IS NULL AND NOT p.is_deleted
    AND lower(btrim(poi.sku)) = v_lc
  ) mm;

  SELECT min(m.lvl) INTO v_level
  FROM jsonb_to_recordset(v_matches) AS m(product_id uuid, uom_id uuid, matched_by text, lvl integer);

  IF v_level IS NULL THEN
    RETURN jsonb_build_object(
      'found', false, 'code', v_code, 'organization_id', v_org,
      'warehouse_id', p_warehouse_id, 'supplier_id', p_supplier_id,
      'can_receive', v_can_receive, 'candidates', '[]'::jsonb,
      'warnings', jsonb_build_array(format('Código «%s» não encontrado nesta organização', v_code))
    ) || v_note_info  -- NOVO (guia): '{}' sem guia
     || CASE WHEN v_conv THEN jsonb_build_object('unit_conversion', true) ELSE '{}'::jsonb END;  -- NOVO (códigos)
  END IF;

  -- Níveis inferiores com outros produtos: só aviso.
  SELECT count(DISTINCT m.product_id),
         string_agg(DISTINCT format('%s (%s)', p.name, m.matched_by), ', ')
  INTO v_other, v_other_txt
  FROM jsonb_to_recordset(v_matches) AS m(product_id uuid, uom_id uuid, matched_by text, lvl integer)
  JOIN public.products p ON p.id = m.product_id
  WHERE m.lvl > v_level
    AND m.product_id NOT IN (
      SELECT m2.product_id
      FROM jsonb_to_recordset(v_matches) AS m2(product_id uuid, uom_id uuid, matched_by text, lvl integer)
      WHERE m2.lvl = v_level);
  IF v_other > 0 THEN
    v_warnings := v_warnings || to_jsonb(format('O código também corresponde a: %s', v_other_txt));
  END IF;

  FOR v_cand IN
    SELECT DISTINCT ON (m.product_id, COALESCE(m.uom_id, p.uom_id))
           m.product_id, m.matched_by,
           -- unidade lida: a da ligação/linha; senão a do produto
           CASE WHEN m.uom_id IS NULL OR m.uom_id IS NOT DISTINCT FROM p.uom_id THEN p.uom_id ELSE m.uom_id END AS uom_id,
           (m.uom_id IS NOT NULL AND m.uom_id IS DISTINCT FROM p.uom_id) AS is_pack,
           p.name, p.sku, p.barcode, m.code_id  -- NOVO (códigos)
    FROM jsonb_to_recordset(v_matches) AS m(product_id uuid, uom_id uuid, matched_by text, lvl integer, code_id uuid)
    JOIN public.products p ON p.id = m.product_id
    WHERE m.lvl = v_level
    ORDER BY m.product_id, COALESCE(m.uom_id, p.uom_id), p.name, m.code_id NULLS FIRST  -- NOVO (códigos)
  LOOP
    v_factor := 1;
    IF v_cand.is_pack THEN
      BEGIN
        v_factor := public.fn_uom_units_per(v_cand.uom_id, v_cand.product_id);
      EXCEPTION WHEN OTHERS THEN
        v_warnings := v_warnings || to_jsonb(format('«%s»: a unidade da referência do fornecedor não é compatível com a do produto (%s)', v_cand.name, SQLERRM));
        CONTINUE;
      END;
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'purchase_order_id',      o.purchase_order_id,
             'order_number',           o.order_number,
             'po_status',              o.po_status,
             'confirmed',              o.confirmed,
             'supplier_id',            o.supplier_id,
             'supplier_name',          o.supplier_name,
             'expected_delivery',      o.expected_delivery,
             'purchase_order_item_id', o.purchase_order_item_id,
             'description',            o.description,
             'quantity',               o.quantity,
             'received_quantity',      o.received_quantity,
             'open_quantity',          o.open_quantity,
             'uom_id',                 o.uom_id,
             'units_per_uom',          o.units_per_uom,
             'same_unit',              (o.units_per_uom = v_factor),
             'contract_id',            o.contract_id,
             'contract_order_number',  o.contract_order_number,
             'contract_active',        o.contract_active,
             -- Posição na ordem de enchimento (só linhas da mesma unidade).
             -- NOVO (códigos): com conversão todas as linhas entram na ordem.
             'allocation_rank',        CASE WHEN v_conv OR o.units_per_uom = v_factor THEN o.r END
           -- NOVO (guia): linha indicada na guia (só com guia)
           ) || CASE WHEN p_delivery_note_id IS NOT NULL
                     THEN jsonb_build_object('in_delivery_note', COALESCE(o.purchase_order_item_id = ANY (v_note_poi), false))
                     ELSE '{}'::jsonb END
           -- NOVO (códigos): em aberto em unidades de stock (só com conversão)
           || CASE WHEN v_conv THEN jsonb_build_object('open_units', o.open_quantity * o.units_per_uom)
                   ELSE '{}'::jsonb END
           ORDER BY (v_conv OR o.units_per_uom = v_factor) DESC, o.prio, o.allocation_rank), '[]'::jsonb),
           count(*) FILTER (WHERE NOT v_conv AND o.units_per_uom <> v_factor)
    INTO v_lines, v_other
    FROM (
      -- NOVO (guia): prio 0 = linha indicada na guia (sem guia é sempre 1);
      -- só POs do âmbito da guia.
      SELECT ol.*, pr.prio,
             row_number() OVER (PARTITION BY (v_conv OR ol.units_per_uom = v_factor) ORDER BY pr.prio, ol.allocation_rank) AS r
      FROM public.fn_receiving_open_lines(v_org, ARRAY[v_cand.product_id], p_supplier_id) ol
      CROSS JOIN LATERAL (SELECT CASE WHEN ol.purchase_order_item_id = ANY (v_note_poi) THEN 0 ELSE 1 END AS prio) pr
      WHERE v_scope IS NULL OR ol.purchase_order_id = ANY (v_scope)
    ) o;

    IF jsonb_array_length(v_lines) = 0 THEN
      v_warnings := v_warnings || to_jsonb(format('«%s» não tem encomendas a fornecedor em aberto%s', v_cand.name,
                      CASE WHEN p_supplier_id IS NOT NULL THEN ' deste fornecedor' ELSE '' END)
                      -- NOVO (guia)
                      || CASE WHEN v_scope IS NOT NULL THEN format(' nas encomendas da guia %s', v_note_number) ELSE '' END);
    ELSIF v_other > 0 THEN
      v_warnings := v_warnings || to_jsonb(format('«%s»: %s linha(s) em aberto noutra unidade — não entram numa leitura nesta unidade', v_cand.name, v_other));
    END IF;

    -- NOVO (guia): anunciado / recebido pela guia (unidades de stock).
    IF p_delivery_note_id IS NOT NULL THEN
      SELECT COALESCE(sum(l.quantity * l.units_per_uom), 0) INTO v_ann
      FROM public.supplier_delivery_note_lines l
      WHERE l.delivery_note_id = p_delivery_note_id AND l.product_id = v_cand.product_id;
      SELECT COALESCE(sum(pr.quantity * pr.units_per_uom), 0) INTO v_rcv
      FROM public.purchase_order_receipts pr
      WHERE pr.delivery_note_id = p_delivery_note_id AND pr.product_id = v_cand.product_id
        AND pr.kind = 'receipt' AND pr.reverted_at IS NULL;
      IF v_note_has_lines AND v_ann = 0 THEN
        v_warnings := v_warnings || to_jsonb(format('«%s» não consta da guia %s', v_cand.name, v_note_number));
      END IF;
    END IF;

    v_candidates := v_candidates || (jsonb_build_object(
      'product_id',    v_cand.product_id,
      'name',          v_cand.name,
      'sku',           v_cand.sku,
      'barcode',       v_cand.barcode,
      'matched_by',    v_cand.matched_by,
      'uom_id',        v_cand.uom_id,
      'uom_code',      (SELECT code FROM public.uom WHERE id = v_cand.uom_id),
      'units_per_uom', v_factor,
      'open_lines',    v_lines
    ) || CASE WHEN v_cand.code_id IS NOT NULL  -- NOVO (códigos)
              THEN jsonb_build_object('learned_code_id', v_cand.code_id) ELSE '{}'::jsonb END
      || CASE WHEN p_delivery_note_id IS NOT NULL  -- NOVO (guia)
              THEN jsonb_build_object('delivery_note', jsonb_build_object(
                     'announced', v_ann > 0, 'announced_units', trim_scale(v_ann), 'received_units', trim_scale(v_rcv)))
              ELSE '{}'::jsonb END);
  END LOOP;

  RETURN jsonb_build_object(
    'found',           jsonb_array_length(v_candidates) > 0,
    'code',            v_code,
    'organization_id', v_org,
    'warehouse_id',    p_warehouse_id,
    'supplier_id',     p_supplier_id,
    'can_receive',     v_can_receive,
    'candidates',      v_candidates,
    'warnings',        v_warnings
  ) || v_note_info  -- NOVO (guia): '{}' sem guia
     || CASE WHEN v_conv THEN jsonb_build_object('unit_conversion', true) ELSE '{}'::jsonb END;  -- NOVO (códigos)
END;
$function$;

ALTER FUNCTION public.rpc_receiving_lookup(uuid, text, uuid, uuid, boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rpc_receiving_lookup(uuid, text, uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_receiving_lookup(uuid, text, uuid, uuid, boolean) TO authenticated, service_role;

-- ── 8. rpc_receive_by_code + códigos aprendidos + p_unit_conversion ───────
DROP FUNCTION IF EXISTS public.rpc_receive_by_code(uuid, uuid, uuid, numeric, uuid, uuid, uuid, text, boolean, uuid);

CREATE OR REPLACE FUNCTION public.rpc_receive_by_code(p_request_id uuid, p_warehouse_id uuid, p_product_id uuid, p_quantity numeric, p_uom_id uuid DEFAULT NULL::uuid, p_supplier_id uuid DEFAULT NULL::uuid, p_purchase_order_item_id uuid DEFAULT NULL::uuid, p_code text DEFAULT NULL::text, p_dry_run boolean DEFAULT false, p_delivery_note_id uuid DEFAULT NULL::uuid, p_unit_conversion boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor       uuid;
  v_org         uuid;
  v_dry         boolean := COALESCE(p_dry_run, false);
  v_code        text := nullif(btrim(COALESCE(p_code, '')), '');
  v_lc          text;
  v_product     record;
  v_factor      integer;
  v_uom_code    text;
  v_units       numeric;
  v_matched_by  text;
  v_replay      jsonb;
  v_forced      record;
  v_locked      uuid[];
  v_cid         uuid;
  v_open_total  numeric;
  v_open_list   text;
  v_plan        jsonb;
  v_po          record;
  v_r           jsonb;
  v_allocs      jsonb := '[]'::jsonb;
  v_warnings    jsonb := '[]'::jsonb;
  v_to_order    numeric := 0;
  v_to_stock    numeric := 0;
  v_other       integer;
  v_result      jsonb;
  -- NOVO (guia)
  v_note_org       uuid;
  v_note_supplier  uuid;
  v_note_number    text;
  v_note_status    text;
  v_scope          uuid[];
  v_note_poi       uuid[];
  v_note_has_lines boolean := false;
  v_ann            numeric;
  v_rcv            numeric;
  v_checks         jsonb := '[]'::jsonb;
  -- NOVO (códigos)
  v_key            text;
  v_conv           boolean := COALESCE(p_unit_conversion, false);
  v_base_code      text;
  v_line           record;
  v_rest           numeric;
  v_take           numeric;
  v_open_units     numeric;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'Identificador do pedido de receção em falta' USING ERRCODE = 'check_violation';
  END IF;

  SELECT organization_id INTO v_org
  FROM public.warehouses
  WHERE id = p_warehouse_id AND deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Armazém não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission(auth.uid(), 'purchase_orders.receive')
     OR NOT public.has_anew_permission(auth.uid(), 'inventory.edit') THEN
    RAISE EXCEPTION 'Sem permissão para receber encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Pedido já processado → devolve o resultado gravado.
  v_replay := public.fn_receiving_scan_replay(p_request_id, v_org, v_actor, p_warehouse_id, p_product_id, p_quantity, p_uom_id);
  IF v_replay IS NOT NULL THEN
    -- NOVO (guia): o identificador gravado com outra guia (ou sem guia) é erro.
    IF (SELECT s.delivery_note_id FROM public.receiving_scans s WHERE s.id = p_request_id) IS DISTINCT FROM p_delivery_note_id THEN
      RAISE EXCEPTION 'O identificador do pedido de receção já foi usado noutra leitura (outra guia)'
        USING ERRCODE = 'check_violation';
    END IF;
    -- NOVO (códigos): gravado com outra opção de conversão de unidades → erro.
    IF COALESCE((v_replay ->> 'unit_conversion')::boolean, false) IS DISTINCT FROM v_conv THEN
      RAISE EXCEPTION 'O identificador do pedido de receção já foi usado noutra leitura (outra opção de conversão de unidades)'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN v_replay;
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'A quantidade lida tem de ser positiva' USING ERRCODE = 'check_violation';
  END IF;
  IF p_quantity <> floor(p_quantity) THEN
    RAISE EXCEPTION 'A quantidade lida tem de ser um número inteiro (%)', p_quantity USING ERRCODE = 'check_violation';
  END IF;

  SELECT id, name, sku, barcode, uom_id INTO v_product
  FROM public.products
  WHERE id = p_product_id AND organization_id = v_org AND deleted_at IS NULL AND NOT is_deleted;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto inválido para esta organização' USING ERRCODE = 'check_violation';
  END IF;

  IF p_supplier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.suppliers
    WHERE id = p_supplier_id AND organization_id = v_org AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Fornecedor inválido para esta organização' USING ERRCODE = 'check_violation';
  END IF;

  -- NOVO (guia): 1.º lock da ordem global — a guia FOR SHARE (várias leituras
  -- da mesma guia em paralelo; fechar/editar/cancelar esperam). Fixa o
  -- fornecedor e o âmbito.
  IF p_delivery_note_id IS NOT NULL THEN
    SELECT organization_id, supplier_id, note_number, status
    INTO v_note_org, v_note_supplier, v_note_number, v_note_status
    FROM public.supplier_delivery_notes
    WHERE id = p_delivery_note_id
    FOR SHARE;
    IF v_note_org IS NULL OR v_note_org <> v_org THEN
      RAISE EXCEPTION 'Guia do fornecedor não encontrada nesta organização' USING ERRCODE = 'no_data_found';
    END IF;
    IF v_note_status <> 'open' THEN
      RAISE EXCEPTION 'A guia % está % — reabre-a para receber', v_note_number,
        CASE v_note_status WHEN 'closed' THEN 'fechada' ELSE 'cancelada' END
        USING ERRCODE = 'check_violation';
    END IF;
    IF p_supplier_id IS NOT NULL AND p_supplier_id <> v_note_supplier THEN
      RAISE EXCEPTION 'A guia % é de outro fornecedor', v_note_number USING ERRCODE = 'check_violation';
    END IF;
    p_supplier_id := v_note_supplier;
    v_scope := public.fn_delivery_note_scope(p_delivery_note_id);
    SELECT array_agg(DISTINCT l.purchase_order_item_id) FILTER (WHERE l.purchase_order_item_id IS NOT NULL),
           count(*) > 0
    INTO v_note_poi, v_note_has_lines
    FROM public.supplier_delivery_note_lines l
    WHERE l.delivery_note_id = p_delivery_note_id;
  END IF;

  -- Fator da unidade lida (erro claro se a unidade não for do produto).
  v_factor   := public.fn_uom_units_per(p_uom_id, p_product_id);
  v_uom_code := COALESCE((SELECT code FROM public.uom WHERE id = COALESCE(p_uom_id, v_product.uom_id)), 'un.');
  v_units    := p_quantity * v_factor;
  IF v_units > 2147483647 THEN
    RAISE EXCEPTION 'A leitura excede o limite de stock (% unidades)', v_units USING ERRCODE = 'numeric_value_out_of_range';
  END IF;

  -- Como o código lido corresponde a este produto (só registo/aviso).
  IF v_code IS NOT NULL THEN
    v_lc := lower(v_code);
    v_key := public.fn_product_code_key(v_code);  -- NOVO (códigos)
    v_matched_by := CASE
      -- NOVO (códigos): chave normalizada + códigos aprendidos
      WHEN public.fn_product_code_key(v_product.barcode) = v_key
        OR EXISTS (SELECT 1 FROM public.product_codes pc
                   WHERE pc.product_id = p_product_id AND pc.organization_id = v_org
                     AND pc.kind = 'barcode' AND pc.deleted_at IS NULL AND pc.code_key = v_key) THEN 'barcode'
      WHEN EXISTS (SELECT 1 FROM public.purchase_order_items poi
                   JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
                   WHERE po.organization_id = v_org AND poi.product_id = p_product_id
                     AND lower(btrim(poi.supplier_sku)) = v_lc)
        OR EXISTS (SELECT 1 FROM public.item_suppliers i
                   WHERE i.organization_id = v_org AND i.product_id = p_product_id
                     AND i.deleted_at IS NULL AND lower(btrim(i.supplier_sku)) = v_lc)
        OR EXISTS (SELECT 1 FROM public.product_codes pc  -- NOVO (códigos)
                   WHERE pc.product_id = p_product_id AND pc.organization_id = v_org
                     AND pc.kind = 'supplier_ref' AND pc.deleted_at IS NULL AND pc.code_key = v_key) THEN 'supplier_sku'
      WHEN lower(btrim(v_product.sku)) = v_lc THEN 'sku'
      WHEN EXISTS (SELECT 1 FROM public.purchase_order_items poi
                   JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
                   WHERE po.organization_id = v_org AND poi.product_id = p_product_id
                     AND lower(btrim(poi.sku)) = v_lc) THEN 'po_line_sku'
    END;
    IF v_matched_by IS NULL THEN
      v_warnings := v_warnings || to_jsonb(format('O código «%s» não corresponde a «%s»', v_code, v_product.name));
    END IF;
  END IF;

  -- Linha forçada: validações com mensagens claras.
  IF p_purchase_order_item_id IS NOT NULL THEN
    SELECT poi.id, poi.product_id, poi.item_type, poi.quantity, poi.received_quantity,
           COALESCE(poi.units_per_uom, 1) AS units_per_uom, poi.description,
           po.status, po.supplier_id, po.order_number
    INTO v_forced
    FROM public.purchase_order_items poi
    JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
    WHERE poi.id = p_purchase_order_item_id AND po.organization_id = v_org AND po.deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Linha de encomenda não encontrada' USING ERRCODE = 'no_data_found';
    END IF;
    IF v_forced.item_type <> 'product' OR v_forced.product_id IS DISTINCT FROM p_product_id THEN
      RAISE EXCEPTION 'A linha "%" (%) não é do produto lido', v_forced.description, v_forced.order_number
        USING ERRCODE = 'check_violation';
    END IF;
    IF p_supplier_id IS NOT NULL AND v_forced.supplier_id IS DISTINCT FROM p_supplier_id THEN
      RAISE EXCEPTION 'A linha "%" (%) é de outro fornecedor', v_forced.description, v_forced.order_number
        USING ERRCODE = 'check_violation';
    END IF;
    -- NOVO (guia): a linha forçada tem de estar no âmbito da guia.
    IF v_scope IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.purchase_order_items poi
      WHERE poi.id = p_purchase_order_item_id AND poi.purchase_order_id = ANY (v_scope)
    ) THEN
      RAISE EXCEPTION 'A linha "%" (%) não está nas encomendas da guia %', v_forced.description, v_forced.order_number, v_note_number
        USING ERRCODE = 'check_violation';
    END IF;
    -- NOVO (códigos): com conversão a linha pode estar noutra unidade (a
    -- divisibilidade é verificada no plano).
    IF NOT v_conv AND v_forced.units_per_uom <> v_factor THEN
      RAISE EXCEPTION 'A linha "%" (%) está noutra unidade (% un. por unidade; a leitura tem %)', v_forced.description, v_forced.order_number, v_forced.units_per_uom, v_factor
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_forced.status NOT IN ('pending', 'ordered', 'partially_received') OR v_forced.quantity <= v_forced.received_quantity THEN
      RAISE EXCEPTION 'A linha "%" (%) não está em aberto', v_forced.description, v_forced.order_number
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Reserva do identificador (fica com o resultado no fim). Um pedido igual
  -- em paralelo espera aqui pelo primeiro e, quando este confirma, devolve o
  -- resultado gravado. Em dry-run nada é gravado.
  IF NOT v_dry THEN
    INSERT INTO public.receiving_scans (
      id, organization_id, warehouse_id, supplier_id, code, matched_by,
      product_id, uom_id, quantity, units, result, created_by,
      delivery_note_id  -- NOVO (guia)
    ) VALUES (
      p_request_id, v_org, p_warehouse_id, p_supplier_id, v_code, v_matched_by,
      p_product_id, p_uom_id, p_quantity, v_units, '{}'::jsonb, v_actor,
      p_delivery_note_id
    )
    ON CONFLICT (id) DO NOTHING;

    IF NOT FOUND THEN
      v_replay := public.fn_receiving_scan_replay(p_request_id, v_org, v_actor, p_warehouse_id, p_product_id, p_quantity, p_uom_id);
      IF v_replay IS NULL THEN
        RAISE EXCEPTION 'Pedido de receção em conflito — tenta de novo' USING ERRCODE = 'serialization_failure';
      END IF;
      -- NOVO (guia)
      IF (SELECT s.delivery_note_id FROM public.receiving_scans s WHERE s.id = p_request_id) IS DISTINCT FROM p_delivery_note_id THEN
        RAISE EXCEPTION 'O identificador do pedido de receção já foi usado noutra leitura (outra guia)'
          USING ERRCODE = 'check_violation';
      END IF;
      -- NOVO (códigos)
      IF COALESCE((v_replay ->> 'unit_conversion')::boolean, false) IS DISTINCT FROM v_conv THEN
        RAISE EXCEPTION 'O identificador do pedido de receção já foi usado noutra leitura (outra opção de conversão de unidades)'
          USING ERRCODE = 'check_violation';
      END IF;
      RETURN v_replay;
    END IF;
  END IF;

  -- 1. Serializa leituras do mesmo produto.
  PERFORM pg_advisory_xact_lock(hashtextextended('receiving:' || v_org::text || ':' || p_product_id::text, 0));

  BEGIN
    -- 2. Tranca as POs candidatas (ordem fixa por id).
    SELECT COALESCE(array_agg(t.id ORDER BY t.id), ARRAY[]::uuid[]) INTO v_locked
    FROM (
      SELECT po.id
      FROM public.purchase_orders po
      WHERE po.id IN (
              SELECT o.purchase_order_id
              FROM public.fn_receiving_open_lines(v_org, ARRAY[p_product_id], p_supplier_id) o
              WHERE (v_conv OR o.units_per_uom = v_factor)  -- NOVO (códigos)
                AND (p_purchase_order_item_id IS NULL OR o.purchase_order_item_id = p_purchase_order_item_id)
                AND (v_scope IS NULL OR o.purchase_order_id = ANY (v_scope)))  -- NOVO (guia)
        AND po.deleted_at IS NULL
        AND po.status IN ('pending', 'ordered', 'partially_received')
      ORDER BY po.id
      FOR UPDATE
    ) t;

    -- 3. Locks das Encomendas Cliente (os da Fase 1), ordem fixa.
    FOR v_cid IN
      SELECT DISTINCT po.source_id
      FROM public.purchase_orders po
      WHERE po.id = ANY (v_locked) AND po.source_type = 'contract' AND po.source_id IS NOT NULL
      ORDER BY po.source_id
    LOOP
      PERFORM pg_advisory_xact_lock(hashtextextended('po_receipt_contract:' || v_cid::text, 0));
    END LOOP;

    -- 4. Em aberto relido com tudo trancado (só POs trancadas). take = o que
    --    cada linha recebe, enchendo pela ordem D2 (NOVO (guia): primeiro as
    --    linhas indicadas na guia; sem guia a ordem é a mesma).
    IF NOT v_conv THEN  -- caminho da fatia 2 (sem conversão), intacto
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'rn', a.rn, 'purchase_order_id', a.purchase_order_id, 'order_number', a.order_number,
             'po_status', a.po_status, 'purchase_order_item_id', a.purchase_order_item_id,
             'open_quantity', a.open_quantity, 'take', a.take) ORDER BY a.rn), '[]'::jsonb),
           COALESCE(SUM(a.open_quantity), 0),
           string_agg(DISTINCT a.order_number, ', ')
    INTO v_plan, v_open_total, v_open_list
    FROM (
      SELECT c.rn, c.purchase_order_id, c.order_number, c.po_status, c.purchase_order_item_id, c.open_quantity,
             LEAST(c.open_quantity,
                   GREATEST(0, p_quantity - COALESCE(SUM(c.open_quantity) OVER (
                     ORDER BY c.rn ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0))) AS take
      FROM (
        SELECT o.*, row_number() OVER (
                 ORDER BY CASE WHEN o.purchase_order_item_id = ANY (v_note_poi) THEN 0 ELSE 1 END,  -- NOVO (guia)
                          o.allocation_rank) AS rn
        FROM public.fn_receiving_open_lines(v_org, ARRAY[p_product_id], p_supplier_id) o
        WHERE o.purchase_order_id = ANY (v_locked)
          AND o.units_per_uom = v_factor
          AND (p_purchase_order_item_id IS NULL OR o.purchase_order_item_id = p_purchase_order_item_id)
      ) c
    ) a;

    -- D3: acima do em aberto → recusa tudo.
    IF v_open_total < p_quantity THEN
      RAISE EXCEPTION '%', format('Leste %s %s; em aberto %s %s%s', p_quantity, v_uom_code, v_open_total, v_uom_code,
        CASE WHEN v_open_list IS NOT NULL THEN format(' (%s)', v_open_list)
             WHEN p_purchase_order_item_id IS NOT NULL THEN ' (a linha indicada já não está em aberto)'
             ELSE format(' — sem encomendas a fornecedor em aberto para «%s»%s', v_product.name,
                         CASE WHEN p_supplier_id IS NOT NULL THEN ' deste fornecedor nesta unidade' ELSE ' nesta unidade' END)
        END)
        -- NOVO (guia): âmbito da guia na mensagem ('' sem guia)
        || CASE WHEN p_delivery_note_id IS NOT NULL
                THEN format(' — âmbito da guia %s%s', v_note_number,
                            CASE WHEN v_scope IS NOT NULL THEN format(' (%s encomenda(s) da guia)', cardinality(v_scope))
                                 ELSE ' (encomendas do fornecedor)' END)
                ELSE '' END
        USING ERRCODE = 'check_violation';
    END IF;

    ELSE
      -- NOVO (códigos): conversão caixa↔unidades. Linhas elegíveis = todas as
      -- linhas em aberto trancadas (os fatores das linhas são todos sobre a
      -- unidade de stock do produto — mesma base); ordem = linhas da guia →
      -- D2, sem preferir a unidade lida. Cada linha só leva unidades inteiras
      -- suas: take = LEAST(em aberto, floor(resto / fator)). Resto ≠ 0 →
      -- recusa tudo (mensagens em unidades de stock).
      v_rest := v_units;
      v_open_units := 0;
      v_plan := '[]'::jsonb;
      v_base_code := COALESCE((SELECT code FROM public.uom WHERE id = v_product.uom_id), 'un.');
      FOR v_line IN
        SELECT o.*, row_number() OVER (
                 ORDER BY CASE WHEN o.purchase_order_item_id = ANY (v_note_poi) THEN 0 ELSE 1 END,
                          o.allocation_rank) AS rn
        FROM public.fn_receiving_open_lines(v_org, ARRAY[p_product_id], p_supplier_id) o
        WHERE o.purchase_order_id = ANY (v_locked)
          AND o.units_per_uom >= 1
          AND (p_purchase_order_item_id IS NULL OR o.purchase_order_item_id = p_purchase_order_item_id)
        ORDER BY rn
      LOOP
        v_take := LEAST(v_line.open_quantity, floor(v_rest / v_line.units_per_uom));
        v_rest := v_rest - v_take * v_line.units_per_uom;
        v_open_units := v_open_units + v_line.open_quantity * v_line.units_per_uom;
        v_plan := v_plan || jsonb_build_object(
          'rn', v_line.rn, 'purchase_order_id', v_line.purchase_order_id, 'order_number', v_line.order_number,
          'po_status', v_line.po_status, 'purchase_order_item_id', v_line.purchase_order_item_id,
          'open_quantity', v_line.open_quantity, 'take', v_take);
      END LOOP;
      SELECT string_agg(DISTINCT x ->> 'order_number', ', ') INTO v_open_list
      FROM jsonb_array_elements(v_plan) x;

      IF v_rest <> 0 THEN
        RAISE EXCEPTION '%', CASE
          WHEN v_open_units < v_units THEN
            format('Leste %s %s (%s %s); em aberto %s %s%s', p_quantity, v_uom_code, trim_scale(v_units), v_base_code,
                   trim_scale(v_open_units), v_base_code,
                   CASE WHEN v_open_list IS NOT NULL THEN format(' (%s)', v_open_list)
                        WHEN p_purchase_order_item_id IS NOT NULL THEN ' (a linha indicada já não está em aberto)'
                        ELSE format(' — sem encomendas a fornecedor em aberto para «%s»%s', v_product.name,
                                    CASE WHEN p_supplier_id IS NOT NULL THEN ' deste fornecedor' ELSE '' END)
                   END)
          ELSE
            format('Leste %s %s (%s %s); as linhas em aberto (%s) só recebem unidades inteiras da sua embalagem — ficam %s %s por distribuir',
                   p_quantity, v_uom_code, trim_scale(v_units), v_base_code, v_open_list, trim_scale(v_rest), v_base_code)
          END
          || CASE WHEN p_delivery_note_id IS NOT NULL
                  THEN format(' — âmbito da guia %s%s', v_note_number,
                              CASE WHEN v_scope IS NOT NULL THEN format(' (%s encomenda(s) da guia)', cardinality(v_scope))
                                   ELSE ' (encomendas do fornecedor)' END)
                  ELSE '' END
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    -- NOVO (guia): avisos de anunciado (decisão 1: aviso + confirmação no
    -- ecrã). Com o lock do produto detido, o recebido pela guia é estável.
    IF p_delivery_note_id IS NOT NULL AND v_note_has_lines THEN
      SELECT COALESCE(sum(l.quantity * l.units_per_uom), 0) INTO v_ann
      FROM public.supplier_delivery_note_lines l
      WHERE l.delivery_note_id = p_delivery_note_id AND l.product_id = p_product_id;
      IF v_ann = 0 THEN
        v_checks   := v_checks || to_jsonb('nao_consta_da_guia'::text);
        v_warnings := v_warnings || to_jsonb(format('«%s» não consta da guia %s', v_product.name, v_note_number));
      ELSE
        SELECT COALESCE(sum(pr.quantity * pr.units_per_uom), 0) INTO v_rcv
        FROM public.purchase_order_receipts pr
        WHERE pr.delivery_note_id = p_delivery_note_id AND pr.product_id = p_product_id
          AND pr.kind = 'receipt' AND pr.reverted_at IS NULL;
        IF v_rcv + v_units > v_ann THEN
          v_checks   := v_checks || to_jsonb('acima_do_anunciado'::text);
          v_warnings := v_warnings || to_jsonb(format('«%s»: com esta leitura ficam %s un. recebidas pela guia %s; anunciadas %s un.',
                          v_product.name, trim_scale(v_rcv + v_units), v_note_number, trim_scale(v_ann)));
        END IF;
      END IF;
    END IF;

    -- 5. Receção pela Fase 1, uma chamada por PO, pela ordem D2 (os locks já
    --    estão todos detidos, a ordem das chamadas não cria esperas novas).
    FOR v_po IN
      SELECT l.purchase_order_id, min(l.order_number) AS order_number,
             bool_or(l.po_status = 'pending') AS pending,
             jsonb_agg(jsonb_build_object('purchase_order_item_id', l.purchase_order_item_id, 'quantity', l.take) ORDER BY l.rn) AS lines,
             array_agg(l.purchase_order_item_id ORDER BY l.rn) AS ids
      FROM jsonb_to_recordset(v_plan) AS l(rn bigint, purchase_order_id uuid, order_number text, po_status text,
                                           purchase_order_item_id uuid, open_quantity numeric, take numeric)
      WHERE l.take > 0
      GROUP BY l.purchase_order_id
      ORDER BY min(l.rn)
    LOOP
      v_r := public.rpc_receive_purchase_order_lines(v_po.purchase_order_id, p_warehouse_id, v_po.lines, NULL);

      IF NOT v_dry THEN
        -- Liga as linhas de histórico acabadas de gravar pela Fase 1 a esta
        -- leitura (received_at = now() = início da transação; received_by =
        -- current_business_user_id(), como a Fase 1 grava).
        UPDATE public.purchase_order_receipts
        SET receiving_scan_id = p_request_id,
            delivery_note_id  = p_delivery_note_id  -- NOVO (guia); NULL sem guia (já era NULL)
        WHERE purchase_order_id = v_po.purchase_order_id
          AND purchase_order_item_id = ANY (v_po.ids)
          AND kind = 'receipt'
          AND receiving_scan_id IS NULL
          AND received_at = now()
          AND received_by = v_actor;
      END IF;

      IF v_po.pending THEN
        v_warnings := v_warnings || to_jsonb(format('%s ainda está pendente (não confirmada ao fornecedor)', v_po.order_number));
      END IF;

      v_allocs := v_allocs || jsonb_build_object(
        'purchase_order_id',    v_po.purchase_order_id,
        'order_number',         v_r -> 'order_number',
        'status',               v_r -> 'status',
        'stock_skipped',        v_r -> 'stock_skipped',
        'units_to_order_total', v_r -> 'units_to_order_total',
        'units_to_stock_total', v_r -> 'units_to_stock_total',
        'lines',                v_r -> 'lines'
      );
      v_to_order := v_to_order + COALESCE((v_r ->> 'units_to_order_total')::numeric, 0);
      v_to_stock := v_to_stock + COALESCE((v_r ->> 'units_to_stock_total')::numeric, 0);
    END LOOP;

    IF v_dry THEN
      RAISE EXCEPTION USING ERRCODE = 'OLPV2', MESSAGE = 'receive_by_code_dry_run_rollback';
    END IF;
  EXCEPTION WHEN SQLSTATE 'OLPV2' THEN
    NULL;  -- dry-run: tudo o que a receção escreveu foi desfeito com a subtransação
  END;

  SELECT count(*) INTO v_other
  FROM public.fn_receiving_open_lines(v_org, ARRAY[p_product_id], p_supplier_id) o
  WHERE NOT v_conv AND o.units_per_uom <> v_factor  -- NOVO (códigos): com conversão nenhuma fica de fora
    AND (v_scope IS NULL OR o.purchase_order_id = ANY (v_scope));  -- NOVO (guia)
  IF v_other > 0 THEN
    v_warnings := v_warnings || to_jsonb(format('%s linha(s) em aberto de «%s» noutra unidade não entraram nesta leitura', v_other, v_product.name));
  END IF;

  v_result := jsonb_build_object(
    'request_id',           p_request_id,
    'replayed',             false,
    'dry_run',              v_dry,
    'product_id',           p_product_id,
    'warehouse_id',         p_warehouse_id,
    'supplier_id',          p_supplier_id,
    'uom_id',               p_uom_id,
    'uom_code',             v_uom_code,
    'units_per_uom',        v_factor,
    'quantity',             p_quantity,
    'units',                v_units,
    'matched_by',           v_matched_by,
    'allocations',          v_allocs,
    'units_to_order_total', v_to_order,
    'units_to_stock_total', v_to_stock,
    'warnings',             v_warnings
  ) || CASE WHEN p_delivery_note_id IS NOT NULL  -- NOVO (guia): '{}' sem guia
            THEN jsonb_build_object('delivery_note_id', p_delivery_note_id,
                                    'delivery_note_number', v_note_number,
                                    'delivery_note_checks', v_checks)
            ELSE '{}'::jsonb END
    || CASE WHEN v_conv THEN jsonb_build_object('unit_conversion', true) ELSE '{}'::jsonb END;  -- NOVO (códigos)

  IF NOT v_dry THEN
    UPDATE public.receiving_scans SET result = v_result WHERE id = p_request_id;
  END IF;

  RETURN v_result;
END;
$function$;

ALTER FUNCTION public.rpc_receive_by_code(uuid, uuid, uuid, numeric, uuid, uuid, uuid, text, boolean, uuid, boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rpc_receive_by_code(uuid, uuid, uuid, numeric, uuid, uuid, uuid, text, boolean, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_receive_by_code(uuid, uuid, uuid, numeric, uuid, uuid, uuid, text, boolean, uuid, boolean) TO authenticated, service_role;

-- ── 9. rpc_delivery_note_save: linhas noutra unidade da mesma base (decisão 7) ─
-- CREATE OR REPLACE (mesma assinatura; OID, owner e GRANTs mantêm-se).
CREATE OR REPLACE FUNCTION public.rpc_delivery_note_save(p_delivery_note_id uuid, p_supplier_id uuid, p_note_number text, p_document_date date DEFAULT NULL::date, p_notes text DEFAULT NULL::text, p_purchase_order_ids uuid[] DEFAULT NULL::uuid[], p_lines jsonb DEFAULT NULL::jsonb, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor      uuid;
  v_org        uuid;
  v_number     text := btrim(COALESCE(p_note_number, ''));
  v_notes      text := nullif(btrim(COALESCE(p_notes, '')), '');
  v_cur        public.supplier_delivery_notes%ROWTYPE;
  v_exists     boolean;
  v_cur_pos    uuid[];
  v_new_pos    uuid[];
  v_final_pos  uuid[];
  v_po         record;
  v_el         jsonb;
  v_ord        bigint;
  v_prod       record;
  v_poi        record;
  v_uom        uuid;
  v_factor     integer;
  v_qty        numeric;
  v_poi_id     uuid;
  v_desc       text;
  v_lines      jsonb := '[]'::jsonb;
  v_cur_lines  jsonb;
  v_dup        uuid;
  v_removed    text;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_delivery_note_id IS NULL THEN
    RAISE EXCEPTION 'Identificador da guia em falta' USING ERRCODE = 'check_violation';
  END IF;

  SELECT organization_id INTO v_org
  FROM public.suppliers
  WHERE id = p_supplier_id AND deleted_at IS NULL;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Fornecedor não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission(auth.uid(), 'purchase_orders.receive') THEN
    RAISE EXCEPTION 'Sem permissão para registar guias desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_number = '' THEN
    RAISE EXCEPTION 'Indica o número da guia' USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(v_number) > 100 THEN
    RAISE EXCEPTION 'Número da guia demasiado longo' USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(v_notes) > 2000 THEN
    RAISE EXCEPTION 'Notas da guia demasiado longas' USING ERRCODE = 'check_violation';
  END IF;

  -- Guia existente: trancada até ao fim (espera pelas leituras em curso).
  SELECT * INTO v_cur FROM public.supplier_delivery_notes WHERE id = p_delivery_note_id FOR UPDATE;
  v_exists := FOUND;

  IF v_exists THEN
    IF v_cur.organization_id IS DISTINCT FROM v_org THEN
      RAISE EXCEPTION 'Esta guia pertence a outra organização' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_cur.supplier_id IS DISTINCT FROM p_supplier_id THEN
      RAISE EXCEPTION 'A guia % é de outro fornecedor (o fornecedor de uma guia não muda)', v_cur.note_number
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT COALESCE(array_agg(purchase_order_id ORDER BY purchase_order_id), ARRAY[]::uuid[]) INTO v_cur_pos
    FROM public.supplier_delivery_note_orders WHERE delivery_note_id = p_delivery_note_id;
  ELSE
    v_cur_pos := ARRAY[]::uuid[];
  END IF;

  -- POs pedidas: mesma organização e fornecedor; as que entram de novo não
  -- podem estar apagadas nem canceladas.
  IF p_purchase_order_ids IS NOT NULL THEN
    IF cardinality(p_purchase_order_ids) > 100 THEN
      RAISE EXCEPTION 'Demasiadas encomendas numa guia (máximo 100)' USING ERRCODE = 'check_violation';
    END IF;
    SELECT COALESCE(array_agg(DISTINCT x ORDER BY x), ARRAY[]::uuid[]) INTO v_new_pos
    FROM unnest(p_purchase_order_ids) x WHERE x IS NOT NULL;

    FOR v_po IN
      SELECT x AS id, po.organization_id, po.supplier_id, po.order_number, po.status, po.deleted_at
      FROM unnest(v_new_pos) x
      LEFT JOIN public.purchase_orders po ON po.id = x
    LOOP
      IF v_po.organization_id IS DISTINCT FROM v_org THEN
        RAISE EXCEPTION 'Encomenda a fornecedor não encontrada nesta organização' USING ERRCODE = 'no_data_found';
      END IF;
      IF v_po.supplier_id IS DISTINCT FROM p_supplier_id THEN
        RAISE EXCEPTION '% é de outro fornecedor', v_po.order_number USING ERRCODE = 'check_violation';
      END IF;
      IF NOT (v_po.id = ANY (v_cur_pos)) AND (v_po.deleted_at IS NOT NULL OR v_po.status = 'cancelled') THEN
        RAISE EXCEPTION '% está apagada ou cancelada', v_po.order_number USING ERRCODE = 'check_violation';
      END IF;
    END LOOP;
    v_final_pos := v_new_pos;
  ELSE
    v_final_pos := v_cur_pos;
  END IF;

  -- Linhas anunciadas: normalizadas para comparar e gravar.
  IF p_lines IS NOT NULL THEN
    IF jsonb_typeof(p_lines) <> 'array' THEN
      RAISE EXCEPTION 'As linhas da guia têm de ser uma lista' USING ERRCODE = 'check_violation';
    END IF;
    IF jsonb_array_length(p_lines) > 500 THEN
      RAISE EXCEPTION 'Demasiadas linhas numa guia (máximo 500)' USING ERRCODE = 'check_violation';
    END IF;

    FOR v_el, v_ord IN SELECT e, o FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS t(e, o) LOOP
      IF jsonb_typeof(v_el) <> 'object' THEN
        RAISE EXCEPTION 'Linha % da guia inválida', v_ord USING ERRCODE = 'check_violation';
      END IF;
      BEGIN
        v_qty    := (v_el ->> 'quantity')::numeric;
        v_uom    := nullif(v_el ->> 'uom_id', '')::uuid;
        v_poi_id := nullif(v_el ->> 'purchase_order_item_id', '')::uuid;
        SELECT id, name, uom_id INTO v_prod
        FROM public.products
        WHERE id = nullif(v_el ->> 'product_id', '')::uuid
          AND organization_id = v_org AND deleted_at IS NULL AND NOT is_deleted;
      EXCEPTION WHEN invalid_text_representation OR invalid_parameter_value THEN
        RAISE EXCEPTION 'Linha % da guia com dados inválidos', v_ord USING ERRCODE = 'check_violation';
      END;
      IF v_prod.id IS NULL THEN
        RAISE EXCEPTION 'Linha % da guia: produto inválido para esta organização', v_ord USING ERRCODE = 'check_violation';
      END IF;
      IF v_qty IS NULL OR v_qty <= 0 OR v_qty > 1000000000 THEN
        RAISE EXCEPTION 'Linha % da guia: a quantidade tem de ser positiva', v_ord USING ERRCODE = 'check_violation';
      END IF;
      v_desc := nullif(btrim(COALESCE(v_el ->> 'description', '')), '');
      IF char_length(v_desc) > 500 THEN
        RAISE EXCEPTION 'Linha % da guia: descrição demasiado longa', v_ord USING ERRCODE = 'check_violation';
      END IF;

      -- Unidade da linha: a do produto se não indicada ou igual.
      IF v_uom IS NOT DISTINCT FROM v_prod.uom_id THEN
        v_uom := NULL;
      END IF;
      v_factor := public.fn_uom_units_per(v_uom, v_prod.id);

      IF v_poi_id IS NOT NULL THEN
        SELECT poi.id, poi.product_id, poi.item_type, COALESCE(poi.units_per_uom, 1) AS units_per_uom,
               poi.description, po.id AS po_id, po.supplier_id, po.order_number, po.organization_id
        INTO v_poi
        FROM public.purchase_order_items poi
        JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
        WHERE poi.id = v_poi_id AND po.deleted_at IS NULL;
        IF NOT FOUND OR v_poi.organization_id IS DISTINCT FROM v_org THEN
          RAISE EXCEPTION 'Linha % da guia: linha de encomenda não encontrada', v_ord USING ERRCODE = 'no_data_found';
        END IF;
        IF v_poi.supplier_id IS DISTINCT FROM p_supplier_id THEN
          RAISE EXCEPTION 'Linha % da guia: a linha "%" (%) é de outro fornecedor', v_ord, v_poi.description, v_poi.order_number
            USING ERRCODE = 'check_violation';
        END IF;
        IF v_poi.item_type <> 'product' OR v_poi.product_id IS DISTINCT FROM v_prod.id THEN
          RAISE EXCEPTION 'Linha % da guia: a linha "%" (%) não é deste produto', v_ord, v_poi.description, v_poi.order_number
            USING ERRCODE = 'check_violation';
        END IF;
        -- NOVO (códigos, decisão 7): a linha da guia pode estar noutra unidade
        -- da mesma base que a linha da PO (os dois fatores são sobre a unidade
        -- de stock do produto; fn_uom_units_per já recusou unidades de outra base).
        IF cardinality(v_final_pos) > 0 AND NOT (v_poi.po_id = ANY (v_final_pos)) THEN
          RAISE EXCEPTION 'Linha % da guia: % não está nas encomendas da guia', v_ord, v_poi.order_number
            USING ERRCODE = 'check_violation';
        END IF;
      END IF;

      v_lines := v_lines || jsonb_build_object(
        'position', v_ord::integer, 'product_id', v_prod.id, 'uom_id', v_uom, 'units_per_uom', v_factor,
        'quantity', v_qty, 'purchase_order_item_id', v_poi_id, 'description', v_desc);
    END LOOP;
  END IF;

  IF v_exists THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'position', l.position, 'product_id', l.product_id, 'uom_id', l.uom_id, 'units_per_uom', l.units_per_uom,
             'quantity', l.quantity, 'purchase_order_item_id', l.purchase_order_item_id, 'description', l.description)
             ORDER BY l.position, l.id), '[]'::jsonb)
    INTO v_cur_lines
    FROM public.supplier_delivery_note_lines l WHERE l.delivery_note_id = p_delivery_note_id;

    -- Pedido igual ao gravado (repetição da criação ou edição sem mudanças).
    IF v_cur.note_number = v_number
       AND v_cur.document_date IS NOT DISTINCT FROM p_document_date
       AND v_cur.notes IS NOT DISTINCT FROM v_notes
       AND v_final_pos = v_cur_pos
       AND (p_lines IS NULL OR v_lines = v_cur_lines) THEN
      RETURN public.rpc_delivery_note_get(p_delivery_note_id) || jsonb_build_object('saved', false);
    END IF;

    IF p_expected_updated_at IS NULL OR p_expected_updated_at IS DISTINCT FROM v_cur.updated_at THEN
      RAISE EXCEPTION 'A guia % foi alterada entretanto — abre-a de novo antes de editar', v_cur.note_number
        USING ERRCODE = 'serialization_failure';
    END IF;
    IF v_cur.status <> 'open' THEN
      RAISE EXCEPTION 'A guia % está %; só uma guia aberta pode ser editada', v_cur.note_number,
        CASE v_cur.status WHEN 'closed' THEN 'fechada' ELSE 'cancelada' END
        USING ERRCODE = 'check_violation';
    END IF;

    -- Não retirar POs que já têm receções ativas por esta guia.
    SELECT string_agg(DISTINCT po.order_number, ', ') INTO v_removed
    FROM public.purchase_order_receipts pr
    JOIN public.purchase_orders po ON po.id = pr.purchase_order_id
    WHERE pr.delivery_note_id = p_delivery_note_id
      AND pr.kind = 'receipt' AND pr.reverted_at IS NULL
      AND pr.purchase_order_id = ANY (v_cur_pos)
      AND NOT (pr.purchase_order_id = ANY (v_final_pos));
    IF v_removed IS NOT NULL THEN
      RAISE EXCEPTION 'Não podes retirar % da guia: já tem receções por esta guia', v_removed
        USING ERRCODE = 'check_violation';
    END IF;
    -- Guia que passa a ter POs: as receções ativas têm de caber nelas.
    IF cardinality(v_final_pos) > 0 THEN
      SELECT string_agg(DISTINCT po.order_number, ', ') INTO v_removed
      FROM public.purchase_order_receipts pr
      JOIN public.purchase_orders po ON po.id = pr.purchase_order_id
      WHERE pr.delivery_note_id = p_delivery_note_id
        AND pr.kind = 'receipt' AND pr.reverted_at IS NULL
        AND NOT (pr.purchase_order_id = ANY (v_final_pos));
      IF v_removed IS NOT NULL THEN
        RAISE EXCEPTION 'A guia já tem receções em % — essas encomendas têm de ficar na guia', v_removed
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  -- Nº repetido no mesmo fornecedor (guias não canceladas).
  SELECT id INTO v_dup
  FROM public.supplier_delivery_notes
  WHERE organization_id = v_org AND supplier_id = p_supplier_id
    AND lower(btrim(note_number)) = lower(v_number)
    AND status <> 'cancelled' AND id <> p_delivery_note_id
  LIMIT 1;
  IF v_dup IS NOT NULL THEN
    RAISE EXCEPTION 'Já existe a guia % deste fornecedor', v_number
      USING ERRCODE = 'unique_violation', DETAIL = v_dup::text,
            HINT = 'Abre a guia existente (id em DETAIL).';
  END IF;

  BEGIN
    IF v_exists THEN
      UPDATE public.supplier_delivery_notes
      SET note_number   = v_number,
          document_date = p_document_date,
          notes         = v_notes,
          updated_at    = clock_timestamp()
      WHERE id = p_delivery_note_id;
    ELSE
      INSERT INTO public.supplier_delivery_notes (
        id, organization_id, supplier_id, note_number, document_date, notes, created_by, created_at, updated_at
      ) VALUES (
        p_delivery_note_id, v_org, p_supplier_id, v_number, p_document_date, v_notes, v_actor, now(), clock_timestamp()
      )
      ON CONFLICT (id) DO NOTHING;
      IF NOT FOUND THEN
        -- Mesmo id criado em paralelo: o cliente repete e cai na comparação.
        RAISE EXCEPTION 'Guia em conflito — tenta de novo' USING ERRCODE = 'serialization_failure';
      END IF;
    END IF;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_dup
    FROM public.supplier_delivery_notes
    WHERE organization_id = v_org AND supplier_id = p_supplier_id
      AND lower(btrim(note_number)) = lower(v_number)
      AND status <> 'cancelled' AND id <> p_delivery_note_id
    LIMIT 1;
    RAISE EXCEPTION 'Já existe a guia % deste fornecedor', v_number
      USING ERRCODE = 'unique_violation', DETAIL = COALESCE(v_dup::text, ''),
            HINT = 'Abre a guia existente (id em DETAIL).';
  END;

  IF v_final_pos IS DISTINCT FROM v_cur_pos THEN
    DELETE FROM public.supplier_delivery_note_orders
    WHERE delivery_note_id = p_delivery_note_id AND NOT (purchase_order_id = ANY (v_final_pos));
    INSERT INTO public.supplier_delivery_note_orders (delivery_note_id, purchase_order_id, organization_id, created_by)
    SELECT p_delivery_note_id, x, v_org, v_actor
    FROM unnest(v_final_pos) x
    WHERE NOT (x = ANY (v_cur_pos));
  END IF;

  IF p_lines IS NOT NULL AND (NOT v_exists OR v_lines IS DISTINCT FROM v_cur_lines) THEN
    DELETE FROM public.supplier_delivery_note_lines WHERE delivery_note_id = p_delivery_note_id;
    INSERT INTO public.supplier_delivery_note_lines (
      delivery_note_id, organization_id, position, product_id, uom_id, units_per_uom, quantity,
      purchase_order_item_id, description, created_by
    )
    SELECT p_delivery_note_id, v_org, l.position, l.product_id, l.uom_id, l.units_per_uom, l.quantity,
           l.purchase_order_item_id, l.description, v_actor
    FROM jsonb_to_recordset(v_lines) AS l(position integer, product_id uuid, uom_id uuid, units_per_uom integer,
                                          quantity numeric, purchase_order_item_id uuid, description text);
  END IF;

  RETURN public.rpc_delivery_note_get(p_delivery_note_id) || jsonb_build_object('saved', true);
END;
$function$;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- REVERSÃO (não executar com a migration). Correr numa transação única
-- (BEGIN; … COMMIT;). Repõe rpc_receiving_lookup, rpc_receive_by_code e
-- rpc_delivery_note_save EXATAMENTE como estavam vivas antes desta migration
-- (pg_get_functiondef de 06/10/2026, iguais a 20261209100000) e apaga os
-- objetos novos. As receções feitas com códigos aprendidos ou com conversão
-- ficam como receções normais; perdem-se os códigos aprendidos. Unidades
-- 'un' definidas em produtos pelo "aprender" ficam (são dados do produto).
--
-- SET lock_timeout = '5s';
-- DROP FUNCTION public.rpc_receive_by_code(uuid, uuid, uuid, numeric, uuid, uuid, uuid, text, boolean, uuid, boolean);
-- DROP FUNCTION public.rpc_receiving_lookup(uuid, text, uuid, uuid, boolean);
-- CREATE OR REPLACE FUNCTION public.rpc_receiving_lookup(p_warehouse_id uuid, p_code text, p_supplier_id uuid DEFAULT NULL::uuid, p_delivery_note_id uuid DEFAULT NULL::uuid)
--  RETURNS jsonb
--  LANGUAGE plpgsql
--  STABLE SECURITY DEFINER
--  SET search_path TO 'public', 'pg_temp'
-- AS $function$
-- DECLARE
--   v_org         uuid;
--   v_code        text := btrim(COALESCE(p_code, ''));
--   v_lc          text;
--   v_can_receive boolean;
--   v_level       integer;
--   v_cand        record;
--   v_factor      integer;
--   v_lines       jsonb;
--   v_candidates  jsonb := '[]'::jsonb;
--   v_warnings    jsonb := '[]'::jsonb;
--   v_other       integer;
--   v_other_txt   text;
--   v_matches     jsonb;
--   -- NOVO (guia)
--   v_note_org       uuid;
--   v_note_supplier  uuid;
--   v_note_number    text;
--   v_note_status    text;
--   v_scope          uuid[];
--   v_note_poi       uuid[];
--   v_note_has_lines boolean := false;
--   v_ann            numeric;
--   v_rcv            numeric;
--   v_note_info      jsonb := '{}'::jsonb;
-- BEGIN
--   SELECT organization_id INTO v_org
--   FROM public.warehouses
--   WHERE id = p_warehouse_id AND deleted_at IS NULL;
--
--   IF v_org IS NULL THEN
--     RAISE EXCEPTION 'Armazém não encontrado' USING ERRCODE = 'no_data_found';
--   END IF;
--
--   IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
--      OR NOT (public.has_anew_permission(auth.uid(), 'purchase_orders.receive')
--              OR public.has_anew_permission(auth.uid(), 'purchase_orders.view')) THEN
--     RAISE EXCEPTION 'Sem permissão para consultar encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
--   END IF;
--
--   v_can_receive := public.has_anew_permission(auth.uid(), 'purchase_orders.receive')
--                AND public.has_anew_permission(auth.uid(), 'inventory.edit');
--
--   IF v_code = '' THEN
--     RAISE EXCEPTION 'Indica o código lido' USING ERRCODE = 'check_violation';
--   END IF;
--   IF char_length(v_code) > 200 THEN
--     RAISE EXCEPTION 'Código lido demasiado longo' USING ERRCODE = 'check_violation';
--   END IF;
--
--   IF p_supplier_id IS NOT NULL AND NOT EXISTS (
--     SELECT 1 FROM public.suppliers
--     WHERE id = p_supplier_id AND organization_id = v_org AND deleted_at IS NULL
--   ) THEN
--     RAISE EXCEPTION 'Fornecedor inválido para esta organização' USING ERRCODE = 'check_violation';
--   END IF;
--
--   -- NOVO (guia): a guia fixa o fornecedor e o âmbito (POs da guia, ou todas
--   -- as do fornecedor se não tiver POs).
--   IF p_delivery_note_id IS NOT NULL THEN
--     SELECT organization_id, supplier_id, note_number, status
--     INTO v_note_org, v_note_supplier, v_note_number, v_note_status
--     FROM public.supplier_delivery_notes
--     WHERE id = p_delivery_note_id;
--     IF v_note_org IS NULL OR v_note_org <> v_org THEN
--       RAISE EXCEPTION 'Guia do fornecedor não encontrada nesta organização' USING ERRCODE = 'no_data_found';
--     END IF;
--     IF v_note_status <> 'open' THEN
--       RAISE EXCEPTION 'A guia % está % — reabre-a para receber', v_note_number,
--         CASE v_note_status WHEN 'closed' THEN 'fechada' ELSE 'cancelada' END
--         USING ERRCODE = 'check_violation';
--     END IF;
--     IF p_supplier_id IS NOT NULL AND p_supplier_id <> v_note_supplier THEN
--       RAISE EXCEPTION 'A guia % é de outro fornecedor', v_note_number USING ERRCODE = 'check_violation';
--     END IF;
--     p_supplier_id := v_note_supplier;
--     v_scope := public.fn_delivery_note_scope(p_delivery_note_id);
--     SELECT array_agg(DISTINCT l.purchase_order_item_id) FILTER (WHERE l.purchase_order_item_id IS NOT NULL),
--            count(*) > 0
--     INTO v_note_poi, v_note_has_lines
--     FROM public.supplier_delivery_note_lines l
--     WHERE l.delivery_note_id = p_delivery_note_id;
--     v_note_info := jsonb_build_object('delivery_note', jsonb_build_object(
--       'id', p_delivery_note_id, 'note_number', v_note_number, 'status', v_note_status,
--       'supplier_id', v_note_supplier, 'purchase_order_ids', to_jsonb(v_scope), 'has_lines', v_note_has_lines));
--   END IF;
--
--   v_lc := lower(v_code);
--
--   -- Correspondências (produto, unidade, nível) num jsonb — sem tabelas
--   -- temporárias (função STABLE).
--   SELECT COALESCE(jsonb_agg(jsonb_build_object('product_id', mm.product_id, 'uom_id', mm.uom_id,
--                                                'matched_by', mm.matched_by, 'lvl', mm.lvl)), '[]'::jsonb)
--   INTO v_matches
--   FROM (
--   -- 1 código de barras
--   SELECT p.id AS product_id, NULL::uuid AS uom_id, 'barcode'::text AS matched_by, 1 AS lvl
--   FROM public.products p
--   WHERE p.organization_id = v_org AND p.deleted_at IS NULL AND NOT p.is_deleted
--     AND lower(btrim(p.barcode)) = v_lc
--   UNION
--   -- 2a referência do fornecedor nas linhas em aberto
--   SELECT poi.product_id, poi.uom_id, 'supplier_sku', 2
--   FROM public.purchase_order_items poi
--   JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
--   JOIN public.products p ON p.id = poi.product_id
--   WHERE po.organization_id = v_org AND po.deleted_at IS NULL
--     AND po.status IN ('pending', 'ordered', 'partially_received')
--     AND poi.item_type = 'product' AND poi.quantity > poi.received_quantity
--     AND (p_supplier_id IS NULL OR po.supplier_id = p_supplier_id)
--     AND p.deleted_at IS NULL AND NOT p.is_deleted
--     AND lower(btrim(poi.supplier_sku)) = v_lc
--   UNION
--   -- 2b referência do fornecedor na ficha do produto (item_suppliers)
--   SELECT i.product_id, i.uom_id, 'supplier_sku', 2
--   FROM public.item_suppliers i
--   JOIN public.products p ON p.id = i.product_id
--   WHERE i.organization_id = v_org AND i.deleted_at IS NULL AND i.product_id IS NOT NULL
--     AND (p_supplier_id IS NULL OR i.supplier_id = p_supplier_id)
--     AND p.organization_id = v_org AND p.deleted_at IS NULL AND NOT p.is_deleted
--     AND lower(btrim(i.supplier_sku)) = v_lc
--   UNION
--   -- 3 SKU do produto
--   SELECT p.id, NULL::uuid, 'sku', 3
--   FROM public.products p
--   WHERE p.organization_id = v_org AND p.deleted_at IS NULL AND NOT p.is_deleted
--     AND lower(btrim(p.sku)) = v_lc
--   UNION
--   -- 4 SKU gravado nas linhas das POs da organização
--   SELECT poi.product_id, NULL::uuid, 'po_line_sku', 4
--   FROM public.purchase_order_items poi
--   JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
--   JOIN public.products p ON p.id = poi.product_id
--   WHERE po.organization_id = v_org AND po.deleted_at IS NULL
--     AND poi.item_type = 'product'
--     AND (p_supplier_id IS NULL OR po.supplier_id = p_supplier_id)
--     AND p.deleted_at IS NULL AND NOT p.is_deleted
--     AND lower(btrim(poi.sku)) = v_lc
--   ) mm;
--
--   SELECT min(m.lvl) INTO v_level
--   FROM jsonb_to_recordset(v_matches) AS m(product_id uuid, uom_id uuid, matched_by text, lvl integer);
--
--   IF v_level IS NULL THEN
--     RETURN jsonb_build_object(
--       'found', false, 'code', v_code, 'organization_id', v_org,
--       'warehouse_id', p_warehouse_id, 'supplier_id', p_supplier_id,
--       'can_receive', v_can_receive, 'candidates', '[]'::jsonb,
--       'warnings', jsonb_build_array(format('Código «%s» não encontrado nesta organização', v_code))
--     ) || v_note_info;  -- NOVO (guia): '{}' sem guia
--   END IF;
--
--   -- Níveis inferiores com outros produtos: só aviso.
--   SELECT count(DISTINCT m.product_id),
--          string_agg(DISTINCT format('%s (%s)', p.name, m.matched_by), ', ')
--   INTO v_other, v_other_txt
--   FROM jsonb_to_recordset(v_matches) AS m(product_id uuid, uom_id uuid, matched_by text, lvl integer)
--   JOIN public.products p ON p.id = m.product_id
--   WHERE m.lvl > v_level
--     AND m.product_id NOT IN (
--       SELECT m2.product_id
--       FROM jsonb_to_recordset(v_matches) AS m2(product_id uuid, uom_id uuid, matched_by text, lvl integer)
--       WHERE m2.lvl = v_level);
--   IF v_other > 0 THEN
--     v_warnings := v_warnings || to_jsonb(format('O código também corresponde a: %s', v_other_txt));
--   END IF;
--
--   FOR v_cand IN
--     SELECT DISTINCT ON (m.product_id, COALESCE(m.uom_id, p.uom_id))
--            m.product_id, m.matched_by,
--            -- unidade lida: a da ligação/linha; senão a do produto
--            CASE WHEN m.uom_id IS NULL OR m.uom_id IS NOT DISTINCT FROM p.uom_id THEN p.uom_id ELSE m.uom_id END AS uom_id,
--            (m.uom_id IS NOT NULL AND m.uom_id IS DISTINCT FROM p.uom_id) AS is_pack,
--            p.name, p.sku, p.barcode
--     FROM jsonb_to_recordset(v_matches) AS m(product_id uuid, uom_id uuid, matched_by text, lvl integer)
--     JOIN public.products p ON p.id = m.product_id
--     WHERE m.lvl = v_level
--     ORDER BY m.product_id, COALESCE(m.uom_id, p.uom_id), p.name
--   LOOP
--     v_factor := 1;
--     IF v_cand.is_pack THEN
--       BEGIN
--         v_factor := public.fn_uom_units_per(v_cand.uom_id, v_cand.product_id);
--       EXCEPTION WHEN OTHERS THEN
--         v_warnings := v_warnings || to_jsonb(format('«%s»: a unidade da referência do fornecedor não é compatível com a do produto (%s)', v_cand.name, SQLERRM));
--         CONTINUE;
--       END;
--     END IF;
--
--     SELECT COALESCE(jsonb_agg(jsonb_build_object(
--              'purchase_order_id',      o.purchase_order_id,
--              'order_number',           o.order_number,
--              'po_status',              o.po_status,
--              'confirmed',              o.confirmed,
--              'supplier_id',            o.supplier_id,
--              'supplier_name',          o.supplier_name,
--              'expected_delivery',      o.expected_delivery,
--              'purchase_order_item_id', o.purchase_order_item_id,
--              'description',            o.description,
--              'quantity',               o.quantity,
--              'received_quantity',      o.received_quantity,
--              'open_quantity',          o.open_quantity,
--              'uom_id',                 o.uom_id,
--              'units_per_uom',          o.units_per_uom,
--              'same_unit',              (o.units_per_uom = v_factor),
--              'contract_id',            o.contract_id,
--              'contract_order_number',  o.contract_order_number,
--              'contract_active',        o.contract_active,
--              -- Posição na ordem de enchimento (só linhas da mesma unidade).
--              'allocation_rank',        CASE WHEN o.units_per_uom = v_factor THEN o.r END
--            -- NOVO (guia): linha indicada na guia (só com guia)
--            ) || CASE WHEN p_delivery_note_id IS NOT NULL
--                      THEN jsonb_build_object('in_delivery_note', COALESCE(o.purchase_order_item_id = ANY (v_note_poi), false))
--                      ELSE '{}'::jsonb END
--            ORDER BY (o.units_per_uom = v_factor) DESC, o.prio, o.allocation_rank), '[]'::jsonb),
--            count(*) FILTER (WHERE o.units_per_uom <> v_factor)
--     INTO v_lines, v_other
--     FROM (
--       -- NOVO (guia): prio 0 = linha indicada na guia (sem guia é sempre 1);
--       -- só POs do âmbito da guia.
--       SELECT ol.*, pr.prio,
--              row_number() OVER (PARTITION BY (ol.units_per_uom = v_factor) ORDER BY pr.prio, ol.allocation_rank) AS r
--       FROM public.fn_receiving_open_lines(v_org, ARRAY[v_cand.product_id], p_supplier_id) ol
--       CROSS JOIN LATERAL (SELECT CASE WHEN ol.purchase_order_item_id = ANY (v_note_poi) THEN 0 ELSE 1 END AS prio) pr
--       WHERE v_scope IS NULL OR ol.purchase_order_id = ANY (v_scope)
--     ) o;
--
--     IF jsonb_array_length(v_lines) = 0 THEN
--       v_warnings := v_warnings || to_jsonb(format('«%s» não tem encomendas a fornecedor em aberto%s', v_cand.name,
--                       CASE WHEN p_supplier_id IS NOT NULL THEN ' deste fornecedor' ELSE '' END)
--                       -- NOVO (guia)
--                       || CASE WHEN v_scope IS NOT NULL THEN format(' nas encomendas da guia %s', v_note_number) ELSE '' END);
--     ELSIF v_other > 0 THEN
--       v_warnings := v_warnings || to_jsonb(format('«%s»: %s linha(s) em aberto noutra unidade — não entram numa leitura nesta unidade', v_cand.name, v_other));
--     END IF;
--
--     -- NOVO (guia): anunciado / recebido pela guia (unidades de stock).
--     IF p_delivery_note_id IS NOT NULL THEN
--       SELECT COALESCE(sum(l.quantity * l.units_per_uom), 0) INTO v_ann
--       FROM public.supplier_delivery_note_lines l
--       WHERE l.delivery_note_id = p_delivery_note_id AND l.product_id = v_cand.product_id;
--       SELECT COALESCE(sum(pr.quantity * pr.units_per_uom), 0) INTO v_rcv
--       FROM public.purchase_order_receipts pr
--       WHERE pr.delivery_note_id = p_delivery_note_id AND pr.product_id = v_cand.product_id
--         AND pr.kind = 'receipt' AND pr.reverted_at IS NULL;
--       IF v_note_has_lines AND v_ann = 0 THEN
--         v_warnings := v_warnings || to_jsonb(format('«%s» não consta da guia %s', v_cand.name, v_note_number));
--       END IF;
--     END IF;
--
--     v_candidates := v_candidates || (jsonb_build_object(
--       'product_id',    v_cand.product_id,
--       'name',          v_cand.name,
--       'sku',           v_cand.sku,
--       'barcode',       v_cand.barcode,
--       'matched_by',    v_cand.matched_by,
--       'uom_id',        v_cand.uom_id,
--       'uom_code',      (SELECT code FROM public.uom WHERE id = v_cand.uom_id),
--       'units_per_uom', v_factor,
--       'open_lines',    v_lines
--     ) || CASE WHEN p_delivery_note_id IS NOT NULL  -- NOVO (guia)
--               THEN jsonb_build_object('delivery_note', jsonb_build_object(
--                      'announced', v_ann > 0, 'announced_units', trim_scale(v_ann), 'received_units', trim_scale(v_rcv)))
--               ELSE '{}'::jsonb END);
--   END LOOP;
--
--   RETURN jsonb_build_object(
--     'found',           jsonb_array_length(v_candidates) > 0,
--     'code',            v_code,
--     'organization_id', v_org,
--     'warehouse_id',    p_warehouse_id,
--     'supplier_id',     p_supplier_id,
--     'can_receive',     v_can_receive,
--     'candidates',      v_candidates,
--     'warnings',        v_warnings
--   ) || v_note_info;  -- NOVO (guia): '{}' sem guia
-- END;
-- $function$;
-- ALTER FUNCTION public.rpc_receiving_lookup(uuid, text, uuid, uuid) OWNER TO postgres;
-- REVOKE ALL ON FUNCTION public.rpc_receiving_lookup(uuid, text, uuid, uuid) FROM PUBLIC, anon;
-- GRANT EXECUTE ON FUNCTION public.rpc_receiving_lookup(uuid, text, uuid, uuid) TO authenticated, service_role;
-- CREATE OR REPLACE FUNCTION public.rpc_receive_by_code(p_request_id uuid, p_warehouse_id uuid, p_product_id uuid, p_quantity numeric, p_uom_id uuid DEFAULT NULL::uuid, p_supplier_id uuid DEFAULT NULL::uuid, p_purchase_order_item_id uuid DEFAULT NULL::uuid, p_code text DEFAULT NULL::text, p_dry_run boolean DEFAULT false, p_delivery_note_id uuid DEFAULT NULL::uuid)
--  RETURNS jsonb
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public', 'pg_temp'
-- AS $function$
-- DECLARE
--   v_actor       uuid;
--   v_org         uuid;
--   v_dry         boolean := COALESCE(p_dry_run, false);
--   v_code        text := nullif(btrim(COALESCE(p_code, '')), '');
--   v_lc          text;
--   v_product     record;
--   v_factor      integer;
--   v_uom_code    text;
--   v_units       numeric;
--   v_matched_by  text;
--   v_replay      jsonb;
--   v_forced      record;
--   v_locked      uuid[];
--   v_cid         uuid;
--   v_open_total  numeric;
--   v_open_list   text;
--   v_plan        jsonb;
--   v_po          record;
--   v_r           jsonb;
--   v_allocs      jsonb := '[]'::jsonb;
--   v_warnings    jsonb := '[]'::jsonb;
--   v_to_order    numeric := 0;
--   v_to_stock    numeric := 0;
--   v_other       integer;
--   v_result      jsonb;
--   -- NOVO (guia)
--   v_note_org       uuid;
--   v_note_supplier  uuid;
--   v_note_number    text;
--   v_note_status    text;
--   v_scope          uuid[];
--   v_note_poi       uuid[];
--   v_note_has_lines boolean := false;
--   v_ann            numeric;
--   v_rcv            numeric;
--   v_checks         jsonb := '[]'::jsonb;
-- BEGIN
--   v_actor := public.current_business_user_id();
--   IF v_actor IS NULL THEN
--     RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
--   END IF;
--
--   IF p_request_id IS NULL THEN
--     RAISE EXCEPTION 'Identificador do pedido de receção em falta' USING ERRCODE = 'check_violation';
--   END IF;
--
--   SELECT organization_id INTO v_org
--   FROM public.warehouses
--   WHERE id = p_warehouse_id AND deleted_at IS NULL;
--
--   IF v_org IS NULL THEN
--     RAISE EXCEPTION 'Armazém não encontrado' USING ERRCODE = 'no_data_found';
--   END IF;
--
--   IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
--      OR NOT public.has_anew_permission(auth.uid(), 'purchase_orders.receive')
--      OR NOT public.has_anew_permission(auth.uid(), 'inventory.edit') THEN
--     RAISE EXCEPTION 'Sem permissão para receber encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
--   END IF;
--
--   -- Pedido já processado → devolve o resultado gravado.
--   v_replay := public.fn_receiving_scan_replay(p_request_id, v_org, v_actor, p_warehouse_id, p_product_id, p_quantity, p_uom_id);
--   IF v_replay IS NOT NULL THEN
--     -- NOVO (guia): o identificador gravado com outra guia (ou sem guia) é erro.
--     IF (SELECT s.delivery_note_id FROM public.receiving_scans s WHERE s.id = p_request_id) IS DISTINCT FROM p_delivery_note_id THEN
--       RAISE EXCEPTION 'O identificador do pedido de receção já foi usado noutra leitura (outra guia)'
--         USING ERRCODE = 'check_violation';
--     END IF;
--     RETURN v_replay;
--   END IF;
--
--   IF p_quantity IS NULL OR p_quantity <= 0 THEN
--     RAISE EXCEPTION 'A quantidade lida tem de ser positiva' USING ERRCODE = 'check_violation';
--   END IF;
--   IF p_quantity <> floor(p_quantity) THEN
--     RAISE EXCEPTION 'A quantidade lida tem de ser um número inteiro (%)', p_quantity USING ERRCODE = 'check_violation';
--   END IF;
--
--   SELECT id, name, sku, barcode, uom_id INTO v_product
--   FROM public.products
--   WHERE id = p_product_id AND organization_id = v_org AND deleted_at IS NULL AND NOT is_deleted;
--   IF NOT FOUND THEN
--     RAISE EXCEPTION 'Produto inválido para esta organização' USING ERRCODE = 'check_violation';
--   END IF;
--
--   IF p_supplier_id IS NOT NULL AND NOT EXISTS (
--     SELECT 1 FROM public.suppliers
--     WHERE id = p_supplier_id AND organization_id = v_org AND deleted_at IS NULL
--   ) THEN
--     RAISE EXCEPTION 'Fornecedor inválido para esta organização' USING ERRCODE = 'check_violation';
--   END IF;
--
--   -- NOVO (guia): 1.º lock da ordem global — a guia FOR SHARE (várias leituras
--   -- da mesma guia em paralelo; fechar/editar/cancelar esperam). Fixa o
--   -- fornecedor e o âmbito.
--   IF p_delivery_note_id IS NOT NULL THEN
--     SELECT organization_id, supplier_id, note_number, status
--     INTO v_note_org, v_note_supplier, v_note_number, v_note_status
--     FROM public.supplier_delivery_notes
--     WHERE id = p_delivery_note_id
--     FOR SHARE;
--     IF v_note_org IS NULL OR v_note_org <> v_org THEN
--       RAISE EXCEPTION 'Guia do fornecedor não encontrada nesta organização' USING ERRCODE = 'no_data_found';
--     END IF;
--     IF v_note_status <> 'open' THEN
--       RAISE EXCEPTION 'A guia % está % — reabre-a para receber', v_note_number,
--         CASE v_note_status WHEN 'closed' THEN 'fechada' ELSE 'cancelada' END
--         USING ERRCODE = 'check_violation';
--     END IF;
--     IF p_supplier_id IS NOT NULL AND p_supplier_id <> v_note_supplier THEN
--       RAISE EXCEPTION 'A guia % é de outro fornecedor', v_note_number USING ERRCODE = 'check_violation';
--     END IF;
--     p_supplier_id := v_note_supplier;
--     v_scope := public.fn_delivery_note_scope(p_delivery_note_id);
--     SELECT array_agg(DISTINCT l.purchase_order_item_id) FILTER (WHERE l.purchase_order_item_id IS NOT NULL),
--            count(*) > 0
--     INTO v_note_poi, v_note_has_lines
--     FROM public.supplier_delivery_note_lines l
--     WHERE l.delivery_note_id = p_delivery_note_id;
--   END IF;
--
--   -- Fator da unidade lida (erro claro se a unidade não for do produto).
--   v_factor   := public.fn_uom_units_per(p_uom_id, p_product_id);
--   v_uom_code := COALESCE((SELECT code FROM public.uom WHERE id = COALESCE(p_uom_id, v_product.uom_id)), 'un.');
--   v_units    := p_quantity * v_factor;
--   IF v_units > 2147483647 THEN
--     RAISE EXCEPTION 'A leitura excede o limite de stock (% unidades)', v_units USING ERRCODE = 'numeric_value_out_of_range';
--   END IF;
--
--   -- Como o código lido corresponde a este produto (só registo/aviso).
--   IF v_code IS NOT NULL THEN
--     v_lc := lower(v_code);
--     v_matched_by := CASE
--       WHEN lower(btrim(v_product.barcode)) = v_lc THEN 'barcode'
--       WHEN EXISTS (SELECT 1 FROM public.purchase_order_items poi
--                    JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
--                    WHERE po.organization_id = v_org AND poi.product_id = p_product_id
--                      AND lower(btrim(poi.supplier_sku)) = v_lc)
--         OR EXISTS (SELECT 1 FROM public.item_suppliers i
--                    WHERE i.organization_id = v_org AND i.product_id = p_product_id
--                      AND i.deleted_at IS NULL AND lower(btrim(i.supplier_sku)) = v_lc) THEN 'supplier_sku'
--       WHEN lower(btrim(v_product.sku)) = v_lc THEN 'sku'
--       WHEN EXISTS (SELECT 1 FROM public.purchase_order_items poi
--                    JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
--                    WHERE po.organization_id = v_org AND poi.product_id = p_product_id
--                      AND lower(btrim(poi.sku)) = v_lc) THEN 'po_line_sku'
--     END;
--     IF v_matched_by IS NULL THEN
--       v_warnings := v_warnings || to_jsonb(format('O código «%s» não corresponde a «%s»', v_code, v_product.name));
--     END IF;
--   END IF;
--
--   -- Linha forçada: validações com mensagens claras.
--   IF p_purchase_order_item_id IS NOT NULL THEN
--     SELECT poi.id, poi.product_id, poi.item_type, poi.quantity, poi.received_quantity,
--            COALESCE(poi.units_per_uom, 1) AS units_per_uom, poi.description,
--            po.status, po.supplier_id, po.order_number
--     INTO v_forced
--     FROM public.purchase_order_items poi
--     JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
--     WHERE poi.id = p_purchase_order_item_id AND po.organization_id = v_org AND po.deleted_at IS NULL;
--
--     IF NOT FOUND THEN
--       RAISE EXCEPTION 'Linha de encomenda não encontrada' USING ERRCODE = 'no_data_found';
--     END IF;
--     IF v_forced.item_type <> 'product' OR v_forced.product_id IS DISTINCT FROM p_product_id THEN
--       RAISE EXCEPTION 'A linha "%" (%) não é do produto lido', v_forced.description, v_forced.order_number
--         USING ERRCODE = 'check_violation';
--     END IF;
--     IF p_supplier_id IS NOT NULL AND v_forced.supplier_id IS DISTINCT FROM p_supplier_id THEN
--       RAISE EXCEPTION 'A linha "%" (%) é de outro fornecedor', v_forced.description, v_forced.order_number
--         USING ERRCODE = 'check_violation';
--     END IF;
--     -- NOVO (guia): a linha forçada tem de estar no âmbito da guia.
--     IF v_scope IS NOT NULL AND NOT EXISTS (
--       SELECT 1 FROM public.purchase_order_items poi
--       WHERE poi.id = p_purchase_order_item_id AND poi.purchase_order_id = ANY (v_scope)
--     ) THEN
--       RAISE EXCEPTION 'A linha "%" (%) não está nas encomendas da guia %', v_forced.description, v_forced.order_number, v_note_number
--         USING ERRCODE = 'check_violation';
--     END IF;
--     IF v_forced.units_per_uom <> v_factor THEN
--       RAISE EXCEPTION 'A linha "%" (%) está noutra unidade (% un. por unidade; a leitura tem %)', v_forced.description, v_forced.order_number, v_forced.units_per_uom, v_factor
--         USING ERRCODE = 'check_violation';
--     END IF;
--     IF v_forced.status NOT IN ('pending', 'ordered', 'partially_received') OR v_forced.quantity <= v_forced.received_quantity THEN
--       RAISE EXCEPTION 'A linha "%" (%) não está em aberto', v_forced.description, v_forced.order_number
--         USING ERRCODE = 'check_violation';
--     END IF;
--   END IF;
--
--   -- Reserva do identificador (fica com o resultado no fim). Um pedido igual
--   -- em paralelo espera aqui pelo primeiro e, quando este confirma, devolve o
--   -- resultado gravado. Em dry-run nada é gravado.
--   IF NOT v_dry THEN
--     INSERT INTO public.receiving_scans (
--       id, organization_id, warehouse_id, supplier_id, code, matched_by,
--       product_id, uom_id, quantity, units, result, created_by,
--       delivery_note_id  -- NOVO (guia)
--     ) VALUES (
--       p_request_id, v_org, p_warehouse_id, p_supplier_id, v_code, v_matched_by,
--       p_product_id, p_uom_id, p_quantity, v_units, '{}'::jsonb, v_actor,
--       p_delivery_note_id
--     )
--     ON CONFLICT (id) DO NOTHING;
--
--     IF NOT FOUND THEN
--       v_replay := public.fn_receiving_scan_replay(p_request_id, v_org, v_actor, p_warehouse_id, p_product_id, p_quantity, p_uom_id);
--       IF v_replay IS NULL THEN
--         RAISE EXCEPTION 'Pedido de receção em conflito — tenta de novo' USING ERRCODE = 'serialization_failure';
--       END IF;
--       -- NOVO (guia)
--       IF (SELECT s.delivery_note_id FROM public.receiving_scans s WHERE s.id = p_request_id) IS DISTINCT FROM p_delivery_note_id THEN
--         RAISE EXCEPTION 'O identificador do pedido de receção já foi usado noutra leitura (outra guia)'
--           USING ERRCODE = 'check_violation';
--       END IF;
--       RETURN v_replay;
--     END IF;
--   END IF;
--
--   -- 1. Serializa leituras do mesmo produto.
--   PERFORM pg_advisory_xact_lock(hashtextextended('receiving:' || v_org::text || ':' || p_product_id::text, 0));
--
--   BEGIN
--     -- 2. Tranca as POs candidatas (ordem fixa por id).
--     SELECT COALESCE(array_agg(t.id ORDER BY t.id), ARRAY[]::uuid[]) INTO v_locked
--     FROM (
--       SELECT po.id
--       FROM public.purchase_orders po
--       WHERE po.id IN (
--               SELECT o.purchase_order_id
--               FROM public.fn_receiving_open_lines(v_org, ARRAY[p_product_id], p_supplier_id) o
--               WHERE o.units_per_uom = v_factor
--                 AND (p_purchase_order_item_id IS NULL OR o.purchase_order_item_id = p_purchase_order_item_id)
--                 AND (v_scope IS NULL OR o.purchase_order_id = ANY (v_scope)))  -- NOVO (guia)
--         AND po.deleted_at IS NULL
--         AND po.status IN ('pending', 'ordered', 'partially_received')
--       ORDER BY po.id
--       FOR UPDATE
--     ) t;
--
--     -- 3. Locks das Encomendas Cliente (os da Fase 1), ordem fixa.
--     FOR v_cid IN
--       SELECT DISTINCT po.source_id
--       FROM public.purchase_orders po
--       WHERE po.id = ANY (v_locked) AND po.source_type = 'contract' AND po.source_id IS NOT NULL
--       ORDER BY po.source_id
--     LOOP
--       PERFORM pg_advisory_xact_lock(hashtextextended('po_receipt_contract:' || v_cid::text, 0));
--     END LOOP;
--
--     -- 4. Em aberto relido com tudo trancado (só POs trancadas). take = o que
--     --    cada linha recebe, enchendo pela ordem D2 (NOVO (guia): primeiro as
--     --    linhas indicadas na guia; sem guia a ordem é a mesma).
--     SELECT COALESCE(jsonb_agg(jsonb_build_object(
--              'rn', a.rn, 'purchase_order_id', a.purchase_order_id, 'order_number', a.order_number,
--              'po_status', a.po_status, 'purchase_order_item_id', a.purchase_order_item_id,
--              'open_quantity', a.open_quantity, 'take', a.take) ORDER BY a.rn), '[]'::jsonb),
--            COALESCE(SUM(a.open_quantity), 0),
--            string_agg(DISTINCT a.order_number, ', ')
--     INTO v_plan, v_open_total, v_open_list
--     FROM (
--       SELECT c.rn, c.purchase_order_id, c.order_number, c.po_status, c.purchase_order_item_id, c.open_quantity,
--              LEAST(c.open_quantity,
--                    GREATEST(0, p_quantity - COALESCE(SUM(c.open_quantity) OVER (
--                      ORDER BY c.rn ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0))) AS take
--       FROM (
--         SELECT o.*, row_number() OVER (
--                  ORDER BY CASE WHEN o.purchase_order_item_id = ANY (v_note_poi) THEN 0 ELSE 1 END,  -- NOVO (guia)
--                           o.allocation_rank) AS rn
--         FROM public.fn_receiving_open_lines(v_org, ARRAY[p_product_id], p_supplier_id) o
--         WHERE o.purchase_order_id = ANY (v_locked)
--           AND o.units_per_uom = v_factor
--           AND (p_purchase_order_item_id IS NULL OR o.purchase_order_item_id = p_purchase_order_item_id)
--       ) c
--     ) a;
--
--     -- D3: acima do em aberto → recusa tudo.
--     IF v_open_total < p_quantity THEN
--       RAISE EXCEPTION '%', format('Leste %s %s; em aberto %s %s%s', p_quantity, v_uom_code, v_open_total, v_uom_code,
--         CASE WHEN v_open_list IS NOT NULL THEN format(' (%s)', v_open_list)
--              WHEN p_purchase_order_item_id IS NOT NULL THEN ' (a linha indicada já não está em aberto)'
--              ELSE format(' — sem encomendas a fornecedor em aberto para «%s»%s', v_product.name,
--                          CASE WHEN p_supplier_id IS NOT NULL THEN ' deste fornecedor nesta unidade' ELSE ' nesta unidade' END)
--         END)
--         -- NOVO (guia): âmbito da guia na mensagem ('' sem guia)
--         || CASE WHEN p_delivery_note_id IS NOT NULL
--                 THEN format(' — âmbito da guia %s%s', v_note_number,
--                             CASE WHEN v_scope IS NOT NULL THEN format(' (%s encomenda(s) da guia)', cardinality(v_scope))
--                                  ELSE ' (encomendas do fornecedor)' END)
--                 ELSE '' END
--         USING ERRCODE = 'check_violation';
--     END IF;
--
--     -- NOVO (guia): avisos de anunciado (decisão 1: aviso + confirmação no
--     -- ecrã). Com o lock do produto detido, o recebido pela guia é estável.
--     IF p_delivery_note_id IS NOT NULL AND v_note_has_lines THEN
--       SELECT COALESCE(sum(l.quantity * l.units_per_uom), 0) INTO v_ann
--       FROM public.supplier_delivery_note_lines l
--       WHERE l.delivery_note_id = p_delivery_note_id AND l.product_id = p_product_id;
--       IF v_ann = 0 THEN
--         v_checks   := v_checks || to_jsonb('nao_consta_da_guia'::text);
--         v_warnings := v_warnings || to_jsonb(format('«%s» não consta da guia %s', v_product.name, v_note_number));
--       ELSE
--         SELECT COALESCE(sum(pr.quantity * pr.units_per_uom), 0) INTO v_rcv
--         FROM public.purchase_order_receipts pr
--         WHERE pr.delivery_note_id = p_delivery_note_id AND pr.product_id = p_product_id
--           AND pr.kind = 'receipt' AND pr.reverted_at IS NULL;
--         IF v_rcv + v_units > v_ann THEN
--           v_checks   := v_checks || to_jsonb('acima_do_anunciado'::text);
--           v_warnings := v_warnings || to_jsonb(format('«%s»: com esta leitura ficam %s un. recebidas pela guia %s; anunciadas %s un.',
--                           v_product.name, trim_scale(v_rcv + v_units), v_note_number, trim_scale(v_ann)));
--         END IF;
--       END IF;
--     END IF;
--
--     -- 5. Receção pela Fase 1, uma chamada por PO, pela ordem D2 (os locks já
--     --    estão todos detidos, a ordem das chamadas não cria esperas novas).
--     FOR v_po IN
--       SELECT l.purchase_order_id, min(l.order_number) AS order_number,
--              bool_or(l.po_status = 'pending') AS pending,
--              jsonb_agg(jsonb_build_object('purchase_order_item_id', l.purchase_order_item_id, 'quantity', l.take) ORDER BY l.rn) AS lines,
--              array_agg(l.purchase_order_item_id ORDER BY l.rn) AS ids
--       FROM jsonb_to_recordset(v_plan) AS l(rn bigint, purchase_order_id uuid, order_number text, po_status text,
--                                            purchase_order_item_id uuid, open_quantity numeric, take numeric)
--       WHERE l.take > 0
--       GROUP BY l.purchase_order_id
--       ORDER BY min(l.rn)
--     LOOP
--       v_r := public.rpc_receive_purchase_order_lines(v_po.purchase_order_id, p_warehouse_id, v_po.lines, NULL);
--
--       IF NOT v_dry THEN
--         -- Liga as linhas de histórico acabadas de gravar pela Fase 1 a esta
--         -- leitura (received_at = now() = início da transação; received_by =
--         -- current_business_user_id(), como a Fase 1 grava).
--         UPDATE public.purchase_order_receipts
--         SET receiving_scan_id = p_request_id,
--             delivery_note_id  = p_delivery_note_id  -- NOVO (guia); NULL sem guia (já era NULL)
--         WHERE purchase_order_id = v_po.purchase_order_id
--           AND purchase_order_item_id = ANY (v_po.ids)
--           AND kind = 'receipt'
--           AND receiving_scan_id IS NULL
--           AND received_at = now()
--           AND received_by = v_actor;
--       END IF;
--
--       IF v_po.pending THEN
--         v_warnings := v_warnings || to_jsonb(format('%s ainda está pendente (não confirmada ao fornecedor)', v_po.order_number));
--       END IF;
--
--       v_allocs := v_allocs || jsonb_build_object(
--         'purchase_order_id',    v_po.purchase_order_id,
--         'order_number',         v_r -> 'order_number',
--         'status',               v_r -> 'status',
--         'stock_skipped',        v_r -> 'stock_skipped',
--         'units_to_order_total', v_r -> 'units_to_order_total',
--         'units_to_stock_total', v_r -> 'units_to_stock_total',
--         'lines',                v_r -> 'lines'
--       );
--       v_to_order := v_to_order + COALESCE((v_r ->> 'units_to_order_total')::numeric, 0);
--       v_to_stock := v_to_stock + COALESCE((v_r ->> 'units_to_stock_total')::numeric, 0);
--     END LOOP;
--
--     IF v_dry THEN
--       RAISE EXCEPTION USING ERRCODE = 'OLPV2', MESSAGE = 'receive_by_code_dry_run_rollback';
--     END IF;
--   EXCEPTION WHEN SQLSTATE 'OLPV2' THEN
--     NULL;  -- dry-run: tudo o que a receção escreveu foi desfeito com a subtransação
--   END;
--
--   SELECT count(*) INTO v_other
--   FROM public.fn_receiving_open_lines(v_org, ARRAY[p_product_id], p_supplier_id) o
--   WHERE o.units_per_uom <> v_factor
--     AND (v_scope IS NULL OR o.purchase_order_id = ANY (v_scope));  -- NOVO (guia)
--   IF v_other > 0 THEN
--     v_warnings := v_warnings || to_jsonb(format('%s linha(s) em aberto de «%s» noutra unidade não entraram nesta leitura', v_other, v_product.name));
--   END IF;
--
--   v_result := jsonb_build_object(
--     'request_id',           p_request_id,
--     'replayed',             false,
--     'dry_run',              v_dry,
--     'product_id',           p_product_id,
--     'warehouse_id',         p_warehouse_id,
--     'supplier_id',          p_supplier_id,
--     'uom_id',               p_uom_id,
--     'uom_code',             v_uom_code,
--     'units_per_uom',        v_factor,
--     'quantity',             p_quantity,
--     'units',                v_units,
--     'matched_by',           v_matched_by,
--     'allocations',          v_allocs,
--     'units_to_order_total', v_to_order,
--     'units_to_stock_total', v_to_stock,
--     'warnings',             v_warnings
--   ) || CASE WHEN p_delivery_note_id IS NOT NULL  -- NOVO (guia): '{}' sem guia
--             THEN jsonb_build_object('delivery_note_id', p_delivery_note_id,
--                                     'delivery_note_number', v_note_number,
--                                     'delivery_note_checks', v_checks)
--             ELSE '{}'::jsonb END;
--
--   IF NOT v_dry THEN
--     UPDATE public.receiving_scans SET result = v_result WHERE id = p_request_id;
--   END IF;
--
--   RETURN v_result;
-- END;
-- $function$;
-- ALTER FUNCTION public.rpc_receive_by_code(uuid, uuid, uuid, numeric, uuid, uuid, uuid, text, boolean, uuid) OWNER TO postgres;
-- REVOKE ALL ON FUNCTION public.rpc_receive_by_code(uuid, uuid, uuid, numeric, uuid, uuid, uuid, text, boolean, uuid) FROM PUBLIC, anon;
-- GRANT EXECUTE ON FUNCTION public.rpc_receive_by_code(uuid, uuid, uuid, numeric, uuid, uuid, uuid, text, boolean, uuid) TO authenticated, service_role;
-- CREATE OR REPLACE FUNCTION public.rpc_delivery_note_save(p_delivery_note_id uuid, p_supplier_id uuid, p_note_number text, p_document_date date DEFAULT NULL::date, p_notes text DEFAULT NULL::text, p_purchase_order_ids uuid[] DEFAULT NULL::uuid[], p_lines jsonb DEFAULT NULL::jsonb, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
--  RETURNS jsonb
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public', 'pg_temp'
-- AS $function$
-- DECLARE
--   v_actor      uuid;
--   v_org        uuid;
--   v_number     text := btrim(COALESCE(p_note_number, ''));
--   v_notes      text := nullif(btrim(COALESCE(p_notes, '')), '');
--   v_cur        public.supplier_delivery_notes%ROWTYPE;
--   v_exists     boolean;
--   v_cur_pos    uuid[];
--   v_new_pos    uuid[];
--   v_final_pos  uuid[];
--   v_po         record;
--   v_el         jsonb;
--   v_ord        bigint;
--   v_prod       record;
--   v_poi        record;
--   v_uom        uuid;
--   v_factor     integer;
--   v_qty        numeric;
--   v_poi_id     uuid;
--   v_desc       text;
--   v_lines      jsonb := '[]'::jsonb;
--   v_cur_lines  jsonb;
--   v_dup        uuid;
--   v_removed    text;
-- BEGIN
--   v_actor := public.current_business_user_id();
--   IF v_actor IS NULL THEN
--     RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
--   END IF;
--
--   IF p_delivery_note_id IS NULL THEN
--     RAISE EXCEPTION 'Identificador da guia em falta' USING ERRCODE = 'check_violation';
--   END IF;
--
--   SELECT organization_id INTO v_org
--   FROM public.suppliers
--   WHERE id = p_supplier_id AND deleted_at IS NULL;
--   IF v_org IS NULL THEN
--     RAISE EXCEPTION 'Fornecedor não encontrado' USING ERRCODE = 'no_data_found';
--   END IF;
--
--   IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
--      OR NOT public.has_anew_permission(auth.uid(), 'purchase_orders.receive') THEN
--     RAISE EXCEPTION 'Sem permissão para registar guias desta organização' USING ERRCODE = 'insufficient_privilege';
--   END IF;
--
--   IF v_number = '' THEN
--     RAISE EXCEPTION 'Indica o número da guia' USING ERRCODE = 'check_violation';
--   END IF;
--   IF char_length(v_number) > 100 THEN
--     RAISE EXCEPTION 'Número da guia demasiado longo' USING ERRCODE = 'check_violation';
--   END IF;
--   IF char_length(v_notes) > 2000 THEN
--     RAISE EXCEPTION 'Notas da guia demasiado longas' USING ERRCODE = 'check_violation';
--   END IF;
--
--   -- Guia existente: trancada até ao fim (espera pelas leituras em curso).
--   SELECT * INTO v_cur FROM public.supplier_delivery_notes WHERE id = p_delivery_note_id FOR UPDATE;
--   v_exists := FOUND;
--
--   IF v_exists THEN
--     IF v_cur.organization_id IS DISTINCT FROM v_org THEN
--       RAISE EXCEPTION 'Esta guia pertence a outra organização' USING ERRCODE = 'insufficient_privilege';
--     END IF;
--     IF v_cur.supplier_id IS DISTINCT FROM p_supplier_id THEN
--       RAISE EXCEPTION 'A guia % é de outro fornecedor (o fornecedor de uma guia não muda)', v_cur.note_number
--         USING ERRCODE = 'check_violation';
--     END IF;
--     SELECT COALESCE(array_agg(purchase_order_id ORDER BY purchase_order_id), ARRAY[]::uuid[]) INTO v_cur_pos
--     FROM public.supplier_delivery_note_orders WHERE delivery_note_id = p_delivery_note_id;
--   ELSE
--     v_cur_pos := ARRAY[]::uuid[];
--   END IF;
--
--   -- POs pedidas: mesma organização e fornecedor; as que entram de novo não
--   -- podem estar apagadas nem canceladas.
--   IF p_purchase_order_ids IS NOT NULL THEN
--     IF cardinality(p_purchase_order_ids) > 100 THEN
--       RAISE EXCEPTION 'Demasiadas encomendas numa guia (máximo 100)' USING ERRCODE = 'check_violation';
--     END IF;
--     SELECT COALESCE(array_agg(DISTINCT x ORDER BY x), ARRAY[]::uuid[]) INTO v_new_pos
--     FROM unnest(p_purchase_order_ids) x WHERE x IS NOT NULL;
--
--     FOR v_po IN
--       SELECT x AS id, po.organization_id, po.supplier_id, po.order_number, po.status, po.deleted_at
--       FROM unnest(v_new_pos) x
--       LEFT JOIN public.purchase_orders po ON po.id = x
--     LOOP
--       IF v_po.organization_id IS DISTINCT FROM v_org THEN
--         RAISE EXCEPTION 'Encomenda a fornecedor não encontrada nesta organização' USING ERRCODE = 'no_data_found';
--       END IF;
--       IF v_po.supplier_id IS DISTINCT FROM p_supplier_id THEN
--         RAISE EXCEPTION '% é de outro fornecedor', v_po.order_number USING ERRCODE = 'check_violation';
--       END IF;
--       IF NOT (v_po.id = ANY (v_cur_pos)) AND (v_po.deleted_at IS NOT NULL OR v_po.status = 'cancelled') THEN
--         RAISE EXCEPTION '% está apagada ou cancelada', v_po.order_number USING ERRCODE = 'check_violation';
--       END IF;
--     END LOOP;
--     v_final_pos := v_new_pos;
--   ELSE
--     v_final_pos := v_cur_pos;
--   END IF;
--
--   -- Linhas anunciadas: normalizadas para comparar e gravar.
--   IF p_lines IS NOT NULL THEN
--     IF jsonb_typeof(p_lines) <> 'array' THEN
--       RAISE EXCEPTION 'As linhas da guia têm de ser uma lista' USING ERRCODE = 'check_violation';
--     END IF;
--     IF jsonb_array_length(p_lines) > 500 THEN
--       RAISE EXCEPTION 'Demasiadas linhas numa guia (máximo 500)' USING ERRCODE = 'check_violation';
--     END IF;
--
--     FOR v_el, v_ord IN SELECT e, o FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS t(e, o) LOOP
--       IF jsonb_typeof(v_el) <> 'object' THEN
--         RAISE EXCEPTION 'Linha % da guia inválida', v_ord USING ERRCODE = 'check_violation';
--       END IF;
--       BEGIN
--         v_qty    := (v_el ->> 'quantity')::numeric;
--         v_uom    := nullif(v_el ->> 'uom_id', '')::uuid;
--         v_poi_id := nullif(v_el ->> 'purchase_order_item_id', '')::uuid;
--         SELECT id, name, uom_id INTO v_prod
--         FROM public.products
--         WHERE id = nullif(v_el ->> 'product_id', '')::uuid
--           AND organization_id = v_org AND deleted_at IS NULL AND NOT is_deleted;
--       EXCEPTION WHEN invalid_text_representation OR invalid_parameter_value THEN
--         RAISE EXCEPTION 'Linha % da guia com dados inválidos', v_ord USING ERRCODE = 'check_violation';
--       END;
--       IF v_prod.id IS NULL THEN
--         RAISE EXCEPTION 'Linha % da guia: produto inválido para esta organização', v_ord USING ERRCODE = 'check_violation';
--       END IF;
--       IF v_qty IS NULL OR v_qty <= 0 OR v_qty > 1000000000 THEN
--         RAISE EXCEPTION 'Linha % da guia: a quantidade tem de ser positiva', v_ord USING ERRCODE = 'check_violation';
--       END IF;
--       v_desc := nullif(btrim(COALESCE(v_el ->> 'description', '')), '');
--       IF char_length(v_desc) > 500 THEN
--         RAISE EXCEPTION 'Linha % da guia: descrição demasiado longa', v_ord USING ERRCODE = 'check_violation';
--       END IF;
--
--       -- Unidade da linha: a do produto se não indicada ou igual.
--       IF v_uom IS NOT DISTINCT FROM v_prod.uom_id THEN
--         v_uom := NULL;
--       END IF;
--       v_factor := public.fn_uom_units_per(v_uom, v_prod.id);
--
--       IF v_poi_id IS NOT NULL THEN
--         SELECT poi.id, poi.product_id, poi.item_type, COALESCE(poi.units_per_uom, 1) AS units_per_uom,
--                poi.description, po.id AS po_id, po.supplier_id, po.order_number, po.organization_id
--         INTO v_poi
--         FROM public.purchase_order_items poi
--         JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
--         WHERE poi.id = v_poi_id AND po.deleted_at IS NULL;
--         IF NOT FOUND OR v_poi.organization_id IS DISTINCT FROM v_org THEN
--           RAISE EXCEPTION 'Linha % da guia: linha de encomenda não encontrada', v_ord USING ERRCODE = 'no_data_found';
--         END IF;
--         IF v_poi.supplier_id IS DISTINCT FROM p_supplier_id THEN
--           RAISE EXCEPTION 'Linha % da guia: a linha "%" (%) é de outro fornecedor', v_ord, v_poi.description, v_poi.order_number
--             USING ERRCODE = 'check_violation';
--         END IF;
--         IF v_poi.item_type <> 'product' OR v_poi.product_id IS DISTINCT FROM v_prod.id THEN
--           RAISE EXCEPTION 'Linha % da guia: a linha "%" (%) não é deste produto', v_ord, v_poi.description, v_poi.order_number
--             USING ERRCODE = 'check_violation';
--         END IF;
--         IF v_poi.units_per_uom <> v_factor THEN
--           RAISE EXCEPTION 'Linha % da guia: a linha "%" (%) está noutra unidade', v_ord, v_poi.description, v_poi.order_number
--             USING ERRCODE = 'check_violation';
--         END IF;
--         IF cardinality(v_final_pos) > 0 AND NOT (v_poi.po_id = ANY (v_final_pos)) THEN
--           RAISE EXCEPTION 'Linha % da guia: % não está nas encomendas da guia', v_ord, v_poi.order_number
--             USING ERRCODE = 'check_violation';
--         END IF;
--       END IF;
--
--       v_lines := v_lines || jsonb_build_object(
--         'position', v_ord::integer, 'product_id', v_prod.id, 'uom_id', v_uom, 'units_per_uom', v_factor,
--         'quantity', v_qty, 'purchase_order_item_id', v_poi_id, 'description', v_desc);
--     END LOOP;
--   END IF;
--
--   IF v_exists THEN
--     SELECT COALESCE(jsonb_agg(jsonb_build_object(
--              'position', l.position, 'product_id', l.product_id, 'uom_id', l.uom_id, 'units_per_uom', l.units_per_uom,
--              'quantity', l.quantity, 'purchase_order_item_id', l.purchase_order_item_id, 'description', l.description)
--              ORDER BY l.position, l.id), '[]'::jsonb)
--     INTO v_cur_lines
--     FROM public.supplier_delivery_note_lines l WHERE l.delivery_note_id = p_delivery_note_id;
--
--     -- Pedido igual ao gravado (repetição da criação ou edição sem mudanças).
--     IF v_cur.note_number = v_number
--        AND v_cur.document_date IS NOT DISTINCT FROM p_document_date
--        AND v_cur.notes IS NOT DISTINCT FROM v_notes
--        AND v_final_pos = v_cur_pos
--        AND (p_lines IS NULL OR v_lines = v_cur_lines) THEN
--       RETURN public.rpc_delivery_note_get(p_delivery_note_id) || jsonb_build_object('saved', false);
--     END IF;
--
--     IF p_expected_updated_at IS NULL OR p_expected_updated_at IS DISTINCT FROM v_cur.updated_at THEN
--       RAISE EXCEPTION 'A guia % foi alterada entretanto — abre-a de novo antes de editar', v_cur.note_number
--         USING ERRCODE = 'serialization_failure';
--     END IF;
--     IF v_cur.status <> 'open' THEN
--       RAISE EXCEPTION 'A guia % está %; só uma guia aberta pode ser editada', v_cur.note_number,
--         CASE v_cur.status WHEN 'closed' THEN 'fechada' ELSE 'cancelada' END
--         USING ERRCODE = 'check_violation';
--     END IF;
--
--     -- Não retirar POs que já têm receções ativas por esta guia.
--     SELECT string_agg(DISTINCT po.order_number, ', ') INTO v_removed
--     FROM public.purchase_order_receipts pr
--     JOIN public.purchase_orders po ON po.id = pr.purchase_order_id
--     WHERE pr.delivery_note_id = p_delivery_note_id
--       AND pr.kind = 'receipt' AND pr.reverted_at IS NULL
--       AND pr.purchase_order_id = ANY (v_cur_pos)
--       AND NOT (pr.purchase_order_id = ANY (v_final_pos));
--     IF v_removed IS NOT NULL THEN
--       RAISE EXCEPTION 'Não podes retirar % da guia: já tem receções por esta guia', v_removed
--         USING ERRCODE = 'check_violation';
--     END IF;
--     -- Guia que passa a ter POs: as receções ativas têm de caber nelas.
--     IF cardinality(v_final_pos) > 0 THEN
--       SELECT string_agg(DISTINCT po.order_number, ', ') INTO v_removed
--       FROM public.purchase_order_receipts pr
--       JOIN public.purchase_orders po ON po.id = pr.purchase_order_id
--       WHERE pr.delivery_note_id = p_delivery_note_id
--         AND pr.kind = 'receipt' AND pr.reverted_at IS NULL
--         AND NOT (pr.purchase_order_id = ANY (v_final_pos));
--       IF v_removed IS NOT NULL THEN
--         RAISE EXCEPTION 'A guia já tem receções em % — essas encomendas têm de ficar na guia', v_removed
--           USING ERRCODE = 'check_violation';
--       END IF;
--     END IF;
--   END IF;
--
--   -- Nº repetido no mesmo fornecedor (guias não canceladas).
--   SELECT id INTO v_dup
--   FROM public.supplier_delivery_notes
--   WHERE organization_id = v_org AND supplier_id = p_supplier_id
--     AND lower(btrim(note_number)) = lower(v_number)
--     AND status <> 'cancelled' AND id <> p_delivery_note_id
--   LIMIT 1;
--   IF v_dup IS NOT NULL THEN
--     RAISE EXCEPTION 'Já existe a guia % deste fornecedor', v_number
--       USING ERRCODE = 'unique_violation', DETAIL = v_dup::text,
--             HINT = 'Abre a guia existente (id em DETAIL).';
--   END IF;
--
--   BEGIN
--     IF v_exists THEN
--       UPDATE public.supplier_delivery_notes
--       SET note_number   = v_number,
--           document_date = p_document_date,
--           notes         = v_notes,
--           updated_at    = clock_timestamp()
--       WHERE id = p_delivery_note_id;
--     ELSE
--       INSERT INTO public.supplier_delivery_notes (
--         id, organization_id, supplier_id, note_number, document_date, notes, created_by, created_at, updated_at
--       ) VALUES (
--         p_delivery_note_id, v_org, p_supplier_id, v_number, p_document_date, v_notes, v_actor, now(), clock_timestamp()
--       )
--       ON CONFLICT (id) DO NOTHING;
--       IF NOT FOUND THEN
--         -- Mesmo id criado em paralelo: o cliente repete e cai na comparação.
--         RAISE EXCEPTION 'Guia em conflito — tenta de novo' USING ERRCODE = 'serialization_failure';
--       END IF;
--     END IF;
--   EXCEPTION WHEN unique_violation THEN
--     SELECT id INTO v_dup
--     FROM public.supplier_delivery_notes
--     WHERE organization_id = v_org AND supplier_id = p_supplier_id
--       AND lower(btrim(note_number)) = lower(v_number)
--       AND status <> 'cancelled' AND id <> p_delivery_note_id
--     LIMIT 1;
--     RAISE EXCEPTION 'Já existe a guia % deste fornecedor', v_number
--       USING ERRCODE = 'unique_violation', DETAIL = COALESCE(v_dup::text, ''),
--             HINT = 'Abre a guia existente (id em DETAIL).';
--   END;
--
--   IF v_final_pos IS DISTINCT FROM v_cur_pos THEN
--     DELETE FROM public.supplier_delivery_note_orders
--     WHERE delivery_note_id = p_delivery_note_id AND NOT (purchase_order_id = ANY (v_final_pos));
--     INSERT INTO public.supplier_delivery_note_orders (delivery_note_id, purchase_order_id, organization_id, created_by)
--     SELECT p_delivery_note_id, x, v_org, v_actor
--     FROM unnest(v_final_pos) x
--     WHERE NOT (x = ANY (v_cur_pos));
--   END IF;
--
--   IF p_lines IS NOT NULL AND (NOT v_exists OR v_lines IS DISTINCT FROM v_cur_lines) THEN
--     DELETE FROM public.supplier_delivery_note_lines WHERE delivery_note_id = p_delivery_note_id;
--     INSERT INTO public.supplier_delivery_note_lines (
--       delivery_note_id, organization_id, position, product_id, uom_id, units_per_uom, quantity,
--       purchase_order_item_id, description, created_by
--     )
--     SELECT p_delivery_note_id, v_org, l.position, l.product_id, l.uom_id, l.units_per_uom, l.quantity,
--            l.purchase_order_item_id, l.description, v_actor
--     FROM jsonb_to_recordset(v_lines) AS l(position integer, product_id uuid, uom_id uuid, units_per_uom integer,
--                                           quantity numeric, purchase_order_item_id uuid, description text);
--   END IF;
--
--   RETURN public.rpc_delivery_note_get(p_delivery_note_id) || jsonb_build_object('saved', true);
-- END;
-- $function$;
-- DROP FUNCTION public.rpc_product_code_remove(uuid, text);
-- DROP FUNCTION public.rpc_product_code_learn(uuid, uuid, text, text, uuid, uuid, uuid, boolean);
-- DROP FUNCTION public.fn_product_code_json(uuid);
-- DROP INDEX public.uq_products_barcode_key;
-- DROP TRIGGER trg_products_barcode_guard ON public.products;
-- DROP FUNCTION public.fn_products_barcode_guard();
-- DROP TABLE public.product_codes;
-- DROP FUNCTION public.fn_product_codes_guard();
-- DROP FUNCTION public.fn_product_code_key(text);
-- NOTIFY pgrst, 'reload schema';
