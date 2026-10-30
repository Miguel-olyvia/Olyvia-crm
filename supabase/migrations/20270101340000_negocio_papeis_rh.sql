-- 20270101340000 (30/10/2026): os papéis do Negócio vêm do RH.
--
-- No protótipo V1 cada passo do negócio é de um papel (Comercial, Direção, Financeiro, Compras e armazém, Gestor de obra, Jurídico,
-- Técnico). Na Olyvia o papel escolhia-se à mão ("A ver como") e a base só deixava o super_admin faturar e validar pagamentos. Agora:
--  1. pessoas_papeis_negocio: os papéis de cada pessoa do RH (escolhem-se na ficha, cartão "Papéis no Negócio"). O Técnico não se
--     escolhe: é quem tem cargo técnico de obra (fn_rh_pessoa_tecnica, 20261231998000).
--  2. neg_papeis_permissoes: o que cada papel pode fazer nas funções do Negócio, da Obra e do Catálogo (as que verificam pelo
--     fn_cat_exigir) e na aprovação das encomendas a fornecedor (fn_po_crm_load):
--       · todos: ler os negócios, a obra e o Catálogo (pessoas.view, services.view);
--       · todos menos o Técnico: gravar o negócio (pessoas.edit);
--       · Gestor de obra, Técnico e Direção: gravar a obra (negocios.obra);
--       · Financeiro: registar a fatura e validar o pagamento (negocios.registar_fatura, negocios.validar_pagamento);
--       · Compras e armazém: aprovar a encomenda a fornecedor e enviá-la (purchase_orders.approve).
--     As permissões dos perfis da Olyvia continuam a valer como antes: o papel do RH soma-se a elas.
--  3. fn_neg_papeis / neg_meus_papeis: os papéis de quem entrou (pela conta ligada à pessoa, pessoas_contas).
--  4. fn_cat_exigir e fn_po_crm_load passam a aceitar o papel; obra_guardar_negocio pede pessoas.edit OU negocios.obra (o técnico grava
--     o que faz na obra sem poder gravar o negócio).
--  5. rh_ler_papeis_pessoa / rh_guardar_papeis_pessoa: o cartão do RH (hr.pessoas.laborais.view / .edit).
--
-- Três funções partem do texto vivo. A migration pára se alguma tiver mudado entretanto (md5 do texto), no padrão da 20261231998000.
-- Erros: CT001 sem permissão; CT002 dados inválidos; CT003 não encontrado nesta organização.

SET lock_timeout = '5s';

DO $do$
DECLARE v text; r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.fn_cat_exigir(uuid,text)', '98ee70b0095aed371e0a1095ddfb0e2e'),
    ('public.fn_po_crm_load(uuid,text,boolean)', '473fbb0e0bf83766000310136f7c19c8'),
    ('public.obra_guardar_negocio(uuid,uuid,jsonb)', '5fdff3578c4837dcf8aaaf8ffcedf424')
  ) AS t(assinatura, md5) LOOP
    v := pg_get_functiondef(r.assinatura::regprocedure);
    IF position('20270101340000' IN v) = 0 AND md5(v) <> r.md5 THEN
      RAISE EXCEPTION 'A função % mudou: rever a migration 20270101340000 contra o texto vivo.', r.assinatura;
    END IF;
  END LOOP;
END $do$;

