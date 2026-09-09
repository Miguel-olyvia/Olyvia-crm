-- ==============================================================================
-- A guarda dos 20 dias uteis, e as RPCs de ajuste de saldo.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- A troca de dias de ferias por dinheiro tem um limite legal: nao se pode
-- deixar o trabalhador com menos de 20 dias uteis gozaveis. Nao ha nada na base
-- a impedi-lo, e a tabela de ajustes de 20261121040000 aceita qualquer numero
-- negativo.
--
--
-- -- A REGRA NOVA: TRIGGER, E RECUSA -----------------------------------------
--
-- hr_ausencias_minimo_legal_ferias(), BEFORE INSERT OR UPDATE em
-- pessoas_ausencias_ajustes. RAISE EXCEPTION -- recusa, nao avisa.
--
-- Porque nao um CHECK: um CHECK ve a LINHA, e a regra e um agregado sobre o
-- direito do periodo e todos os ajustes anteriores.
--
-- Porque nao SO na RPC: as Edge Functions e o service_role escrevem fora das
-- RPCs, e uma regra legal que se contorna com um insert directo nao e uma
-- regra. O trigger esta no unico sitio por onde toda a escrita passa. A mesma
-- verificacao repete-se no inicio da RPC, e SO para dar a mensagem cedo -- nao
-- e ela que garante nada.
--
-- O que se avalia e o direito GOZAVEL e nao o gozado:
--
--   gozavel = direito do periodo + ajustes POSITIVOS - dias VENDIDOS
--
-- No momento da troca ainda nao ha forma de saber o que a pessoa vai gozar ate
-- Dezembro. Recusar quando o gozavel desce abaixo de 20 fecha a porta agora, em
-- vez de a fechar tarde, quando ja nao ha dias para repor.
--
-- So corre quando o tipo tem conta_minimo_legal = true. Um tipo de doenca ou de
-- compensacao nao tem minimo legal de ferias, e aplicar-lhe a guarda seria
-- inventar uma regra que a lei nao tem.
--
--
-- -- O SEGUNDO CAMINHO, QUE E O MESMO TRIGGER ---------------------------------
--
-- O desenho falava de um segundo trigger para o cancelamento retroactivo de
-- dias aprovados. Nao se escreve, e a razao fica aqui para nao ser tomada por
-- esquecimento: cancelar um dia APROVADO nao reduz o gozavel -- reduz o
-- UTILIZADO, e portanto AUMENTA o disponivel. Nao ha nada a recusar nesse
-- sentido.
--
-- O caminho que reduz o gozavel para tras e outro, e esta coberto: ANULAR um
-- ajuste POSITIVO tira dias adquiridos e pode empurrar o gozavel abaixo de 20.
-- O trigger e BEFORE INSERT OR UPDATE precisamente por isso -- a anulacao e um
-- UPDATE, e passa pela mesma verificacao. Um trigger a mais em
-- pessoas_ausencias_dias verificaria uma condicao que nunca pode falhar.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - O valor 20 esta escrito na funcao e nao numa tabela de configuracao. E o
--   minimo do Codigo do Trabalho portugues, nao uma preferencia de
--   organizacao; torna-lo configuravel seria oferecer a possibilidade de o
--   baixar.
-- - Nao se verifica o minimo contra o gozado efectivo em Dezembro: isso e uma
--   verificacao de fim de periodo que exige decisao de produto sobre o que
--   fazer quando falha.
-- - Nao se toca em pessoas_vinculos nem em pessoas_retribuicoes.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP FUNCTION public.rpc_hr_ausencia_anular_ajuste(uuid, text);
--   DROP FUNCTION public.rpc_hr_ausencia_ajustar_saldo(uuid, uuid, uuid, date, date, numeric, text, text, text);
--   DROP TRIGGER trg_pessoas_ausencias_ajustes_minimo_legal ON public.pessoas_ausencias_ajustes;
--   DROP FUNCTION public.hr_ausencias_minimo_legal_ferias();
--
--
-- Prerequisitos:
--   20261121040000  pessoas_ausencias_ajustes
--   20261121030000  pessoas_ausencias_direitos
--   20261121020000  hr_ausencias_tipos (conta_minimo_legal)
--   20261121010000  hr.ausencias.ajustar no catalogo
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas_ausencias_ajustes') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_ausencias_ajustes nao existe. Aplicar 20261121040000 primeiro.';
  END IF;
  IF to_regclass('public.pessoas_ausencias_direitos') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_ausencias_direitos nao existe. Aplicar 20261121030000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'hr_ausencias_tipos'
       AND column_name = 'conta_minimo_legal'
  ) THEN
    RAISE EXCEPTION
      'hr_ausencias_tipos nao tem conta_minimo_legal. E o campo que liga o tipo a esta guarda; sem ele a guarda nao sabe a que tipos se aplica.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.ausencias.ajustar') THEN
    RAISE EXCEPTION 'hr.ausencias.ajustar nao esta no catalogo. Aplicar 20261121010000 primeiro.';
  END IF;
