-- ============================================================
-- 20270124020000 rececao_quantidades_decimais
-- ============================================================
-- Auditoria de 19/11/2026 (lote 2, materiais da obra), ponto 2: a Receção recusa decimais.
--
-- O problema: rpc_receive_by_code (20270122400000) recusa qualquer quantidade com casas decimais («A quantidade lida tem de ser um
-- número inteiro»). Desde 20270122600000 o stock e a receção pelas linhas (rpc_receive_purchase_order_lines) aceitam decimais nas
-- unidades que se medem, e o pedido ao fornecedor pede 21,60 m² (20270124000000): a Receção por código não os deixava entrar.
--
-- O que muda (trocas de texto guardadas sobre o pg_get_functiondef VIVO):
--   1. rpc_receive_by_code: a quantidade lida pode ter decimais quando o produto se mede (fn_product_requires_integer_qty = false,
--      a regra de 20270122600000) e a leitura é na unidade do produto. Continua a pedir um inteiro numa unidade contável (un, ea, pcs,
--      box, pkg) e numa embalagem (uma caixa é uma caixa inteira). A mensagem começa como antes («A quantidade lida tem de ser um
--      número inteiro»).
--   2. rpc_receive_by_code, com a conversão de unidades: a linha na unidade do produto (units_per_uom = 1) recebe o resto todo,
--      decimais incluídos; as linhas em embalagem continuam a receber só embalagens inteiras.
--   3. rpc_receiving_lookup: cada candidato traz integer_qty (true = o campo do cesto só aceita inteiros), com a mesma regra.
-- O resto da receção (o plano por linhas, a guia, rpc_receive_purchase_order_lines) já trabalha em numeric.
-- Permissões, GRANTs, dono, SECURITY DEFINER e search_path ficam iguais.
--
-- Reversão (só como migration nova): desfazer as três trocas marcadas «20270124020000» (ver o fim deste ficheiro).
-- ============================================================
SET lock_timeout = '5s';

DO $g$ BEGIN
  IF to_regprocedure('public.fn_product_requires_integer_qty(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Falta fn_product_requires_integer_qty (20270122600000): aplicar essa migration antes de 20270124020000.';
  END IF;
END $g$;

CREATE OR REPLACE FUNCTION pg_temp.trocar(p_def text, p_antes text, p_depois text, p_onde text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  IF (length(p_def) - length(replace(p_def, p_antes, ''))) / greatest(length(p_antes), 1) <> 1 THEN
    RAISE EXCEPTION 'Troca %: o texto antigo não aparece exatamente uma vez na definição viva; a função mudou. Rever antes de aplicar 20270124020000.', p_onde;
  END IF;
  RETURN replace(p_def, p_antes, p_depois);
END $f$;

-- ---------------------------------------------------------------- 1 e 2. rpc_receive_by_code
DO $m$
DECLARE
  f text := 'public.rpc_receive_by_code(uuid,uuid,uuid,numeric,uuid,uuid,uuid,text,boolean,uuid,boolean)';
  d text := replace(pg_get_functiondef(f::regprocedure), chr(13) || chr(10), chr(10));
BEGIN
  IF position('20270124020000' IN d) > 0 THEN
    RAISE NOTICE 'rpc_receive_by_code já tem as trocas 20270124020000: nada a fazer.';
    RETURN;
  END IF;
  d := pg_temp.trocar(d,
       E'  IF p_quantity <> floor(p_quantity) THEN\n'
    || E'    RAISE EXCEPTION \'A quantidade lida tem de ser um número inteiro (%)\', p_quantity USING ERRCODE = \'check_violation\';\n'
    || E'  END IF;\n',
       E'  -- 20270124020000: decimais só num produto que se mede (m², ml, kg…) lido na sua unidade; contável ou embalagem pede um inteiro\n'
    || E'  IF p_quantity <> floor(p_quantity)\n'
    || E'     AND (public.fn_product_requires_integer_qty(p_product_id)\n'
    || E'          OR (p_uom_id IS NOT NULL AND p_uom_id IS DISTINCT FROM (SELECT pr.uom_id FROM public.products pr WHERE pr.id = p_product_id))) THEN\n'
    || E'    RAISE EXCEPTION \'A quantidade lida tem de ser um número inteiro (%): a unidade deste produto conta-se, ou a leitura é numa embalagem\',\n'
    || E'      replace(trim_scale(p_quantity)::text, \'.\', \',\') USING ERRCODE = \'check_violation\';\n'
    || E'  END IF;\n', 'rpc_receive_by_code (inteiro)');
  d := pg_temp.trocar(d,
       'v_take := LEAST(v_line.open_quantity, floor(v_rest / v_line.units_per_uom));',
       'v_take := LEAST(v_line.open_quantity, CASE WHEN v_line.units_per_uom = 1 THEN v_rest ELSE floor(v_rest / v_line.units_per_uom) END);  -- 20270124020000: na unidade do produto entram os decimais',
       'rpc_receive_by_code (conversão)');
  EXECUTE d;
END $m$;

-- ---------------------------------------------------------------- 3. rpc_receiving_lookup: integer_qty por candidato
DO $m$
DECLARE
  f text := 'public.rpc_receiving_lookup(uuid,text,uuid,uuid,boolean)';
  d text := replace(pg_get_functiondef(f::regprocedure), chr(13) || chr(10), chr(10));
BEGIN
  IF position('20270124020000' IN d) > 0 THEN
    RAISE NOTICE 'rpc_receiving_lookup já tem a troca 20270124020000: nada a fazer.';
    RETURN;
  END IF;
  d := pg_temp.trocar(d,
       E'      \'units_per_uom\', v_factor,\n',
       E'      \'units_per_uom\', v_factor,\n'
    || E'      -- 20270124020000: o campo do cesto só aceita inteiros numa embalagem ou numa unidade que se conta\n'
    || E'      \'integer_qty\',   (v_factor <> 1 OR public.fn_product_requires_integer_qty(v_cand.product_id)),\n',
       'rpc_receiving_lookup (candidato)');
  EXECUTE d;
END $m$;

-- ---------------------------------------------------------------- conferir
DO $c$
DECLARE r record;
BEGIN
  FOR r IN SELECT x FROM unnest(ARRAY['public.rpc_receive_by_code(uuid,uuid,uuid,numeric,uuid,uuid,uuid,text,boolean,uuid,boolean)',
                                      'public.rpc_receiving_lookup(uuid,text,uuid,uuid,boolean)']) AS t(x) LOOP
    IF position('20270124020000' IN pg_get_functiondef(r.x::regprocedure)) = 0 THEN
      RAISE EXCEPTION 'CONFERIR: % ficou sem as trocas 20270124020000', r.x;
    END IF;
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = r.x::regprocedure) THEN
      RAISE EXCEPTION 'CONFERIR: % deixou de ser SECURITY DEFINER', r.x;
    END IF;
  END LOOP;
END $c$;

-- Reversão das trocas (só se for preciso; correr numa migration nova):
--   rpc_receive_by_code: repor «IF p_quantity <> floor(p_quantity) THEN RAISE EXCEPTION 'A quantidade lida tem de ser um número
--   inteiro (%)', p_quantity …» no lugar do bloco «-- 20270124020000: decimais só num produto que se mede …» e
--   «floor(v_rest / v_line.units_per_uom)» no lugar do CASE marcado; rpc_receiving_lookup: tirar as 2 linhas de integer_qty.
