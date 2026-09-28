-- ============================================================
-- 20261201080000_permissao_eliminar_propostas_enviadas
-- ============================================================
-- Recuperada da base de dados: esta migration foi aplicada ao projeto
-- remoto sem ficheiro correspondente no repositorio. O SQL abaixo foi
-- extraido de supabase_migrations.schema_migrations.statements, para o
-- historico local voltar a refletir o estado real da base de dados.
-- Ja aplicada e registada no remoto — nao volta a correr num db push.
-- ============================================================

-- ============================================================
-- Eliminar uma proposta que já saiu de rascunho passa a exigir uma
-- permissão própria: proposals.delete_sent
-- ============================================================
-- Estado encontrado antes desta migração:
--
--   • _soft_delete_business_entity_impl (a função por trás do botão
--     "Eliminar", da eliminação em massa, e da revogação de portal
--     introduzida em 20261201070000) NUNCA verificava nenhum código de
--     permissão para nenhum p_kind — só a visibilidade da organização
--     (get_user_visible_org_ids). Quem via a organização podia apagar
--     qualquer proposta, rascunho ou não, chamando a RPC directamente.
--   • O ecrã (Proposals.tsx) só mostra "Eliminar" para rascunhos, atrás
--     de PermissionGate permission="proposals.delete" — é só uma guarda
--     de interface, não impede a chamada directa à RPC.
--   • Há um segundo caminho já em produção: a ferramenta cancel_proposal
--     do assistente de IA (ai-assistant/tools/proposals.ts) chama a mesma
--     RPC exigindo apenas 'proposals.edit', e só bloqueia quando
--     accepted_at está preenchido — deixa 'sent', 'rejected' e 'expired'
--     passar. É por este caminho, mais a eliminação em massa, que
--     propostas já enviadas foram apagadas sem nenhuma permissão de
--     eliminação específica ter sido verificada.
--
-- Fora do âmbito desta migração (não tratado aqui): quote/deal/contract
-- continuam sem nenhuma verificação de permissão nesta RPC, só de
-- visibilidade de organização — o pedido era especificamente sobre
-- propostas enviadas.
--
-- Correcção:
--   1. Nova permissão no catálogo: proposals.delete_sent (perigosa, com o
--      mesmo âmbito de proposals.delete — supports_scope=true, mesmo
--      padrão de client_contracts.cancel).
--   2. System Admin e Super Admin sincronizados com a nova permissão
--      (mesmo padrão de 20261130110000 — sem isso, os dois papéis de
--      bypass ficam em falta e o frontend, que não faz bypass por
--      desenho, esconde a acção mesmo a quem devia poder).
--   3. _soft_delete_business_entity_impl passa a exigir, só para
--      p_kind='proposal': 'proposals.delete' sempre; e, quando o estado
--      actual não é 'draft', também 'proposals.delete_sent'.
--
-- Prerequisites: 20261201070000_revogar_portal_ao_apagar_documento.sql
--                20261130110000_sync_admin_roles_missing_permissions.sql

-- ============================================================
-- 1. Catálogo: nova permissão
-- ============================================================

INSERT INTO public.anew_permissions (code, name, description, category, is_dangerous, scope, supports_scope, display_order)
VALUES (
  'proposals.delete_sent',
  'Eliminar propostas enviadas',
  'Permite eliminar propostas que já saíram de rascunho (enviadas, aceites, rejeitadas ou expiradas). Sem esta permissão, mesmo com "Eliminar propostas", só é possível eliminar rascunhos.',
  'proposals',
  true,
  'organization',
  true,
  1
)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 2. Sincronizar System Admin e Super Admin com a nova permissão
-- ============================================================

ALTER TABLE public.anew_role_permissions DISABLE TRIGGER USER;

INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
SELECT r.role_id, 'proposals.delete_sent', NULL::uuid
FROM (VALUES
  ('03a43423-9b3c-4640-9dbe-31687f829869'::uuid), -- System Admin
  ('e91ef94e-a5e6-415c-9985-0c2b7594720b'::uuid)  -- Super Admin
) AS r(role_id)
ON CONFLICT (role_id, permission_code) DO NOTHING;

ALTER TABLE public.anew_role_permissions ENABLE TRIGGER USER;

-- ============================================================
-- 3. _soft_delete_business_entity_impl — exigir a permissão
-- ============================================================

