-- ============================================================
-- Plano `internal`: limite de utilizadores (limit_type = 'users') em falta.
--
-- Sintoma: «Criar acesso» na ficha da pessoa falhava sempre com
-- "Nao foi possivel criar o acesso". Lido na base RH (nike): a criacao do
-- perfil (rpc_finalize_user_profile_full) rebenta com
-- `plan_limit_exceeded:users (no_plan_limit_configured)`, lancado pelo trigger
-- fn_enforce_user_seat_limit -> fn_check_seat_limit_excluding, que exige uma
-- linha em plan_limits para (plano da subscricao, 'users'). A nike tem a
-- subscricao `internal` activa e o plano `internal` so tinha as linhas
-- quotes / proposals / contracts (todas NULL = ilimitado).
--
-- Esta migration acrescenta ('internal', 'users', NULL = ilimitado), coerente
-- com as restantes linhas do plano. Nao altera linhas existentes
-- (ON CONFLICT DO NOTHING): se outra base ja tiver um valor para este par,
-- esse valor fica. Nao mexe em mais nenhum plano.
--
-- Nao precisa de codigo novo no ecra.
-- ============================================================

INSERT INTO public.plan_limits (plan, limit_type, limit_value, reset_cadence)
VALUES ('internal', 'users', NULL, 'none')
ON CONFLICT (plan, limit_type) DO NOTHING;

-- Conferir: a linha existe (a nossa ou a que ja la estava).
DO $conferir$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n
  FROM public.plan_limits
  WHERE plan = 'internal' AND limit_type = 'users';

  IF v_n <> 1 THEN
    RAISE EXCEPTION 'plan_limits(internal, users): esperava-se 1 linha e ha %.', v_n;
  END IF;
END
$conferir$;