END;
$guardas$;

-- ---- A guarda legal --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_ausencias_minimo_legal_ferias()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_conta       boolean;
  v_direito     numeric(12,2);
  v_positivos   numeric(12,2);
  v_vendidos    numeric(12,2);
  v_gozavel     numeric(12,2);
BEGIN
  SELECT t.conta_minimo_legal INTO v_conta
    FROM public.hr_ausencias_tipos t
   WHERE t.id = NEW.tipo_id AND t.organization_id = NEW.organization_id;

  -- Um tipo de doenca ou de compensacao nao tem minimo legal de ferias.
  IF coalesce(v_conta, false) = false THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(sum(d.dias_direito), 0)
    INTO v_direito
    FROM public.pessoas_ausencias_direitos d
   WHERE d.pessoa_id = NEW.pessoa_id
     AND d.organization_id = NEW.organization_id
     AND d.tipo_id = NEW.tipo_id
     AND d.periodo_inicio = NEW.periodo_inicio
     AND d.deleted_at IS NULL;

  -- Os ajustes JA na tabela, sem a linha que esta a entrar ou a mudar.
  SELECT
    coalesce(sum(a.dias) FILTER (WHERE a.dias > 0), 0),
    coalesce(sum(-a.dias) FILTER (WHERE a.motivo_codigo = 'troca_por_dinheiro'), 0)
    INTO v_positivos, v_vendidos
    FROM public.pessoas_ausencias_ajustes a
   WHERE a.pessoa_id = NEW.pessoa_id
     AND a.organization_id = NEW.organization_id
     AND a.tipo_id = NEW.tipo_id
     AND a.periodo_inicio = NEW.periodo_inicio
     AND a.anulado_em IS NULL
     AND a.id <> NEW.id;

  -- E a contribuicao da propria linha, se ela ficar activa.
  IF NEW.anulado_em IS NULL THEN
    IF NEW.dias > 0 THEN
      v_positivos := v_positivos + NEW.dias;
    END IF;
    IF NEW.motivo_codigo = 'troca_por_dinheiro' THEN
      v_vendidos := v_vendidos + (-NEW.dias);
    END IF;
  END IF;

  v_gozavel := v_direito + v_positivos - v_vendidos;

  IF v_gozavel < 20.00 THEN
    -- %% para o literal por cento; o valor entra por to_char no proprio texto.
    RAISE EXCEPTION
      'ferias_minimo_legal: a operacao deixaria % dias gozaveis no periodo que comeca em %, e o minimo legal e 20 dias uteis. 100%% do direito minimo tem de ficar disponivel para gozo: reduzir a troca por dinheiro, ou aumentar o direito do periodo.',
      to_char(v_gozavel, 'FM990.00'), NEW.periodo_inicio
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_ausencias_minimo_legal_ferias() IS
'Recusa qualquer ajuste que deixe menos de 20 dias uteis GOZAVEIS no periodo, nos tipos com conta_minimo_legal=true.

