-- ============================================================
-- 20270108120000_admin_smtp_alertas_auditoria_desce
-- ============================================================
-- Auditoria de permissões 05/11/2026, grupo D: R1 (P1.1) no SMTP, alertas e auditoria de exportações; P2 smtp.view/smtp.edit.
-- R1: as escritas de SMTP (rpc_upsert_org_smtp_settings e UPDATE/DELETE/INSERT diretos) e de alert_settings pediam
--   settings.update em QUALQUER organização + organização visível: o administrador de uma filha (ou de uma organização sem
--   ligação) trocava o SMTP por omissão da mãe por um servidor seu (desvio de correio) e mexia nos alertas dela. A auditoria de
--   exportações lia-se com exports.audit.view de qualquer organização.
--   Agora: a permissão na organização da linha ou acima (has_anew_permission_in_org_or_ancestor).
-- P2: o ecrã de SMTP pede smtp.view (ver) e smtp.edit (criar/editar/apagar) mas o servidor só aceitava settings.update. Agora:
--   - ler: settings.update (como antes, inalterado) OU smtp.view/smtp.edit nesta organização ou acima;
--   - escrever (RPC, INSERT, UPDATE, DELETE): settings.update OU smtp.edit nesta organização ou acima.
-- A leitura do SMTP com settings.update fica como estava (organização visível); só as escritas descem.
-- CREATE OR REPLACE a partir do texto vivo (guarda md5); políticas a partir de pg_policies vivas (texto anterior nos comentários).
-- Reversão (só como migration nova): repor rpc_upsert_org_smtp_settings com o texto de 5/11/2026 e as políticas anteriores.
-- ============================================================
SET lock_timeout = '5s';

DO $g$
BEGIN
  IF md5(pg_get_functiondef('public.rpc_upsert_org_smtp_settings(uuid,uuid,text,text,integer,text,text,boolean,text,text,text,integer,boolean)'::regprocedure)) <> 'faeb56d76be85e561b1e224a85910b9e' THEN
    RAISE EXCEPTION 'GUARDA: uma das funções mudou desde a leitura (5/11/2026)';
  END IF;
END $g$;

CREATE OR REPLACE FUNCTION public.rpc_upsert_org_smtp_settings(p_id uuid, p_organization_id uuid, p_name text, p_smtp_host text, p_smtp_port integer, p_smtp_username text, p_smtp_password text, p_smtp_secure boolean, p_encryption text, p_from_email text, p_from_name text, p_daily_limit integer, p_is_default boolean)
 RETURNS organization_smtp_settings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid;
  v_row public.organization_smtp_settings;
  v_secret_id uuid;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL
     OR NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid())))
     -- 20270108120000: settings.update ou smtp.edit NESTA organização ou acima (antes: settings.update em qualquer uma).
     OR NOT (public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'settings.update', p_organization_id)
             OR public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'smtp.edit', p_organization_id)) THEN
    RAISE EXCEPTION 'Sem permissão para gerir SMTP desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_id IS NULL THEN
    IF p_smtp_password IS NULL OR p_smtp_password = '' THEN
      RAISE EXCEPTION 'Password é obrigatória para criar uma configuração SMTP' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    v_secret_id := vault.create_secret(p_smtp_password, 'org_smtp:new:' || gen_random_uuid()::text);

    INSERT INTO public.organization_smtp_settings
      (organization_id, name, smtp_host, smtp_port, smtp_username, smtp_password_secret_id,
       smtp_secure, encryption, from_email, from_name, daily_limit, is_default, created_by)
    VALUES
      (p_organization_id, p_name, p_smtp_host, p_smtp_port, p_smtp_username, v_secret_id,
       p_smtp_secure, p_encryption, p_from_email, p_from_name, p_daily_limit, p_is_default, v_actor)
    RETURNING * INTO v_row;
  ELSE
    SELECT * INTO v_row
    FROM public.organization_smtp_settings
    WHERE id = p_id AND organization_id = p_organization_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Configuração SMTP não encontrada nesta organização' USING ERRCODE = 'no_data_found';
    END IF;

    -- Trocar a password: CRIAR um segredo novo, nunca actualizar o antigo no
    -- lugar -- vault.update_secret confirmou-se avariado (ver cabecalho).
    -- O segredo antigo fica orfao, sem se apagar (nao existe
    -- vault.delete_secret nesta instalacao, ver 20261207015100).
    IF p_smtp_password IS NOT NULL AND p_smtp_password <> '' THEN
      v_secret_id := vault.create_secret(p_smtp_password, 'org_smtp:' || v_row.id::text || ':' || extract(epoch FROM now())::bigint::text);
    ELSE
      v_secret_id := v_row.smtp_password_secret_id;
    END IF;

    UPDATE public.organization_smtp_settings SET
      name = p_name,
      smtp_host = p_smtp_host,
      smtp_port = p_smtp_port,
      smtp_username = p_smtp_username,
      smtp_password_secret_id = v_secret_id,
      smtp_secure = p_smtp_secure,
      encryption = p_encryption,
      from_email = p_from_email,
      from_name = p_from_name,
      daily_limit = p_daily_limit,
      is_default = p_is_default,
      updated_at = now()
    WHERE id = p_id
    RETURNING * INTO v_row;
  END IF;

  IF p_is_default THEN
    UPDATE public.organization_smtp_settings
    SET is_default = false
    WHERE organization_id = p_organization_id AND id <> v_row.id;
  END IF;

  RETURN v_row;
