-- ============================================================
-- 20270102230000_negocio_obra_sai_dos_papeis
-- ============================================================
-- O que faz: tira o código antigo negocios.obra de neg_papeis_permissoes (operacoes, direcao, tecnico). Foi substituído por
--   negocios.obra.planear, negocios.obra.executar e negocios.obra.materiais (20270102200000), e as duas funções que o pediam
--   (obra_guardar_negocio, obra_encomendar_materiais) deixaram de o pedir em 20270102220000. Nunca esteve em anew_permissions.
-- Guarda: nenhuma função viva de public cita 'negocios.obra' (fora dos códigos novos negocios.obra.*) nem nenhuma política.
-- Reversão (só como migration nova): voltar a inserir ('operacoes','negocios.obra'), ('direcao','negocios.obra'), ('tecnico','negocios.obra').
-- ============================================================
SET lock_timeout = '5s';

DO $do$
DECLARE v_f text;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_f
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosrc ~ 'negocios\.obra([^.]|$)';
  IF v_f IS NOT NULL THEN
    RAISE EXCEPTION 'Guarda: ainda há funções que pedem negocios.obra: %', v_f;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE coalesce(qual, '') ~ 'negocios\.obra([^.]|$)' OR coalesce(with_check, '') ~ 'negocios\.obra([^.]|$)') THEN
    RAISE EXCEPTION 'Guarda: ainda há políticas que pedem negocios.obra.';
  END IF;
END $do$;

DELETE FROM public.neg_papeis_permissoes WHERE permission_code = 'negocios.obra';