-- ------------------------------------------------------------------ 1. os papéis de cada pessoa
CREATE TABLE IF NOT EXISTS public.pessoas_papeis_negocio (
  organization_id uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  pessoa_id uuid NOT NULL REFERENCES public.pessoas(id) ON DELETE CASCADE,
  papel text NOT NULL CHECK (papel IN ('comercial', 'direcao', 'financeiro', 'armazem', 'operacoes', 'juridico')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.anew_users(id) ON DELETE SET NULL,
  CONSTRAINT pessoas_papeis_negocio_pkey PRIMARY KEY (pessoa_id, papel)
);
CREATE INDEX IF NOT EXISTS pessoas_papeis_negocio_org_idx ON public.pessoas_papeis_negocio (organization_id, papel);
COMMENT ON TABLE public.pessoas_papeis_negocio IS 'Os papéis da pessoa no Negócio (os passos do protótipo V1). O Técnico não está aqui: é quem tem cargo técnico de obra. Grava-se só por rh_guardar_papeis_pessoa.';

ALTER TABLE public.pessoas_papeis_negocio ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pessoas_papeis_negocio_ler ON public.pessoas_papeis_negocio;
CREATE POLICY pessoas_papeis_negocio_ler ON public.pessoas_papeis_negocio FOR SELECT TO authenticated
  USING ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.laborais.view', organization_id)));
REVOKE ALL ON public.pessoas_papeis_negocio FROM anon, authenticated;
GRANT SELECT ON public.pessoas_papeis_negocio TO authenticated;
GRANT ALL ON public.pessoas_papeis_negocio TO service_role;

-- a pessoa tem de ser da mesma organização
CREATE OR REPLACE FUNCTION public.fn_pessoas_papeis_negocio_org() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pessoas p WHERE p.id = NEW.pessoa_id AND p.organization_id = NEW.organization_id) THEN
    RAISE EXCEPTION 'A pessoa não é desta organização.' USING ERRCODE = 'CT002';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_pessoas_papeis_negocio_org ON public.pessoas_papeis_negocio;
CREATE TRIGGER trg_pessoas_papeis_negocio_org BEFORE INSERT OR UPDATE ON public.pessoas_papeis_negocio
  FOR EACH ROW EXECUTE FUNCTION public.fn_pessoas_papeis_negocio_org();

-- ------------------------------------------------------------------ 2. o que cada papel pode fazer
CREATE TABLE IF NOT EXISTS public.neg_papeis_permissoes (
  papel text NOT NULL CHECK (papel IN ('comercial', 'direcao', 'financeiro', 'armazem', 'operacoes', 'juridico', 'tecnico')),
  permission_code text NOT NULL,
  CONSTRAINT neg_papeis_permissoes_pkey PRIMARY KEY (papel, permission_code)
);
COMMENT ON TABLE public.neg_papeis_permissoes IS 'As permissões que um papel do Negócio (do RH) dá nas funções do Negócio, da Obra e do Catálogo (fn_cat_exigir) e na aprovação das encomendas a fornecedor (fn_po_crm_load). Somam-se às dos perfis da Olyvia.';
ALTER TABLE public.neg_papeis_permissoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS neg_papeis_permissoes_ler ON public.neg_papeis_permissoes;
CREATE POLICY neg_papeis_permissoes_ler ON public.neg_papeis_permissoes FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.neg_papeis_permissoes FROM anon, authenticated;
GRANT SELECT ON public.neg_papeis_permissoes TO authenticated;
GRANT ALL ON public.neg_papeis_permissoes TO service_role;

INSERT INTO public.neg_papeis_permissoes (papel, permission_code)
SELECT p, c FROM unnest(ARRAY['comercial', 'direcao', 'financeiro', 'armazem', 'operacoes', 'juridico', 'tecnico']) p,
                 unnest(ARRAY['pessoas.view', 'services.view']) c
