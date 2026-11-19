-- ============================================================
-- 20270124000000 embalagens_fator_decimal
-- ============================================================
-- Auditoria de 19/11/2026 (lote 2, materiais da obra), ponto 3: embalagens com fator decimal.
--
-- O problema: um revestimento vende-se em caixas de 1,44 m², mas a tabela uom só aceita embalagens com um número inteiro >= 2 de
-- unidades base (CHECK uom_conversion_factor_inteiro, 20261204201500) e fn_uom_units_per devolve integer (1,44 passava a 1 sem aviso
-- se o CHECK deixasse). Sem a embalagem certa, o pedido ao fornecedor não sabe arredondar a caixas inteiras.
--
-- O que muda (o mínimo seguro; ver «Fica para depois»):
--   1. uom: o CHECK passa a uom_conversion_factor_valido: fator > 0 e <= 1 000 000; inteiro >= 2, como antes, ou decimal (até 6 casas,
--      o tipo da coluna). Um gatilho novo (trg_uom_zz_fator_decimal) só deixa o fator decimal quando a unidade base se MEDE (m², ml,
--      kg…): numa base contável (un, ea, pcs, box, pkg, a lista de fn_product_requires_integer_qty) continua a pedir um inteiro.
--   2. fn_uom_fator(uom, produto) (nova, numeric): o fator exato, com as mesmas regras e as mesmas mensagens de fn_uom_units_per.
--   3. fn_uom_units_per continua integer (tem perto de 20 chamadores com variáveis integer). Numa embalagem com fator decimal passa a
--      RECUSAR com uma mensagem clara (fn_uom_fator_inteiro), em vez de arredondar. Assim: uma linha de orçamento, de venda direta ou
--      de encomenda a fornecedor numa embalagem decimal é recusada (o units_per_uom das linhas é integer); a receção por código diz
--      que essa embalagem não é compatível e não a usa; os preços do catálogo do fornecedor não a convertem.
--   4. fn_item_suppliers_validate_uom usa fn_uom_fator: a ligação ao fornecedor PODE ser na caixa de 1,44 m² (o preço é por caixa).
--   5. fn_client_order_request_missing («Pedir o que falta ao fornecedor»): o fator vem de fn_uom_fator e arredonda a caixas
--      inteiras: 21,34 m² em falta com caixa de 1,44 m² dá ceil(21,34 / 1,44) = 15 caixas. Com fator decimal a linha da encomenda a
--      fornecedor vai na unidade do produto (15 × 1,44 = 21,60 m²), sem uom_id, com «(15 × CX de 1,44)» na descrição, o preço por m²
--      (preço da caixa ÷ 1,44, a 2 casas) e o total = preço da caixa × 15. Com fator inteiro nada muda.
--   6. rpc_supplier_catalog e rpc_supplier_catalog_search: units_per_uom fica NULL (não utilizável) numa embalagem decimal, em vez de
--      arredondar para 1.
-- As trocas nas funções vivas são de texto, sobre o pg_get_functiondef (o texto antigo tem de aparecer o número de vezes esperado;
-- senão a migration pára e explica). Permissões, GRANTs, dono, SECURITY DEFINER e search_path ficam iguais.
--
-- Fica para depois (não muda aqui): units_per_uom numeric nas linhas (purchase_order_items, quote_lines, direct_sale_lines) e as
-- funções de receção, reserva e estorno que o leem em variáveis integer; o pedido ao fornecedor da proposta aceite
-- (fn_proposal_supplier_request) salta a linha com uma embalagem decimal (aviso «incompatible_supplier_uom» no registo), como hoje
-- salta as incompatíveis; fn_price_change_cost_plan recusa a ligação decimal. Não há ecrã para criar embalagens (base e fator): a
-- embalagem decimal cria-se na base (INSERT INTO uom (code, description, base_uom_id, conversion_factor, organization_id)).
--
-- Reversão (só como migration nova, e só sem embalagens decimais em uso):
--   desfazer as trocas marcadas «20270124000000» (fn_uom_units_per, fn_item_suppliers_validate_uom, fn_client_order_request_missing,
--   rpc_supplier_catalog, rpc_supplier_catalog_search; ver o fim do ficheiro); DROP TRIGGER trg_uom_zz_fator_decimal ON public.uom;
--   DROP FUNCTION public.fn_uom_fator_decimal_so_mensuravel(), public.fn_uom_fator(uuid, uuid), public.fn_uom_fator_inteiro(numeric, text);
--   ALTER TABLE public.uom DROP CONSTRAINT uom_conversion_factor_valido, ADD CONSTRAINT uom_conversion_factor_inteiro CHECK (
--     base_uom_id IS NULL OR (conversion_factor IS NOT NULL AND conversion_factor >= 2 AND conversion_factor = trunc(conversion_factor)
--     AND conversion_factor <= 1000000));
-- ============================================================
SET lock_timeout = '5s';

