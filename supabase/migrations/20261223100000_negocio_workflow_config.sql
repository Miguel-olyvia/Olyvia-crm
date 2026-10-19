-- ============================================================
-- 20261223100000_negocio_workflow_config
-- ============================================================
-- O que faz: cria a tabela NOVA public.negocio_workflow_config (uma linha
--   por organização: momento_ganho = manual | proposta_aceite |
--   contrato_assinado) e insere a linha da nike
--   (b6ffce4f-f630-4933-833a-008649757a33) com 'contrato_assinado'.
--   Sem linha, a organização fica com a página Pessoas FECHADA para escrita
--   (as funções neg_* das migrations seguintes recusam com NG008). Nenhuma
--   outra organização recebe linha; a Mudelar fica sem linha.
-- SÓ ACRESCENTA: nenhuma tabela, função, trigger, política ou configuração
--   existente é alterada. Os três triggers novos são da tabela nova. Escreve
--   uma linha em entity_audit_log (auditoria genérica da linha da nike).
-- Leitura pela API: quem tem pessoas.view na organização. Escrita pela API:
--   nenhuma (só migrations e service_role nesta fase).
-- BLOQUEIO: as chaves estrangeiras pedem SHARE ROW EXCLUSIVE em
--   anew_organizations e anew_users até ao COMMIT (escritas nessas tabelas
--   esperam uma fracção de segundo). Pedidos no início com NOWAIT (10
--   tentativas de 250 ms); se não conseguir, desiste sem nada criado.
-- MUDELAR: nenhum dado nem permissão; só o bloqueio acima.
-- PRECISA DE CÓDIGO: a UI lê a regra (select a esta tabela) para mostrar ou
--   esconder "Dar como ganho"; sem linha, a página Pessoas mostra-se só de
--   leitura. Regenerar os tipos do Supabase.
-- Reversão: fora da pasta das migrations (não aplicar sem decisão).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '60s';
-- Os md5 do CONFERIR foram lidos com este search_path; o DDL é qualificado.
SET LOCAL search_path = public, extensions;

DO $$
DECLARE
  v_tentativa int := 0;
BEGIN
  LOOP
    v_tentativa := v_tentativa + 1;
    BEGIN
      LOCK TABLE public.anew_organizations IN SHARE ROW EXCLUSIVE MODE NOWAIT;
      LOCK TABLE public.anew_users         IN SHARE ROW EXCLUSIVE MODE NOWAIT;
      EXIT;
    EXCEPTION WHEN lock_not_available THEN
      IF v_tentativa >= 10 THEN
        RAISE EXCEPTION 'Tabelas partilhadas ocupadas: voltar a tentar mais tarde (% tentativas).', v_tentativa
          USING ERRCODE = 'lock_not_available';
      END IF;
      PERFORM pg_sleep(0.25);
    END;
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.negocio_workflow_config') IS NOT NULL THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: negocio_workflow_config já existe; nada feito.';
  END IF;
END;
$$;

CREATE TABLE public.negocio_workflow_config (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL,
  momento_ganho   text        NOT NULL DEFAULT 'manual',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid        NULL,
  updated_by      uuid        NULL,

  CONSTRAINT negocio_workflow_config_pkey PRIMARY KEY (id),
  CONSTRAINT negocio_workflow_config_organization_id_key UNIQUE (organization_id),
  CONSTRAINT negocio_workflow_config_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.anew_organizations(id) ON DELETE RESTRICT,
  CONSTRAINT negocio_workflow_config_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users(id) ON DELETE SET NULL,
  CONSTRAINT negocio_workflow_config_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users(id) ON DELETE SET NULL,
  CONSTRAINT negocio_workflow_config_momento_ganho_check
    CHECK (momento_ganho IN ('manual', 'proposta_aceite', 'contrato_assinado'))
);

CREATE INDEX idx_negocio_workflow_config_created_by ON public.negocio_workflow_config (created_by);
CREATE INDEX idx_negocio_workflow_config_updated_by ON public.negocio_workflow_config (updated_by);

