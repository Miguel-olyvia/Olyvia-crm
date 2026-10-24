-- ==============================================================================
-- A validacao de horas passa a ser uma guarda: hr.pessoas.horario_realizado.validar
-- deixa de ser decorativa.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA, QUE A RONDA 2 DEIXOU ESCRITO ---------------------------------
--
-- hr.pessoas.horario_realizado.validar existe no catalogo desde 20261120120000
-- e NAO E VERIFICADA POR NADA. O cabecalho de 20261120160000 diz isto por
-- palavras: "passar uma linha a estado=validado exige
-- hr.pessoas.horario_realizado.EDIT na RLS, e mais nada. Quem tem .edit valida."
--
-- Foi uma lacuna assumida, com a indicacao explicita de quem a fechasse ter de
-- ligar as duas coisas -- passando a verificacao para a RPC e fechando a
-- escrita directa da coluna estado. E o que esta migracao faz.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- 1. Duas RPCs, rpc_hr_realizado_validar e rpc_hr_realizado_rejeitar, que
--    verificam hr.pessoas.horario_realizado.validar -- a permissao da ronda 2,
--    REAPROVEITADA. NAO se cria hr.assiduidade.validar ao lado: era exactamente
--    a duplicacao de autoridade que este repositorio ja registou como erro.
--
-- 2. Um trigger BEFORE UPDATE recusa qualquer mudanca da coluna estado que nao
--    venha de dentro de uma RPC do modulo, por sentinela
--    set_config('hr_assiduidade.rpc','on',true) -- no molde do bypass de
--    auditoria de 20260726010000.
--
-- QUEBRA DELIBERADA, e tem de ser comunicada antes do push: a partir daqui,
-- quem escrevia estado='validado' em pessoas_horario_realizado por UPDATE
-- directo deixa de conseguir. Hoje ninguem escreve nessa tabela em src/ -- ela
-- e da ronda 2 e a UI ainda nao aterrou -- pelo que o risco e baixo; mas isso
-- tem de ser CONFIRMADO antes do push, nao depois.
--
-- Nao se toca nas quatro politicas da ronda 2: a RLS de UPDATE continua a
-- exigir hr.pessoas.horario_realizado.edit para tudo o resto (horas, local,
-- notas). O que muda e que a COLUNA ESTADO deixa de ser escrivel por essa via.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - Validacao em bloco (um mes, uma equipa): as RPCs sao por linha. Um "validar
--   tudo" e uma decisao de produto sobre o que fazer quando uma das linhas
--   falha, e nao esta tomada.
-- - Revalidacao automatica depois de uma correccao: uma linha corrigida nasce em
--   estado=registado e volta a fila, de proposito. Herdar a validacao da linha
--   que substituiu seria dar por confirmadas horas que ninguem viu.
-- - Nao se toca em pessoas_vinculos nem em pessoas_retribuicoes.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP TRIGGER trg_pessoas_horario_realizado_estado_fechado ON public.pessoas_horario_realizado;
--   DROP FUNCTION public.hr_realizado_estado_so_por_rpc();
--   DROP FUNCTION public.rpc_hr_realizado_rejeitar(uuid, text);
--   DROP FUNCTION public.rpc_hr_realizado_validar(uuid);
--
--
-- Prerequisitos:
--   20261120160000  pessoas_horario_realizado
--   20261120120000  hr.pessoas.horario_realizado.validar no catalogo
--   20261121190000  rpc_hr_realizado_corrigir (que ja liga a sentinela)
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas_horario_realizado') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_horario_realizado nao existe. Aplicar 20261120160000 primeiro.';
  END IF;

  -- A permissao da ronda 2 que se REAPROVEITA. Se nao existir, criar uma nova
  -- aqui seria a duplicacao de autoridade que se quer evitar -- por isso aborta.
  IF NOT EXISTS (
    SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.horario_realizado.validar'
  ) THEN
    RAISE EXCEPTION
      'hr.pessoas.horario_realizado.validar nao esta no catalogo. Aplicar 20261120120000 primeiro. Esta migracao REAPROVEITA essa permissao e nao cria nenhuma ao lado.';
  END IF;

  -- E o codigo que NAO devia existir.
  IF EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.assiduidade.validar') THEN
    RAISE EXCEPTION
      'Existe hr.assiduidade.validar no catalogo. A autoridade de validar horas e hr.pessoas.horario_realizado.validar; duas permissoes para a mesma coisa e o defeito que esta migracao fecha, nao um que cria.';
  END IF;

  -- Os dois CHECKs da ronda 2 que as RPCs respeitam: validado exige quem e
  -- quando, rejeitado exige motivo.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_horario_realizado_validacao_coerente'
       AND conrelid = to_regclass('public.pessoas_horario_realizado')
  ) THEN
    RAISE EXCEPTION
      'pessoas_horario_realizado nao tem o CHECK de coerencia da validacao (ronda 2). Nao e a tabela esperada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_horario_realizado_rejeicao_com_motivo'
       AND conrelid = to_regclass('public.pessoas_horario_realizado')
  ) THEN
    RAISE EXCEPTION
      'pessoas_horario_realizado nao tem o CHECK de rejeicao com motivo (ronda 2). Nao e a tabela esperada.';
  END IF;

  -- A RPC de correccao tem de ja existir e ja ligar a sentinela: senao, este
  -- trigger recusa-lhe o UPDATE de estado e a correccao de horas para de
  -- funcionar no momento em que esta migracao for aplicada.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_realizado_corrigir'
       AND p.prosrc LIKE '%hr_assiduidade.rpc%'
  ) THEN
    RAISE EXCEPTION
      'rpc_hr_realizado_corrigir nao existe, ou nao liga a sentinela hr_assiduidade.rpc. Aplicar 20261121190000 primeiro: sem isso, este trigger recusaria o UPDATE de estado dessa RPC e a correccao de horas parava.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. rpc_hr_realizado_validar
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_realizado_validar(_realizado_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_anew uuid;
  v_h    public.pessoas_horario_realizado;
  v_eu   uuid;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'realizado_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;

  SELECT h.* INTO v_h FROM public.pessoas_horario_realizado h WHERE h.id = _realizado_id;
  IF v_h.id IS NULL THEN
    RAISE EXCEPTION 'realizado_inexistente: o intervalo % nao existe.', _realizado_id USING ERRCODE = '23503';
  END IF;

  -- A permissao da RONDA 2, finalmente verificada.
  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.pessoas.horario_realizado.validar', v_h.organization_id) THEN
    RAISE EXCEPTION
      'realizado_sem_permissao: validar horas exige hr.pessoas.horario_realizado.validar nesta organizacao. Registar e corrigir horas (.edit) deixa de bastar para as validar -- e o que esta migracao muda.'
      USING ERRCODE = '42501';
  END IF;

  IF v_h.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'realizado_apagado: o intervalo % esta apagado.', _realizado_id USING ERRCODE = '23514';
  END IF;

  IF v_h.estado = 'validado' THEN
    RAISE EXCEPTION
      'realizado_ja_validado: o intervalo % foi validado em % e nao se valida duas vezes.', _realizado_id, v_h.validado_em
      USING ERRCODE = '23514';
  END IF;

  IF v_h.estado = 'rejeitado' THEN
    RAISE EXCEPTION
      'realizado_rejeitado: o intervalo % esta rejeitado e nao se valida. Registar a versao correcta (rpc_hr_realizado_corrigir).', _realizado_id
      USING ERRCODE = '23514';
  END IF;

  -- Validar horas que ninguem picou nem lancou seria confirmar o vazio.
  IF v_h.minutos IS NULL OR v_h.minutos <= 0 THEN
    RAISE EXCEPTION 'realizado_sem_duracao: o intervalo % nao tem duracao.', _realizado_id USING ERRCODE = '23514';
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;
  IF v_anew IS NULL THEN
    RAISE EXCEPTION
      'realizado_sem_ficha_de_utilizador: a sessao nao corresponde a um anew_users. Uma validacao sem autor nao e uma validacao.'
      USING ERRCODE = '42501';
  END IF;

  v_eu := public.hr_pessoa_do_utilizador(v_auth, v_h.organization_id);

  -- Ninguem valida as suas proprias horas: e quem as picou que beneficia delas.
  IF v_eu IS NOT NULL AND v_eu = v_h.pessoa_id THEN
    RAISE EXCEPTION
      'realizado_autovalidacao: ninguem valida as suas proprias horas. Estas sustentam um pagamento a propria pessoa, e confirma-las a si mesma esvazia a validacao de sentido.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('hr_assiduidade.rpc', 'on', true);

  UPDATE public.pessoas_horario_realizado
     SET estado = 'validado',
         validado_por = v_anew,
         validado_em = now(),
         motivo_rejeicao = NULL,
         updated_by = v_anew
   WHERE id = _realizado_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_realizado_validar(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_realizado_validar(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_realizado_validar(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_realizado_validar(uuid) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_realizado_validar(uuid) IS
'Valida um intervalo de tempo trabalhado, exigindo hr.pessoas.horario_realizado.validar -- a permissao que a ronda 2 criou e deixou decorativa, aqui finalmente verificada. Nao se cria uma permissao nova ao lado.

Recusa a AUTOVALIDACAO: ninguem valida as suas proprias horas. Sustentam um pagamento a propria pessoa, e confirma-las a si mesma esvazia a validacao de sentido.

O UPDATE passa pela sentinela hr_assiduidade.rpc, sem a qual o trigger de 20261121240000 recusaria a mudanca de estado.';

-- ==============================================================================
-- 2. rpc_hr_realizado_rejeitar
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_realizado_rejeitar(
  _realizado_id uuid,
  _motivo text
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_anew uuid;
  v_h    public.pessoas_horario_realizado;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'realizado_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;

  IF _motivo IS NULL OR btrim(_motivo) = '' THEN
    RAISE EXCEPTION
      'realizado_rejeicao_sem_motivo: rejeitar um registo de horas exige motivo escrito -- e o CHECK da ronda 2 tambem o exige.'
      USING ERRCODE = '23514';
  END IF;

  SELECT h.* INTO v_h FROM public.pessoas_horario_realizado h WHERE h.id = _realizado_id;
  IF v_h.id IS NULL THEN
    RAISE EXCEPTION 'realizado_inexistente: o intervalo % nao existe.', _realizado_id USING ERRCODE = '23503';
  END IF;

  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.pessoas.horario_realizado.validar', v_h.organization_id) THEN
    RAISE EXCEPTION
      'realizado_sem_permissao: rejeitar horas exige hr.pessoas.horario_realizado.validar nesta organizacao.'
      USING ERRCODE = '42501';
  END IF;

  IF v_h.estado = 'rejeitado' THEN
    RAISE EXCEPTION 'realizado_ja_rejeitado: o intervalo % ja esta rejeitado.', _realizado_id USING ERRCODE = '23514';
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;

  PERFORM set_config('hr_assiduidade.rpc', 'on', true);

  -- validado_por e validado_em vao a NULL pelo CHECK da ronda 2: uma linha
  -- rejeitada nao pode dizer que esta validada por alguem.
  UPDATE public.pessoas_horario_realizado
     SET estado = 'rejeitado',
         motivo_rejeicao = btrim(_motivo),
         validado_por = NULL,
         validado_em = NULL,
         updated_by = v_anew
   WHERE id = _realizado_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_realizado_rejeitar(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_realizado_rejeitar(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_realizado_rejeitar(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_realizado_rejeitar(uuid, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_realizado_rejeitar(uuid, text) IS
'Rejeita um registo de horas, com motivo obrigatorio, exigindo hr.pessoas.horario_realizado.validar. Poe validado_por e validado_em a NULL, porque o CHECK da ronda 2 nao deixa uma linha rejeitada dizer que esta validada por alguem.

Uma linha rejeitada fica isenta do trigger de nao-sobreposicao -- foi previsto na ronda 2 exactamente para permitir guardar o registo errado sem impedir o correcto.';

-- ==============================================================================
-- 3. A coluna estado fecha-se a escrita directa
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_realizado_estado_so_por_rpc()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.estado = OLD.estado THEN
    RETURN NEW;
  END IF;

  IF coalesce(current_setting('hr_assiduidade.rpc', true), '') <> 'on' THEN
    RAISE EXCEPTION
      'realizado_estado_fora_da_rpc: o estado de um registo de horas so muda de dentro das RPCs do modulo (rpc_hr_realizado_validar, rpc_hr_realizado_rejeitar, rpc_hr_realizado_corrigir). Um UPDATE directo nao passa, nem de service_role -- validar horas exige hr.pessoas.horario_realizado.validar, e a RLS de UPDATE so verifica .edit.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_realizado_estado_so_por_rpc() IS
'Fecha a coluna estado de pessoas_horario_realizado a escrita directa. E a metade que faltava para hr.pessoas.horario_realizado.validar deixar de ser decorativa: sem isto, a RLS de UPDATE -- que so exige .edit -- continuaria a autorizar estado=validado, e a RPC seria um caminho opcional.

Trigger e nao RLS pela razao de sempre neste modulo: as Edge Functions e o service_role escrevem fora das RPCs e fora da RLS. E porque a RLS do PostgreSQL e por linha e nao por COLUNA -- nao ha forma de autorizar o UPDATE das horas e negar o da coluna estado por politica.

QUEBRA DELIBERADA: quem escrevia estado=validado por UPDATE directo deixa de conseguir. Confirmar antes do push que nada em src/ o faz.';

DROP TRIGGER IF EXISTS trg_pessoas_horario_realizado_estado_fechado ON public.pessoas_horario_realizado;
CREATE TRIGGER trg_pessoas_horario_realizado_estado_fechado
  BEFORE UPDATE OF estado ON public.pessoas_horario_realizado
  FOR EACH ROW EXECUTE FUNCTION public.hr_realizado_estado_so_por_rpc();

-- E a nota fica na propria politica de UPDATE, para quem a ler daqui a um ano.
COMMENT ON POLICY pessoas_horario_realizado_update ON public.pessoas_horario_realizado IS
'Exige hr.pessoas.horario_realizado.edit, com USING e WITH CHECK ambos escritos.

JA NAO autoriza passar uma linha a estado=validado: desde 20261121240000, a coluna estado esta fechada a escrita directa por trigger, e validar exige hr.pessoas.horario_realizado.validar dentro de rpc_hr_realizado_validar. A lacuna que a ronda 2 assumiu esta fechada.

Esta politica continua a governar tudo o resto -- horas, local, vinculo, notas, soft delete.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_pol integer;
  v_f   text;
BEGIN
  FOREACH v_f IN ARRAY ARRAY[
    'rpc_hr_realizado_validar','rpc_hr_realizado_rejeitar','hr_realizado_estado_so_por_rpc'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = v_f
         AND p.prosecdef = true
         AND coalesce(array_to_string(p.proconfig, ','), '') LIKE '%search_path%'
    ) THEN
      RAISE EXCEPTION '% nao existe, ou nao e SECURITY DEFINER com search_path fixo.', v_f;
    END IF;
  END LOOP;

  -- A verificacao que e o ponto todo desta migracao: as RPCs tem de consultar a
  -- permissao da ronda 2, e nao .edit.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_realizado_validar'
       AND p.prosrc LIKE '%hr.pessoas.horario_realizado.validar%'
  ) THEN
    RAISE EXCEPTION
      'rpc_hr_realizado_validar nao verifica hr.pessoas.horario_realizado.validar. Era o unico objectivo desta migracao -- a permissao continuaria decorativa.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_realizado_rejeitar'
       AND p.prosrc LIKE '%hr.pessoas.horario_realizado.validar%'
  ) THEN
    RAISE EXCEPTION 'rpc_hr_realizado_rejeitar nao verifica hr.pessoas.horario_realizado.validar.';
  END IF;

  -- E o trigger tem de exigir a sentinela: sem isso, a RLS de .edit voltava a
  -- bastar para validar.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_realizado_estado_so_por_rpc'
       AND p.prosrc LIKE '%hr_assiduidade.rpc%'
  ) THEN
    RAISE EXCEPTION
      'hr_realizado_estado_so_por_rpc nao exige a sentinela. Sem ela, um UPDATE directo com .edit continuaria a validar horas.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = to_regclass('public.pessoas_horario_realizado')
       AND tgname = 'trg_pessoas_horario_realizado_estado_fechado' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'O trigger que fecha a coluna estado nao ficou criado.';
  END IF;

  -- As quatro politicas da ronda 2 continuam quatro: esta migracao nao mexe nelas.
  SELECT count(*) INTO v_pol FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_horario_realizado';
  IF v_pol <> 4 THEN
    RAISE EXCEPTION
      'Esperavam-se 4 politicas em pessoas_horario_realizado, encontraram-se %. Esta migracao nao mexe em politicas.', v_pol;
  END IF;

  IF has_function_privilege('anon', 'public.rpc_hr_realizado_validar(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon consegue executar rpc_hr_realizado_validar. O REVOKE nao pegou.';
  END IF;

  RAISE NOTICE 'Conferido: a permissao de validar da ronda 2 deixou de ser decorativa, e a coluna estado esta fechada.';
END;
$conferir$;
