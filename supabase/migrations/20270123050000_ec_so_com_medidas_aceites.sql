-- ============================================================
-- 20270123050000 ec_so_com_medidas_aceites
-- ============================================================
-- Auditoria de 19/11/2026, achado 6: a encomenda de cliente só sai com as medidas retificadas e aceites.
--
-- O problema: fn_neg_emitir_ec_se_pronta (20270112300000, com as trocas de 20270117960000) emite a encomenda de cliente com o pagamento
-- da 1.ª prestação validado, o contrato assinado, o plano aprovado e a fatura da retificação paga; nunca vê se o supervisor aceitou as
-- medidas no local (negocio_respostas.retif_aceite). O ecrã pede-as (preparacaoObra.ts: faltaParaArrancar e semEncomendaCliente,
-- retificacaoAceite), mas uma gravação direta do plano aprovado emitia a encomenda com as medidas da visita.
--
-- O que muda:
--   1. fn_neg_medidas_aceites(negócio) (nova): há retif_aceite com valor (e não sugerido), a mesma leitura de 20270112700001 (antes 20270112700000).
--   2. fn_neg_emitir_ec_se_pronta (trocas de texto guardadas sobre o pg_get_functiondef VIVO, que tem de ter as de 20270117960000):
--      v_medidas_ok = venda direta (não há obra a medir) OU encomenda já emitida (o atalho dos negócios antigos, como retificacaoAceite
--      no ecrã) OU fn_neg_medidas_aceites. Sem isso, o contrato não emite a encomenda: o negócio passa à Obra e espera, com o motivo
--      «A encomenda de cliente emite-se com as medidas retificadas e aceites…» (o mesmo caminho de quando falta o plano).
--      As encomendas das adendas (o ciclo do fim) não mudam.
-- A encomenda volta a tentar-se sozinha quando o plano se grava aprovado ou em curso (obra_guardar_negocio), quando o contrato se
-- assina (trg_negocios_40_contrato_emite_ec) e em cada fatura e pagamento validado.
-- Permissões, GRANTs (só service_role), dono, SECURITY DEFINER e search_path de fn_neg_emitir_ec_se_pronta ficam iguais.
--
-- Reversão (só como migration nova): desfazer as quatro trocas marcadas «20270123050000» (ver o fim deste ficheiro) e depois
-- DROP FUNCTION public.fn_neg_medidas_aceites(uuid).
-- ============================================================
SET lock_timeout = '5s';