CREATE OR REPLACE FUNCTION public._soft_delete_business_entity_impl(p_kind text, p_id uuid, p_actor uuid, p_auth_uid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entity_id uuid; v_org_id uuid;
  v_target_org uuid;
  v_proposal_status text;
BEGIN
  IF p_kind NOT IN ('deal','quote','proposal','contract') THEN
    RAISE EXCEPTION 'Invalid kind: %', p_kind;
  END IF;

  IF p_kind = 'deal' THEN
    SELECT organization_id INTO v_target_org FROM public.deals WHERE id = p_id;
  ELSIF p_kind = 'quote' THEN
    SELECT organization_id INTO v_target_org FROM public.quotes WHERE id = p_id;
  ELSIF p_kind = 'proposal' THEN
    SELECT organization_id, status INTO v_target_org, v_proposal_status FROM public.proposals WHERE id = p_id;
  ELSE
    SELECT organization_id INTO v_target_org FROM public.client_contracts WHERE id = p_id;
  END IF;

  IF v_target_org IS NULL THEN
    RETURN FALSE;
  END IF;

  IF NOT (v_target_org IN (SELECT public.get_user_visible_org_ids(p_auth_uid))) THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Eliminar uma proposta exige 'proposals.delete'; eliminar uma que já
  -- saiu de rascunho exige adicionalmente 'proposals.delete_sent'. Fecha
  -- o caminho da RPC directa, da eliminação em massa e da ferramenta
  -- cancel_proposal do assistente de IA (que só verificava
  -- 'proposals.edit').
  IF p_kind = 'proposal' THEN
    IF NOT public.has_anew_permission(p_auth_uid, 'proposals.delete') THEN
      RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_proposal_status IS DISTINCT FROM 'draft'
       AND NOT public.has_anew_permission(p_auth_uid, 'proposals.delete_sent') THEN
      RAISE EXCEPTION 'Sem permissao para eliminar propostas ja enviadas' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF p_kind = 'deal' THEN
    UPDATE public.deals SET deleted_at=now(), deleted_by=p_actor
      WHERE id=p_id AND deleted_at IS NULL
      RETURNING entity_id, organization_id INTO v_entity_id, v_org_id;
  ELSIF p_kind = 'quote' THEN
    UPDATE public.quotes SET deleted_at=now(), deleted_by=p_actor
      WHERE id=p_id AND deleted_at IS NULL
      RETURNING entity_id, organization_id INTO v_entity_id, v_org_id;
  ELSIF p_kind = 'proposal' THEN
    UPDATE public.proposals SET deleted_at=now(), deleted_by=p_actor, is_deleted=true
      WHERE id=p_id AND deleted_at IS NULL
      RETURNING entity_id, organization_id INTO v_entity_id, v_org_id;
  ELSE
    UPDATE public.client_contracts SET deleted_at=now(), deleted_by=p_actor
      WHERE id=p_id AND deleted_at IS NULL
      RETURNING entity_id, organization_id INTO v_entity_id, v_org_id;
  END IF;

  IF v_entity_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.anew_entity_history(entity_id, change_type, field_name, old_value, new_value, changed_by, metadata)
      VALUES (v_entity_id, 'deleted', p_kind, NULL, p_id::text, p_actor,
              jsonb_build_object('kind', p_kind, 'id', p_id, 'organization_id', v_org_id));
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- Retirar do portal do cliente na mesma transação (20261201070000).
    -- 'deal' não tem portal_document_type e fica de fora deste bloco.
    IF p_kind IN ('quote', 'proposal', 'contract') THEN
      UPDATE public.client_portal_documents
      SET is_visible = false,
          revoked_at = now(),
          revoked_by = p_actor
      WHERE document_type = p_kind::public.portal_document_type
        AND document_id = p_id
        AND is_visible = true;
    END IF;
  END IF;
  RETURN TRUE;
END;
$function$;

-- ============================================================
-- CONFERIR
-- ============================================================
DO $$
DECLARE
  v_missing_admins int;
  v_trigger_status text;
BEGIN
  SELECT count(*) INTO v_missing_admins
  FROM (VALUES
    ('03a43423-9b3c-4640-9dbe-31687f829869'::uuid),
    ('e91ef94e-a5e6-415c-9985-0c2b7594720b'::uuid)
  ) AS r(role_id)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.anew_role_permissions rp
    WHERE rp.role_id = r.role_id AND rp.permission_code = 'proposals.delete_sent'
  );
  IF v_missing_admins > 0 THEN
    RAISE EXCEPTION 'CONFERIR: % papel(eis) de sistema continuam sem proposals.delete_sent', v_missing_admins;
  END IF;

  SELECT tgenabled INTO v_trigger_status FROM pg_trigger
  WHERE tgrelid = 'public.anew_role_permissions'::regclass AND tgname = 'trg_protect_system_role_perms';
  IF v_trigger_status IS DISTINCT FROM 'O' THEN
    RAISE EXCEPTION 'CONFERIR: trg_protect_system_role_perms nao ficou ativo (tgenabled=%)', v_trigger_status;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'proposals.delete_sent') THEN
    RAISE EXCEPTION 'CONFERIR: proposals.delete_sent nao ficou no catalogo';
  END IF;
END;
$$;
