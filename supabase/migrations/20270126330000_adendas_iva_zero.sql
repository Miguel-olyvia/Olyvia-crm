-- ============================================================
-- 20270126330000 adendas_iva_zero
-- ============================================================
-- 24/11/2026 (Rúben, contrato MD 1600, Enigma da Avenida, cliente empresa): o IVA a 0% (autoliquidação) por linha, além de 6% e 23%.
--
-- O orçamento principal já aceita o 0%: neg_guardar_negocio grava iva_percent = coalesce(taxa_iva, …) com iva_explicita quando a taxa
-- vem (0 também), confere o total pela taxa de cada linha, e fn_neg_ler_orcamento devolve-a. Nada a mudar aí.
-- As adendas não: fn_neg_guardar_adendas (20270124030000) só aceita taxa_iva 6 ou 23; uma linha a 0% ficava a 6% e sem iva_explicita.
--
-- O que muda (troca de texto guardada sobre o pg_get_functiondef VIVO; nenhuma coluna nova): em fn_neg_guardar_adendas, as duas
-- expressões «::numeric IN (6, 23)» passam a «::numeric IN (0, 6, 23)». Tem de haver exatamente duas; senão, não aplica.
-- Permissões, GRANTs (só service_role), dono, SECURITY DEFINER e search_path ficam iguais. As versões aceites ou em curso não se
-- reescrevem (a regra de 20261231994000 fica igual).
--
-- Reversão (só como migration nova): a troca ao contrário, «IN (0, 6, 23)» → «IN (6, 23)» (as linhas gravadas a 0% voltam a ler-se a 0%,
-- porque a leitura devolve iva_percent; só deixam de se poder gravar novas).
-- ============================================================
SET lock_timeout = '5s';

DO $m$
DECLARE
  d text := replace(pg_get_functiondef('public.fn_neg_guardar_adendas(uuid,uuid,jsonb,uuid)'::regprocedure), chr(13) || chr(10), chr(10));
  v_antes text := '::numeric IN (6, 23)';
  v_n int;
BEGIN
  IF position('::numeric IN (0, 6, 23)' IN d) > 0 THEN
    RAISE NOTICE 'fn_neg_guardar_adendas já aceita o 0%%: nada a fazer.';
    RETURN;
  END IF;
  v_n := (length(d) - length(replace(d, v_antes, ''))) / length(v_antes);
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'fn_neg_guardar_adendas: esperavam-se 2 vezes «%», há %. A função mudou: rever antes de aplicar 20270126330000.', v_antes, v_n;
  END IF;
  EXECUTE replace(d, v_antes, '::numeric IN (0, 6, 23)');
END $m$;

-- ---------------------------------------------------------------- conferir
DO $c$
DECLARE x text := 'public.fn_neg_guardar_adendas(uuid,uuid,jsonb,uuid)';
BEGIN
  IF position('::numeric IN (0, 6, 23)' IN pg_get_functiondef(x::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'CONFERIR: % ficou sem o 0%%', x;
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = x::regprocedure) THEN
    RAISE EXCEPTION 'CONFERIR: % deixou de ser SECURITY DEFINER', x;
  END IF;
  IF has_function_privilege('authenticated', x, 'EXECUTE') THEN
    RAISE EXCEPTION 'CONFERIR: % ficou aberta a authenticated', x;
  END IF;
END $c$;

-- Verificação (só leitura): deve dar 2.
-- SELECT (length(d) - length(replace(d, '::numeric IN (0, 6, 23)', ''))) / length('::numeric IN (0, 6, 23)') AS trocas
-- FROM (SELECT pg_get_functiondef('public.fn_neg_guardar_adendas(uuid,uuid,jsonb,uuid)'::regprocedure) AS d) f;
