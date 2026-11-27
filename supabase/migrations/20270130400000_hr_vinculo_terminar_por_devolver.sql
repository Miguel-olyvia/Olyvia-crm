-- ==============================================================================
-- 20270130400000_hr_vinculo_terminar_por_devolver.sql
--
-- ATIVOS, fase 1, passo F1.3: o «Terminar» IMEDIATO de um contrato é recusado (HRV14) enquanto
-- a pessoa tiver itens por devolver (ativos do RH ou viaturas da Frota).
-- Desenho fechado: vault/ficheiros/ativos/ativos-plano-fase1-nike.md (secção 2, F1.3) e a
-- versão simples aprovada pelo dono (ativos-plano-fase1-nike-v2.md, passo 3).
-- Decisões do dono: bloqueio SÓ no «Terminar» imediato (D1); o aviso no sino foi retirado,
-- por isso esta função NÃO avisa ninguém no ramo «agendado» (não há ativos_avisar_saida).
-- Não há tabelas, colunas nem CHECKs novas.
--
-- SÓ PARA A BASE DE RH (uetjghdkwbywbftedtth). NUNCA a principal (tzbfgw...).
--
-- !!! RETIDA: NÃO APLICAR NEM ENVIAR ATÉ O ECRÃ QUE TRADUZ O HRV14 ESTAR PUBLICADO !!!
--  Sem o ecrã, o RH carrega em «Terminar» e recebe um erro em bruto.
--
-- O QUE O ECRÃ TEM DE FAZER (no mesmo envio, ANTES do push desta migration):
--  * src/lib/hr/errosFimContrato.ts: traduzir HRV14 («Há X itens por devolver»; o número vem
--    na mensagem e o DETAIL diz o que fazer). Traduções em src/translations/index.ts e
--    rhExemploMenu.ts (pt e en).
--  * AccaoFimContratoDialog (rh-exemplo/fimContrato): mostrar a lista por devolver da pessoa
--    (rpc_ativos_por_devolver com p_pessoa_id) antes de confirmar «Terminar».
--  * src/hooks/usePessoaContratoFim.ts:162 é o único chamador (os dois cartões de fim de
--    contrato); a assinatura e o retorno ('terminado' | 'agendado') não mudam.
--  * Porta de trás aceite na fase 1: um UPDATE direto a pessoas_vinculos (usePessoa.ts:601) e a
--    rotina noturna não passam por aqui; aviso no ecrã em PessoaContratoTab.
--
-- ORDEM DE APLICAÇÃO
--  1. Testes de texto (src/components/ativos/ativosVinculoTerminarMigration.test.ts).
--  2. 20270130200000_ativos_por_devolver TEM de estar aplicada (esta chama
--     ativos_itens_por_devolver; a guarda G4 pára se faltar).
--  3. Publicar o ecrã que traduz o HRV14. Só depois: confirmar supabase/.temp/project-ref =
--     uetjghdkwbywbftedtth, `supabase migration list --linked` IMEDIATAMENTE antes, e push.
--
-- O QUE FAZ
--  0. Guardas: base certa, rpc_hr_vinculo_terminar como foi lida a 27/11 (assinatura e md5 do
--     corpo), ativos_itens_por_devolver e hr_contrato_regra_efectiva existem, HRV14 livre.
--  1. rpc_hr_vinculo_terminar: MESMA assinatura e retorno. Lê também pv.pessoa_id. Só no ramo
--     que termina já (data_fim < current_date), depois do HRV10: trinco consultivo da pessoa
--     (o mesmo 'hr_equipamentos:'||pessoa_id que rpc_hr_equipamento_atribuir toma, para não
--     entrar uma entrega nova entre a contagem e o UPDATE) e contagem com a regra única
--     ativos_itens_por_devolver; se houver itens, HRV14 e o contrato não termina. O ramo
--     «agendado» fica igual (a rotina noturna não é afetada). search_path passa a vazio
--     (todas as referências já eram qualificadas com public.; os gatilhos de pessoas_vinculos
--     têm search_path próprio).
--  2. Direitos: os de hoje (authenticated e service_role); PUBLIC e anon sem nada.
--  3. Conferir o estado final.
--
-- TRINCOS (lidos a 27/11): terminar = linha do vínculo (FOR UPDATE) -> trinco da pessoa;
--  atribuir com ativo = linha do ativo -> trinco da pessoa; devolver = linha do ativo -> linha
--  do equipamento (sem o trinco da pessoa). Sem ciclo de espera. Uma devolução em curso só
--  conta depois do commit: o bloqueio pode recusar a mais, nunca a menos.
--
-- ERROS NOVOS: HRV14 itens por devolver (SQLSTATE HRV14, como os outros HRV).
--
-- COMO SE REVERTE: sem ficheiro de reversão nesta pasta, de propósito.
-- ==============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