DO $g$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uom_conversion_factor_inteiro' AND conrelid = 'public.uom'::regclass)
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uom_conversion_factor_valido' AND conrelid = 'public.uom'::regclass) THEN
    RAISE EXCEPTION 'public.uom não tem o CHECK uom_conversion_factor_inteiro (20261204201500): rever antes de aplicar 20270124000000.';
  END IF;
  IF to_regprocedure('public.fn_product_requires_integer_qty(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Falta fn_product_requires_integer_qty (20270122600000): aplicar essa migration antes de 20270124000000.';
  END IF;
  IF position('20270122600000' IN pg_get_functiondef('public.fn_client_order_request_missing(uuid,uuid,uuid[])'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'fn_client_order_request_missing não é a de 20270122600000: rever antes de aplicar 20270124000000.';
  END IF;
END $g$;

-- ---------------------------------------------------------------- 1. o CHECK do fator e a base que se mede
ALTER TABLE public.uom DROP CONSTRAINT IF EXISTS uom_conversion_factor_inteiro;
ALTER TABLE public.uom DROP CONSTRAINT IF EXISTS uom_conversion_factor_valido;
ALTER TABLE public.uom ADD CONSTRAINT uom_conversion_factor_valido CHECK (
  base_uom_id IS NULL
  OR (conversion_factor IS NOT NULL
      AND conversion_factor > 0
      AND conversion_factor <= 1000000
      AND (conversion_factor <> trunc(conversion_factor) OR conversion_factor >= 2))
);
COMMENT ON CONSTRAINT uom_conversion_factor_valido ON public.uom IS
  '20270124000000: embalagem = fator inteiro >= 2 ou decimal (> 0). O decimal só numa base que se mede (gatilho trg_uom_zz_fator_decimal).';

CREATE OR REPLACE FUNCTION public.fn_uom_fator_decimal_so_mensuravel()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_base_code text;
BEGIN
  -- 20270124000000: o fator decimal (ex. 1,44 m² por caixa) só numa unidade base que se mede; uma base contável pede um inteiro
  IF NEW.base_uom_id IS NOT NULL AND NEW.conversion_factor IS NOT NULL AND NEW.conversion_factor <> trunc(NEW.conversion_factor) THEN
    SELECT code INTO v_base_code FROM public.uom WHERE id = NEW.base_uom_id;
    IF lower(btrim(coalesce(v_base_code, ''))) IN ('un', 'ea', 'pcs', 'box', 'pkg') THEN
      RAISE EXCEPTION 'A embalagem "%" é de "%", uma unidade que se conta: o número de unidades por embalagem tem de ser inteiro (indicado: %).',
        NEW.code, v_base_code, replace(trim_scale(NEW.conversion_factor)::text, '.', ',')
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_uom_fator_decimal_so_mensuravel() FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.fn_uom_fator_decimal_so_mensuravel() IS
  '20270124000000: gatilho de uom. Fator decimal só numa base que se mede (m², ml, kg…); numa base contável (un, ea, pcs, box, pkg) recusa.';

DROP TRIGGER IF EXISTS trg_uom_zz_fator_decimal ON public.uom;
CREATE TRIGGER trg_uom_zz_fator_decimal
  BEFORE INSERT OR UPDATE OF base_uom_id, conversion_factor ON public.uom
  FOR EACH ROW EXECUTE FUNCTION public.fn_uom_fator_decimal_so_mensuravel();

-- ---------------------------------------------------------------- 2. o fator exato
CREATE OR REPLACE FUNCTION public.fn_uom_fator_inteiro(p_fator numeric, p_code text)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- 20270124000000: fn_uom_units_per é integer; uma embalagem decimal recusa-se em vez de arredondar (1,44 → 1)
  IF p_fator IS NOT NULL AND p_fator <> trunc(p_fator) THEN
    RAISE EXCEPTION 'A embalagem "%" tem % unidades por embalagem (fator decimal): aqui só entram embalagens com um número inteiro de unidades. Use a unidade do produto.',
      p_code, replace(trim_scale(p_fator)::text, '.', ',')
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN p_fator::integer;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_uom_fator_inteiro(numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_uom_fator_inteiro(numeric, text) TO authenticated, service_role;
COMMENT ON FUNCTION public.fn_uom_fator_inteiro(numeric, text) IS
  '20270124000000: o fator como integer para fn_uom_units_per; recusa (check_violation) um fator decimal em vez de o arredondar.';

CREATE OR REPLACE FUNCTION public.fn_uom_fator(p_uom_id uuid, p_product_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uom          public.uom%ROWTYPE;
  v_product_uom  uuid;
  v_product_name text;
  v_base_code    text;
BEGIN
  -- 20270124000000: as regras de fn_uom_units_per, mas com o fator exato (1,44 m² por caixa)
  IF p_uom_id IS NULL THEN
    RETURN 1;
  END IF;
  SELECT * INTO v_uom FROM public.uom WHERE id = p_uom_id;
  -- sem embalagem decimal, é exatamente fn_uom_units_per (mesmos erros)
  IF NOT FOUND OR v_uom.base_uom_id IS NULL OR v_uom.conversion_factor IS NULL
     OR v_uom.conversion_factor = trunc(v_uom.conversion_factor) THEN
    RETURN public.fn_uom_units_per(p_uom_id, p_product_id)::numeric;
  END IF;

  IF v_uom.organization_id IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND NOT public.is_system_admin_user(auth.uid())
     AND v_uom.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'A unidade "%" não pertence a uma organização visível', v_uom.code
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_product_id IS NULL THEN
    RETURN v_uom.conversion_factor;
  END IF;

  SELECT uom_id, name INTO v_product_uom, v_product_name
  FROM public.products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto % não encontrado', p_product_id USING ERRCODE = 'foreign_key_violation';
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
  RETURN v_uom.conversion_factor;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_uom_fator(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_uom_fator(uuid, uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.fn_uom_fator(uuid, uuid) IS
  '20270124000000: unidades base (products.uom_id) por 1 unidade da uom indicada, exato (pode ser decimal: 1,44 m² por caixa). Mesmas regras e erros de fn_uom_units_per.';

-- ---------------------------------------------------------------- trocas de texto guardadas
-- p_n: quantas vezes o texto antigo tem de aparecer na definição viva
CREATE OR REPLACE FUNCTION pg_temp.trocar(p_def text, p_antes text, p_depois text, p_onde text, p_n integer DEFAULT 1) RETURNS text
LANGUAGE plpgsql AS $f$
BEGIN
  IF (length(p_def) - length(replace(p_def, p_antes, ''))) / greatest(length(p_antes), 1) <> p_n THEN
    RAISE EXCEPTION 'Troca %: o texto antigo não aparece % vez(es) na definição viva; a função mudou. Rever antes de aplicar 20270124000000.', p_onde, p_n;
  END IF;
  RETURN replace(p_def, p_antes, p_depois);
END $f$;

-- ---------------------------------------------------------------- 3. fn_uom_units_per recusa o fator decimal
DO $m$
DECLARE
  d text := replace(pg_get_functiondef('public.fn_uom_units_per(uuid,uuid)'::regprocedure), chr(13) || chr(10), chr(10));
BEGIN
  IF position('20270124000000' IN d) > 0 THEN
    RAISE NOTICE 'fn_uom_units_per já tem a troca 20270124000000: nada a fazer.';
    RETURN;
  END IF;
  d := pg_temp.trocar(d, 'v_uom.conversion_factor::integer',
       'public.fn_uom_fator_inteiro(v_uom.conversion_factor, v_uom.code) /* 20270124000000 */', 'fn_uom_units_per', 2);
  EXECUTE d;
END $m$;

-- ---------------------------------------------------------------- 4. a ligação ao fornecedor aceita a embalagem decimal
DO $m$
DECLARE
  d text := replace(pg_get_functiondef('public.fn_item_suppliers_validate_uom()'::regprocedure), chr(13) || chr(10), chr(10));
BEGIN
  IF position('20270124000000' IN d) > 0 THEN
    RAISE NOTICE 'fn_item_suppliers_validate_uom já tem a troca 20270124000000: nada a fazer.';
    RETURN;
  END IF;
  d := pg_temp.trocar(d, 'PERFORM public.fn_uom_units_per(NEW.uom_id, NEW.product_id);',
       'PERFORM public.fn_uom_fator(NEW.uom_id, NEW.product_id);  -- 20270124000000: aceita a embalagem decimal (1,44 m² por caixa)',
       'fn_item_suppliers_validate_uom');
  EXECUTE d;
END $m$;

-- ---------------------------------------------------------------- 5. «Pedir o que falta ao fornecedor» arredonda a caixas inteiras
DO $m$
DECLARE
  d text := replace(pg_get_functiondef('public.fn_client_order_request_missing(uuid,uuid,uuid[])'::regprocedure), chr(13) || chr(10), chr(10));
  v_ins_antes text :=
       E'        v_line.product_name, v_line.product_sku,\n'
    || E'        v_qty_int, v_unit_price, v_unit_price * v_qty_int,\n'
    || E'        v_link_uom, nullif(v_link_sku, \'\'),\n';
BEGIN
  IF position('20270124000000' IN d) > 0 THEN
    RAISE NOTICE 'fn_client_order_request_missing já tem as trocas 20270124000000: nada a fazer.';
    RETURN;
  END IF;
  d := pg_temp.trocar(d, E'  v_link_units          integer;\n',
       E'  v_link_units          numeric;  -- 20270124000000: o fator exato (1,44 m² por caixa)\n', 'fn_client_order_request_missing (declaração)');
  d := pg_temp.trocar(d, 'v_link_units := public.fn_uom_units_per(v_link_uom, v_line.product_id);',
       'v_link_units := public.fn_uom_fator(v_link_uom, v_line.product_id);  -- 20270124000000', 'fn_client_order_request_missing (fator)');
  d := pg_temp.trocar(d, 'IF v_link_units IS NULL OR v_link_units < 1 THEN',
       'IF v_link_units IS NULL OR v_link_units <= 0 THEN  -- 20270124000000: o fator pode ser decimal', 'fn_client_order_request_missing (fator válido)');
  d := pg_temp.trocar(d, v_ins_antes,
       E'        -- 20270124000000 início: embalagem com fator decimal (ex. caixa de 1,44 m²): v_qty_int já são caixas inteiras\n'
    || E'        --   (ceil(21,34 / 1,44) = 15). A linha vai na unidade do produto (15 × 1,44 = 21,60 m²), sem a embalagem (units_per_uom\n'
    || E'        --   é integer), com o preço por m² e o total das 15 caixas. Com fator inteiro fica tudo como antes.\n'
    || E'        v_line.product_name || CASE WHEN v_link_units <> trunc(v_link_units)\n'
    || E'          THEN format(\' (%s × %s de %s)\', v_qty_int, coalesce((SELECT u.code FROM public.uom u WHERE u.id = v_link_uom), \'embalagem\'),\n'
    || E'                      replace(trim_scale(v_link_units)::text, \'.\', \',\')) ELSE \'\' END,\n'
    || E'        v_line.product_sku,\n'
    || E'        CASE WHEN v_link_units <> trunc(v_link_units) THEN ceil(v_qty_int * v_link_units * 100) / 100 ELSE v_qty_int END,\n'
    || E'        CASE WHEN v_link_units <> trunc(v_link_units) THEN round(v_unit_price / v_link_units, 2) ELSE v_unit_price END,\n'
    || E'        v_unit_price * v_qty_int,\n'
    || E'        CASE WHEN v_link_units <> trunc(v_link_units) THEN NULL ELSE v_link_uom END, nullif(v_link_sku, \'\'),\n'
    || E'        -- 20270124000000 fim\n',
       'fn_client_order_request_missing (linha da encomenda a fornecedor)');
  EXECUTE d;
END $m$;

-- ---------------------------------------------------------------- 6. o catálogo do fornecedor não arredonda a embalagem decimal
DO $m$
DECLARE
  r record; d text;
BEGIN
  -- 19/11 (aplicação): só rpc_supplier_catalog; rpc_supplier_catalog_search lê-a (FROM public.rpc_supplier_catalog(...)) e não tem o texto
  FOR r IN SELECT x FROM unnest(ARRAY['public.rpc_supplier_catalog(uuid)']) AS t(x) LOOP
    IF to_regprocedure(r.x) IS NULL THEN
      RAISE NOTICE '% não existe nesta base: nada a fazer.', r.x;
      CONTINUE;
    END IF;
    d := replace(pg_get_functiondef(r.x::regprocedure), chr(13) || chr(10), chr(10));
    IF position('20270124000000' IN d) > 0 THEN
      RAISE NOTICE '% já tem a troca 20270124000000: nada a fazer.', r.x;
      CONTINUE;
    END IF;
    d := pg_temp.trocar(d, 'WHEN u.base_uom_id = p.uom_id THEN u.conversion_factor::integer',
         'WHEN u.base_uom_id = p.uom_id AND u.conversion_factor = trunc(u.conversion_factor) /* 20270124000000 */ THEN u.conversion_factor::integer',
         r.x);
    EXECUTE d;
  END LOOP;
END $m$;

-- ---------------------------------------------------------------- conferir
DO $c$
DECLARE r record;
BEGIN
  FOR r IN SELECT x FROM unnest(ARRAY['public.fn_uom_units_per(uuid,uuid)', 'public.fn_item_suppliers_validate_uom()',
                                      'public.fn_client_order_request_missing(uuid,uuid,uuid[])']) AS t(x) LOOP
    IF position('20270124000000' IN pg_get_functiondef(r.x::regprocedure)) = 0 THEN
      RAISE EXCEPTION 'CONFERIR: % ficou sem a troca 20270124000000', r.x;
    END IF;
  END LOOP;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.fn_uom_units_per(uuid,uuid)'::regprocedure)
     OR NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.fn_client_order_request_missing(uuid,uuid,uuid[])'::regprocedure) THEN
    RAISE EXCEPTION 'CONFERIR: fn_uom_units_per ou fn_client_order_request_missing deixou de ser SECURITY DEFINER';
  END IF;
  IF has_function_privilege('anon', 'public.fn_uom_fator(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'CONFERIR: fn_uom_fator ficou aberta a anon';
  END IF;
  -- os números do caso real: 21,34 m² com caixa de 1,44 m² → 15 caixas = 21,60 m²
  IF ceil(21.34 / 1.44) <> 15 OR ceil(15 * 1.44 * 100) / 100 <> 21.60 THEN
    RAISE EXCEPTION 'CONFERIR: o arredondamento a caixas inteiras não dá 15 caixas';
  END IF;
END $c$;

-- Reversão das trocas (só se for preciso; correr numa migration nova, depois de tirar as embalagens decimais de uso):
-- DO $r$
-- DECLARE d text;
-- BEGIN
--   d := replace(pg_get_functiondef('public.fn_uom_units_per(uuid,uuid)'::regprocedure), chr(13) || chr(10), chr(10));
--   EXECUTE replace(d, 'public.fn_uom_fator_inteiro(v_uom.conversion_factor, v_uom.code) /* 20270124000000 */', 'v_uom.conversion_factor::integer');
--   d := replace(pg_get_functiondef('public.fn_item_suppliers_validate_uom()'::regprocedure), chr(13) || chr(10), chr(10));
--   EXECUTE replace(d, 'PERFORM public.fn_uom_fator(NEW.uom_id, NEW.product_id);  -- 20270124000000: aceita a embalagem decimal (1,44 m² por caixa)',
--                   'PERFORM public.fn_uom_units_per(NEW.uom_id, NEW.product_id);');
--   -- fn_client_order_request_missing: repor as 4 trocas (declaração integer, fn_uom_units_per, «< 1» e o bloco
--   --   «20270124000000 início … fim» pelas 3 linhas antigas do VALUES); rpc_supplier_catalog(_search): tirar
--   --   « AND u.conversion_factor = trunc(u.conversion_factor) /* 20270124000000 */».
-- END $r$;