DO $g$ BEGIN
  IF position('20270117960000' IN pg_get_functiondef('public.fn_neg_emitir_ec_se_pronta(uuid,uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'fn_neg_emitir_ec_se_pronta não tem as mudanças de 20270117960000: aplicar essa migration antes de 20270123050000.';
  END IF;
END $g$;

-- ---------------------------------------------------------------- 1. as medidas aceites
CREATE OR REPLACE FUNCTION public.fn_neg_medidas_aceites(p_negocio uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- 20270123050000: o supervisor aceitou as medidas retificadas no local (o d.f.retif_aceite do ecrã)
  SELECT EXISTS (SELECT 1 FROM negocio_respostas r
                 WHERE r.negocio_id = p_negocio AND r.campo_chave = 'retif_aceite'
                   AND coalesce(r.valor, '') <> '' AND NOT coalesce(r.sugerido, false))
$function$;
COMMENT ON FUNCTION public.fn_neg_medidas_aceites(uuid) IS 'Negócio da Emylia: as medidas retificadas foram aceites (negocio_respostas.retif_aceite)? Usada por fn_neg_emitir_ec_se_pronta. 20270123050000.';
REVOKE ALL ON FUNCTION public.fn_neg_medidas_aceites(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_neg_medidas_aceites(uuid) TO service_role;

-- ---------------------------------------------------------------- uma substituição exata (o texto antigo tem de aparecer uma só vez)
CREATE OR REPLACE FUNCTION pg_temp.trocar(p_def text, p_antes text, p_depois text, p_onde text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  IF (length(p_def) - length(replace(p_def, p_antes, ''))) / greatest(length(p_antes), 1) <> 1 THEN
    RAISE EXCEPTION 'Troca %: o texto antigo não aparece exatamente uma vez na definição viva de fn_neg_emitir_ec_se_pronta; a função mudou. Rever antes de aplicar 20270123050000.', p_onde;
  END IF;
  RETURN replace(p_def, p_antes, p_depois);
END $f$;

-- ---------------------------------------------------------------- 2. fn_neg_emitir_ec_se_pronta
DO $m$
DECLARE
  d text := replace(pg_get_functiondef('public.fn_neg_emitir_ec_se_pronta(uuid,uuid)'::regprocedure), chr(13) || chr(10), chr(10));
BEGIN
  IF position('20270123050000' IN d) > 0 THEN
    RAISE NOTICE 'fn_neg_emitir_ec_se_pronta já tem as mudanças 20270123050000: nada a fazer.';
    RETURN;
  END IF;

  -- a variável (antes de «v_vd boolean;», que 20270117960000 deixou com o comentário de v_plano_ok a seguir, na mesma linha)
  d := pg_temp.trocar(d, '  v_vd boolean;',
    E'  v_medidas_ok boolean; -- 20270123050000: as medidas retificadas e aceites (ou venda direta, ou a encomenda já emitida)\n  v_vd boolean;', 'declare');

  -- o valor, logo a seguir ao v_vd de 20270117960000 (v_c e v_q já estão lidos)
  d := pg_temp.trocar(d, E'  v_vd := coalesce(v_q.venda_direta, false);\n',
       E'  v_vd := coalesce(v_q.venda_direta, false);\n'
    || E'  -- 20270123050000 (auditoria 19/11): a encomenda de cliente espera pelas medidas aceites no local; a venda direta não tem obra a\n'
    || E'  --   medir e a encomenda já emitida (os negócios antigos) é o atalho, como retificacaoAceite no ecrã\n'
    || E'  v_medidas_ok := v_vd OR v_c.ec_emitida_em IS NOT NULL OR public.fn_neg_medidas_aceites(p_negocio);\n', 'valor');

  -- com contrato: também as medidas aceites
  d := pg_temp.trocar(d,
    'ELSIF v_pago IS NOT NULL AND v_c.id IS NOT NULL AND v_c.ec_emitida_em IS NULL AND v_plano_ok AND v_retif_ok THEN -- 20270117960000',
    'ELSIF v_pago IS NOT NULL AND v_c.id IS NOT NULL AND v_c.ec_emitida_em IS NULL AND v_plano_ok AND v_retif_ok AND v_medidas_ok THEN -- 20270117960000, 20270123050000',
    'contrato');

  -- pago e à espera (das medidas, do plano, da retificação ou do contrato): passa à Obra
  d := pg_temp.trocar(d,
    'IF v_pago IS NOT NULL AND (v_c.id IS NULL OR (v_c.ec_emitida_em IS NULL AND (NOT v_plano_ok OR NOT v_retif_ok))) THEN -- 20270117960000',
    'IF v_pago IS NOT NULL AND (v_c.id IS NULL OR (v_c.ec_emitida_em IS NULL AND (NOT v_plano_ok OR NOT v_retif_ok OR NOT v_medidas_ok))) THEN -- 20270117960000, 20270123050000',
    'aguarda');

  -- o motivo: as medidas primeiro (a ordem do ecrã: medidas, plano, contrato)
  d := pg_temp.trocar(d, '''motivo'', CASE WHEN v_plano_ok AND NOT v_retif_ok THEN',
       E'''motivo'', CASE WHEN NOT v_medidas_ok THEN ''A encomenda de cliente emite-se com as medidas retificadas e aceites (e o plano aprovado e o contrato assinado).'' -- 20270123050000\n'
    || E'                     WHEN v_plano_ok AND NOT v_retif_ok THEN', 'motivo');

  EXECUTE d;
END $m$;

-- ---------------------------------------------------------------- conferir
DO $c$
BEGIN
  IF position('v_medidas_ok := ' IN pg_get_functiondef('public.fn_neg_emitir_ec_se_pronta(uuid,uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'CONFERIR: fn_neg_emitir_ec_se_pronta ficou sem as mudanças 20270123050000';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.fn_neg_emitir_ec_se_pronta(uuid,uuid)'::regprocedure)
     OR has_function_privilege('authenticated', 'public.fn_neg_emitir_ec_se_pronta(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'CONFERIR: fn_neg_emitir_ec_se_pronta mudou de SECURITY DEFINER ou ficou aberta a authenticated';
  END IF;
END $c$;

-- Reversão (só se for preciso; correr numa migration nova):
-- DO $r$
-- DECLARE d text := replace(pg_get_functiondef('public.fn_neg_emitir_ec_se_pronta(uuid,uuid)'::regprocedure), chr(13) || chr(10), chr(10));
-- BEGIN
--   d := regexp_replace(d, '  v_medidas_ok boolean; -- 20270123050000[^\n]*\n', '');
--   d := regexp_replace(d, '  -- 20270123050000 \(auditoria 19/11\).*?v_medidas_ok := [^\n]*\n', '');
--   d := replace(d, ' AND v_medidas_ok THEN -- 20270117960000, 20270123050000', ' THEN -- 20270117960000');
--   d := replace(d, ' OR NOT v_medidas_ok))) THEN -- 20270117960000, 20270123050000', '))) THEN -- 20270117960000');
--   d := regexp_replace(d, 'WHEN NOT v_medidas_ok THEN [^\n]*\n\s*WHEN v_plano_ok AND NOT v_retif_ok THEN', 'WHEN v_plano_ok AND NOT v_retif_ok THEN');
--   EXECUTE d;
-- END $r$;
