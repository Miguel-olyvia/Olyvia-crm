-- ============================================================
--  Operações — "Entrar como" (o admin vê e usa a app como outra pessoa)
-- ============================================================
--  Correr DEPOIS de: seguranca.sql.
--  Usado pela edge function `ops-entrar-como` (supabase/functions).
--
--  Para quê: testar o que um técnico ou supervisor vê e consegue fazer —
--  as tarefas que lhe aparecem, a morada, as fotos, a validação — sem lhe
--  pedir a palavra-passe.
--
--  É uma sessão a sério da outra pessoa: o que se faz fica feito em nome
--  dela. Por isso as regras são apertadas, e TODAS verificadas aqui, com a
--  identidade de quem pede (auth.uid() = o admin), antes de a edge function
--  gerar a sessão:
--
--   1. quem pede é ADMIN de Operações NESTA organização;
--   2. a pessoa não é quem pede, tem perfil ATIVO de Operações aqui, e a
--      função dela é abaixo de admin;
--   3. a pessoa não é admin de sistema;
--   4. a pessoa não tem acesso a NADA que quem pede não tenha: cada
--      membership ativa dela é numa organização onde quem pede também tem
--      membership ativa, com um papel que inclui TODAS as permissões do
--      papel dela. (Sem isto, entrar como alguém seria uma maneira de
--      ganhar permissões do CRM ou ver outras empresas.)
--
--  Cada entrada fica registada em `ops_entrar_como_log` (quem, como quem,
--  quando entrou e saiu). Só se escreve pela edge function (service_role) e
--  por `rpc_ops_entrar_como_terminar`; lê o admin da organização.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.ops_entrar_como_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL,
  admin_id         uuid NOT NULL,   -- → anew_users.id (quem entrou)
  alvo_id          uuid NOT NULL,   -- → anew_users.id (como quem)
  inicio           timestamptz NOT NULL DEFAULT now(),
  fim              timestamptz,
  user_agent       text
);

CREATE INDEX IF NOT EXISTS ops_entrar_como_log_org_idx
  ON public.ops_entrar_como_log (organization_id, inicio DESC);

ALTER TABLE public.ops_entrar_como_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ops_entrar_como_log_ler ON public.ops_entrar_como_log;
CREATE POLICY ops_entrar_como_log_ler ON public.ops_entrar_como_log
  FOR SELECT TO authenticated
  USING (public.ops_funcao_atual(organization_id) = 'admin');

REVOKE ALL ON public.ops_entrar_como_log FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.ops_entrar_como_log FROM authenticated;
GRANT SELECT ON public.ops_entrar_como_log TO authenticated;
GRANT ALL ON public.ops_entrar_como_log TO service_role;


-- ── A verificação (chamada com a sessão do admin) ──────────────────────────
CREATE OR REPLACE FUNCTION public.ops_entrar_como_verificar(p_org uuid, p_alvo uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_eu       uuid;
  v_funcao   text;
  v_alvo     record;
  v_falta    text;
BEGIN
  SELECT q.utilizador_id, q.funcao INTO v_eu, v_funcao FROM public.ops_quem_sou(p_org) q;

  IF v_funcao IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Só o admin de Operações pode entrar como outra pessoa.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_alvo = v_eu THEN
    RAISE EXCEPTION 'Já estás na tua conta.';
  END IF;

  SELECT u.id, u.auth_user_id, u.email, u.name, p.funcao
    INTO v_alvo
    FROM public.anew_users u
    JOIN public.ops_utilizador_perfil p
      ON p.utilizador_id = u.id AND p.organization_id = p_org AND p.ativo
   WHERE u.id = p_alvo AND u.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Essa pessoa não tem perfil ativo de Operações nesta organização.';
  END IF;
  IF v_alvo.auth_user_id IS NULL OR coalesce(v_alvo.email, '') = '' THEN
    RAISE EXCEPTION 'Essa pessoa não tem conta de acesso (sem email/login).';
  END IF;
  IF public.ops_nivel_funcao(v_alvo.funcao) <= public.ops_nivel_funcao('admin') THEN
    RAISE EXCEPTION 'Não se entra como outro admin.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF public.is_system_admin_user(v_alvo.auth_user_id) THEN
    RAISE EXCEPTION 'Não se entra como um admin de sistema.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 4. Nada que eu não tenha. O admin de sistema tem tudo.
  IF NOT public.is_system_admin_user((SELECT auth.uid())) THEN
    SELECT string_agg(DISTINCT coalesce(o.name, ma.organization_id::text), ', ')
      INTO v_falta
      FROM public.anew_memberships ma
      LEFT JOIN public.anew_organizations o ON o.id = ma.organization_id
     WHERE ma.user_id = p_alvo AND ma.status = 'active'
       AND NOT EXISTS (
         SELECT 1 FROM public.anew_memberships me
          WHERE me.user_id = v_eu AND me.status = 'active'
            AND me.organization_id = ma.organization_id
            AND NOT EXISTS (
              SELECT 1 FROM public.anew_role_permissions rpa
               WHERE rpa.role_id = ma.role_id
                 AND NOT EXISTS (
                   SELECT 1 FROM public.anew_role_permissions rpe
                    WHERE rpe.role_id = me.role_id
                      AND rpe.permission_code = rpa.permission_code)));
    IF v_falta IS NOT NULL THEN
      RAISE EXCEPTION 'Essa pessoa tem acessos que tu não tens (em: %). Não podes entrar como ela.', v_falta
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'admin_id', v_eu,
    'alvo_id', v_alvo.id,
    'auth_user_id', v_alvo.auth_user_id,
    'email', v_alvo.email,
    'nome', v_alvo.name,
    'funcao', v_alvo.funcao);
END
$$;

REVOKE ALL ON FUNCTION public.ops_entrar_como_verificar(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ops_entrar_como_verificar(uuid, uuid) TO authenticated, service_role;


-- ── Fechar o registo ao voltar (chamada já com a sessão do admin) ──────────
CREATE OR REPLACE FUNCTION public.rpc_ops_entrar_como_terminar(p_log_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_n integer;
BEGIN
  UPDATE public.ops_entrar_como_log
     SET fim = now()
   WHERE id = p_log_id
     AND admin_id = public.current_business_user_id()
     AND fim IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok', v_n > 0);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_entrar_como_terminar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_entrar_como_terminar(uuid) TO authenticated, service_role;

COMMIT;
