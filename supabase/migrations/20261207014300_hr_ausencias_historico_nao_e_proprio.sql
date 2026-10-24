-- ==============================================================================
-- Ninguem mexe no historico das suas proprias ausencias.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- rpc_hr_ausencia_cancelar (ramo estado='aprovado') e
-- rpc_hr_ausencia_corrigir_aprovado, criadas em 20261121110000 e nunca
-- substituidas desde (confirmado: a unica migracao posterior que as menciona,
-- 20261121230000, so cita "rpc_hr_ausencia_cancelar" no texto de uma mensagem
-- de erro, nao redefine nenhuma das duas funcoes), so perguntam se quem age
-- tem hr.ausencias.historico.editar. Nunca perguntam se quem age e a propria
-- pessoa do pedido. E a mesma familia de defeito da auto-aprovacao: ter a
-- permissao nao e o mesmo que ser a parte desinteressada que a permissao
-- pressupoe.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Em rpc_hr_ausencia_cancelar, dentro do ramo IF v_ped.estado = 'aprovado',
-- ANTES da verificacao de has_anew_permission_in_org: se quem chama a RPC e a
-- pessoa do proprio pedido, recusa -- mesmo que tenha
-- hr.ausencias.historico.editar. A mensagem diz-o em termos de "e a sua
-- propria ausencia", nao "falta-lhe a permissao", que seria falso para quem a
-- tem (inclui um super_admin).
--
-- Em rpc_hr_ausencia_corrigir_aprovado, a mesma guarda logo apos ler o pedido,
-- antes de qualquer outra verificacao.
--
-- Condicao, igual nas duas: v_eu IS NOT NULL AND v_eu = v_ped.pessoa_id.
-- Erro: ausencia_historico_proprio, ERRCODE 42501.
--
--
-- -- NAO-REGRESSAO POR CONSTRUCAO ------------------------------------------------
--
-- O ramo de pedido PENDENTE em rpc_hr_ausencia_cancelar fica intocado: a
-- guarda nova so existe dentro do ramo estado='aprovado', e so dispara quando
-- quem age e a pessoa do proprio pedido. Cancelar o proprio pedido pendente
-- continua a funcionar como antes.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - Sem escotilha para super_admin nem para nenhum outro papel: quem
--   precisar de mexer no historico da propria ausencia faz por migration.
-- - O pedido de alteracao de dias (parte B do plano) nao entra nesta
--   migracao.
-- - Nao se toca em rpc_hr_ausencia_pedir, rpc_hr_ausencia_decidir_chefia nem
--   rpc_hr_ausencia_decidir_rh.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao: reaplicar o
-- corpo de rpc_hr_ausencia_cancelar e rpc_hr_ausencia_corrigir_aprovado tal
-- como ficaram em 20261121110000 (CREATE OR REPLACE, aridade igual).
--
--
-- Prerequisitos:
--   20261121110000  rpc_hr_ausencia_cancelar(uuid, text), rpc_hr_ausencia_corrigir_aprovado(uuid, text)
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_ausencia_cancelar' AND p.pronargs = 2
  ) THEN
    RAISE EXCEPTION
      'public.rpc_hr_ausencia_cancelar(uuid, text) nao existe. Aplicar 20261121110000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_ausencia_corrigir_aprovado' AND p.pronargs = 2
  ) THEN
    RAISE EXCEPTION
      'public.rpc_hr_ausencia_corrigir_aprovado(uuid, text) nao existe. Aplicar 20261121110000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_ausencias_pedidos'
       AND column_name = 'pessoa_id'
  ) THEN
    RAISE EXCEPTION
      'public.pessoas_ausencias_pedidos nao tem pessoa_id; a guarda compara v_eu contra essa coluna.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_pessoa_do_utilizador' AND p.pronargs = 2
  ) THEN
    RAISE EXCEPTION
      'public.hr_pessoa_do_utilizador(uuid, uuid) nao existe; rpc_hr_ausencia_corrigir_aprovado passa a depender dela para calcular v_eu.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 7. rpc_hr_ausencia_cancelar (guarda de historico proprio no ramo aprovado)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_ausencia_cancelar(
  _pedido_id uuid,
  _motivo text
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_anew uuid;
  v_ped  public.pessoas_ausencias_pedidos;
  v_eu   uuid;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'ausencia_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;

  IF _motivo IS NULL OR btrim(_motivo) = '' THEN
    RAISE EXCEPTION 'ausencia_cancelamento_sem_motivo: cancelar exige motivo escrito.' USING ERRCODE = '23514';
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;

  SELECT p.* INTO v_ped FROM public.pessoas_ausencias_pedidos p WHERE p.id = _pedido_id;
  IF v_ped.id IS NULL THEN
    RAISE EXCEPTION 'ausencia_pedido_inexistente: o pedido % nao existe.', _pedido_id USING ERRCODE = '23503';
  END IF;

  v_eu := public.hr_pessoa_do_utilizador(v_auth, v_ped.organization_id);

  IF v_ped.estado IN ('recusado','cancelado') THEN
    RAISE EXCEPTION
      'ausencia_estado_terminal: o pedido esta em "%" e nao ha o que cancelar.', v_ped.estado
      USING ERRCODE = '23514';
  END IF;

  IF v_ped.estado = 'aprovado' THEN
    -- Ninguem mexe no historico da propria ausencia, mesmo tendo a permissao.
    -- Antes da verificacao de proposito: a mensagem diz "e a sua propria
    -- ausencia" em vez de "falta-lhe a permissao", que seria falso para quem
    -- a tem (inclui um super_admin).
    IF v_eu IS NOT NULL AND v_eu = v_ped.pessoa_id THEN
      RAISE EXCEPTION
        'ausencia_historico_proprio: nao pode cancelar uma ausencia sua ja aprovada, mesmo tendo hr.ausencias.historico.editar. Peca a quem gere ausencias, ou peca uma alteracao de dias.'
        USING ERRCODE = '42501';
    END IF;

    -- Cancelar um APROVADO e mexer no historico: contadores mudam para tras.
    IF NOT public.has_anew_permission_in_org(v_auth, 'hr.ausencias.historico.editar', v_ped.organization_id) THEN
      RAISE EXCEPTION
        'ausencia_sem_permissao: cancelar um pedido JA APROVADO exige hr.ausencias.historico.editar -- muda o contador para tras. Cancelar um pedido pendente e outra coisa.'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    -- Pendente: e direito de quem pediu, ou de quem gere ausencias. Ramo
    -- intocado -- a guarda nova nao existe aqui, so no ramo 'aprovado'.
    IF NOT (
      (v_eu IS NOT NULL AND v_eu = v_ped.pessoa_id
       AND public.has_anew_permission_in_org(v_auth, 'hr.ausencias.pedir', v_ped.organization_id))
      OR public.has_anew_permission_in_org(v_auth, 'hr.ausencias.pedir.outros', v_ped.organization_id)
      OR public.has_anew_permission_in_org(v_auth, 'hr.ausencias.aprovar.rh', v_ped.organization_id)
    ) THEN
      RAISE EXCEPTION
        'ausencia_sem_permissao: cancelar um pedido pendente e direito de quem o fez (hr.ausencias.pedir sobre a propria ficha), de quem pede por outros, ou de quem decide o passo de RH.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.pessoas_ausencias_pedido_decisoes (
    pedido_id, pessoa_id, organization_id, ordem, passo, resultado,
    decidido_por_anew_user_id, decidido_por_pessoa_id, motivo
  )
  SELECT _pedido_id, v_ped.pessoa_id, v_ped.organization_id,
         coalesce(max(d.ordem), 0) + 1,
         CASE WHEN v_ped.estado = 'pendente_chefia' THEN 'chefia' ELSE 'rh' END,
         'recusado', v_anew, v_eu, 'cancelado: ' || btrim(_motivo)
    FROM public.pessoas_ausencias_pedido_decisoes d
   WHERE d.pedido_id = _pedido_id
     AND d.passo = CASE WHEN v_ped.estado = 'pendente_chefia' THEN 'chefia' ELSE 'rh' END;

  PERFORM set_config('hr_ausencias.rpc', 'on', true);
  UPDATE public.pessoas_ausencias_pedidos
     SET estado = 'cancelado', updated_by = v_anew
   WHERE id = _pedido_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_ausencia_cancelar(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_ausencia_cancelar(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_ausencia_cancelar(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_ausencia_cancelar(uuid, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_ausencia_cancelar(uuid, text) IS
'Cancela um pedido. E aqui que vive a decisao de NAO haver permissao de "cancelar": cancelar um pedido PENDENTE e direito de quem o fez, e cancelar um APROVADO e mexer no historico e exige hr.ausencias.historico.editar, porque muda o contador para tras -- EXCEPTO quando quem cancela e a propria pessoa do pedido: nesse caso e sempre recusado (ausencia_historico_proprio), mesmo tendo a permissao. Ninguem mexe no historico da propria ausencia.

Cancelar e um ESTADO, nao um apagamento: o pedido fica, e a decisao de cancelamento fica gravada com autor e motivo.';

-- ==============================================================================
-- 8. rpc_hr_ausencia_corrigir_aprovado (guarda de historico proprio)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_ausencia_corrigir_aprovado(
  _pedido_id uuid,
  _motivo text
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_ped  public.pessoas_ausencias_pedidos;
  v_eu   uuid;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'ausencia_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;

  IF _motivo IS NULL OR btrim(_motivo) = '' THEN
    RAISE EXCEPTION 'ausencia_correccao_sem_motivo: corrigir o historico exige motivo escrito.' USING ERRCODE = '23514';
  END IF;

  SELECT p.* INTO v_ped FROM public.pessoas_ausencias_pedidos p WHERE p.id = _pedido_id;
  IF v_ped.id IS NULL THEN
    RAISE EXCEPTION 'ausencia_pedido_inexistente: o pedido % nao existe.', _pedido_id USING ERRCODE = '23503';
  END IF;

  -- Estado antes da guarda de proprio: sobre um pedido PENDENTE a resposta
  -- certa e ausencia_nao_aprovada, nao ausencia_historico_proprio -- esta RPC
  -- so corrige aprovados, e isso vale mesmo quando quem chama e a propria
  -- pessoa do pedido.
  IF v_ped.estado <> 'aprovado' THEN
    RAISE EXCEPTION
      'ausencia_nao_aprovada: esta RPC corrige pedidos APROVADOS; este esta em "%". Um pedido pendente altera-se cancelando e pedindo de novo.', v_ped.estado
      USING ERRCODE = '23514';
  END IF;

  -- Ninguem mexe no historico da propria ausencia, mesmo tendo a permissao.
  -- Antes da verificacao de permissao, cuja mensagem seria falsa ("falta-lhe
  -- a permissao") para quem a tem.
  v_eu := public.hr_pessoa_do_utilizador(v_auth, v_ped.organization_id);
  IF v_eu IS NOT NULL AND v_eu = v_ped.pessoa_id THEN
    RAISE EXCEPTION
      'ausencia_historico_proprio: nao pode corrigir uma ausencia sua ja aprovada, mesmo tendo hr.ausencias.historico.editar. Peca a quem gere ausencias, ou peca uma alteracao de dias.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.ausencias.historico.editar', v_ped.organization_id) THEN
    RAISE EXCEPTION
      'ausencia_sem_permissao: corrigir uma ausencia aprovada exige hr.ausencias.historico.editar nesta organizacao.'
      USING ERRCODE = '42501';
  END IF;

  -- Corrigir um aprovado e, nesta ronda, cancela-lo com rasto e pedir de novo.
  -- NAO se reescrevem as datas de um pedido aprovado: um pedido aprovado com
  -- datas diferentes das que foram aprovadas nao e uma correccao, e uma
  -- aprovacao que nunca houve.
  PERFORM public.rpc_hr_ausencia_cancelar(_pedido_id, 'correccao de historico: ' || btrim(_motivo));
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_ausencia_corrigir_aprovado(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_ausencia_corrigir_aprovado(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_ausencia_corrigir_aprovado(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_ausencia_corrigir_aprovado(uuid, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_ausencia_corrigir_aprovado(uuid, text) IS
'Corrige uma ausencia APROVADA, exigindo hr.ausencias.historico.editar e motivo escrito -- EXCEPTO quando quem corrige e a propria pessoa do pedido: nesse caso e sempre recusado (ausencia_historico_proprio), mesmo tendo a permissao. Nesta ronda a correccao e cancelar com rasto e pedir de novo, DE PROPOSITO: reescrever as datas de um pedido aprovado nao e uma correccao, e uma aprovacao que nunca houve -- ficaria uma linha a dizer que o RH aprovou dias que nunca lhe foram apresentados.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_n_cancelar  int;
  v_n_corrigir  int;
  v_secdef_cancelar boolean;
  v_secdef_corrigir boolean;
  v_search_path_cancelar text[];
  v_search_path_corrigir text[];
  v_src_cancelar text;
  v_src_corrigir text;
BEGIN
  -- Existe EXACTAMENTE UMA funcao com cada nome, contada em pg_proc (nao em
  -- pg_constraint). Aridade nova com DEFAULT criaria uma segunda funcao e o
  -- PostgREST deixaria de saber qual escolher.
  SELECT count(*) INTO v_n_cancelar
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_ausencia_cancelar';

  IF v_n_cancelar <> 1 THEN
    RAISE EXCEPTION
      'Ha % funcoes public.rpc_hr_ausencia_cancelar; esperava-se exactamente 1. Uma aridade nova com DEFAULT cria uma segunda funcao e o PostgREST deixa de saber qual escolher.', v_n_cancelar;
  END IF;

  SELECT count(*) INTO v_n_corrigir
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_ausencia_corrigir_aprovado';

  IF v_n_corrigir <> 1 THEN
    RAISE EXCEPTION
      'Ha % funcoes public.rpc_hr_ausencia_corrigir_aprovado; esperava-se exactamente 1.', v_n_corrigir;
  END IF;

  -- Continuam SECURITY DEFINER com search_path fixo.
  SELECT p.prosecdef, p.proconfig INTO v_secdef_cancelar, v_search_path_cancelar
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_ausencia_cancelar' AND p.pronargs = 2;

  IF NOT v_secdef_cancelar THEN
    RAISE EXCEPTION 'rpc_hr_ausencia_cancelar deixou de ser SECURITY DEFINER.';
  END IF;

  IF v_search_path_cancelar IS NULL
     OR NOT EXISTS (SELECT 1 FROM unnest(v_search_path_cancelar) c WHERE c LIKE 'search_path=%') THEN
    RAISE EXCEPTION 'rpc_hr_ausencia_cancelar ficou sem search_path fixo.';
  END IF;

  SELECT p.prosecdef, p.proconfig INTO v_secdef_corrigir, v_search_path_corrigir
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_ausencia_corrigir_aprovado' AND p.pronargs = 2;

  IF NOT v_secdef_corrigir THEN
    RAISE EXCEPTION 'rpc_hr_ausencia_corrigir_aprovado deixou de ser SECURITY DEFINER.';
  END IF;

  IF v_search_path_corrigir IS NULL
     OR NOT EXISTS (SELECT 1 FROM unnest(v_search_path_corrigir) c WHERE c LIKE 'search_path=%') THEN
    RAISE EXCEPTION 'rpc_hr_ausencia_corrigir_aprovado ficou sem search_path fixo.';
  END IF;

  -- Os GRANT/REVOKE originais continuam aplicados: authenticated e
  -- service_role com EXECUTE, anon e PUBLIC sem.
  IF NOT has_function_privilege('authenticated', 'public.rpc_hr_ausencia_cancelar(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated perdeu EXECUTE em rpc_hr_ausencia_cancelar.';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.rpc_hr_ausencia_cancelar(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role perdeu EXECUTE em rpc_hr_ausencia_cancelar.';
  END IF;
  IF has_function_privilege('anon', 'public.rpc_hr_ausencia_cancelar(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon ganhou EXECUTE em rpc_hr_ausencia_cancelar; devia continuar sem.';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.rpc_hr_ausencia_corrigir_aprovado(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated perdeu EXECUTE em rpc_hr_ausencia_corrigir_aprovado.';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.rpc_hr_ausencia_corrigir_aprovado(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role perdeu EXECUTE em rpc_hr_ausencia_corrigir_aprovado.';
  END IF;
  IF has_function_privilege('anon', 'public.rpc_hr_ausencia_corrigir_aprovado(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon ganhou EXECUTE em rpc_hr_ausencia_corrigir_aprovado; devia continuar sem.';
  END IF;

  -- A regra em si: a guarda ausencia_historico_proprio tem de estar no CORPO
  -- guardado em pg_proc, nao so no ficheiro .sql. Isto e leitura do
  -- catalogo (pg_proc.prosrc), nao string-matching sobre o texto da
  -- migration -- falharia se a funcao aplicada na base nao contivesse a
  -- guarda, por exemplo por um CREATE OR REPLACE posterior a ter apagado,
  -- ou por esta migration nunca ter chegado a ser aplicada correctamente
  -- apesar do DO acima nao ter rebentado.
  SELECT p.prosrc INTO v_src_cancelar
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_ausencia_cancelar' AND p.pronargs = 2;

  IF v_src_cancelar IS NULL OR v_src_cancelar NOT LIKE '%ausencia_historico_proprio%' THEN
    RAISE EXCEPTION
      'rpc_hr_ausencia_cancelar nao tem a guarda ausencia_historico_proprio no corpo aplicado (pg_proc.prosrc); a regra desta migration nao esta em vigor.';
  END IF;

  SELECT p.prosrc INTO v_src_corrigir
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_ausencia_corrigir_aprovado' AND p.pronargs = 2;

  IF v_src_corrigir IS NULL OR v_src_corrigir NOT LIKE '%ausencia_historico_proprio%' THEN
    RAISE EXCEPTION
      'rpc_hr_ausencia_corrigir_aprovado nao tem a guarda ausencia_historico_proprio no corpo aplicado (pg_proc.prosrc); a regra desta migration nao esta em vigor.';
  END IF;

  RAISE NOTICE 'Conferido: uma unica funcao com cada nome, SECURITY DEFINER com search_path fixo, GRANT/REVOKE originais intactos, guarda ausencia_historico_proprio presente no corpo das duas funcoes.';
END;
$conferir$;
