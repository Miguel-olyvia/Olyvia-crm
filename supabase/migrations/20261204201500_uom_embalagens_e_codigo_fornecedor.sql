-- ============================================================================
-- Embalagens (packs) via tabela `uom` + código de fornecedor
--
-- Cria:   public.fn_uom_units_per(uuid, uuid)            (helper do fator)
-- Cria:   public.fn_uom_validate()          + gatilho trg_uom_validate
-- Cria:   public.fn_products_validate_uom() + gatilho trg_products_validate_uom
-- Cria:   public.fn_suppliers_normalize_code() + gatilho trg_suppliers_normalize_code
-- Altera: uom — CHECK uom_conversion_factor_inteiro; a unicidade do código
--         passa de global (uom_code_key) a POR ÂMBITO (global / organização)
-- Altera: suppliers — coluna `code` + índice único por organização
--
-- NÃO altera: nenhuma linha de `uom` (BOX/PKG ficam como estão), nenhuma
--             política RLS, nenhum dado existente.
--
-- ---------------------------------------------------------------------------
-- O MODELO
-- ---------------------------------------------------------------------------
-- Um produto é comprado/vendido em embalagens (ex.: compra PK100, vende à
-- unidade; compra à unidade, vende PK6). O stock fica SEMPRE na unidade do
-- produto (products.uom_id), inteiro (stocks.quantity integer).
--
-- Uma unidade "com quantidade" é uma linha de `uom` com base_uom_id (a unidade
-- base, ex. `un`) e conversion_factor inteiro >= 2 (ex. PK100 = 100 × un).
-- Um só nível: a base não pode ter ela própria base.
--
-- Fator de uma linha (fn_uom_units_per):
--   • 1                  se a uom da linha é NULL ou igual à do produto;
--   • conversion_factor  se uom.base_uom_id = products.uom_id;
--   • 1                  se o produto não tem unidade e a uom da linha é
--                        simples (sem base) — é o que acontece hoje, texto
--                        livre sem conversão;
--   • ERRO               em qualquer outro caso (unidade incompatível, ou
--                        embalagem num produto sem unidade base definida).
--
-- ---------------------------------------------------------------------------
-- PORQUÊ MUDAR A UNICIDADE DO CÓDIGO DA UOM
-- ---------------------------------------------------------------------------
-- `uom` já é híbrida (organization_id NULL = global; senão, da empresa — ver
-- UnitsOfMeasure.tsx e as políticas uom_*), mas o código era único a nível
-- GLOBAL (uom_code_key UNIQUE(code)). Com embalagens por empresa isso quebra
-- logo: a primeira empresa a criar "PK100" impedia todas as outras. Passa a
-- ser único por âmbito, sem distinguir maiúsculas; e uma empresa não pode
-- criar um código igual a uma unidade global (ambíguo nos seletores).
-- Dados vivos verificados (23/09/2026): 12 linhas, todas globais, códigos
-- distintos em lower() — o índice novo cria-se sem conflitos.
--
-- ---------------------------------------------------------------------------
-- PORQUÊ CONGELAR UMA UOM EM USO
-- ---------------------------------------------------------------------------
-- As linhas guardam o fator como snapshot (units_per_uom, migration seguinte),
-- mas várias RPCs reescrevem as linhas por DELETE+INSERT (rpc_save_quote,
-- rpc_update_purchase_order) e o fator é recalculado no servidor. Para que o
-- recálculo dê sempre o mesmo, base_uom_id/conversion_factor de uma uom já
-- usada (linhas, item_suppliers, produtos) não podem mudar: cria-se outra uom.
--
-- ---------------------------------------------------------------------------
-- suppliers.code
-- ---------------------------------------------------------------------------
-- Os fornecedores são por organização (suppliers.organization_id; a partilha
-- entre empresas do grupo é feita pelo RLS via get_user_visible_org_ids — não
-- há root_organization_id em suppliers). A unicidade segue isso:
-- (organization_id, lower(code)), ignorando NULL/vazio e registos na lixeira.
-- O código é normalizado (trim; vazio => NULL) por gatilho.
-- ============================================================================

-- ─── 1. uom: CHECK do fator (linhas atuais têm todas base NULL) ─────────────
ALTER TABLE public.uom
  ADD CONSTRAINT uom_conversion_factor_inteiro CHECK (
    base_uom_id IS NULL
    OR (conversion_factor IS NOT NULL
        AND conversion_factor >= 2
        AND conversion_factor = trunc(conversion_factor)
        AND conversion_factor <= 1000000)
  );

-- ─── 2. uom: unicidade do código por âmbito ────────────────────────────────
ALTER TABLE public.uom DROP CONSTRAINT uom_code_key;

