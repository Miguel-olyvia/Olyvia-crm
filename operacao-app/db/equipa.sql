-- ============================================================
--  Operações — a equipa é a equipa: nunca um cliente, e um menu por empresa
-- ============================================================
--  Correr DEPOIS de obras.sql e de pessoas-crm.sql. Idempotente.
--
--  Porquê (06/10/2026): na Mudelar, 8 "técnicos" e o supervisor de 16 obras
--  eram CLIENTES reais do CRM (membership role_is_client). Receberam avisos
--  das obras no sino e podiam ser escolhidos pela distribuição automática.
--
--  1. Um cliente (só cliente) de uma organização não pode ter perfil ATIVO
--     em Operações nessa organização. Trigger de recusa — vale para o ecrã,
--     para as RPCs e para SQL colado à mão. A distribuição e as "pessoas
--     livres" já só olham para perfis ativos, por isso ficam limpas também.
--  2. Menu por empresa: `ops_org_modulos` diz se a organização usa a
--     Manutenção (ordens, planos, locais) e as Obras. Sem linha, decide-se
--     pelo que existe (há ordens/planos/locais? há obras/modelos?).
--  3. "Entrar como" esquecido: os registos abertos há mais de 2 h fecham-se
--     sozinhos (pg_cron, se existir) — a app também volta sozinha à conta
--     do admin ao fim de 1 h.
--
--  Escreve fora de `ops_*`? NÃO (só lê anew_memberships).
-- ============================================================

BEGIN;