UNION ALL SELECT p, 'pessoas.edit' FROM unnest(ARRAY['comercial', 'direcao', 'financeiro', 'armazem', 'operacoes', 'juridico']) p
UNION ALL SELECT p, 'negocios.obra' FROM unnest(ARRAY['operacoes', 'tecnico', 'direcao']) p
UNION ALL VALUES ('financeiro', 'negocios.registar_fatura'), ('financeiro', 'negocios.validar_pagamento'), ('armazem', 'purchase_orders.approve')
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------------ 3. os papéis de quem entrou
CREATE OR REPLACE FUNCTION public.fn_neg_pessoa_da_conta(p_org uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pc.pessoa_id FROM pessoas_contas pc
  JOIN anew_users u ON u.id = pc.anew_user_id
  JOIN pessoas p ON p.id = pc.pessoa_id AND p.deleted_at IS NULL AND (p.data_saida IS NULL OR p.data_saida >= current_date)
  WHERE u.auth_user_id = auth.uid() AND pc.organization_id = p_org AND pc.estado = 'activa' AND pc.revogada_em IS NULL
  ORDER BY pc.ligada_em DESC NULLS LAST LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.fn_neg_pessoa_da_conta(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_neg_pessoa_da_conta(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_neg_papeis(p_org uuid) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH eu AS (SELECT public.fn_neg_pessoa_da_conta(p_org) AS pessoa)
  SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}') FROM (
    SELECT pp.papel AS x FROM eu JOIN pessoas_papeis_negocio pp ON pp.pessoa_id = eu.pessoa AND pp.organization_id = p_org
    UNION
    SELECT 'tecnico' FROM eu WHERE eu.pessoa IS NOT NULL AND public.fn_rh_pessoa_tecnica(p_org, eu.pessoa)
  ) s
$$;
REVOKE ALL ON FUNCTION public.fn_neg_papeis(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_neg_papeis(uuid) TO authenticated, service_role;

/** O papel do RH de quem entrou dá esta permissão nesta organização? */
CREATE OR REPLACE FUNCTION public.fn_neg_papel_permite(p_org uuid, p_perm text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_org IS NOT NULL AND EXISTS (SELECT 1 FROM neg_papeis_permissoes m WHERE m.permission_code = p_perm AND m.papel = ANY (public.fn_neg_papeis(p_org)))
$$;
REVOKE ALL ON FUNCTION public.fn_neg_papel_permite(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_neg_papel_permite(uuid, text) TO authenticated, service_role;

-- o ecrã: os papéis, a pessoa do RH e se vê todos os papéis (admin do sistema ou pessoas.edit pelo perfil da Olyvia)
CREATE OR REPLACE FUNCTION public.neg_meus_papeis(p_org uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pessoa uuid; v_nome text;
BEGIN
  IF p_org IS NULL OR NOT (public.is_system_admin_user(auth.uid()) OR p_org IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Sem acesso a esta organização.' USING ERRCODE = 'CT001';
  END IF;
  v_pessoa := public.fn_neg_pessoa_da_conta(p_org);
  SELECT nome_completo INTO v_nome FROM pessoas WHERE id = v_pessoa;
  RETURN jsonb_build_object(
    'papeis', to_jsonb(public.fn_neg_papeis(p_org)),
    'pessoa', CASE WHEN v_pessoa IS NULL THEN NULL ELSE jsonb_build_object('id', v_pessoa, 'nome', v_nome) END,
    'todos', public.is_system_admin_user(auth.uid()) OR public.has_anew_permission_in_org(auth.uid(), 'pessoas.edit', p_org)
  );
END $$;
REVOKE ALL ON FUNCTION public.neg_meus_papeis(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.neg_meus_papeis(uuid) TO authenticated, service_role;

-- ------------------------------------------------------------------ 4. as verificações passam a aceitar o papel
CREATE OR REPLACE FUNCTION public.fn_cat_pode(p_org uuid, p_perm text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_org IS NOT NULL AND (public.is_system_admin_user(auth.uid()) OR public.has_anew_permission_in_org(auth.uid(), p_perm, p_org)
    OR public.fn_neg_papel_permite(p_org, p_perm))
$$;
REVOKE ALL ON FUNCTION public.fn_cat_pode(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cat_pode(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_cat_exigir(p_org uuid, p_perm text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user uuid := public.current_business_user_id();
BEGIN
  -- 20270101340000: o papel do RH (neg_papeis_permissoes) também dá a permissão
  IF NOT public.fn_cat_pode(p_org, p_perm) THEN
    RAISE EXCEPTION 'Sem permissão (%).', p_perm USING ERRCODE = 'CT001';
  END IF;
  RETURN v_user;
END $function$;

/** Basta uma das permissões. */
CREATE OR REPLACE FUNCTION public.fn_cat_exigir_uma(p_org uuid, p_perms text[]) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM unnest(p_perms) k WHERE public.fn_cat_pode(p_org, k)) THEN
    RAISE EXCEPTION 'Sem permissão (%).', array_to_string(p_perms, ' ou ') USING ERRCODE = 'CT001';
  END IF;
  RETURN public.current_business_user_id();
END $$;
REVOKE ALL ON FUNCTION public.fn_cat_exigir_uma(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cat_exigir_uma(uuid, text[]) TO authenticated, service_role;

DO $do$
DECLARE v text; n text;
BEGIN
  -- a obra: o técnico e o gestor de obra gravam-na sem poder gravar o negócio
  v := pg_get_functiondef('public.obra_guardar_negocio(uuid,uuid,jsonb)'::regprocedure);
  IF position('20270101340000' IN v) = 0 THEN
    n := replace(v, $q$public.fn_cat_exigir(p_org, 'pessoas.edit');$q$,
                    $q$public.fn_cat_exigir_uma(p_org, ARRAY['pessoas.edit', 'negocios.obra']); -- 20270101340000: ou o papel da obra$q$);
    IF n = v THEN RAISE EXCEPTION 'obra_guardar_negocio: a verificação da permissão não está onde se esperava.'; END IF;
    EXECUTE n;
  END IF;

  -- a encomenda a fornecedor: o papel Compras e armazém aprova-a (só nesta organização)
  v := pg_get_functiondef('public.fn_po_crm_load(uuid,text,boolean)'::regprocedure);
  IF position('20270101340000' IN v) = 0 THEN
    n := replace(v, $q$IF NOT public.has_anew_permission(v_uid, p_permission) THEN$q$,
                    $q$IF NOT (public.has_anew_permission(v_uid, p_permission) OR public.fn_neg_papel_permite(v_po.organization_id, p_permission)) THEN -- 20270101340000$q$);
    IF n = v THEN RAISE EXCEPTION 'fn_po_crm_load: a verificação da permissão não está onde se esperava.'; END IF;
    EXECUTE n;
  END IF;
END $do$;

-- ------------------------------------------------------------------ 5. o cartão do RH
CREATE OR REPLACE FUNCTION public.rh_ler_papeis_pessoa(p_org uuid, p_pessoa uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.fn_cat_exigir(p_org, 'hr.pessoas.laborais.view');
  IF NOT EXISTS (SELECT 1 FROM pessoas WHERE id = p_pessoa AND organization_id = p_org AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Pessoa não encontrada nesta organização.' USING ERRCODE = 'CT003';
  END IF;
  RETURN jsonb_build_object(
    'papeis', coalesce((SELECT jsonb_agg(papel ORDER BY papel) FROM pessoas_papeis_negocio WHERE pessoa_id = p_pessoa AND organization_id = p_org), '[]'),
    'tecnica', public.fn_rh_pessoa_tecnica(p_org, p_pessoa),
    'conta', EXISTS (SELECT 1 FROM pessoas_contas WHERE pessoa_id = p_pessoa AND organization_id = p_org AND estado = 'activa' AND revogada_em IS NULL)
  );
END $$;
REVOKE ALL ON FUNCTION public.rh_ler_papeis_pessoa(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rh_ler_papeis_pessoa(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rh_guardar_papeis_pessoa(p_org uuid, p_pessoa uuid, p_papeis text[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid; v_papeis text[] := coalesce(p_papeis, '{}');
BEGIN
  v_user := public.fn_cat_exigir(p_org, 'hr.pessoas.laborais.edit');
  IF NOT EXISTS (SELECT 1 FROM pessoas WHERE id = p_pessoa AND organization_id = p_org AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Pessoa não encontrada nesta organização.' USING ERRCODE = 'CT003';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_papeis) k WHERE k NOT IN ('comercial', 'direcao', 'financeiro', 'armazem', 'operacoes', 'juridico')) THEN
    RAISE EXCEPTION 'Papel inválido.' USING ERRCODE = 'CT002';
  END IF;
  DELETE FROM pessoas_papeis_negocio WHERE pessoa_id = p_pessoa AND organization_id = p_org AND NOT (papel = ANY (v_papeis));
  INSERT INTO pessoas_papeis_negocio (organization_id, pessoa_id, papel, created_by)
    SELECT DISTINCT p_org, p_pessoa, k, v_user FROM unnest(v_papeis) k
  ON CONFLICT (pessoa_id, papel) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.rh_guardar_papeis_pessoa(uuid, uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rh_guardar_papeis_pessoa(uuid, uuid, text[]) TO authenticated, service_role;

-- verificação final
DO $do$
BEGIN
  IF position('20270101340000' IN pg_get_functiondef('public.obra_guardar_negocio(uuid,uuid,jsonb)'::regprocedure)) = 0
     OR position('20270101340000' IN pg_get_functiondef('public.fn_po_crm_load(uuid,text,boolean)'::regprocedure)) = 0
     OR position('20270101340000' IN pg_get_functiondef('public.fn_cat_exigir(uuid,text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION '20270101340000: uma das funções não ficou redefinida.';
  END IF;
END $do$;