END;
$function$;

-- ── organization_smtp_settings ────────────────────────────────────────────────────────────────────────────────────────────
-- Antes: org_smtp_select/update/delete (TO public): organization_id IN visíveis AND has_anew_permission(auth.uid(), 'settings.update').
--        org_smtp_insert (TO authenticated): organization_id IN visíveis AND fn_tem_alguma_permissao(ARRAY['settings.update','smtp.edit']).
DROP POLICY IF EXISTS org_smtp_select ON public.organization_smtp_settings;
CREATE POLICY org_smtp_select ON public.organization_smtp_settings FOR SELECT TO public
  USING ((organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid())))
         AND (public.has_anew_permission(auth.uid(), 'settings.update')
              OR public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'smtp.view', organization_id)
              OR public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'smtp.edit', organization_id)));
DROP POLICY IF EXISTS org_smtp_insert ON public.organization_smtp_settings;
CREATE POLICY org_smtp_insert ON public.organization_smtp_settings FOR INSERT TO authenticated
  WITH CHECK ((organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid())))
              AND (public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'settings.update', organization_id)
                   OR public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'smtp.edit', organization_id)));
DROP POLICY IF EXISTS org_smtp_update ON public.organization_smtp_settings;
CREATE POLICY org_smtp_update ON public.organization_smtp_settings FOR UPDATE TO public
  USING ((organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid())))
         AND (public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'settings.update', organization_id)
              OR public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'smtp.edit', organization_id)));
DROP POLICY IF EXISTS org_smtp_delete ON public.organization_smtp_settings;
CREATE POLICY org_smtp_delete ON public.organization_smtp_settings FOR DELETE TO public
  USING ((organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid())))
         AND (public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'settings.update', organization_id)
              OR public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'smtp.edit', organization_id)));

-- ── alert_settings ────────────────────────────────────────────────────────────────────────────────────────────────────────
-- Antes (I/U/D, TO public): organization_id IN visíveis AND has_anew_permission(auth.uid(), 'settings.update'). A leitura não muda.
DROP POLICY IF EXISTS "Users can insert alert_settings for visible orgs" ON public.alert_settings;
CREATE POLICY "Users can insert alert_settings for visible orgs" ON public.alert_settings FOR INSERT TO public
  WITH CHECK ((organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid())))
              AND public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'settings.update', organization_id));
DROP POLICY IF EXISTS "Users can update alert_settings for visible orgs" ON public.alert_settings;
CREATE POLICY "Users can update alert_settings for visible orgs" ON public.alert_settings FOR UPDATE TO public
  USING ((organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid())))
         AND public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'settings.update', organization_id));
DROP POLICY IF EXISTS "Users can delete alert_settings for visible orgs" ON public.alert_settings;
CREATE POLICY "Users can delete alert_settings for visible orgs" ON public.alert_settings FOR DELETE TO public
  USING ((organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid())))
         AND public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'settings.update', organization_id));

-- ── data_export_audit ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- Antes: has_anew_permission(auth.uid(), 'exports.audit.view') AND organization_id IN visíveis.
DROP POLICY IF EXISTS data_export_audit_select_authorized ON public.data_export_audit;
CREATE POLICY data_export_audit_select_authorized ON public.data_export_audit FOR SELECT TO authenticated
  USING ((organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid()))))
         AND public.has_anew_permission_in_org_or_ancestor((SELECT auth.uid()), 'exports.audit.view', organization_id));