DO $pre$
BEGIN
  IF to_regclass('public.ops_utilizador_perfil') IS NULL OR to_regprocedure('public.ops_pode(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Faltam as tabelas de Operações — corre primeiro schema.sql, seguranca.sql e obras.sql.';
  END IF;
END
$pre$;

-- ── 1. Nunca um cliente na equipa ─────────────────────────────────────────
-- Cliente = tem membership ativa de cliente nesta organização e NENHUMA
-- membership ativa que não seja de cliente (quem é das duas coisas — um
-- colaborador que também é cliente — continua a poder ser da equipa).
-- Dinâmico: numa base sem a coluna role_is_client, ninguém é cliente.
CREATE OR REPLACE FUNCTION public.ops_e_cliente_so(_org uuid, _utilizador uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v boolean;
BEGIN
  IF _org IS NULL OR _utilizador IS NULL THEN
    RETURN false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'anew_memberships'
                    AND column_name = 'role_is_client') THEN
    RETURN false;
  END IF;
  EXECUTE $q$
    SELECT EXISTS (SELECT 1 FROM public.anew_memberships m
                    WHERE m.user_id = $2 AND m.organization_id = $1
                      AND m.status = 'active' AND m.role_is_client IS TRUE)
       AND NOT EXISTS (SELECT 1 FROM public.anew_memberships m
                        WHERE m.user_id = $2 AND m.organization_id = $1
                          AND m.status = 'active' AND m.role_is_client IS NOT TRUE)$q$
    INTO v USING _org, _utilizador;
  RETURN COALESCE(v, false);
END
$$;

REVOKE ALL ON FUNCTION public.ops_e_cliente_so(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ops_e_cliente_so(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ops_perfil_recusar_cliente()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.ativo AND public.ops_e_cliente_so(NEW.organization_id, NEW.utilizador_id) THEN
    RAISE EXCEPTION '% é cliente desta empresa no CRM — um cliente não pode fazer parte da equipa de Operações.',
      COALESCE((SELECT name FROM public.anew_users WHERE id = NEW.utilizador_id), 'Esta pessoa')
      USING ERRCODE = 'check_violation',
            HINT = 'Se a pessoa também trabalha para a empresa, dê-lhe primeiro no CRM um papel de colaborador (por exemplo "Técnico de Operações").';
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.ops_perfil_recusar_cliente() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ops_utilizador_perfil_sem_clientes ON public.ops_utilizador_perfil;
CREATE TRIGGER ops_utilizador_perfil_sem_clientes
  BEFORE INSERT OR UPDATE OF ativo, organization_id, utilizador_id ON public.ops_utilizador_perfil
  FOR EACH ROW EXECUTE FUNCTION public.ops_perfil_recusar_cliente();

-- Os perfis ativos de clientes que já existam (o caso da Mudelar) ficam
-- inativos — sem apagar o histórico. A atualização passa no trigger
-- (ativo = false).
UPDATE public.ops_utilizador_perfil p
   SET ativo = false, atualizado_em = now()
 WHERE p.ativo AND public.ops_e_cliente_so(p.organization_id, p.utilizador_id);

-- As especialidades de quem é só cliente deixam de contar.
DELETE FROM public.ops_utilizador_skill us
 USING public.ops_skill k
 WHERE k.id = us.skill_id
   AND public.ops_e_cliente_so(k.organization_id, us.utilizador_id);


-- ── 2. Menu por empresa ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ops_org_modulos (
  organization_id uuid PRIMARY KEY,
  manutencao      boolean,          -- NULL = decide pelo que existe
  obras           boolean,          -- NULL = decide pelo que existe
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  atualizado_por  uuid               -- → anew_users.id
);

ALTER TABLE public.ops_org_modulos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ops_org_modulos_ler ON public.ops_org_modulos;
CREATE POLICY ops_org_modulos_ler ON public.ops_org_modulos
  FOR SELECT TO authenticated
  USING (public.ops_pode(organization_id, 'operations.view'));
-- Escritas só pela RPC.
REVOKE INSERT, UPDATE, DELETE ON public.ops_org_modulos FROM authenticated, anon;

-- O que a organização usa: a escolha guardada e, sem ela, o que já existe.
-- Uma organização nova (sem nada) vê tudo — melhor do que um menu vazio.
CREATE OR REPLACE FUNCTION public.rpc_ops_modulos(p_org uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cfg    record;
  v_tem_m  boolean;
  v_tem_o  boolean;
  v_man    boolean;
  v_obr    boolean;
BEGIN
  IF NOT public.ops_pode(p_org, 'operations.view') THEN
    RAISE EXCEPTION 'Sem acesso a Operações nesta organização.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT manutencao, obras INTO v_cfg FROM public.ops_org_modulos WHERE organization_id = p_org;

  v_tem_m := EXISTS (SELECT 1 FROM public.ops_ordem WHERE organization_id = p_org AND COALESCE(origem, '') <> 'obra')
          OR EXISTS (SELECT 1 FROM public.ops_plano WHERE organization_id = p_org)
          OR EXISTS (SELECT 1 FROM public.ops_local WHERE organization_id = p_org);
  v_tem_o := (to_regclass('public.ops_obra') IS NOT NULL
              AND EXISTS (SELECT 1 FROM public.ops_obra WHERE organization_id = p_org))
          OR (to_regclass('public.ops_obra_servico_tarefa') IS NOT NULL
              AND EXISTS (SELECT 1 FROM public.ops_obra_servico_tarefa WHERE organization_id = p_org));

  v_man := COALESCE(v_cfg.manutencao, v_tem_m OR NOT v_tem_o);
  v_obr := COALESCE(v_cfg.obras, v_tem_o OR NOT v_tem_m);
  -- Nunca as duas desligadas: o menu ficava só com "Hoje".
  IF NOT v_man AND NOT v_obr THEN
    v_man := true; v_obr := true;
  END IF;

  RETURN jsonb_build_object(
    'manutencao', v_man,
    'obras', v_obr,
    'escolhido', jsonb_build_object('manutencao', v_cfg.manutencao, 'obras', v_cfg.obras),
    'existe', jsonb_build_object('manutencao', v_tem_m, 'obras', v_tem_o));
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_modulos(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_modulos(uuid) TO authenticated, service_role;

-- Gravar a escolha (NULL = automático). Só quem gere as definições.
CREATE OR REPLACE FUNCTION public.rpc_ops_gravar_modulos(p_org uuid, p_manutencao boolean, p_obras boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_eu uuid;
  v_funcao text;
BEGIN
  SELECT q.utilizador_id, q.funcao INTO v_eu, v_funcao FROM public.ops_quem_sou(p_org) q;
  IF NOT public.ops_pode(p_org, 'operations.settings.manage')
     OR COALESCE(v_funcao, '') NOT IN ('admin','gestor') THEN
    RAISE EXCEPTION 'Só um administrador ou gestor muda o que a empresa usa.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_manutencao IS FALSE AND p_obras IS FALSE THEN
    RAISE EXCEPTION 'Tem de ficar pelo menos uma área ligada (Manutenção ou Obras).';
  END IF;

  INSERT INTO public.ops_org_modulos (organization_id, manutencao, obras, atualizado_em, atualizado_por)
  VALUES (p_org, p_manutencao, p_obras, now(), v_eu)
  ON CONFLICT (organization_id) DO UPDATE
     SET manutencao = EXCLUDED.manutencao, obras = EXCLUDED.obras,
         atualizado_em = now(), atualizado_por = EXCLUDED.atualizado_por;

  RETURN public.rpc_ops_modulos(p_org);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_gravar_modulos(uuid, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_gravar_modulos(uuid, boolean, boolean) TO authenticated, service_role;


-- ── 3. "Entrar como" esquecido ────────────────────────────────────────────
-- Uma entrada sem fim há mais de 2 h fecha-se com fim = início + 2 h (a app
-- volta sozinha ao fim de 1 h; isto apanha separadores fechados a meio).
CREATE OR REPLACE FUNCTION public.ops_entrar_como_fechar_antigos()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_n integer := 0;
BEGIN
  IF to_regclass('public.ops_entrar_como_log') IS NULL THEN
    RETURN 0;
  END IF;
  UPDATE public.ops_entrar_como_log
     SET fim = inicio + interval '2 hours'
   WHERE fim IS NULL AND inicio < now() - interval '2 hours';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END
$$;

REVOKE ALL ON FUNCTION public.ops_entrar_como_fechar_antigos() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_entrar_como_fechar_antigos() TO service_role;

SELECT public.ops_entrar_como_fechar_antigos();

-- De hora a hora, se houver pg_cron (na produção há).
DO $cron$
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'ops-entrar-como-fechar';
    PERFORM cron.schedule('ops-entrar-como-fechar', '7 * * * *',
                          'SELECT public.ops_entrar_como_fechar_antigos()');
  END IF;
END
$cron$;

COMMIT;

-- Verificação: quantos clientes ainda ativos (tem de dar 0).
SELECT count(*) AS clientes_ativos_em_operacoes
  FROM public.ops_utilizador_perfil p
 WHERE p.ativo AND public.ops_e_cliente_so(p.organization_id, p.utilizador_id);