-- ---- 0. Guardas (tudo do catálogo com ::text) ----------------------------------------
DO $guardas$
DECLARE
  v_n integer;
BEGIN
  -- G1 Esta é a base de RH (a nike existe aqui) e quem aplica passa a RLS.
  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.id = 'b6ffce4f-f630-4933-833a-008649757a33') THEN
    RAISE EXCEPTION 'G1: a organização nike não existe nesta base. É a base certa?';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname::text = current_user::text AND (r.rolsuper OR r.rolbypassrls)) THEN
    RAISE EXCEPTION 'G1: o papel que aplica (%) não tem BYPASSRLS.', current_user::text;
  END IF;

  -- G3 rpc_hr_vinculo_terminar: uma só sobrecarga, a assinatura e o corpo lidos a 27/11.
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname::text = 'public' AND p.proname::text = 'rpc_hr_vinculo_terminar';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'G3: rpc_hr_vinculo_terminar tem % sobrecarga(s) (esperada 1).', v_n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
                  WHERE ns.nspname::text = 'public' AND p.proname::text = 'rpc_hr_vinculo_terminar'
                    AND pg_get_function_identity_arguments(p.oid)::text = 'p_vinculo_id uuid, p_motivo text'
                    AND md5(p.prosrc::text) = '9a36755d82e19360a2d099f4102ee569') THEN
    RAISE EXCEPTION 'G3: rpc_hr_vinculo_terminar não tem a assinatura ou o corpo lidos a 27/11. Ler a versão mais recente antes de aplicar.';
  END IF;

  -- G4 Dependências: a regra única (20270130200000) e as funções do fim de contrato.
  IF to_regprocedure('public.ativos_itens_por_devolver(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION 'G4: falta ativos_itens_por_devolver. Aplicar antes 20270130200000_ativos_por_devolver.';
  END IF;
  IF to_regprocedure('public.hr_contrato_regra_efectiva(uuid)') IS NULL
     OR to_regprocedure('public.hr_contratos_resolver_avisos(uuid, text, uuid)') IS NULL
     OR to_regprocedure('public.has_anew_permission_in_org(uuid, text, uuid)') IS NULL THEN
    RAISE EXCEPTION 'G4: falta hr_contrato_regra_efectiva, hr_contratos_resolver_avisos ou has_anew_permission_in_org.';
  END IF;

  -- G5 Código de erro novo ainda livre.
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname::text = 'public' AND p.prosrc ~ 'HRV14';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'G5: há % função(ões) que já usam HRV14. Escolher outro.', v_n;
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. rpc_hr_vinculo_terminar (mesma assinatura): bloqueio com itens por devolver
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_vinculo_terminar(p_vinculo_id uuid, p_motivo text DEFAULT NULL::text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v           record;
  e           record;
  v_user      uuid;
  v_resultado text;
  v_n         integer;
BEGIN
  SELECT pv.id, pv.pessoa_id, pv.organization_id, pv.estado, pv.data_fim INTO v
    FROM public.pessoas_vinculos pv
   WHERE pv.id = p_vinculo_id AND pv.deleted_at IS NULL
     FOR UPDATE;

  IF v_uid IS NULL OR NOT FOUND
     OR NOT public.has_anew_permission_in_org(v_uid, 'hr.pessoas.vinculos.edit', v.organization_id) THEN
    RAISE EXCEPTION 'Sem permissao para terminar este contrato.' USING ERRCODE = 'HRV05';
  END IF;

  IF v.estado NOT IN ('activo', 'suspenso') OR v.data_fim IS NULL THEN
    RAISE EXCEPTION 'Este contrato nao esta em vigor ou nao tem data de fim.' USING ERRCODE = 'HRV06';
  END IF;

  SELECT * INTO e FROM public.hr_contrato_regra_efectiva(p_vinculo_id);
  IF NOT e.ativo THEN
    RAISE EXCEPTION 'A funcionalidade de fim de contrato esta desligada nesta organizacao.' USING ERRCODE = 'HRV10';
  END IF;

  SELECT au.id INTO v_user FROM public.anew_users au WHERE au.auth_user_id = v_uid LIMIT 1;

  PERFORM set_config('hr.alteracao_motivo',
                     coalesce(NULLIF(btrim(p_motivo), ''), 'Fim de contrato decidido pelo RH'), true);

  IF v.data_fim < current_date THEN
    -- Termina já: só com tudo devolvido. O trinco da pessoa é o mesmo que a atribuição toma,
    -- para não entrar uma entrega nova entre a contagem e o UPDATE.
    PERFORM pg_advisory_xact_lock(hashtextextended('hr_equipamentos:' || v.pessoa_id::text, 0));
    SELECT count(*) INTO v_n FROM public.ativos_itens_por_devolver(v.organization_id, v.pessoa_id);
    IF v_n > 0 THEN
      RAISE EXCEPTION 'Ha % item(ns) por devolver.', v_n USING ERRCODE = 'HRV14',
        DETAIL = 'Registe a devolução (ou a perda) de cada item antes de terminar o contrato.';
    END IF;
    UPDATE public.pessoas_vinculos SET estado = 'terminado' WHERE id = v.id;
    v_resultado := 'terminado';
  ELSE
    PERFORM set_config('hr.vinculo_via_rpc', 'on', true);
    UPDATE public.pessoas_vinculos
       SET fim_decisao = 'terminar', fim_decisao_em = now(), fim_decisao_por = v_user
     WHERE id = v.id;
    PERFORM set_config('hr.vinculo_via_rpc', 'off', true);
    v_resultado := 'agendado';
  END IF;

  PERFORM set_config('hr.alteracao_motivo', '', true);
  PERFORM public.hr_contratos_resolver_avisos(v.id, 'decidido', NULL);

  RETURN v_resultado;
END;
$$;

-- ==============================================================================
-- 2. Direitos: os de hoje; PUBLIC e anon sem nada
-- ==============================================================================
REVOKE ALL ON FUNCTION public.rpc_hr_vinculo_terminar(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_vinculo_terminar(uuid, text) TO authenticated;

-- ==============================================================================
-- 3. Conferir o estado final (catálogo lido com ::text)
-- ==============================================================================
DO $conferir$
BEGIN
  -- C1 Mesma assinatura e retorno, SECURITY DEFINER, search_path vazio, com o bloqueio.
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
                  WHERE ns.nspname::text = 'public' AND p.proname::text = 'rpc_hr_vinculo_terminar'
                    AND pg_get_function_identity_arguments(p.oid)::text = 'p_vinculo_id uuid, p_motivo text'
                    AND p.prorettype = 'text'::regtype
                    AND p.prosecdef
                    AND array_to_string(p.proconfig, ',')::text = 'search_path=""'
                    AND p.prosrc ~ 'HRV14' AND p.prosrc ~ 'ativos_itens_por_devolver') THEN
    RAISE EXCEPTION 'C1: rpc_hr_vinculo_terminar não ficou como devia.';
  END IF;

  -- C2 Direitos: anon sem nada; authenticated com EXECUTE.
  IF has_function_privilege('anon', 'public.rpc_hr_vinculo_terminar(uuid, text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.rpc_hr_vinculo_terminar(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'C2: direitos errados em rpc_hr_vinculo_terminar.';
  END IF;
END;
$conferir$;

COMMIT;