gozavel = direito do periodo + ajustes positivos - dias vendidos. Avalia-se o gozavel e nao o gozado porque no momento da troca ainda nao ha forma de saber o que a pessoa vai gozar ate Dezembro -- e recusar agora fecha a porta antes de nao haver dias para repor.

Trigger e nao CHECK porque um CHECK ve uma linha e isto e um agregado; trigger e nao apenas RPC porque as Edge Functions e o service_role escrevem fora das RPCs, e uma regra legal que se contorna com um insert directo nao e uma regra.

BEFORE INSERT OR UPDATE de proposito: ANULAR um ajuste positivo tira dias adquiridos e pode empurrar o gozavel abaixo de 20, e a anulacao e um UPDATE. Nao ha trigger em pessoas_ausencias_dias porque cancelar um dia aprovado reduz o UTILIZADO e nao o gozavel -- verificaria uma condicao que nunca pode falhar.

SECURITY DEFINER: sob RLS de invocador nao veria os ajustes existentes e o agregado sairia errado por defeito.';

DROP TRIGGER IF EXISTS trg_pessoas_ausencias_ajustes_minimo_legal ON public.pessoas_ausencias_ajustes;
CREATE TRIGGER trg_pessoas_ausencias_ajustes_minimo_legal
  BEFORE INSERT OR UPDATE ON public.pessoas_ausencias_ajustes
  FOR EACH ROW EXECUTE FUNCTION public.hr_ausencias_minimo_legal_ferias();