CREATE UNIQUE INDEX uom_code_scope_uniq
  ON public.uom (COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(code)));

CREATE INDEX IF NOT EXISTS idx_uom_organization_id
  ON public.uom (organization_id) WHERE organization_id IS NOT NULL;

-- ─── 3. Helper do fator ────────────────────────────────────────────────────
-- SECURITY DEFINER: é chamado por gatilhos de linhas escritas por utilizadores
-- que podem não ver o produto via RLS (ex. portal). Só devolve um inteiro.
-- Quando há sessão (auth.uid()), uma uom de EMPRESA tem de estar no âmbito
-- visível do utilizador — mesma regra da política uom_select.
CREATE OR REPLACE FUNCTION public.fn_uom_units_per(p_uom_id uuid, p_product_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uom          public.uom%ROWTYPE;
  v_product_uom  uuid;
  v_product_name text;
  v_base_code    text;
BEGIN
  IF p_uom_id IS NULL THEN
    RETURN 1;
  END IF;

  SELECT * INTO v_uom FROM public.uom WHERE id = p_uom_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unidade de medida % não encontrada', p_uom_id USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_uom.organization_id IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND NOT public.is_system_admin_user(auth.uid())
     AND v_uom.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'A unidade "%" não pertence a uma organização visível', v_uom.code
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Linha sem produto (serviço): não há stock; o fator só descreve a embalagem.
  IF p_product_id IS NULL THEN
    RETURN CASE WHEN v_uom.base_uom_id IS NULL THEN 1 ELSE v_uom.conversion_factor::integer END;
  END IF;

  SELECT uom_id, name INTO v_product_uom, v_product_name
  FROM public.products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto % não encontrado', p_product_id USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF p_uom_id = v_product_uom THEN
    RETURN 1;
  END IF;

  IF v_uom.base_uom_id IS NULL THEN
    IF v_product_uom IS NULL THEN
      RETURN 1;  -- produto sem unidade + unidade simples: como hoje (sem conversão)
    END IF;
    RAISE EXCEPTION 'Unidade incompatível: "%" não é a unidade do produto "%" nem uma embalagem dela', v_uom.code, v_product_name
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_product_uom IS NULL THEN
    RAISE EXCEPTION 'O produto "%" não tem unidade base definida — defina a unidade do produto antes de usar a embalagem "%"', v_product_name, v_uom.code
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_uom.base_uom_id <> v_product_uom THEN
    SELECT code INTO v_base_code FROM public.uom WHERE id = v_uom.base_uom_id;
    RAISE EXCEPTION 'Unidade incompatível: a embalagem "%" é de "%", mas o stock do produto "%" é noutra unidade', v_uom.code, v_base_code, v_product_name
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN v_uom.conversion_factor::integer;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_uom_units_per(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_uom_units_per(uuid, uuid) TO authenticated, service_role;

-- ─── 4. Validação cruzada da uom ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_uom_validate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_base public.uom%ROWTYPE;
BEGIN
  NEW.code := btrim(NEW.code);
  IF NEW.code = '' THEN
    RAISE EXCEPTION 'O código da unidade é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  -- Código de empresa não pode repetir um código global.
  IF NEW.organization_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.uom g
    WHERE g.organization_id IS NULL AND lower(btrim(g.code)) = lower(NEW.code) AND g.id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'Já existe uma unidade global com o código "%"', NEW.code USING ERRCODE = 'unique_violation';
  END IF;

  IF NEW.base_uom_id IS NOT NULL THEN
    IF NEW.base_uom_id = NEW.id THEN
      RAISE EXCEPTION 'Uma unidade não pode ser base de si própria' USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO v_base FROM public.uom WHERE id = NEW.base_uom_id;
    IF v_base.base_uom_id IS NOT NULL THEN
      RAISE EXCEPTION 'A unidade base "%" já é ela própria uma embalagem — só é permitido um nível', v_base.code
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_base.organization_id IS NOT NULL AND v_base.organization_id IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'A unidade base "%" pertence a outra organização', v_base.code USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM public.uom c WHERE c.base_uom_id = NEW.id AND c.id <> NEW.id) THEN
      RAISE EXCEPTION 'A unidade "%" é base de outras embalagens — não pode passar a ser embalagem', NEW.code
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND (NEW.base_uom_id IS DISTINCT FROM OLD.base_uom_id
          OR NEW.conversion_factor IS DISTINCT FROM OLD.conversion_factor)
     AND (   EXISTS (SELECT 1 FROM public.item_suppliers WHERE uom_id = OLD.id)
          OR EXISTS (SELECT 1 FROM public.products WHERE uom_id = OLD.id)
          OR public.fn_uom_is_used_in_lines(OLD.id)) THEN
    RAISE EXCEPTION 'A unidade "%" já está em uso — a base e o fator não podem mudar. Crie uma nova unidade.', OLD.code
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

-- Placeholder: as colunas uom_id das linhas só existem após 20261204202500,
-- que redefine esta função. Aqui devolve false (ainda não há linhas com uom).
CREATE OR REPLACE FUNCTION public.fn_uom_is_used_in_lines(p_uom_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT false
$function$;

REVOKE ALL ON FUNCTION public.fn_uom_is_used_in_lines(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_uom_validate() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_uom_validate
  BEFORE INSERT OR UPDATE ON public.uom
  FOR EACH ROW EXECUTE FUNCTION public.fn_uom_validate();

-- ─── 5. products.uom_id tem de ser uma unidade base ────────────────────────
-- O stock é contado na unidade do produto; se ela fosse uma embalagem, o
-- stock passava a contar packs. Também impede mudar a unidade do produto
-- quando há ligações a fornecedores em embalagens de outra base.
CREATE OR REPLACE FUNCTION public.fn_products_validate_uom()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_code text;
BEGIN
  IF NEW.uom_id IS NOT NULL THEN
    SELECT code INTO v_code FROM public.uom WHERE id = NEW.uom_id AND base_uom_id IS NOT NULL;
    IF FOUND THEN
      RAISE EXCEPTION 'A unidade do produto tem de ser uma unidade base — "%" é uma embalagem. Use a embalagem nas ligações a fornecedores ou nas linhas.', v_code
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.uom_id IS DISTINCT FROM OLD.uom_id AND EXISTS (
    SELECT 1
    FROM public.item_suppliers i
    JOIN public.uom u ON u.id = i.uom_id
    WHERE i.product_id = NEW.id
      AND i.deleted_at IS NULL
      AND u.base_uom_id IS NOT NULL
      AND u.base_uom_id IS DISTINCT FROM NEW.uom_id
  ) THEN
    RAISE EXCEPTION 'Não é possível mudar a unidade do produto: há ligações a fornecedores em embalagens da unidade anterior'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_products_validate_uom() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_products_validate_uom
  BEFORE INSERT OR UPDATE OF uom_id ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.fn_products_validate_uom();

-- ─── 6. suppliers.code ─────────────────────────────────────────────────────
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS code text;

CREATE OR REPLACE FUNCTION public.fn_suppliers_normalize_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.code := nullif(btrim(NEW.code), '');
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_suppliers_normalize_code() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_suppliers_normalize_code
  BEFORE INSERT OR UPDATE OF code ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.fn_suppliers_normalize_code();

CREATE UNIQUE INDEX suppliers_org_code_active_uniq
  ON public.suppliers (COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(code))
  WHERE code IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN public.suppliers.code IS
  'Código interno do fornecedor. Único por organização (sem distinguir maiúsculas), ignorando vazios e a lixeira.';
COMMENT ON FUNCTION public.fn_uom_units_per(uuid, uuid) IS
  'Unidades base (products.uom_id) por 1 unidade da uom indicada. 1 = sem conversão. Erro se incompatível.';

-- ============================================================================
-- REVERSÃO (manual, por esta ordem; só depois de reverter 20261204202500+)
-- ============================================================================
-- DROP INDEX IF EXISTS public.suppliers_org_code_active_uniq;
-- DROP TRIGGER IF EXISTS trg_suppliers_normalize_code ON public.suppliers;
-- DROP FUNCTION IF EXISTS public.fn_suppliers_normalize_code();
-- ALTER TABLE public.suppliers DROP COLUMN IF EXISTS code;
-- DROP TRIGGER IF EXISTS trg_products_validate_uom ON public.products;
-- DROP FUNCTION IF EXISTS public.fn_products_validate_uom();
-- DROP TRIGGER IF EXISTS trg_uom_validate ON public.uom;
-- DROP FUNCTION IF EXISTS public.fn_uom_validate();
-- DROP FUNCTION IF EXISTS public.fn_uom_is_used_in_lines(uuid);
-- DROP FUNCTION IF EXISTS public.fn_uom_units_per(uuid, uuid);
-- DROP INDEX IF EXISTS public.idx_uom_organization_id;
-- DROP INDEX IF EXISTS public.uom_code_scope_uniq;
-- -- só volta a ser possível se não houver códigos repetidos entre empresas:
-- ALTER TABLE public.uom ADD CONSTRAINT uom_code_key UNIQUE (code);
-- ALTER TABLE public.uom DROP CONSTRAINT IF EXISTS uom_conversion_factor_inteiro;