-- created_by/updated_by escritos pela base (não pelo cliente); a organização
-- e a criação ficam fixas.
CREATE FUNCTION public.fn_negocio_workflow_config_preparar()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := public.fn_negocios_actor();
    NEW.created_at := now();
  ELSE
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'Não é possível mudar a organização de uma configuração.'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.created_by := CASE
      WHEN public.fn_negocios_ref_utilizador_apagado(OLD.created_by, NEW.created_by) THEN NULL
      ELSE OLD.created_by END;
    NEW.created_at := OLD.created_at;
  END IF;
  -- Quem executa (nulo sem sessão: migrations, service_role).
  NEW.updated_by := public.fn_negocios_actor();
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_negocio_workflow_config_preparar() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_negocio_workflow_config_preparar() TO service_role;

CREATE TRIGGER trg_00_negocio_workflow_config_preparar
  BEFORE INSERT OR UPDATE ON public.negocio_workflow_config
  FOR EACH ROW EXECUTE FUNCTION public.fn_negocio_workflow_config_preparar();

CREATE TRIGGER trg_negocio_workflow_config_updated_at
  BEFORE UPDATE ON public.negocio_workflow_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Quem muda a regra do ganho fica registado (a tabela não tem dados pessoais).
CREATE TRIGGER trg_audit_negocio_workflow_config
  AFTER INSERT OR UPDATE ON public.negocio_workflow_config
  FOR EACH ROW EXECUTE FUNCTION public.fn_generic_entity_audit();

REVOKE ALL ON TABLE public.negocio_workflow_config FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.negocio_workflow_config TO authenticated;
GRANT ALL ON TABLE public.negocio_workflow_config TO service_role;

ALTER TABLE public.negocio_workflow_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY negocio_workflow_config_select
  ON public.negocio_workflow_config
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (SELECT public.has_anew_permission((SELECT auth.uid()), 'pessoas.view'))
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (
      SELECT 1
      FROM unnest((SELECT public.crm_scope_keys('pessoas.view'))) AS k(scope_key)
      WHERE starts_with(k.scope_key, negocio_workflow_config.organization_id::text || ':')
    )
  );

CREATE POLICY negocio_workflow_config_no_insert
  ON public.negocio_workflow_config
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY negocio_workflow_config_no_update
  ON public.negocio_workflow_config
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY negocio_workflow_config_no_delete
  ON public.negocio_workflow_config
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (false);

CREATE POLICY system_admin_pii_default_deny
  ON public.negocio_workflow_config
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    (NOT public.is_system_admin((SELECT auth.uid())))
    OR (organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid()))))
    OR (public.is_system_admin((SELECT auth.uid())) AND public.has_active_support_access(organization_id))
  )
  WITH CHECK (
    (NOT public.is_system_admin((SELECT auth.uid())))
    OR (organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid()))))
  );

COMMENT ON TABLE public.negocio_workflow_config IS
  'Regras da página Pessoas por organização. Sem linha: página Pessoas fechada para escrita (as funções neg_* recusam com NG008). Escrita só por migration/service_role nesta fase.';
COMMENT ON COLUMN public.negocio_workflow_config.momento_ganho IS
  'manual: ganho à mão; proposta_aceite / contrato_assinado: o ganho exige uma proposta aceite / contrato assinado ligado ao negócio.';

-- Linha da nike (só a nike).
INSERT INTO public.negocio_workflow_config (organization_id, momento_ganho)
SELECT o.id, 'contrato_assinado'
FROM public.anew_organizations o
WHERE o.id = 'b6ffce4f-f630-4933-833a-008649757a33'::uuid;

-- CONFERIR (md5 lidos no remoto a 19/10)
DO $$
DECLARE
  v_txt text;