-- ---- rpc_hr_ausencia_ajustar_saldo -----------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_hr_ausencia_ajustar_saldo(
  _organization_id uuid,
  _pessoa_id uuid,
  _tipo_id uuid,
  _periodo_inicio date,
  _periodo_fim date,
  _dias numeric,
  _motivo_codigo text,
  _motivo text,
  _documento_ref text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth      uuid := auth.uid();
  v_anew      uuid;
  v_id        uuid;
  v_conta     boolean;
  v_direito   numeric(12,2);
  v_positivos numeric(12,2);
  v_vendidos  numeric(12,2);
  v_gozavel   numeric(12,2);
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'ausencia_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.ausencias.ajustar', _organization_id) THEN
    RAISE EXCEPTION
      'ausencia_sem_permissao: ajustar o saldo exige hr.ausencias.ajustar nesta organizacao. Definir o direito anual (hr.ausencias.direitos.edit) e outra autoridade.'
      USING ERRCODE = '42501';
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;

  IF v_anew IS NULL THEN
    RAISE EXCEPTION
      'ausencia_sem_ficha_de_utilizador: a sessao nao corresponde a um anew_users. Um ajuste sem autor nao e auditavel.'
      USING ERRCODE = '42501';
  END IF;

  IF _motivo IS NULL OR btrim(_motivo) = '' THEN
    RAISE EXCEPTION
      'ausencia_ajuste_sem_motivo: um ajuste ao contador exige motivo escrito. E o rasto de quem ajustou e porque.'
      USING ERRCODE = '23514';
  END IF;

  IF _dias IS NULL OR _dias = 0 THEN
    RAISE EXCEPTION 'ausencia_ajuste_zero: um ajuste de zero dias nao e um ajuste.' USING ERRCODE = '23514';
  END IF;

  -- A MESMA verificacao do trigger, repetida aqui SO para dar a mensagem cedo,
  -- antes de o insert falhar. Nao e esta que garante nada: e o trigger.
  SELECT t.conta_minimo_legal INTO v_conta
    FROM public.hr_ausencias_tipos t
   WHERE t.id = _tipo_id AND t.organization_id = _organization_id;

  IF coalesce(v_conta, false) = true THEN
    SELECT coalesce(sum(d.dias_direito), 0) INTO v_direito
      FROM public.pessoas_ausencias_direitos d
     WHERE d.pessoa_id = _pessoa_id AND d.organization_id = _organization_id
       AND d.tipo_id = _tipo_id AND d.periodo_inicio = _periodo_inicio
       AND d.deleted_at IS NULL;

    SELECT
      coalesce(sum(a.dias) FILTER (WHERE a.dias > 0), 0),
      coalesce(sum(-a.dias) FILTER (WHERE a.motivo_codigo = 'troca_por_dinheiro'), 0)
      INTO v_positivos, v_vendidos
      FROM public.pessoas_ausencias_ajustes a
     WHERE a.pessoa_id = _pessoa_id AND a.organization_id = _organization_id
       AND a.tipo_id = _tipo_id AND a.periodo_inicio = _periodo_inicio
       AND a.anulado_em IS NULL;

    IF _dias > 0 THEN v_positivos := v_positivos + _dias; END IF;
    IF _motivo_codigo = 'troca_por_dinheiro' THEN v_vendidos := v_vendidos + (-_dias); END IF;

    v_gozavel := v_direito + v_positivos - v_vendidos;

    IF v_gozavel < 20.00 THEN
      RAISE EXCEPTION
        'ferias_minimo_legal: este ajuste deixaria % dias gozaveis no periodo que comeca em %, e o minimo legal e 20 dias uteis.',
        to_char(v_gozavel, 'FM990.00'), _periodo_inicio
        USING ERRCODE = '23514';
    END IF;
  END IF;

  INSERT INTO public.pessoas_ausencias_ajustes (
    pessoa_id, organization_id, tipo_id, periodo_inicio, periodo_fim,
    dias, motivo_codigo, motivo, documento_ref,
    aplicado_por_anew_user_id, created_by
  ) VALUES (
    _pessoa_id, _organization_id, _tipo_id, _periodo_inicio, _periodo_fim,
    _dias, _motivo_codigo, btrim(_motivo), _documento_ref,
    v_anew, v_anew
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_ausencia_ajustar_saldo(uuid, uuid, uuid, date, date, numeric, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_ausencia_ajustar_saldo(uuid, uuid, uuid, date, date, numeric, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_ausencia_ajustar_saldo(uuid, uuid, uuid, date, date, numeric, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_ausencia_ajustar_saldo(uuid, uuid, uuid, date, date, numeric, text, text, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_ausencia_ajustar_saldo(uuid, uuid, uuid, date, date, numeric, text, text, text) IS
'O UNICO caminho para ajustar o contador de ausencias. Exige hr.ausencias.ajustar -- separada de hr.ausencias.direitos.edit de proposito: definir o direito anual de alguem e subtrair-lhe dias do contador sao autoridades diferentes.

Exige motivo escrito e grava o autor. A troca de ferias por dinheiro entra por aqui, como ajuste NEGATIVO com motivo_codigo=troca_por_dinheiro, e passa pela guarda dos 20 dias uteis.

A verificacao do minimo legal esta repetida aqui SO para dar a mensagem cedo. Quem garante e o trigger.';

-- ---- rpc_hr_ausencia_anular_ajuste -----------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_hr_ausencia_anular_ajuste(
  _ajuste_id uuid,
  _motivo text
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_anew uuid;
  v_aj   public.pessoas_ausencias_ajustes;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'ausencia_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;

  IF _motivo IS NULL OR btrim(_motivo) = '' THEN
    RAISE EXCEPTION 'ausencia_anulacao_sem_motivo: anular um ajuste exige motivo escrito.' USING ERRCODE = '23514';
  END IF;

  SELECT a.* INTO v_aj FROM public.pessoas_ausencias_ajustes a WHERE a.id = _ajuste_id;
  IF v_aj.id IS NULL THEN
    RAISE EXCEPTION 'ausencia_ajuste_inexistente: o ajuste % nao existe.', _ajuste_id USING ERRCODE = '23503';
  END IF;

  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.ausencias.ajustar', v_aj.organization_id) THEN
    RAISE EXCEPTION
      'ausencia_sem_permissao: anular um ajuste exige hr.ausencias.ajustar nesta organizacao.'
      USING ERRCODE = '42501';
  END IF;

  IF v_aj.anulado_em IS NOT NULL THEN
    RAISE EXCEPTION
      'ausencia_ajuste_ja_anulado: o ajuste % ja foi anulado em %. Nao se anula duas vezes -- corrigir e aplicar outro ajuste.',
      _ajuste_id, v_aj.anulado_em
      USING ERRCODE = '23514';
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;
  IF v_anew IS NULL THEN
    RAISE EXCEPTION 'ausencia_sem_ficha_de_utilizador: a sessao nao corresponde a um anew_users.' USING ERRCODE = '42501';
  END IF;

  -- O trigger do minimo legal corre neste UPDATE: anular um ajuste POSITIVO
  -- tira dias adquiridos e pode empurrar o gozavel abaixo de 20.
  UPDATE public.pessoas_ausencias_ajustes
     SET anulado_em = now(),
         anulado_por_anew_user_id = v_anew,
         anulacao_motivo = btrim(_motivo)
   WHERE id = _ajuste_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_ausencia_anular_ajuste(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_ausencia_anular_ajuste(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_ausencia_anular_ajuste(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_ausencia_anular_ajuste(uuid, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_ausencia_anular_ajuste(uuid, text) IS
'Anula um ajuste, com autor e motivo. Nao APAGA: a linha original fica, e e o rasto de que houve um ajuste e de que foi desfeito.

O trigger do minimo legal corre neste UPDATE, e e deliberado: anular um ajuste POSITIVO tira dias adquiridos e pode deixar o gozavel abaixo de 20 -- caso em que a anulacao e recusada.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_sec  boolean;
  v_path text;
  v_tg   integer;
BEGIN
  SELECT p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '')
    INTO v_sec, v_path
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'hr_ausencias_minimo_legal_ferias';

  IF v_sec IS NULL THEN
    RAISE EXCEPTION 'hr_ausencias_minimo_legal_ferias nao ficou criada.';
  END IF;
  IF v_sec IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'hr_ausencias_minimo_legal_ferias nao e SECURITY DEFINER. Sob RLS de invocador nao veria os ajustes existentes e o agregado sairia errado por defeito.';
  END IF;
  IF v_path NOT LIKE '%search_path%' THEN
    RAISE EXCEPTION 'hr_ausencias_minimo_legal_ferias ficou sem search_path fixo.';
  END IF;

  -- O trigger tem de correr no INSERT **e** no UPDATE: a anulacao e um UPDATE,
  -- e e por ela que o gozavel pode cair para tras.
  SELECT count(*) INTO v_tg
    FROM pg_trigger
   WHERE tgrelid = to_regclass('public.pessoas_ausencias_ajustes')
     AND tgname = 'trg_pessoas_ausencias_ajustes_minimo_legal'
     AND NOT tgisinternal
     -- tgtype: bit 2 = BEFORE, bit 4 = INSERT, bit 16 = UPDATE
     AND (tgtype & 4) <> 0
     AND (tgtype & 16) <> 0;

  IF v_tg <> 1 THEN
    RAISE EXCEPTION
      'O trigger do minimo legal nao esta em BEFORE INSERT OR UPDATE. Sem o UPDATE, anular um ajuste positivo escapava a guarda.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_ausencia_ajustar_saldo' AND p.pronargs = 9
  ) THEN
    RAISE EXCEPTION 'rpc_hr_ausencia_ajustar_saldo nao ficou criada com 9 argumentos.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_ausencia_anular_ajuste' AND p.pronargs = 2
  ) THEN
    RAISE EXCEPTION 'rpc_hr_ausencia_anular_ajuste nao ficou criada com 2 argumentos.';
  END IF;

  IF has_function_privilege('anon', 'public.rpc_hr_ausencia_ajustar_saldo(uuid, uuid, uuid, date, date, numeric, text, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon consegue executar rpc_hr_ausencia_ajustar_saldo. O REVOKE nao pegou.';
  END IF;

  RAISE NOTICE 'Conferido: guarda dos 20 dias uteis em BEFORE INSERT OR UPDATE, e as duas RPCs de ajuste.';
END;
$conferir$;