BEGIN
  -- 1. uma só linha, a da nike, em contrato_assinado
  v_txt := (SELECT string_agg(c.organization_id::text || ':' || c.momento_ganho, ',')
            FROM public.negocio_workflow_config c);
  IF v_txt IS DISTINCT FROM 'b6ffce4f-f630-4933-833a-008649757a33:contrato_assinado' THEN
    RAISE EXCEPTION 'CONFERIR (1. linhas): obtido %', coalesce(v_txt, '(nulo)');
  END IF;

  -- 2. RLS ligada e políticas exactas
  IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.negocio_workflow_config'::regclass) THEN
    RAISE EXCEPTION 'CONFERIR (2. RLS desligada)';
  END IF;
  v_txt := (SELECT string_agg(p.policyname::text || ':' || p.permissive::text || ':' || p.cmd::text, ',' ORDER BY p.policyname::text COLLATE "C")
            FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = 'negocio_workflow_config');
  IF v_txt IS DISTINCT FROM 'negocio_workflow_config_no_delete:RESTRICTIVE:DELETE,negocio_workflow_config_no_insert:RESTRICTIVE:INSERT,negocio_workflow_config_no_update:RESTRICTIVE:UPDATE,negocio_workflow_config_select:PERMISSIVE:SELECT,system_admin_pii_default_deny:RESTRICTIVE:ALL' THEN
    RAISE EXCEPTION 'CONFERIR (2. políticas): obtido %', coalesce(v_txt, '(nulo)');
  END IF;

  -- 3. privilégios: anon nada; authenticated só SELECT
  IF has_table_privilege('anon', 'public.negocio_workflow_config', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR has_table_privilege('authenticated', 'public.negocio_workflow_config', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR NOT has_table_privilege('authenticated', 'public.negocio_workflow_config', 'SELECT')
     OR has_function_privilege('anon', 'public.fn_negocio_workflow_config_preparar()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_negocio_workflow_config_preparar()', 'EXECUTE') THEN
    RAISE EXCEPTION 'CONFERIR (3. privilégios inesperados)';
  END IF;

  -- 4. triggers da tabela nova
  v_txt := (SELECT string_agg(t.tgname::text || ':' || p.proname::text, ',' ORDER BY t.tgname::text COLLATE "C")
            FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
            WHERE t.tgrelid = 'public.negocio_workflow_config'::regclass AND NOT t.tgisinternal);
  IF v_txt IS DISTINCT FROM 'trg_00_negocio_workflow_config_preparar:fn_negocio_workflow_config_preparar,trg_audit_negocio_workflow_config:fn_generic_entity_audit,trg_negocio_workflow_config_updated_at:update_updated_at_column' THEN
    RAISE EXCEPTION 'CONFERIR (4. triggers): obtido %', coalesce(v_txt, '(nulo)');
  END IF;

  -- 5. nenhum trigger novo em anew_organizations
  v_txt := (SELECT count(*) FROM pg_trigger t WHERE t.tgrelid = 'public.anew_organizations'::regclass AND NOT t.tgisinternal)::text;
  IF v_txt IS DISTINCT FROM '3' THEN
    RAISE EXCEPTION 'CONFERIR (5. triggers de anew_organizations): obtido %, esperado 3', v_txt;
  END IF;

  -- 6. funções existentes reutilizadas iguais
  v_txt := (SELECT string_agg(e.sig, ',')
            FROM (VALUES
              ('public.update_updated_at_column()',         'fc99e666cd1ddb90d5c5e86357e5d57e'),
              ('public.fn_generic_entity_audit()',          'd8b3750adf5d09c51a6a78b4b18b305b'),
              ('public.fn_negocios_actor()',                '26296535afef27c393ab0c932995e3cb'),
              ('public.fn_negocios_ref_utilizador_apagado(uuid,uuid)', '6e45bfff81ab95e812b44d126cc3d75a'),
              ('public.crm_scope_keys(text)',              '6abb12e1d7a3db943630e8f8d7e15ca8'),
              ('public.has_anew_permission(uuid,text)',     '8f69ed134c7d20e080d8c5a4161a3151'),
              ('public.get_user_crm_org_ids(uuid)',         '29782031244dd3b0842ca43b271e2bf1'),
              ('public.is_system_admin(uuid)',              '159035010036f0045b091808cf9f77ef'),
              ('public.has_active_support_access(uuid)',    '6d8f902ee9fc7a59e4397412b2c121a0')
            ) AS e(sig, h)
            WHERE to_regprocedure(e.sig) IS NULL
               OR md5(pg_get_functiondef(to_regprocedure(e.sig))) <> e.h);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR (6. funções reutilizadas mudaram): %', v_txt;
  END IF;
END;
$$;

COMMIT;
